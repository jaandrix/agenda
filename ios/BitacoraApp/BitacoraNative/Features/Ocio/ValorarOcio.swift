import Foundation

// «valorar …» después de un evento de ocio (0.20).
//
// La PWA (convertirCinesEnPeliculas, js/eventos.js) solo mira los eventos con `eventType` «cine»: tres horas después de
// empezar crea la película vista sin nota, una tarea de hoy «valorar la película. X» con `valorarPeliculaId` y deja
// `peliculaId` en el evento para no repetirlo. Solo la ejecuta la web, y los eventos creados en el iPhone se guardaban
// como «otro», así que nunca saltaba.
//
// Decisión: el evento dice qué es, sin adivinar. El editor de eventos guarda un tipo de ocio explícito, `ocioTipo`
// (movie, series, book, game, concierto, teatro), y para película, concierto y teatro también el `eventType` de la web
// (cine, concierto, teatro), que es lo que entiende la PWA. Si no hay `ocioTipo`, vale el `eventType` (Apuntar ya lo
// pone por palabras clave: cine, teatro, concierto) y, como último recurso, el título («cine: …», «concierto de …»).
//
// La misma regla en el iPhone, sea cual sea el origen (editor, Apuntar, la bandeja de Claude o la web):
// - cuándo: tres horas después del final; el final es «hasta las HH:MM» de las notas si lo hay o el inicio más la
//   duración típica (2 h; 2 h 30 un concierto). Sin hora, se toma las 21:00 como la web;
// - solo hasta 48 h después de ese momento, para que los eventos antiguos no salten todos de golpe;
// - película: la tarjeta de película vista sin nota y `peliculaId` en el evento (la web no la repite);
//   serie, libro o videojuego: la tarjeta que ya exista con ese título o una nueva terminada ese día;
//   concierto y teatro: solo la tarea;
// - la tarea va al día de hoy, con `valorarPeliculaId` (película, como la web) o `valorarOcioId` (el resto con tarjeta),
//   y el evento guarda `valorarTareaId`. Valorar la tarjeta marca hecha su tarea.
enum ValorarOcio {
    static let tipo = "valorarOcio"
    static let claves = ["entries", "dayPlanner"]
    static let ventana: TimeInterval = 48 * 3600
    static let tipos = ["movie", "series", "book", "game", "concierto", "teatro"]

    struct Pendiente: Equatable {
        let eventoId: String
        let clase: String
        let titulo: String
    }

    static func nombre(_ clase: String) -> String {
        switch clase {
        case "movie": return "la película"
        case "series": return "la serie"
        case "book": return "el libro"
        case "game": return "el juego"
        case "concierto": return "el concierto"
        default: return "la obra"
        }
    }

