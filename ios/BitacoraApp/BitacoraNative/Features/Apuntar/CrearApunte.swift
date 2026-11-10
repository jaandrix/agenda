import Foundation

// apuntarCrear (js/apuntar.js): lo que crea cada tipo, convertido en operaciones con los ids decididos de antemano (dos
// toques no duplican, y reaplicar no repite). Cada apunte se registra en `apuntesRecientes` con lo necesario para
// deshacerlo; tarea, evento, gasto, compra y nota con la misma forma que la web (la web también los deshace), y los
// cumpleaños, viajes y ocio como «evento» (son entradas). Examen, recurrente y clase usan formas propias.
struct ApunteCreado: Equatable {
    let ops: [OperacionBitacora]
    let aviso: String
}

enum CrearApunte {
    static let ocio = ["libro": "book", "serie": "series", "peli": "movie", "juego": "game"]
    static let categoriaOcio = ["book": "cat_libro", "series": "cat_serie", "movie": "cat_pelicula", "game": "cat_videojuego"]
    static let diaClave = ["lunes": "lun", "martes": "mar", "miercoles": "mie", "jueves": "jue", "viernes": "vie", "sabado": "sab", "domingo": "dom"]
    static let diasSemana = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"]
    static let cuentas = ["efectivo", "bancos", "online"]

    static func id(_ prefijo: String, _ ahora: Date, letras n: Int = 5) -> String {
        let l = "abcdefghijklmnopqrstuvwxyz0123456789"
        return "\(prefijo)_\(Int64(ahora.timeIntervalSince1970 * 1000))_" + String((0..<n).map { _ in l.randomElement()! })
    }

    static func json(_ o: [String: JSONValue]) -> String { EscritorJSON.texto(.object(o)) }

    static func diasEntre(_ a: String, _ b: String) -> Int? {
        guard let x = LocalDay(iso: a), let y = LocalDay(iso: b) else { return nil }
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        guard let dx = c.date(from: DateComponents(year: x.year, month: x.month, day: x.day)),
              let dy = c.date(from: DateComponents(year: y.year, month: y.month, day: y.day)) else { return nil }
        return c.dateComponents([.day], from: dx, to: dy).day
    }

    static func partir(_ t: String, _ patron: String) -> [String] {
        guard let re = try? NSRegularExpression(pattern: patron) else { return [t] }
        var trozos: [String] = []
        var desde = t.startIndex
        for m in re.matches(in: t, range: NSRange(t.startIndex..., in: t)) {
            guard let r = Range(m.range, in: t) else { continue }
            trozos.append(String(t[desde..<r.lowerBound]))
            desde = r.upperBound
        }
        trozos.append(String(t[desde...]))
        return trozos.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }

