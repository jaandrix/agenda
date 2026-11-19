import Foundation
import Compression

// El archivo del banco, leído como en la web antes de pasarlo a financeProPrepararImport:
//   texto: handleFinanceProImportFile (UTF-16 con marca o con ceros entre letras, UTF-8 estricto y si no Windows-1252);
//   Excel (.xlsx): financeProLeerExcel (zip, la hoja de los movimientos en el orden del libro, textos compartidos y
//   fechas guardadas como número, también las de los libros que cuentan desde 1904).
// El resultado es lo que recibe el motor: el texto, o las filas en JSON.
enum LectorExtracto {
    enum Fallo: LocalizedError {
        case xlsAntiguo, excel, texto, grande, demasiado
        var errorDescription: String? {
            switch self {
            case .grande: return "el archivo es demasiado grande (máximo 15 MB en texto y 25 MB en Excel): exporta solo unos meses."
            case .demasiado: return "el extracto tiene demasiadas filas o columnas (máximo 100.000 filas y 200 columnas)."
            case .xlsAntiguo: return "ese Excel es del formato antiguo (.xls): ábrelo y guárdalo como .xlsx o CSV."
            case .excel: return "no se pudo leer el Excel."
            case .texto: return "no se pudo leer el archivo."
            }
        }
    }

    // 0.23 (auditoría P0): límites antes de leer y al descomprimir. Un ZIP que declara tamaños falsos o una bomba de
    // descompresión ya no reservan memoria sin techo, y cada paso mira si se ha cancelado.
    static let maxTexto = 15 << 20, maxExcel = 25 << 20, maxXML = 20 << 20, maxTotal = 60 << 20
    static let maxRatio = 100, maxFilas = 100_000, maxColumnas = 200

    // Lee el archivo comprobando su tamaño antes de cargarlo (sin copiarlo entero si se puede mapear).
    static func leer(url: URL) throws -> String {
        let n = url.lastPathComponent.lowercased()
        if n.hasSuffix(".xls") { throw Fallo.xlsAntiguo }
        let tam = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        if tam > (n.hasSuffix(".xlsx") ? maxExcel : max(maxTexto, maxExcel)) { throw Fallo.grande }
        let datos = try Data(contentsOf: url, options: .mappedIfSafe)
        try Task.checkCancellation()
        return try leer(datos, nombre: url.lastPathComponent)
    }

    static func leer(_ datos: Data, nombre: String) throws -> String {
        let n = nombre.lowercased()
        if n.hasSuffix(".xls") { throw Fallo.xlsAntiguo }
        if n.hasSuffix(".xlsx") || datos.starts(with: [0x50, 0x4B, 0x03, 0x04]) {
            if datos.count > maxExcel { throw Fallo.grande }
            let filas: [[String]]
            do { filas = try excel(datos) } catch let f as Fallo where f == .grande || f == .demasiado { throw f } catch is CancellationError { throw CancellationError() } catch { throw Fallo.excel }
            try Task.checkCancellation()
            guard let j = try? JSONSerialization.data(withJSONObject: filas), let s = String(data: j, encoding: .utf8) else { throw Fallo.excel }
            return s
        }
        if datos.count > maxTexto { throw Fallo.grande }
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
        // 0.26 (F-09), como financeProHojasDelLibro: las hojas en el orden del libro, primero las visibles, y la primera
        // con una cabecera de movimientos. Antes, la primera por nombre de archivo: una portada u hoja oculta delante fallaba.
        let libro = XMLExcel.libro(leer("xl/workbook.xml"), relaciones: leer("xl/_rels/workbook.xml.rels"), nombres: Array(partes.keys))
        var elegidas: [[String]]?
        for nombre in libro.hojas.prefix(12) {
            guard let hoja = leer(nombre) else { continue }
            try Task.checkCancellation()
            guard let filas = XMLExcel.filas(hoja, compartidas: compartidas, estilos: estilos, fecha1904: libro.fecha1904) else {
                try Task.checkCancellation()
                throw Fallo.demasiado
            }
            if elegidas == nil { elegidas = filas }
            if filas.prefix(40).contains(where: esCabecera) { elegidas = filas; break }
        }
        guard let filas = elegidas else { throw Fallo.excel }
        let ancho = filas.map(\.count).max() ?? 0
        return filas.map { $0 + Array(repeating: "", count: ancho - $0.count) }
    }

