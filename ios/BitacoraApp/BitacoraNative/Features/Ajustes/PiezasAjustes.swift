import SwiftUI
import UIKit

// Piezas de Ajustes (0.22): grupos como los del menú (GrupoMenu), filas con su icono del catálogo y un estado pulsado
// del tema. Sin `Form` del sistema.

struct EstiloFila: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Paleta.pulsado : Color.clear)
            .contentShape(Rectangle())
    }
}

struct IconoFila: View {
    let id: String
    var peligro = false

    var body: some View {
        Icono(id: id)
            .foregroundStyle(peligro ? (Paleta.mono ? Paleta.sobreAcento : Paleta.error) : Paleta.texto)
            .frame(width: 32, height: 32)
            // Tinta: lo peligroso, sin rojo, en el cuadrado invertido.
            .background(peligro ? (Paleta.mono ? Paleta.acento : Paleta.error.opacity(0.12)) : Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

// Una fila de ajuste: icono, título, detalle opcional debajo y lo que vaya a la derecha.
struct FilaAjuste<Cola: View>: View {
    let icono: String
    let titulo: String
    var detalle: String?
    var peligro = false
    @ViewBuilder var cola: () -> Cola

    var body: some View {
        HStack(spacing: 14) {
            IconoFila(id: icono, peligro: peligro)
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo).font(Tipo.poppins(16, .medium)).foregroundStyle(peligro ? Paleta.error : Paleta.texto)
                if let detalle, !detalle.isEmpty {
                    Text(detalle).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            cola()
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .frame(minHeight: 56)
        .contentShape(Rectangle())
    }
}

extension FilaAjuste where Cola == FlechaFila {
    init(icono: String, titulo: String, detalle: String? = nil, peligro: Bool = false, web: Bool = false) {
        self.init(icono: icono, titulo: titulo, detalle: detalle, peligro: peligro) { FlechaFila(web: web) }
    }
}

struct FlechaFila: View {
    var web = false
    var body: some View {
        HStack(spacing: 6) {
            if web { Text("web.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
            Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Paleta.textoApagado)
        }
        .accessibilityHidden(!web)
    }
}

// Interruptor con la tinta del tema: encendido en el acento, apagado con el aro del tema (3:1 con el fondo).
struct InterruptorCasa: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(spacing: 0) {
                configuration.label.frame(maxWidth: .infinity, alignment: .leading)
                ZStack(alignment: configuration.isOn ? .trailing : .leading) {
                    RoundedRectangle(cornerRadius: 15, style: .continuous)
                        .fill(configuration.isOn ? Paleta.acento : Paleta.tinteTexto)
                        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(configuration.isOn ? Color.clear : Paleta.aro, lineWidth: 1))
                        .frame(width: 50, height: 30)
                    Circle().fill(configuration.isOn ? Paleta.sobreAcento : Paleta.textoSecundario)
                        .frame(width: 22, height: 22).padding(4)
                }
                .animation(UIAccessibility.isReduceMotionEnabled ? nil : .easeOut(duration: 0.16), value: configuration.isOn)
            }
        }
        .buttonStyle(.plain)
        .accessibilityRepresentation { Toggle(isOn: configuration.$isOn) { configuration.label } }
    }
}

struct FilaInterruptor: View {
    let icono: String
    let titulo: String
    var detalle: String?
    @Binding var activo: Bool
    var deshabilitado = false

