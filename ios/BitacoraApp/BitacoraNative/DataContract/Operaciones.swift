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
    // Fila de un extracto bancario. `claveImport` es estable para que volver a importar el mismo archivo no duplique.
    case importarMovimiento(id: String, claveImport: String, tipo: String, importe: String, cuenta: String, fecha: String, hora: String, concepto: String)
    // Desde la 0.17, con la clave de la web (ImportadorFinanzas.operaciones). importarMovimiento queda para lo que ya estaba en cola.
    case importarFila(id: String, clave: String, vez: Int, tipo: String, importe: String, cuenta: String, fecha: String, hora: String, concepto: String)
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
    // Viajes (js/viajes.js y la parte travel de saveEntry en js/entradas.js): entradas `type: travel` en `entries`.
    case guardarViaje(id: String, titulo: String, destino: String, inicio: String, fin: String, companeros: String, notas: String)
    case cambiarViaje(viajeId: String, cambio: CambioViaje)
    // Agenda laboral (js/agenda-laboral.js): `agendaLaboral` = { enPrincipal, horario: { "0"..."6": { ini, fin } }, citas: [{ id lab_... }] }.
    case guardarCitaLaboral(id: String, fecha: String, ini: String, fin: String, titulo: String, tipo: String, lugar: String, notas: String)
    case borrarCitaLaboral(id: String)
    // Día de la semana como en getDay ("0" domingo) → "HH:MM|HH:MM". Sustituye el horario entero, como guardarHorarioLaboral.
    case horarioLaboral(dias: [String: String])
    case laboralEnPrincipal(Bool)
    // Objetivos (saveEntry type goal en js/entradas.js y la op `objetivo` del conector). actual y meta en texto decimal.
    case guardarObjetivo(id: String, titulo: String, plazo: String, numerico: Bool, actual: String, meta: String, unidad: String, estado: String, notas: String)
    case cambiarObjetivo(objetivoId: String, cambio: CambioObjetivo)
    // Enlaces (js/enlaces-proyectos.js): `links` y `linkCategories`. creado en ISO, decidido al abrir el editor.
    case guardarEnlace(id: String, titulo: String, url: String, categoriaId: String?, descripcion: String, creado: String)
    case borrarEnlace(id: String)
    case favoritoEnlace(id: String, favorito: Bool)
    case guardarCategoriaEnlace(id: String, nombre: String, color: String)
    case borrarCategoriaEnlace(id: String, destino: String?)
    // Envíos (js/bajo-demanda/actualizaciones.js): `pedidos`. precio en texto decimal; hoy, la fecha civil del día.
    case guardarPedido(id: String, titulo: String, tienda: String, seguimiento: String, url: String, fechaPedido: String, fechaEstimada: String, precio: String, estado: String, nota: String, hoy: String)
    // avanzarPedido con el estado al que se pasa: reintentarlo no avanza dos veces.
    case estadoPedido(id: String, estado: String, hoy: String)
    case borrarPedido(id: String)
    case crearTraspaso(id: String, importe: String, desde: String, hacia: String, fecha: String, hora: String, concepto: String)
    // transporte.js: trAlternarFavorita y trAlternarLinea, dentro de `servicios.transporte` (clave «bus:688»).
    case transporteFavorita(clave: String, activa: Bool)
    case transporteLinea(clave: String, linea: String, activa: Bool)
    // servicios.transporte.posteInicio: la favorita que sale en Inicio (nil la quita). Ver `LecturaTransporte.posteInicio`.
    case transporteElegirInicio(clave: String?)
    // Ajustes → apartados. (renderAjustesApartados): `apartadosConfig.perfil` y `apartadosConfig.opcionales[vista]`.
    // Ocultar no borra datos.
    case ponerPerfil(perfil: String)
    case ponerApartado(vista: String, visible: Bool)
    // Apuntar (js/apuntar.js, apuntarCrear). `json` es el objeto ya construido, en texto: entradas (evento, cumpleaños,
    // viaje, ocio) y tareas recurrentes. Solo se añade si su id no está.
    case anadirEnLista(clave: String, id: String, json: String)
    // compraAnadir: cada texto pasa por compraInterpretar; lo que ya está sin marcar no se repite. Crea la lista «Casa»
    // con `listaId` si no hay ninguna.
    case anadirCompra(listaId: String, textos: [String], ids: [String])
    // Despensa nativa: mutaciones pequeñas sobre una lista, su historial, recetas y planificación.
    case guardarListaCompra(id: String, nombre: String)
    case borrarListaCompra(id: String)
    case elegirListaCompra(id: String)
    case guardarItemCompra(listaId: String, id: String, texto: String, cantidad: String, seccion: String, precio: String?, hecho: Bool, recetas: [String])
    case borrarItemCompra(listaId: String, id: String)
    case terminarCompra(listaId: String, compraId: String, fecha: String, tienda: String, total: String, txId: String?)
    case guardarRecetaCompra(id: String, nombre: String, raciones: Int, ingredientes: [String], pasos: [String], notas: String)
    case borrarRecetaCompra(id: String)
    case guardarPlatoCompra(dia: String, id: String, momento: String, nombre: String, recetaId: String?, ingredientes: [String])
    case borrarPlatoCompra(dia: String, id: String)
    // Ocio nativo: una entrada multimedia y listas mixtas. Los campos ajenos se conservan al editar.
    case guardarOcio(id: String, tipo: String, titulo: String, autor: String, estado: String, fechaInicio: String, fechaFin: String, anio: String, valoracion: String, notas: String, enlace: String, portada: String)
    case guardarListaOcio(id: String, nombre: String, entryIds: [String])
    case borrarListaOcio(id: String)
    // A la nota del día, sin pisar lo que tenga. `apunteId` evita añadirlo dos veces al reaplicar.
    case anadirANota(id: String, dia: String, texto: String, creada: String, apunteId: String)
    // studies.schedule[dia] (clave «lun», «mar»...), como la op `clase` del conector.
    case anadirClase(dia: String, hora: String, texto: String)
    // apuntesRecientes: el registro (los últimos 40) y deshacer lo que creó uno, que queda marcado `deshecho`.
    case registrarApunte(json: String)
    case deshacerApunte(id: String)
    // 0.18: operaciones nuevas en OperacionesExtra.swift, para no tocar este archivo en cada corte.
    case extra(tipo: String, json: String)

    var claves: [String] {
        switch self {
        case .marcarRecurrente: return ["recurringTasks", "entries"]
        // Como togglePlannerItemDone: también el trabajo de Estudios, la tarea del proyecto y la marca «Completado».
        case .marcarTarea: return ["dayPlanner", "entries", "studies"]
        case .parcharEvento: return ["entries"]
        case .guardarEvento, .guardarOcio: return ["entries"]
        case .borrarEntrada: return ["entries", "cultureLists"]
        case .crearMovimiento, .importarMovimiento, .importarFila, .editarMovimiento, .borrarMovimiento, .crearTraspaso: return ["financePro"]
        case .editarItemEstudio: return ["studies", "entries", "dayPlanner"]
        case .crearProyecto, .cambiarProyecto: return ["entries"]
        case .guardarViaje, .cambiarViaje: return ["entries"]
        case .guardarObjetivo, .cambiarObjetivo: return ["entries"]
        case .guardarEnlace, .borrarEnlace, .favoritoEnlace: return ["links"]
        case .guardarPedido, .estadoPedido, .borrarPedido: return ["pedidos"]
        case .guardarCategoriaEnlace, .borrarCategoriaEnlace: return ["links", "linkCategories"]
        case .guardarCitaLaboral, .borrarCitaLaboral, .horarioLaboral, .laboralEnPrincipal: return ["agendaLaboral"]
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
        case .anadirCompra, .guardarListaCompra, .borrarListaCompra, .elegirListaCompra, .guardarItemCompra, .borrarItemCompra,
             .terminarCompra, .guardarRecetaCompra, .borrarRecetaCompra, .guardarPlatoCompra, .borrarPlatoCompra: return ["listaCompra"]
        case .guardarListaOcio, .borrarListaOcio: return ["cultureLists"]
        case .anadirANota: return ["notes", "apuntesRecientes"]
        case .anadirClase: return ["studies"]
        case .transporteElegirInicio: return ["servicios"]
        case .ponerPerfil, .ponerApartado: return ["apartadosConfig"]
        case .registrarApunte: return ["apuntesRecientes"]
        case .deshacerApunte: return ["apuntesRecientes", "dayPlanner", "entries", "financePro", "listaCompra", "notes", "studies", "recurringTasks"]
        case let .extra(tipo, _): return OperacionesExtra.claves(tipo)
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

// Los hitos no tienen id en la web: se reconocen por el texto, como la op `objetivo` del conector.
enum CambioObjetivo: Codable, Sendable, Equatable {
    case hito(texto: String)
    case hitoHecho(texto: String, hecho: Bool)
    case quitarHito(texto: String)
    case progreso(actual: String)
}

enum CambioViaje: Codable, Sendable, Equatable {
    // saveItineraryItem / deleteItineraryItem: { id, dia, hora, titulo, lugar, notas } en `itinerario`.
    case itinerario(id: String, dia: String, hora: String, titulo: String, lugar: String, notas: String)
    case quitarItinerario(id: String)
    // addTripPlace / toggleTripPlace / deleteTripPlace: { id, nombre, visitado } en `places`.
    case lugar(id: String, nombre: String)
    case lugarVisitado(id: String, visitado: Bool)
    case quitarLugar(id: String)
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
        case .guardarEvento, .parcharEvento:
            r["entries"] = .some(entradas(op, valores["entries"] ?? nil))
        case let .borrarEntrada(id):
            r["entries"] = .some(entradas(op, valores["entries"] ?? nil))
            if var listas = (valores["cultureLists"] ?? nil)?.lista {
                var cambio = false
                for n in listas.indices where listas[n]["entryIds"]?.lista?.contains(where: { $0.comoId == id }) == true {
                    guard var lista = listas[n].objeto else { continue }
                    lista["entryIds"] = .array((lista["entryIds"]?.lista ?? []).filter { $0.comoId != id })
                    listas[n] = .object(lista); cambio = true
                }
                if cambio { r["cultureLists"] = .some(.array(listas)) }
            }
        case let .marcarTarea(id, hecha, momento):
            // La fecha prevista se decide antes de mover la tarea: si estaba en un día pasado y se trae ahora, su día.
            let antes = planificador(valores["dayPlanner"] ?? nil)
            let previo = buscar(id, en: antes).map { s -> (String?, Bool) in
                guard case let .dia(d, _) = s, let t = tareaEn(s, antes) else { return (nil, false) }
                return Completado.prevista(dia: d, tarea: t, hoy: CalendarioBitacora.madrid.diaLogico(Date(timeIntervalSince1970: Double(momento) / 1000)).iso)
            }
            let planner = aplicar(op, a: valores["dayPlanner"] ?? nil)
            r["dayPlanner"] = .some(planner)
            guard let sitio = buscar(id, en: planificador(planner)), let t = tareaEn(sitio, planificador(planner)) else { break }
            let hoy = CalendarioBitacora.madrid.dia(de: Date(timeIntervalSince1970: Double(momento) / 1000)).iso
            var lista = (valores["entries"] ?? nil)?.lista ?? []
            let marca = "planner_done_\(id)"
            lista.removeAll { $0["id"]?.comoId == marca }
            if hecha {
                var e: [String: JSONValue] = ["id": .string(marca), "type": .string("event"), "eventType": .string("otro"),
                                              "title": .string("Completado: " + (t["title"]?.texto ?? "")), "date": .string(hoy),
                                              "time": .string(t["time"]?.texto ?? ""), "place": .string(""), "notes": .string(t["notes"]?.texto ?? ""),
                                              "category": .string("Planificador"), "calendarLog": .bool(true)]
                Completado.campos(taskId: id, prevista: previo?.0, logico: CalendarioBitacora.madrid.diaLogico(Date(timeIntervalSince1970: Double(momento) / 1000)).iso,
                                  arrastre: previo?.1 ?? false, origen: "ios").forEach { e[$0.key] = $0.value }
                lista.append(.object(e))
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
        case .guardarCitaLaboral, .borrarCitaLaboral, .horarioLaboral, .laboralEnPrincipal:
            // datosLaboral(): si falta algo, se crea con lo de la web; lo que no se conoce se queda.
            var a = (valores["agendaLaboral"] ?? nil)?.objeto ?? ["enPrincipal": .bool(true)]
            if a["horario"]?.objeto == nil { a["horario"] = .object([:]) }
            var citas = a["citas"]?.lista ?? []
            switch op {
            case let .guardarCitaLaboral(id, fecha, ini, fin, titulo, tipo, lugar, notas):
                guard LocalDay(iso: fecha) != nil, ["reunion", "turno", "plazo", "otro"].contains(tipo),
                      !titulo.trimmingCharacters(in: .whitespaces).isEmpty || tipo == "turno" else { return r }
                var o = citas.first(where: { $0["id"]?.comoId == id })?.objeto ?? ["id": .string(id)]
                o["fecha"] = .string(fecha); o["ini"] = .string(ini); o["fin"] = .string(fin)
                o["titulo"] = .string(String(titulo.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))); o["tipo"] = .string(tipo)
                o["lugar"] = .string(String(lugar.prefix(200))); o["notas"] = .string(String(notas.prefix(2000)))
                if let n = citas.firstIndex(where: { $0["id"]?.comoId == id }) { citas[n] = .object(o) } else { citas.append(.object(o)) }
            case let .borrarCitaLaboral(id):
                citas.removeAll { $0["id"]?.comoId == id }
            case let .horarioLaboral(dias):
                var h: [String: JSONValue] = [:]
                for (k, v) in dias where ["0", "1", "2", "3", "4", "5", "6"].contains(k) {
                    let p = v.split(separator: "|").map(String.init)
                    if p.count == 2, !p[0].isEmpty, !p[1].isEmpty { h[k] = .object(["ini": .string(p[0]), "fin": .string(p[1])]) }
                }
                a["horario"] = .object(h)
            case let .laboralEnPrincipal(si):
                a["enPrincipal"] = .bool(si)
            default: break
            }
            a["citas"] = .array(citas)
            r["agendaLaboral"] = .some(.object(a))
        case let .guardarPedido(id, titulo, tienda, seguimiento, url, fechaPedido, fechaEstimada, precio, estado, nota, hoy):
            let t = String(titulo.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))
            guard !t.isEmpty, LecturaEnvios.estados.contains(where: { $0.0 == estado }) else { break }
            var lista = (valores["pedidos"] ?? nil)?.lista ?? []
            let n = lista.firstIndex(where: { $0["id"]?.comoId == id })
            var p = n.flatMap { lista[$0].objeto } ?? ["id": .string(id)]
            let antes = p["estado"]?.texto
            let notaLimpia = nota.trimmingCharacters(in: .whitespacesAndNewlines)
            p["titulo"] = .string(t); p["tienda"] = .string(tienda); p["seguimiento"] = .string(seguimiento.trimmingCharacters(in: .whitespaces).uppercased())
            p["url"] = .string(url.trimmingCharacters(in: .whitespaces)); p["fechaPedido"] = .string(fechaPedido); p["fechaEstimada"] = .string(fechaEstimada)
            if let d = Dinero.decimal(texto: precio), d > 0 { p["precio"] = .number(NSDecimalNumber(decimal: d).stringValue) } else { p.removeValue(forKey: "precio") }
            p["estado"] = .string(estado)
            // guardarPedido: al crear, o si cambia el estado o hay nota, una línea más en el historial.
            if n == nil || antes != estado || !notaLimpia.isEmpty {
                var h: [String: JSONValue] = ["fecha": .string(hoy), "estado": .string(estado)]
                if !notaLimpia.isEmpty { h["nota"] = .string(String(notaLimpia.prefix(500))) }
                // Reintentar la misma operación no repite la línea.
                if p["historial"]?.lista?.last != .object(h) { p["historial"] = .array((p["historial"]?.lista ?? []) + [.object(h)]) }
            }
            if estado == "entregado" { if p["fechaEntrega"] == nil { p["fechaEntrega"] = .string(hoy) } } else { p.removeValue(forKey: "fechaEntrega") }
            if let n { lista[n] = .object(p) } else { lista.append(.object(p)) }
            r["pedidos"] = .some(.array(lista))
        case let .estadoPedido(id, estado, hoy):
            var lista = (valores["pedidos"] ?? nil)?.lista ?? []
            guard LecturaEnvios.estados.contains(where: { $0.0 == estado }), let n = lista.firstIndex(where: { $0["id"]?.comoId == id }),
                  var p = lista[n].objeto, p["estado"]?.texto != estado else { break }
            p["estado"] = .string(estado)
            p["historial"] = .array((p["historial"]?.lista ?? []) + [.object(["fecha": .string(hoy), "estado": .string(estado)])])
            if estado == "entregado" { p["fechaEntrega"] = .string(hoy) }
            lista[n] = .object(p)
            r["pedidos"] = .some(.array(lista))
        case let .borrarPedido(id):
            var lista = (valores["pedidos"] ?? nil)?.lista ?? []; let antes = lista.count
            lista.removeAll { $0["id"]?.comoId == id }; guard antes != lista.count else { break }
            r["pedidos"] = .some(.array(lista))
        case let .guardarEnlace(id, titulo, url, categoriaId, descripcion, creado):
            let t = String(titulo.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))
            var u = url.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !t.isEmpty, !u.isEmpty else { break }
            // saveNewLink: sin esquema se le pone https://. Solo se guardan direcciones web.
            if u.range(of: "^https?://", options: [.regularExpression, .caseInsensitive]) == nil { u = "https://" + u }
            guard u.range(of: "^[a-z][a-z0-9+.-]*:", options: [.regularExpression, .caseInsensitive]).map({ u[$0].lowercased().hasPrefix("http") }) == true else { break }
            var lista = (valores["links"] ?? nil)?.lista ?? []
            let d = descripcion.trimmingCharacters(in: .whitespacesAndNewlines)
            if let n = lista.firstIndex(where: { $0["id"]?.comoId == id }), var o = lista[n].objeto {
                o["title"] = .string(t); o["url"] = .string(String(u.prefix(2000))); o["categoryId"] = categoriaId.map { .string($0) } ?? .null
                if d.isEmpty { o.removeValue(forKey: "descripcion") } else { o["descripcion"] = .string(String(d.prefix(500))) }
                lista[n] = .object(o)
            } else {
                var o: [String: JSONValue] = ["id": .string(id), "title": .string(t), "url": .string(String(u.prefix(2000))),
                                              "categoryId": categoriaId.map { .string($0) } ?? .null, "createdAt": .string(creado)]
                if !d.isEmpty { o["descripcion"] = .string(String(d.prefix(500))) }
                lista.insert(.object(o), at: 0)
            }
            r["links"] = .some(.array(lista))
        case let .borrarEnlace(id):
            var lista = (valores["links"] ?? nil)?.lista ?? []; let antes = lista.count
            lista.removeAll { $0["id"]?.comoId == id }; guard antes != lista.count else { break }
            r["links"] = .some(.array(lista))
        case let .favoritoEnlace(id, favorito):
            var lista = (valores["links"] ?? nil)?.lista ?? []
            guard let n = lista.firstIndex(where: { $0["id"]?.comoId == id }), var o = lista[n].objeto else { break }
            // alternarFavoritoEnlace: como mucho 5.
            if favorito, o["favorito"]?.booleano != true, lista.filter({ $0["favorito"]?.booleano == true }).count >= 5 { break }
            o["favorito"] = .bool(favorito); lista[n] = .object(o)
            r["links"] = .some(.array(lista))
        case let .guardarCategoriaEnlace(id, nombre, color):
            let t = String(nombre.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80)); guard !t.isEmpty else { break }
            var cats = (valores["linkCategories"] ?? nil)?.lista ?? []
            if let n = cats.firstIndex(where: { $0["id"]?.comoId == id }), var o = cats[n].objeto {
                o["name"] = .string(t); if !color.isEmpty { o["color"] = .string(color) }; cats[n] = .object(o)
            } else {
                cats.append(.object(["id": .string(id), "name": .string(t), "color": .string(color.isEmpty ? "#FFADAD" : color)]))
            }
            r["linkCategories"] = .some(.array(cats))
        case let .borrarCategoriaEnlace(id, destino):
            var cats = (valores["linkCategories"] ?? nil)?.lista ?? []; let antes = cats.count
            cats.removeAll { $0["id"]?.comoId == id }; guard antes != cats.count else { break }
            // borrarCategoriaEnlace: sus enlaces pasan a otra categoría o se quedan sin ella.
            let lista = ((valores["links"] ?? nil)?.lista ?? []).map { l -> JSONValue in
                guard var o = l.objeto, o["categoryId"]?.comoId == id else { return l }
                o["categoryId"] = destino.map { .string($0) } ?? .null; return .object(o)
            }
            r["linkCategories"] = .some(.array(cats)); r["links"] = .some(.array(lista))
        case let .guardarObjetivo(id, titulo, plazo, numerico, actual, meta, unidad, estado, notas):
            let limpio = String(titulo.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200)); guard !limpio.isEmpty else { break }
            var lista = (valores["entries"] ?? nil)?.lista ?? []
            let n = lista.firstIndex(where: { $0["id"]?.comoId == id })
            if let n, lista[n]["type"]?.texto != "goal" { break }
            var o = n.flatMap { lista[$0].objeto } ?? ["id": .string(id), "type": .string("goal"), "categoryId": .string("cat_general"),
                                                      "tags": .array([]), "milestones": .array([]),
                                                      "date": .string(CalendarioBitacora.madrid.dia(de: Date()).iso)]
            o["title"] = .string(limpio)
            o["term"] = .string(["short", "medium", "long"].contains(plazo) ? plazo : "short")
            o["goalType"] = .string(numerico ? "numeric" : "simple")
            // saveEntry solo toca valor, meta y unidad si es numérico (parseFloat || 0).
            if numerico {
                o["currentValue"] = .number(NSDecimalNumber(decimal: Dinero.decimal(texto: actual) ?? 0).stringValue)
                o["targetValue"] = .number(NSDecimalNumber(decimal: Dinero.decimal(texto: meta) ?? 0).stringValue)
                o["unit"] = .string(String(unidad.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40)))
            }
            o["status"] = .string(["Pendiente", "En progreso", "Completado"].contains(estado) ? estado : "Pendiente")
            o["notes"] = .string(String(notas.prefix(4000)))
            if let n { lista[n] = .object(o) } else { lista.append(.object(o)) }
            r["entries"] = .some(.array(lista))
        case let .cambiarObjetivo(gid, cambio):
            var lista = (valores["entries"] ?? nil)?.lista ?? []
            guard let n = lista.firstIndex(where: { $0["id"]?.comoId == gid && $0["type"]?.texto == "goal" }), var g = lista[n].objeto else { break }
            var hitos = g["milestones"]?.lista ?? []
            let igual = { (a: String, b: String) in LecturaObjetivos.normal(a) == LecturaObjetivos.normal(b) }
            switch cambio {
            case let .hito(texto):
                let t = String(texto.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))
                if !t.isEmpty, !hitos.contains(where: { igual($0["text"]?.texto ?? "", t) }) { hitos.append(.object(["text": .string(t), "done": .bool(false)])) }
            case let .hitoHecho(texto, hecho):
                if let m = hitos.firstIndex(where: { igual($0["text"]?.texto ?? "", texto) }), var h = hitos[m].objeto { h["done"] = .bool(hecho); hitos[m] = .object(h) }
            case let .quitarHito(texto):
                if let m = hitos.firstIndex(where: { igual($0["text"]?.texto ?? "", texto) }) { hitos.remove(at: m) }
            case let .progreso(actual):
                guard let d = Dinero.decimal(texto: actual) else { break }
                g["goalType"] = .string("numeric")
                g["currentValue"] = .number(NSDecimalNumber(decimal: d).stringValue)
            }
            g["milestones"] = .array(hitos)
            lista[n] = .object(g)
            r["entries"] = .some(.array(lista))
        case let .guardarViaje(id, titulo, destino, inicio, fin, companeros, notas):
            let limpio = String(titulo.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200)); guard !limpio.isEmpty else { break }
            var lista = (valores["entries"] ?? nil)?.lista ?? []
            let n = lista.firstIndex(where: { $0["id"]?.comoId == id })
            if let n, lista[n]["type"]?.texto != "travel" { break }
            // Como saveEntry al crear: categoría cat_viaje, sin etiquetas ni gastos a mano. Al editar, el resto se queda.
            var o = n.flatMap { lista[$0].objeto } ?? ["id": .string(id), "type": .string("travel"), "categoryId": .string("cat_viaje"),
                                                      "tags": .array([]), "expenses": .array([])]
            o["title"] = .string(limpio); o["destination"] = .string(String(destino.prefix(200)))
            o["startDate"] = .string(inicio); o["endDate"] = .string(fin); o["date"] = .string(inicio.isEmpty ? fin : inicio)
            o["companions"] = .string(String(companeros.prefix(300))); o["notes"] = .string(String(notas.prefix(4000)))
            if let n { lista[n] = .object(o) } else { lista.append(.object(o)) }
            r["entries"] = .some(.array(lista))
        case let .cambiarViaje(vid, cambio):
            var lista = (valores["entries"] ?? nil)?.lista ?? []
            guard let n = lista.firstIndex(where: { $0["id"]?.comoId == vid && $0["type"]?.texto == "travel" }), var v = lista[n].objeto else { break }
            var itinerario = v["itinerario"]?.lista ?? [], lugares = v["places"]?.lista ?? []
            switch cambio {
            case let .itinerario(id, dia, hora, titulo, lugar, notas):
                let limpio = String(titulo.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300)); guard !limpio.isEmpty else { break }
                var o = itinerario.first(where: { $0["id"]?.comoId == id })?.objeto ?? ["id": .string(id)]
                // Si cambia el lugar, las coordenadas viejas ya no valen (la web las pone al geocodificar).
                if o["lugar"]?.texto != lugar { o.removeValue(forKey: "lat"); o.removeValue(forKey: "lon") }
                o["dia"] = .string(dia); o["hora"] = .string(hora); o["titulo"] = .string(limpio)
                o["lugar"] = .string(String(lugar.prefix(300))); o["notas"] = .string(String(notas.prefix(2000)))
                if let m = itinerario.firstIndex(where: { $0["id"]?.comoId == id }) { itinerario[m] = .object(o) } else { itinerario.append(.object(o)) }
            case let .quitarItinerario(id):
                itinerario.removeAll { $0["id"]?.comoId == id }
            case let .lugar(id, nombre):
                let limpio = String(nombre.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
                if !limpio.isEmpty, !lugares.contains(where: { $0["id"]?.comoId == id }) {
                    lugares.append(.object(["id": .string(id), "nombre": .string(limpio), "visitado": .bool(false)]))
                }
            case let .lugarVisitado(id, visitado):
                if let m = lugares.firstIndex(where: { $0["id"]?.comoId == id }), var o = lugares[m].objeto { o["visitado"] = .bool(visitado); lugares[m] = .object(o) }
            case let .quitarLugar(id):
                lugares.removeAll { $0["id"]?.comoId == id }
            }
            if v["itinerario"] != nil || !itinerario.isEmpty { v["itinerario"] = .array(itinerario) }
            if v["places"] != nil || !lugares.isEmpty { v["places"] = .array(lugares) }
            lista[n] = .object(v)
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
            let n = favs.firstIndex { $0.texto == clave }
            if activa { favs.append(.string(clave)) } else { favs.removeAll { $0.texto == clave } }
            tr["favoritos"] = .array(favs)
            // Si era el poste de Inicio, pasa a la siguiente parada de bus (o a la anterior) y se guarda.
            if !activa, tr["posteInicio"]?.texto == clave, let n {
                let buses = favs.enumerated().filter { $0.element.texto?.hasPrefix("bus:") == true }
                if let s = (buses.first { $0.offset >= n } ?? buses.last)?.element { tr["posteInicio"] = s } else { tr.removeValue(forKey: "posteInicio") }
            }
            serv["transporte"] = .object(tr)
            r["servicios"] = .some(.object(serv))
        case let .transporteElegirInicio(clave):
            var serv = (valores["servicios"] ?? nil)?.objeto ?? [:]
            var tr = serv["transporte"]?.objeto ?? [:]
            if let clave {
                guard (tr["favoritos"]?.lista ?? []).contains(where: { $0.texto == clave }), tr["posteInicio"]?.texto != clave else { break }
                tr["posteInicio"] = .string(clave)
            } else {
                guard tr["posteInicio"] != nil else { break }
                tr.removeValue(forKey: "posteInicio")
            }
            serv["transporte"] = .object(tr)
            r["servicios"] = .some(.object(serv))
        case let .ponerPerfil(perfil):
            guard ["estudiante", "trabajador", "ambos"].contains(perfil) else { break }
            var cfg = (valores["apartadosConfig"] ?? nil)?.objeto ?? [:]
            guard cfg["perfil"]?.texto != perfil else { break }
            cfg["perfil"] = .string(perfil)
            r["apartadosConfig"] = .some(.object(cfg))
        case let .ponerApartado(vista, visible):
            guard !Apartados.fijos.contains(vista) else { break }
            var cfg = (valores["apartadosConfig"] ?? nil)?.objeto ?? [:]
            var op = cfg["opcionales"]?.objeto ?? [:]
            guard op[vista]?.booleano != visible else { break }
            op[vista] = .bool(visible)
            cfg["opcionales"] = .object(op)
            r["apartadosConfig"] = .some(.object(cfg))
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
        case let .guardarListaCompra(id, nombre):
            let limpio = String(nombre.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80))
            guard !limpio.isEmpty else { break }
            var lc = (valores["listaCompra"] ?? nil)?.objeto ?? [:]
            var listas = lc["listas"]?.lista ?? []
            if let n = listas.firstIndex(where: { $0["id"]?.comoId == id }), var l = listas[n].objeto {
                guard l["nombre"]?.texto != limpio else { break }
                l["nombre"] = .string(limpio); listas[n] = .object(l)
            } else {
                listas.append(.object(["id": .string(id), "nombre": .string(limpio), "items": .array([])]))
            }
            lc["listas"] = .array(listas)
            if lc["actual"]?.comoId == nil { lc["actual"] = .string(id) }
            r["listaCompra"] = .some(.object(lc))
        case let .borrarListaCompra(id):
            var lc = (valores["listaCompra"] ?? nil)?.objeto ?? [:]
            var listas = lc["listas"]?.lista ?? []
            guard listas.count > 1, listas.contains(where: { $0["id"]?.comoId == id }) else { break }
            listas.removeAll { $0["id"]?.comoId == id }
            lc["listas"] = .array(listas)
            if lc["actual"]?.comoId == id { lc["actual"] = listas.first?["id"] ?? .null }
            r["listaCompra"] = .some(.object(lc))
        case let .elegirListaCompra(id):
            var lc = (valores["listaCompra"] ?? nil)?.objeto ?? [:]
            guard (lc["listas"]?.lista ?? []).contains(where: { $0["id"]?.comoId == id }), lc["actual"]?.comoId != id else { break }
            lc["actual"] = .string(id); r["listaCompra"] = .some(.object(lc))
        case let .guardarItemCompra(listaId, id, texto, cantidad, seccion, precio, hecho, recetas):
            let limpio = String(texto.trimmingCharacters(in: .whitespacesAndNewlines).prefix(160))
            guard !limpio.isEmpty else { break }
            var lc = (valores["listaCompra"] ?? nil)?.objeto ?? [:]
            var listas = lc["listas"]?.lista ?? []
            guard let n = listas.firstIndex(where: { $0["id"]?.comoId == listaId }), var l = listas[n].objeto else { break }
            var items = l["items"]?.lista ?? []
            var o = items.first(where: { $0["id"]?.comoId == id })?.objeto ?? ["id": .string(id)]
            o["texto"] = .string(limpio); o["cantidad"] = .string(String(cantidad.prefix(80)))
            o["seccion"] = .string(String(seccion.prefix(40))); o["hecho"] = .bool(hecho)
            o["precio"] = precio.flatMap { Dinero.decimal(texto: $0) }.map { .number(NSDecimalNumber(decimal: $0).stringValue) } ?? .null
            o["recetas"] = .array(Array(Set(recetas.filter { !$0.isEmpty })).sorted().map { .string($0) })
            if let j = items.firstIndex(where: { $0["id"]?.comoId == id }) { items[j] = .object(o) } else { items.append(.object(o)) }
            l["items"] = .array(items); listas[n] = .object(l); lc["listas"] = .array(listas)
            r["listaCompra"] = .some(.object(lc))
        case let .borrarItemCompra(listaId, id):
            var lc = (valores["listaCompra"] ?? nil)?.objeto ?? [:]
            var listas = lc["listas"]?.lista ?? []
            guard let n = listas.firstIndex(where: { $0["id"]?.comoId == listaId }), var l = listas[n].objeto else { break }
            var items = l["items"]?.lista ?? []
            let antes = items.count; items.removeAll { $0["id"]?.comoId == id }
            guard items.count != antes else { break }
            l["items"] = .array(items); listas[n] = .object(l); lc["listas"] = .array(listas)
            r["listaCompra"] = .some(.object(lc))
        case let .terminarCompra(listaId, compraId, fecha, tienda, total, txId):
            var lc = (valores["listaCompra"] ?? nil)?.objeto ?? [:]
            var historial = lc["historial"]?.lista ?? []
            guard !historial.contains(where: { $0["id"]?.comoId == compraId }) else { break }
            var listas = lc["listas"]?.lista ?? []
            guard let n = listas.firstIndex(where: { $0["id"]?.comoId == listaId }), var l = listas[n].objeto else { break }
            let todos = l["items"]?.lista ?? [], comprados = todos.filter { $0["hecho"]?.booleano == true }
            guard !comprados.isEmpty else { break }
            let totalDecimal = Dinero.decimal(texto: total) ?? comprados.reduce(Decimal(0)) { $0 + (Dinero.decimal($1["precio"]) ?? 0) }
            let lineas = comprados.map { x -> JSONValue in
                .object(["texto": .string(x["texto"]?.texto ?? ""), "clave": .string((x["texto"]?.texto ?? "").lowercased()),
                         "cantidad": .string(x["cantidad"]?.texto ?? ""), "precio": x["precio"] ?? .null,
                         "importe": x["precio"] ?? .null, "deLista": .bool(true), "planeado": .bool(true),
                         "seccion": .string(x["seccion"]?.texto ?? "otros")])
            }
            var compra: [String: JSONValue] = ["id": .string(compraId), "fecha": .string(fecha), "tienda": .string(String(tienda.prefix(100))),
                                                "listaId": .string(listaId), "total": .number(NSDecimalNumber(decimal: totalDecimal).stringValue),
                                                "fuente": .string("manual"), "items": .array(lineas),
                                                "sinComprar": .array(todos.filter { $0["hecho"]?.booleano != true }.map { .string($0["texto"]?.texto ?? "") })]
            if let txId { compra["txId"] = .string(txId) }
            historial.append(.object(compra)); lc["historial"] = .array(historial)
            var frecuentes = lc["frecuentes"]?.objeto ?? [:]
            for x in comprados {
                let k = (x["texto"]?.texto ?? "").lowercased()
                let n = NSDecimalNumber(decimal: Dinero.decimal(frecuentes[k]) ?? 0).intValue
                frecuentes[k] = .number(String(n + 1))
            }
            lc["frecuentes"] = .object(frecuentes)
            l["items"] = .array(todos.filter { $0["hecho"]?.booleano != true }); listas[n] = .object(l); lc["listas"] = .array(listas)
            r["listaCompra"] = .some(.object(lc))
        case let .guardarRecetaCompra(id, nombre, raciones, ingredientes, pasos, notas):
            let limpio = String(nombre.trimmingCharacters(in: .whitespacesAndNewlines).prefix(120)); guard !limpio.isEmpty else { break }
            var lc = (valores["listaCompra"] ?? nil)?.objeto ?? [:]
            var recetas = lc["recetas"]?.lista ?? []
            var o = recetas.first(where: { $0["id"]?.comoId == id })?.objeto ?? ["id": .string(id)]
            o["nombre"] = .string(limpio); o["raciones"] = .number(String(max(1, raciones))); o["notas"] = .string(String(notas.prefix(2000)))
            o["ingredientes"] = .array(ingredientes.compactMap { linea in
                let p = linea.split(separator: "|", maxSplits: 1).map(String.init); let texto = (p.count == 2 ? p[1] : p[0]).trimmingCharacters(in: .whitespaces)
                return texto.isEmpty ? nil : .object(["texto": .string(texto), "cantidad": .string(p.count == 2 ? p[0] : "")])
            })
            o["pasos"] = .array(pasos.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.map { .string(String($0.prefix(500))) })
            if let n = recetas.firstIndex(where: { $0["id"]?.comoId == id }) { recetas[n] = .object(o) } else { recetas.append(.object(o)) }
            lc["recetas"] = .array(recetas); r["listaCompra"] = .some(.object(lc))
        case let .borrarRecetaCompra(id):
            var lc = (valores["listaCompra"] ?? nil)?.objeto ?? [:]; var recetas = lc["recetas"]?.lista ?? []
            let antes = recetas.count; recetas.removeAll { $0["id"]?.comoId == id }; guard antes != recetas.count else { break }
            lc["recetas"] = .array(recetas); r["listaCompra"] = .some(.object(lc))
        case let .guardarPlatoCompra(dia, id, momento, nombre, recetaId, ingredientes):
            let limpio = String(nombre.trimmingCharacters(in: .whitespacesAndNewlines).prefix(120)); guard !limpio.isEmpty else { break }
            var lc = (valores["listaCompra"] ?? nil)?.objeto ?? [:]; var plan = lc["plan"]?.objeto ?? [:]; var platos = plan[dia]?.lista ?? []
            var o: [String: JSONValue] = ["id": .string(id), "momento": .string(String(momento.prefix(40))), "nombre": .string(limpio),
                                          "ingredientes": .array(ingredientes.map { .object(["texto": .string($0), "cantidad": .string("")]) })]
            if let recetaId { o["recetaId"] = .string(recetaId) }
            if let n = platos.firstIndex(where: { $0["id"]?.comoId == id }) { platos[n] = .object(o) } else { platos.append(.object(o)) }
            plan[dia] = .array(platos); lc["plan"] = .object(plan); r["listaCompra"] = .some(.object(lc))
        case let .borrarPlatoCompra(dia, id):
            var lc = (valores["listaCompra"] ?? nil)?.objeto ?? [:]; var plan = lc["plan"]?.objeto ?? [:]; var platos = plan[dia]?.lista ?? []
            let antes = platos.count; platos.removeAll { $0["id"]?.comoId == id }; guard antes != platos.count else { break }
            if platos.isEmpty { plan.removeValue(forKey: dia) } else { plan[dia] = .array(platos) }
            lc["plan"] = .object(plan); r["listaCompra"] = .some(.object(lc))
        case let .guardarOcio(id, tipo, titulo, autor, estado, fechaInicio, fechaFin, anio, valoracion, notas, enlace, portada):
            guard ["book", "series", "movie", "game"].contains(tipo) else { break }
            let limpio = String(titulo.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200)); guard !limpio.isEmpty else { break }
            var lista = (valores["entries"] ?? nil)?.lista ?? []
            var o = lista.first(where: { $0["id"]?.comoId == id })?.objeto ?? ["id": .string(id), "createdAt": .string(ISO8601DateFormatter().string(from: Date()))]
            o["type"] = .string(tipo); o["title"] = .string(limpio); o["author"] = .string(String(autor.prefix(200)))
            o["status"] = .string(String(estado.prefix(40)))
            o["startDate"] = .string(fechaInicio); o["endDate"] = .string(fechaFin)
            o["date"] = .string(fechaInicio.isEmpty ? fechaFin : fechaInicio)
            o["year"] = Dinero.decimal(texto: anio).map { .number(NSDecimalNumber(decimal: $0).stringValue) } ?? .null
            o["rating"] = Dinero.decimal(texto: valoracion).map { .number(NSDecimalNumber(decimal: $0).stringValue) } ?? .number("0")
            o["notes"] = .string(String(notas.prefix(4000))); o["url"] = .string(String(enlace.prefix(1000))); o["portada"] = .string(String(portada.prefix(2000)))
            if let n = lista.firstIndex(where: { $0["id"]?.comoId == id }) { lista[n] = .object(o) } else { lista.append(.object(o)) }
            r["entries"] = .some(.array(lista))
        case let .guardarListaOcio(id, nombre, entryIds):
            let limpio = String(nombre.trimmingCharacters(in: .whitespacesAndNewlines).prefix(100)); guard !limpio.isEmpty else { break }
            var listas = (valores["cultureLists"] ?? nil)?.lista ?? []
            let o: JSONValue = .object(["id": .string(id), "name": .string(limpio), "entryIds": .array(Array(Set(entryIds)).sorted().map { .string($0) })])
            if let n = listas.firstIndex(where: { $0["id"]?.comoId == id }) { listas[n] = o } else { listas.append(o) }
            r["cultureLists"] = .some(.array(listas))
        case let .borrarListaOcio(id):
            var listas = (valores["cultureLists"] ?? nil)?.lista ?? []; let antes = listas.count
            listas.removeAll { $0["id"]?.comoId == id }; guard antes != listas.count else { break }
            r["cultureLists"] = .some(.array(listas))
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
        case let .importarMovimiento(id, claveImport, tipo, importe, cuenta, fecha, hora, concepto):
            guard var pro = (valores["financePro"] ?? nil)?.objeto, let d = Dinero.decimal(texto: importe), d > 0,
                  tipo == "income" || tipo == "expense", !claveImport.isEmpty else { break }
            var lista = pro["transactions"]?.lista ?? []
            // Idempotencia por id y por la huella de la fila, incluso si la operación se vuelve a generar en otro dispositivo.
            if lista.contains(where: { $0["id"]?.comoId == id || $0["claveImport"]?.texto == claveImport }) { break }
            var t: [String: JSONValue] = ["id": .string(id), "date": .string(fecha), "hora": .string(hora),
                                          "account": .string(cuenta), "type": .string(tipo),
                                          "amount": .number(NSDecimalNumber(decimal: Dinero.redondeado(d)).stringValue),
                                          "manual": .bool(false), "claveImport": .string(claveImport), "needsReview": .bool(true)]
            if !concepto.isEmpty { t["note"] = .string(concepto); t["conceptoBanco"] = .string(concepto) }
            lista.append(.object(t))
            pro["transactions"] = .array(lista)
            r["financePro"] = .some(.object(pro))
        case let .importarFila(id, clave, vez, tipo, importe, cuenta, fecha, hora, concepto):
            guard var pro = (valores["financePro"] ?? nil)?.objeto, let d = Dinero.decimal(texto: importe), d > 0,
                  tipo == "income" || tipo == "expense" else { break }
            var lista = pro["transactions"]?.lista ?? []
            if lista.contains(where: { $0["id"]?.comoId == id }) { break }
            // Como la web: se cuentan las veces que ya está (por cuenta, fecha, importe y concepto del banco, o por
            // claveImport), y la fila entra solo si es una vez más de las que hay.
            let ya = lista.reduce(0) { n, t in n + ClaveImportacion.claves(t).filter { $0 == clave }.count }
            if ya > vez { break }
            var t: [String: JSONValue] = ["id": .string(id), "date": .string(fecha), "account": .string(cuenta), "type": .string(tipo),
                                          "amount": .number(NSDecimalNumber(decimal: Dinero.redondeado(d)).stringValue),
                                          "manual": .bool(false), "needsReview": .bool(true)]
            if !hora.isEmpty { t["hora"] = .string(hora) }
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
        case let .extra(tipo, json):
            r = OperacionesExtra.aplicar(tipo, json, r)
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
                // arrastrarPlanner: el día en que estaba prevista se conserva al arrastrarla.
                if t["fechaPrevista"] == nil, tareaEn(sitio, planificador(valor))?["arrastrado"]?.booleano != true { t["fechaPrevista"] = .string(dia) }
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
                for (k, v) in campos where ["title", "notes", "time", "prioridad"].contains(k) {
                    if k == "time", case .pendiente = sitio { continue }
                    // Sin prioridad la web no guarda la clave (prioridad: undefined).
                    if k == "prioridad" { if ["alta", "media", "baja"].contains(v) { t[k] = .string(v) } else { t.removeValue(forKey: k) }; continue }
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
            t.removeValue(forKey: "fechaPrevista")
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

        case .marcarRecurrente, .guardarEvento, .borrarEntrada, .crearMovimiento, .importarMovimiento, .importarFila, .guardarViaje, .cambiarViaje,
             .guardarCitaLaboral, .borrarCitaLaboral, .horarioLaboral, .laboralEnPrincipal, .guardarObjetivo, .cambiarObjetivo,
             .guardarEnlace, .borrarEnlace, .favoritoEnlace, .guardarCategoriaEnlace, .borrarCategoriaEnlace, .guardarPedido, .estadoPedido, .borrarPedido, .marcarRutina, .crearNota, .parcharEvento,
             .marcarTrabajo, .crearEntrega, .estadoTareaProyecto, .proyectoAHoy, .ponerCiudadTiempo, .transporteFavorita, .transporteLinea, .transporteElegirInicio, .ponerPerfil, .ponerApartado,
             .editarMovimiento, .borrarMovimiento, .crearTraspaso, .editarItemEstudio, .borrarItemEstudio, .crearProyecto, .cambiarProyecto,
             .anadirEnLista, .anadirCompra, .guardarListaCompra, .borrarListaCompra, .elegirListaCompra, .guardarItemCompra,
             .borrarItemCompra, .terminarCompra, .guardarRecetaCompra, .borrarRecetaCompra, .guardarPlatoCompra, .borrarPlatoCompra,
             .guardarOcio, .guardarListaOcio, .borrarListaOcio, .anadirANota, .anadirClase, .registrarApunte, .deshacerApunte, .extra:
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
            for (k, v) in campos where ["title", "notes", "time", "date", "place", "eventType", "ocioTipo"].contains(k) { e[k] = .string(v) }
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
