import Foundation

struct FilaExtracto: Identifiable, Sendable, Equatable {
    let id: String
    let fecha: String
    let hora: String
    let tipo: String
    let importe: Decimal
    let concepto: String
    let claveBase: String
}

struct ExtractoAnalizado: Identifiable, Sendable, Equatable {
    let id = UUID()
    let filas: [FilaExtracto]
    let omitidas: Int
    let nombre: String
}

enum ErrorImportacionFinanzas: LocalizedError, Equatable {
    case vacio
    case cabecera
    case sinMovimientos

    var errorDescription: String? {
        switch self {
        case .vacio: return "el archivo está vacío."
        case .cabecera: return "no encuentro las columnas de fecha e importe del extracto."
        case .sinMovimientos: return "no hay movimientos válidos en el archivo."
        }
    }
}

// Importador nativo de CSV/TSV. Tolera cabeceras previas del banco, comillas, separador europeo y
// columnas separadas de cargo/abono. La huella estable permite reimportar sin duplicar.
enum ImportadorFinanzas {
    private static let fechas = ["fecha", "date", "fecha operacion", "fecha valor", "completed date", "started date"]
    private static let importes = ["importe", "amount", "monto", "cantidad", "valor"]
    private static let cargos = ["cargo", "debit", "debe", "retirada", "salida"]
    private static let abonos = ["abono", "credit", "haber", "deposito", "entrada"]
    private static let conceptos = ["movimiento", "concepto", "descripcion", "description", "merchant", "comercio", "nombre", "details", "reference"]
    private static let horas = ["hora", "time"]
    private static let estados = ["estado", "status"]

    static func analizar(_ texto: String, nombre: String) throws -> ExtractoAnalizado {
        let limpio = texto.replacingOccurrences(of: "\u{FEFF}", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !limpio.isEmpty else { throw ErrorImportacionFinanzas.vacio }
        let separador = detectarSeparador(limpio)
        let tabla = csv(limpio, separador: separador).filter { $0.contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } }
        guard !tabla.isEmpty else { throw ErrorImportacionFinanzas.vacio }

        guard let cabeceraN = tabla.prefix(30).firstIndex(where: { fila in
            let h = fila.map(normalizar)
            return indice(h, fechas) != nil && (indice(h, importes) != nil || indice(h, cargos) != nil || indice(h, abonos) != nil)
        }) else { throw ErrorImportacionFinanzas.cabecera }

        let cabecera = tabla[cabeceraN].map(normalizar)
        let iFecha = indice(cabecera, fechas)!
        let iImporte = indice(cabecera, importes)
        let iCargo = indice(cabecera, cargos)
        let iAbono = indice(cabecera, abonos)
        let iConcepto = indice(cabecera, conceptos)
        let iHora = indice(cabecera, horas)
        let iEstado = indice(cabecera, estados)
        var filas: [FilaExtracto] = []
        var omitidas = 0

        for (n, fila) in tabla.dropFirst(cabeceraN + 1).enumerated() {
            func valor(_ i: Int?) -> String { guard let i, fila.indices.contains(i) else { return "" }; return fila[i].trimmingCharacters(in: .whitespacesAndNewlines) }
            let estado = normalizar(valor(iEstado))
            if estado.contains("pending") || estado.contains("pendiente") || estado.contains("reverted") || estado.contains("revertido") { omitidas += 1; continue }
            guard let fecha = fechaISO(valor(iFecha)) else { omitidas += 1; continue }
            let bruto: Decimal?
            if let iImporte { bruto = decimal(valor(iImporte)) }
            else if let d = decimal(valor(iCargo)), d != 0 { bruto = -abs(d) }
            else if let a = decimal(valor(iAbono)), a != 0 { bruto = abs(a) }
            else { bruto = nil }
            guard let bruto, bruto != 0 else { omitidas += 1; continue }
            let concepto = valor(iConcepto).trimmingCharacters(in: .whitespacesAndNewlines)
            let hora = horaNormalizada(valor(iHora))
            let canon = [fecha, hora, NSDecimalNumber(decimal: bruto).stringValue, normalizar(concepto), String(n)].joined(separator: "|")
            let clave = "ioscsv_" + huella(canon)
            filas.append(FilaExtracto(id: clave, fecha: fecha, hora: hora, tipo: bruto > 0 ? "income" : "expense",
                                      importe: abs(bruto), concepto: concepto, claveBase: clave))
        }
        guard !filas.isEmpty else { throw ErrorImportacionFinanzas.sinMovimientos }
        return ExtractoAnalizado(filas: filas, omitidas: omitidas, nombre: nombre)
    }

    // La clave es la de la web (dedupeKey en js/finanzas-pro.js): cuenta|fecha|importe|concepto, con el importe como lo
    // escribe JavaScript (12.5, 1250). Dos filas iguales en el mismo archivo son dos movimientos: `vez` dice cuál es.
    // Así un extracto importado antes en la web no entra otra vez aquí, ni al revés.
    static func operaciones(_ extracto: ExtractoAnalizado, cuenta: String) -> [OperacionBitacora] {
        var vistas: [String: Int] = [:]
        return extracto.filas.map { f in
            let importe = NSDecimalNumber(decimal: f.importe).stringValue
            let clave = [cuenta, f.fecha, importe, f.concepto].joined(separator: "|")
            let vez = vistas[clave, default: 0]
            vistas[clave] = vez + 1
            return .importarFila(id: "ptx_imp_" + huella(clave + "#" + String(vez)), clave: clave, vez: vez, tipo: f.tipo,
                                 importe: importe, cuenta: cuenta, fecha: f.fecha, hora: f.hora, concepto: f.concepto)
        }
    }

