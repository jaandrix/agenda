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
    // Solo los campos que el usuario cambió («title», «time», «notes», «date», «place»): lo demás queda como esté en la nube.
    case parcharTarea(id: String, campos: [String: String])
    case parcharEvento(id: String, campos: [String: String])
    case marcarRutina(id: String, dia: String, hecha: Bool)
    case crearNota(id: String, dia: String, texto: String, creada: String)
    // importe en texto decimal («12.50»): el dinero nunca pasa por Double.
    case crearMovimiento(id: String, tipo: String, importe: String, cuenta: String, categoria: String?, fecha: String, hora: String, concepto: String)
    // CONTRATO-ESTUDIOS-PROYECTOS.md. Solo trabajos: en los exámenes la web no usa `done`.
    case marcarTrabajo(asignaturaId: String, id: String, hecho: Bool, momentoMs: Int64)
    // lista: "exams" o "assignments".
    case crearEntrega(asignaturaId: String, lista: String, id: String, titulo: String, fecha: String?, hora: String?)
    case estadoTareaProyecto(proyectoId: String, tareaId: String, estado: String)
    case proyectoAHoy(proyectoId: String, tareaId: String, idTarea: String, dia: String)
    // calendario.js (elegir ciudad del tiempo): `ciudadTiempo` = { nombre, lat, lon }. lat y lon en texto decimal.
    case ponerCiudadTiempo(nombre: String, lat: String, lon: String)
    // Finanzas: editar solo los campos del formulario (lo demás del movimiento queda como esté en la nube), borrar uno
    // y traspasar entre cuentas propias (type transfer + transferTo, como financeProEmparejarTraspasos).
    case editarMovimiento(id: String, importe: String, concepto: String, categoria: String?, fecha: String, cuenta: String, destino: String?)
    case borrarMovimiento(id: String)
    // Estudios: editar un examen o trabajo (título, fecha, hora, nota y peso; "" deja la nota o el peso vacíos) y
    // mantener su `evt_` como syncExamCalendarEvent; borrar como removeSubjectItem (con su evento y su tarea del plan).
    case editarItemEstudio(asignaturaId: String, lista: String, id: String, titulo: String, fecha: String?, hora: String?, nota: String, peso: String)
    case borrarItemEstudio(asignaturaId: String, lista: String, id: String)
    // Proyectos (js/proyecto.js): crear uno y cambiar su gestor (tareas, siguiente paso, colina, fases y diario).
    case crearProyecto(id: String, titulo: String, fecha: String)
    case cambiarProyecto(proyectoId: String, cambio: CambioProyecto)
    case crearTraspaso(id: String, importe: String, desde: String, hacia: String, fecha: String, hora: String, concepto: String)
    // transporte.js: trAlternarFavorita y trAlternarLinea, dentro de `servicios.transporte` (clave «bus:688»).
    case transporteFavorita(clave: String, activa: Bool)
    case transporteLinea(clave: String, linea: String, activa: Bool)
    // Apuntar (js/apuntar.js, apuntarCrear). `json` es el objeto ya construido, en texto: entradas (evento, cumpleaños,
    // viaje, ocio) y tareas recurrentes. Solo se añade si su id no está.
    case anadirEnLista(clave: String, id: String, json: String)
    // compraAnadir: cada texto pasa por compraInterpretar; lo que ya está sin marcar no se repite. Crea la lista «Casa»
    // con `listaId` si no hay ninguna.
    case anadirCompra(listaId: String, textos: [String], ids: [String])
    // A la nota del día, sin pisar lo que tenga. `apunteId` evita añadirlo dos veces al reaplicar.
    case anadirANota(id: String, dia: String, texto: String, creada: String, apunteId: String)
    // studies.schedule[dia] (clave «lun», «mar»...), como la op `clase` del conector.
    case anadirClase(dia: String, hora: String, texto: String)
    // apuntesRecientes: el registro (los últimos 40) y deshacer lo que creó uno, que queda marcado `deshecho`.
    case registrarApunte(json: String)
    case deshacerApunte(id: String)

    var claves: [String] {
        switch self {
        case .marcarRecurrente: return ["recurringTasks", "entries"]
        // Como togglePlannerItemDone: también el trabajo de Estudios, la tarea del proyecto y la marca «Completado».
        case .marcarTarea: return ["dayPlanner", "entries", "studies"]
        case .parcharEvento: return ["entries"]
        case .guardarEvento, .borrarEntrada: return ["entries"]
        case .crearMovimiento, .editarMovimiento, .borrarMovimiento, .crearTraspaso: return ["financePro"]
        case .editarItemEstudio: return ["studies", "entries", "dayPlanner"]
        case .crearProyecto, .cambiarProyecto: return ["entries"]
        case .borrarItemEstudio: return ["studies", "entries", "dayPlanner"]
        case .marcarRutina: return ["habits"]
        case .crearNota: return ["notes"]
        case .marcarTrabajo: return ["studies", "dayPlanner"]
        case .crearEntrega: return ["studies", "entries", "dayPlanner"]
        case .estadoTareaProyecto: return ["entries"]
        case .proyectoAHoy: return ["entries", "dayPlanner"]
        case .ponerCiudadTiempo: return ["ciudadTiempo"]
        case .transporteFavorita, .transporteLinea: return ["servicios"]
        case let .anadirEnLista(clave, _, _): return [clave]
        case .anadirCompra: return ["listaCompra"]
        case .anadirANota: return ["notes", "apuntesRecientes"]
        case .anadirClase: return ["studies"]
        case .registrarApunte: return ["apuntesRecientes"]
        case .deshacerApunte: return ["apuntesRecientes", "dayPlanner", "entries", "financePro", "listaCompra", "notes", "studies", "recurringTasks"]
        default: return ["dayPlanner"]
        }
    }

    static func esProyecto(_ op: OperacionBitacora) -> Bool {
        switch op { case .crearProyecto, .cambiarProyecto: return true; default: return false }
    }

    // proyId de la web: prefijo, la hora en base 36 y cuatro letras.
    static func nuevoIdProyecto(_ prefijo: String, ahora: Date = Date()) -> String {
        let letras = "abcdefghijklmnopqrstuvwxyz0123456789"
        return prefijo + "_" + String(Int64(ahora.timeIntervalSince1970 * 1000), radix: 36) + String((0..<4).map { _ in letras.randomElement()! })
    }

    // Mismo formato que la web (`planner_<ms>_<azar>`, `backlog_...`), para que nada distinga de dónde salió.
    static func nuevoIdTarea(sinDia: Bool = false, ahora: Date = Date()) -> String {
        let letras = "abcdefghijklmnopqrstuvwxyz0123456789"
        return (sinDia ? "backlog_" : "planner_") + "\(Int64(ahora.timeIntervalSince1970 * 1000))_" + String((0..<5).map { _ in letras.randomElement()! })
    }

    static func nuevoIdItem(ahora: Date = Date()) -> String {
        let letras = "abcdefghijklmnopqrstuvwxyz0123456789"
        return "item_\(Int64(ahora.timeIntervalSince1970 * 1000))_" + String((0..<4).map { _ in letras.randomElement()! })
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

enum CambioProyecto: Codable, Sendable, Equatable {
    case anadirTarea(id: String, texto: String, faseId: String?)
    case editarTarea(id: String, texto: String)
    case borrarTarea(id: String)
    case siguiente(id: String?)
    case colina(String)
    case anadirFase(id: String, nombre: String, fecha: String)
    case faseHecha(id: String, hecha: Bool)
    case apuntar(id: String, fecha: String, texto: String)
    case quitarApunte(id: String)
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
        case .guardarEvento, .borrarEntrada, .parcharEvento:
            r["entries"] = .some(entradas(op, valores["entries"] ?? nil))
        case let .marcarTarea(id, hecha, momento):
            let planner = aplicar(op, a: valores["dayPlanner"] ?? nil)
            r["dayPlanner"] = .some(planner)
            guard let sitio = buscar(id, en: planificador(planner)), let t = tareaEn(sitio, planificador(planner)) else { break }
            let hoy = CalendarioBitacora.madrid.dia(de: Date(timeIntervalSince1970: Double(momento) / 1000)).iso
            var lista = (valores["entries"] ?? nil)?.lista ?? []
            let marca = "planner_done_\(id)"
            lista.removeAll { $0["id"]?.comoId == marca }
            if hecha {
                lista.append(.object(["id": .string(marca), "type": .string("event"), "eventType": .string("otro"),
                                      "title": .string("Completado: " + (t["title"]?.texto ?? "")), "date": .string(hoy),
                                      "time": .string(t["time"]?.texto ?? ""), "place": .string(""), "notes": .string(t["notes"]?.texto ?? ""),
                                      "category": .string("Planificador"), "calendarLog": .bool(true)]))
            }
            // proyectoTareaDesdePlanner (js/proyecto.js).
            if let pid = t["proyectoId"]?.comoId, let tid = t["proyectoTareaId"]?.comoId {
                _ = cambiarTareaProyecto(&lista, pid, tid) { pt, _ in pt["estado"] = .string(hecha ? "hecha" : "curso") }
            }
            r["entries"] = .some(.array(lista))
            // El trabajo de Estudios guarda si está hecho: es lo que sobrevive cuando la tarea del día se archiva.
            if let aid = t["linkedAssignmentId"]?.comoId, var st = (valores["studies"] ?? nil)?.objeto, var asig = st["subjects"]?.lista {
                outer: for i in asig.indices {
                    guard var s = asig[i].objeto, var trabajos = s["assignments"]?.lista else { continue }
                    if let j = trabajos.firstIndex(where: { $0["id"]?.comoId == aid }), var w = trabajos[j].objeto {
                        w["done"] = .bool(hecha)
                        trabajos[j] = .object(w)
                        s["assignments"] = .array(trabajos)
                        asig[i] = .object(s)
                        st["subjects"] = .array(asig)
                        r["studies"] = .some(.object(st))
                        break outer
                    }
                }
            }
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
        case let .editarMovimiento(id, importe, concepto, categoria, fecha, cuenta, destino):
            guard var pro = (valores["financePro"] ?? nil)?.objeto, var lista = pro["transactions"]?.lista,
                  let n = lista.firstIndex(where: { $0["id"]?.comoId == id }), var t = lista[n].objeto,
                  let d = Dinero.decimal(texto: importe), d > 0 else { break }
            let cifra = NSDecimalNumber(decimal: Dinero.redondeado(d)).stringValue
            if Dinero.decimal(t["amount"]) != Dinero.redondeado(d) { t["amount"] = .number(cifra) }
            let antes = [t["note"], t["description"], t["concepto"]].compactMap { $0?.texto }.first { !$0.isEmpty } ?? ""
            if concepto != antes { t["note"] = .string(concepto) }
            if t["date"]?.texto != fecha { t["date"] = .string(fecha) }
            if t["account"]?.texto != cuenta { t["account"] = .string(cuenta) }
            if t["type"]?.texto == "transfer" {
                // Un traspaso a la misma cuenta no tiene sentido: la edición entera se rechaza.
                if let destino, destino == cuenta { break }
                if let destino, t["transferTo"]?.texto != destino { t["transferTo"] = .string(destino) }
            } else if let categoria {
                if t["category"]?.texto != categoria { t["category"] = .string(categoria) }
                t.removeValue(forKey: "needsReview")
            } else {
                // Sin categoría vuelve a «ajustar movimientos», como el registro rápido.
                t.removeValue(forKey: "category")
                t["needsReview"] = .bool(true)
            }
            lista[n] = .object(t)
            pro["transactions"] = .array(lista)
            r["financePro"] = .some(.object(pro))
        case let .editarItemEstudio(aid, listaK, id, titulo, fecha, hora, nota, peso):
            guard var st = (valores["studies"] ?? nil)?.objeto, var asig = st["subjects"]?.lista,
                  let ij = buscarItem(asig, aid, listaK, id), var s = asig[ij.0].objeto,
                  var items = s[listaK]?.lista, var x = items[ij.1].objeto else { break }
            let cifra = { (t: String) -> JSONValue in
                let limpio = t.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
                return limpio.isEmpty || Double(limpio) == nil ? .string("") : .number(limpio)
            }
            let cambios: [String: JSONValue] = ["title": .string(titulo), "date": .string(fecha ?? ""), "time": .string(hora ?? ""),
                                                "grade": cifra(nota), "weight": cifra(peso)]
            for (k, v) in cambios where x[k] != v {
                // Sin hora y sin la clave en la nube: no se añade «time» vacío.
                if k == "time", v == .string(""), x[k] == nil { continue }
                x[k] = v
            }
            items[ij.1] = .object(x)
            s[listaK] = .array(items)
            asig[ij.0] = .object(s)
            st["subjects"] = .array(asig)
            r["studies"] = .some(.object(st))
            var lista = (valores["entries"] ?? nil)?.lista ?? []
            let enlazada = lista.firstIndex { $0["linkedItemId"]?.comoId == id }
            if let f = fecha, !f.isEmpty {
                let t = "\(listaK == "exams" ? "Examen" : "Entrega"): \(titulo.isEmpty ? "Sin título" : titulo) (\(s["name"]?.texto ?? ""))"
                if let e = enlazada, var o = lista[e].objeto {
                    o["title"] = .string(t); o["date"] = .string(f); o["time"] = .string(hora ?? "")
                    lista[e] = .object(o)
                } else {
                    lista.append(.object(["id": .string("evt_" + id), "type": .string("event"), "eventType": .string("otro"), "title": .string(t),
                                          "date": .string(f), "time": .string(hora ?? ""), "notes": .string(""), "linkedItemId": .string(id),
                                          "linkedSubjectId": .string(aid), "linkedKind": .string(listaK)]))
                }
            } else if let e = enlazada {
                lista.remove(at: e)
            }
            r["entries"] = .some(.array(lista))
            // syncAssignmentPlannerItem: la tarea del plan se rehace con la fecha, el título y la hora nuevos.
            if listaK == "assignments" {
                var p = planificador(valores["dayPlanner"] ?? nil)
                let pid = "planner_assign_" + id
                let sitio = buscar(pid, en: p)
                let existente = sitio.flatMap { tareaEn($0, p) }
                let fechaN = x["date"]?.texto ?? ""
                if fechaN.isEmpty || x["fueraDelPlanificador"]?.booleano == true {
                    if let sitio { _ = quitar(sitio, de: &p) }
                } else {
                    let horaN = [x["time"]?.texto, existente?["time"]?.texto].compactMap { $0 }.first { !$0.isEmpty } ?? "23:59"
                    let nombre = s["name"]?.texto ?? ""
                    let deseada: [String: JSONValue] = ["id": .string(pid), "time": .string(horaN),
                                                        "title": .string("trabajo pendiente. " + (titulo.isEmpty ? "Sin título" : titulo)),
                                                        "notes": .string(nombre.isEmpty ? "" : "Asignatura: " + nombre),
                                                        "done": .bool(x["done"]?.booleano == true), "arrastrado": .bool(false), "linkedAssignmentId": .string(id)]
                    var igual = false
                    if case let .dia(d, _)? = sitio, d == fechaN, existente == deseada { igual = true }
                    if !igual {
                        if let sitio { _ = quitar(sitio, de: &p) }
                        _ = poner(deseada, en: fechaN, de: &p)
                    }
                }
                r["dayPlanner"] = .some(.object(p))
            }
        case let .borrarItemEstudio(aid, listaK, id):
            guard var st = (valores["studies"] ?? nil)?.objeto, var asig = st["subjects"]?.lista,
                  let ij = buscarItem(asig, aid, listaK, id), var s = asig[ij.0].objeto, var items = s[listaK]?.lista else { break }
            items.remove(at: ij.1)
            s[listaK] = .array(items)
            asig[ij.0] = .object(s)
            st["subjects"] = .array(asig)
            r["studies"] = .some(.object(st))
            var lista = (valores["entries"] ?? nil)?.lista ?? []
            lista.removeAll { $0["linkedItemId"]?.comoId == id }
            r["entries"] = .some(.array(lista))
            if listaK == "assignments" {
                r["dayPlanner"] = .some(aplicar(.borrarTarea(id: "planner_assign_" + id), a: valores["dayPlanner"] ?? nil))
            }
        case let .crearProyecto(id, titulo, fecha):
            var lista = (valores["entries"] ?? nil)?.lista ?? []
            if lista.contains(where: { $0["id"]?.comoId == id }) { break }
            var p: [String: JSONValue] = ["id": .string(id), "type": .string("project"), "title": .string(titulo), "tags": .array([]), "date": .string(fecha),
                                          "notes": .string(""), "status": .string("Pendiente"), "tareas": .array([]), "fases": .array([]),
                                          "diario": .array([]), "tasks": .array([])]
            // getCategoryIdForType('project'): la categoría que ya usan los demás proyectos.
            if let cat = lista.first(where: { $0["type"]?.texto == "project" && $0["categoryId"] != nil })?["categoryId"] { p["categoryId"] = cat }
            lista.append(.object(p))
            r["entries"] = .some(.array(lista))
        case let .cambiarProyecto(pid, cambio):
            var lista = (valores["entries"] ?? nil)?.lista ?? []
            guard let n = lista.firstIndex(where: { $0["id"]?.comoId == pid && $0["type"]?.texto == "project" }),
                  var p = lista[n].objeto.map(proyectoNormalizado) else { break }
            var tareas = p["tareas"]?.lista ?? [], fases = p["fases"]?.lista ?? [], diario = p["diario"]?.lista ?? []
            let cambiarTarea = { (tid: String, f: (inout [String: JSONValue]) -> Void) in
                if let m = tareas.firstIndex(where: { $0["id"]?.comoId == tid }), var t = tareas[m].objeto { f(&t); tareas[m] = .object(t) }
            }
            switch cambio {
            case let .anadirTarea(id, texto, faseId):
                if !tareas.contains(where: { $0["id"]?.comoId == id }) {
                    tareas.append(.object(["id": .string(id), "texto": .string(texto), "estado": .string("pendiente"), "faseId": faseId.map { .string($0) } ?? .null]))
                }
            case let .editarTarea(tid, texto):
                cambiarTarea(tid) { $0["texto"] = .string(texto) }
            case let .borrarTarea(tid):
                tareas.removeAll { $0["id"]?.comoId == tid }
                if p["siguienteId"]?.comoId == tid { p.removeValue(forKey: "siguienteId") }
            case let .siguiente(tid):
                p["siguienteId"] = tid.map { .string($0) } ?? .null
            case let .colina(valor):
                guard Double(valor) != nil else { break }
                p["colina"] = .number(valor)
                let estado = p["status"]?.texto ?? ""
                if !["Completado", "En progreso", "En desarrollo"].contains(estado), (Double(valor) ?? 0) > 0 { p["status"] = .string("En progreso") }
            case let .anadirFase(id, nombre, fecha):
                if !fases.contains(where: { $0["id"]?.comoId == id }) {
                    fases.append(.object(["id": .string(id), "nombre": .string(nombre), "fecha": .string(fecha), "hecha": .bool(false)]))
                }
            case let .faseHecha(id, hecha):
                if let m = fases.firstIndex(where: { $0["id"]?.comoId == id }), var f = fases[m].objeto { f["hecha"] = .bool(hecha); fases[m] = .object(f) }
            case let .apuntar(id, fecha, texto):
                if !diario.contains(where: { $0["id"]?.comoId == id }) {
                    diario.insert(.object(["id": .string(id), "fecha": .string(fecha), "texto": .string(texto)]), at: 0)
                }
            case let .quitarApunte(id):
                diario.removeAll { $0["id"]?.comoId == id }
            }
            p["tareas"] = .array(tareas)
            p["tasks"] = .array(tareas.map { .object(["text": .string($0["texto"]?.texto ?? ""), "done": .bool($0["estado"]?.texto == "hecha")]) })
            p["fases"] = .array(fases)
            p["diario"] = .array(diario)
            lista[n] = .object(p)
            r["entries"] = .some(.array(lista))
        case let .borrarMovimiento(id):
            guard var pro = (valores["financePro"] ?? nil)?.objeto, var lista = pro["transactions"]?.lista else { break }
            let antes = lista.count
            lista.removeAll { $0["id"]?.comoId == id }
            guard lista.count != antes else { break }
            pro["transactions"] = .array(lista)
            r["financePro"] = .some(.object(pro))
        case let .crearTraspaso(id, importe, desde, hacia, fecha, hora, concepto):
            guard var pro = (valores["financePro"] ?? nil)?.objeto, let d = Dinero.decimal(texto: importe), d > 0, desde != hacia else { break }
            var lista = pro["transactions"]?.lista ?? []
            if lista.contains(where: { $0["id"]?.comoId == id }) { break }
            var t: [String: JSONValue] = ["id": .string(id), "date": .string(fecha), "hora": .string(hora), "account": .string(desde),
                                          "transferTo": .string(hacia), "type": .string("transfer"),
                                          "amount": .number(NSDecimalNumber(decimal: Dinero.redondeado(d)).stringValue), "manual": .bool(true)]
            if !concepto.isEmpty { t["note"] = .string(concepto) }
            lista.append(.object(t))
            pro["transactions"] = .array(lista)
            r["financePro"] = .some(.object(pro))
        case let .ponerCiudadTiempo(nombre, lat, lon):
            guard Double(lat) != nil, Double(lon) != nil else { break }
            r["ciudadTiempo"] = .some(.object(["nombre": .string(nombre), "lat": .number(lat), "lon": .number(lon)]))
        case let .transporteFavorita(clave, activa):
            var serv = (valores["servicios"] ?? nil)?.objeto ?? [:]
            var tr = serv["transporte"]?.objeto ?? [:]
            var favs = tr["favoritos"]?.lista ?? []
            let ya = favs.contains { $0.texto == clave }
            guard ya != activa else { break }
            if activa { favs.append(.string(clave)) } else { favs.removeAll { $0.texto == clave } }
            tr["favoritos"] = .array(favs)
            serv["transporte"] = .object(tr)
            r["servicios"] = .some(.object(serv))
        case let .transporteLinea(clave, linea, activa):
            var serv = (valores["servicios"] ?? nil)?.objeto ?? [:]
            var tr = serv["transporte"]?.objeto ?? [:]
            var lineas = tr["lineas"]?.objeto ?? [:]
            var actuales = lineas[clave]?.lista ?? []
            guard actuales.contains(where: { $0.texto == linea }) != activa else { break }
            if activa { actuales.append(.string(linea)) } else { actuales.removeAll { $0.texto == linea } }
            if actuales.isEmpty { lineas.removeValue(forKey: clave) } else { lineas[clave] = .array(actuales) }
            tr["lineas"] = .object(lineas)
            serv["transporte"] = .object(tr)
            r["servicios"] = .some(.object(serv))
        case let .anadirEnLista(clave, id, json):
            guard let o = try? LectorJSON.valor(Data(json.utf8)), o.objeto != nil else { break }
            var lista = (valores[clave] ?? nil)?.lista ?? []
            if lista.contains(where: { $0["id"]?.comoId == id }) { break }
            lista.append(o)
            r[clave] = .some(.array(lista))
        case let .anadirCompra(listaId, textos, ids):
            var lc = (valores["listaCompra"] ?? nil)?.objeto ?? [:]
            var listas = lc["listas"]?.lista ?? []
            if listas.isEmpty { listas.append(.object(["id": .string(listaId), "nombre": .string("Casa"), "items": .array([])])) }
            let actual = lc["actual"]?.comoId
            let n = listas.firstIndex { $0["id"]?.comoId == listaId } ?? listas.firstIndex { $0["id"]?.comoId == actual } ?? 0
            guard var l = listas[n].objeto else { break }
            var items = l["items"]?.lista ?? []
            for (k, t) in textos.enumerated() {
                let it = Compra.interpretar(t)
                guard !it.texto.isEmpty else { continue }
                if let j = items.firstIndex(where: { $0["hecho"]?.booleano != true && ($0["texto"]?.texto ?? "").lowercased() == it.texto.lowercased() }) {
                    guard var o = items[j].objeto else { continue }
                    if !it.cantidad.isEmpty { o["cantidad"] = .string(it.cantidad) }
                    if let pr = it.precio { o["precio"] = .number(pr) }
                    items[j] = .object(o)
                    continue
                }
                items.append(.object(["id": .string(k < ids.count ? ids[k] : "cmp_\(k)"), "texto": .string(it.texto), "cantidad": .string(it.cantidad),
                                      "precio": it.precio.map { .number($0) } ?? .null, "hecho": .bool(false)]))
            }
            l["items"] = .array(items)
            listas[n] = .object(l)
            lc["listas"] = .array(listas)
            if !listas.contains(where: { $0["id"]?.comoId == actual }) { lc["actual"] = listas[0]["id"] ?? .string(listaId) }
            r["listaCompra"] = .some(.object(lc))
        case let .anadirANota(id, dia, texto, creada, apunteId):
            if ((valores["apuntesRecientes"] ?? nil)?.lista ?? []).contains(where: { $0["id"]?.comoId == apunteId }) { break }
            var lista = (valores["notes"] ?? nil)?.lista ?? []
            if let n = lista.firstIndex(where: { $0["date"]?.texto == dia }), var o = lista[n].objeto {
                let antes = o["content"]?.texto ?? ""
                o["content"] = .string([antes, texto].filter { !$0.isEmpty }.joined(separator: "\n\n"))
                lista[n] = .object(o)
            } else {
                lista.append(.object(["id": .string(id), "date": .string(dia), "content": .string(texto), "createdAt": .string(creada)]))
            }
            r["notes"] = .some(.array(lista))
        case let .anadirClase(dia, hora, texto):
            guard var st = (valores["studies"] ?? nil)?.objeto else { break }
            var sch = st["schedule"]?.objeto ?? [:]
            var lista = sch[dia]?.lista ?? []
            if lista.contains(where: { $0["time"]?.texto == hora && $0["subject"]?.texto == texto }) { break }
            lista.append(.object(["time": .string(hora), "subject": .string(texto)]))
            lista.sort { ($0["time"]?.texto ?? "") < ($1["time"]?.texto ?? "") }
            sch[dia] = .array(lista)
            st["schedule"] = .object(sch)
            r["studies"] = .some(.object(st))
        case let .registrarApunte(json):
            guard let o = try? LectorJSON.valor(Data(json.utf8)), let id = o["id"]?.comoId else { break }
            var lista = (valores["apuntesRecientes"] ?? nil)?.lista ?? []
            if lista.contains(where: { $0["id"]?.comoId == id }) { break }
            lista.insert(o, at: 0)
            r["apuntesRecientes"] = .some(.array(Array(lista.prefix(40))))
        case let .deshacerApunte(id):
            var lista = (valores["apuntesRecientes"] ?? nil)?.lista ?? []
            guard let n = lista.firstIndex(where: { $0["id"]?.comoId == id }), var a = lista[n].objeto, a["deshecho"]?.booleano != true else { break }
            r = quitarLoApuntado(a["deshacer"], r)
            a["deshecho"] = .bool(true)
            lista[n] = .object(a)
            r["apuntesRecientes"] = .some(.array(lista))
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
            // Como el registro rápido de la web: sin categoría, pendiente de «ajustar movimientos».
            if let categoria { t["category"] = .string(categoria) } else { t["needsReview"] = .bool(true) }
            if !concepto.isEmpty { t["note"] = .string(concepto) }
            lista.append(.object(t))
            pro["transactions"] = .array(lista)
            r["financePro"] = .some(.object(pro))
        case let .marcarTrabajo(aid, id, hecho, momento):
            guard var st = (valores["studies"] ?? nil)?.objeto, var asig = st["subjects"]?.lista,
                  let ij = buscarItem(asig, aid, "assignments", id), var s = asig[ij.0].objeto,
                  var trabajos = s["assignments"]?.lista, var w = trabajos[ij.1].objeto else { break }
            w["done"] = .bool(hecho)
            trabajos[ij.1] = .object(w)
            s["assignments"] = .array(trabajos)
            asig[ij.0] = .object(s)
            st["subjects"] = .array(asig)
            r["studies"] = .some(.object(st))
            var p = planificador(valores["dayPlanner"] ?? nil)
            if let sitio = buscar("planner_assign_" + id, en: p) {
                cambiar(sitio, en: &p) { t in
                    guard t["done"]?.booleano != hecho else { return }
                    t["done"] = .bool(hecho)
                    if hecho { t["hechaEn"] = .number(String(momento)) } else { t.removeValue(forKey: "hechaEn") }
                }
            } else {
                ponerTareaDeTrabajo(w, asignatura: s["name"]?.texto ?? "", en: &p)
            }
            r["dayPlanner"] = .some(.object(p))
        case let .crearEntrega(aid, lista, id, titulo, fecha, hora):
            guard lista == "exams" || lista == "assignments", var st = (valores["studies"] ?? nil)?.objeto, var asig = st["subjects"]?.lista,
                  let i = asig.firstIndex(where: { $0["id"]?.comoId == aid }), var s = asig[i].objeto else { break }
            var items = s[lista]?.lista ?? []
            if items.contains(where: { $0["id"]?.comoId == id }) { break }
            var item: [String: JSONValue] = ["id": .string(id), "title": .string(titulo), "date": .string(fecha ?? ""), "grade": .string(""),
                                             "weight": .string(""), "done": .bool(false)]
            if let hora, !hora.isEmpty { item["time"] = .string(hora) }
            items.append(.object(item))
            s[lista] = .array(items)
            asig[i] = .object(s)
            st["subjects"] = .array(asig)
            r["studies"] = .some(.object(st))
            let nombre = s["name"]?.texto ?? ""
            if let fecha, !fecha.isEmpty {
                // syncExamCalendarEvent (js/enlaces-proyectos.js).
                var ent = (valores["entries"] ?? nil)?.lista ?? []
                let etiqueta = lista == "exams" ? "Examen" : "Entrega"
                let campos: [String: JSONValue] = ["title": .string("\(etiqueta): \(titulo.isEmpty ? "Sin título" : titulo) (\(nombre))"),
                                                   "date": .string(fecha), "time": .string(hora ?? "")]
                if let n = ent.firstIndex(where: { $0["linkedItemId"]?.comoId == id }), var e = ent[n].objeto {
                    campos.forEach { e[$0.key] = $0.value }
                    ent[n] = .object(e)
                } else {
                    var e = campos
                    e["id"] = .string("evt_" + id)
                    e["type"] = .string("event")
                    e["eventType"] = .string("otro")
                    e["notes"] = .string("")
                    e["linkedItemId"] = .string(id)
                    e["linkedSubjectId"] = .string(aid)
                    e["linkedKind"] = .string(lista)
                    ent.append(.object(e))
                }
                r["entries"] = .some(.array(ent))
                if lista == "assignments" {
                    var p = planificador(valores["dayPlanner"] ?? nil)
                    if buscar("planner_assign_" + id, en: p) == nil { ponerTareaDeTrabajo(item, asignatura: nombre, en: &p) }
                    r["dayPlanner"] = .some(.object(p))
                }
            }
        case let .estadoTareaProyecto(pid, tid, estado):
            guard ["pendiente", "curso", "hecha"].contains(estado), var lista = (valores["entries"] ?? nil)?.lista else { break }
            let ok = cambiarTareaProyecto(&lista, pid, tid) { pt, p in
                pt["estado"] = .string(estado)
                if estado == "hecha", p["siguienteId"]?.comoId == tid { p.removeValue(forKey: "siguienteId") }
            }
            if ok { r["entries"] = .some(.array(lista)) }
        case let .proyectoAHoy(pid, tid, idTarea, dia):
            guard var lista = (valores["entries"] ?? nil)?.lista, let n = lista.firstIndex(where: { $0["id"]?.comoId == pid }),
                  let pr = lista[n].objeto.map(proyectoNormalizado),
                  let pt = pr["tareas"]?.lista?.first(where: { $0["id"]?.comoId == tid })?.objeto else { break }
            var p = planificador(valores["dayPlanner"] ?? nil)
            if buscar(idTarea, en: p) == nil {
                // Como la web: si ese día ya está, no se repite.
                if (p["days"]?[dia]?.lista ?? []).contains(where: { $0["proyectoId"]?.comoId == pid && $0["proyectoTareaId"]?.comoId == tid }) { break }
                let titulo = (pr["title"]?.texto ?? "") + ": " + (pt["texto"]?.texto ?? "")
                _ = poner(["id": .string(idTarea), "time": .string(""), "title": .string(titulo), "notes": .string(""), "done": .bool(false),
                           "proyectoId": .string(pid), "proyectoTareaId": .string(tid)], en: dia, de: &p)
                r["dayPlanner"] = .some(.object(p))
            }
            if pt["estado"]?.texto == "pendiente" {
                _ = cambiarTareaProyecto(&lista, pid, tid) { t, _ in t["estado"] = .string("curso") }
                r["entries"] = .some(.array(lista))
            }
        default:
            r["dayPlanner"] = .some(aplicar(op, a: valores["dayPlanner"] ?? nil))
        }
        return r
    }

    // apuntarQuitar (js/apuntar.js) y lo que la app crea con tipos propios (estudio, recurrente, clase). Lo que ya no
    // está se deja como esté: deshacer nunca busca por título ni importe.
    static func quitarLoApuntado(_ dh: JSONValue?, _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        var r = valores
        func quitarDe(_ clave: String, _ id: String) {
            guard var l = (r[clave] ?? nil)?.lista else { return }
            let antes = l.count
            l.removeAll { $0["id"]?.comoId == id }
            if l.count != antes { r[clave] = .some(.array(l)) }
        }
        switch dh?["tipo"]?.texto {
        case "tarea":
            if let t = dh?["tareaId"]?.comoId { r["dayPlanner"] = .some(aplicar(.borrarTarea(id: t), a: r["dayPlanner"] ?? nil)) }
        case "evento":
            if let e = dh?["eventoId"]?.comoId { quitarDe("entries", e) }
        case "gasto":
            if let t = dh?["txId"]?.comoId, var pro = (r["financePro"] ?? nil)?.objeto, var l = pro["transactions"]?.lista {
                let antes = l.count
                l.removeAll { $0["id"]?.comoId == t }
                if l.count != antes { pro["transactions"] = .array(l); r["financePro"] = .some(.object(pro)) }
            }
        case "compra":
            let fuera = Set((dh?["textos"]?.lista ?? []).compactMap { $0.texto?.lowercased() })
            if let lid = dh?["listaId"]?.comoId, var lc = (r["listaCompra"] ?? nil)?.objeto, var listas = lc["listas"]?.lista,
               let n = listas.firstIndex(where: { $0["id"]?.comoId == lid }), var l = listas[n].objeto {
                let items = l["items"]?.lista ?? []
                let quedan = items.filter { $0["hecho"]?.booleano == true || !fuera.contains(($0["texto"]?.texto ?? "").lowercased()) }
                if quedan.count != items.count {
                    l["items"] = .array(quedan); listas[n] = .object(l); lc["listas"] = .array(listas); r["listaCompra"] = .some(.object(lc))
                }
            }
        case "nota":
            if let nid = dh?["notaId"]?.comoId, let t = dh?["texto"]?.texto, !t.isEmpty, var l = (r["notes"] ?? nil)?.lista,
               let n = l.firstIndex(where: { $0["id"]?.comoId == nid }), var o = l[n].objeto, let c = o["content"]?.texto,
               let rango = c.range(of: t, options: .backwards) {
                var nuevo = c
                nuevo.removeSubrange(rango)
                while nuevo.contains("\n\n\n") { nuevo = nuevo.replacingOccurrences(of: "\n\n\n", with: "\n\n") }
                o["content"] = .string(nuevo.trimmingCharacters(in: .whitespacesAndNewlines))
                l[n] = .object(o)
                r["notes"] = .some(.array(l))
            }
        case "estudio":
            if let aid = dh?["subjectId"]?.comoId, let lista = dh?["lista"]?.texto, let id = dh?["id"]?.comoId {
                r = aplicar(.borrarItemEstudio(asignaturaId: aid, lista: lista, id: id), a: r)
            }
        case "recurrente":
            if let id = dh?["id"]?.comoId { quitarDe("recurringTasks", id) }
        case "clase":
            if var st = (r["studies"] ?? nil)?.objeto, var sch = st["schedule"]?.objeto {
                var cambia = false
                for b in dh?["bloques"]?.lista ?? [] {
                    guard let dia = b["dia"]?.texto, var l = sch[dia]?.lista,
                          let i = l.firstIndex(where: { $0["time"] == b["time"] && $0["subject"] == b["subject"] }) else { continue }
                    l.remove(at: i)
                    if l.isEmpty { sch.removeValue(forKey: dia) } else { sch[dia] = .array(l) }
                    cambia = true
                }
                if cambia { st["schedule"] = .object(sch); r["studies"] = .some(.object(st)) }
            }
        default:
            break
        }
        return r
    }

    // syncAssignmentPlannerItem (js/enlaces-proyectos.js), solo cuando la tarea no existe.
    static func ponerTareaDeTrabajo(_ w: [String: JSONValue], asignatura: String, en p: inout [String: JSONValue]) {
        guard let id = w["id"]?.comoId, let fecha = w["date"]?.texto, !fecha.isEmpty, w["fueraDelPlanificador"]?.booleano != true else { return }
        let hora = w["time"]?.texto.flatMap { $0.isEmpty ? nil : $0 } ?? "23:59"
        let titulo = w["title"]?.texto.flatMap { $0.isEmpty ? nil : $0 } ?? "Sin título"
        _ = poner(["id": .string("planner_assign_" + id), "time": .string(hora), "title": .string("trabajo pendiente. " + titulo),
                   "notes": .string(asignatura.isEmpty ? "" : "Asignatura: " + asignatura), "done": .bool(w["done"]?.booleano == true),
                   "arrastrado": .bool(false), "linkedAssignmentId": .string(id)], en: fecha, de: &p)
    }

    // Primero en su asignatura y, si ya no está ahí, en cualquiera (como findAssignmentById).
    static func buscarItem(_ asig: [JSONValue], _ aid: String, _ lista: String, _ id: String) -> (Int, Int)? {
        let orden = asig.indices.filter { asig[$0]["id"]?.comoId == aid } + asig.indices.filter { asig[$0]["id"]?.comoId != aid }
        for i in orden {
            if let j = asig[i][lista]?.lista?.firstIndex(where: { $0["id"]?.comoId == id }) { return (i, j) }
        }
        return nil
    }

    // proyectoDatos (js/proyecto.js): tareas desde `tasks` si no hay, y lo que el conector añadió a `tasks` entra.
    // Ids deterministas para que reaplicar dé lo mismo.
    static func proyectoNormalizado(_ p: [String: JSONValue]) -> [String: JSONValue] {
        var p = p
        let tasks = p["tasks"]?.lista ?? []
        let estado = { (x: JSONValue) -> JSONValue in .string(x["done"]?.booleano == true ? "hecha" : "pendiente") }
        var tareas: [JSONValue]
        if let t = p["tareas"]?.lista {
            tareas = t
            for (i, x) in tasks.enumerated() {
                let texto = x["text"]?.texto ?? ""
                if let j = tareas.firstIndex(where: { $0["texto"]?.texto == texto }) {
                    if x["done"]?.booleano == true, var o = tareas[j].objeto, o["estado"]?.texto != "hecha" {
                        o["estado"] = .string("hecha")
                        tareas[j] = .object(o)
                    }
                } else if !texto.isEmpty {
                    tareas.append(.object(["id": .string("pt_c\(i)"), "texto": .string(texto), "estado": estado(x)]))
                }
            }
        } else {
            tareas = tasks.enumerated().map { i, x in .object(["id": .string("pt_c\(i)"), "texto": .string(x["text"]?.texto ?? ""), "estado": estado(x)]) }
        }
        p["tareas"] = .array(tareas)
        return p
    }

    // Cambia una tarea de un proyecto y rehace `tasks`. Devuelve false si el proyecto o la tarea ya no están.
    static func cambiarTareaProyecto(_ lista: inout [JSONValue], _ pid: String, _ tid: String,
                                     _ f: (inout [String: JSONValue], inout [String: JSONValue]) -> Void) -> Bool {
        guard let n = lista.firstIndex(where: { $0["id"]?.comoId == pid && $0["type"]?.texto == "project" }),
              var p = lista[n].objeto.map(proyectoNormalizado), var tareas = p["tareas"]?.lista,
              let m = tareas.firstIndex(where: { $0["id"]?.comoId == tid }), var pt = tareas[m].objeto else { return false }
        f(&pt, &p)
        tareas[m] = .object(pt)
        p["tareas"] = .array(tareas)
        p["tasks"] = .array(tareas.map { .object(["text": .string($0["texto"]?.texto ?? ""), "done": .bool($0["estado"]?.texto == "hecha")]) })
        lista[n] = .object(p)
        return true
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

        case let .parcharTarea(id, campos):
            guard let sitio = buscar(id, en: p) else { return valor ?? .object(p) }
            cambiar(sitio, en: &p) { t in
                for (k, v) in campos where ["title", "notes", "time"].contains(k) {
                    if k == "time", case .pendiente = sitio { continue }
                    t[k] = .string(v)
                }
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

        case .marcarRecurrente, .guardarEvento, .borrarEntrada, .crearMovimiento, .marcarRutina, .crearNota, .parcharEvento,
             .marcarTrabajo, .crearEntrega, .estadoTareaProyecto, .proyectoAHoy, .ponerCiudadTiempo, .transporteFavorita, .transporteLinea,
             .editarMovimiento, .borrarMovimiento, .crearTraspaso, .editarItemEstudio, .borrarItemEstudio, .crearProyecto, .cambiarProyecto,
             .anadirEnLista, .anadirCompra, .anadirANota, .anadirClase, .registrarApunte, .deshacerApunte:
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
        case let .parcharEvento(id, campos):
            guard let n = lista.firstIndex(where: { $0["id"]?.comoId == id }), var e = lista[n].objeto else { return valor }
            for (k, v) in campos where ["title", "notes", "time", "date", "place"].contains(k) { e[k] = .string(v) }
            lista[n] = .object(e)
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

    static func tareaEn(_ sitio: Sitio, _ p: [String: JSONValue]) -> [String: JSONValue]? {
        switch sitio {
        case let .dia(dia, n): return p["days"]?[dia]?.lista?[n].objeto
        case let .pendiente(n): return p["backlog"]?.lista?[n].objeto
        }
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

    static func poner(_ t: [String: JSONValue], en dia: String, de p: inout [String: JSONValue]) -> Sitio {
        var dias = p["days"]?.objeto ?? [:]
        var lista = dias[dia]?.lista ?? []
        lista.append(.object(t))
        dias[dia] = .array(lista)
        p["days"] = .object(dias)
        return .dia(dia, lista.count - 1)
    }

    static func cambiar(_ sitio: Sitio, en p: inout [String: JSONValue], _ f: (inout [String: JSONValue]) -> Void) {
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
