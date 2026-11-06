import SwiftUI
import WebKit
import WidgetKit

// Cáscara nativa: carga appbitacora.es dentro de un WKWebView. Dos piezas
// nativas de verdad la acompañan:
// 1. Un WKScriptMessageHandler ("bitacoraNative") que recibe el resumen que
//    la web calcula tras cada guardado (bitacoraNativeSyncSnapshot() en
//    app.js) y lo deja en el App Group para que los widgets lo lean.
// 2. bitacora://quick?type=expense|income, que los widgets de Registro
//    rápido abren para saltar directos al registro rápido de Finanzas PRO.
struct ContentView: View {
    @StateObject private var model = WebViewModel()

    var body: some View {
        ZStack {
            WebView(model: model)
                .ignoresSafeArea()
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Sin indicador de carga nativo ni franja de diagnóstico: la propia web
            // enseña su pantalla de arranque, y un spinner encima la hacía parecer una web.
            if let message = model.errorMessage {
                VStack(spacing: 14) {
                    Text("No se ha podido cargar Bitácora")
                        .font(.headline)
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                    Button("Reintentar") {
                        model.reload()
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding()
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                .padding(24)
            }
        }
        .onOpenURL { url in
            model.handleIncomingURL(url)
        }
    }
}

@MainActor
final class WebViewModel: NSObject, ObservableObject, WKScriptMessageHandler {
    @Published var isLoading = true
    @Published var errorMessage: String?
    let webView: WKWebView

    // La URL apunta al sitio en producción: la app nativa no aloja ningún
    // contenido propio, solo envuelve la web que ya existe.
    static let entryURL = URL(string: "https://appbitacora.es/")!

    override init() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        // Sin esto, WKWebView negocia el sitio como si fuera de escritorio
        // (ignora el "width=device-width" del viewport) y todo sale
        // gigante y con scroll horizontal — Safari sí lo hace bien solo,
        // un WKWebView desnudo no.
        config.defaultWebpagePreferences.preferredContentMode = .mobile
        // Crear el WKWebView con frame .zero y cargar la página antes de
        // que SwiftUI le dé su tamaño real de pantalla hace que WebKit
        // calcule mal la escala del viewport desde el primer instante (todo
        // sale "zoomado" de forma uniforme, sin poder desplazarse a los
        // lados porque no hay un lienzo ancho extra, solo un cálculo de
        // escala equivocado) — se le da directamente el tamaño real de la
        // pantalla para que ese primer cálculo ya sea correcto.
        webView = WKWebView(frame: UIScreen.main.bounds, configuration: config)
        // Sin el gesto nativo de volver: arrastraba la web entera (barra de abajo incluida) con una foto gris debajo. La web
        // tiene el suyo, que solo mueve la página y en las pestañas de la barra cambia de pestaña (05-11).
        webView.allowsBackForwardNavigationGestures = false
        webView.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        // Un WKWebView desnudo recalcula solo los "content insets" de su
        // scroll view interno cuando aparece el teclado — con `position:
        // fixed` (el login, por ejemplo) eso descuadra el contenido hacia
        // un lado, algo que Safari de verdad no hace porque gestiona el
        // viewport visual de otra forma. Desactivarlo dejaselo a la propia
        // web, que ya maneja su layout sin depender de ese ajuste nativo.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        // Fondo del color de la pantalla de lanzamiento: sin esto, entre ella y
        // el primer pintado de la web salía un destello blanco.
        let fondo = UIColor(named: "LaunchBackground") ?? .black
        webView.isOpaque = false
        webView.backgroundColor = fondo
        webView.scrollView.backgroundColor = fondo
        super.init()
        // Sobre la configuración que de verdad usa la WKWebView (la copia que se le pasó al crearla podría no compartir el
        // controlador). El puente necesita self, así que va después de super.init, pero antes de load(): el marcador
        // sigue entrando al empezar el documento.
        webView.configuration.userContentController.add(self, name: "bitacoraNative")
        webView.configuration.userContentController.addUserScript(Self.marcaNativa())
    }

    /// Antes de que cargue la página, la web recibe window.__BITACORA_NATIVE__:
    /// dentro de una WKWebView ni navigator.standalone ni display-mode:
    /// standalone dicen la verdad, y sin esta marca se veía la versión de
    /// escritorio (appEntorno en js/nucleo.js).
    static func marcaNativa() -> WKUserScript {
        let info = Bundle.main.infoDictionary
        let version = (info?["CFBundleShortVersionString"] as? String ?? "0") + "-" + (info?["CFBundleVersion"] as? String ?? "0")
        let capacidades = ["widgets", "quickEntry", "haptics"]
        let json = (try? JSONSerialization.data(withJSONObject: ["platform": "ios", "version": version, "capabilities": capacidades]))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "{\"platform\":\"ios\"}"
        let source = "window.__BITACORA_NATIVE__ = Object.freeze(\(json));"
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    func load() {
        errorMessage = nil
        isLoading = true
        webView.load(URLRequest(url: Self.entryURL))
    }

    func reload() {
        load()
    }

    /// La web llama a window.webkit.messageHandlers.bitacoraNative.postMessage(json)
    /// (ver bitacoraNativeSyncSnapshot() en app.js) con el JSON de
    /// BitacoraSnapshot ya calculado — aquí solo se guarda y se pide a
    /// WidgetKit que refresque.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "bitacoraNative" else { return }
        // Un toque háptico pedido por la web (haptico() en js/nucleo.js): al marcar una tarea, al apuntar...
        if let peticion = message.body as? [String: Any], let tipo = peticion["haptic"] as? String {
            switch tipo {
            case "exito": UINotificationFeedbackGenerator().notificationOccurred(.success)
            case "aviso": UINotificationFeedbackGenerator().notificationOccurred(.warning)
            default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
            return
        }
        guard let body = message.body as? String else { return }
        guard let defaults = UserDefaults(suiteName: BitacoraSnapshot.appGroupID) else { return }
        defaults.set(body.data(using: .utf8), forKey: BitacoraSnapshot.defaultsKey)
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// bitacora://quick?type=expense|income (desde el widget "Registro
    /// rápido") se traduce en cargar la web con ?quick=expense|income, que
    /// handleWidgetDeepLink() en app.js detecta y usa para abrir el
    /// registro rápido ya preparado en ese tipo.
    func handleIncomingURL(_ url: URL) {
        guard url.scheme == "bitacora", url.host == "quick" else { return }
        guard let type = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "type" })?.value,
            type == "expense" || type == "income" else { return }

        var target = URLComponents(url: Self.entryURL, resolvingAgainstBaseURL: false)!
        target.queryItems = [URLQueryItem(name: "quick", value: type)]
        guard let targetURL = target.url else { return }
        isLoading = true
        webView.load(URLRequest(url: targetURL))
    }
}

struct WebView: UIViewRepresentable {
    @ObservedObject var model: WebViewModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeUIView(context: Context) -> WKWebView {
        model.webView.navigationDelegate = context.coordinator
        model.load()
        return model.webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // La propia web gestiona su estado tras la carga inicial; no hace
        // falta reaccionar aquí a cambios de @State.
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        let model: WebViewModel

        init(model: WebViewModel) {
            self.model = model
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            model.isLoading = false
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            model.isLoading = false
            model.errorMessage = error.localizedDescription
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            model.isLoading = false
            model.errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    ContentView()
}