    private static func indice(_ cabecera: [String], _ nombres: [String]) -> Int? {
        cabecera.firstIndex { campo in nombres.contains { campo == $0 || campo.contains($0) } }
    }

    private static func normalizar(_ texto: String) -> String {
        texto.lowercased().folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_ES"))
            .replacingOccurrences(of: #"[^a-z0-9 ]"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    private static func detectarSeparador(_ texto: String) -> Character {
        let muestra = texto.split(whereSeparator: \.isNewline).prefix(20).joined(separator: "\n")
        let candidatos: [Character] = [";", "\t", ",", "|"]
        return candidatos.max { a, b in contar(a, en: String(muestra)) < contar(b, en: String(muestra)) } ?? ";"
    }

    private static func contar(_ separador: Character, en texto: String) -> Int {
        var comillas = false, total = 0
        for c in texto { if c == "\"" { comillas.toggle() } else if c == separador && !comillas { total += 1 } }
        return total
    }

    static func csv(_ texto: String, separador: Character) -> [[String]] {
        var filas: [[String]] = [], fila: [String] = [], campo = "", comillas = false
        let chars = Array(texto), ultimo = chars.count
        var i = 0
        while i < ultimo {
            let c = chars[i]
            if c == "\"" {
                if comillas, i + 1 < ultimo, chars[i + 1] == "\"" { campo.append("\""); i += 1 } else { comillas.toggle() }
            } else if c == separador && !comillas { fila.append(campo); campo = "" }
            else if (c == "\n" || c == "\r") && !comillas {
                if c == "\r", i + 1 < ultimo, chars[i + 1] == "\n" { i += 1 }
                fila.append(campo); filas.append(fila); fila = []; campo = ""
            } else { campo.append(c) }
            i += 1
        }
        if !campo.isEmpty || !fila.isEmpty { fila.append(campo); filas.append(fila) }
        return filas
    }

    private static func decimal(_ texto: String) -> Decimal? {
        var s = texto.replacingOccurrences(of: "\u{00A0}", with: "").replacingOccurrences(of: " ", with: "")
        let negativo = s.contains("(") && s.contains(")")
        s = s.replacingOccurrences(of: #"[^0-9,\.\-+]"#, with: "", options: .regularExpression)
        if s.contains(",") && s.contains(".") {
            if s.lastIndex(of: ",")! > s.lastIndex(of: ".")! { s = s.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".") }
            else { s = s.replacingOccurrences(of: ",", with: "") }
        } else if s.contains(",") { s = s.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".") }
        guard var d = Decimal(string: s, locale: Locale(identifier: "en_US_POSIX")) else { return nil }
        if negativo { d = -abs(d) }
        return d
    }

    private static func fechaISO(_ texto: String) -> String? {
        let s = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        if let m = s.range(of: #"\d{4}-\d{2}-\d{2}"#, options: .regularExpression) { return String(s[m]) }
        let formatos = ["dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "d-M-yyyy", "dd.MM.yyyy", "d.M.yyyy", "MM/dd/yyyy"]
        for formato in formatos {
            let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = CalendarioBitacora.madrid.zona; f.dateFormat = formato; f.isLenient = false
            if let d = f.date(from: String(s.prefix(10))) {
                let salida = DateFormatter(); salida.locale = Locale(identifier: "en_US_POSIX"); salida.timeZone = f.timeZone; salida.dateFormat = "yyyy-MM-dd"
                return salida.string(from: d)
            }
        }
        return nil
    }

    private static func horaNormalizada(_ texto: String) -> String {
        guard let r = texto.range(of: #"\b([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b"#, options: .regularExpression) else { return "" }
        return String(texto[r].prefix(5))
    }

    private static func huella(_ texto: String) -> String {
        var h: UInt64 = 14_695_981_039_346_656_037
        for b in texto.utf8 { h ^= UInt64(b); h &*= 1_099_511_628_211 }
        return String(h, radix: 36)
    }
}

// Las claves con las que la web reconoce un movimiento ya importado (financeProImportCSV, «existentes»):
// cuenta|fecha|importe|concepto del banco (bankNote, o la nota), lo mismo desde la otra cuenta de un traspaso,
// claveImport y claveImport2.
enum ClaveImportacion {
    static func claves(_ t: JSONValue) -> [String] {
        guard let o = t.objeto, let fecha = o["date"]?.texto, let importe = Dinero.decimal(o["amount"]) else { return [] }
        let nota = o["bankNote"]?.texto ?? o["note"]?.texto ?? ""
        let cifra = NSDecimalNumber(decimal: importe).stringValue
        var r: [String] = []
        if let c = o["account"]?.texto { r.append([c, fecha, cifra, nota].joined(separator: "|")) }
        if let c = o["transferTo"]?.texto, !c.isEmpty { r.append([c, fecha, cifra, nota].joined(separator: "|")) }
        for k in ["claveImport", "claveImport2"] { if let c = o[k]?.texto, !c.isEmpty { r.append(c) } }
        return r
    }
}