    // Devuelve las operaciones (con el registro al final) o el motivo por el que no se puede.
    static func crear(_ a: ApunteInterpretado, tipo: String, doc: DocumentoBitacora, ahora: Date = Date()) -> Result<ApunteCreado, ErrorApunte> {
        let r = a.r
        let v = { (k: String) -> JSONValue? in (try? doc.valor(de: k)) ?? nil }
        let madrid = CalendarioBitacora.madrid
        let hoy = madrid.dia(de: ahora).iso
        var titulo = r.titulo
        if r.comprar, tipo != "compra", !titulo.isEmpty, titulo.range(of: #"^comprar\b"#, options: [.regularExpression, .caseInsensitive]) == nil {
            titulo = "Comprar " + titulo.prefix(1).lowercased() + titulo.dropFirst()
        }
        let desc = a.describir[tipo]?.texto ?? a.texto
        let aviso = desc.prefix(1).uppercased() + desc.dropFirst()
        var ops: [OperacionBitacora] = []
        var deshacer: [String: JSONValue] = [:]
        let apunteId = id("apn", ahora, letras: 4)
        let falla = { (m: String) in Result<ApunteCreado, ErrorApunte>.failure(ErrorApunte(motivo: m)) }
        if let e = r.error, !e.isEmpty { return falla(e) }

        switch tipo {
        case "gasto":
            guard let imp = r.importe, let d = Dinero.decimal(texto: imp), d > 0 else { return falla("falta el importe") }
            let pro = v("financePro")
            let ultima = (pro?["transactions"]?.lista ?? []).reversed().first { $0["manual"]?.booleano == true && $0["account"]?.texto != nil }?["account"]?.texto
            let cuenta = r.cuenta == "efectivo" ? "efectivo" : (ultima.map { cuentas.contains($0) } == true ? ultima! : "bancos")
            let fecha = r.fechaDicha ? r.fecha : hoy
            var hora = ""
            if fecha == hoy {
                let f = DateFormatter()
                f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = madrid.zona; f.dateFormat = "HH:mm:ss"
                hora = f.string(from: ahora)
            }
            let txId = id("ptx_q", ahora)
            ops.append(.crearMovimiento(id: txId, tipo: r.ingreso ? "income" : "expense", importe: imp, cuenta: cuenta,
                                        categoria: r.categoria.isEmpty ? nil : r.categoria, fecha: fecha, hora: hora, concepto: titulo))
            deshacer = ["tipo": .string("gasto"), "txId": .string(txId)]
        case "compra":
            let lc = v("listaCompra")
            let listas = lc?["listas"]?.lista ?? []
            let actual = lc?["actual"]?.comoId
            let listaId = listas.first { $0["id"]?.comoId == actual }?["id"]?.comoId ?? listas.first?["id"]?.comoId ?? "lista_\(Int64(ahora.timeIntervalSince1970 * 1000))"
            let cosas = partir(titulo.isEmpty ? a.texto : titulo, #"\n|,(?!\d)|\s+y\s+"#)
            guard !cosas.isEmpty else { return falla("falta qué comprar") }
            let ids = cosas.indices.map { _ in id("cmp", ahora, letras: 4) }
            ops.append(.anadirCompra(listaId: listaId, textos: cosas, ids: ids))
            deshacer = ["tipo": .string("compra"), "listaId": .string(listaId), "textos": .array(cosas.map { .string(Compra.interpretar($0).texto) })]
        case "nota":
            let existente = (v("notes")?.lista ?? []).first { $0["date"]?.texto == hoy }?["id"]?.comoId
            let notaId = existente ?? OperacionBitacora.nuevoIdNota(ahora: ahora)
            var anadido = a.texto
            if r.nota { anadido = anadido.replacingOccurrences(of: #"^\s*(?:nota|idea|apunte|apuntar que)\s*:\s*"#, with: "", options: [.regularExpression, .caseInsensitive]) }
            anadido = anadido.trimmingCharacters(in: .whitespacesAndNewlines)
            ops.append(.anadirANota(id: notaId, dia: hoy, texto: anadido, creada: ISO8601DateFormatter.conMs.string(from: ahora), apunteId: apunteId))
            deshacer = ["tipo": .string("nota"), "notaId": .string(notaId), "texto": .string(anadido)]
        case "cumple":
            guard !titulo.isEmpty else { return falla("falta de quién es") }
            let fecha = r.anioDicho ? r.fecha : "2000-" + r.fecha.suffix(5)
            let eid = id("ap_cumple", ahora)
            var o: [String: JSONValue] = ["id": .string(eid), "type": .string("birthday"), "categoryId": .string("cat_general"), "tags": .array([]),
                                          "title": .string(titulo), "firstName": .string(titulo), "lastName": .string(""),
                                          "birthDate": .string(fecha), "date": .string(fecha)]
            if !r.anioDicho { o["sinAnio"] = .bool(true) }
            ops.append(.anadirEnLista(clave: "entries", id: eid, json: json(o)))
            deshacer = ["tipo": .string("evento"), "eventoId": .string(eid)]
        case "examen", "trabajo":
            guard let aid = r.asignaturaId else { return falla("no encuentro la asignatura") }
            let lista = tipo == "examen" ? "exams" : "assignments"
            let clase = r.estudio?.clase ?? ""
            let nombre = r.asignaturaNombre ?? ""
            let tit = tipo == "examen" ? (!clase.isEmpty && clase != "examen" ? "Examen " + clase : "Examen")
                : (!titulo.isEmpty && Normal.norm(titulo) != Normal.norm(nombre) ? titulo : "Entrega")
            let iid = id("ap_est", ahora)
            ops.append(.crearEntrega(asignaturaId: aid, lista: lista, id: iid, titulo: tit, fecha: r.fecha, hora: r.hora.isEmpty ? nil : r.hora))
            deshacer = ["tipo": .string("estudio"), "subjectId": .string(aid), "lista": .string(lista), "id": .string(iid)]
        case "recurrente":
            guard !titulo.isEmpty else { return falla("falta qué hacer") }
            let rc = r.recurrencia
            let frecuencia = rc?.frecuencia ?? "diaria"
            let rid = id("ap_rec", ahora)
            var o: [String: JSONValue] = ["id": .string(rid), "activo": .bool(true), "completadas": .object([:]), "texto": .string(titulo), "frecuencia": .string(frecuencia)]
            if frecuencia == "semanal" { o["diasSemana"] = .array((rc?.dias ?? []).compactMap { d in diasSemana.firstIndex(of: d).map { .number(String($0)) } }) }
            if frecuencia == "mensual", let dm = rc?.diaMes { o["diaMes"] = .number(String(dm)) }
            if frecuencia == "intervalo" {
                o["intervaloDias"] = .number(String(max(2, rc?.cada ?? 2)))
                o["intervaloInicio"] = .string(r.fechaDicha ? r.fecha : hoy)
            }
            if !r.hora.isEmpty { o["hora"] = .string(r.hora) }
            ops.append(.anadirEnLista(clave: "recurringTasks", id: rid, json: json(o)))
            deshacer = ["tipo": .string("recurrente"), "id": .string(rid)]
        case "clase":
            let dias = r.recurrencia?.dias ?? []
            guard !dias.isEmpty else { return falla("faltan los días") }
            guard !r.hora.isEmpty else { return falla("falta la hora") }
            let schedule = v("studies")?["schedule"]
            var bloques: [JSONValue] = []
            for d in dias {
                guard let k = diaClave[d] else { continue }
                if (schedule?[k]?.lista ?? []).contains(where: { $0["time"]?.texto == r.hora && $0["subject"]?.texto == titulo }) { continue }
                ops.append(.anadirClase(dia: k, hora: r.hora, texto: titulo))
                bloques.append(.object(["dia": .string(k), "time": .string(r.hora), "subject": .string(titulo)]))
            }
            guard !bloques.isEmpty else { return falla("ya estaba en el horario") }
            deshacer = ["tipo": .string("clase"), "bloques": .array(bloques)]
        case "viaje":
            guard !titulo.isEmpty else { return falla("falta el destino") }
            let eid = id("ap_viaje", ahora)
            let o: [String: JSONValue] = ["id": .string(eid), "type": .string("travel"), "categoryId": .string("cat_viaje"), "tags": .array([]),
                                          "title": .string("Viaje a " + titulo), "destination": .string(titulo), "startDate": .string(r.fecha),
                                          "endDate": .string(r.fechaFin.isEmpty ? r.fecha : r.fechaFin), "date": .string(r.fecha)]
            ops.append(.anadirEnLista(clave: "entries", id: eid, json: json(o)))
            deshacer = ["tipo": .string("evento"), "eventoId": .string(eid)]
        case let t where ocio[t] != nil:
            guard !titulo.isEmpty, let tipoEntrada = ocio[t] else { return falla("falta el título") }
            let eid = id("ap_ocio", ahora)
            var o: [String: JSONValue] = ["id": .string(eid), "type": .string(tipoEntrada), "categoryId": .string(categoriaOcio[tipoEntrada]!), "tags": .array([]), "date": .string("")]
            if tipoEntrada == "movie" {
                o["date"] = .string(hoy); o["rating"] = .number("0"); o["notes"] = .string("")
            } else {
                o["status"] = .string(["book": "Leyendo", "series": "Viendo", "game": "Jugando"][tipoEntrada]!)
                o["startDate"] = .string(hoy); o["date"] = .string(hoy); o["endDate"] = .string(""); o["rating"] = .number("0")
            }
            o["title"] = .string(titulo)
            ops.append(.anadirEnLista(clave: "entries", id: eid, json: json(o)))
            deshacer = ["tipo": .string("evento"), "eventoId": .string(eid)]
        default:
            guard !titulo.isEmpty else { return falla("falta qué es") }
            let diaPlan = madrid.diaLogico(ahora).iso
            if tipo == "tarea", let n = diasEntre(diaPlan, r.fecha), (0...2).contains(n) {
                let tid = id("planner", ahora)
                ops.append(.crearTarea(id: tid, dia: r.fecha, titulo: r.lugar.isEmpty ? titulo : "\(titulo) en \(r.lugar)", hora: r.hora.isEmpty ? nil : r.hora))
                deshacer = ["tipo": .string("tarea"), "tareaId": .string(tid)]
            } else {
                let eid = id("evt", ahora)
                let o: [String: JSONValue] = ["id": .string(eid), "type": .string("event"), "categoryId": .string("cat_evento"), "tags": .array([]),
                                              "eventType": .string(!r.eventoTipo.isEmpty ? r.eventoTipo : (r.estudio != nil ? "estudios" : "otro")),
                                              "title": .string(titulo), "date": .string(r.fecha), "time": .string(r.hora), "place": .string(r.lugar),
                                              "notes": .string(r.horaFin.isEmpty ? "" : "hasta las \(r.horaFin)")]
                ops.append(.anadirEnLista(clave: "entries", id: eid, json: json(o)))
                deshacer = ["tipo": .string("evento"), "eventoId": .string(eid)]
            }
        }
        let registro: [String: JSONValue] = ["id": .string(apunteId), "cuando": .string(ISO8601DateFormatter.conMs.string(from: ahora)),
                                             "texto": .string(a.texto.trimmingCharacters(in: .whitespacesAndNewlines)), "tipo": .string(tipo),
                                             "resumen": .string(aviso), "deshacer": .object(deshacer)]
        ops.append(.registrarApunte(json: json(registro)))
        return .success(ApunteCreado(ops: ops, aviso: aviso))
    }
}

struct ErrorApunte: Error, Equatable { let motivo: String }

enum Normal {
    // apuntarNorm: minúsculas y sin tildes.
    static func norm(_ t: String) -> String { t.lowercased().folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_ES")) }
}

extension ISO8601DateFormatter {
    // Como toISOString() de JavaScript.
    static let conMs: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()
}
