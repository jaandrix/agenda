import Foundation

// temasDisponibles (js/datos.js) y temaAmigosDesbloqueado (js/invitar.js): socio fundador (`suscripciones.estado`) o
// cuenta del creador (`user_metadata.desarrollador`) tienen todos; quien invitó o entró invitado (`invitaciones`), oliva.
// Se guarda por cuenta para elegir tema sin red. Si algo no responde, se queda lo guardado.
enum PermisosTemasRemotos {
    static func clave(_ uid: String) -> String { "bitacora.temas.\(uid)" }

    static func guardados(_ uid: String) -> PermisosTemas {
        guard let d = UserDefaults.standard.data(forKey: clave(uid)), let p = try? JSONDecoder().decode(PermisosTemas.self, from: d) else { return PermisosTemas() }
        return p
    }

    static func leer(_ uid: String, cliente: ClienteSupabase, auth: AuthRepository) async -> PermisosTemas? {
        guard let s = try? await auth.sesionValida() else { return nil }
        func json(_ ruta: String, _ consulta: [URLQueryItem] = []) async -> Any? {
            guard let (d, codigo) = try? await cliente.enviar(cliente.peticion(ruta, consulta: consulta, token: s.accessToken)), codigo == 200 else { return nil }
            return try? JSONSerialization.jsonObject(with: d)
        }
        guard let usuario = await json("auth/v1/user") as? [String: Any],
              let subs = await json("rest/v1/suscripciones", [URLQueryItem(name: "select", value: "estado"), URLQueryItem(name: "user_id", value: "eq.\(uid)")]) as? [[String: Any]],
              let inv = await json("rest/v1/invitaciones", [URLQueryItem(name: "select", value: "invitado,anfitrion")]) as? [[String: Any]] else { return nil }
        let desarrollador = (usuario["user_metadata"] as? [String: Any])?["desarrollador"] as? Bool == true
        let fundador = subs.contains { $0["estado"] as? String == "fundador" }
        let oliva = inv.contains { $0["invitado"] as? String == uid || $0["anfitrion"] as? String == uid }
        let p = PermisosTemas(todos: desarrollador || fundador, oliva: oliva)
        if let d = try? JSONEncoder().encode(p) { UserDefaults.standard.set(d, forKey: clave(uid)) }
        return p
    }
}
