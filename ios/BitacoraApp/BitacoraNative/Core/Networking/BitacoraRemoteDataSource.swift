import Foundation

struct FilaRemota: Sendable {
    let datos: Data
    let actualizado: String?
    // md5 de cada clave de primer nivel, de leer_bitacora; nil si el servidor aún no tiene la función.
    var huellas: [String: String]? = nil
}

// Las escrituras van por guardar_bitacora (o merge_bitacora_si) y solo se aplican si nadie cambió esos bloques desde la
// lectura. Nunca un upsert de la fila ni una escritura sin comprobar: si faltan las funciones, el cambio espera en la cola.
protocol BitacoraRemoteDataSource: Sendable {
    func leerFila(sesion: Sesion) async throws -> FilaRemota?
    // `esperado`: lo que valían esas claves al leerlas (nil = no existían). Si alguna cambió entretanto, no escribe y
    // devuelve .conflicto.
    func mezclar(parche: [String: JSONValue], esperado: [String: JSONValue?], sesion: Sesion) async throws -> ResultadoMezcla
    // Con huellas, la comprobación viaja en unos bytes (guardar_bitacora) en vez de repetir los bloques enteros.
    func mezclar(parche: [String: JSONValue], huellas: [String: String], sesion: Sesion) async throws -> ResultadoMezcla
}

enum ErrorServidor: Error, Equatable {
    // Faltan las funciones de escritura protegida: no se escribe y la cola espera.
    case sinActualizar
}

enum ResultadoMezcla: Equatable, Sendable {
    case aplicada(protegida: Bool)
    case conflicto
}

struct RemotoSupabase: BitacoraRemoteDataSource {
    let cliente: ClienteSupabase

    func leerFila(sesion: Sesion) async throws -> FilaRemota? {
        let rpc = cliente.peticion("rest/v1/rpc/leer_bitacora", metodo: "POST", token: sesion.accessToken, cuerpo: Data("{}".utf8))
        let (d, codigo) = try await cliente.enviar(rpc)
        if codigo == 401 || codigo == 403 { throw ErrorRed.noAutorizado }
        if (200..<300).contains(codigo) { return try RemotoSupabase.extraerConHuellas(d) }
        guard RemotoSupabase.faltaFuncion(codigo, d) else { throw ErrorRed.servidor(codigo) }
        let r = cliente.peticion("rest/v1/bitacora", consulta: [
            URLQueryItem(name: "select", value: "data,updated_at"),
            URLQueryItem(name: "user_id", value: "eq.\(sesion.userId)"),
        ], token: sesion.accessToken)
        let (d2, c2) = try await cliente.enviar(r)
        if c2 == 401 || c2 == 403 { throw ErrorRed.noAutorizado }
        guard c2 == 200 else { throw ErrorRed.servidor(c2) }
        return try RemotoSupabase.extraer(d2)
    }

    static func faltaFuncion(_ codigo: Int, _ d: Data) -> Bool {
        codigo == 404 || String(decoding: d, as: UTF8.self).contains("PGRST202")
    }

    // `{"data": {...}, "updated_at": "...", "huellas": {...}}`, o `null` si la cuenta aún no tiene fila.
    static func extraerConHuellas(_ original: Data) throws -> FilaRemota? {
        let d = Data([UInt8](original))
        if (try? LectorJSON.valor(d)) == .null { return nil }
        let partes = try LectorJSON.fragmentosRaiz(d)
        guard let rango = partes.first(where: { $0.0 == "data" })?.1 else { throw ErrorRed.respuestaInvalida }
        let datos = d.subdata(in: rango)
        guard (try? LectorJSON.valor(datos).objeto) != nil else { throw ErrorRed.respuestaInvalida }
        let actualizado = partes.first(where: { $0.0 == "updated_at" }).flatMap { try? LectorJSON.valor(d.subdata(in: $0.1)).texto }
        var huellas: [String: String] = [:]
        if let r = partes.first(where: { $0.0 == "huellas" })?.1, let o = try? LectorJSON.valor(d.subdata(in: r)).objeto {
            for (k, v) in o { if let t = v.texto { huellas[k] = t } }
        }
        return FilaRemota(datos: datos, actualizado: actualizado, huellas: huellas)
    }

    func mezclar(parche: [String: JSONValue], huellas: [String: String], sesion: Sesion) async throws -> ResultadoMezcla {
        precondition(!parche.keys.contains { ContratoDatos.especiales.contains($0) }, "apuntes y _meta no se escriben desde iOS")
        var h: [String: JSONValue] = [:]
        for k in parche.keys { h[k] = .string(huellas[k] ?? "") }
        let cuerpo = EscritorJSON.datos(.object(["p_patch": .object(parche), "p_huellas": .object(h)]))
        let r = cliente.peticion("rest/v1/rpc/guardar_bitacora", metodo: "POST", token: sesion.accessToken, cuerpo: cuerpo, tiempo: 15)
        let (d, codigo) = try await cliente.enviar(r)
        if codigo == 401 || codigo == 403 { throw ErrorRed.noAutorizado }
        if (200..<300).contains(codigo) { return (try? LectorJSON.valor(d)) == .bool(true) ? .aplicada(protegida: true) : .conflicto }
        if RemotoSupabase.faltaFuncion(codigo, d) { throw ErrorServidor.sinActualizar }
        throw ErrorRed.servidor(codigo)
    }

