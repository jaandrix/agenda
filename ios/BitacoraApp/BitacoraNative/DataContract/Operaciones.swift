import Foundation

// Cambios pequeños y con significado, no documentos. Se guardan en la cola antes de enseñarse y, al subir, se vuelven
// a aplicar sobre lo último de la nube (no sobre la copia vieja): así respetan lo que la web o el conector cambiaron
// entretanto. Todas son idempotentes: aplicarlas dos veces da lo mismo que una, y por eso repetir una subida cuya
// respuesta se perdió no duplica nada.
enum OperacionBitacora: Codable, Sendable, Equatable {
    // dia nil = pendientes sin día (backlog).
    case crearTarea(id: String, dia: String?, titulo: String, hora: String?)
    case marcarTarea(id: String, hecha: Bool, momentoMs: Int64)
    case editarTarea(id: String, titulo: String, hora: String?, notas: String)
    case moverTarea(id: String, dia: String?)
    case borrarTarea(id: String)
    case marcarRecurrente(id: String, dia: String, hecha: Bool, momentoMs: Int64)
    case guardarEvento(id: String, fecha: String, hora: String?, titulo: String, lugar: String, notas: String)
    case borrarEntrada(id: String)
    case marcarRutina(id: String, dia: String, hecha: Bool)
    case crearNota(id: String, dia: String, texto: String, creada: String)
    // importe en texto decimal («12.50»): el dinero nunca pasa por Double.
    case crearMovimiento(id: String, tipo: String, importe: String, cuenta: String, categoria: String?, fecha: String, hora: String, concepto: String)

    var claves: [String] {
        switch self {
        case .marcarRecurrente: return ["recurringTasks", "entries"]
        case .guardarEvento, .borrarEntrada: return ["entries"]
        case .crearMovimiento: return ["financePro"]
        case .marcarRutina: return ["habits"]
        case .crearNota: return ["notes"]
        default: return ["dayPlanner"]
        }
    }

    // Mismo formato que la web (`planner_<ms>_<azar>`, `backlog_...`), para que nada distinga de dónde salió.
    static func nuevoIdTarea(sinDia: Bool = false, ahora: Date = Date()) -> String {
        let letras = "abcdefghijklmnopqrstuvwxyz0123456789"
        return (sinDia ? "backlog_" : "planner_") + "\(Int64(ahora.timeIntervalSince1970 * 1000))_" + String((0..<5).map { _ in letras.randomElement()! })
    }

    static func nuevoIdNota(ahora: Date = Date()) -> String { "note_\(Int64(ahora.timeIntervalSince1970 * 1000))" }

    static func nuevoIdMovimiento(ahora: Date = Date()) -> String {
        let letras = "abcdefghijklmnopqrstuvwxyz0123456789"
        return "ptx_q_\(Int64(ahora.timeIntervalSince1970 * 1000))_" + String((0..<5).map { _ in letras.randomElement()! })
    }

    static func nuevoIdEntrada(ahora: Date = Date()) -> String {
        let letras = "abcdefghijklmnopqrstuvwxyz0123456789"
        return "entry_\(Int64(ahora.timeIntervalSince1970 * 1000))_" + String((0..<6).map { _ in letras.randomElement()! })
    }
}

struct OperacionPendiente: Codable, Sendable, Equatable, Identifiable {
    let id: UUID
    let dispositivo: String
    let creada: Date
    let versionContrato: Int
    let operacion: OperacionBitacora

    init(_ operacion: OperacionBitacora, dispositivo: String = Dispositivo.id, creada: Date = Date()) {
        id = UUID()
        self.dispositivo = dispositivo
        self.creada = creada
        versionContrato = ContratoDatos.version
        self.operacion = operacion
    }
}

enum AplicarOperaciones {
    // Aplica las operaciones sobre un documento y devuelve el resultado y el parche (solo las claves que cambian).
    static func sobre(_ doc: DocumentoBitacora, _ ops: [OperacionBitacora]) -> (DocumentoBitacora, [String: JSONValue]) {
        var valores: [String: JSONValue?] = [:]
        var originales: [String: JSONValue?] = [:]
        for op in ops {
            for k in op.claves where originales[k] == nil {
                let v: JSONValue? = (try? doc.valor(de: k)) ?? nil
                originales[k] = .some(v)
                valores[k] = .some(v)
            }
            valores = aplicar(op, a: valores)
        }
        var parche: [String: JSONValue] = [:]
        for (k, v) in valores { if let v = v ?? nil, v != (originales[k] ?? nil) { parche[k] = v } }
        return (parche.isEmpty ? doc : doc.aplicandoParche(parche), parche)
    }

