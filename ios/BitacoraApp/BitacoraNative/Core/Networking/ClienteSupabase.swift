import Foundation

enum ErrorRed: Error, Equatable {
    case sinConexion
    case noAutorizado
    case servidor(Int)
    case respuestaInvalida
}

// Un único cliente para toda la app. Habla con Auth (GoTrue) y REST (PostgREST) de Supabase con URLSession: el SDK
// oficial arrastra media docena de paquetes y no hace falta para leer una fila y renovar un token (ver NATIVA.md).
final class ClienteSupabase: Sendable {
    let base: URL
    let clave: String
    private let sesionURL: URLSession

    init(base: URL = Config.supabaseURL, clave: String = Config.supabaseAnonKey) {
        self.base = base
        self.clave = clave
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 12
        c.timeoutIntervalForResource = 30
        c.waitsForConnectivity = false
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        sesionURL = URLSession(configuration: c)
    }

    func peticion(_ ruta: String, consulta: [URLQueryItem] = [], metodo: String = "GET", token: String? = nil, cuerpo: Data? = nil, tiempo: TimeInterval = 12) -> URLRequest {
        var comp = URLComponents(url: base.appendingPathComponent(ruta), resolvingAgainstBaseURL: false)!
        if !consulta.isEmpty { comp.queryItems = consulta }
        var r = URLRequest(url: comp.url!, timeoutInterval: tiempo)
        r.httpMethod = metodo
        r.setValue(clave, forHTTPHeaderField: "apikey")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let cuerpo {
            r.httpBody = cuerpo
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return r
    }

    func enviar(_ r: URLRequest) async throws -> (Data, Int) {
        do {
            let (d, resp) = try await sesionURL.data(for: r)
            guard let h = resp as? HTTPURLResponse else { throw ErrorRed.respuestaInvalida }
            return (d, h.statusCode)
        } catch let e as URLError {
            if ClienteSupabase.esDeRed(e) { throw ErrorRed.sinConexion }
            throw e
        }
    }

    static func esDeRed(_ e: URLError) -> Bool {
        [.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost, .cannotConnectToHost,
         .dnsLookupFailed, .dataNotAllowed, .internationalRoamingOff, .secureConnectionFailed].contains(e.code)
    }
}