    func mezclar(parche: [String: JSONValue], esperado: [String: JSONValue?], sesion: Sesion) async throws -> ResultadoMezcla
    // Con huellas, la comprobación viaja en unos bytes (guardar_bitacora) en vez de repetir los bloques enteros.
    func mezclar(parche: [String: JSONValue], huellas: [String: String], sesion: Sesion) async throws -> ResultadoMezcla
}

enum ErrorServidor: Error, Equatable {
    // Faltan las funciones de escritura protegida: no se escribe y la cola espera.
    case sinActualizar
}

enum ResultadoMezcla: Equatable, Sendable {
    case aplicada(protegida: Bool)
    case conflicto
}

struct RemotoSupabase: BitacoraRemoteDataSource {
    let cliente: ClienteSupabase

    func leerFila(sesion: Sesion) async throws -> FilaRemota? {
        let r = cliente.peticion("rest/v1/bitacora", consulta: [
            URLQueryItem(name: "select", value: "data,updated_at"),
            URLQueryItem(name: "user_id", value: "eq.\(sesion.userId)"),
        ], token: sesion.accessToken)
        let (d, codigo) = try await cliente.enviar(r)
        if codigo == 401 || codigo == 403 { throw ErrorRed.noAutorizado }
        guard codigo == 200 else { throw ErrorRed.servidor(codigo) }
        return try RemotoSupabase.extraer(d)
    }

    func mezclar(parche: [String: JSONValue], esperado: [String: JSONValue?], sesion: Sesion) async throws -> ResultadoMezcla {
        precondition(!parche.keys.contains { ContratoDatos.especiales.contains($0) }, "apuntes y _meta no se escriben desde iOS")
        var previo: [String: JSONValue] = [:]
        for (k, v) in esperado { if let v { previo[k] = v } }
        let cuerpo = EscritorJSON.datos(.object(["p_patch": .object(parche), "p_esperado": .object(previo)]))
        let r = cliente.peticion("rest/v1/rpc/merge_bitacora_si", metodo: "POST", token: sesion.accessToken, cuerpo: cuerpo, tiempo: 15)
        let (d, codigo) = try await cliente.enviar(r)
        if codigo == 401 || codigo == 403 { throw ErrorRed.noAutorizado }
        if (200..<300).contains(codigo) {
            return (try? LectorJSON.valor(d)) == .bool(true) ? .aplicada(protegida: true) : .conflicto
        }
        // Sin la función protegida no se escribe: el cambio espera en la cola (antes se caía a merge_bitacora_data, que
        // podía pisar lo de otro dispositivo).
        if RemotoSupabase.faltaFuncion(codigo, d) { throw ErrorServidor.sinActualizar }
        throw ErrorRed.servidor(codigo)
    }

    // La respuesta es `[{"data": {...}, "updated_at": "..."}]`. Se recortan los bytes de `data` tal cual, sin
    // decodificar y volver a codificar.
    static func extraer(_ original: Data) throws -> FilaRemota? {
        let d = Data([UInt8](original))
        guard let lista = try LectorJSON.valor(d).lista else { throw ErrorRed.respuestaInvalida }
        guard !lista.isEmpty else { return nil }
        let bytes = [UInt8](d)
        var i = 0
        while i < bytes.count, bytes[i] != UInt8(ascii: "{") { i += 1 }
        var fin = i, profundidad = 0, enCadena = false, escapado = false
        while fin < bytes.count {
            let c = bytes[fin]
            if enCadena {
                if escapado { escapado = false } else if c == 0x5C { escapado = true } else if c == 0x22 { enCadena = false }
            } else if c == 0x22 { enCadena = true }
            else if c == UInt8(ascii: "{") || c == UInt8(ascii: "[") { profundidad += 1 }
            else if c == UInt8(ascii: "}") || c == UInt8(ascii: "]") { profundidad -= 1; if profundidad == 0 { fin += 1; break } }
            fin += 1
        }
        let fila = d.subdata(in: i..<fin)
        let partes = try LectorJSON.fragmentosRaiz(fila)
        guard let rango = partes.first(where: { $0.0 == "data" })?.1 else { throw ErrorRed.respuestaInvalida }
        let datos = fila.subdata(in: rango)
        let actualizado = partes.first(where: { $0.0 == "updated_at" }).flatMap { try? LectorJSON.valor(fila.subdata(in: $0.1)).texto }
        guard (try? LectorJSON.valor(datos).objeto) != nil else { throw ErrorRed.respuestaInvalida }
        return FilaRemota(datos: datos, actualizado: actualizado)
    }
}