    static func clase(_ e: [String: JSONValue]) -> String? {
        if let t = e["ocioTipo"]?.texto, tipos.contains(t) { return t }
        switch e["eventType"]?.texto {
        case "cine": return "movie"
        case "concierto": return "concierto"
        case "teatro": return "teatro"
        default: break
        }
        let t = LecturaOcio.normalizar(e["title"]?.texto ?? "")
        if t.range(of: #"^(cine|pelicula|peli)\b"#, options: .regularExpression) != nil { return "movie" }
        if t.range(of: #"^(concierto|festival)\b"#, options: .regularExpression) != nil { return "concierto" }
        if t.range(of: #"^teatro\b"#, options: .regularExpression) != nil { return "teatro" }
        return nil
    }

    // El nombre sin «cine:», «película -», «concierto de»…
    static func tituloLimpio(_ titulo: String) -> String {
        let t = titulo.trimmingCharacters(in: .whitespacesAndNewlines)
        let patron = #"^(cine|película|pelicula|peli|concierto( de)?|festival|teatro)\s*[:·\-–—]?\s*"#
        guard let r = t.range(of: patron, options: [.regularExpression, .caseInsensitive]) else { return t }
        let resto = String(t[r.upperBound...]).trimmingCharacters(in: .whitespaces)
        return resto.isEmpty ? t : resto
    }

    static func minutos(_ h: String) -> Int? {
        let p = h.prefix(5).split(separator: ":").compactMap { Int($0) }
        guard p.count == 2, (0..<24).contains(p[0]), (0..<60).contains(p[1]) else { return nil }
        return p[0] * 60 + p[1]
    }

    // Cuándo salta: el final más tres horas, en hora de Madrid.
    static func momento(_ e: [String: JSONValue], clase: String) -> Date? {
        guard let dia = e["date"]?.texto.flatMap(LocalDay.init(iso:)) else { return nil }
        let inicio = minutos(e["time"]?.texto ?? "") ?? 21 * 60
        var fin = inicio + (clase == "concierto" ? 150 : 120)
        if let notas = e["notes"]?.texto, let re = try? NSRegularExpression(pattern: #"hasta las (\d{1,2}):(\d{2})"#),
           let m = re.firstMatch(in: notas, range: NSRange(notas.startIndex..., in: notas)),
           let rh = Range(m.range(at: 1), in: notas), let rm = Range(m.range(at: 2), in: notas),
           let hh = Int(notas[rh]), let mm = Int(notas[rm]), hh < 24, mm < 60 {
            let h = hh * 60 + mm
            fin = h < inicio ? h + 24 * 60 : h
        }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        guard let base = cal.date(from: DateComponents(year: dia.year, month: dia.month, day: dia.day, hour: 0, minute: 0)) else { return nil }
        return base.addingTimeInterval(TimeInterval(fin + 180) * 60)
    }

    static func pendientes(_ doc: DocumentoBitacora, ahora: Date = Date()) -> [Pendiente] {
        let lista = ((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []
        return lista.compactMap { v -> Pendiente? in
            guard let e = v.objeto, e["type"]?.texto == "event", let id = e["id"]?.comoId,
                  e["calendarLog"]?.booleano != true, e["peliculaId"] == nil, e["valorarTareaId"] == nil,
                  let clase = clase(e), let m = momento(e, clase: clase),
                  ahora >= m, ahora.timeIntervalSince(m) <= ventana else { return nil }
            return Pendiente(eventoId: id, clase: clase, titulo: tituloLimpio(e["title"]?.texto ?? ""))
        }
    }

    // Los ids se deciden antes de encolar: reaplicar no crea nada dos veces.
    static func operacion(_ p: Pendiente, ahora: Date = Date()) -> OperacionBitacora {
        let ms = Int64(ahora.timeIntervalSince1970 * 1000)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let h = cal.dateComponents([.hour, .minute], from: ahora)
        return OperacionesExtra.op(tipo, [
            "eventoId": .string(p.eventoId), "clase": .string(p.clase), "titulo": .string(p.titulo),
            "entradaId": .string("entry_\(ms)_\(String(p.eventoId.hashValue, radix: 36).suffix(6))"),
            "dia": .string(CalendarioBitacora.madrid.diaLogico(ahora).iso),
            "hora": .string(String(format: "%02d:%02d", h.hour ?? 0, h.minute ?? 0)),
            "hoy": .string(CalendarioBitacora.madrid.dia(de: ahora).iso)])
    }

    static func aplicar(_ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        guard let eid = d["eventoId"]?.texto, let clase = d["clase"]?.texto, tipos.contains(clase),
              let entradaId = d["entradaId"]?.texto, let dia = d["dia"]?.texto else { return valores }
        var r = valores
        var lista = (valores["entries"] ?? nil)?.lista ?? []
        guard let n = lista.firstIndex(where: { $0["id"]?.comoId == eid }), var ev = lista[n].objeto,
              ev["peliculaId"] == nil, ev["valorarTareaId"] == nil else { return valores }
        let titulo = (d["titulo"]?.texto).flatMap { $0.isEmpty ? nil : $0 } ?? ev["title"]?.texto ?? "sin título"
        let fecha = ev["date"]?.texto ?? (d["hoy"]?.texto ?? dia)
        var tarjeta: String?
        if clase == "movie" {
            tarjeta = entradaId
            lista.append(.object(["id": .string(entradaId), "title": .string(titulo), "type": .string("movie"), "date": .string(fecha),
                                  "categoryId": .string("cat_pelicula"), "tags": .array([]), "rating": .number("0"), "notes": .string("")]))
            ev["peliculaId"] = .string(entradaId)
        } else if ["series", "book", "game"].contains(clase) {
            let clave = LecturaOcio.normalizar(titulo)
            if let ya = lista.first(where: { $0["type"]?.texto == clase && LecturaOcio.normalizar($0["title"]?.texto ?? "") == clave })?["id"]?.comoId {
                tarjeta = ya
            } else {
                tarjeta = entradaId
                let cat = ["series": "cat_serie", "book": "cat_libro", "game": "cat_videojuego"][clase] ?? ""
                let estado = clase == "series" ? "Completada" : "Completado"
                lista.append(.object(["id": .string(entradaId), "title": .string(titulo), "type": .string(clase), "date": .string(fecha),
                                      "startDate": .string(fecha), "endDate": .string(fecha), "status": .string(estado),
                                      "categoryId": .string(cat), "tags": .array([]), "rating": .number("0"), "notes": .string("")]))
            }
        }
        let tareaId = "planner_valorar_" + (tarjeta ?? eid)
        ev["valorarTareaId"] = .string(tareaId)
        lista[n] = .object(ev)
        r["entries"] = .some(.array(lista))

        var p = AplicarOperaciones.planificador(valores["dayPlanner"] ?? nil)
        guard AplicarOperaciones.buscar(tareaId, en: p) == nil else { return r }
        var dias = p["days"]?.objeto ?? [:]
        var tareas = dias[dia]?.lista ?? []
        var t: [String: JSONValue] = ["id": .string(tareaId), "time": .string(d["hora"]?.texto ?? ""),
                                      "title": .string("valorar \(nombre(clase)). \(titulo)"), "notes": .string(""), "done": .bool(false)]
        if clase == "movie", let tarjeta { t["valorarPeliculaId"] = .string(tarjeta) } else if let tarjeta { t["valorarOcioId"] = .string(tarjeta) }
        else { t["valorarEventoId"] = .string(eid) }
        tareas.append(.object(t))
        dias[dia] = .array(tareas)
        p["days"] = .object(dias)
        r["dayPlanner"] = .some(.object(p))
        return r
    }

    // completarTareaValorarPelicula: valorar la tarjeta da por hecha su tarea (también las de serie, libro y juego).
    static let completar = "completarValorar"
    static func aplicarCompletar(_ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        guard let id = d["entradaId"]?.texto else { return valores }
        var p = AplicarOperaciones.planificador(valores["dayPlanner"] ?? nil)
        var dias = p["days"]?.objeto ?? [:]
        var cambio = false
        for (k, v) in dias {
            guard var l = v.lista else { continue }
            for i in l.indices {
                guard var t = l[i].objeto, t["valorarPeliculaId"]?.comoId == id || t["valorarOcioId"]?.comoId == id, t["done"]?.booleano != true else { continue }
                t["done"] = .bool(true)
                l[i] = .object(t)
                cambio = true
            }
            dias[k] = .array(l)
        }
        guard cambio else { return valores }
        p["days"] = .object(dias)
        var r = valores
        r["dayPlanner"] = .some(.object(p))
        return r
    }

    @MainActor private static var revisando = false

    // Se llama tras cada sincronización: lee la copia una vez y encola lo que toque.
    @MainActor static func revisar(_ c: AppCoordinator) async {
        guard !revisando, c.sesion != nil else { return }
        revisando = true
        defer { revisando = false }
        guard let doc = await c.documentoVisible() else { return }
        let ahora = Date()
        let lista = await Task.detached(priority: .utility) { pendientes(doc, ahora: ahora) }.value
        guard !lista.isEmpty else { return }
        try? await c.encolar(lista.map { operacion($0, ahora: ahora) })
    }
}
