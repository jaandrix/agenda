import SwiftUI

// Piezas propias de Finanzas. ChipCifra, BarraFina, FilaDato, FilaImporte, TarjetaSeccion, TarjetaLista, MenuRedondo y
// LineaSerie/AreaSerie viven ya en DesignSystem/V2.

/// Acceso rápido: icono cuadrado grande sobre una tarjeta y su nombre debajo (gasto, ingreso, traspaso, importar).
struct BotonAcceso: View {
    let titulo: String
    let icono: String          // clave de IconosCategorias.xcassets
    var destacado = false
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            VStack(spacing: Medida.xs) {
                IconoFinanzas(clave: icono, tono: destacado ? .naranja : .claro, tamano: Medida.iconoGrande)
                Text(titulo).font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta).lineLimit(1).minimumScaleFactor(0.85)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Medida.s)
            .background(Lienzo.tarjeta, in: RoundedRectangle(cornerRadius: Medida.radioFila, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Medida.radioFila, style: .continuous).strokeBorder(Lienzo.filo))
            .sombra(.suave)
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioFila, style: .continuous))
        }
        .buttonStyle(.pulsable(0.94))
        .accessibilityLabel(titulo)
    }
}

/// Un icono del set de categorías de Finanzas en el cuadrado de IconoCuadrado (mismos radios y tonos).
struct IconoFinanzas: View {
    enum Tono { case claro, naranja, oscuro, translucido }
    let clave: String
    var tono: Tono = .claro
    var tamano: CGFloat = Medida.icono

    var body: some View {
        RoundedRectangle(cornerRadius: tamano * 0.3, style: .continuous)
            .fill(fondo)
            .overlay {
                Image(IconosCategoria.imagen(clave)).renderingMode(.template).resizable().scaledToFit()
                    .foregroundStyle(tinta).padding(tamano * 0.24)
            }
            .frame(width: tamano, height: tamano)
            .accessibilityHidden(true)
    }

    private var fondo: Color {
        switch tono {
        case .claro: Lienzo.sutil
        case .naranja: Lienzo.naranja
        case .oscuro: Lienzo.oscuro
        case .translucido: Color.white.opacity(0.1)
        }
    }
    private var tinta: Color {
        switch tono {
        case .claro: Lienzo.tinta
        case .naranja: Lienzo.sobreNaranja
        case .oscuro, .translucido: Lienzo.sobreOscuro
        }
    }
}

/// Texto de dinero que se puede esconder («•••») con el signo tipográfico.
enum CifraFin {
    static func texto(_ v: Double, oculto: Bool, signo: Bool = false) -> String {
        guard !oculto else { return "•••" }
        guard signo else { return FormatoFin.dinero(v) }
        return (v > 0 ? "+" : v < 0 ? "−" : "") + FormatoFin.dinero(abs(v))
    }
}
