import Foundation
import CryptoKit

// Lo que Ajustes pide al servidor, con las mismas tablas, RPC y funciones Edge que la web (js/ajustes.js, invitar.js,
// conector.js y servicios.js). Nada de esto vive en la fila de `bitacora`; lo que sí vive ahí va por operaciones.
struct Suscripcion: Sendable, Equatable {
    var estado: String
    var plan: String?
    var periodoFin: String?
    var trialFin: String?
    var socioNumero: Int?
}

struct TokenConector: Sendable, Equatable, Identifiable {
    let hash: String
    let nombre: String
    let creado: String
    let ultimoUso: String?
    var id: String { hash }
}

struct CodigoInvitacion: Sendable, Equatable {
    let codigo: String
    let amigos: Int
    var enlace: URL { URL(string: "https://appbitacora.es/?amigo=\(codigo.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? codigo)")! }
}

enum ErrorAjustes: Error, Equatable {
    case servidor(String)
}

actor ServidorAjustes {
    private let cliente: ClienteSupabase
    private let auth: AuthRepository

    init(cliente: ClienteSupabase, auth: AuthRepository) {
        self.cliente = cliente
        self.auth = auth
    }

    static let conectorURL = Config.supabaseURL.absoluteString + "/functions/v1/bitacora-mcp/"
    static let entradaURL = Config.supabaseURL.absoluteString + "/functions/v1/entrada"
    static let correoDominio = "in.appbitacora.es"

    private func pedir(_ ruta: String, consulta: [URLQueryItem] = [], metodo: String = "GET", cuerpo: Any? = nil,
                       cabeceras: [String: String] = [:]) async throws -> (Any?, Int) {
        let s = try await auth.sesionValida()
        let datos = try cuerpo.map { try JSONSerialization.data(withJSONObject: $0) }
        var r = cliente.peticion(ruta, consulta: consulta, metodo: metodo, token: s.accessToken, cuerpo: datos, tiempo: 20)
        for (k, v) in cabeceras { r.setValue(v, forHTTPHeaderField: k) }
        let (d, codigo) = try await cliente.enviar(r)
        let json = d.isEmpty ? nil : try? JSONSerialization.jsonObject(with: d)
        return (json, codigo)
    }

    private func mensaje(_ json: Any?, _ porDefecto: String) -> String {
        ((json as? [String: Any])?["error"] as? String) ?? ((json as? [String: Any])?["message"] as? String) ?? porDefecto
    }

    func suscripcion(_ uid: String) async -> Suscripcion? {
        guard let (j, codigo) = try? await pedir("rest/v1/suscripciones", consulta: [URLQueryItem(name: "select", value: "*"), URLQueryItem(name: "user_id", value: "eq.\(uid)")]),
              codigo == 200, let filas = j as? [[String: Any]] else { return nil }
        guard let f = filas.first else { return Suscripcion(estado: "sin_fila") }
        return Suscripcion(estado: f["estado"] as? String ?? "", plan: f["plan"] as? String, periodoFin: f["periodo_fin"] as? String,
                           trialFin: f["trial_fin"] as? String, socioNumero: (f["socio_numero"] as? NSNumber)?.intValue)
    }

    func codigoInvitacion() async -> CodigoInvitacion? {
        guard let (j, codigo) = try? await pedir("rest/v1/rpc/mi_codigo_invitacion", metodo: "POST", cuerpo: [String: Any]()), codigo == 200 else { return nil }
        let fila = (j as? [[String: Any]])?.first ?? (j as? [String: Any])
        guard let c = fila?["codigo"] as? String, !c.isEmpty else { return nil }
        return CodigoInvitacion(codigo: c, amigos: (fila?["amigos"] as? NSNumber)?.intValue ?? 0)
    }

    func correoSemanal() async -> Bool? {
        guard let (j, codigo) = try? await pedir("rest/v1/correo_semanal", consulta: [URLQueryItem(name: "select", value: "activo")]), codigo == 200 else { return nil }
        return ((j as? [[String: Any]])?.first?["activo"] as? Bool) ?? false
    }

    func ponerCorreoSemanal(_ activo: Bool) async throws {
        let (j, codigo) = try await pedir("rest/v1/rpc/poner_correo_semanal", metodo: "POST", cuerpo: ["p_activo": activo])
        guard (200..<300).contains(codigo) else { throw ErrorAjustes.servidor(mensaje(j, "no se pudo cambiar.")) }
    }

    func tokens() async -> [TokenConector]? {
        guard let (j, codigo) = try? await pedir("rest/v1/conector_tokens", consulta: [URLQueryItem(name: "select", value: "token_hash,nombre,creado,ultimo_uso"), URLQueryItem(name: "order", value: "creado")]),
              codigo == 200, let filas = j as? [[String: Any]] else { return nil }
        return filas.compactMap { f in
            guard let h = f["token_hash"] as? String else { return nil }
            return TokenConector(hash: h, nombre: f["nombre"] as? String ?? "", creado: f["creado"] as? String ?? "", ultimoUso: f["ultimo_uso"] as? String)
        }
    }

    static func hash(_ token: String) -> String {
        SHA256.hash(data: Data(token.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    static func tokenNuevo(bytes: Int) -> String {
        var g = SystemRandomNumberGenerator()
        return (0..<bytes).map { _ in String(format: "%02x", UInt8.random(in: 0...255, using: &g)) }.joined()
    }

    // crearConector y atajoToken: el token solo existe en el iPhone; en la tabla va su SHA-256.
    func crearToken(nombre: String, bytes: Int = 32) async throws -> String {
        let s = try await auth.sesionValida()
        let token = Self.tokenNuevo(bytes: bytes)
        let (j, codigo) = try await pedir("rest/v1/conector_tokens", metodo: "POST",
                                          cuerpo: ["token_hash": Self.hash(token), "user_id": s.userId, "nombre": nombre],
                                          cabeceras: ["Prefer": "return=minimal"])
        guard (200..<300).contains(codigo) else { throw ErrorAjustes.servidor(mensaje(j, "no se pudo crear el enlace.")) }
        return token
    }

    func revocar(hash: String) async throws {
        let (j, codigo) = try await pedir("rest/v1/conector_tokens", consulta: [URLQueryItem(name: "token_hash", value: "eq.\(hash)")], metodo: "DELETE")
        guard (200..<300).contains(codigo) else { throw ErrorAjustes.servidor(mensaje(j, "no se pudo revocar.")) }
    }

    func enlaceCalendario() async throws -> URL {
        let (j, codigo) = try await pedir("functions/v1/calendario-feed", metodo: "POST")
        guard codigo == 200, let u = (j as? [String: Any])?["url"] as? String, let url = URL(string: u) else {
            throw ErrorAjustes.servidor(mensaje(j, "no se pudo preparar el enlace."))
        }
        return url
    }

    func portalPago() async throws -> URL {
        let (j, codigo) = try await pedir("functions/v1/portal-pago", metodo: "POST")
        guard codigo == 200, let u = (j as? [String: Any])?["url"] as? String, let url = URL(string: u) else {
            throw ErrorAjustes.servidor(mensaje(j, "no se pudo abrir el portal de pagos."))
        }
        return url
    }

    func eliminarCuenta() async throws {
        let (j, codigo) = try await pedir("functions/v1/eliminar-cuenta", metodo: "POST", cuerpo: ["confirmar": "eliminar"])
        guard (200..<300).contains(codigo) else { throw ErrorAjustes.servidor(mensaje(j, "no se pudo eliminar la cuenta.")) }
    }
}
