import Foundation

struct EventoDia: Sendable, Identifiable, Equatable {
    let id: String
    let titulo: String
    let hora: String?
    let lugar: String
    let notas: String
    let tipo: String
    let editable: Bool
    let sinAviso: Bool
}

struct VistaMes: Sendable, Equatable {
    let mes: YearMonth
    let porDia: [LocalDay: [EventoDia]]
}

// getDayAllEntries (js/calendario.js), sin lo que depende de otros apartados (horario laboral, pagos recurrentes,
// servicios): entradas con `date` o `startDate` ese día y cumpleaños por mes y día. Fuera los tipos que no van al
// calendario y las marcas de «completado».
enum LecturaCalendario {
    static let fueraDelCalendario: Set<String> = ["document", "restaurant", "place", "goal", "subscription", "fixed_expense"]

    static func mes(_ doc: DocumentoBitacora, _ mes: YearMonth) -> VistaMes {
        var r: [LocalDay: [EventoDia]] = [:]
        let lista = ((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []
        for x in lista {
            guard let o = x.objeto, let id = o["id"]?.comoId, !esMarca(o, id: id) else { continue }
            let tipo = o["type"]?.texto ?? ""
            if fueraDelCalendario.contains(tipo) { continue }
            let dia: LocalDay?
            if tipo == "birthday" {
                guard let n = o["birthDate"]?.texto.flatMap(LocalDay.init(iso:)) else { continue }
                dia = LocalDay(year: mes.year, month: n.month, day: n.day)
            } else {
                dia = (o["date"]?.texto).flatMap(LocalDay.init(iso:)) ?? (o["startDate"]?.texto).flatMap(LocalDay.init(iso:))
            }
            guard let dia, dia.yearMonth == mes else { continue }
            r[dia, default: []].append(evento(o, id: id, tipo: tipo, anio: mes.year))
        }
        // Exámenes y trabajos sin su entrada `evt_` (syncExamCalendarEvent solo la crea al editarlos).
        let enlazados = Set(lista.compactMap { $0["linkedItemId"]?.comoId })
        for s in ((try? doc.valor(de: "studies")) ?? nil)?["subjects"]?.lista ?? [] {
            let nombre = s["name"]?.texto ?? ""
            for (k, etiqueta) in [("exams", "Examen"), ("assignments", "Entrega")] {
                for x in s[k]?.lista ?? [] {
                    guard let id = x["id"]?.comoId, !enlazados.contains(id), let dia = (x["date"]?.texto).flatMap(LocalDay.init(iso:)),
                          dia.yearMonth == mes else { continue }
                    let titulo = x["title"]?.texto.flatMap { $0.isEmpty ? nil : $0 } ?? "Sin título"
                    r[dia, default: []].append(EventoDia(id: "estudio_" + id, titulo: "\(etiqueta): \(titulo) (\(nombre))",
                                                         hora: x["time"]?.texto.flatMap { $0.isEmpty ? nil : $0 }, lugar: "", notas: "",
                                                         tipo: "estudio", editable: false, sinAviso: true))
                }
            }
        }
        for k in r.keys { r[k]?.sort { ($0.hora ?? "") < ($1.hora ?? "") } }
        return VistaMes(mes: mes, porDia: r)
    }

    static func esMarca(_ o: [String: JSONValue], id: String) -> Bool {
        o["calendarLog"]?.booleano == true || id.hasPrefix("weekly_task_done_") || id.hasPrefix("planner_done_") || id.hasPrefix("recurring_done_")
    }

    static func evento(_ o: [String: JSONValue], id: String, tipo: String, anio: Int) -> EventoDia {
        var titulo = o["title"]?.texto ?? ""
        if tipo == "birthday" {
            var t = "cumpleaños de \(titulo)"
            if o["sinAnio"]?.booleano != true, let y = Int(o["birthDate"]?.texto?.prefix(4) ?? "") { t += " (\(anio - y) años)" }
            titulo = t
        } else if tipo == "travel" {
            titulo = "viaje: " + (o["destination"]?.texto.flatMap { $0.isEmpty ? nil : $0 } ?? titulo)
        }
        let hora = (o["time"]?.texto ?? o["startTime"]?.texto).flatMap { $0.isEmpty ? nil : $0 }
        return EventoDia(id: id, titulo: titulo, hora: hora, lugar: o["place"]?.texto ?? "", notas: o["notes"]?.texto ?? "",
                         tipo: tipo, editable: tipo == "event" && o["linkedItemId"] == nil, sinAviso: o["sinAviso"]?.booleano == true)
    }
}
