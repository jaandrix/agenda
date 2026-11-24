import SwiftUI

// Piezas propias de Inicio en Bitácora 2.0. Lo que aquí sea útil para otras pantallas (MedidaInicio, LetraInicio,
// TipoPunto, las filas en tarjeta) conviene subirlo a DesignSystem/V2 al unir las ramas.

enum MedidaInicio {
    static let degradado: CGFloat = 360
    // Lo que el degradado sube por detrás de la barra de estado, para que no se vea su borde al tirar hacia abajo.
    static let sobreBorde: CGFloat = 140
    static let alturaSemana: CGFloat = 76
    static let avatar: CGFloat = 32
    static let puntoSemana: CGFloat = 4.5
    static let puntoFila: CGFloat = 8
    static let sinDiaVisibles = 5
}

enum LetraInicio {
    // El número de un día normal: mismo cuerpo que Letra.numero, sin negrita, para que el elegido no baile al cambiar.
    static var dia: Font { Tipo.poppins(15, .regular, estilo: .headline).monospacedDigit() }
}

// Qué hay un día, para los puntitos de la semana. Siempre por significado (Lienzo.Punto), nunca por gusto.
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

    // El `tipo` de EventoDia (LecturaCalendario y los partidos).
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

// Una tarea del día en su tarjeta blanca: casilla a la izquierda (solo marca), el resto abre la tarea.
struct FilaTareaInicio: View {
    let hora: String?
    let titulo: String
    var notas = ""
    let hecha: Bool
    var arrastrada = false
    var subtareas = 0
    var subHechas = 0
    let marcar: () -> Void
    let abrir: () -> Void

    private var detalle: String? {
        var partes: [String] = []
        if arrastrada && !hecha { partes.append("de antes.") }
        if subtareas > 0 { partes.append("\(subHechas)/\(subtareas)") }
        if !notas.isEmpty { partes.append(notas) }
        return partes.isEmpty ? nil : partes.joined(separator: ", ")
    }

    var body: some View {
        HStack(spacing: 0) {
            CasillaMarcar(hecha: hecha, marcar: marcar)
            Button(action: abrir) {
                HStack(alignment: .center, spacing: Medida.s) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(titulo).font(Letra.cuerpoFuerte)
                            .foregroundStyle(hecha ? Lienzo.tintaTerciaria : Lienzo.tinta)
                            .strikethrough(hecha, color: Lienzo.tintaTerciaria)
                            .lineLimit(2).multilineTextAlignment(.leading)
                        if let detalle {
                            Text(detalle).font(Letra.pie)
                                .foregroundStyle(arrastrada && !hecha ? Lienzo.naranjaProfundo : Lienzo.tintaSecundaria)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: Medida.xs)
                    if let hora { Text(hora).font(Letra.hora).foregroundStyle(Lienzo.tintaSecundaria) }
                }
                .frame(maxWidth: .infinity, minHeight: Medida.toque, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pulsable(0.98))
            .accessibilityElement(children: .combine)
            .accessibilityHint("abrir la tarea")
        }
        .padding(.trailing, Medida.s)
        .tarjeta(relleno: Medida.xxs, radio: Medida.radioFila)
        .animation(Muelle.rapido, value: hecha)
    }
}

// Un evento del día: puntito del color de su tipo, título, detalle y hora pequeña a la derecha.
struct FilaEventoInicio: View {
    let hora: String?
    let titulo: String
    var detalle = ""
    var tipo: TipoPunto = .evento
    var suave = false
    var entradas = 0
    var abrir: (() -> Void)?

    private var contenido: some View {
        HStack(spacing: 0) {
            Puntito(color: suave ? Lienzo.tintaTerciaria : tipo.color, tamano: MedidaInicio.puntoFila)
                .frame(width: Medida.toque, height: Medida.toque)
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo).font(Letra.cuerpoFuerte).foregroundStyle(suave ? Lienzo.tintaSecundaria : Lienzo.tinta)
                    .lineLimit(2).multilineTextAlignment(.leading)
                if !detalle.isEmpty {
                    Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(2)
                }
            }
            Spacer(minLength: Medida.xs)
            if entradas > 0 { Chip(texto: "qr.", tono: .sutil, icono: "qrcode").padding(.trailing, Medida.xs) }
            if let hora { Text(hora).font(Letra.hora).foregroundStyle(Lienzo.tintaSecundaria) }
        }
        .frame(minHeight: Medida.toque)
        .padding(.trailing, Medida.s)
        .tarjeta(relleno: Medida.xxs, radio: Medida.radioFila)
        .contentShape(RoundedRectangle(cornerRadius: Medida.radioFila, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    var body: some View {
        if let abrir {
            Button(action: abrir) { contenido }
                .buttonStyle(.pulsable(0.98))
                .accessibilityHint("abrir el evento")
        } else {
            contenido
        }
    }
}
