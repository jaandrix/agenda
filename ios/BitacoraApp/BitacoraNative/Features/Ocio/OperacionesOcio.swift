import Foundation

// 3.2: datos de Ocio que `guardarOcio` no conoce, en la misma entrada de `entries` y sin tocar lo demás:
// - `isbn` (libros: el del escáner o el que se escribe, solo dígitos y X),
// - `platform` (videojuegos: «PS5», «Switch»…) y `format` (videojuegos: «fisico», «digital» u «otro»),
// - `portada` con `soloSiFalta`: la que se busca sola después de guardar o al abrir Ocio; no pisa una que se haya puesto
//   mientras tanto y quita `portadaPendiente` (la marca de la web cuando no la encontró), como portadaAuto,
// - `portada` sin `soloSiFalta`: la que se elige a mano en la ficha («cambiar portada.»); sustituye la que haya.
// La web guarda las entradas con `{ ...antes, ...entry }` (js/entradas.js), así que las conserva al editar. Un valor
// vacío quita la clave. Va después de `guardarOcio` en el mismo lote, que es quien crea la entrada.
enum OcioDatosOp {
    static let tipo = "datosOcio"
    static let formatos = ["fisico", "digital", "otro"]

    static func op(id: String, isbn: String? = nil, plataforma: String? = nil, formato: String? = nil,
                   portadaSiFalta: String? = nil, portada: String? = nil) -> OperacionBitacora {
        var d: [String: JSONValue] = ["id": .string(id)]
        if let portada { d["portada"] = .string(portada) }
        if let portadaSiFalta { d["portada"] = .string(portadaSiFalta); d["soloSiFalta"] = .bool(true) }
        if let isbn { d["isbn"] = .string(isbn) }
        if let plataforma { d["platform"] = .string(plataforma) }
        if let formato { d["format"] = .string(formato) }
        return OperacionesExtra.op(tipo, d)
    }

    // «978-84-376-0494-7» → «9788437604947». Vacío si no tiene 10 o 13 caracteres válidos.
    static func isbnLimpio(_ texto: String) -> String {
        let s = texto.uppercased().filter { $0.isNumber || $0 == "X" }
        guard s.count == 10 || s.count == 13, !s.dropLast().contains("X") else { return "" }
        return s
    }

    static func aplicar(_ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        var r = valores
        guard let id = d["id"]?.comoId else { return r }
        let previo = valores["entries"] ?? nil
        let nuevo = OperacionesExtra.cambiarEntrada(id, previo) { e in
            guard let t = e["type"]?.texto, LecturaOcio.tipos.contains(t) else { return }
            if let v = d["isbn"]?.texto {
                let limpio = isbnLimpio(v)
                if limpio.isEmpty { e.removeValue(forKey: "isbn") } else { e["isbn"] = .string(limpio) }
            }
            if let v = d["platform"]?.texto {
                let limpio = String(v.trimmingCharacters(in: .whitespacesAndNewlines).prefix(60))
                if limpio.isEmpty { e.removeValue(forKey: "platform") } else { e["platform"] = .string(limpio) }
            }
            if let v = d["format"]?.texto {
                if formatos.contains(v) { e["format"] = .string(v) } else { e.removeValue(forKey: "format") }
            }
            if let v = d["portada"]?.texto, v.hasPrefix("https://") {
                let actual = e["portada"]?.texto ?? ""
                guard actual.isEmpty || d["soloSiFalta"]?.booleano != true else { return }
                e["portada"] = .string(String(v.prefix(2000)))
                e.removeValue(forKey: "portadaPendiente")
            }
        }
        if nuevo != previo { r["entries"] = .some(nuevo) }
        return r
    }
}
