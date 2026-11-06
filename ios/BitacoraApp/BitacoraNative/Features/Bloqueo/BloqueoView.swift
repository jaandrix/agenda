import SwiftUI

struct BloqueoView: View {
    @Environment(AppCoordinator.self) private var c

    var body: some View {
        VStack(spacing: Espacio.l) {
            Spacer()
            Marca()
            Text("bloqueada.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario)
            Spacer()
            Button("abrir con \(Biometria.nombre).") { Task { await c.desbloquear() } }
                .buttonStyle(BotonPrincipal())
            // Si Face ID deja de funcionar y no hay código, se sale y se vuelve a entrar con la contraseña.
            Button("cerrar sesión.") { Task { await c.salir() } }
                .buttonStyle(BotonSecundario())
        }
        .padding(Espacio.l)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Paleta.fondo)
    }
}
