import SwiftUI

// Fechas comunes de Bitácora 3.0: el bloque de día, la cuenta atrás y qué color lleva cada tipo de cosa. Antes vivían en
// Eventos (BloqueFechaEvento, TextoEventos), Estudios (CuentaEstudios) e Inicio (TipoPunto).

extension LocalDay {
    /// Días civiles de `self` a `otro` (negativo si `otro` ya pasó).
    func dias(hasta otro: LocalDay) -> Int {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let f = { (d: LocalDay) in cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))! }
        return cal.dateComponents([.day], from: f(self), to: f(otro)).day ?? 0
    }
}

/// Día grande y mes en etiqueta dentro de un squircle. Naranja para hoy o lo próximo; oscuro dentro de lo destacado;
/// claro para el resto; apagado para lo pasado.
struct BloqueFecha: View {
    enum Tono { case naranja, claro, oscuro, apagado }
    let dia: LocalDay
    var tono: Tono = .claro
    var grande = false

    private static let meses = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"]

    var body: some View {
        let lado = grande ? Medida.bloqueFechaGrande : Medida.bloqueFecha
        VStack(spacing: 0) {
            Text(Self.meses[dia.month - 1]).font(Letra.mesBloque).tracking(Letra.espaciado * 0.6)
                .foregroundStyle(etiqueta)
            Text("\(dia.day)").font(grande ? Letra.diaBloqueGrande : Letra.diaBloque).kerning(-0.6)
                .foregroundStyle(tinta)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(width: lado, height: lado)
        .background(fondo, in: RoundedRectangle(cornerRadius: grande ? Medida.radioFila : Medida.radioControl, style: .continuous))
        .accessibilityHidden(true)
    }

    private var fondo: Color {
        switch tono {
        case .naranja: Lienzo.naranja
        case .claro, .apagado: Lienzo.sutil
        case .oscuro: Lienzo.oscuroElevado
        }
    }
    private var tinta: Color {
        switch tono {
        case .naranja: Lienzo.sobreNaranja
        case .claro: Lienzo.tinta
        case .apagado: Lienzo.tintaTerciaria
        case .oscuro: Lienzo.sobreOscuro
        }
    }
    private var etiqueta: Color {
        switch tono {
        case .naranja: Lienzo.sobreNaranja.opacity(0.7)
        case .claro: Lienzo.tintaSecundaria
        case .apagado: Lienzo.tintaTerciaria
        case .oscuro: Lienzo.sobreOscuroSuave
        }
    }
}

/// Textos de cuenta atrás: «hoy.», «mañana.», «en 3 días.», «hace 2 días.» (grande, con `Letra.cuentaAtras`) y su
/// versión corta para un Chip («3 días», «vencido»).
enum CuentaAtras {
    /// Texto grande a partir de los días que faltan.
    static func texto(dias d: Int) -> String {
        switch d {
        case ..<0: return d == -1 ? "ayer." : "hace \(-d) días."
        case 0: return "hoy."
        case 1: return "mañana."
        default: return "en \(d) días."
        }
    }

    /// Texto corto del chip.
    static func chip(dias d: Int) -> String {
        switch d {
        case ..<0: return "vencido"
        case 0: return "hoy"
        case 1: return "mañana"
        default: return "\(d) días"
        }
    }

    /// Como `texto(dias:)`, pero hoy con hora dice lo que falta en horas y minutos («en 40 min.», «ya ha empezado.»).
    static func texto(_ dia: LocalDay, hora: String?, hoy: LocalDay, ahora: Date = Date()) -> String {
        let n = hoy.dias(hasta: dia)
        guard n == 0 else { return texto(dias: n) }
        guard let m = minutos(hora) else { return "hoy." }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let c = cal.dateComponents([.hour, .minute], from: ahora)
        let falta = m - ((c.hour ?? 0) * 60 + (c.minute ?? 0))
        if falta <= 0 { return "ya ha empezado." }
        if falta < 60 { return "en \(falta) min." }
        return falta % 60 == 0 ? "en \(falta / 60) h." : "en \(falta / 60) h \(falta % 60) min."
    }

    /// «HH:MM» → minutos desde medianoche.
    static func minutos(_ hora: String?) -> Int? {
        guard let p = hora?.split(separator: ":"), p.count >= 2, let h = Int(p[0]), let m = Int(p[1]) else { return nil }
        return h * 60 + m
    }
}

/// Qué hay un día, para los puntitos (semana, mes, filas). Siempre por significado (`Lienzo.Punto`), nunca por gusto.
enum TipoPunto: Int, Comparable, Hashable {
    case evento, tarea, estudio, cumple, viaje, dinero, otro

    static func < (a: TipoPunto, b: TipoPunto) -> Bool { a.rawValue < b.rawValue }

    var color: Color {
        switch self {
        case .evento: Lienzo.Punto.evento
        case .tarea: Lienzo.Punto.tarea
        case .estudio: Lienzo.Punto.estudio
        case .cumple: Lienzo.Punto.cumple
        case .viaje: Lienzo.Punto.viaje
        case .dinero: Lienzo.Punto.dinero
        case .otro: Lienzo.Punto.otro
        }
    }

    /// El `tipo` de EventoDia (LecturaCalendario y los partidos).
    static func de(_ tipo: String) -> TipoPunto {
        switch tipo {
        case "birthday": .cumple
        case "estudio", "exam", "assignment": .estudio
        case "travel": .viaje
        case "pago": .dinero
        case "work", "laboral": .otro
        default: .evento
        }
    }
}
