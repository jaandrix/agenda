import Foundation
import Compression

// El archivo del banco, leído como en la web antes de pasarlo a financeProPrepararImport:
//   texto: handleFinanceProImportFile (UTF-16 con marca o con ceros entre letras, UTF-8 estricto y si no Windows-1252);
//   Excel (.xlsx): financeProLeerExcel (zip, primera hoja, textos compartidos y fechas guardadas como número).
// El resultado es lo que recibe el motor: el texto, o las filas en JSON.
enum LectorExtracto {
    enum Fallo: LocalizedError {
        case xlsAntiguo, excel, texto
        var errorDescription: String? {
            switch self {
            case .xlsAntiguo: return "ese Excel es del formato antiguo (.xls): ábrelo y guárdalo como .xlsx o CSV."
            case .excel: return "no se pudo leer el Excel."
            case .texto: return "no se pudo leer el archivo."
            }
        }
    }

    static func leer(_ datos: Data, nombre: String) throws -> String {
        let n = nombre.lowercased()
        if n.hasSuffix(".xls") { throw Fallo.xlsAntiguo }
        if n.hasSuffix(".xlsx") || datos.starts(with: [0x50, 0x4B, 0x03, 0x04]) {
            guard let filas = try? excel(datos),
                  let j = try? JSONSerialization.data(withJSONObject: filas), let s = String(data: j, encoding: .utf8) else { throw Fallo.excel }
            return s
        }
        return try texto(datos)
    }

    static func texto(_ datos: Data) throws -> String {
        let b = [UInt8](datos.prefix(4))
        let u16: String.Encoding?
        if b.count >= 2, b[0] == 0xFF, b[1] == 0xFE { u16 = .utf16LittleEndian }
        else if b.count >= 2, b[0] == 0xFE, b[1] == 0xFF { u16 = .utf16BigEndian }
        else if b.count >= 4, b[1] == 0, b[3] == 0, b[0] != 0, b[2] != 0 { u16 = .utf16LittleEndian }
        else { u16 = nil }
        if let u16 {
            var d = datos
            if b.count >= 2, (b[0] == 0xFF && b[1] == 0xFE) || (b[0] == 0xFE && b[1] == 0xFF) { d = d.dropFirst(2) }
            guard let s = String(data: d, encoding: u16) else { throw Fallo.texto }
            return s
        }
        if let s = String(data: datos, encoding: .utf8) { return s }
        guard let s = String(data: datos, encoding: .windowsCP1252) else { throw Fallo.texto }
        return s
    }

    // MARK: Excel

