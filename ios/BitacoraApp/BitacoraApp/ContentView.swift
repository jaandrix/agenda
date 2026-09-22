import SwiftUI
import WebKit

// Hito 1: una cáscara nativa mínima que carga appbitacora.es dentro de un
// WKWebView. Nada de widgets/Siri/Compartir todavía — el único objetivo de
// esta primera versión es confirmar que el circuito completo (Xcode project
// generado por XcodeGen -> build sin firmar en GitHub Actions -> sideload
// con AltStore) funciona de punta a punta antes de invertir tiempo en
// funciones nativas de verdad.
struct ContentView: View {
    @StateObject private var model = WebViewModel()

    var body: some View {
        ZStack {
            WebView(model: model)

            if model.isLoading {
                ProgressView()
                    .progressViewStyle(.circular)
            }

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
    }
}

@MainActor
final class WebViewModel: ObservableObject {
    @Published var isLoading = true
    @Published var errorMessage: String?
    let webView: WKWebView

    // La URL apunta al sitio en producción: la app nativa no aloja ningún
    // contenido propio, solo envuelve la web que ya existe.
    static let entryURL = URL(string: "https://appbitacora.es/")!

    init() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
    }

    func load() {
        errorMessage = nil
        isLoading = true
        webView.load(URLRequest(url: Self.entryURL))
    }

    func reload() {
        load()
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
