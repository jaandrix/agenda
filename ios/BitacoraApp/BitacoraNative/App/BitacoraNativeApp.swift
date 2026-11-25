import SwiftUI
import UIKit

@main
struct BitacoraNativeApp: App {
    @State private var coordinador = AppCoordinator()
    @Environment(\.scenePhase) private var fase

    // Los títulos de navegación y las pestañas los dibuja UIKit, que no ve el `.font` de SwiftUI: sin esto salían
    // con la letra del sistema aunque Poppins estuviera cargada.
    init() {
        Medidas.abrirApp()
        UserDefaults.standard.removeObject(forKey: "bitacora.glass")
        func poppins(_ nombre: String, _ tamano: CGFloat, _ estilo: UIFont.TextStyle) -> UIFont {
            UIFontMetrics(forTextStyle: estilo).scaledFont(for: UIFont(name: nombre, size: tamano) ?? .systemFont(ofSize: tamano))
        }
        // Colores del tema resueltos al pintar (0.22): la barra con fondo era el material translúcido del sistema
        // (desenfoque y gris iOS en todos los temas); ahora es opaca, del fondo del tema, con un filete del tema.
        func delTema(_ f: @escaping (TemaTokens) -> UIColor) -> UIColor {
            UIColor { t in f(TemaTokens.de(TemaActivo.elegido, sistemaOscuro: t.userInterfaceStyle == .dark)) }
        }
        let tinta = delTema { UIColor(rgb: $0.texto) }
        let barra = UINavigationBarAppearance()
        barra.configureWithTransparentBackground()
        barra.largeTitleTextAttributes = [.font: poppins("Poppins-Bold", 26, .largeTitle), .foregroundColor: delTema { UIColor(rgb: $0.titulo ?? $0.texto) }]
        barra.titleTextAttributes = [.font: poppins("Poppins-SemiBold", 15, .headline), .foregroundColor: tinta]
        let conFondo = UINavigationBarAppearance()
        conFondo.configureWithOpaqueBackground()
        conFondo.backgroundColor = delTema { UIColor(rgb: $0.fondo) }
        conFondo.shadowColor = delTema { UIColor(rgb: $0.filo ?? $0.texto, alfa: ($0.bordeAlfa ?? 0.08) + 0.03) }
        conFondo.largeTitleTextAttributes = barra.largeTitleTextAttributes
        conFondo.titleTextAttributes = barra.titleTextAttributes
        let boton = UIBarButtonItemAppearance()
        boton.normal.titleTextAttributes = [.font: poppins("Poppins-Medium", 15, .body)]
        conFondo.buttonAppearance = boton
        barra.buttonAppearance = boton
        UINavigationBar.appearance().scrollEdgeAppearance = barra
        UINavigationBar.appearance().standardAppearance = conFondo
        UINavigationBar.appearance().compactAppearance = conFondo
        let pestanas = UITabBarAppearance()
        pestanas.configureWithOpaqueBackground()
        pestanas.backgroundColor = delTema { UIColor(rgb: $0.barra ?? $0.superficie) }
        let pie = [NSAttributedString.Key.font: poppins("Poppins-Medium", 10, .caption2)]
        for estilo in [pestanas.stackedLayoutAppearance, pestanas.inlineLayoutAppearance, pestanas.compactInlineLayoutAppearance] {
            estilo.normal.titleTextAttributes = pie
            estilo.selected.titleTextAttributes = pie
        }
        UITabBar.appearance().standardAppearance = pestanas
        UITabBar.appearance().scrollEdgeAppearance = pestanas
        // Los segmentos (tipo de movimiento, de categoría...) eran grises de iOS: superficie elegida y tinta del tema.
        let segmento = UISegmentedControl.appearance()
        segmento.selectedSegmentTintColor = delTema { UIColor(rgb: $0.superficie) }
        segmento.backgroundColor = delTema { UIColor(rgb: $0.texto, alfa: $0.oscuro ? 0.1 : 0.07) }
        segmento.setTitleTextAttributes([.font: poppins("Poppins-Medium", 13, .footnote), .foregroundColor: delTema { UIColor(rgb: $0.secundario) }], for: .normal)
        segmento.setTitleTextAttributes([.font: poppins("Poppins-SemiBold", 13, .footnote), .foregroundColor: tinta], for: .selected)
        TecladoGlobal.instalar()
    }

