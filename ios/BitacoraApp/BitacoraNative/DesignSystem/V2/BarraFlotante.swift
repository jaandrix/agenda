import SwiftUI

// Barra de abajo flotante (foto 4): una cápsula de cristal separada del borde del iPhone, con una píldora blanca que se
// desliza a la pestaña activa (matchedGeometryEffect) y, a su derecha, el botón de apuntar en óvalo. La activa enseña su
// nombre; las demás, solo el icono. Nunca sube con el teclado: el armazón la esconde mientras está abierto.
struct BarraFlotante: View {
    struct Pestana: Identifiable, Equatable {
        let id: String
        let titulo: String
        let icono: String
    }

    let pestanas: [Pestana]
    let activa: String
    let elegir: (String) -> Void
    let apuntar: () -> Void
    /// Pulsación larga en una pestaña (en «menú.», los apartados más usados).
    var mantener: ((String) -> Void)?
    /// La pestaña cuyo marco se publica en AnclaMenuKey (para anclar el bocadillo de «más usados»).
    var anclada: String? = "mas"

    @Namespace private var espacio
    @State private var largo: String?
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        HStack(spacing: Medida.s) {
            HStack(spacing: 2) {
                ForEach(pestanas) { boton($0) }
            }
            .padding(5)
            .frame(height: Medida.alturaBarra)
            .background {
                Capsule().fill(.regularMaterial)
                    .overlay(Capsule().fill(Lienzo.sutil.opacity(0.72)))
                    .overlay(Capsule().strokeBorder(Color.white.opacity(0.6), lineWidth: 0.5))
                    .sombra(.flotante)
            }
            BotonApuntar(accion: apuntar)
        }
        .padding(.horizontal, Medida.margen)
        .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: activa)
        .sensoryFeedback(.selection, trigger: activa)
    }

    @ViewBuilder private func boton(_ p: Pestana) -> some View {
        let on = p.id == activa
        let base = Button {
            if largo == p.id { largo = nil; return }
            elegir(p.id)
        } label: {
            HStack(spacing: 5) {
                Icono(id: p.icono, activo: on, detalle: on ? Lienzo.tintaPildora : Lienzo.naranja)
                    .scaleEffect(0.82)
                    .frame(width: 20, height: 20)
                if on {
                    // 3.0.1: «calendario» se cortaba. La activa tiene prioridad de ancho y, si aun así no cabe (iPhone
                    // estrecho), la letra encoge un poco antes que cortarse.
                    Text(p.titulo).font(Letra.pestana).lineLimit(1).minimumScaleFactor(0.78)
                        .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 0.6, anchor: .leading)),
                                                removal: .opacity))
                }
            }
            .foregroundStyle(on ? Lienzo.tintaPildora : Lienzo.tintaSecundaria)
            .padding(.horizontal, on ? 13 : 0)
            .frame(maxWidth: on ? nil : .infinity, maxHeight: .infinity)
            .frame(minWidth: 44)
            .background {
                if on {
                    Capsule().fill(Lienzo.pildoraActiva)
                        .shadow(color: .black.opacity(0.07), radius: 6, x: 0, y: 2)
                        .matchedGeometryEffect(id: "pildora", in: espacio)
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(Pulsable(escala: 0.9, haptica: false))
        .layoutPriority(on ? 1 : 0)
        .accessibilityLabel(p.titulo)
        .accessibilityAddTraits(on ? .isSelected : [])
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.36).onEnded { _ in
            guard let mantener else { return }
            largo = p.id
            Haptica.media(0.6)
            mantener(p.id)
            // Si el sistema no llega a mandar el toque al soltar, el siguiente no debe tragarse.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { if largo == p.id { largo = nil } }
        })

        if p.id == anclada, let mantener {
            // 3.2: la pulsación larga no existe para VoiceOver; se ofrece como acción.
            base.anchorPreference(key: AnclaMenuKey.self, value: .bounds) { $0 }
                .accessibilityAction(named: "más usados") { mantener(p.id) }
        } else if p.id == anclada {
            base.anchorPreference(key: AnclaMenuKey.self, value: .bounds) { $0 }
        } else {
            base
        }
    }
}