    static func aplicar(_ op: OperacionBitacora, a valores: [String: JSONValue?]) -> [String: JSONValue?] {
        var r = valores
        switch op {
        case let .marcarRecurrente(id, dia, hecha, momento):
            let (rec, ent) = marcarRecurrente(id: id, dia: dia, hecha: hecha, momento: momento, recurrentes: valores["recurringTasks"] ?? nil, entradas: valores["entries"] ?? nil)
            r["recurringTasks"] = .some(rec)
            r["entries"] = .some(ent)
        case .guardarEvento, .borrarEntrada:
            r["entries"] = .some(entradas(op, valores["entries"] ?? nil))
        case let .marcarRutina(id, dia, hecha):
            // toggleHabitToday (js/planificador.js): completadas[dia] = true o se borra; con pasos, todos hechos o ninguno.
            guard var lista = (valores["habits"] ?? nil)?.lista, let n = lista.firstIndex(where: { $0["id"]?.comoId == id }), var h = lista[n].objeto else { break }
            var hechas = h["completadas"]?.objeto ?? [:]
            if hecha { hechas[dia] = .bool(true) } else { hechas.removeValue(forKey: dia) }
            h["completadas"] = .object(hechas)
            if let pasos = h["pasos"]?.lista, !pasos.isEmpty {
                var ph = h["pasosHechos"]?.objeto ?? [:]
                if hecha { ph[dia] = .array(pasos.indices.map { .number(String($0)) }) } else { ph.removeValue(forKey: dia) }
                h["pasosHechos"] = .object(ph)
            }
            lista[n] = .object(h)
            r["habits"] = .some(.array(lista))
        case let .crearNota(id, dia, texto, creada):
            var lista = (valores["notes"] ?? nil)?.lista ?? []
            if lista.contains(where: { $0["id"]?.comoId == id }) { break }
            lista.append(.object(["id": .string(id), "date": .string(dia), "content": .string(texto), "createdAt": .string(creada)]))
            r["notes"] = .some(.array(lista))
        case let .crearMovimiento(id, tipo, importe, cuenta, categoria, fecha, hora, concepto):
            // Como el registro rápido de la web (ptx_q_, manual): solo añade, y no lo repite si el id ya está.
            guard var pro = (valores["financePro"] ?? nil)?.objeto, let d = Dinero.decimal(texto: importe), d > 0,
                  tipo == "income" || tipo == "expense" else { break }
            var lista = pro["transactions"]?.lista ?? []
            if lista.contains(where: { $0["id"]?.comoId == id }) { break }
            var t: [String: JSONValue] = ["id": .string(id), "date": .string(fecha), "hora": .string(hora), "account": .string(cuenta),
                                          "type": .string(tipo), "amount": .number(NSDecimalNumber(decimal: Dinero.redondeado(d)).stringValue), "manual": .bool(true)]
            if let categoria { t["category"] = .string(categoria) }
            if !concepto.isEmpty { t["note"] = .string(concepto) }
            lista.append(.object(t))
            pro["transactions"] = .array(lista)
            r["financePro"] = .some(.object(pro))
        default:
            r["dayPlanner"] = .some(aplicar(op, a: valores["dayPlanner"] ?? nil))
        }
        return r
    }

