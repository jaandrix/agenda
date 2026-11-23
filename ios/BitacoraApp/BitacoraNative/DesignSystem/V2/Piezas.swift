import SwiftUI

// Piezas base de Bitácora 2.0: estilos de botón táctiles, iconos cuadrados, la marca «b.» y chips.

// MARK: - Toque

/// Todo lo pulsable usa esto (o EstiloCapsula, que lo lleva dentro): se hunde con muelle, baja un punto de brillo y da un
/// toque ligero al apoyar. Nunca un Button con .plain sin estado de pulsado.
struct Pulsable: ButtonStyle {
    var escala: CGFloat = 0.96
    var haptica = true

    func makeBody(configuration: Configuration) -> some View {
        CuerpoPulsable(etiqueta: configuration.label, pulsado: configuration.isPressed, escala: escala, haptica: haptica)
    }
}

private struct CuerpoPulsable<Etiqueta: View>: View {
    let etiqueta: Etiqueta
    let pulsado: Bool
    let escala: CGFloat
    let haptica: Bool
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @Environment(\.isEnabled) private var activo

    var body: some View {
        etiqueta
            .scaleEffect(pulsado && !sinMovimiento ? escala : 1)
            .brightness(pulsado ? -0.025 : 0)
            .opacity(activo ? 1 : 0.45)
            .animation(pulsado ? Muelle.toque : Muelle.soltar, value: pulsado)
            .sensoryFeedback(.impact(weight: .light, intensity: 0.55), trigger: pulsado) { _, ahora in haptica && ahora }
    }
}

extension ButtonStyle where Self == Pulsable {
    static var pulsable: Pulsable { Pulsable() }
    static func pulsable(_ escala: CGFloat) -> Pulsable { Pulsable(escala: escala) }
}

/// Botón cápsula (foto 3: «Reflect» negro, «Personalize» gris). `ancho: true` ocupa toda la fila.
struct EstiloCapsula: ButtonStyle {
    enum Tono { case oscuro, claro, naranja, blanco }
    var tono: Tono = .oscuro
    var ancho = false
    var alto: CGFloat = Medida.alturaControl

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Letra.boton)
            .lineLimit(1)
            .foregroundStyle(tinta)
            .padding(.horizontal, 20)
            .frame(maxWidth: ancho ? .infinity : nil, minHeight: alto)
            .background(fondo, in: Capsule())
            .overlay { if tono == .blanco { Capsule().strokeBorder(Lienzo.filo) } }
            .contentShape(Capsule())
            .modifier(CapsulaPulsada(pulsado: configuration.isPressed))
    }

    private var fondo: Color {
        switch tono {
        case .oscuro: Lienzo.oscuro
        case .claro: Lienzo.sutil
        case .naranja: Lienzo.naranja
        case .blanco: Lienzo.tarjeta
        }
    }
    private var tinta: Color {
        switch tono {
        case .oscuro: Lienzo.sobreOscuro
        case .naranja: Lienzo.sobreNaranja
        case .claro, .blanco: Lienzo.tinta
        }
    }
}

private struct CapsulaPulsada: ViewModifier {
    let pulsado: Bool
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @Environment(\.isEnabled) private var activo

    func body(content: Content) -> some View {
        content
            .scaleEffect(pulsado && !sinMovimiento ? 0.95 : 1)
            .brightness(pulsado ? -0.04 : 0)
            .opacity(activo ? 1 : 0.45)
            .animation(pulsado ? Muelle.toque : Muelle.soltar, value: pulsado)
            .sensoryFeedback(.impact(weight: .light, intensity: 0.6), trigger: pulsado) { _, ahora in ahora }
    }
}

extension ButtonStyle where Self == EstiloCapsula {
    static var capsula: EstiloCapsula { EstiloCapsula() }
    static func capsula(_ tono: EstiloCapsula.Tono, ancho: Bool = false) -> EstiloCapsula { EstiloCapsula(tono: tono, ancho: ancho) }
}

