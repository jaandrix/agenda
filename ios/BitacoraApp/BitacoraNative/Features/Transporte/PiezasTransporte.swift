import SwiftUI

// Piezas propias de Transporte (rediseño 2.0). Candidatas a subir a DesignSystem/V2 si otro apartado las necesita.

/// Número de línea en cápsula. A diferencia de `Chip(.naranja)`, que es un tinte, aquí el naranja es relleno entero:
/// sobre la tarjeta oscura el tinte se pierde.
struct ChipLinea: View {
    enum Tono { case naranja, sutil, elevado }
    let linea: String
    var tono: Tono = .sutil

    var body: some View {
        Text(linea).font(Letra.pieFuerte).monospacedDigit().lineLimit(1)
            .foregroundStyle(tinta)
            .padding(.horizontal, Medida.xs)
            .frame(minWidth: Medida.icono, minHeight: Medida.xl)
            .background(fondo, in: Capsule())
    }

    private var fondo: Color {
        switch tono {
        case .naranja: Lienzo.naranja
        case .sutil: Lienzo.sutil
        case .elevado: Lienzo.oscuroElevado
        }
    }
    private var tinta: Color {
        switch tono {
        case .naranja: Lienzo.sobreNaranja
        case .sutil: Lienzo.tinta
        case .elevado: Lienzo.sobreOscuro
        }
    }
}

/// Los minutos que faltan: la cifra cambia rodando (`numericText`) cuando llega una lectura nueva, sin parpadeo; «ya»
/// va en naranja con el punto vivo.
struct MinutosBus: View {
    let minutos: Int?
    var oscuro = false
    var grande = false

    var body: some View {
        Group {
            if let m = minutos, m == 0 {
                HStack(spacing: Medida.xs) {
                    PuntoVivo(color: Lienzo.naranja)
                    Text("ya").font(cifra).foregroundStyle(oscuro ? Lienzo.naranja : Lienzo.naranjaProfundo)
                }
            } else if let m = minutos {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("\(m)").font(cifra).foregroundStyle(oscuro ? Lienzo.sobreOscuro : Lienzo.tinta)
                        .contentTransition(.numericText(value: Double(m)))
                    Text("min").font(Letra.pie).foregroundStyle(oscuro ? Lienzo.sobreOscuroSuave : Lienzo.tintaSecundaria)
                }
            } else {
                Text("sin hora").font(Letra.pie).foregroundStyle(oscuro ? Lienzo.sobreOscuroSuave : Lienzo.tintaSecundaria)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(minutos.map { $0 == 0 ? "llegando ya" : "en \($0) minutos" } ?? "sin hora")
    }

    private var cifra: Font { grande ? Letra.numeroGrande : Letra.numero }
}
