import Foundation

struct EntradaOcio: Sendable, Identifiable, Equatable {
    let id: String
    let tipo: String
    let titulo: String
    let autor: String
    let estado: String
    let fechaInicio: String
    let fechaFin: String
    let anio: String
    // De 0 a 5 en medios puntos. La web guarda enteros en `rating`; el medio va en `ratingMedia` (ver guardarOcio).
    let valoracion: Double
    let notas: String
    let enlace: String
    let portada: String
    // Título y autor ya normalizados para buscar sin rehacerlo en cada tecla (0.20).
    var buscable = ""
}

struct ListaOcio: Sendable, Identifiable, Equatable {
    let id: String
    let nombre: String
    let entryIds: [String]
}

struct VistaOcio: Sendable, Equatable {
    let entradas: [EntradaOcio]
    let listas: [ListaOcio]
}

enum LecturaOcio {
    static let tipos = ["book", "series", "movie", "game"]

    static func vista(_ doc: DocumentoBitacora) -> VistaOcio {
        let entradas = (((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []).compactMap { valor -> EntradaOcio? in
            guard let id = valor["id"]?.comoId, let tipo = valor["type"]?.texto, tipos.contains(tipo) else { return nil }
            let anio: String
            if let texto = valor["year"]?.texto { anio = texto }
            else if let numero = Dinero.decimal(valor["year"]) { anio = NSDecimalNumber(decimal: numero).stringValue }
            else { anio = "" }
            return EntradaOcio(
                id: id, tipo: tipo, titulo: valor["title"]?.texto ?? "sin título",
                autor: valor["author"]?.texto ?? "", estado: valor["status"]?.texto ?? estadoInicial(tipo),
                fechaInicio: valor["startDate"]?.texto ?? valor["date"]?.texto ?? "",
                fechaFin: valor["endDate"]?.texto ?? "", anio: anio,
                valoracion: valoracion(valor),
                notas: valor["notes"]?.texto ?? "", enlace: valor["url"]?.texto ?? "",
                portada: valor["portada"]?.texto ?? "",
                buscable: normalizar((valor["title"]?.texto ?? "") + " " + (valor["author"]?.texto ?? ""))
            )
        }.sorted { a, b in
            let fa = a.fechaFin.isEmpty ? a.fechaInicio : a.fechaFin
            let fb = b.fechaFin.isEmpty ? b.fechaInicio : b.fechaFin
            return (fa, a.titulo.lowercased()) > (fb, b.titulo.lowercased())
        }
        let listas = (((try? doc.valor(de: "cultureLists")) ?? nil)?.lista ?? []).compactMap { valor -> ListaOcio? in
            guard let id = valor["id"]?.comoId else { return nil }
            return ListaOcio(id: id, nombre: valor["name"]?.texto ?? valor["nombre"]?.texto ?? "lista",
                             entryIds: (valor["entryIds"]?.lista ?? []).compactMap(\.comoId))
        }
        return VistaOcio(entradas: entradas, listas: listas)
    }

    // `ratingMedia` solo vale si sigue de acuerdo con `rating` (si la web cambió la nota, manda la web).
    static func valoracion(_ v: JSONValue) -> Double {
        let r = NSDecimalNumber(decimal: Dinero.decimal(v["rating"]) ?? 0).doubleValue
        if let m = Dinero.decimal(v["ratingMedia"]).map({ NSDecimalNumber(decimal: $0).doubleValue }), m.rounded(.down) == r.rounded(.down) { return m }
        return r
    }

    static func textoNota(_ v: Double) -> String {
        v == v.rounded() ? "\(Int(v)) de 5." : String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",") + " de 5."
    }

    static func estadoInicial(_ tipo: String) -> String {
        switch tipo { case "book": return "Leyendo"; case "series": return "Viendo"; case "game": return "Jugando"; default: return "" }
    }

    static func nombre(_ tipo: String) -> String {
        switch tipo { case "book": return "libro"; case "series": return "serie"; case "movie": return "película"; default: return "videojuego" }
    }

    static func normalizar(_ texto: String) -> String {
        texto.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "es_ES"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