    // Operaciones del planificador sobre `dayPlanner`.
    static func aplicar(_ op: OperacionBitacora, a valor: JSONValue?) -> JSONValue {
        var p = planificador(valor)
        switch op {
        case let .crearTarea(id, dia, titulo, hora):
            if buscar(id, en: p) != nil { return valor ?? .object(p) }
            if let dia {
                _ = poner(["id": .string(id), "time": .string(hora ?? ""), "title": .string(titulo), "notes": .string(""), "done": .bool(false)], en: dia, de: &p)
            } else {
                var lista = p["backlog"]?.lista ?? []
                lista.insert(.object(["id": .string(id), "title": .string(titulo), "notes": .string(""), "done": .bool(false)]), at: 0)
                p["backlog"] = .array(lista)
            }
            return .object(p)

        case let .marcarTarea(id, hecha, momento):
            // Borrada en otro sitio mientras esperaba: no se resucita.
            guard var sitio = buscar(id, en: p) else { return valor ?? .object(p) }
            // Si sigue en un día pasado, primero se trae a hoy como haría arrastrarPlanner en la web al abrirse.
            let hoy = CalendarioBitacora.madrid.diaLogico(Date(timeIntervalSince1970: Double(momento) / 1000)).iso
            if case let .dia(dia, _) = sitio, dia < hoy, var t = quitar(sitio, de: &p) {
                t["arrastrado"] = .bool(true)
                sitio = poner(t, en: hoy, de: &p)
            }
            cambiar(sitio, en: &p) { t in
                t["done"] = .bool(hecha)
                if hecha { t["hechaEn"] = .number(String(momento)) } else { t.removeValue(forKey: "hechaEn") }
            }
            return .object(p)

        case let .editarTarea(id, titulo, hora, notas):
            guard let sitio = buscar(id, en: p) else { return valor ?? .object(p) }
            cambiar(sitio, en: &p) { t in
                t["title"] = .string(titulo)
                t["notes"] = .string(notas)
                if case .dia = sitio { t["time"] = .string(hora ?? "") }
            }
            return .object(p)

        case let .moverTarea(id, dia):
            guard let sitio = buscar(id, en: p) else { return valor ?? .object(p) }
            if case let .dia(actual, _) = sitio, actual == dia { return valor ?? .object(p) }
            if case .pendiente = sitio, dia == nil { return valor ?? .object(p) }
            guard var t = quitar(sitio, de: &p) else { return valor ?? .object(p) }
            t.removeValue(forKey: "arrastrado")
            if let dia {
                if t["time"] == nil { t["time"] = .string("") }
                _ = poner(t, en: dia, de: &p)
            } else {
                t.removeValue(forKey: "time")
                var lista = p["backlog"]?.lista ?? []
                lista.insert(.object(t), at: 0)
                p["backlog"] = .array(lista)
            }
            return .object(p)

        case let .borrarTarea(id):
            guard let sitio = buscar(id, en: p) else { return valor ?? .object(p) }
            _ = quitar(sitio, de: &p)
            return .object(p)

        case .marcarRecurrente, .guardarEvento, .borrarEntrada, .crearMovimiento, .marcarRutina, .crearNota:
            return valor ?? .object(p)
        }
    }

    // Crear o editar un evento cambia solo sus campos de formulario: lo demás (entradas con QR, personas, aviso...) se
    // conserva. Borrar quita la entrada por id, como deleteEntry en la web.
    static func entradas(_ op: OperacionBitacora, _ valor: JSONValue?) -> JSONValue? {
        var lista = valor?.lista ?? []
        switch op {
        case let .guardarEvento(id, fecha, hora, titulo, lugar, notas):
            let campos: [String: JSONValue] = ["date": .string(fecha), "time": .string(hora ?? ""), "title": .string(titulo),
                                               "place": .string(lugar), "notes": .string(notas)]
            if let n = lista.firstIndex(where: { $0["id"]?.comoId == id }) {
                guard var e = lista[n].objeto else { return valor }
                campos.forEach { e[$0.key] = $0.value }
                lista[n] = .object(e)
            } else {
                var e = campos
                e["id"] = .string(id)
                e["type"] = .string("event")
                e["eventType"] = .string("otro")
                e["categoryId"] = .string("cat_evento")
                lista.append(.object(e))
            }
        case let .borrarEntrada(id):
            guard lista.contains(where: { $0["id"]?.comoId == id }) else { return valor }
            lista.removeAll { $0["id"]?.comoId == id }
        default:
            return valor
        }
        return .array(lista)
    }