    // financeProEsCabecera: una columna de fecha y otra de importe.
    static func esCabecera(_ fila: [String]) -> Bool {
        let cab = fila.map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
        let fecha = #"^(fecha|date|started date|completed date|booking date|value date|f\. ?(operaci|operat|valor|contable))"#
        let importe = "^(importe|amount|cantidad|cargo|abono|debe|haber|neto)"
        return cab.contains { $0.range(of: fecha, options: .regularExpression) != nil } && cab.contains { $0.range(of: importe, options: .regularExpression) != nil }
    }

    private static func zip(_ datos: Data) throws -> [String: Data] {
        let buf = [UInt8](datos)
        func u16(_ p: Int) -> Int { p + 1 < buf.count ? Int(buf[p]) | Int(buf[p + 1]) << 8 : 0 }
        func u32(_ p: Int) -> Int { p + 3 < buf.count ? Int(buf[p]) | Int(buf[p + 1]) << 8 | Int(buf[p + 2]) << 16 | Int(buf[p + 3]) << 24 : 0 }
        var fin = buf.count - 22
        while fin >= 0 && u32(fin) != 0x06054b50 { fin -= 1 }
        guard fin >= 0 else { throw Fallo.excel }
        var partes: [String: Data] = [:]
        var total = 0
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
            if (nombre.hasPrefix("xl/") && nombre.hasSuffix(".xml")) || nombre == "xl/_rels/workbook.xml.rels" {
                try Task.checkCancellation()
                // Lo declarado no es de fiar: se limita lo declarado y también lo que sale de verdad.
                guard tamano <= maxXML, tamano <= max(comprimido, 1) * maxRatio else { throw Fallo.grande }
                let d = metodo == 0 ? trozo : try inflar(trozo, tamano: tamano)
                total += d.count
                guard d.count <= maxXML, total <= maxTotal else { throw Fallo.grande }
                partes[nombre] = d
            }
            p += 46 + nLen + eLen + cLen
        }
        return partes
    }

    // DEFLATE sin cabecera (deflate-raw, como DecompressionStream en la web): COMPRESSION_ZLIB de Apple es eso.
    private static func inflar(_ datos: Data, tamano: Int) throws -> Data {
        let techo = min(maxXML, max(datos.count, 1) * maxRatio) + 1
        var capacidad = min(max(tamano + 1, datos.count * 4, 1024), techo)
        while true {
            let destino = UnsafeMutablePointer<UInt8>.allocate(capacity: capacidad)
            defer { destino.deallocate() }
            let n = datos.withUnsafeBytes { (o: UnsafeRawBufferPointer) -> Int in
                compression_decode_buffer(destino, capacidad, o.bindMemory(to: UInt8.self).baseAddress!, datos.count, nil, COMPRESSION_ZLIB)
            }
            if n > 0 && n < capacidad { return Data(bytes: destino, count: n) }
            if n > 0 && tamano > 0 && n == tamano { return Data(bytes: destino, count: n) }
            // n == 0 es un error o un destino pequeño; n == capacidad, que no cabía.
            if capacidad >= techo { throw n == 0 ? Fallo.excel : Fallo.grande }
            capacidad = min(capacidad * 4, techo)
        }
    }
}

// Lo que hace financeProLeerExcel con DOMParser, con XMLParser.
private enum XMLExcel {
    struct Estilos { let formatos: [String: String]; let xfs: [String] }

