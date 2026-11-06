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
                    tareas.append(TareaPlan(id: t.id, titulo: t.titulo, hora: t.hora, notas: t.notas, hecha: false, arrastrada: true, deTrabajo: t.deTrabajo))
                }
            }
        }
        // Mismo orden que la línea del día de la web: por hora, y lo que no tiene hora al principio.
        tareas.sort { minutos($0.hora) < minutos($1.hora) }
        let sinDia = (planner?["backlog"]?.lista ?? []).compactMap(tarea).filter { !$0.hecha }
        // La web usa el día del calendario (todayISO), no el lógico de las 4:00, para las recurrentes.
        let hoyCivil = calendario.dia(de: ahora)
        var recurrentes: [RecurrenteHoy] = []
        if desplazamiento == 0, let lista = ((try? doc.valor(de: "recurringTasks")) ?? nil)?.lista {
            for x in lista {
                guard let o = x.objeto, let id = o["id"]?.comoId, tocaHoy(o, hoyCivil) else { continue }
                recurrentes.append(RecurrenteHoy(id: id, texto: o["texto"]?.texto ?? "", hecha: o["completadas"]?[hoyCivil.iso]?.booleano == true))
            }
        }
        return VistaPlan(dia: dia, hoyCivil: hoyCivil, tareas: tareas, sinDia: sinDia, recurrentes: recurrentes)
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
        return TareaPlan(id: o["id"]?.comoId ?? UUID().uuidString, titulo: titulo, hora: hora, notas: o["notes"]?.texto ?? "",
                         hecha: o["done"]?.booleano == true, arrastrada: o["arrastrado"]?.booleano == true,
                         deTrabajo: o["linkedAssignmentId"] != nil)
    }

    private static func minutos(_ hora: String?) -> Int {
        let p = (hora ?? "").split(separator: ":").compactMap { Int($0) }
        return (p.first ?? 0) * 60 + (p.dropFirst().first ?? 0)
    }
}
