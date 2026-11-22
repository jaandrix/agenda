import Foundation

struct TareaPlan: Sendable, Identifiable, Equatable {
    let id: String
    let titulo: String
    let hora: String?
    let notas: String
    var hecha: Bool
    let arrastrada: Bool
    // Las que vienen de un trabajo de Estudios se recrean solas al abrir la web: se borran desde allí.
    let deTrabajo: Bool
    // «alta», «media» o «baja» (js/planificador.js); nil sin prioridad.
    var prioridad: String? = nil
    // 0.27: «hechas/total» de sus subtareas, como plannerSubCuenta (0 de 0 = sin subtareas).
    var subtareas = 0
    var subHechas = 0
}

struct RecurrenteHoy: Sendable, Identifiable, Equatable {
    let id: String
    let texto: String
    var hecha: Bool
}

struct VistaPlan: Sendable, Equatable {
    let dia: LocalDay
    let hoyCivil: LocalDay
    var tareas: [TareaPlan]
    var sinDia: [TareaPlan]
    var recurrentes: [RecurrenteHoy]
    // 0.27: «en este día.» (renderEnEsteDiaBoton), solo hoy.
    var recuerdos: [Recuerdo] = []
}

// Lectura de `dayPlanner` ({ days: { "AAAA-MM-DD": [tarea] }, backlog: [tarea] }) y `recurringTasks`. Lo de días
// pasados sin hacer se enseña hoy como arrastrado, igual que arrastrarPlanner en la web, sin moverlo en los datos.
enum LecturaPlanificador {
    static func vista(_ doc: DocumentoBitacora, desplazamiento: Int = 0, ahora: Date = Date(), calendario: CalendarioBitacora = .madrid) -> VistaPlan {
        let hoy = calendario.diaLogico(ahora)
        let dia = hoy.sumando(dias: desplazamiento)
        let planner = (try? doc.valor(de: "dayPlanner")) ?? nil
        let dias = planner?["days"]?.objeto ?? [:]
        var tareas: [TareaPlan] = []
        for clave in dias.keys.sorted() {
            guard let d = LocalDay(iso: clave) else { continue }
            for x in dias[clave]?.lista ?? [] {
                guard let t = tarea(x) else { continue }
                if d == dia {
                    tareas.append(t)
                } else if desplazamiento == 0, d < hoy, !t.hecha {
                    tareas.append(TareaPlan(id: t.id, titulo: t.titulo, hora: t.hora, notas: t.notas, hecha: false, arrastrada: true, deTrabajo: t.deTrabajo,
                                            prioridad: t.prioridad, subtareas: t.subtareas, subHechas: t.subHechas))
                }
            }
        }
        // Mismo orden que la línea del día de la web: lo que no tiene hora al principio, por prioridad (alta, media, baja,
        // ninguna), y lo demás por hora. Con empate se respeta el orden guardado.
        tareas = tareas.enumerated().sorted { a, b in
            let ka = clave(a.element), kb = clave(b.element)
            return ka != kb ? ka < kb : a.offset < b.offset
        }.map(\.element)
        let sinDia = (planner?["backlog"]?.lista ?? []).compactMap(tarea).filter { !$0.hecha }.enumerated()
            .sorted { a, b in orden(a.element.prioridad) != orden(b.element.prioridad) ? orden(a.element.prioridad) < orden(b.element.prioridad) : a.offset < b.offset }.map(\.element)
        // La web usa el día del calendario (todayISO), no el lógico de las 4:00, para las recurrentes.
        let hoyCivil = calendario.dia(de: ahora)
        var recurrentes: [RecurrenteHoy] = []
        if desplazamiento == 0, let lista = ((try? doc.valor(de: "recurringTasks")) ?? nil)?.lista {
            for x in lista {
                guard let o = x.objeto, let id = o["id"]?.comoId, tocaHoy(o, hoyCivil) else { continue }
                recurrentes.append(RecurrenteHoy(id: id, texto: o["texto"]?.texto ?? "", hecha: o["completadas"]?[hoyCivil.iso]?.booleano == true))
            }
        }
        let recuerdos = desplazamiento == 0 ? Recuerdo.deHoy(doc, hoy: hoyCivil) : []
        return VistaPlan(dia: dia, hoyCivil: hoyCivil, tareas: tareas, sinDia: sinDia, recurrentes: recurrentes, recuerdos: recuerdos)
    }

    // isRecurringTaskDueToday (js/planificador.js).
    static func tocaHoy(_ t: [String: JSONValue], _ dia: LocalDay) -> Bool {
        guard t["activo"]?.booleano == true else { return false }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let fecha = cal.date(from: DateComponents(year: dia.year, month: dia.month, day: dia.day, hour: 12))!
        let semana = cal.component(.weekday, from: fecha) - 1
        let numero = { (k: String) -> Int? in t[k].flatMap { Dinero.decimal($0) }.map { NSDecimalNumber(decimal: $0).intValue } }
        switch t["frecuencia"]?.texto {
        case "diaria": return true
        case "semanal":
            let lista = (t["diasSemana"]?.lista ?? []).compactMap { Dinero.decimal($0).map { NSDecimalNumber(decimal: $0).intValue } }
            return (lista.isEmpty ? [numero("diaSemana")].compactMap { $0 } : lista).contains(semana)
        case "mensual": return numero("diaMes") == dia.day
        case "intervalo":
            guard let inicio = t["intervaloInicio"]?.texto.flatMap(LocalDay.init(iso:)), let cada = numero("intervaloDias"), cada > 0,
                  let a = cal.date(from: DateComponents(year: inicio.year, month: inicio.month, day: inicio.day, hour: 12)) else { return false }
            let dias = cal.dateComponents([.day], from: a, to: fecha).day ?? -1
            return dias >= 0 && dias % cada == 0
        default: return false
        }
    }

