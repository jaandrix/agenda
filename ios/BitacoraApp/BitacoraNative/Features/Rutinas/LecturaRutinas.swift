import Foundation

// Lectura propia de Rutinas 2.0 (solo lectura de `habits`). Mismo criterio que LecturaMas.vista para saber qué toca hoy,
// y además la semana día a día y la racha de habitStreak (js/planificador.js), para pintar los puntitos y las rachas.

enum MomentoRutina: String, CaseIterable, Sendable, Identifiable {
    case manana, tarde, noche, cuandoSea = ""

    var id: String { rawValue }
    var titulo: String {
        switch self {
        case .manana: "por la mañana."
        case .tarde: "por la tarde."
        case .noche: "por la noche."
        case .cuandoSea: "cuando sea."
        }
    }

    // Lo que la web no conoce cae en «cuando sea.», como hace RUTINA_MOMENTOS con un momento vacío.
    static func de(_ texto: String) -> MomentoRutina { MomentoRutina(rawValue: texto) ?? .cuandoSea }
}

struct DiaRutina: Sendable, Equatable, Identifiable {
    let iso: String
    var hecho: Bool
    let toca: Bool
    let esHoy: Bool
    let futuro: Bool
    var id: String { iso }
}

struct RutinaHoy: Sendable, Equatable, Identifiable {
    enum Frecuencia: Sendable, Equatable { case diaria, dias, semana(veces: Int) }

    let id: String
    let texto: String
    let momento: MomentoRutina
    var hecha: Bool
    var semana: [DiaRutina]          // de lunes a domingo
    let frecuencia: Frecuencia
    // Racha sin contar hoy (días seguidos hasta ayer, o semanas cumplidas antes de esta): al marcar se recalcula sin
    // volver a leer el documento.
    let rachaPrevia: Int

    var hechasSemana: Int { semana.filter(\.hecho).count }

    var racha: Int {
        switch frecuencia {
        case .semana(let veces): hechasSemana >= veces ? rachaPrevia + 1 : rachaPrevia
        case .diaria, .dias: rachaPrevia + (hecha ? 1 : 0)
        }
    }

    var detalle: String? {
        let r = racha
        if case .semana(let veces) = frecuencia {
            if r >= 2 { return "\(r) semanas seguidas." }
            return "\(hechasSemana) de \(veces) esta semana."
        }
        return r >= 2 ? "\(r) días seguidos." : nil
    }

    mutating func marcar(_ valor: Bool) {
        hecha = valor
        if let i = semana.firstIndex(where: \.esHoy) { semana[i].hecho = valor }
    }
}

struct VistaRutinas: Sendable, Equatable {
    var rutinas: [RutinaHoy]
    let activas: Int                 // activas en total, toquen hoy o no (para el estado vacío)

    var hechas: Int { rutinas.filter(\.hecha).count }
    var progreso: Double { rutinas.isEmpty ? 0 : Double(hechas) / Double(rutinas.count) }
    var completa: Bool { !rutinas.isEmpty && hechas == rutinas.count }
    var mejorRacha: RutinaHoy? { rutinas.filter { $0.racha >= 2 }.max { $0.racha < $1.racha } }

    func de(_ m: MomentoRutina) -> [RutinaHoy] { rutinas.filter { $0.momento == m } }
}

enum LecturaRutinas {
    static func vista(_ doc: DocumentoBitacora, hoy: LocalDay = CalendarioBitacora.madrid.dia(de: Date())) -> VistaRutinas {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        // 0 = domingo, como getDay() en la web.
        let semanaDe = { (d: LocalDay) -> Int in
            cal.component(.weekday, from: cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))!) - 1
        }
        let diaHoy = semanaDe(hoy)
        let lunes = hoy.sumando(dias: -((diaHoy + 6) % 7))
        var rutinas: [RutinaHoy] = []
        var activas = 0
        for x in ((try? doc.valor(de: "habits")) ?? nil)?.lista ?? [] {
            guard let o = x.objeto, let id = o["id"]?.comoId, o["activo"]?.booleano != false else { continue }
            activas += 1
            let f = o["frecuencia"]?.objeto
            let dias = Set((f?["dias"]?.lista ?? []).compactMap { Dinero.decimal($0) }.map { NSDecimalNumber(decimal: $0).intValue })
            let frecuencia: RutinaHoy.Frecuencia
            switch f?["tipo"]?.texto {
            case "dias" where !dias.isEmpty: frecuencia = .dias
            case "semana": frecuencia = .semana(veces: max(1, Dinero.decimal(f?["veces"]).map { NSDecimalNumber(decimal: $0).intValue } ?? 1))
            default: frecuencia = .diaria
            }
            let toca = { (diaSemana: Int) -> Bool in frecuencia != .dias || dias.contains(diaSemana) }
            guard toca(diaHoy) else { continue }
            let hechas = o["completadas"]?.objeto ?? [:]
            let hecho = { (d: LocalDay) -> Bool in hechas[d.iso]?.booleano == true }

            let semana = (0..<7).map { i -> DiaRutina in
                let d = lunes.sumando(dias: i)
                return DiaRutina(iso: d.iso, hecho: hecho(d), toca: toca((i + 1) % 7), esHoy: d == hoy, futuro: hoy < d)
            }

            var previa = 0
            switch frecuencia {
            case .semana(let veces):
                // Semanas cumplidas antes de esta (habitStreak con tipo «semana»).
                var l = lunes.sumando(dias: -7)
                for _ in 0..<300 {
                    guard (0..<7).filter({ hecho(l.sumando(dias: $0)) }).count >= veces else { break }
                    previa += 1
                    l = l.sumando(dias: -7)
                }
            case .diaria, .dias:
                // Desde ayer hacia atrás: lo hecho suma, un día que tocaba y no se hizo corta, el que no tocaba se salta.
                var d = hoy.sumando(dias: -1)
                var ds = (diaHoy + 6) % 7
                for _ in 0..<2000 {
                    if hecho(d) { previa += 1 } else if toca(ds) { break }
                    d = d.sumando(dias: -1)
                    ds = (ds + 6) % 7
                }
            }

            rutinas.append(RutinaHoy(id: id, texto: o["texto"]?.texto ?? "", momento: .de(o["momento"]?.texto ?? ""),
                                     hecha: hecho(hoy), semana: semana, frecuencia: frecuencia, rachaPrevia: previa))
        }
        return VistaRutinas(rutinas: rutinas, activas: activas)
    }
}
