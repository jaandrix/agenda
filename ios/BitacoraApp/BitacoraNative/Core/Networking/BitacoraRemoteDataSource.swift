import Foundation

struct FilaRemota: Sendable {
    let datos: Data
    let actualizado: String?
}

// Solo lectura en esta fase. Cuando haya escrituras irán por `merge_bitacora_data` (parche de primer nivel) o por
// operaciones del servidor; nunca por un upsert de la fila completa.
protocol BitacoraRemoteDataSource: Sendable {
    func leerFila(sesion: Sesion) async throws -> FilaRemota?
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
