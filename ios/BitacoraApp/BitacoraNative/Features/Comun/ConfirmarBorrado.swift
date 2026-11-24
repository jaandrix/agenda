import SwiftUI

// 0.22 (usabilidad): lo que se borra sin vuelta atrás pregunta antes. Se pone la cosa en `cosa` y el diálogo sale solo.
// 2.0 (24-11): en vez del diálogo del sistema, una tarjeta blanca flotante sobre un velo, con «borrar.» en cápsula negra
// y «cancelar.» en cápsula clara. Va en una capa a pantalla completa transparente para que funcione desde cualquier sitio
// (también dentro de una hoja o de una fila pequeña). La acción se ejecuta cuando la capa ya se ha ido, así puede cerrar
// la pantalla que la abrió sin chocar con ella.
extension View {
    func confirmarBorrado<T>(_ cosa: Binding<T?>, titulo: @escaping (T) -> String, boton: String = "borrar.", accion: @escaping (T) -> Void) -> some View {
        modifier(ConfirmarBorradoCapa(cosa: cosa, titulo: titulo, boton: boton, accion: accion))
    }
}

private struct ConfirmarBorradoCapa<T>: ViewModifier {
    @Binding var cosa: T?
    let titulo: (T) -> String
    let boton: String
    let accion: (T) -> Void
    @State private var pendiente: (() -> Void)?

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding(get: { cosa != nil }, set: { if !$0 { cosa = nil } }),
                             onDismiss: {
                                 let p = pendiente
                                 pendiente = nil
                                 p?()
                             }) {
                TarjetaConfirmarBorrado(
                    titulo: cosa.map(titulo) ?? "",
                    boton: boton,
                    confirmar: {
                        if let x = cosa { pendiente = { accion(x) } }
                        cosa = nil
                    },
                    cancelar: { cosa = nil })
                .presentationBackground(.clear)
            }
    }
}

private struct TarjetaConfirmarBorrado: View {
    let boton: String
    let confirmar: () -> Void
    let cancelar: () -> Void
    // El título se fija al aparecer: al cerrarse, `cosa` ya es nil y la tarjeta baja con su texto, no en blanco.
    @State private var texto: String
    @State private var velo = false
    @State private var dentro = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    init(titulo: String, boton: String, confirmar: @escaping () -> Void, cancelar: @escaping () -> Void) {
        _texto = State(initialValue: titulo)
        self.boton = boton
        self.confirmar = confirmar
        self.cancelar = cancelar
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Lienzo.velo
                .ignoresSafeArea()
                .opacity(velo ? 1 : 0)
                .onTapGesture { salir(cancelar) }
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: Medida.l) {
                HStack(alignment: .top, spacing: Medida.s) {
                    IconoCuadrado(id: "borrar", tono: .oscuro)
                    Text(texto)
                        .font(Letra.tituloTarjeta)
                        .foregroundStyle(Lienzo.tinta)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityAddTraits(.isHeader)
                }
                HStack(spacing: Medida.xs) {
                    Button("cancelar.") { salir(cancelar) }
                        .buttonStyle(.capsula(.claro, ancho: true))
                    Button(boton) {
                        Haptica.media()
                        salir(confirmar)
                    }
                    .buttonStyle(.capsula(.oscuro, ancho: true))
                }
            }
            .padding(Medida.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Lienzo.tarjeta, in: RoundedRectangle(cornerRadius: Medida.radioModal, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Medida.radioModal, style: .continuous).strokeBorder(Lienzo.filo))
            .sombra(.flotante)
            .scaleEffect(dentro || sinMovimiento ? 1 : 0.94, anchor: .bottom)
            .padding(.horizontal, Medida.s - 2)
            .padding(.bottom, Medida.xs)
            .accessibilityAddTraits(.isModal)
            .accessibilityAction(.escape) { salir(cancelar) }
        }
        .sensoryFeedback(.warning, trigger: dentro) { _, ahora in ahora }
        .onAppear {
            withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento)) { velo = true }
            withAnimation(Muelle.o(Muelle.modal, reducido: sinMovimiento)) { dentro = true }
        }
    }

    // El velo se aclara antes de que baje la capa: si no, bajaría con ella como una cortina gris.
    private func salir(_ hacer: @escaping () -> Void) {
        withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { velo = false }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { hacer() }
    }
}
