import Foundation

enum FuenteImportacionOcio: String, Sendable { case goodreads, letterboxd, imdb }

struct EntradaImportadaOcio: Sendable, Equatable {
    let tipo: String
    let titulo: String
    let autor: String
    let estado: String
    let fechaInicio: String
    let fechaFin: String
    let anio: String
    let valoracion: String
    let enlace: String
    let notas: String
}

struct ResultadoImportacionOcio: Sendable, Equatable {
    let entradas: [EntradaImportadaOcio]
    let omitidas: Int
}

enum ImportadoresOcio {
    static func importar(_ texto: String, fuente: FuenteImportacionOcio) throws -> ResultadoImportacionOcio {
        let filas = csv(texto)
        guard filas.count > 1 else { throw ErrorImportacionOcio.vacio }
        let cabecera = filas[0].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        func indice(_ nombres: [String]) -> Int? { nombres.compactMap { cabecera.firstIndex(of: $0) }.first }
        func campo(_ fila: [String], _ nombres: [String]) -> String {
            guard let n = indice(nombres), fila.indices.contains(n) else { return "" }
            return fila[n].trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard indice(["Title", "Name"]) != nil else { throw ErrorImportacionOcio.formato }
        var resultado: [EntradaImportadaOcio] = []
        var omitidas = 0
        for fila in filas.dropFirst() {
            let titulo = campo(fila, [fuente == .letterboxd ? "Name" : "Title"])
            guard !titulo.isEmpty else { omitidas += 1; continue }
            switch fuente {
            case .goodreads:
                let fecha = fechaISO(campo(fila, ["Date Read", "Date Added"]))
                let estante = campo(fila, ["Exclusive Shelf", "Bookshelves"]).lowercased()
                let terminado = estante.contains("read") && !estante.contains("currently")
                resultado.append(.init(tipo: "book", titulo: titulo, autor: campo(fila, ["Author"]),
                                       estado: terminado ? "Completado" : "Leyendo", fechaInicio: fecha,
                                       fechaFin: terminado ? fecha : "", anio: campo(fila, ["Year Published", "Original Publication Year"]),
                                       valoracion: campo(fila, ["My Rating"]), enlace: "", notas: ""))
            case .letterboxd:
                let fecha = fechaISO(campo(fila, ["Watched Date", "Date", "Rated Date"]))
                resultado.append(.init(tipo: "movie", titulo: titulo, autor: "", estado: "", fechaInicio: fecha,
                                       fechaFin: fecha, anio: campo(fila, ["Year"]), valoracion: campo(fila, ["Rating"]),
                                       enlace: campo(fila, ["Letterboxd URI", "URL"]), notas: campo(fila, ["Tags"])))
            case .imdb:
                let clase = campo(fila, ["Title Type"])
                if !clase.isEmpty && clase != "tvSeries" && clase != "tvMiniSeries" { omitidas += 1; continue }
                let fecha = fechaISO(campo(fila, ["Date Rated", "Release Date"]))
                let diez = Decimal(string: campo(fila, ["Your Rating"]), locale: Locale(identifier: "en_US_POSIX")) ?? 0
                let cinco = NSDecimalNumber(decimal: min(5, max(0, diez / 2))).rounding(accordingToBehavior: nil).stringValue
                resultado.append(.init(tipo: "series", titulo: titulo, autor: "", estado: fecha.isEmpty ? "Viendo" : "Completada",
                                       fechaInicio: fecha, fechaFin: fecha, anio: campo(fila, ["Year"]), valoracion: cinco,
                                       enlace: campo(fila, ["URL"]), notas: ""))
            }
        }
        return ResultadoImportacionOcio(entradas: resultado, omitidas: omitidas)
    }

    static func csv(_ texto: String) -> [[String]] {
        var filas: [[String]] = [], fila: [String] = [], campo = "", entreComillas = false
        let caracteres = Array(texto.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n"))
        var n = 0
        while n < caracteres.count {
            let c = caracteres[n]
            if c == "\"" {
                if entreComillas, n + 1 < caracteres.count, caracteres[n + 1] == "\"" { campo.append("\""); n += 1 }
                else { entreComillas.toggle() }
            } else if c == ",", !entreComillas { fila.append(campo); campo = "" }
            else if c == "\n", !entreComillas { fila.append(campo); if fila.contains(where: { !$0.isEmpty }) { filas.append(fila) }; fila = []; campo = "" }
            else { campo.append(c) }
            n += 1
        }
        fila.append(campo); if fila.contains(where: { !$0.isEmpty }) { filas.append(fila) }
        if !filas.isEmpty, !filas[0].isEmpty { filas[0][0] = filas[0][0].replacingOccurrences(of: "\u{FEFF}", with: "") }
        return filas
    }

    static func fechaISO(_ valor: String) -> String {
        let limpio = valor.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !limpio.isEmpty else { return "" }
        let formatos = ["yyyy-MM-dd", "yyyy/MM/dd", "MM/dd/yyyy", "dd/MM/yyyy"]
        for formato in formatos {
            let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = formato
            if let fecha = f.date(from: limpio) { let salida = DateFormatter(); salida.locale = f.locale; salida.dateFormat = "yyyy-MM-dd"; return salida.string(from: fecha) }
        }
        return ""
    }
}

enum ErrorImportacionOcio: Error { case vacio, formato }