    var body: some View {
        Toggle(isOn: $activo) {
            HStack(spacing: 14) {
                IconoFila(id: icono)
                VStack(alignment: .leading, spacing: 2) {
                    Text(titulo).font(Tipo.poppins(16, .medium)).foregroundStyle(Paleta.texto)
                    if let detalle, !detalle.isEmpty {
                        Text(detalle).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.trailing, 10)
            }
        }
        .toggleStyle(InterruptorCasa())
        .disabled(deshabilitado)
        .opacity(deshabilitado ? 0.5 : 1)
        .padding(.horizontal, 16).padding(.vertical, 10)
        .frame(minHeight: 56)
    }
}

// Opciones en fila (perfil, tamaño de letra): la elegida en la superficie con el filo del acento.
struct OpcionesAjuste<Valor: Hashable>: View {
    let opciones: [(Valor, String)]
    let elegida: Valor
    let elegir: (Valor) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Array(opciones.enumerated()), id: \.offset) { _, o in
                let on = o.0 == elegida
                Button { elegir(o.0) } label: {
                    Text(o.1).font(Tipo.poppins(14, on ? .semibold : .medium, estilo: .footnote))
                        .foregroundStyle(on ? Paleta.texto : Paleta.textoSecundario)
                        .lineLimit(1).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background(on ? Paleta.seleccion : Color.clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(on ? Paleta.acento : Color.clear, lineWidth: 1.5))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(4)
        .background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

// Muestra de un tema: una pantalla de Bitácora en miniatura con sus colores reales (fondo, título, una tarjeta con su
// círculo, el acento y la barra de abajo), no tres puntos sueltos.
struct MuestraTema: View {
    let tema: TemaElegido
    let elegido: Bool
    let oscuroSistema: Bool

    private func c(_ v: UInt32, _ a: CGFloat = 1) -> Color { Color(uiColor: UIColor(rgb: v, alfa: a)) }

    var body: some View {
        let k = TemaTokens.de(tema, sistemaOscuro: oscuroSistema)
        VStack(spacing: 8) {
            ZStack(alignment: .bottom) {
                c(k.fondo)
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 0) {
                        Text("hoy").foregroundStyle(c(k.titulo ?? k.texto))
                        Text(".").foregroundStyle(c(k.progreso))
                    }
                    .font(Tipo.poppins(15, .bold, estilo: .footnote))
                    VStack(alignment: .leading, spacing: 5) {
                        linea(k, ancho: 40, hecha: false)
                        linea(k, ancho: 30, hecha: true)
                    }
                    .padding(6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(c(k.superficie), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(c(k.filo ?? k.texto, k.bordeAlfa ?? 0.08), lineWidth: 1))
                    RoundedRectangle(cornerRadius: 3).fill(c(k.acento)).frame(width: 34, height: 9)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 8).padding(.top, 8).padding(.bottom, 22)
                HStack(spacing: 9) {
                    ForEach(0..<4, id: \.self) { i in
                        Circle().fill(i == 0 ? c(k.acentoBarra ?? k.acento) : c(k.sobreBarraSuave ?? k.secundario, 0.7)).frame(width: 5, height: 5)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 16)
                .background(c(k.barra ?? k.superficie))
            }
            .frame(height: 112)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(elegido ? Paleta.acento : Paleta.borde, lineWidth: elegido ? 2.5 : 1))
            HStack(spacing: 4) {
                if elegido { Circle().fill(Paleta.acento).frame(width: 6, height: 6) }
                Text(tema.nombre).font(Tipo.poppins(13, elegido ? .semibold : .medium, estilo: .footnote))
                    .foregroundStyle(elegido ? Paleta.texto : Paleta.textoSecundario)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("tema \(String(tema.nombre.dropLast()))")
        .accessibilityAddTraits(elegido ? [.isButton, .isSelected] : .isButton)
    }

    private func linea(_ k: TemaTokens, ancho: CGFloat, hecha: Bool) -> some View {
        HStack(spacing: 5) {
            Circle().strokeBorder(c(k.texto, k.aroAlfa ?? (k.oscuro ? 0.42 : 0.36)), lineWidth: 1.2)
                .background(Circle().fill(hecha ? c(k.acento) : Color.clear))
                .frame(width: 9, height: 9)
            RoundedRectangle(cornerRadius: 2).fill(c(hecha ? k.secundario : k.texto, hecha ? 0.6 : 0.85)).frame(width: ancho, height: 4)
        }
    }
}

// Hoja de compartir del sistema para un archivo (descargar mis datos).
struct HojaCompartir: UIViewControllerRepresentable {
    let elementos: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: elementos, applicationActivities: nil) }
    func updateUIViewController(_ c: UIActivityViewController, context: Context) {}
}

// Texto con el que se cierra un grupo: explica sin ocupar una fila.
struct PieGrupo: View {
    let texto: String
    var body: some View {
        Text(texto).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            .padding(.horizontal, 6).padding(.top, 8)
            .fixedSize(horizontal: false, vertical: true)
    }
}