    // toggleRecurringTaskDoneToday (js/planificador.js): `completadas[dia]`, `hechaEn` y la entrada de calendario
    // «Completado: ...» con id `recurring_done_<id>_<dia>`.
    static func marcarRecurrente(id: String, dia: String, hecha: Bool, momento: Int64, recurrentes: JSONValue?, entradas: JSONValue?) -> (JSONValue?, JSONValue?) {
        guard var lista = recurrentes?.lista, let n = lista.firstIndex(where: { $0["id"]?.comoId == id }), var t = lista[n].objeto else {
            return (recurrentes, entradas)
        }
        var completadas = t["completadas"]?.objeto ?? [:]
        completadas[dia] = .bool(hecha)
        if hecha {
            t["hechaEn"] = .object(["dia": .string(dia), "cuando": .number(String(momento))])
        } else {
            t.removeValue(forKey: "hechaEn")
        }
        t["completadas"] = .object(completadas)
        lista[n] = .object(t)
        let idEntrada = "recurring_done_\(id)_\(dia)"
        var ent = (entradas?.lista ?? []).filter { $0["id"]?.comoId != idEntrada }
        if hecha {
            ent.append(.object(["id": .string(idEntrada), "type": .string("event"), "eventType": .string("otro"),
                                "title": .string("Completado: " + (t["texto"]?.texto ?? "")), "date": .string(dia), "time": .string(""),
                                "place": .string(""), "notes": .string("Tarea recurrente"), "category": .string("Tareas recurrentes"),
                                "calendarLog": .bool(true)]))
        }
        return (.array(lista), .array(ent))
    }

    // migratePlannerData (js/planificador.js): el formato viejo { dayKey, items } pasa a { days, backlog }.
    static func planificador(_ v: JSONValue?) -> [String: JSONValue] {
        var p = v?.objeto ?? [:]
        if p["days"]?.objeto == nil {
            var dias: [String: JSONValue] = [:]
            if let items = p["items"]?.lista, !items.isEmpty, let dia = p["dayKey"]?.texto { dias[dia] = .array(items) }
            p["days"] = .object(dias)
            p.removeValue(forKey: "items")
            p.removeValue(forKey: "dayKey")
        }
        if p["backlog"]?.lista == nil { p["backlog"] = .array([]) }
        return p
    }

    enum Sitio { case dia(String, Int), pendiente(Int) }

    static func buscar(_ id: String, en p: [String: JSONValue]) -> Sitio? {
        for (dia, lista) in p["days"]?.objeto ?? [:] {
            if let n = lista.lista?.firstIndex(where: { $0["id"]?.comoId == id }) { return .dia(dia, n) }
        }
        if let n = p["backlog"]?.lista?.firstIndex(where: { $0["id"]?.comoId == id }) { return .pendiente(n) }
        return nil
    }

    private static func quitar(_ sitio: Sitio, de p: inout [String: JSONValue]) -> [String: JSONValue]? {
        switch sitio {
        case let .dia(dia, n):
            var dias = p["days"]?.objeto ?? [:]
            var lista = dias[dia]?.lista ?? []
            guard lista.indices.contains(n) else { return nil }
            let t = lista.remove(at: n).objeto ?? [:]
            dias[dia] = .array(lista)
            p["days"] = .object(dias)
            return t
        case let .pendiente(n):
            var lista = p["backlog"]?.lista ?? []
            guard lista.indices.contains(n) else { return nil }
            let t = lista.remove(at: n).objeto ?? [:]
            p["backlog"] = .array(lista)
            return t
        }
    }

    private static func poner(_ t: [String: JSONValue], en dia: String, de p: inout [String: JSONValue]) -> Sitio {
        var dias = p["days"]?.objeto ?? [:]
        var lista = dias[dia]?.lista ?? []
        lista.append(.object(t))
        dias[dia] = .array(lista)
        p["days"] = .object(dias)
        return .dia(dia, lista.count - 1)
    }

    private static func cambiar(_ sitio: Sitio, en p: inout [String: JSONValue], _ f: (inout [String: JSONValue]) -> Void) {
        switch sitio {
        case let .dia(dia, n):
            var dias = p["days"]!.objeto!
            var lista = dias[dia]!.lista!
            var t = lista[n].objeto ?? [:]
            f(&t)
            lista[n] = .object(t)
            dias[dia] = .array(lista)
            p["days"] = .object(dias)
        case let .pendiente(n):
            var lista = p["backlog"]!.lista!
            var t = lista[n].objeto ?? [:]
            f(&t)
            lista[n] = .object(t)
            p["backlog"] = .array(lista)
        }
    }
}