    private static func tarea(_ x: JSONValue) -> TareaPlan? {
        guard let o = x.objeto else { return nil }
        let titulo = o["title"]?.texto ?? o["text"]?.texto ?? ""
        let hora = o["time"]?.texto.flatMap { $0.isEmpty ? nil : $0 }
        let subs = o["subtasks"]?.lista ?? []
        return TareaPlan(id: o["id"]?.comoId ?? UUID().uuidString, titulo: titulo, hora: hora, notas: o["notes"]?.texto ?? "",
                         hecha: o["done"]?.booleano == true, arrastrada: o["arrastrado"]?.booleano == true,
                         deTrabajo: o["linkedAssignmentId"] != nil || o["proyectoTareaId"] != nil,
                         prioridad: o["prioridad"]?.texto.flatMap { ["alta", "media", "baja"].contains($0) ? $0 : nil },
                         subtareas: subs.count, subHechas: subs.filter { $0["done"]?.booleano == true }.count)
    }

    // PLANNER_PRIORIDAD_ORDEN (js/planificador.js).
    static func orden(_ p: String?) -> Int { ["alta": 0, "media": 1, "baja": 2][p ?? ""] ?? 3 }

    private static func clave(_ t: TareaPlan) -> Int { t.hora == nil ? orden(t.prioridad) - 10 : minutos(t.hora) }

    private static func minutos(_ hora: String?) -> Int {
        let p = (hora ?? "").split(separator: ":").compactMap { Int($0) }
        return (p.first ?? 0) * 60 + (p.dropFirst().first ?? 0)
    }
}

// buildOnThisDayItems (js/calendario.js): entradas y notas del mismo día y mes de otros años. Los «Completado: …» que deja
// marcar una tarea no son un recuerdo. Una fecha sin hora es ese día; con hora, el día en Madrid.
struct Recuerdo: Sendable, Identifiable, Equatable {
    let id: String
    let nota: Bool
    let titulo: String
    let tipo: String
    let vista: String
    let anio: Int

    static let tipos: [String: (String, String)] = [
        "book": ("libro", "culture"), "movie": ("película", "culture"), "series": ("serie", "culture"), "game": ("videojuego", "culture"),
        "travel": ("viaje", "travels"), "work": ("empleo", "work"), "project": ("proyecto", "projects"), "event": ("evento", "events"),
        "place": ("lugar", "travels"), "document": ("documento", "documents"), "goal": ("objetivo", "goals"), "birthday": ("cumpleaños", "calendar"),
        "subscription": ("suscripción", "finances"), "fixed_expense": ("gasto fijo", "finances"),
    ]

    static func deHoy(_ doc: DocumentoBitacora, hoy: LocalDay) -> [Recuerdo] {
        var r: [Recuerdo] = []
        let lista = { (k: String) -> [JSONValue] in ((try? doc.valor(de: k)) ?? nil)?.lista ?? [] }
        for e in lista("entries") {
            let id = e["id"]?.comoId ?? ""
            if e["calendarLog"]?.booleano == true || id.hasPrefix("planner_done_") || id.hasPrefix("recurring_done_") { continue }
            guard let d = dia(e["date"]?.texto ?? e["startDate"]?.texto ?? e["createdAt"]?.texto), d.month == hoy.month, d.day == hoy.day, d.year < hoy.year else { continue }
            let tipo = e["type"]?.texto ?? ""
            let t = tipos[tipo] ?? (tipo.isEmpty ? "entrada" : tipo, "calendar")
            let titulo = [e["title"]?.texto, e["destination"]?.texto, e["company"]?.texto].compactMap { $0 }.first { !$0.isEmpty } ?? "entrada"
            r.append(Recuerdo(id: id, nota: false, titulo: titulo, tipo: t.0, vista: t.1, anio: d.year))
        }
        for n in lista("notes") {
            let raw = n["date"]?.texto ?? n["createdAt"]?.texto
            guard let d = dia(raw), d.month == hoy.month, d.day == hoy.day, d.year < hoy.year else { continue }
            let titulo = n["title"]?.texto.flatMap { $0.isEmpty ? nil : $0 } ?? String(format: "#%02d/%02d/%04d", d.day, d.month, d.year)
            r.append(Recuerdo(id: n["id"]?.comoId ?? "", nota: true, titulo: titulo, tipo: "nota", vista: "notes", anio: d.year))
        }
        return r.enumerated().sorted { $0.element.anio != $1.element.anio ? $0.element.anio > $1.element.anio : $0.offset < $1.offset }.map(\.element)
    }

    static func dia(_ raw: String?) -> LocalDay? {
        guard let raw, !raw.isEmpty else { return nil }
        if raw.count == 10 { return LocalDay(iso: raw) }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let fecha = f.date(from: raw) { return CalendarioBitacora.madrid.dia(de: fecha) }
        f.formatOptions = [.withInternetDateTime]
        if let fecha = f.date(from: raw) { return CalendarioBitacora.madrid.dia(de: fecha) }
        return LocalDay(iso: String(raw.prefix(10)))
    }
}
