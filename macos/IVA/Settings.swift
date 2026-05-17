import Foundation

/// Deployment-wide settings the macOS app reads at launch — analogous to a
/// `.env` for the web app. Lets an operator change the API URL without
/// rebuilding the .app.
///
/// Lookup order (first hit wins):
///   1. environment variables (`IVA_API_URL`, `IVA_REGION`)
///   2. `~/Library/Application Support/IVA/settings.json`
///   3. `Contents/Resources/settings.json` inside the .app bundle
///   4. built-in empty defaults (user types the URL into the registration UI)
struct AppSettings: Decodable {
    let apiUrl: String?
    let region: String?
    /// Cognito identifiers aren't required by the macOS agent today (auth is
    /// proxied through the API), but they're parsed so a future direct-Cognito
    /// flow doesn't need code changes.
    let userPoolId: String?
    let userPoolClientId: String?

    static let shared: AppSettings = AppSettings.load()

    /// Path the operator can edit at runtime to override without re-signing.
    static let userPath: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("IVA", isDirectory: true)
        return dir.appendingPathComponent("settings.json")
    }()

    var hasApiUrl: Bool { !(apiUrl ?? "").isEmpty }

    static func load() -> AppSettings {
        let env = ProcessInfo.processInfo.environment
        if let url = env["IVA_API_URL"], !url.isEmpty {
            return AppSettings(
                apiUrl: url,
                region: env["IVA_REGION"],
                userPoolId: env["IVA_USER_POOL_ID"],
                userPoolClientId: env["IVA_USER_POOL_CLIENT_ID"]
            )
        }
        if let s = decode(at: userPath) { return s }
        if let bundled = Bundle.main.url(forResource: "settings", withExtension: "json"),
           let s = decode(at: bundled) { return s }
        return AppSettings(apiUrl: nil, region: nil, userPoolId: nil, userPoolClientId: nil)
    }

    private static func decode(at url: URL) -> AppSettings? {
        guard let data = try? Data(contentsOf: url),
              let s = try? JSONDecoder().decode(AppSettings.self, from: data) else {
            return nil
        }
        return s
    }
}
