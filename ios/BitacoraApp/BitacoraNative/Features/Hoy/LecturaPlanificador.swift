import Foundation

struct TareaHoy: Sendable, Identifiable, Equatable {
    let id: String
    let titulo: String
    let hora: String?
    var hecha: Bool
    let arrastrada: Bool
}

struct VistaHoy: Sendable, Equatable {
    let dia: LocalDay
    var tareas: [TareaHoy]
    let sinDia: Int
}

// Lectura de `dayPlanner` ({ days: { "AAAA-MM-DD": [tarea] }, backlog: [tarea] }). Solo lee: lo de días pasados sin
// hacer se enseña como arrastrado, igual que arrastrarPlanner en la web, pero sin moverlo en los datos.
enum LecturaPlanificador {
    static func hoy(_ doc: DocumentoBitacora, ahora: Date = Date(), calendario: CalendarioBitacora = .madrid) -> VistaHoy {
        let dia = calendario.diaLogico(ahora)
        let planner = (try? doc.valor(de: "dayPlanner")) ?? nil
        let dias = planner?["days"]?.objeto ?? [:]
        var tareas: [TareaHoy] = []
        for clave in dias.keys.sorted() {
            guard let d = LocalDay(iso: clave), d <= dia else { continue }
            for x in dias[clave]?.lista ?? [] {
                guard let t = tarea(x) else { continue }
                if d == dia {
                    tareas.append(t)
                } else if !t.hecha {
                    tareas.append(TareaHoy(id: t.id, titulo: t.titulo, hora: t.hora, hecha: false, arrastrada: true))
                }
            }
        }
        // Mismo orden que la línea del día de la web: por hora, y lo que no tiene hora al principio.
        tareas.sort { minutos($0.hora) < minutos($1.hora) }
        let sinDia = (planner?["backlog"]?.lista ?? []).filter { $0["done"]?.booleano != true }.count
        return VistaHoy(dia: dia, tareas: tareas, sinDia: sinDia)
    }

    private static func tarea(_ x: JSONValue) -> TareaHoy? {
        guard let o = x.objeto else { return nil }
        let titulo = o["title"]?.texto ?? o["text"]?.texto ?? ""
        let hora = o["time"]?.texto.flatMap { $0.isEmpty ? nil : $0 }
        return TareaHoy(id: o["id"]?.comoId ?? UUID().uuidString, titulo: titulo, hora: hora,
                        hecha: o["done"]?.booleano == true, arrastrada: o["arrastrado"]?.booleano == true)
    }

    private static func minutos(_ hora: String?) -> Int {
        let p = (hora ?? "").split(separator: ":").compactMap { Int($0) }
        return (p.first ?? 0) * 60 + (p.dropFirst().first ?? 0)
    }
}
