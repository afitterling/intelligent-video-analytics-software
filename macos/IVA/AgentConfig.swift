import Foundation

/// Persisted agent state. Stored as JSON in ~/Library/Application Support/IVA/config.json.
final class AgentConfig: ObservableObject, Codable {
    static let shared: AgentConfig = AgentConfig.load()

    @Published var apiUrl: String
    @Published var deviceId: String
    @Published var streamName: String
    @Published var region: String
    @Published var refreshToken: String   // SHA-256 of the registration token
    @Published var cameraUid: String      // AVCaptureDevice uniqueID

    enum CodingKeys: String, CodingKey {
        case apiUrl, deviceId, streamName, region, refreshToken, cameraUid
    }

    init(
        apiUrl: String = "",
        deviceId: String = "",
        streamName: String = "",
        region: String = "",
        refreshToken: String = "",
        cameraUid: String = ""
    ) {
        self.apiUrl = apiUrl
        self.deviceId = deviceId
        self.streamName = streamName
        self.region = region
        self.refreshToken = refreshToken
        self.cameraUid = cameraUid
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.apiUrl = try c.decodeIfPresent(String.self, forKey: .apiUrl) ?? ""
        self.deviceId = try c.decodeIfPresent(String.self, forKey: .deviceId) ?? ""
        self.streamName = try c.decodeIfPresent(String.self, forKey: .streamName) ?? ""
        self.region = try c.decodeIfPresent(String.self, forKey: .region) ?? ""
        self.refreshToken = try c.decodeIfPresent(String.self, forKey: .refreshToken) ?? ""
        self.cameraUid = try c.decodeIfPresent(String.self, forKey: .cameraUid) ?? ""
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(apiUrl, forKey: .apiUrl)
        try c.encode(deviceId, forKey: .deviceId)
        try c.encode(streamName, forKey: .streamName)
        try c.encode(region, forKey: .region)
        try c.encode(refreshToken, forKey: .refreshToken)
        try c.encode(cameraUid, forKey: .cameraUid)
    }

    var isRegistered: Bool {
        !deviceId.isEmpty && !streamName.isEmpty && !cameraUid.isEmpty
    }

    static let supportDir: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("IVA", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    static let configPath: URL = supportDir.appendingPathComponent("config.json")
    static let credsPath: URL = supportDir.appendingPathComponent("credentials")
    static let logPath: URL = supportDir.appendingPathComponent("agent.log")

    static func load() -> AgentConfig {
        guard let data = try? Data(contentsOf: configPath),
              let cfg = try? JSONDecoder().decode(AgentConfig.self, from: data) else {
            return AgentConfig()
        }
        return cfg
    }

    func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        try? data.write(to: AgentConfig.configPath, options: .atomic)
    }

    func reset() {
        apiUrl = ""; deviceId = ""; streamName = ""; region = ""
        refreshToken = ""; cameraUid = ""
        save()
        try? FileManager.default.removeItem(at: AgentConfig.credsPath)
    }
}
