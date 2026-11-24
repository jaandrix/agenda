import SwiftUI

// Bloqueo 2.0 (24-11): el lienzo limpio, la b. que respira despacio y una cápsula negra para abrir. Desbloquear y salir
// siguen siendo AppCoordinator.desbloquear / salir.
struct BloqueoView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var latido = false
    @State private var aparecido = false

    var body: some View {
        VStack(spacing: Medida.l) {
            Spacer()
            VStack(spacing: Medida.m) {
                LogoB(tamano: 72)
                    .sombra(.oscura)
                    .scaleEffect(latido && !sinMovimiento ? 1.035 : 1)
                    .animation(sinMovimiento ? nil : PulsoBloqueo.animacion, value: latido)
                VStack(spacing: Medida.xxs) {
                    (Text("bitácora").foregroundColor(Lienzo.tinta) + Text(".").foregroundColor(Lienzo.naranjaProfundo))
                        .font(Letra.marca)
                        .accessibilityLabel("bitácora")
                        .accessibilityAddTraits(.isHeader)
                    Text("bloqueada.").font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                }
            }
            .scaleEffect(aparecido || sinMovimiento ? 1 : 0.92)
            .opacity(aparecido ? 1 : 0)
            Spacer()
            VStack(spacing: Medida.xs) {
                Button {
                    Haptica.media()
                    Task { await c.desbloquear() }
                } label: {
                    HStack(spacing: Medida.xs) {
                        Image(systemName: PulsoBloqueo.simbolo).font(.system(size: 16, weight: .semibold)).accessibilityHidden(true)
                        Text("abrir con \(Biometria.nombre).")
                    }
                }
                .buttonStyle(.capsula(.oscuro, ancho: true))
                // Si Face ID deja de funcionar y no hay código, se sale y se vuelve a entrar con la contraseña.
                Button("cerrar sesión.") { Task { await c.salir() } }
                    .buttonStyle(.capsula(.blanco, ancho: true))
            }
            .entradaEscalonada(2)
        }
        .padding(.horizontal, Medida.xl)
        .padding(.bottom, Medida.l)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .fondoLienzo()
        .onAppear {
            withAnimation(Muelle.o(Muelle.entrada, reducido: sinMovimiento)) { aparecido = true }
            latido = true
        }
    }
}

// Pulso lento de la b. (como PuntoVivo, pero más suave). Candidato a `Muelle.latido` en DesignSystem/V2.
enum PulsoBloqueo {
    static let animacion = Animation.easeInOut(duration: 1.6).repeatForever(autoreverses: true)

    static var simbolo: String {
        switch Biometria.nombre {
        case "Face ID": return "faceid"
        case "Touch ID": return "touchid"
        default: return "lock.open"
        }
    }
}
