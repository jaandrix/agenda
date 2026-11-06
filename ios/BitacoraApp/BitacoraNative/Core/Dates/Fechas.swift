import Foundation

// Un día civil (`AAAA-MM-DD`). Nunca se convierte a medianoche UTC: las cuentas se hacen sobre año, mes y día.
struct LocalDay: Hashable, Comparable, Codable, Sendable, CustomStringConvertible {
    let year: Int
    let month: Int
    let day: Int

    init?(year: Int, month: Int, day: Int) {
        var c = DateComponents()
        c.year = year; c.month = month; c.day = day
        guard (1...12).contains(month), (1...31).contains(day), LocalDay.utc.date(from: c).map({ LocalDay.utc.component(.day, from: $0) == day }) == true else { return nil }
        self.year = year; self.month = month; self.day = day
    }

    init?(iso: String) {
        let p = iso.split(separator: "-")
        guard p.count == 3, p[0].count == 4, p[1].count == 2, p[2].count == 2,
              let y = Int(p[0]), let m = Int(p[1]), let d = Int(p[2]) else { return nil }
        self.init(year: y, month: m, day: d)
    }

    var iso: String { String(format: "%04d-%02d-%02d", year, month, day) }
    var description: String { iso }

    static func < (a: LocalDay, b: LocalDay) -> Bool { (a.year, a.month, a.day) < (b.year, b.month, b.day) }

    // Aritmética de calendario en UTC, que no tiene cambios de hora: sumar un día siempre da el día siguiente.
    fileprivate static let utc: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    func sumando(dias: Int) -> LocalDay {
        let base = LocalDay.utc.date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
        let r = LocalDay.utc.date(byAdding: .day, value: dias, to: base)!
        let c = LocalDay.utc.dateComponents([.year, .month, .day], from: r)
        return LocalDay(year: c.year!, month: c.month!, day: c.day!)!
    }

    var yearMonth: YearMonth { YearMonth(year: year, month: month)! }
}

struct YearMonth: Hashable, Comparable, Codable, Sendable, CustomStringConvertible {
    let year: Int
    let month: Int

    init?(year: Int, month: Int) {
        guard (1...12).contains(month) else { return nil }
        self.year = year; self.month = month
    }

    init?(iso: String) {
        let p = iso.split(separator: "-")
        guard p.count == 2, p[0].count == 4, p[1].count == 2, let y = Int(p[0]), let m = Int(p[1]) else { return nil }
        self.init(year: y, month: m)
    }

    var iso: String { String(format: "%04d-%02d", year, month) }
    var description: String { iso }
    static func < (a: YearMonth, b: YearMonth) -> Bool { (a.year, a.month) < (b.year, b.month) }
}

// La web usa la hora del dispositivo; aquí se fija Madrid, como pide la guía nativa. Para Alejandro coinciden;
// si algún día viaja con husos distintos, decidir cuál manda (anotado en NATIVA.md).
struct CalendarioBitacora: Sendable {
    let zona: TimeZone
    static let madrid = CalendarioBitacora(zona: TimeZone(identifier: "Europe/Madrid")!)
    static let horaCambioDeDia = 4

    private var calendario: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = zona
        return c
    }

    func dia(de instante: Date) -> LocalDay {
        let c = calendario.dateComponents([.year, .month, .day], from: instante)
        return LocalDay(year: c.year!, month: c.month!, day: c.day!)!
    }

    // currentPlannerDayKey (js/planificador.js): antes de las 4:00 sigue siendo el día anterior.
    func diaLogico(_ instante: Date, desplazamiento: Int = 0) -> LocalDay {
        let hora = calendario.component(.hour, from: instante)
        var d = dia(de: instante)
        if hora < CalendarioBitacora.horaCambioDeDia { d = d.sumando(dias: -1) }
        return d.sumando(dias: desplazamiento)
    }
}
