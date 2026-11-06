import SwiftUI

@main
struct BitacoraNativeApp: App {
    @State private var coordinador = AppCoordinator()
    @Environment(\.scenePhase) private var fase

    var body: some Scene {
        WindowGroup {
            RaizView()
                .environment(coordinador)
                .preferredColorScheme(coordinador.tema.esquema)
                .tint(Paleta.acento)
                .onOpenURL { coordinador.recibirURL($0) }
                .task { await coordinador.arrancar() }
        }
        .onChange(of: fase) { _, nueva in coordinador.cambioDeFase(nueva) }
    }
}

struct RaizView: View {
    @Environment(AppCoordinator.self) private var c

    var body: some View {
        ZStack {
            Paleta.fondo.ignoresSafeArea()
            switch c.fase {
            case .arrancando:
                Marca()
            case .sinSesion(let aviso):
                LoginView(aviso: aviso)
            case .lista:
                PrincipalView()
            }
            if c.fase == .lista && c.bloqueada {
                BloqueoView().transition(.opacity)
            } else if c.velo {
                Marca().frame(maxWidth: .infinity, maxHeight: .infinity).background(Paleta.fondo).ignoresSafeArea()
            }
        }
    }
}

struct Marca: View {
    var body: some View {
        Text("bitácora.")
            .font(Tipo.titulo)
            .foregroundStyle(Paleta.texto)
            .accessibilityAddTraits(.isHeader)
    }
}

struct PrincipalView: View {
    @Environment(AppCoordinator.self) private var c

    var body: some View {
        @Bindable var c = c
        TabView(selection: $c.pestana) {
            NavigationStack { HoyView() }
                .tabItem { Label("hoy.", systemImage: "sun.max") }
                .tag(Pestana.hoy)
            NavigationStack { EstadoView() }
                .tabItem { Label("estado.", systemImage: "arrow.triangle.2.circlepath") }
                .tag(Pestana.estado)
            NavigationStack { AjustesView() }
                .tabItem { Label("ajustes.", systemImage: "gearshape") }
                .tag(Pestana.ajustes)
        }
        .sheet(item: $c.modal) { m in
            switch m {
            case .intencion(let i): IntencionView(intencion: i)
            }
        }
    }
}
