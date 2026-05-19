// Tiny headless executable that's intended for `launchctl`. It reads the same
// config the GUI writes, refreshes KVS creds, and spawns gst-launch-1.0.
//
// Build: `swift build -c release --product iva-agent`
// The IVA SwiftUI app remains the supported way to register and choose a
// camera — this binary just runs the pipeline.

import Foundation

@MainActor
func run() async -> Never {
    let supportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("IVA", isDirectory: true)
    let configURL = supportDir.appendingPathComponent("config.json")

    guard let data = try? Data(contentsOf: configURL),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: String] else {
        FileHandle.standardError.write(Data("iva-agent: no config at \(configURL.path)\n".utf8))
        exit(2)
    }

    // Per-device config wins; otherwise fall through to the operator-wide
    // settings.json (same lookup the GUI app uses) and finally the env var.
    let env = ProcessInfo.processInfo.environment
    let settings = loadSettings(in: supportDir)
    let apiUrl = json["apiUrl"]?.nonEmpty
        ?? settings["apiUrl"]?.nonEmpty
        ?? env["IVA_API_URL"]
        ?? ""
    let refreshToken = json["refreshToken"] ?? ""
    let streamName = json["streamName"] ?? ""
    let region = json["region"] ?? ""
    let cameraUid = json["cameraUid"] ?? ""

    if apiUrl.isEmpty || refreshToken.isEmpty || streamName.isEmpty || cameraUid.isEmpty {
        FileHandle.standardError.write(Data("iva-agent: incomplete config\n".utf8))
        exit(2)
    }

    let credsPath = supportDir.appendingPathComponent("credentials")
    while true {
        do {
            let resp = try await refreshCreds(apiUrl: apiUrl, refreshToken: refreshToken)
            try writeCredsFile(resp, to: credsPath)
            try await runOnce(streamName: streamName, region: region, credsPath: credsPath, cameraUid: cameraUid)
        } catch {
            FileHandle.standardError.write(Data("iva-agent error: \(error.localizedDescription)\n".utf8))
            try? await Task.sleep(nanoseconds: 5_000_000_000)
        }
    }
}

private extension String {
    /// Returns nil if the string is empty so we can chain `??` for defaults.
    var nonEmpty: String? { isEmpty ? nil : self }
}

func loadSettings(in supportDir: URL) -> [String: String] {
    let url = supportDir.appendingPathComponent("settings.json")
    guard let data = try? Data(contentsOf: url),
          let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
        return [:]
    }
    var out: [String: String] = [:]
    for (k, v) in obj { if let s = v as? String { out[k] = s } }
    return out
}

struct RefreshResp: Decodable {
    struct Creds: Decodable {
        let accessKeyId: String
        let secretAccessKey: String
        let sessionToken: String
        let expiration: String?
    }
    let region: String
    let credentials: Creds
}

func refreshCreds(apiUrl: String, refreshToken: String) async throws -> RefreshResp {
    var req = URLRequest(url: URL(string: apiUrl + "/agents/refresh")!)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    req.httpBody = try JSONSerialization.data(withJSONObject: ["refreshToken": refreshToken])
    let (data, _) = try await URLSession.shared.data(for: req)
    return try JSONDecoder().decode(RefreshResp.self, from: data)
}

func writeCredsFile(_ r: RefreshResp, to url: URL) throws {
    let exp = r.credentials.expiration ?? ISO8601DateFormatter().string(from: Date().addingTimeInterval(3000))
    let line = "CREDENTIALS \(exp) \(r.credentials.accessKeyId) \(r.credentials.secretAccessKey) \(r.credentials.sessionToken)\n"
    try line.write(to: url, atomically: true, encoding: .utf8)
}

func runOnce(streamName: String, region: String, credsPath: URL, cameraUid: String) async throws {
    // Look up the AVFoundation device index for the saved unique id.
    let idxStr = await MainActor.run { () -> String in
        // The agent process doesn't ship AVFoundation here; the GUI app saved
        // the index too in a sidecar file when registering.
        let supportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("IVA", isDirectory: true)
        return (try? String(contentsOf: supportDir.appendingPathComponent("camera-index"), encoding: .utf8)) ?? "0"
    }

    let pipeline: [String] = [
        "avfvideosrc", "device-index=\(idxStr.trimmingCharacters(in: .whitespacesAndNewlines))",
        "!", "videoconvert",
        "!", "video/x-raw,width=1280,height=720,framerate=15/1",
        "!", "x264enc", "tune=zerolatency", "key-int-max=45", "bitrate=2000",
        "!", "h264parse",
        "!", "video/x-h264,stream-format=avc,alignment=au,profile=baseline",
        "!", "kvssink",
        "stream-name=\(streamName)",
        "aws-region=\(region)",
        "credential-file-path=\(credsPath.path)",
    ]

    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/gst-launch-1.0")
    if !FileManager.default.isExecutableFile(atPath: p.executableURL!.path) {
        p.executableURL = URL(fileURLWithPath: "/usr/local/bin/gst-launch-1.0")
    }
    p.arguments = pipeline
    p.environment = gstEnvironment()
    try p.run()
    p.waitUntilExit()
}

func gstEnvironment() -> [String: String] {
    // launchd-spawned agents don't inherit a shell, so GST_PLUGIN_PATH must be
    // set explicitly for kvssink to be discoverable.
    var env = ProcessInfo.processInfo.environment
    let home = env["HOME"] ?? NSHomeDirectory()
    let extraPaths = [
        "\(home)/Library/GStreamer/1.0/plugins",
        "/opt/homebrew/lib/gstreamer-1.0",
        "/usr/local/lib/gstreamer-1.0",
    ].joined(separator: ":")
    if let existing = env["GST_PLUGIN_PATH"], !existing.isEmpty {
        env["GST_PLUGIN_PATH"] = "\(existing):\(extraPaths)"
    } else {
        env["GST_PLUGIN_PATH"] = extraPaths
    }
    let pathExtras = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
    if let existing = env["PATH"], !existing.isEmpty {
        env["PATH"] = "\(existing):\(pathExtras)"
    } else {
        env["PATH"] = pathExtras
    }
    return env
}

await run()
