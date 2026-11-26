import SwiftUI

// Piezas propias de Inicio. TipoPunto, Letra.dia y la cabecera de portada viven ya en DesignSystem/V2.

enum MedidaInicio {
    static let alturaSemana: CGFloat = 76
    static let avatar: CGFloat = 32
    static let puntoSemana: CGFloat = 4.5
    static let puntoFila: CGFloat = 8
    static let sinDiaVisibles = 5
}

// 3.2: título de sección en minúscula con punto, como SeccionPlegable (Letra.seccion), en vez de la etiqueta en
// MAYÚSCULAS de EtiquetaSeccion. Lo usan Inicio, mi perfil y el tiempo; candidato a DesignSystem/V2.
struct TituloSeccion: View {
    let texto: String
    var detalle: String?
    var accion: (titulo: String, hacer: () -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Medida.xs) {
            Text(texto).font(Letra.seccion).foregroundStyle(Lienzo.tinta)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: Medida.xs)
            if let accion {
                Button(accion.titulo, action: accion.hacer).font(Letra.pieFuerte).estiloEnlace()
                    .frame(minHeight: Medida.toque)
                    .contentShape(Rectangle())
                    .buttonStyle(.pulsable(0.94))
            } else if let detalle {
                Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
            }
        }
        .padding(.horizontal, Medida.xxs)
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
    // 3.4: con el evento y su día, la pastilla «qr.» abre las entradas sin pasar por la ficha.
    var evento: EventoDia?
    var dia: LocalDay?
    var abrir: (() -> Void)?

    // 3.2, «pastel.»: el evento va en la tarjeta rellena de su tipo y la segunda línea en el tono oscuro de ese color.
    // Lo suave (pagos) sigue en blanco.
    private var tipoTarjeta: TipoPunto { suave ? .otro : tipo }
    private var tintaDetalle: Color { tipoTarjeta.tintaRelleno }

    private var contenido: some View {
        HStack(spacing: 0) {
            Puntito(color: suave ? Lienzo.tintaTerciaria : tipo.color, tamano: MedidaInicio.puntoFila)
                .frame(width: Medida.iconoPequeno, height: Medida.iconoPequeno)
                .background(tipoTarjeta.relleno == nil ? Color.clear : Lienzo.sobreRelleno,
                            in: RoundedRectangle(cornerRadius: Medida.concentrico(Medida.radioFila, relleno: Medida.xs), style: .continuous))
                .frame(width: Medida.toque, height: Medida.toque)
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo).font(Letra.cuerpoFuerte).foregroundStyle(suave ? Lienzo.tintaSecundaria : Lienzo.tinta)
                    .lineLimit(2).multilineTextAlignment(.leading)
                if !detalle.isEmpty {
                    Text(detalle).font(Letra.pie).foregroundStyle(tintaDetalle).lineLimit(2)
                }
            }
            Spacer(minLength: Medida.xs)
            if entradas > 0 {
                if let evento, let dia {
                    BotonQRDirecto(evento: evento, dia: dia, texto: "qr.", tono: tipoTarjeta.relleno == nil ? .sutil : .blanco).padding(.trailing, Medida.xs)
                } else {
                    Chip(texto: "qr.", tono: tipoTarjeta.relleno == nil ? .sutil : .blanco, icono: "qrcode").padding(.trailing, Medida.xs)
                }
            }
            if let hora { Text(hora).font(Letra.hora).foregroundStyle(tintaDetalle) }
        }
        .frame(minHeight: Medida.toque)
        .padding(.trailing, Medida.s)
        .tarjetaTipo(tipoTarjeta, relleno: Medida.xxs, radio: Medida.radioFila)
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
