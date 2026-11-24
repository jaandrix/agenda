import SwiftUI
import UIKit

// Piezas de Ajustes (2.0): grupos como los del menú (GrupoMenu, tarjeta blanca), filas con su IconoCuadrado del
// catálogo, interruptores con tinte naranja y opciones como segmentos en cápsula. Sin `Form` del sistema.

// Icono de una fila de ajuste. Lo peligroso (eliminar la cuenta) en rojo sobre su tinte, con la misma geometría que
// IconoCuadrado.
struct IconoFila: View {
    let id: String
    var peligro = false

    var body: some View {
        if peligro {
            RoundedRectangle(cornerRadius: Medida.radioIcono, style: .continuous)
                .fill(Lienzo.negativo.opacity(0.1))
                .overlay {
                    Icono(id: id, detalle: Lienzo.negativo)
                        .scaleEffect(Medida.icono * 0.56 / 24)
                        .foregroundStyle(Lienzo.negativo)
                }
                .frame(width: Medida.icono, height: Medida.icono)
                .accessibilityHidden(true)
        } else {
            IconoCuadrado(id: id, tono: .claro)
        }
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
        HStack(spacing: Medida.s) {
            IconoFila(id: icono, peligro: peligro)
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo).font(Letra.cuerpoFuerte).foregroundStyle(peligro ? Lienzo.negativo : Lienzo.tinta)
                if let detalle, !detalle.isEmpty {
                    Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            cola()
        }
        .padding(.horizontal, Medida.rellenoTarjeta).padding(.vertical, Medida.xs)
        .frame(minHeight: 52)
        .contentShape(Rectangle())
    }
}

extension FilaAjuste where Cola == FlechaAjuste {
    init(icono: String, titulo: String, detalle: String? = nil, peligro: Bool = false, web: Bool = false) {
        self.init(icono: icono, titulo: titulo, detalle: detalle, peligro: peligro) { FlechaAjuste(web: web) }
    }
}

// La flecha de la fila (FlechaFila del DesignSystem) con «web» discreto delante si se abre en la web.
struct FlechaAjuste: View {
    var web = false
    var body: some View {
        HStack(spacing: Medida.xs) {
            if web { Text("web").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) }
            FlechaFila()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(web ? "se abre en la web" : "")
        .accessibilityHidden(!web)
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
            HStack(spacing: Medida.s) {
                IconoFila(id: icono)
                VStack(alignment: .leading, spacing: 2) {
                    Text(titulo).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                    if let detalle, !detalle.isEmpty {
                        Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.trailing, Medida.xs)
            }
        }
        .toggleStyle(InterruptorCasa())
        .disabled(deshabilitado)
        .opacity(deshabilitado ? 0.5 : 1)
        .padding(.horizontal, Medida.rellenoTarjeta).padding(.vertical, Medida.xs)
        .frame(minHeight: 52)
    }
}

// Opciones en fila (perfil, tamaño de letra): SegmentoCapsula, la elegida en la píldora negra.
struct OpcionesAjuste<Valor: Hashable>: View {
    let opciones: [(Valor, String)]
    let elegida: Valor
    let elegir: (Valor) -> Void

    var body: some View {
        SegmentoCapsula<Valor>(opciones: opciones.map { SegmentoCapsula<Valor>.Opcion(valor: $0.0, titulo: $0.1) },
                               elegido: Binding<Valor>(get: { elegida }, set: { elegir($0) }))
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
        Text(texto).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
            .padding(.horizontal, Medida.xxs).padding(.top, Medida.xs)
            .fixedSize(horizontal: false, vertical: true)
    }
}
