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
        (Text("bitácora").foregroundColor(Paleta.texto) + Text(".").foregroundColor(Paleta.acento))
            .font(Tipo.titulo)
            .accessibilityLabel("bitácora")
            .accessibilityAddTraits(.isHeader)
    }
}

// Armazón: las pantallas siguen vivas en un TabView (conservan su estado y su scroll) y la barra del sistema se cambia
// por la de la PWA. Cambiar de pestaña es inmediato, sin desplazamiento lateral. Ajustes vive en «más.».
struct PrincipalView: View {
    @Environment(AppCoordinator.self) private var c

    static func pestanas(secundaria: Pestana) -> [BarraBitacora.Pestana] {
        [.init(id: "inicio", titulo: "inicio", icono: "house"),
         .init(id: "plan", titulo: "plan", icono: "checklist"),
         secundaria == .finanzas ? .init(id: "finanzas", titulo: "finanzas", icono: "eurosign") : .init(id: "calendario", titulo: "calendario", icono: "calendar"),
         .init(id: "mas", titulo: "menú", icono: "line.3.horizontal")]
    }
    private static let porId: [String: Pestana] = ["inicio": .inicio, "plan": .plan, "calendario": .calendario, "finanzas": .finanzas, "mas": .mas]

    var body: some View {
        @Bindable var c = c
        VStack(spacing: 0) {
            TabView(selection: $c.pestana) {
                NavigationStack { InicioView() }.toolbar(.hidden, for: .tabBar).tag(Pestana.inicio)
                NavigationStack { PlanView() }.toolbar(.hidden, for: .tabBar).tag(Pestana.plan)
                NavigationStack { CalendarioView() }.toolbar(.hidden, for: .tabBar).tag(Pestana.calendario)
                NavigationStack { FinanzasView() }.toolbar(.hidden, for: .tabBar).tag(Pestana.finanzas)
                NavigationStack(path: $c.rutaMas) { MasView() }.toolbar(.hidden, for: .tabBar).tag(Pestana.mas)
            }
            BarraBitacora(pestanas: Self.pestanas(secundaria: c.secundaria),
                          activa: Self.porId.first { $0.value == c.pestana }?.key ?? "inicio") { id in
                if let p = Self.porId[id] { c.pestana = p }
            } capturar: {
                c.abrirApuntar()
            }
        }
        .background(Paleta.fondo.ignoresSafeArea())
        .overlay(alignment: .top) {
            if let aviso = c.aviso {
                Text(aviso)
                    .font(Tipo.poppins(14, .medium, estilo: .footnote))
                    .foregroundStyle(Paleta.texto)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Radio.control, style: .continuous).stroke(Paleta.borde))
                    .padding(.horizontal, 20).padding(.top, 8)
                    .transition(.opacity)
                    .accessibilityAddTraits(.updatesFrequently)
                    .onAppear { UIAccessibility.post(notification: .announcement, argument: aviso) }
            }
        }
        .animation(.easeOut(duration: 0.18), value: c.aviso)
        .onChange(of: c.pestana) { _, p in if p == .calendario || p == .finanzas { c.secundaria = p } }
        .fullScreenCover(item: Binding(get: { c.web.map(PaginaWeb.init) }, set: { c.web = $0?.url })) { NavegadorWeb(url: $0.url).ignoresSafeArea() }
        .sheet(item: $c.modal) { m in
            // Las hojas son las del sistema (detents, arrastrar para cerrar) con el fondo, la tinta y la letra de Bitácora.
            Group {
                switch m {
                case .apuntar(let a): ApuntarView(inicial: a)
                case .tarea(let t): EditorTareaView(inicial: t)
                case .evento(let e): EditorEventoView(inicial: e)
                case .movimiento(let id, let tipo): EditorMovimientoView(id: id, tipoInicial: tipo)
                case .editarMovimiento(let m): EditorMovimientoView(id: m.id, tipoInicial: m.tipo, existente: m)
                case .ficha(let e, let d): FichaEventoView(evento: e, dia: d)
                case .tiempo: TiempoView()
                }
            }
            .presentationBackground(Paleta.fondo)
            .presentationCornerRadius(Radio.barra)
            .tint(Paleta.acento)
        }
    }
}

struct PaginaWeb: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}
