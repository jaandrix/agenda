import SwiftUI

// Piezas de Finanzas en el lenguaje de Bitácora 2.0 que aún no están en DesignSystem/V2. Candidatas a subir allí:
// ChipCifra, BarraCapsula, FilaDato, TarjetaSeccion, BotonAcceso y LineaSerie/AreaSerie.

/// Variación de dinero en cápsula: verde si sube, roja si baja, gris si no cambia. `sobreOscuro` para la tarjeta negra.
struct ChipCifra: View {
    let texto: String
    let signo: Int           // 1 sube, -1 baja, 0 igual
    var sobreOscuro = false

    var body: some View {
        HStack(spacing: 3) {
            if signo != 0 {
                Image(systemName: signo > 0 ? "arrow.up.right" : "arrow.down.right").font(.system(size: 9, weight: .heavy))
            }
            Text(texto).font(Letra.pieFuerte).monospacedDigit().lineLimit(1)
        }
        .padding(.horizontal, 10).frame(height: 24)
        .foregroundStyle(tinta)
        .background(fondo, in: Capsule())
        .contentTransition(.numericText())
    }

    private var tinta: Color {
        signo > 0 ? Lienzo.positivo : signo < 0 ? Lienzo.negativo : (sobreOscuro ? Lienzo.sobreOscuroSuave : Lienzo.tintaSecundaria)
    }
    private var fondo: Color {
        if sobreOscuro { return Color.white.opacity(0.1) }
        return signo > 0 ? Lienzo.positivo.opacity(0.12) : signo < 0 ? Lienzo.negativo.opacity(0.1) : Lienzo.sutil
    }
}

/// Barra de avance en cápsula que crece con un muelle al aparecer. `rayada` marca lo que se ha pasado.
struct BarraCapsula: View {
    let valor: Double
    var color: Color = Lienzo.naranja
    var fondo: Color = Lienzo.sutil
    var alto: CGFloat = 6
    var falta: Double = 0      // tramo pálido a continuación (lo que aún falta por entrar)
    @State private var visto = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        GeometryReader { g in
            let v = min(max(valor, 0), 1)
            let f = min(max(falta, 0), 1 - v)
            ZStack(alignment: .leading) {
                Capsule().fill(fondo)
                if f > 0 {
                    Capsule().fill(color.opacity(0.28)).frame(width: g.size.width * (v + f) * (visto ? 1 : 0))
                }
                Capsule().fill(color).frame(width: max(v > 0 ? alto : 0, g.size.width * v * (visto ? 1 : 0)))
            }
        }
        .frame(height: alto)
        .onAppear { withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento).delay(0.05)) { visto = true } }
        .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: valor)
        .accessibilityHidden(true)
    }
}

/// Fila de dato «etiqueta …… valor» dentro de una tarjeta, con letra pequeña.
struct FilaDato: View {
    let etiqueta: String
    var valor: String = ""
    var tono: Color = Lienzo.tinta
    var separador = true

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Medida.xs) {
            Text(etiqueta).font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(2)
            Spacer(minLength: Medida.xs)
            if !valor.isEmpty {
                Text(valor).font(Letra.numero).foregroundStyle(tono).lineLimit(1).contentTransition(.numericText())
            }
        }
        .frame(minHeight: 40)
        .overlay(alignment: .bottom) { if separador { Rectangle().fill(Lienzo.filo).frame(height: 1) } }
        .accessibilityElement(children: .combine)
    }
}

/// Sección de Finanzas: etiqueta pequeña encima y el contenido en una tarjeta blanca.
struct TarjetaSeccion<Contenido: View>: View {
    let titulo: String
    var detalle: String?
    var accion: (titulo: String, hacer: () -> Void)?
    var relleno: CGFloat = Medida.rellenoTarjeta
    var arriba: CGFloat = Medida.entreSecciones
    var enTarjeta = true          // false: el contenido trae su propia tarjeta (TarjetaLista)
    @ViewBuilder var contenido: () -> Contenido

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            HStack(alignment: .firstTextBaseline) {
                EtiquetaSeccion(texto: titulo, accion: accion)
                if let detalle, accion == nil {
                    Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit().lineLimit(1)
                        .padding(.trailing, Medida.xxs)
                }
            }
            if enTarjeta {
                VStack(alignment: .leading, spacing: 0) { contenido() }
                    .tarjeta(relleno: relleno)
            } else {
                contenido()
            }
        }
        .padding(.top, arriba)
    }
}

/// Lista de filas dentro de una tarjeta blanca: relleno lateral normal, poco vertical y separadores sangrados.
struct TarjetaLista<Elemento: Identifiable, Fila: View>: View {
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
        .tarjeta(relleno: 0)
    }
}

/// Botón redondo blanco que abre un menú (BotonRedondo es un Button y no puede ser la etiqueta de un Menu).
struct MenuRedondo<Contenido: View>: View {
    var sistema = "ellipsis"
    let etiqueta: String
    @ViewBuilder var contenido: () -> Contenido

    var body: some View {
        Menu { contenido() } label: {
            Image(systemName: sistema)
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(Lienzo.tinta)
                .frame(width: 40, height: 40)
                .background(Lienzo.tarjeta, in: Circle())
                .overlay(Circle().strokeBorder(Lienzo.filo))
                .frame(minWidth: Medida.toque, minHeight: Medida.toque)
                .contentShape(Circle())
        }
        .accessibilityLabel(etiqueta)
    }
}

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

/// Línea de una serie normalizada (0…1) para animarla con `.trim`. `margenX` deja sitio al punto del extremo.
struct LineaSerie: Shape {
    let puntos: [Double]
    var margenX: CGFloat = 3

    func path(in r: CGRect) -> Path {
        var p = Path()
        let n = puntos.count
        guard n > 0 else { return p }
        for (i, v) in puntos.enumerated() {
            let x = CGFloat(i) / CGFloat(max(n - 1, 1)) * (r.width - margenX * 2) + margenX
            let y = r.height - CGFloat(v) * r.height
            if i == 0 { p.move(to: CGPoint(x: x, y: y)) } else { p.addLine(to: CGPoint(x: x, y: y)) }
        }
        return p
    }
}

/// El área bajo la serie, para un relleno muy tenue.
struct AreaSerie: Shape {
    let puntos: [Double]
    var margenX: CGFloat = 3

    func path(in r: CGRect) -> Path {
        var p = LineaSerie(puntos: puntos, margenX: margenX).path(in: r)
        guard !puntos.isEmpty else { return p }
        p.addLine(to: CGPoint(x: r.width - margenX, y: r.height))
        p.addLine(to: CGPoint(x: margenX, y: r.height))
        p.closeSubpath()
        return p
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
