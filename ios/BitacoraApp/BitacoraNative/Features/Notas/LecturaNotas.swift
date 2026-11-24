import Foundation

// Una nota lista para pintar (rediseño 2.0). Lectura propia de `notes`, más rica que LecturaMas (título, hora, etiquetas,
// todas las notas y no solo 40) y sin tocar Mas/.
struct FichaNota: Sendable, Identifiable, Equatable {
    let id: String
    let titulo: String
    let extracto: String          // dos líneas en la tarjeta, sin saltos
    let cuerpo: String            // lo que se lee al ampliarla, debajo del título
    let completo: String          // para copiar y compartir
    let dia: String               // yyyy-MM-dd
    let creada: String            // createdAt crudo, solo para ordenar
    let hora: String?             // HH:mm en Madrid
    let etiquetas: [String]
    let clave: String             // título y texto sin tildes ni mayúsculas

    var fecha: String {
        let p = dia.split(separator: "-")
        return p.count == 3 ? "\(p[2]).\(p[1]).\(p[0])" : dia
    }
    var mes: String { String(dia.prefix(7)) }
    var dato: String? { etiquetas.first.map { "#" + $0 } ?? hora }
}

enum LecturaNotas {
    static func fichas(_ doc: DocumentoBitacora) -> [FichaNota] {
        let lista = ((try? doc.valor(de: "notes")) ?? nil)?.lista ?? []
        return lista.compactMap { x -> FichaNota? in
            guard let o = x.objeto, let id = o["id"]?.comoId else { return nil }
            let texto = (o["content"]?.texto ?? o["text"]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let titulo = (o["title"]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !texto.isEmpty || !titulo.isEmpty else { return nil }
            let creada = o["createdAt"]?.texto ?? ""
            let dia = o["date"]?.texto ?? String(creada.prefix(10))
            let etiquetas = (o["tags"]?.lista ?? []).compactMap { $0.texto?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            let p = partir(titulo: titulo, texto: texto)
            let completo = [titulo, texto].filter { !$0.isEmpty }.joined(separator: "\n\n")
            return FichaNota(id: id, titulo: p.titulo, extracto: p.extracto, cuerpo: p.cuerpo, completo: completo, dia: dia,
                             creada: creada, hora: hora(creada), etiquetas: etiquetas,
                             clave: normalizar(completo + " " + etiquetas.joined(separator: " ")))
        }
        .sorted { ($0.dia, $0.creada) > ($1.dia, $1.creada) }
    }

    // Sin título propio, el título es la primera línea; si es muy larga, se corta en una palabra y el extracto la
    // repite entera (como el asunto de un correo).
    static func partir(titulo: String, texto: String) -> (titulo: String, extracto: String, cuerpo: String) {
        if !titulo.isEmpty { return (titulo, plano(texto), texto) }
        let lineas = texto.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false)
        let primera = String(lineas.first ?? "").trimmingCharacters(in: .whitespaces)
        let resto = lineas.count > 1 ? String(lineas[1]).trimmingCharacters(in: .whitespacesAndNewlines) : ""
        let limite = 60
        guard primera.count > limite else { return (primera, plano(resto), resto) }
        var corte = String(primera.prefix(limite))
        if let espacio = corte.lastIndex(of: " "), corte.distance(from: corte.startIndex, to: espacio) > limite / 2 {
            corte = String(corte[..<espacio])
        }
        return (corte.trimmingCharacters(in: CharacterSet(charactersIn: " ,.;:")) + "…", plano(texto), texto)
    }

    static func normalizar(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES"))
    }

    // «noviembre 2026» a partir de «2026-11».
    static func nombreMes(_ clave: String) -> String {
        let meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        let p = clave.split(separator: "-")
        guard p.count == 2, let m = Int(p[1]), (1...12).contains(m) else { return clave }
        return "\(meses[m - 1]) \(p[0])"
    }

    private static func plano(_ s: String) -> String {
        s.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: " ")
    }

    private static func hora(_ iso: String) -> String? {
        guard !iso.isEmpty else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let d = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Madrid")!
        let c = cal.dateComponents([.hour, .minute], from: d)
        guard let h = c.hour, let m = c.minute else { return nil }
        return String(format: "%02d:%02d", h, m)
    }
}
