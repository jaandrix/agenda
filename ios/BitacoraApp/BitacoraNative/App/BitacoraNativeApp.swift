import SwiftUI
import UIKit

@main
struct BitacoraNativeApp: App {
    @State private var coordinador = AppCoordinator()
    @Environment(\.scenePhase) private var fase

    // Los títulos de navegación y las pestañas los dibuja UIKit, que no ve el `.font` de SwiftUI: sin esto salían
    // con la letra del sistema aunque Poppins estuviera cargada.
    init() {
        func poppins(_ nombre: String, _ tamano: CGFloat, _ estilo: UIFont.TextStyle) -> UIFont {
            UIFontMetrics(forTextStyle: estilo).scaledFont(for: UIFont(name: nombre, size: tamano) ?? .systemFont(ofSize: tamano))
        }
        let barra = UINavigationBarAppearance()
        barra.configureWithTransparentBackground()
        barra.largeTitleTextAttributes = [.font: poppins("Poppins-Bold", 34, .largeTitle)]
        barra.titleTextAttributes = [.font: poppins("Poppins-SemiBold", 17, .headline)]
        let conFondo = UINavigationBarAppearance()
        conFondo.configureWithDefaultBackground()
        conFondo.largeTitleTextAttributes = barra.largeTitleTextAttributes
        conFondo.titleTextAttributes = barra.titleTextAttributes
        let boton = UIBarButtonItemAppearance()
        boton.normal.titleTextAttributes = [.font: poppins("Poppins-Medium", 17, .body)]
        conFondo.buttonAppearance = boton
        barra.buttonAppearance = boton
        UINavigationBar.appearance().scrollEdgeAppearance = barra
        UINavigationBar.appearance().standardAppearance = conFondo
        UINavigationBar.appearance().compactAppearance = conFondo
        let pestanas = UITabBarAppearance()
        pestanas.configureWithDefaultBackground()
        let pie = [NSAttributedString.Key.font: poppins("Poppins-Medium", 10, .caption2)]
        for estilo in [pestanas.stackedLayoutAppearance, pestanas.inlineLayoutAppearance, pestanas.compactInlineLayoutAppearance] {
            estilo.normal.titleTextAttributes = pie
            estilo.selected.titleTextAttributes = pie
        }
        UITabBar.appearance().standardAppearance = pestanas
        UITabBar.appearance().scrollEdgeAppearance = pestanas
    }

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
            case .nuevaTarea(let d): NuevaTareaView(dia: d)
            }
        }
    }
}
