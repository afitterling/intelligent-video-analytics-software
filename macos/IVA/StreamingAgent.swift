import AVFoundation
import Combine
import Foundation

/// Owns the gst-launch-1.0 subprocess that streams the configured camera to
/// the device's KVS stream. Handles credential refresh and restart on failure.
@MainActor
final class StreamingAgent: ObservableObject {
    @Published var isRunning = false
    @Published var lastError: String?

    private var process: Process?
    private var refreshTask: Task<Void, Never>?

    private let config: AgentConfig

    init(config: AgentConfig) {
        self.config = config
    }

    func start() async {
        guard !isRunning else { return }
        do {
            try await ensureFreshCredentials()
            try await launchGStreamer()
            isRunning = true
            startRefreshLoop()
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            stop()
        }
    }

    func stop() {
        refreshTask?.cancel()
        refreshTask = nil
        if let p = process, p.isRunning { p.terminate() }
        process = nil
        isRunning = false
    }

    private func ensureFreshCredentials() async throws {
        let resp = try await Backend.refresh(apiUrl: config.apiUrl, refreshToken: config.refreshToken)
        try writeCredsFile(resp.credentials, expiration: resp.credentials.expiration)
        // dataEndpoint may rotate; kvssink takes it via env or pipeline arg.
    }

    private func startRefreshLoop() {
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30 * 60 * 1_000_000_000) // 30 min
                if Task.isCancelled { return }
                do {
                    try await self?.ensureFreshCredentials()
                } catch {
                    await MainActor.run { self?.lastError = "creds refresh failed: \(error.localizedDescription)" }
                }
            }
        }
    }

    private func writeCredsFile(_ creds: ExchangeResponse.Credentials, expiration: String?) throws {
        // kvssink reads a "credentials file" with this exact shape (see KVS docs).
        let exp = expiration ?? ISO8601DateFormatter().string(from: Date().addingTimeInterval(3000))
        let body = """
        CREDENTIALS \(exp) \(creds.accessKeyId) \(creds.secretAccessKey) \(creds.sessionToken)
        """
        try body.data(using: .utf8)?.write(to: AgentConfig.credsPath, options: .atomic)
    }

    private func launchGStreamer() async throws {
        guard let gst = findExecutable("gst-launch-1.0") else {
            throw NSError(domain: "IVA", code: 1, userInfo: [NSLocalizedDescriptionKey:
                "gst-launch-1.0 not found in PATH. Install gstreamer via brew."])
        }
        guard let idx = CameraDiscovery.gstIndex(for: config.cameraUid) else {
            throw NSError(domain: "IVA", code: 2, userInfo: [NSLocalizedDescriptionKey:
                "selected camera \(config.cameraUid) is not currently connected"])
        }

        // Producer pipeline: AVFoundation source → H.264 → kvssink (RIFF/MKV
        // framing is handled inside kvssink).
        let pipeline = [
            "avfvideosrc", "device-index=\(idx)",
            "!", "videoconvert",
            "!", "video/x-raw,width=1280,height=720,framerate=15/1",
            "!", "x264enc", "tune=zerolatency", "key-int-max=45", "bitrate=2000",
            "!", "h264parse",
            "!", "video/x-h264,stream-format=avc,alignment=au,profile=baseline",
            "!", "kvssink",
            "stream-name=\(config.streamName)",
            "aws-region=\(config.region)",
            "credential-file-path=\(AgentConfig.credsPath.path)",
        ]

        let p = Process()
        p.executableURL = gst
        p.arguments = pipeline

        let logFh = FileHandle(forWritingAtPath: AgentConfig.logPath.path)
            ?? {
                FileManager.default.createFile(atPath: AgentConfig.logPath.path, contents: nil)
                return FileHandle(forWritingAtPath: AgentConfig.logPath.path)!
            }()
        try? logFh.seekToEnd()
        p.standardOutput = logFh
        p.standardError = logFh

        p.terminationHandler = { [weak self] proc in
            Task { @MainActor in
                guard let self else { return }
                self.isRunning = false
                self.process = nil
                if proc.terminationStatus != 0 {
                    self.lastError = "streamer exited \(proc.terminationStatus). See agent.log."
                }
            }
        }

        try p.run()
        process = p
    }

    private func findExecutable(_ name: String) -> URL? {
        // Common Homebrew locations + PATH.
        let candidates = [
            "/opt/homebrew/bin/\(name)",
            "/usr/local/bin/\(name)",
            "/usr/bin/\(name)",
        ]
        for c in candidates {
            if FileManager.default.isExecutableFile(atPath: c) { return URL(fileURLWithPath: c) }
        }
        if let path = ProcessInfo.processInfo.environment["PATH"] {
            for dir in path.split(separator: ":") {
                let p = "\(dir)/\(name)"
                if FileManager.default.isExecutableFile(atPath: p) { return URL(fileURLWithPath: p) }
            }
        }
        return nil
    }
}
