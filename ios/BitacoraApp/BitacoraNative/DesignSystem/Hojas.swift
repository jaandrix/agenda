import SwiftUI

// 0.23 (auditoría, franja blanca de los modales): todas las hojas pintan el contenedor de presentación del sistema con
// el fondo del tema, el mismo radio y la tinta del tema; antes solo lo hacía la hoja central y las de cada apartado
// enseñaban el blanco o gris del sistema en la esquina, el asa y la zona segura. También llevan el aviso de
// AppCoordinator.avisar encima: el de la pantalla principal queda debajo de la hoja y no se veía.
struct HojaBitacora: ViewModifier {
    @Environment(AppCoordinator.self) private var c: AppCoordinator?
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    func body(content: Content) -> some View {
        content
            .presentationBackground(Paleta.fondo)
            .presentationCornerRadius(Radio.barra)
            .tint(Paleta.acento)
            .overlay(alignment: .top) {
                if let aviso = c?.aviso { AvisoFlotante(texto: aviso) }
            }
            .animation(sinMovimiento ? nil : .easeOut(duration: 0.18), value: c?.aviso)
    }
}

// La línea breve de AppCoordinator.avisar, encima de todo.
struct AvisoFlotante: View {
    let texto: String

    var body: some View {
        Text(texto)
            .font(Tipo.poppins(14, .medium, estilo: .footnote))
            .foregroundStyle(Paleta.texto)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radio.control, style: .continuous).stroke(Paleta.borde))
            .padding(.horizontal, 20).padding(.top, 8)
            .transition(.opacity)
            .accessibilityAddTraits(.updatesFrequently)
            .onAppear { UIAccessibility.post(notification: .announcement, argument: texto) }
    }
}

extension View {
    func hojaBitacora() -> some View { modifier(HojaBitacora()) }

    // `.sheet` con la piel de Bitácora: usar siempre estas en vez de `.sheet`.
    func hoja<I: Identifiable, C: View>(item: Binding<I?>, onDismiss: (() -> Void)? = nil, @ViewBuilder content: @escaping (I) -> C) -> some View {
        sheet(item: item, onDismiss: onDismiss) { content($0).hojaBitacora() }
    }

    func hoja<C: View>(isPresented: Binding<Bool>, onDismiss: (() -> Void)? = nil, @ViewBuilder content: @escaping () -> C) -> some View {
        sheet(isPresented: isPresented, onDismiss: onDismiss) { content().hojaBitacora() }
    }
}
