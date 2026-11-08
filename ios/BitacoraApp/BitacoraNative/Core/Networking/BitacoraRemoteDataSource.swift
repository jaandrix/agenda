import Foundation

struct FilaRemota: Sendable {
    let datos: Data
    let actualizado: String?
}

// Las escrituras van por `merge_bitacora_data` (el servidor mezcla el parche por claves de primer nivel, como hace la
// web). Nunca un upsert de la fila completa: si la función falla, el cambio se queda en la cola.
protocol BitacoraRemoteDataSource: Sendable {
    func leerFila(sesion: Sesion) async throws -> FilaRemota?
    // `esperado`: lo que valían esas claves al leerlas (nil = no existían). Si alguna cambió entretanto, no escribe y
    // devuelve .conflicto.
    func mezclar(parche: [String: JSONValue], esperado: [String: JSONValue?], sesion: Sesion) async throws -> ResultadoMezcla
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
        // Sin la función nueva en el servidor (supabase/sql/merge_bitacora_si.sql), la de siempre: sin protección
        // frente a escrituras simultáneas, como hasta la 0.7.0.
        guard codigo == 404 || String(decoding: d, as: UTF8.self).contains("PGRST202") else { throw ErrorRed.servidor(codigo) }
        let viejo = cliente.peticion("rest/v1/rpc/merge_bitacora_data", metodo: "POST", token: sesion.accessToken,
                                     cuerpo: EscritorJSON.datos(.object(["p_patch": .object(parche)])), tiempo: 15)
        let (_, c2) = try await cliente.enviar(viejo)
        if c2 == 401 || c2 == 403 { throw ErrorRed.noAutorizado }
        guard (200..<300).contains(c2) else { throw ErrorRed.servidor(c2) }
        return .aplicada(protegida: false)
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