/// Botón redondo de icono (volver, cerrar, ajustes): círculo de 40 negro o blanco.
struct BotonRedondo: View {
    enum Tono { case oscuro, blanco, sutil }
    let sistema: String          // SF Symbol de control (chevron.left, xmark, ellipsis…): solo para controles, no para apartados
    var tono: Tono = .blanco
    var tamano: CGFloat = 40
    var etiqueta: String
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            Image(systemName: sistema)
                .font(.system(size: tamano * 0.36, weight: .bold, design: .rounded))
                .foregroundStyle(tono == .oscuro ? Lienzo.sobreOscuro : Lienzo.tinta)
                .frame(width: tamano, height: tamano)
                .background(fondo, in: Circle())
                .overlay { if tono == .blanco { Circle().strokeBorder(Lienzo.filo) } }
                .frame(minWidth: Medida.toque, minHeight: Medida.toque)
                .contentShape(Circle())
        }
        .buttonStyle(Pulsable(escala: 0.9))
        .accessibilityLabel(etiqueta)
    }

    private var fondo: Color {
        switch tono { case .oscuro: Lienzo.oscuro; case .blanco: Lienzo.tarjeta; case .sutil: Lienzo.sutil }
    }
}

// MARK: - Iconos cuadrados

/// Icono «cuadrangulado» (foto 1, abajo): cuadrado de esquinas continuas, relleno, con el dibujo del catálogo de Bitácora
/// (`Icono`, mismos ids: "plan", "finanzas", "transporte"…) en contraste dentro.
struct IconoCuadrado: View {
    enum Tono {
        case claro      // gris sutil + tinta (listas, filas)
        case blanco     // blanco + tinta (sobre lienzo gris)
        case oscuro     // negro + blanco (destacado)
        case naranja    // naranja + negro (activo, acción)
        case suave      // tinte naranja + naranja profundo (seleccionado)
        case translucido // blanco al 10 % + blanco (dentro de lo oscuro: modal, tarjetas negras)
    }
    let id: String
    var tono: Tono = .claro
    var tamano: CGFloat = Medida.icono

    var body: some View {
        RoundedRectangle(cornerRadius: tamano * 0.3, style: .continuous)
            .fill(fondo)
            .overlay {
                if tono == .blanco {
                    RoundedRectangle(cornerRadius: tamano * 0.3, style: .continuous).strokeBorder(Lienzo.filo)
                }
            }
            .overlay {
                Icono(id: Icono.deVista(id), activo: tono == .oscuro, detalle: Lienzo.naranja)
                    .scaleEffect(tamano * 0.56 / 24)
                    .foregroundStyle(tinta)
            }
            .frame(width: tamano, height: tamano)
            .accessibilityHidden(true)
    }

    private var fondo: Color {
        switch tono {
        case .claro: Lienzo.sutil
        case .blanco: Lienzo.tarjeta
        case .oscuro: Lienzo.oscuro
        case .naranja: Lienzo.naranja
        case .suave: Lienzo.naranjaSuave
        case .translucido: Color.white.opacity(0.1)
        }
    }
    private var tinta: Color {
        switch tono {
        case .oscuro, .translucido: Lienzo.sobreOscuro
        case .naranja: Lienzo.sobreNaranja
        case .suave: Lienzo.naranjaProfundo
        case .claro, .blanco: Lienzo.tinta
        }
    }
}

// MARK: - Marca

/// El símbolo «b.»: la b de Poppins en un cuadrado carbón con el punto naranja (img/marca/icono-512.png).
struct LogoB: View {
    var tamano: CGFloat = 28

    var body: some View {
        RoundedRectangle(cornerRadius: tamano * 0.28, style: .continuous)
            .fill(Lienzo.oscuro)
            .frame(width: tamano, height: tamano)
            .overlay {
                HStack(alignment: .lastTextBaseline, spacing: tamano * 0.02) {
                    Text("b").font(.custom("Poppins-Bold", fixedSize: tamano * 0.74)).foregroundStyle(Lienzo.sobreOscuro)
                    Circle().fill(Lienzo.naranja).frame(width: tamano * 0.15, height: tamano * 0.15)
                        .offset(y: -tamano * 0.06)
                }
                .offset(x: tamano * 0.03, y: -tamano * 0.02)
            }
            .accessibilityHidden(true)
    }
}

