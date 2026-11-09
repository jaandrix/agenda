import SwiftUI

// Piezas comunes, sacadas de la PWA móvil. No conocen SyncEngine ni JSON: reciben lo que pintan y qué hacer al tocar.

// .m-check: círculo de 30 con borde de 2; marcado, lleno del color activo con el check encima. Al marcarse se sella
// (160 ms) si no hay movimiento reducido. Los colores se pueden adaptar al fondo (Inicio sobre contexto).
struct BitacoraCheck: View {
    let hecho: Bool
    var acento = false
    var colorActivo: Color = Paleta.acento
    var colorBorde: Color = Paleta.bordeFuerte
    var colorMarca: Color = Paleta.sobreAcento
    let accion: () -> Void
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var sello = false

    var body: some View {
        Button {
            if !hecho && !sinMovimiento {
                sello = true
                DispatchQueue.main.asyncAfter(deadline: .now() + Duracion.sello) { sello = false }
            }
            accion()
        } label: {
            ZStack {
                Circle().strokeBorder(hecho || acento ? colorActivo : colorBorde, lineWidth: 2)
                if hecho {
                    Circle().fill(colorActivo)
                    Image(systemName: "checkmark").font(.system(size: 13, weight: .heavy)).foregroundStyle(colorMarca)
                }
            }
            .frame(width: 32, height: 32)
            .scaleEffect(sello ? 1.1 : 1)
            .animation(sinMovimiento ? nil : .easeOut(duration: Duracion.sello), value: sello)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.success, trigger: hecho) { antes, ahora in !antes && ahora }
    }
}

// Cabecera de un apartado: título enorme en minúscula con el punto en el acento (renderMobileCabecera) y una línea de
// contexto debajo. Sin barra de navegación grande encima.
struct CabeceraApartado<Accion: View>: View {
    let titulo: String
    var contexto: String?
    @ViewBuilder var accion: () -> Accion

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                (Text(titulo).foregroundColor(Paleta.texto) + Text(".").foregroundColor(Paleta.acento))
                    .font(Tipo.tituloApartado)
                    .kerning(-2.1)
                    .lineLimit(1).minimumScaleFactor(0.6)
                    .accessibilityAddTraits(.isHeader)
                if let contexto, !contexto.isEmpty {
                    Text(contexto).font(Tipo.poppins(22, .bold, estilo: .title3)).kerning(-0.77).foregroundStyle(Paleta.textoSecundario)
                        .padding(.top, 2)
                }
            }
            Spacer(minLength: Espacio.s)
            accion()
        }
        .padding(.top, Espacio.s)
    }
}

// Título de sección en minúscula con punto, contador opcional y sin caja (la sección vive sobre el fondo).
struct CabeceraSeccion: View {
    let titulo: String
    var detalle: String?
    var raya = false
    var colorTexto: Color = Paleta.texto
    var colorSuave: Color = Paleta.textoSecundario
    var colorRaya: Color = Paleta.acento

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(titulo).font(Tipo.subtitulo).foregroundStyle(colorTexto).accessibilityAddTraits(.isHeader)
                Spacer()
                if let detalle { Text(detalle).font(Tipo.pie).foregroundStyle(colorSuave) }
            }
            // .m-dia-raya: una rayita corta debajo del título del día.
            if raya { Capsule().fill(colorRaya).frame(width: 28, height: 3) }
        }
        .padding(.top, Espacio.l)
        .padding(.bottom, Espacio.xs)
    }
}

// Fila de la agenda: hora en columna fija, círculo, título y nota, filete continuo debajo. Lo arrastrado o en curso en
// el acento. Tocar el texto abre; el círculo solo marca. Los colores se adaptan al fondo (Inicio sobre contexto).
struct FilaAgenda: View {
    let hora: String?
    let titulo: String
    var notas = ""
    let hecho: Bool
    var acento = false
    var mostrarHora = true
    var colorTexto: Color = Paleta.texto
    var colorSuave: Color = Paleta.textoSecundario
    var colorAcento: Color = Paleta.acento
    var colorFilo: Color = Paleta.borde
    var colorSobreAcento: Color = Paleta.sobreAcento
    let marcar: () -> Void
    var abrir: (() -> Void)?

