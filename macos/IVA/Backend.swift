import Foundation

struct ExchangeResponse: Codable {
    struct Credentials: Codable {
        let accessKeyId: String
        let secretAccessKey: String
        let sessionToken: String
        let expiration: String?
    }
    let streamName: String
    let streamArn: String
    let dataEndpoint: String
    let region: String
    let deviceId: String
    let refreshToken: String?
    let credentials: Credentials
}

enum BackendError: Error, LocalizedError {
    case http(Int, String)
    case decode(Error)
    var errorDescription: String? {
        switch self {
        case .http(let code, let body): return "HTTP \(code): \(body)"
        case .decode(let e): return "decode: \(e.localizedDescription)"
        }
    }
}

enum Backend {
    static func exchange(apiUrl: String, registrationToken: String) async throws -> ExchangeResponse {
        try await post(apiUrl: apiUrl, path: "/agents/exchange",
                       body: ["registrationToken": registrationToken])
    }

    static func refresh(apiUrl: String, refreshToken: String) async throws -> ExchangeResponse {
        try await post(apiUrl: apiUrl, path: "/agents/refresh",
                       body: ["refreshToken": refreshToken])
    }

    private static func post(apiUrl: String, path: String, body: [String: String]) async throws -> ExchangeResponse {
        guard let url = URL(string: apiUrl + path) else {
            throw BackendError.http(0, "invalid url")
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: req)
        let http = response as? HTTPURLResponse
        if let http, http.statusCode >= 300 {
            throw BackendError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        do {
            return try JSONDecoder().decode(ExchangeResponse.self, from: data)
        } catch {
            throw BackendError.decode(error)
        }
    }
}
