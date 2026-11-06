import Foundation

enum ErrorRed: Error, Equatable {
    case sinConexion
    case noAutorizado
    case servidor(Int)
    case respuestaInvalida
}

typealias Transporte = @Sendable (URLRequest) async throws -> (Data, Int)

// Un único cliente para toda la app. Habla con Auth (GoTrue) y REST (PostgREST) de Supabase con URLSession: el SDK
// oficial arrastra media docena de paquetes y no hace falta para leer una fila y renovar un token (ver NATIVA.md).
// El transporte se puede sustituir en los tests.
final class ClienteSupabase: Sendable {
    let base: URL
    let clave: String
    private let transporte: Transporte

    init(base: URL = Config.supabaseURL, clave: String = Config.supabaseAnonKey, transporte: Transporte? = nil) {
        self.base = base
        self.clave = clave
        if let transporte {
            self.transporte = transporte
        } else {
            let c = URLSessionConfiguration.ephemeral
            c.timeoutIntervalForRequest = 12
            c.timeoutIntervalForResource = 30
            c.waitsForConnectivity = false
            c.requestCachePolicy = .reloadIgnoringLocalCacheData
            let sesion = URLSession(configuration: c)
            self.transporte = { r in
                let (d, resp) = try await sesion.data(for: r)
                guard let h = resp as? HTTPURLResponse else { throw ErrorRed.respuestaInvalida }
                return (d, h.statusCode)
            }
        }
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
            return try await transporte(r)
        } catch let e as URLError {
            if e.code == .cancelled { throw CancellationError() }
            if ClienteSupabase.esDeRed(e) { throw ErrorRed.sinConexion }
            throw e
        }
    }

    static func esDeRed(_ e: URLError) -> Bool {
        [.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost, .cannotConnectToHost,
         .dnsLookupFailed, .dataNotAllowed, .internationalRoamingOff, .secureConnectionFailed].contains(e.code)
    }
}