    var body: some View {
        HStack(alignment: .center, spacing: Espacio.s) {
            if mostrarHora {
                Text(hora ?? "")
                    .font(Tipo.poppins(14, .semibold, estilo: .footnote)).monospacedDigit()
                    .foregroundStyle(acento && !hecho ? colorAcento : colorSuave)
                    .frame(width: 46, alignment: .leading)
            }
            BitacoraCheck(hecho: hecho, acento: acento, colorActivo: colorAcento, colorBorde: colorFilo, colorMarca: colorSobreAcento, accion: marcar)
            Button { (abrir ?? marcar)() } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(titulo)
                        .font(Tipo.poppins(16.5, .semibold, estilo: .body))
                        .foregroundStyle(hecho ? colorSuave : (acento ? colorAcento : colorTexto))
                        .strikethrough(hecho, color: colorSuave)
                        .multilineTextAlignment(.leading)
                    if !notas.isEmpty { Text(notas).font(Tipo.poppins(13.5, .regular, estilo: .footnote)).foregroundStyle(colorSuave).lineLimit(2) }
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 4)
        .overlay(alignment: .bottom) { Rectangle().fill(colorFilo).frame(height: 1) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel([hora, titulo].compactMap { $0 }.joined(separator: ", "))
        .accessibilityValue(hecho ? "hecha" : (acento ? "pendiente, de días anteriores" : "pendiente"))
        .accessibilityAction(named: hecho ? "desmarcar" : "marcar", marcar)
        .accessibilityAction(named: "abrir") { (abrir ?? marcar)() }
    }
}

// Botón de texto («+ tarea.»): una acción contextual, sin caja.
struct AccionTexto: View {
    let texto: String
    var color: Color = Paleta.acento
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            Text(texto).font(Tipo.cuerpoFuerte).foregroundStyle(color).frame(minHeight: 44, alignment: .leading)
        }
        .buttonStyle(.plain)
    }
}

// .m-tabbar: superficie con las esquinas de arriba, iconos propios en un círculo con tinta suave, activa con punto del
// acento y el + central elevado con un aro del color de la barra.
struct BarraBitacora: View {
    struct Pestana: Identifiable {
        let id: String
        let titulo: String
        let icono: String
    }
    // Contrato de geometría (probable sin UI): hueco lateral común, icono a distancia fija del borde superior, área táctil.
    static let altoHuecoLateral: CGFloat = 56
    static let tamanoIconoLateral: CGFloat = 34
    static let altoTactilMinimo: CGFloat = 44
    static let altoBotonCentral: CGFloat = 44
    static let elevacionCentral: CGFloat = 9

    let pestanas: [Pestana]
    let activa: String
    let elegir: (String) -> Void
    let capturar: () -> Void
    // Mantener pulsado «menú.» un segundo: los cinco apartados más usados.
    var mantener: (() -> Void)?
    @Environment(\.dynamicTypeSize) private var letra

    // Geometría común para los cuatro iconos laterales: cada grupo ocupa exactamente altoHuecoLateral y se centra en
    // vertical. El + puede ir elevado, pero nada se sale ni se pega arriba; áreas táctiles de 44 pt como mínimo.
    var body: some View {
        let mitad = pestanas.count / 2
        HStack(alignment: .center, spacing: 0) {
            ForEach(pestanas.prefix(mitad)) { boton($0) }
            botonCentral
            ForEach(pestanas.suffix(pestanas.count - mitad)) { boton($0) }
        }
        .padding(.horizontal, 6)
        .padding(.top, 2)
        .padding(.bottom, 2)
        .background(alignment: .top) {
            UnevenRoundedRectangle(topLeadingRadius: 22, topTrailingRadius: 22)
                .fill(Paleta.superficie)
                .overlay(alignment: .top) {
                    UnevenRoundedRectangle(topLeadingRadius: 22, topTrailingRadius: 22)
                        .stroke(Paleta.borde, lineWidth: 1)
                }
                .shadow(color: .black.opacity(0.06), radius: 5, y: -1)
                .ignoresSafeArea(edges: .bottom)
        }
    }

    private func boton(_ p: Pestana) -> some View {
        let on = p.id == activa
        let largo = p.id == "mas" ? mantener : nil
        return VStack(spacing: 1) {
                IconoBarra(id: p.icono, activo: on)
                    .frame(width: Self.tamanoIconoLateral, height: Self.tamanoIconoLateral)
                    .background(on ? Paleta.tinteAcento : Paleta.tinteTexto, in: Circle())
                if !letra.isAccessibilitySize {
                    Text(p.titulo + ".")
                        .font(.custom("Poppins-SemiBold", size: 11, relativeTo: .caption2))
                        .lineLimit(1).minimumScaleFactor(0.8)
                        .frame(height: 14)
                }
                Circle().fill(on ? Paleta.acento : .clear).frame(width: 4, height: 4)
            }
            .foregroundStyle(on ? Paleta.texto : Paleta.textoSecundario)
            .frame(maxWidth: .infinity, minHeight: Self.altoHuecoLateral, maxHeight: Self.altoHuecoLateral, alignment: .center)
            .contentShape(Rectangle())
            // Toque y pulsación larga sin Button: así la pulsación larga no dispara también el toque al soltar.
            .onTapGesture { elegir(p.id) }
            .onLongPressGesture(minimumDuration: 1) { largo?() }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(p.titulo)
            .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
            .accessibilityAction { elegir(p.id) }
            .modifier(AccionMasUsados(accion: largo))
    }

