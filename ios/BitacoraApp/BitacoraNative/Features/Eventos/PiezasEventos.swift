import SwiftUI

// Piezas propias de Eventos en Bitácora 2.0. Candidatas a subir a DesignSystem/V2 (anotado en el informe del rediseño):
// el bloque de fecha y los tamaños de letra que necesita.

enum LetraEventos {
    static var diaBloque: Font { Tipo.poppins(19, .bold, estilo: .title3).monospacedDigit() }
    static var diaBloqueGrande: Font { Tipo.poppins(26, .bold, estilo: .title).monospacedDigit() }
    static var mesBloque: Font { Tipo.poppins(9, .semibold, estilo: .caption2) }
    static var cuentaAtras: Font { Tipo.poppins(20, .semibold, estilo: .title3).monospacedDigit() }
    static var marcaAgua: Font { Tipo.poppins(64, .bold, estilo: .largeTitle) }
}

enum MedidaEventos {
    static let bloque: CGFloat = 48
    static let bloqueGrande: CGFloat = 64
    static let qrMiniatura: CGFloat = 52
}

/// Día grande y mes en etiqueta pequeña dentro de un squircle. Naranja para hoy o el próximo; oscuro dentro de lo
/// destacado; claro para el resto; apagado para lo pasado.
struct BloqueFechaEvento: View {
    enum Tono { case naranja, claro, oscuro, apagado }
    let dia: LocalDay
    var tono: Tono = .claro
    var grande = false

    private static let meses = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"]

    var body: some View {
        let lado = grande ? MedidaEventos.bloqueGrande : MedidaEventos.bloque
        VStack(spacing: 0) {
            Text(Self.meses[dia.month - 1]).font(LetraEventos.mesBloque).tracking(Letra.espaciado * 0.6)
                .foregroundStyle(etiqueta)
            Text("\(dia.day)").font(grande ? LetraEventos.diaBloqueGrande : LetraEventos.diaBloque).kerning(-0.6)
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

// Textos de fecha y cuenta atrás compartidos por la lista y la ficha.
enum TextoEventos {
    /// «hoy.», «mañana.», «en 3 días.», «hace 2 días.»; hoy con hora, lo que falta en horas y minutos.
    static func cuentaAtras(_ dia: LocalDay, hora: String?, hoy: LocalDay, ahora: Date = Date()) -> String {
        let n = hoy.dias(hasta: dia)
        if n < 0 { return n == -1 ? "ayer." : "hace \(-n) días." }
        if n == 1 { return "mañana." }
        if n > 1 { return "en \(n) días." }
        guard let m = minutos(hora) else { return "hoy." }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let c = cal.dateComponents([.hour, .minute], from: ahora)
        let falta = m - ((c.hour ?? 0) * 60 + (c.minute ?? 0))
        if falta <= 0 { return "ya ha empezado." }
        if falta < 60 { return "en \(falta) min." }
        return falta % 60 == 0 ? "en \(falta / 60) h." : "en \(falta / 60) h \(falta % 60) min."
    }

    static func minutos(_ hora: String?) -> Int? {
        guard let p = hora?.split(separator: ":"), p.count >= 2, let h = Int(p[0]), let m = Int(p[1]) else { return nil }
        return h * 60 + m
    }

    static func horario(_ e: EventoDia) -> String? {
        guard let h = e.hora else { return nil }
        return e.fin.map { "de \(h) a \($0)" } ?? h
    }
}
