import Foundation

struct Sesion: Codable, Sendable, Equatable {
    let accessToken: String
    let refreshToken: String
    let caduca: Date
    let userId: String
    let email: String?

    var caducaPronto: Bool { caduca.timeIntervalSinceNow < 60 }
}

enum ErrorAuth: Error, Equatable {
    case credenciales
    case correoSinConfirmar
    case sesionRevocada
    case sinSesion
    case otro(String)

    var mensaje: String {
        switch self {
        case .credenciales: return "correo o contraseña incorrectos."
        case .correoSinConfirmar: return "confirma tu correo antes de entrar."
        case .sesionRevocada: return "tu sesión ha caducado. vuelve a entrar."
        case .sinSesion: return "no hay sesión."
        case .otro(let m): return m
        }
    }
}

protocol AuthRepository: Sendable {
    func sesionGuardada() async -> Sesion?
    func entrar(email: String, contrasena: String) async throws -> Sesion
    // Devuelve una sesión con token vigente, renovándola si hace falta. Sin red lanza ErrorRed.sinConexion y la
    // sesión guardada sigue ahí; solo un rechazo claro del servidor (ErrorAuth.sesionRevocada) la borra.
    func sesionValida() async throws -> Sesion
    func salir() async
}

actor AuthSupabase: AuthRepository {
    private let cliente: ClienteSupabase
    private let cuentaLlavero = "sesion"
    private var actual: Sesion?
    private var cargada = false
    private var renovando: Task<Sesion, Error>?

    init(cliente: ClienteSupabase) { self.cliente = cliente }

    func sesionGuardada() -> Sesion? {
        if !cargada {
            cargada = true
            if let d = Llavero.leer(cuenta: cuentaLlavero) { actual = try? JSONDecoder().decode(Sesion.self, from: d) }
        }
        return actual
    }

    func entrar(email: String, contrasena: String) async throws -> Sesion {
        let cuerpo = try JSONSerialization.data(withJSONObject: ["email": email, "password": contrasena])
        let r = cliente.peticion("auth/v1/token", consulta: [URLQueryItem(name: "grant_type", value: "password")], metodo: "POST", cuerpo: cuerpo, tiempo: 15)
        let (d, codigo) = try await cliente.enviar(r)
        guard codigo == 200 else { throw AuthSupabase.error(d, codigo: codigo) }
        let s = try AuthSupabase.sesion(de: d)
        guardar(s)
        return s
    }

    func sesionValida() async throws -> Sesion {
        guard let s = sesionGuardada() else { throw ErrorAuth.sinSesion }
        if !s.caducaPronto { return s }
        if let renovando { return try await renovando.value }
        let t = Task { try await self.renovar(s) }
        renovando = t
        defer { renovando = nil }
        return try await t.value
    }

    private func renovar(_ s: Sesion) async throws -> Sesion {
        let cuerpo = try JSONSerialization.data(withJSONObject: ["refresh_token": s.refreshToken])
        let r = cliente.peticion("auth/v1/token", consulta: [URLQueryItem(name: "grant_type", value: "refresh_token")], metodo: "POST", cuerpo: cuerpo, tiempo: 6)
        let (d, codigo) = try await cliente.enviar(r)
        if codigo == 400 || codigo == 401 || codigo == 403 {
            Registro.auth.notice("El servidor rechazó la renovación (\(codigo, privacy: .public)): se cierra la sesión.")
            borrar()
            throw ErrorAuth.sesionRevocada
        }
        guard codigo == 200 else { throw ErrorRed.servidor(codigo) }
        let nueva = try AuthSupabase.sesion(de: d)
        guardar(nueva)
        return nueva
    }

    func salir() async {
        let token = actual?.accessToken
        borrar()
        guard let token else { return }
        let r = cliente.peticion("auth/v1/logout", metodo: "POST", token: token, tiempo: 6)
        _ = try? await cliente.enviar(r)
    }

    private func guardar(_ s: Sesion) {
        actual = s
        cargada = true
        if let d = try? JSONEncoder().encode(s), !Llavero.guardar(d, cuenta: cuentaLlavero) {
            Registro.auth.error("No se pudo guardar la sesión en el llavero.")
        }
    }

    private func borrar() {
        actual = nil
        cargada = true
        Llavero.borrar(cuenta: cuentaLlavero)
    }

    private struct Respuesta: Decodable {
        struct Usuario: Decodable { let id: String; let email: String? }
        let access_token: String
        let refresh_token: String
        let expires_in: Double?
        let expires_at: Double?
        let user: Usuario
    }

    static func sesion(de d: Data) throws -> Sesion {
        guard let r = try? JSONDecoder().decode(Respuesta.self, from: d) else { throw ErrorRed.respuestaInvalida }
        let caduca = r.expires_at.map { Date(timeIntervalSince1970: $0) } ?? Date().addingTimeInterval(r.expires_in ?? 3600)
        return Sesion(accessToken: r.access_token, refreshToken: r.refresh_token, caduca: caduca, userId: r.user.id, email: r.user.email)
    }

    static func error(_ d: Data, codigo: Int) -> Error {
        let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] ?? [:]
        let texto = [o["error_code"], o["error"], o["error_description"], o["msg"]].compactMap { $0 as? String }.joined(separator: " ").lowercased()
        if texto.contains("not confirmed") { return ErrorAuth.correoSinConfirmar }
        if codigo == 400 || texto.contains("invalid") { return ErrorAuth.credenciales }
        if codigo == 429 { return ErrorAuth.otro("demasiados intentos. espera un poco.") }
        return ErrorRed.servidor(codigo)
    }
}