    private var botonCentral: some View {
        Button(action: capturar) {
            IconoBarra(id: "apuntar")
                .foregroundStyle(Paleta.sobreAcento)
                .frame(width: 42, height: 42)
                .background(Paleta.acento, in: Circle())
                .padding(4)
                .background(Paleta.superficie, in: Circle())
        }
        .buttonStyle(.plain)
        .offset(y: -Self.elevacionCentral)
        .frame(width: 64, minHeight: Self.altoBotonCentral)
        .accessibilityLabel("apuntar")
    }
}

// .m-libro-fila: la etiqueta en secundario, puntos guía y la cifra en negrita; filete debajo. Sirve de índice y de cifra.
struct FilaLibro: View {
    let etiqueta: String
    var valor: String = ""
    var acento = false
    var flecha = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Espacio.s) {
            Text(etiqueta).font(Tipo.poppins(15.5, .medium, estilo: .body)).foregroundStyle(Paleta.textoSecundario).lineLimit(1)
            Line().stroke(style: StrokeStyle(lineWidth: 2, dash: [1, 4])).foregroundStyle(Paleta.bordeFuerte).frame(height: 2)
                .accessibilityHidden(true)
            if !valor.isEmpty {
                Text(valor).font(Tipo.poppins(17, .bold, estilo: .body)).monospacedDigit()
                    .foregroundStyle(acento ? Paleta.acento : Paleta.texto).lineLimit(1)
            }
            if flecha { Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Paleta.textoApagado) }
        }
        .frame(minHeight: 48)
        .contentShape(Rectangle())
        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }

    private struct Line: Shape {
        func path(in r: CGRect) -> Path { Path { p in p.move(to: CGPoint(x: 0, y: r.midY)); p.addLine(to: CGPoint(x: r.maxX, y: r.midY)) } }
    }
}

private struct AccionMasUsados: ViewModifier {
    let accion: (() -> Void)?
    func body(content: Content) -> some View {
        if let accion { content.accessibilityAction(named: "más usados", accion) } else { content }
    }
}

// Selector de «más usados.»: encima de la barra, superficie sólida del tema, sin blur. Entra con opacidad y escala de
// 0,96 a 1 (160 ms); con movimiento reducido, sin escala.
struct SelectorMasUsados: View {
    let apartados: [Apartado]
    let elegir: (String) -> Void
    let cerrar: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("más usados.").font(Tipo.poppins(13, .bold, estilo: .footnote)).foregroundStyle(Paleta.textoSecundario)
                .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 6)
                .accessibilityAddTraits(.isHeader)
            ForEach(Array(apartados.enumerated()), id: \.element.id) { n, a in
                if n > 0 { SeparadorMenu() }
                Button { elegir(a.vista) } label: { FilaMenu(nombre: a.nombre, inicial: String(a.nombre.prefix(1))) }
                    .buttonStyle(.plain)
            }
        }
        .padding(.bottom, 6)
        .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Paleta.borde))
        .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
        .accessibilityAction(.escape, cerrar)
    }
}

// Dirección 02: cabecera de contexto (la información principal sobre `Paleta.contexto`) y una sola hoja de contenido que
// se solapa 26 pt sobre ella. Cada portada decide su altura con lo que mete dentro.
struct CabeceraContexto<Contenido: View>: View {
    let titulo: String
    var detalle: String?
    @ViewBuilder var contenido: () -> Contenido

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                (Text(titulo).foregroundColor(Paleta.sobreContexto) + Text(".").foregroundColor(Paleta.progreso))
                    .font(Tipo.titulo).kerning(-1.2).lineLimit(1).minimumScaleFactor(0.6)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: Espacio.s)
                if let detalle { Text(detalle).font(Tipo.pie).foregroundStyle(Paleta.sobreContextoSuave) }
            }
            contenido()
        }
        .padding(.horizontal, 20).padding(.top, Espacio.s).padding(.bottom, 26 + Espacio.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Paleta.contexto)
    }
}

struct HojaContenido: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 20).padding(.top, 6).padding(.bottom, Espacio.xl)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Paleta.fondo, in: UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26, style: .continuous))
            .padding(.top, -26)
    }
}

// Barra fina de avance en el color de progreso (estado en texto al lado, nunca solo el color).
struct BarraAvance: View {
    let valor: Double
    var fondo = Paleta.filoContexto
    var color = Paleta.progreso
    var alto: CGFloat = 4

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(fondo)
                Capsule().fill(color).frame(width: g.size.width * min(max(valor, 0), 1))
            }
        }
        .frame(height: alto)
        .accessibilityHidden(true)
    }
}
