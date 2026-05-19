import AVFoundation
import SwiftUI

struct RegistrationView: View {
    @EnvironmentObject var config: AgentConfig

    @State private var apiUrl = AppSettings.shared.apiUrl ?? ""
    @State private var token = ""
    private var apiUrlLocked: Bool { AppSettings.shared.hasApiUrl }
    @State private var cameras: [CameraDevice] = []
    @State private var selectedCameraId: String = ""
    @State private var busy = false
    @State private var error: String?
    @State private var cameraAccessGranted = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Register this Mac as an IVA camera").font(.title2)
            Text("Paste the registration token from the IVA web app and pick which camera to stream.")
                .foregroundColor(.secondary)

            Group {
                if apiUrlLocked {
                    HStack {
                        Text("API URL").font(.caption).foregroundColor(.secondary)
                        Spacer()
                        Text(apiUrl).font(.caption).foregroundColor(.secondary).textSelection(.enabled)
                    }
                } else {
                    Text("API URL").font(.caption)
                    TextField("https://xxxxx.execute-api.eu-west-1.amazonaws.com", text: $apiUrl)
                        .textFieldStyle(.roundedBorder)
                }

                Text("Registration token").font(.caption)
                TextField("paste here", text: $token)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled(true)
            }

            HStack {
                Text("Camera").font(.caption)
                Spacer()
                Button("Refresh") { reloadCameras() }
            }
            if !cameraAccessGranted {
                Button("Grant camera access") { requestCameraAccess() }
            } else if cameras.isEmpty {
                Text("No cameras detected.").foregroundColor(.secondary)
            } else {
                Picker("", selection: $selectedCameraId) {
                    ForEach(cameras) { c in
                        Text("\(c.name)\(c.position.isEmpty ? "" : " (\(c.position))")")
                            .tag(c.id)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }

            if let error {
                Text(error).foregroundColor(.red).font(.callout)
            }

            HStack {
                Spacer()
                Button {
                    Task { await register() }
                } label: {
                    if busy { ProgressView().controlSize(.small) }
                    else { Text("Register & start streaming").bold() }
                }
                .disabled(busy || apiUrl.isEmpty || token.isEmpty || selectedCameraId.isEmpty)
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(24)
        .onAppear {
            cameraAccessGranted = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
            if cameraAccessGranted { reloadCameras() }
        }
    }

    private func requestCameraAccess() {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                cameraAccessGranted = granted
                if granted { reloadCameras() }
            }
        }
    }

    private func reloadCameras() {
        cameras = CameraDiscovery.list()
        if selectedCameraId.isEmpty, let first = cameras.first { selectedCameraId = first.id }
    }

    private func register() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            let resp = try await Backend.exchange(apiUrl: apiUrl, registrationToken: token)
            config.apiUrl = apiUrl
            config.deviceId = resp.deviceId
            config.streamName = resp.streamName
            config.region = resp.region
            config.refreshToken = resp.refreshToken ?? ""
            config.cameraUid = selectedCameraId
            config.save()
            // Persist the AVFoundation device-index so the headless agent
            // (which has no AVFoundation) can launch the same camera.
            if let idx = CameraDiscovery.gstIndex(for: selectedCameraId) {
                let url = AgentConfig.supportDir.appendingPathComponent("camera-index")
                try? String(idx).write(to: url, atomically: true, encoding: .utf8)
            }
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}