/// Cabecera de marca (foto 2, «Vorb»): la b. y «bitácora» en pequeño; a la derecha, lo que la pantalla necesite.
struct CabeceraMarca<Derecha: View>: View {
    @ViewBuilder var derecha: () -> Derecha

    var body: some View {
        HStack(spacing: Medida.xs) {
            LogoB(tamano: 26)
            Text("bitácora").font(Letra.marca).foregroundStyle(Lienzo.tinta).kerning(-0.3)
            Spacer(minLength: Medida.xs)
            derecha()
        }
        .frame(minHeight: Medida.toque)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("bitácora")
    }
}

extension CabeceraMarca where Derecha == EmptyView {
    init() { derecha = { EmptyView() } }
}

/// Cabecera de una página de apartado: volver (si hay pila), título en pequeño-grande y acciones a la derecha.
struct CabeceraPagina<Derecha: View>: View {
    let titulo: String
    var subtitulo: String?
    var volver: (() -> Void)?
    @ViewBuilder var derecha: () -> Derecha

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            if volver != nil || Derecha.self != EmptyView.self {
                HStack {
                    if let volver { BotonRedondo(sistema: "chevron.left", tono: .oscuro, etiqueta: "volver", accion: volver) }
                    Spacer()
                    derecha()
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo).font(Letra.titulo).foregroundStyle(Lienzo.tinta).kerning(-0.4)
                    .accessibilityAddTraits(.isHeader)
                if let subtitulo, !subtitulo.isEmpty {
                    Text(subtitulo).font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension CabeceraPagina where Derecha == EmptyView {
    init(titulo: String, subtitulo: String? = nil, volver: (() -> Void)? = nil) {
        self.titulo = titulo; self.subtitulo = subtitulo; self.volver = volver; derecha = { EmptyView() }
    }
}

/// Título de sección en etiqueta pequeña («GET INSPIRED» de la foto 3) con acción opcional a la derecha.
struct EtiquetaSeccion: View {
    let texto: String
    var accion: (titulo: String, hacer: () -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(texto.uppercased()).font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.tintaTerciaria)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            if let accion {
                Button(accion.titulo, action: accion.hacer).font(Letra.pieFuerte).foregroundStyle(Lienzo.naranjaProfundo)
                    .buttonStyle(.pulsable(0.94))
            }
        }
        .padding(.horizontal, Medida.xxs)
    }
}

// MARK: - Chips

/// Etiqueta pequeña en cápsula (categoría, estado, «hoy»).
struct Chip: View {
    enum Tono { case sutil, naranja, oscuro, blanco, verde }
    let texto: String
    var tono: Tono = .sutil
    var icono: String?

    var body: some View {
        HStack(spacing: 4) {
            if let icono { Image(systemName: icono).font(.system(size: 10, weight: .bold)) }
            Text(texto).font(Letra.pieFuerte).lineLimit(1)
        }
        .padding(.horizontal, 10).frame(height: 24)
        .foregroundStyle(tinta)
        .background(fondo, in: Capsule())
    }

    private var fondo: Color {
        switch tono {
        case .sutil: Lienzo.sutil
        case .naranja: Lienzo.naranjaSuave
        case .oscuro: Lienzo.oscuro
        case .blanco: Lienzo.tarjeta
        case .verde: Lienzo.positivo.opacity(0.12)
        }
    }
    private var tinta: Color {
        switch tono {
        case .naranja: Lienzo.naranjaProfundo
        case .oscuro: Lienzo.sobreOscuro
        case .verde: Lienzo.positivo
        case .sutil, .blanco: Lienzo.tinta
        }
    }
}

/// Puntito de color (semana, tipo de cosa).
struct Puntito: View {
    var color: Color
    var tamano: CGFloat = 5
    var body: some View { Circle().fill(color).frame(width: tamano, height: tamano).accessibilityHidden(true) }
}
