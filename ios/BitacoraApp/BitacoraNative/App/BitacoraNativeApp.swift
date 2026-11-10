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
                .id("\(coordinador.tema.rawValue)-\(coordinador.letra.rawValue)")
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
        (Text("bitácora").foregroundColor(Paleta.texto) + Text(".").foregroundColor(Paleta.marca))
            .font(Tipo.titulo)
            .accessibilityLabel("bitácora")
            .accessibilityAddTraits(.isHeader)
    }
}

// Armazón: las pantallas siguen vivas en un TabView (conservan su estado y su scroll) y la barra del sistema se cambia
// por la de la PWA. Cambiar de pestaña es inmediato, sin desplazamiento lateral. Ajustes vive en «más.».
struct PrincipalView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var masUsados: [Apartado]?
    @Environment(\.scenePhase) private var fase
    @AppStorage(Vidrio.clave) private var vidrio = false
    @Environment(\.accessibilityReduceTransparency) private var sinTransparencia

    static func pestanas(secundaria: Pestana) -> [BarraBitacora.Pestana] {
        [.init(id: "inicio", titulo: "inicio", icono: "inicio"),
         .init(id: "plan", titulo: "plan", icono: "plan"),
         secundaria == .finanzas ? .init(id: "finanzas", titulo: "finanzas", icono: "finanzas") : .init(id: "calendario", titulo: "calendario", icono: "calendario"),
         .init(id: "mas", titulo: "menú", icono: "menu")]
    }
    private static let porId: [String: Pestana] = ["inicio": .inicio, "plan": .plan, "calendario": .calendario, "finanzas": .finanzas, "mas": .mas]

    var body: some View {
        @Bindable var c = c
        Group {
            if vidrio && !sinTransparencia {
                // Glass: el contenido pasa por debajo de la barra, que es el único material de la pantalla.
                pantallas.safeAreaInset(edge: .bottom, spacing: 0) { barra }
            } else {
                VStack(spacing: 0) { pantallas; barra }
            }
        }
        .overlayPreferenceValue(AnclaMenuKey.self) { ancla in
            GeometryReader { g in
                if let lista = masUsados {
                    let rect = ancla.map { g[$0] }
                    ZStack(alignment: .bottom) {
                        Color.black.opacity(0.001).ignoresSafeArea().onTapGesture { masUsados = nil }
                            .accessibilityHidden(true)
                        let ancho: CGFloat = min(300, g.size.width - 20)
                        let centroX = rect?.midX ?? (g.size.width - 46)
                        let x = min(max(10 + ancho / 2, centroX), g.size.width - 10 - ancho / 2)
                        let abajo = g.size.height - (rect?.minY ?? (g.size.height - BarraBitacora.altoHuecoLateral)) + 8
                        let pico = centroX - (x - ancho / 2)
                        SelectorMasUsados(apartados: lista, picoCentroX: pico) { v in
                            masUsados = nil
                            c.abrirApartado(v)
                        } cerrar: { masUsados = nil }
                        .frame(width: ancho)
                        .offset(x: x - g.size.width / 2)
                        .padding(.bottom, abajo)
                        // Nace del botón: escala 0,78 → 1 anclada al pico que apunta a «menú.».
                        .transition(sinMovimiento ? .opacity : .opacity.combined(with: .scale(scale: 0.78, anchor: UnitPoint(x: min(max(pico / ancho, 0), 1), y: 1))))
                    }
                }
            }
        }
        .animation(sinMovimiento ? nil : .spring(response: 0.28, dampingFraction: 0.82), value: masUsados?.map(\.vista).joined())
        .sensoryFeedback(.success, trigger: masUsados != nil) { _, abierto in abierto }
        .onChange(of: c.modal) { _, m in if m != nil { masUsados = nil } }
        .onChange(of: fase) { _, f in if f != .active { masUsados = nil } }
        .onChange(of: c.pestana) { masUsados = nil }
        .onChange(of: c.rutaMas) { masUsados = nil }
        .background(fondoPrincipal.ignoresSafeArea())
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

    private var pantallas: some View {
        @Bindable var c = c
        return TabView(selection: $c.pestana) {
            NavigationStack { InicioView() }.toolbar(.hidden, for: .tabBar).tag(Pestana.inicio).transition(transicionPestana)
            NavigationStack { PlanView() }.toolbar(.hidden, for: .tabBar).tag(Pestana.plan).transition(transicionPestana)
            NavigationStack { CalendarioView() }.toolbar(.hidden, for: .tabBar).tag(Pestana.calendario).transition(transicionPestana)
            NavigationStack { FinanzasView() }.toolbar(.hidden, for: .tabBar).tag(Pestana.finanzas).transition(transicionPestana)
            NavigationStack(path: $c.rutaMas) { MasView() }.toolbar(.hidden, for: .tabBar).tag(Pestana.mas).transition(transicionPestana)
        }
        .animation(sinMovimiento ? nil : .easeInOut(duration: 0.18), value: c.pestana)
    }

    private var barra: some View {
        BarraBitacora(pestanas: Self.pestanas(secundaria: c.secundaria),
                      activa: Self.porId.first { $0.value == c.pestana }?.key ?? "inicio") { id in
            masUsados = nil
            if let p = Self.porId[id] { c.tocarPestana(p) }
        } capturar: {
            masUsados = nil
            c.abrirApuntar()
        } mantener: {
            Task { await abrirMasUsados() }
        }
        .conVidrio(vidrio && !sinTransparencia)
    }

    // Glass: fondo atmosférico con dos manchas del propio tema, en degradados (sin filtros de desenfoque). Se ve tras la
    // barra y donde una pantalla no pinta su fondo.
    @ViewBuilder private var fondoPrincipal: some View {
        if vidrio && !sinTransparencia {
            ZStack {
                Paleta.fondo
                RadialGradient(colors: [Paleta.acento.opacity(0.22), .clear], center: UnitPoint(x: 0.12, y: 0.08), startRadius: 0, endRadius: 320)
                RadialGradient(colors: [Paleta.atencion.opacity(0.16), .clear], center: UnitPoint(x: 0.9, y: 0.8), startRadius: 0, endRadius: 360)
            }
        } else {
            Paleta.fondo
        }
    }

    private var transicionPestana: AnyTransition {
        sinMovimiento ? .identity : .opacity.combined(with: .scale(scale: 0.992))
    }
}

extension PrincipalView {
    // Excluye inicio, plan, menú, el cuarto acceso ya visible y lo oculto; si faltan, el orden del menú.
    func abrirMasUsados() async {
        guard let doc = await c.documentoVisible() else { return }
        let menu = Apartados.visibles(doc).flatMap(\.1).map { $0.vista == "studies" ? Apartado(vista: Apartados.destinoEstudios(doc), nombre: $0.nombre) : $0 }
        let cuarta = c.secundaria == .finanzas ? "finances" : "calendar"
        let ids = c.uso.ranking(candidatos: menu.map(\.vista), excluir: ["planner", cuarta])
        masUsados = ids.compactMap { id in menu.first { $0.vista == id } }
    }
}

struct PaginaWeb: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}