    final class Lector: NSObject, XMLParserDelegate {
        var alAbrir: (String, [String: String]) -> Void = { _, _ in }
        var alCerrar: (String) -> Void = { _ in }
        var alTexto: (String) -> Void = { _ in }
        private var x: XMLParser?
        func parar() { x?.abortParsing() }
        func parser(_ p: XMLParser, didStartElement e: String, namespaceURI: String?, qualifiedName: String?, attributes a: [String: String] = [:]) { alAbrir(local(e), a) }
        func parser(_ p: XMLParser, didEndElement e: String, namespaceURI: String?, qualifiedName: String?) { alCerrar(local(e)) }
        func parser(_ p: XMLParser, foundCharacters s: String) { alTexto(s) }
        private func local(_ n: String) -> String { n.split(separator: ":").last.map(String.init) ?? n }
        func leer(_ d: Data) { let x = XMLParser(data: d); self.x = x; x.delegate = self; x.shouldProcessNamespaces = false; x.parse(); self.x = nil }
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

    struct Libro { let hojas: [String]; let fecha1904: Bool }

    static func libro(_ d: Data?, relaciones: Data?, nombres: [String]) -> Libro {
        let porNombre = nombres.filter { $0.range(of: #"^xl/worksheets/[^/]+\.xml$"#, options: .regularExpression) != nil }
            .sorted { $0.localizedStandardCompare($1) == .orderedAscending }
        guard let d else { return Libro(hojas: porNombre, fecha1904: false) }
        var destino: [String: String] = [:]
        if let relaciones {
            let l = Lector()
            l.alAbrir = { n, a in
                guard n == "Relationship", let id = a["Id"], let t = a["Target"] else { return }
                destino[id] = t.hasPrefix("/") ? String(t.dropFirst()) : "xl/" + (t.hasPrefix("./") ? String(t.dropFirst(2)) : t)
            }
            l.leer(relaciones)
        }
        var visibles: [String] = [], ocultas: [String] = [], fecha1904 = false
        let l = Lector()
        l.alAbrir = { n, a in
            if n == "workbookPr", let v = a["date1904"] { fecha1904 = v == "1" || v == "true" }
            guard n == "sheet" else { return }
            let id = a.first { $0.key == "id" || $0.key.hasSuffix(":id") }?.value
            guard let id, let ruta = destino[id], nombres.contains(ruta) else { return }
            if a["state"] == "hidden" || a["state"] == "veryHidden" { ocultas.append(ruta) } else { visibles.append(ruta) }
        }
        l.leer(d)
        let hojas = visibles + ocultas
        return Libro(hojas: hojas.isEmpty ? porNombre : hojas, fecha1904: fecha1904)
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

    // nil si pasa de los límites de filas o columnas, o si se cancela.
    static func filas(_ d: Data, compartidas: [String], estilos: Estilos, fecha1904: Bool = false) -> [[String]]? {
        let base: Double = fecha1904 ? 24107 : 25569
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
        var fuera = false
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
                        let fecha = Date(timeIntervalSince1970: ((num - base) * 86_400_000).rounded() / 1000)
                        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "UTC")!
                        let c = cal.dateComponents([.year, .month, .day], from: fecha)
                        valor = String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
                    }
                } else { valor = v }
                let idx = ref.map(columna) ?? pos
                if idx >= LectorExtracto.maxColumnas { fuera = true; l.parar(); return }
                while celdas.count < idx { celdas.append("") }
                let limpio = valor.trimmingCharacters(in: .whitespacesAndNewlines)
                if idx < celdas.count { celdas[idx] = limpio } else { celdas.append(limpio) }
                pos += 1
            case "row":
                if celdas.contains(where: { !$0.isEmpty }) { filas.append(celdas) }
                if filas.count > LectorExtracto.maxFilas || (filas.count % 2000 == 0 && Task.isCancelled) { fuera = true; l.parar() }
            default: break
            }
        }
        l.leer(d)
        return fuera ? nil : filas
    }
}
