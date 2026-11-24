import Foundation

// construirConexiones (js/bajo-demanda/conexiones.js): centros por tipo con lo que se relaciona con cada uno. Diferencia
// con la web: las personas salen solo de los acompañantes de los viajes; los amigos de Bitácora viven en Supabase, no en
// el documento.
struct CentroConexion: Sendable, Identifiable, Equatable {
    let id, tipo, nombre, sub: String
    let entradaId: String?
    let entradaTipo: String?     // el `type` de entradaId, para abrir su apartado
    let items: [EntradaSuelta]
}

enum LecturaConexiones {
    // CONEXION_TIPOS, en su orden: título y mínimo de elementos para que el centro cuente.
    static let tipos: [(tipo: String, titulo: String, min: Int)] = [
        ("viaje", "viajes", 1), ("equipo", "equipos", 2), ("persona", "personas", 2), ("etiqueta", "etiquetas", 1),
        ("asignatura", "asignaturas", 1), ("lugar", "lugares", 2), ("enlace", "enlaces en notas", 1)]

    static func titulo(_ tipo: String) -> String { tipos.first { $0.tipo == tipo }?.titulo ?? tipo }

    // normalizarTexto: minúsculas, sin tildes, solo letras, números y espacios sueltos.
    static func normalizar(_ s: String) -> String {
        let f = s.lowercased().folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_ES"))
        let limpio = String(f.unicodeScalars.map { CharacterSet.letters.contains($0) || CharacterSet.decimalDigits.contains($0) || $0 == " " ? Character($0) : " " })
        return limpio.split(separator: " ").joined(separator: " ")
    }

    // equiposDelPartido: «Atlético vs M. United», «Real Murcia - Real Zaragoza».
    static func equipos(_ e: EntradaSuelta) -> [String] {
        guard e.tipo == "event" else { return [] }
        var t = Substring(e.titulo)
        while let p = t.first, !(p.isLetter || p.isNumber) { t = t.dropFirst() }
        guard let re = try? NSRegularExpression(pattern: "\\s+(?:vs\\.?|v|–|-)\\s+", options: .caseInsensitive) else { return [] }
        let s = String(t), ns = s as NSString
        let cortes = re.matches(in: s, range: NSRange(location: 0, length: ns.length))
        guard cortes.count == 1, let m = cortes.first else { return [] }
        let partes = [ns.substring(to: m.range.location), ns.substring(from: m.range.location + m.range.length)]
        let deportivo = ["futbol", "baloncesto", "deportes", "deporte", "f1", "motogp"].contains(e.tipoEvento)
        if !deportivo, e.titulo.range(of: "\\s(vs\\.?|v)\\s", options: [.regularExpression, .caseInsensitive]) == nil { return [] }
        return partes.map { $0.trimmingCharacters(in: .whitespaces) }.filter { $0.count >= 2 && $0.count <= 40 }
    }

