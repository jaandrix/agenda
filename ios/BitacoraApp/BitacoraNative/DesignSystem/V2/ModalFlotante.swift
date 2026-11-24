import SwiftUI

// Modal flotante (foto 1, abajo): no es una hoja pegada al borde, es una tarjeta carbón separada de los lados y de abajo,
// con una banda naranja arriba (título a la izquierda, estado a la derecha) y su contenido oscuro debajo.
//  · Entra y sale con Muelle.modal; el velo de detrás funde y cierra al tocarlo.
//  · Se arrastra hacia abajo desde la banda para cerrarlo; hacia arriba resiste (rubber-banding). Al soltar cuenta la
//    velocidad: un tirón corto pero rápido también cierra.
//  · Respeta el teclado: vive en una capa que sí lo tiene en cuenta, así que sube con él y queda justo encima.
struct ModalFlotante<Estado: View, Contenido: View>: View {
    let titulo: String
    let cerrar: () -> Void
    @ViewBuilder var estado: () -> Estado
    @ViewBuilder var contenido: () -> Contenido

    @State private var arrastre: CGFloat = 0
    @State private var topeAvisado = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        VStack(spacing: 0) {
            banda
            contenido()
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Lienzo.oscuro, in: RoundedRectangle(cornerRadius: Medida.radioModal, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: Medida.radioModal, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Medida.radioModal, style: .continuous).strokeBorder(Lienzo.filoOscuro))
        .sombra(.oscura)
        .padding(.horizontal, Medida.s - 2)
        .padding(.bottom, Medida.xs)
        .offset(y: arrastre)
        .scaleEffect(1 - min(arrastre, 240) / 2400, anchor: .bottom)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape, cerrar)
    }

    private var banda: some View {
        HStack(spacing: Medida.xs) {
            Text(titulo).font(Tipo.poppins(13, .semibold, estilo: .footnote)).foregroundStyle(Lienzo.sobreNaranja)
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: Medida.xs)
            estado()
                .font(Tipo.poppins(13, .semibold, estilo: .footnote).monospacedDigit())
                .foregroundStyle(Lienzo.sobreNaranja)
        }
        .padding(.horizontal, 18)
        .frame(height: 48)
        .frame(maxWidth: .infinity)
        .background {
            // 3.0.1: la banda es un tramo de la propia tarjeta (recta por abajo). Con esquinas inferiores redondeadas
            // asomaba el negro por los lados y parecía una pieza pegada encima. Debajo, el naranja se funde con lo oscuro.
            Lienzo.naranja
                .overlay(alignment: .bottom) {
                    LinearGradient(colors: [Lienzo.naranja, Lienzo.naranja.opacity(0)], startPoint: .top, endPoint: .bottom)
                        .frame(height: 16)
                        .offset(y: 16)
                        .opacity(0.55)
                }
        }
        .overlay(alignment: .top) {
            Capsule().fill(Lienzo.sobreNaranja.opacity(0.22)).frame(width: 34, height: 4).padding(.top, 6)
                .accessibilityHidden(true)
        }
        .contentShape(Rectangle())
        .gesture(arrastrar)
    }

    private var arrastrar: some Gesture {
        DragGesture(minimumDistance: 4, coordinateSpace: .global)
            .onChanged { g in
                let dy = g.translation.height
                // Hacia abajo sigue al dedo; hacia arriba resiste cada vez más.
                arrastre = dy >= 0 ? dy : Elastico.resistencia(dy, limite: 60)
                if dy < -50 && !topeAvisado { topeAvisado = true; Haptica.tope() }
            }
            .onEnded { g in
                topeAvisado = false
                let destino = g.translation.height + Elastico.proyeccion(g.velocity.height)
                if g.translation.height > 110 || destino > 260 {
                    Haptica.suave()
                    cerrar()
                    // El modal sale con su transición; el desplazamiento vuelve a cero para la próxima vez.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { arrastre = 0 }
                } else {
                    withAnimation(Muelle.o(Muelle.modal, reducido: sinMovimiento)) { arrastre = 0 }
                }
            }
    }
}

extension ModalFlotante where Estado == EmptyView {
    init(titulo: String, cerrar: @escaping () -> Void, @ViewBuilder contenido: @escaping () -> Contenido) {
        self.titulo = titulo; self.cerrar = cerrar; self.estado = { EmptyView() }; self.contenido = contenido
    }
}

/// Punto que late (como el «●» de grabando): para estados vivos en la banda (interpretando, sincronizando…).
struct PuntoVivo: View {
    var color: Color = Lienzo.sobreNaranja
    var activo = true
    @State private var fase = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        Circle().fill(color).frame(width: 7, height: 7)
            .opacity(activo && fase ? 0.25 : 1)
            .scaleEffect(activo && fase && !sinMovimiento ? 0.7 : 1)
            .animation(activo ? .easeInOut(duration: 0.7).repeatForever(autoreverses: true) : .default, value: fase)
            .onAppear { fase = true }
            .accessibilityHidden(true)
    }
}

extension View {
    /// Presenta un modal flotante por encima de esta vista. `contenido` suele ser un ModalFlotante.
    func capaFlotante<C: View>(presentado: Bool, cerrar: @escaping () -> Void, @ViewBuilder contenido: @escaping () -> C) -> some View {
        modifier(CapaFlotante(presentado: presentado, cerrar: cerrar, contenido: contenido))
    }
}

private struct CapaFlotante<C: View>: ViewModifier {
    let presentado: Bool
    let cerrar: () -> Void
    @ViewBuilder var contenido: () -> C
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    func body(content: Content) -> some View {
        content
            .overlay {
                if presentado {
                    Lienzo.velo
                        .ignoresSafeArea()
                        .onTapGesture { Haptica.suave(); cerrar() }
                        .transition(.opacity)
                        .accessibilityHidden(true)
                }
            }
            .overlay(alignment: .bottom) {
                if presentado {
                    contenido()
                        .transition(sinMovimiento ? .opacity : .asymmetric(
                            insertion: .move(edge: .bottom).combined(with: .scale(scale: 0.94, anchor: .bottom)).combined(with: .opacity),
                            removal: .move(edge: .bottom).combined(with: .opacity)))
                }
            }
            .animation(Muelle.o(Muelle.modal, reducido: sinMovimiento), value: presentado)
    }
}
