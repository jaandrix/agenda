import Foundation

// Registro de completado (`planner_done_<id>`, completionSchema 1), igual en la PWA (camposCompletado en
// js/planificador.js). La fecha prevista es el día en que estaba la tarea; un arrastre automático conserva la original
// (`fechaPrevista`) y moverla a mano la cambia. Sin dato seguro va a null y no cuenta.
enum Completado {
    static let esquema = 1

    static func prevista(dia: String, tarea t: [String: JSONValue], hoy: String) -> (String?, Bool) {
        if let f = t["fechaPrevista"]?.texto { return (f, true) }
        if t["arrastrado"]?.booleano == true { return (nil, true) }
        return (dia, dia < hoy)
    }

    static func campos(taskId: String, prevista: String?, logico: String, arrastre: Bool, origen: String) -> [String: JSONValue] {
        ["taskId": .string(taskId), "plannedDate": prevista.map(JSONValue.string) ?? .null, "completedDate": .string(logico),
         "automaticCarry": .bool(arrastre), "source": .string(origen), "completionSchema": .number(String(esquema))]
    }
}

// puntualidad = completadas en su fecha prevista / completadas con fecha prevista, por mes de la fecha prevista.
// Sin inventar histórico: lo marcado antes del registro no cuenta y se dice desde cuándo hay datos.
struct Puntualidad: Sendable, Equatable {
    struct Mes: Sendable, Equatable, Identifiable {
        let mes: String
        var puntuales = 0
        var total = 0
        var id: String { mes }
        var porcentaje: Int? { total == 0 ? nil : Int((Double(puntuales) * 100 / Double(total)).rounded()) }
    }
    var desde: String?
    var meses: [Mes] = []

    static func desde(_ doc: DocumentoBitacora, hasta hoy: LocalDay = CalendarioBitacora.madrid.dia(de: Date())) -> Puntualidad {
        var p = Puntualidad()
        var por: [String: Mes] = [:]
        for e in ((try? doc.valor(de: "entries")) ?? nil)?.lista ?? [] {
            guard (e["id"]?.comoId ?? "").hasPrefix("planner_done_"), let v = Dinero.decimal(e["completionSchema"]), v >= 1,
                  let hecha = e["completedDate"]?.texto else { continue }
            if p.desde == nil || hecha < p.desde! { p.desde = hecha }
            guard let prevista = e["plannedDate"]?.texto, prevista.count >= 7 else { continue }
            let m = String(prevista.prefix(7))
            var x = por[m] ?? Mes(mes: m)
            x.total += 1
            if hecha == prevista { x.puntuales += 1 }
            por[m] = x
        }
        // Los doce meses hasta el actual, con o sin muestra.
        var d = LocalDay(year: hoy.year, month: hoy.month, day: 1)!
        var lista: [Mes] = []
        for _ in 0..<12 {
            let m = String(d.iso.prefix(7))
            lista.append(por[m] ?? Mes(mes: m))
            d = (d.month == 1 ? LocalDay(year: d.year - 1, month: 12, day: 1) : LocalDay(year: d.year, month: d.month - 1, day: 1))!
        }
        p.meses = lista.reversed()
        return p
    }
}
