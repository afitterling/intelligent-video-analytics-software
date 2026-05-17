import SwiftUI

@main
struct IVAApp: App {
    @StateObject private var config = AgentConfig.shared

    var body: some Scene {
        WindowGroup("IVA") {
            ContentView()
                .environmentObject(config)
                .frame(minWidth: 560, minHeight: 460)
        }
        .windowResizability(.contentSize)
    }
}

struct ContentView: View {
    @EnvironmentObject var config: AgentConfig

    var body: some View {
        if config.isRegistered {
            DashboardView()
        } else {
            RegistrationView()
        }
    }
}
