import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var config: AgentConfig
    @StateObject private var agent: StreamingAgent

    init() {
        // Inject the same singleton so the agent reads live config values.
        _agent = StateObject(wrappedValue: StreamingAgent(config: AgentConfig.shared))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("IVA agent").font(.title2)
                Spacer()
                statusBadge
            }
            Divider()
            row("Device id", config.deviceId)
            row("Stream", config.streamName)
            row("Region", config.region)
            row("API", config.apiUrl)
            row("Camera", config.cameraUid)
            row("Log", AgentConfig.logPath.path)

            if let err = agent.lastError {
                Text(err).foregroundColor(.red).font(.callout).textSelection(.enabled)
            }

            HStack {
                if agent.isRunning {
                    Button("Stop") { agent.stop() }
                } else {
                    Button("Start streaming") {
                        Task { await agent.start() }
                    }
                    .keyboardShortcut(.defaultAction)
                }
                Spacer()
                Button("Open log") { NSWorkspace.shared.open(AgentConfig.logPath) }
                Button("Reset device") {
                    agent.stop()
                    config.reset()
                }
                .foregroundColor(.red)
            }
        }
        .padding(24)
    }

    private var statusBadge: some View {
        Text(agent.isRunning ? "streaming" : "idle")
            .font(.caption)
            .padding(.horizontal, 8).padding(.vertical, 2)
            .background(agent.isRunning ? Color.green.opacity(0.2) : Color.gray.opacity(0.2))
            .clipShape(Capsule())
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).foregroundColor(.secondary).frame(width: 80, alignment: .leading)
            Text(value).textSelection(.enabled)
            Spacer()
        }.font(.callout)
    }
}