    var body: some Scene {
        WindowGroup {
            if PruebaCarruselView.activa {
                PruebaCarruselView()
            } else {
                RaizView()
                    .id("\(coordinador.tema.rawValue)-\(coordinador.letra.rawValue)")
                    .environment(coordinador)
                    .preferredColorScheme(coordinador.tema.esquema)
                    .tint(Paleta.acento)
                    .onOpenURL { coordinador.recibirURL($0) }
                    .task { await coordinador.arrancar() }
            }
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
    @State private var teclado = false
    // 3.1: el borde de abajo sin teclado. Con el teclado fuera, el GeometryReader lo cuenta como zona segura y la barra
    // daba un salto al cerrarse «apuntar.».
    @State private var abajoReposo: CGFloat = 0

    // 3.3 (petición de Alejandro): la barra es fija, inicio, plan y calendario, y el menú con el resto. Antes el tercer
    // hueco cambiaba entre calendario y finanzas según el último abierto.
    static func pestanas() -> [BarraBitacora.Pestana] {
        [.init(id: "inicio", titulo: "inicio", icono: "inicio"),
         .init(id: "plan", titulo: "plan", icono: "plan"),
         .init(id: "calendario", titulo: "calendario", icono: "calendario"),
         .init(id: "mas", titulo: "menú", icono: "menu")]
    }
    private static let porId: [String: Pestana] = ["inicio": .inicio, "plan": .plan, "calendario": .calendario, "finanzas": .finanzas, "mas": .mas]

    var body: some View {
        @Bindable var c = c
        // 2.0: la barra flota encima del contenido (no lo empuja) y se separa del borde de abajo. Cada pantalla reserva
        // abajo lo que ocupa (safeAreaInset en cada NavigationStack), así su último elemento sube por encima de ella.
        GeometryReader { g in
            let abajo = g.safeAreaInsets.bottom < 120 ? g.safeAreaInsets.bottom : abajoReposo
            let margen = max(Medida.separacionInferior, abajo - 26)
            let reserva = teclado ? 0 : max(0, margen + Medida.alturaBarra + 20 - abajo)
            ZStack(alignment: .bottom) {
                // 3.1 (vídeo de Alejandro, «no nace bien»): con «apuntar.» abierto, lo de detrás no reacciona al teclado.
                // Antes, al salir el teclado, todas las pestañas se recolocaban a mitad de la animación del modal.
                pantallas(reserva: reserva)
                    .ignoresSafeArea(.keyboard, edges: apuntarActual != nil ? .bottom : [])
                if !teclado {
                    barra
                        // Se funde al tocar el +: si no, se veía a través del modal mientras nacía.
                        .opacity(apuntarActual != nil ? 0 : 1)
                        .scaleEffect(apuntarActual != nil && !sinMovimiento ? 0.96 : 1, anchor: .bottom)
                        .padding(.bottom, margen)
                        .ignoresSafeArea(.container, edges: .bottom)
                        .ignoresSafeArea(.keyboard, edges: .bottom)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: teclado)
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: apuntarActual != nil)
            .onAppear { if g.safeAreaInsets.bottom < 120 { abajoReposo = g.safeAreaInsets.bottom } }
            .onChange(of: g.safeAreaInsets.bottom) { _, nuevo in if nuevo < 120 { abajoReposo = nuevo } }
        }
        // «apuntar.» ya no es una hoja: es el modal flotante oscuro, que sube con el teclado.
        .capaFlotante(presentado: apuntarActual != nil, cerrar: { c.modal = nil }) {
            if let a = apuntarActual { ApuntarView(inicial: a).id(a.id) }
        }
        // Con el teclado abierto la barra se va (en todas las pantallas): si no, quedaba encima del teclado y tapaba el campo.
        // Con «apuntar.» abierto la barra ya está fundida y el teclado es del modal: no se toca nada más.
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            masUsados = nil
            if apuntarActual == nil { teclado = true }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in teclado = false }
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
        .animation(sinMovimiento ? .easeOut(duration: 0.16) : .spring(response: 0.27, dampingFraction: 0.8), value: masUsados?.map(\.vista).joined())
        .sensoryFeedback(.success, trigger: masUsados != nil) { _, abierto in abierto }
        .onChange(of: c.modal) { _, m in if m != nil { masUsados = nil } }
        .onChange(of: fase) { _, f in if f != .active { masUsados = nil } }
        .onChange(of: c.pestana) { masUsados = nil }
        .onChange(of: c.rutaMas) { masUsados = nil }
        .background(Paleta.fondo.ignoresSafeArea())
        .overlay(alignment: .top) {
            if let aviso = c.aviso { AvisoFlotante(texto: aviso) }
        }
        .animation(sinMovimiento ? nil : .easeOut(duration: 0.18), value: c.aviso)
        .onChange(of: c.pestana) { _, p in
            Medidas.cambioDePestana(p)
        }
        .fullScreenCover(item: Binding(get: { c.web.map(PaginaWeb.init) }, set: { c.web = $0?.url })) { NavegadorWeb(url: $0.url).ignoresSafeArea() }
        .hoja(item: hojaModal) { m in
            // Las hojas son las del sistema (detents, arrastrar para cerrar) con el fondo, la tinta y la letra de Bitácora.
            Group {
                switch m {
                case .apuntar: EmptyView()   // va en la capa flotante
                case .tarea(let t): EditorTareaView(inicial: t)
                case .evento(let e): EditorEventoView(inicial: e)
                case .movimiento(let id, let tipo): EditorMovimientoView(id: id, tipoInicial: tipo)
                case .editarMovimiento(let m): EditorMovimientoView(id: m.id, tipoInicial: m.tipo, existente: m)
                case .ficha(let e, let d): FichaEventoView(evento: e, dia: d)
                case .tiempo: TiempoView()
                }
            }
        }
    }

    private func pantallas(reserva: CGFloat) -> some View {
        @Bindable var c = c
        return TabView(selection: $c.pestana) {
            NavigationStack { InicioView().huecoDeBarra() }.reservaBarra(reserva).pestanaVisible(c.pestana == .inicio).toolbar(.hidden, for: .tabBar).tag(Pestana.inicio).transition(transicionPestana)
            NavigationStack { PlanView().huecoDeBarra() }.reservaBarra(reserva).pestanaVisible(c.pestana == .plan).toolbar(.hidden, for: .tabBar).tag(Pestana.plan).transition(transicionPestana)
            NavigationStack { CalendarioView().huecoDeBarra() }.reservaBarra(reserva).pestanaVisible(c.pestana == .calendario).toolbar(.hidden, for: .tabBar).tag(Pestana.calendario).transition(transicionPestana)
            NavigationStack { FinanzasView().huecoDeBarra() }.reservaBarra(reserva).pestanaVisible(c.pestana == .finanzas).toolbar(.hidden, for: .tabBar).tag(Pestana.finanzas).transition(transicionPestana)
            NavigationStack(path: $c.rutaMas) { MasView().huecoDeBarra() }.reservaBarra(reserva).pestanaVisible(c.pestana == .mas).toolbar(.hidden, for: .tabBar).tag(Pestana.mas).transition(transicionPestana)
        }
        .animation(sinMovimiento ? nil : Muelle.rapido, value: c.pestana)
    }

    private var barra: some View {
        // Finanzas ya no tiene hueco propio: se abre desde el menú, así que es «menú» lo que se ve encendido.
        BarraFlotante(pestanas: Self.pestanas().map { .init(id: $0.id, titulo: $0.titulo, icono: $0.icono) },
                      activa: c.pestana == .finanzas ? "mas" : (Self.porId.first(where: { $0.value == c.pestana })?.key ?? "inicio"),
                      elegir: { id in
                          masUsados = nil
                          if let p = Self.porId[id] { c.tocarPestana(p) }
                      },
                      apuntar: {
                          masUsados = nil
                          c.abrirApuntar()
                      },
                      mantener: { id in
                          if id == "mas" { Task { await abrirMasUsados() } }
                      })
    }

    private var apuntarActual: ApuntarInicial? {
        if case .apuntar(let a) = c.modal { return a }
        return nil
    }

    // Las hojas del sistema para todo menos «apuntar.», que va en la capa flotante.
    private var hojaModal: Binding<Modal?> {
        Binding(get: {
            if case .apuntar = c.modal { return nil }
            return c.modal
        }, set: { nuevo in
            if nuevo == nil, case .apuntar = c.modal { return }
            c.modal = nuevo
        })
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
        let cuarta = "calendar"
        let ids = c.uso.ranking(candidatos: menu.map(\.vista), excluir: ["planner", cuarta])
        masUsados = ids.compactMap { id in menu.first { $0.vista == id } }
    }
}

extension View {
    // 3.0.1: el alto que ocupa la barra flotante viaja por el entorno y cada pantalla de la pila lo reserva con
    // `huecoDeBarra()`. Un safeAreaInset sobre el NavigationStack no llegaba a los scrolls de dentro del TabView (lo
    // último de Ajustes, del menú o del Calendario quedaba bajo la barra), y contentMargins para todo el árbol también
    // metía margen en los scrolls horizontales de alto fijo (la semana, los carruseles).
    func reservaBarra(_ alto: CGFloat) -> some View {
        environment(\.reservaBarra, alto)
    }

