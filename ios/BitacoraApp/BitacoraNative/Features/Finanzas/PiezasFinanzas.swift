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

/// 3.2: colores de Finanzas que aún no están en DesignSystem/V2 (subirlos en la próxima tanda). La tendencia de una
/// cuenta: verde palo y el granate de la casa (#8A2233, el de teja). Los dos pasan de 3:1 sobre blanco.
enum TonoFinanzas {
    static let subeVerdePalo = Color(uiColor: UIColor(rgb: 0x4F8A63))
    static let bajaGranate = Color(uiColor: UIColor(rgb: 0x8A2233))
}

/// 3.2: flecha pequeña de la tendencia de una cuenta en 60 días (1 sube, -1 baja, 0 estable: nada).
struct FlechaTendencia: View {
    let tendencia: Int

    var body: some View {
        if tendencia != 0 {
            Image(systemName: tendencia > 0 ? "arrow.up.right" : "arrow.down.right")
                .font(Letra.pieFuerte).imageScale(.small)
                .foregroundStyle(tendencia > 0 ? TonoFinanzas.subeVerdePalo : TonoFinanzas.bajaGranate)
                .accessibilityLabel(tendencia > 0 ? "sube en los últimos 60 días." : "baja en los últimos 60 días.")
        }
    }
}

/// 3.2: la tarjeta de una lista de movimientos. Como TarjetaLista, pero la sombra se dibuja solo con la forma del fondo:
/// `.sombra` sobre la tarjeta entera componía fuera de pantalla todo lo de dentro (textos, iconos) en cada pintado y en
/// cada fila al hacer scroll, que era parte del tirón de Movimientos.
struct TarjetaMovs<Elemento: Identifiable, Fila: View>: View {
    let elementos: [Elemento]
    @ViewBuilder var fila: (Elemento) -> Fila

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(elementos.enumerated()), id: \.element.id) { i, e in
                if i > 0 { SeparadorFila() }
                fila(e)
            }
        }
        .padding(.horizontal, Medida.rellenoTarjeta)
        .padding(.vertical, Medida.xxs)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous)
                .fill(Lienzo.tarjeta)
                .overlay(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous).strokeBorder(Lienzo.filo))
                .sombra(.suave)
        }
    }
}