    static func excel(_ datos: Data) throws -> [[String]] {
        let partes = try zip(datos)
        let leer = { (n: String) -> Data? in partes[n] }
        let compartidas = leer("xl/sharedStrings.xml").map { XMLExcel.compartidas($0) } ?? []
        let estilos = leer("xl/styles.xml").map { XMLExcel.estilos($0) } ?? XMLExcel.Estilos(formatos: [:], xfs: [])
        let hojas = partes.keys.filter { $0.range(of: #"^xl/worksheets/[^/]+\.xml$"#, options: .regularExpression) != nil }
            .sorted { $0.localizedStandardCompare($1) == .orderedAscending }
        guard let primera = hojas.first, let hoja = leer(primera) else { throw Fallo.excel }
        let filas = XMLExcel.filas(hoja, compartidas: compartidas, estilos: estilos)
        let ancho = filas.map(\.count).max() ?? 0
        return filas.map { $0 + Array(repeating: "", count: ancho - $0.count) }
    }

    private static func zip(_ datos: Data) throws -> [String: Data] {
        let buf = [UInt8](datos)
        func u16(_ p: Int) -> Int { p + 1 < buf.count ? Int(buf[p]) | Int(buf[p + 1]) << 8 : 0 }
        func u32(_ p: Int) -> Int { p + 3 < buf.count ? Int(buf[p]) | Int(buf[p + 1]) << 8 | Int(buf[p + 2]) << 16 | Int(buf[p + 3]) << 24 : 0 }
        var fin = buf.count - 22
        while fin >= 0 && u32(fin) != 0x06054b50 { fin -= 1 }
        guard fin >= 0 else { throw Fallo.excel }
        var partes: [String: Data] = [:]
        var p = u32(fin + 16)
        for _ in 0..<u16(fin + 10) {
            let nLen = u16(p + 28), eLen = u16(p + 30), cLen = u16(p + 32)
            guard p + 46 + nLen <= buf.count else { throw Fallo.excel }
            let nombre = String(decoding: buf[(p + 46)..<(p + 46 + nLen)], as: UTF8.self)
            let metodo = u16(p + 10), comprimido = u32(p + 20), tamano = u32(p + 24)
            let local = u32(p + 42)
            let ini = local + 30 + u16(local + 26) + u16(local + 28)
            guard ini >= 0, ini + comprimido <= buf.count else { throw Fallo.excel }
            let trozo = Data(buf[ini..<(ini + comprimido)])
            if nombre.hasPrefix("xl/") && nombre.hasSuffix(".xml") {
                partes[nombre] = metodo == 0 ? trozo : try inflar(trozo, tamano: tamano)
            }
            p += 46 + nLen + eLen + cLen
        }
        return partes
    }

    // DEFLATE sin cabecera (deflate-raw, como DecompressionStream en la web): COMPRESSION_ZLIB de Apple es eso.
    private static func inflar(_ datos: Data, tamano: Int) throws -> Data {
        var capacidad = max(tamano, datos.count * 4, 1024)
        for _ in 0..<4 {
            let destino = UnsafeMutablePointer<UInt8>.allocate(capacity: capacidad)
            defer { destino.deallocate() }
            let n = datos.withUnsafeBytes { (o: UnsafeRawBufferPointer) -> Int in
                compression_decode_buffer(destino, capacidad, o.bindMemory(to: UInt8.self).baseAddress!, datos.count, nil, COMPRESSION_ZLIB)
            }
            if n > 0 && n < capacidad { return Data(bytes: destino, count: n) }
            if n > 0 && tamano > 0 && n == tamano { return Data(bytes: destino, count: n) }
            capacidad *= 4
        }
        throw Fallo.excel
    }
}

// Lo que hace financeProLeerExcel con DOMParser, con XMLParser.
private enum XMLExcel {
    struct Estilos { let formatos: [String: String]; let xfs: [String] }

    final class Lector: NSObject, XMLParserDelegate {
        var alAbrir: (String, [String: String]) -> Void = { _, _ in }
        var alCerrar: (String) -> Void = { _ in }
        var alTexto: (String) -> Void = { _ in }
        func parser(_ p: XMLParser, didStartElement e: String, namespaceURI: String?, qualifiedName: String?, attributes a: [String: String] = [:]) { alAbrir(local(e), a) }
        func parser(_ p: XMLParser, didEndElement e: String, namespaceURI: String?, qualifiedName: String?) { alCerrar(local(e)) }
        func parser(_ p: XMLParser, foundCharacters s: String) { alTexto(s) }
        private func local(_ n: String) -> String { n.split(separator: ":").last.map(String.init) ?? n }
        func leer(_ d: Data) { let x = XMLParser(data: d); x.delegate = self; x.shouldProcessNamespaces = false; x.parse() }
    }

    // `si` con sus `t`, sin los de `rPh` (la lectura fonética).
    static func compartidas(_ d: Data) -> [String] {
        var r: [String] = [], actual = "", enT = false, enRPh = false
        let l = Lector()
        l.alAbrir = { n, _ in if n == "si" { actual = "" } else if n == "rPh" { enRPh = true } else if n == "t" { enT = true } }
        l.alCerrar = { n in if n == "si" { r.append(actual) } else if n == "rPh" { enRPh = false } else if n == "t" { enT = false } }
        l.alTexto = { s in if enT && !enRPh { actual += s } }
        l.leer(d)
        return r
    }

    static func estilos(_ d: Data) -> Estilos {
        var formatos: [String: String] = [:], xfs: [String] = []
        var enCellXfs = false, cellXfsVisto = false
        let l = Lector()
        l.alAbrir = { n, a in
            if n == "numFmt", let id = a["numFmtId"] { formatos[id] = a["formatCode"] ?? "" }
            if n == "cellXfs" && !cellXfsVisto { enCellXfs = true; cellXfsVisto = true }
            if n == "xf" && enCellXfs { xfs.append(a["numFmtId"] ?? "0") }
        }
        l.alCerrar = { n in if n == "cellXfs" { enCellXfs = false } }
        l.leer(d)
        return Estilos(formatos: formatos, xfs: xfs)
    }

    static func filas(_ d: Data, compartidas: [String], estilos: Estilos) -> [[String]] {
        func esFecha(_ id: String) -> Bool {
            if let n = Int(id), (14...22).contains(n) || (45...47).contains(n) { return true }
            let f = (estilos.formatos[id] ?? "").replacingOccurrences(of: #""[^"]*"|\[[^\]]*\]"#, with: "", options: .regularExpression)
            return f.range(of: "[dmy]", options: [.regularExpression, .caseInsensitive]) != nil
        }
        func columna(_ ref: String) -> Int {
            ref.replacingOccurrences(of: #"\d+$"#, with: "", options: .regularExpression).unicodeScalars.reduce(0) { $0 * 26 + Int($1.value) - 64 } - 1
        }
        var filas: [[String]] = [], celdas: [String] = []
        var tipo: String?, ref: String?, estilo = "0", pos = 0
        var v = "", enV = false, vVisto = false, inline = "", enT = false, enRPh = false
        let l = Lector()
        l.alAbrir = { n, a in
            switch n {
            case "row": celdas = []; pos = 0
            case "c": tipo = a["t"]; ref = a["r"]; estilo = a["s"] ?? "0"; v = ""; vVisto = false; inline = ""
            case "v": if !vVisto { enV = true }
            case "t": enT = true
            case "rPh": enRPh = true
            default: break
            }
        }
        l.alTexto = { s in
            if enV { v += s }
            if enT && !enRPh { inline += s }
        }
        l.alCerrar = { n in
            switch n {
            case "v": if enV { enV = false; vVisto = true }
            case "t": enT = false
            case "rPh": enRPh = false
            case "c":
                var valor: String
                if tipo == "s" { valor = Int(v).flatMap { $0 < compartidas.count ? compartidas[$0] : nil } ?? "" }
                else if tipo == "inlineStr" { valor = inline }
                else if tipo == nil || tipo == "n" {
                    valor = v
                    let i = Int(estilo) ?? 0
                    let xf: String? = i >= 0 && i < estilos.xfs.count ? estilos.xfs[i] : nil
                    if !v.isEmpty, let num = Double(v), let xf, esFecha(xf) {
                        let fecha = Date(timeIntervalSince1970: ((num - 25569) * 86_400_000).rounded() / 1000)
                        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "UTC")!
                        let c = cal.dateComponents([.year, .month, .day], from: fecha)
                        valor = String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
                    }
                } else { valor = v }
                let idx = ref.map(columna) ?? pos
                while celdas.count < idx { celdas.append("") }
                let limpio = valor.trimmingCharacters(in: .whitespacesAndNewlines)
                if idx < celdas.count { celdas[idx] = limpio } else { celdas.append(limpio) }
                pos += 1
            case "row":
                if celdas.contains(where: { !$0.isEmpty }) { filas.append(celdas) }
            default: break
            }
        }
        l.leer(d)
        return filas
    }
}