    /// Reserva abajo el hueco de la barra flotante. Va en la raíz de cada pestaña y en cada pantalla que se apila.
    func huecoDeBarra() -> some View { modifier(HuecoDeBarra()) }
}

extension View {
    // 3.2 (lag general): las cinco pestañas siguen vivas en el TabView y cada una recalculaba su modelo con cada cambio de
    // `revision` aunque no se viera. El armazón marca cuál se ve; `tareaVisible(id:)` sustituye a `.task(id:)` y en una
    // pestaña oculta deja el trabajo para cuando vuelva a verse (y solo si el id cambió mientras tanto).
    func pestanaVisible(_ visible: Bool) -> some View {
        environment(\.pestanaVisible, visible)
    }

    /// Como `.task(id:)`, pero si la pestaña no se ve no trabaja: lo hace al volver, una vez, si `id` cambió.
    func tareaVisible<ID: Equatable>(id: ID, prioridad: TaskPriority = .userInitiated, _ trabajo: @escaping () async -> Void) -> some View {
        modifier(TareaVisible(id: id, prioridad: prioridad, trabajo: trabajo))
    }
}

private struct PestanaVisibleClave: EnvironmentKey {
    static let defaultValue = true
}

extension EnvironmentValues {
    var pestanaVisible: Bool {
        get { self[PestanaVisibleClave.self] }
        set { self[PestanaVisibleClave.self] = newValue }
    }
}

private struct TareaVisible<ID: Equatable>: ViewModifier {
    let id: ID
    let prioridad: TaskPriority
    let trabajo: () async -> Void
    @Environment(\.pestanaVisible) private var visible
    @State private var hecho: ID?

    func body(content: Content) -> some View {
        // Oculta, la clave se queda en lo último hecho: no se relanza nada. Al volver, si `id` cambió, se relanza.
        content.task(id: visible ? Optional(id) : hecho, priority: prioridad) {
            guard visible, hecho != id else { return }
            let pedido = id
            await trabajo()
            if !Task.isCancelled { hecho = pedido }
        }
    }
}

private struct ReservaBarraClave: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

extension EnvironmentValues {
    var reservaBarra: CGFloat {
        get { self[ReservaBarraClave.self] }
        set { self[ReservaBarraClave.self] = newValue }
    }
}

private struct HuecoDeBarra: ViewModifier {
    @Environment(\.reservaBarra) private var alto

    func body(content: Content) -> some View {
        content.safeAreaInset(edge: .bottom, spacing: 0) {
            Color.clear.frame(height: alto).allowsHitTesting(false).accessibilityHidden(true)
        }
    }
}

struct PaginaWeb: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}