    // parseWikiLinks, solo hacia entradas: [[título exacto]] y /palabra (la primera entrada cuyo título la contiene).
    static func enlaces(_ texto: String, _ todas: [EntradaSuelta]) -> [String] {
        guard !texto.isEmpty else { return [] }
        let conTitulo = todas.filter { !$0.titulo.isEmpty }
        var ids: [String] = []
        let ns = texto as NSString
        if let re = try? NSRegularExpression(pattern: "\\[\\[(.+?)\\]\\]") {
            for m in re.matches(in: texto, range: NSRange(location: 0, length: ns.length)) {
                let l = ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespaces).lowercased()
                if !l.isEmpty, let e = conTitulo.first(where: { $0.titulo.lowercased() == l }), !ids.contains(e.id) { ids.append(e.id) }
            }
        }
        if let re = try? NSRegularExpression(pattern: "(?:^|[\\s(])/([a-zA-Z0-9áéíóúñÁÉÍÓÚÑ_-]{2,})") {
            for m in re.matches(in: texto, range: NSRange(location: 0, length: ns.length)) {
                let w = ns.substring(with: m.range(at: 1)).lowercased()
                if let e = conTitulo.first(where: { $0.titulo.lowercased().contains(w) }), !ids.contains(e.id) { ids.append(e.id) }
            }
        }
        return ids
    }

    static func centros(_ doc: DocumentoBitacora) -> [CentroConexion] {
        let todas = EntradaSuelta.leer(doc)
        let asignaturas = ((((try? doc.valor(de: "studies")) ?? nil)?["subjects"])?.lista ?? []).compactMap(\.objeto)
        return centros(todas, asignaturas: asignaturas)
    }

    static func centros(_ todas: [EntradaSuelta], asignaturas: [[String: JSONValue]]) -> [CentroConexion] {
        var orden: [String] = []
        var datos: [String: (tipo: String, nombre: String, sub: String, entradaId: String?, items: [EntradaSuelta])] = [:]
        func anadir(_ tipo: String, _ clave: String, _ nombre: String?, _ e: EntradaSuelta?, sub: String = "", entradaId: String? = nil) {
            let id = tipo + ":" + clave
            if datos[id] == nil { orden.append(id); datos[id] = (tipo, nombre ?? "", sub, entradaId, []) }
            if let e, datos[id]?.items.contains(where: { $0.id == e.id }) == false { datos[id]?.items.append(e) }
        }
        let visibles = todas.filter { !$0.registro }

        for t in visibles where t.tipo == "travel" {
            anadir("viaje", t.id, t.titulo.isEmpty ? "viaje" : t.titulo, nil, sub: rango(t.fecha, t.fin), entradaId: t.id)
            guard !t.fecha.isEmpty else { continue }
            let fin = t.fin.isEmpty ? t.fecha : t.fin
            for e in visibles where e.tipo == "event" && !e.fecha.isEmpty && e.fecha >= t.fecha && e.fecha <= fin { anadir("viaje", t.id, nil, e) }
        }

        var nombresEquipo: [String: String] = [:]
        for e in visibles {
            for n in equipos(e) {
                let k = normalizar(n)
                if nombresEquipo[k] == nil { nombresEquipo[k] = n }
                anadir("equipo", k, nombresEquipo[k], e)
            }
        }

        var personas: [(String, String)] = []
        for t in visibles where t.tipo == "travel" && !t.companeros.isEmpty {
            let trozos = t.companeros.replacingOccurrences(of: " y ", with: ",").replacingOccurrences(of: "&", with: ",").replacingOccurrences(of: "/", with: ",")
                .split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { $0.count >= 3 && $0.count <= 30 }
            for n in trozos {
                let k = normalizar(n)
                if let i = personas.firstIndex(where: { $0.0 == k }) { personas[i].1 = n } else { personas.append((k, n)) }
            }
        }
        for (k, nombre) in personas where !k.isEmpty {
            for e in visibles {
                let texto = " " + normalizar([e.titulo, e.notas, e.companeros, e.etiquetas.joined(separator: " ")].joined(separator: " ")) + " "
                if texto.contains(" " + k + " ") { anadir("persona", k, nombre, e) }
            }
        }

        for e in visibles { for t in e.etiquetas { anadir("etiqueta", t, "#" + t, e) } }

        for s in asignaturas {
            guard let sid = s["id"]?.comoId else { continue }
            let nombreCompleto = s["name"]?.texto ?? ""
            let clave = normalizar(nombreCompleto)
            guard !clave.isEmpty else { continue }
            let nombre = nombreCompleto.hasSuffix(".") ? String(nombreCompleto.dropLast()) : nombreCompleto
            let ex = s["exams"]?.lista?.count ?? 0, tr = s["assignments"]?.lista?.count ?? 0
            anadir("asignatura", sid, nombre, nil, sub: "\(ex) exámenes, \(tr) trabajos")
            for e in visibles where e.tipo == "event" && (e.asignaturaId == sid || normalizar(e.titulo).contains(clave)) { anadir("asignatura", sid, nil, e) }
        }

        for e in visibles where e.tipo == "event" && !e.lugar.isEmpty { anadir("lugar", normalizar(e.lugar), e.lugar, e) }

        for e in visibles {
            for destino in enlaces(e.notas, todas) where destino != e.id {
                guard let otra = todas.first(where: { $0.id == destino }) else { continue }
                anadir("enlace", e.id, e.titulo, otra, entradaId: e.id)
            }
        }

        return orden.compactMap { id -> CentroConexion? in
            guard let d = datos[id] else { return nil }
            let min = tipos.first { $0.tipo == d.tipo }?.min ?? 1
            guard d.items.count >= min else { return nil }
            let items = d.items.enumerated().sorted { $0.element.fecha != $1.element.fecha ? $0.element.fecha < $1.element.fecha : $0.offset < $1.offset }.map(\.element)
            let tipoEntrada = d.entradaId.flatMap { eid in todas.first { $0.id == eid }?.tipo }
            return CentroConexion(id: id, tipo: d.tipo, nombre: d.nombre, sub: d.sub, entradaId: d.entradaId, entradaTipo: tipoEntrada, items: items)
        }
    }

    // Los centros de un tipo, los más poblados primero (orden estable, como sort en la web).
    static func delTipo(_ tipo: String, _ c: [CentroConexion]) -> [CentroConexion] {
        c.enumerated().filter { $0.element.tipo == tipo }
            .sorted { $0.element.items.count != $1.element.items.count ? $0.element.items.count > $1.element.items.count : $0.offset < $1.offset }
            .map(\.element)
    }

    static func principal(_ c: [CentroConexion]) -> CentroConexion? {
        c.enumerated().max { $0.element.items.count != $1.element.items.count ? $0.element.items.count < $1.element.items.count : $0.offset > $1.offset }?.element
    }

    // formatTravelRange, corto: «3–7 mar 2026» o «28 feb – 2 mar 2026».
    static func rango(_ ini: String, _ fin: String) -> String {
        guard let a = fecha(ini) else { return "" }
        let b = fecha(fin) ?? a
        let f = DateFormatter(); f.locale = Locale(identifier: "es_ES"); f.timeZone = TimeZone(identifier: "Europe/Madrid")
        f.dateFormat = "d MMM yyyy"
        if a == b { return f.string(from: a) }
        let cal = Calendar(identifier: .gregorian)
        let mismoMes = cal.component(.month, from: a) == cal.component(.month, from: b) && cal.component(.year, from: a) == cal.component(.year, from: b)
        let corto = DateFormatter(); corto.locale = f.locale; corto.timeZone = f.timeZone
        corto.dateFormat = mismoMes ? "d" : "d MMM"
        return corto.string(from: a) + (mismoMes ? "–" : " – ") + f.string(from: b)
    }

    static func fecha(_ iso: String) -> Date? {
        guard iso.count >= 10 else { return nil }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(identifier: "Europe/Madrid")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: String(iso.prefix(10)))
    }

    static func fechaCorta(_ iso: String) -> String {
        guard let d = fecha(iso) else { return "" }
        let f = DateFormatter(); f.locale = Locale(identifier: "es_ES"); f.timeZone = TimeZone(identifier: "Europe/Madrid")
        f.dateFormat = "d MMM yyyy"
        return f.string(from: d)
    }
}
