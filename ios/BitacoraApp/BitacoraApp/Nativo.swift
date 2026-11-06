import SwiftUI
import WebKit
import LocalAuthentication
import SafariServices
import UserNotifications

// Fase 6 del plan de sensación nativa (06-11): lo que solo puede dar la app y no la PWA. La web habla con esto por el
// manejador con respuesta "bitacoraNativa" (js/nativo.js); el de siempre, "bitacoraNative", sigue para los widgets y
// el háptico. Nada de esto usa extensiones: con la firma gratuita de SideStore las extensiones no se instalan (ver la
// nota de los widgets en project.yml), así que compartir hacia Bitácora entra por bitacora://apuntar y por «Abrir en».

enum NativoAjustes {
    private static let d = UserDefaults.standard
    static var bloqueo: Bool { get { d.bool(forKey: "bitacora.bloqueo") } set { d.set(newValue, forKey: "bitacora.bloqueo") } }
    static var bloqueoFinanzas: Bool { get { d.bool(forKey: "bitacora.bloqueoFinanzas") } set { d.set(newValue, forKey: "bitacora.bloqueoFinanzas") } }
    static var avisos: Bool { get { d.bool(forKey: "bitacora.avisos") } set { d.set(newValue, forKey: "bitacora.avisos") } }
}

enum Biometria {
    static func tipo() -> String {
        let c = LAContext()
        guard c.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else {
            return c.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) ? "codigo" : "ninguna"
        }
        switch c.biometryType {
        case .faceID: return "faceID"
        case .touchID: return "touchID"
        default:
            if #available(iOS 17.0, *), c.biometryType == .opticID { return "opticID" }
            return "codigo"
        }
    }

    // Con el código del iPhone como respaldo: si Face ID falla varias veces no te deja fuera de tu propia app.
    static func autenticar(_ motivo: String) async -> Bool {
        let c = LAContext()
        c.localizedCancelTitle = "Cancelar"
        guard c.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { return true }
        return (try? await c.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: motivo)) ?? false
    }
}

@MainActor
enum Pantalla {
    static func arriba() -> UIViewController? {
        let escena = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
            ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        var vc = escena?.windows.first(where: { $0.isKeyWindow })?.rootViewController ?? escena?.windows.first?.rootViewController
        while let siguiente = vc?.presentedViewController { vc = siguiente }
        return vc
    }

    static func compartir(_ cosas: [Any], alAcabar: ((Bool) -> Void)? = nil) {
        guard let vc = arriba(), !cosas.isEmpty else { alAcabar?(false); return }
        let hoja = UIActivityViewController(activityItems: cosas, applicationActivities: nil)
        hoja.completionWithItemsHandler = { _, hecho, _, _ in alAcabar?(hecho) }
        // En iPad la hoja necesita de dónde salir; en el iPhone se ignora.
        hoja.popoverPresentationController?.sourceView = vc.view
        hoja.popoverPresentationController?.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 80, width: 1, height: 1)
        vc.present(hoja, animated: true)
    }

    static func abrirFuera(_ url: URL) {
        if url.scheme == "http" || url.scheme == "https", let vc = arriba() {
            let safari = SFSafariViewController(url: url)
            safari.dismissButtonStyle = .close
            vc.present(safari, animated: true)
        } else {
            UIApplication.shared.open(url)
        }
    }
}

extension WebViewModel: WKScriptMessageHandlerWithReply {
    static let hostsPropios: Set<String> = ["appbitacora.es", "www.appbitacora.es"]

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard let p = message.body as? [String: Any], let accion = p["accion"] as? String else { replyHandler(nil, "petición sin acción"); return }
        // Solo la propia web: una página de fuera cargada por error no puede pedir Face ID ni leer lo compartido.
        guard let host = message.frameInfo.request.url?.host, Self.hostsPropios.contains(host) || host == "localhost" else { replyHandler(nil, "origen no permitido"); return }
        switch accion {
        case "info":
            leerPermisoAvisos { permiso in replyHandler(self.info(permiso: permiso), nil) }
        case "compartir":
            compartirDesdeWeb(p) { hecho in replyHandler(["ok": hecho], nil) }
        case "abrir":
            if let s = p["url"] as? String, let url = URL(string: s) { Pantalla.abrirFuera(url); replyHandler(["ok": true], nil) } else { replyHandler(nil, "url no válida") }
        case "biometria":
            let motivo = (p["motivo"] as? String) ?? "Desbloquear Bitácora"
            Task { let ok = await Biometria.autenticar(motivo); replyHandler(["ok": ok], nil) }
        case "ajustes":
            Task { await cambiarAjustes(p); leerPermisoAvisos { permiso in replyHandler(self.info(permiso: permiso), nil) } }
        case "avisos":
            programarAvisos(p)
            replyHandler(["ok": true], nil)
        case "pendientes":
            let lista = recibidos
            recibidos = []
            replyHandler(lista, nil)
        default:
            replyHandler(nil, "acción desconocida: \(accion)")
        }
    }

    func info(permiso: String) -> [String: Any] {
        let i = Bundle.main.infoDictionary
        return [
            "version": (i?["CFBundleShortVersionString"] as? String ?? "0") + "-" + (i?["CFBundleVersion"] as? String ?? "0"),
            "biometria": Biometria.tipo(),
            "bloqueo": NativoAjustes.bloqueo,
            "bloqueoFinanzas": NativoAjustes.bloqueoFinanzas,
            "avisos": NativoAjustes.avisos,
            "permisoAvisos": permiso,
        ]
    }

    private func leerPermisoAvisos(_ fin: @escaping (String) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { s in
            let permiso: String
            switch s.authorizationStatus {
            case .authorized, .provisional, .ephemeral: permiso = "concedido"
            case .denied: permiso = "denegado"
            default: permiso = "sin-pedir"
            }
            DispatchQueue.main.async { fin(permiso) }
        }
    }

    // Encender un bloqueo pide Face ID antes: así se sabe que funciona y nadie lo enciende con el iPhone de otro.
    private func cambiarAjustes(_ p: [String: Any]) async {
        if let v = p["bloqueo"] as? Bool {
            if v && !NativoAjustes.bloqueo { if await Biometria.autenticar("Activar el bloqueo de Bitácora") { NativoAjustes.bloqueo = true } }
            else if !v { NativoAjustes.bloqueo = false }
        }
        if let v = p["bloqueoFinanzas"] as? Bool {
            if v && !NativoAjustes.bloqueoFinanzas { if await Biometria.autenticar("Proteger tus finanzas") { NativoAjustes.bloqueoFinanzas = true } }
            else if !v { NativoAjustes.bloqueoFinanzas = false }
        }
        if let v = p["avisos"] as? Bool {
            if v {
                let ok = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
                NativoAjustes.avisos = ok
            } else {
                NativoAjustes.avisos = false
                let centro = UNUserNotificationCenter.current()
                centro.removeAllPendingNotificationRequests()
                try? await centro.setBadgeCount(0)
            }
        }
    }

    // La web manda cada vez la lista entera de lo que viene (eventos con hora de los próximos días) y la cifra del
    // icono; aquí se sustituye lo programado. iOS deja 64 pendientes como mucho.
    private func programarAvisos(_ p: [String: Any]) {
        let centro = UNUserNotificationCenter.current()
        guard NativoAjustes.avisos else { return }
        centro.removeAllPendingNotificationRequests()
        let formato = DateFormatter()
        formato.locale = Locale(identifier: "en_US_POSIX")
        formato.timeZone = .current
        formato.dateFormat = "yyyy-MM-dd'T'HH:mm"
        let ahora = Date()
        for a in ((p["lista"] as? [[String: Any]]) ?? []).prefix(60) {
            guard let id = a["id"] as? String, let titulo = a["titulo"] as? String,
                  let cuando = (a["fecha"] as? String).flatMap(formato.date(from:)), cuando > ahora else { continue }
            let c = UNMutableNotificationContent()
            c.title = titulo
            c.body = (a["texto"] as? String) ?? ""
            c.sound = .default
            let partes = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: cuando)
            centro.add(UNNotificationRequest(identifier: "bitacora-" + id, content: c, trigger: UNCalendarNotificationTrigger(dateMatching: partes, repeats: false)))
        }
        if let n = p["insignia"] as? Int { centro.setBadgeCount(max(0, n), withCompletionHandler: nil) }
    }

    private func compartirDesdeWeb(_ p: [String: Any], fin: @escaping (Bool) -> Void) {
        var cosas: [Any] = []
        if let t = (p["texto"] as? String) ?? (p["titulo"] as? String), !t.isEmpty { cosas.append(t) }
        if let s = p["url"] as? String, let url = URL(string: s) { cosas.append(url) }
        let carpeta = FileManager.default.temporaryDirectory.appendingPathComponent("compartir", isDirectory: true)
        try? FileManager.default.removeItem(at: carpeta)
        try? FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
        for a in (p["archivos"] as? [[String: Any]]) ?? [] {
            guard let b64 = a["base64"] as? String, let datos = Data(base64Encoded: b64) else { continue }
            let nombre = ((a["nombre"] as? String) ?? "archivo").replacingOccurrences(of: "/", with: "-")
            let destino = carpeta.appendingPathComponent(nombre.isEmpty ? "archivo" : nombre)
            if (try? datos.write(to: destino)) != nil { cosas.append(destino) }
        }
        Pantalla.compartir(cosas, alAcabar: fin)
    }

    // Lo que llega de otras apps se guarda hasta que la web lo pide (si aún está arrancando o sin sesión, lo pedirá
    // al estar lista); si ya está lista, se le avisa.
    func recibir(_ cosa: [String: Any]) {
        recibidos.append(cosa)
        webView.evaluateJavaScript("window.bitacoraNativo && window.bitacoraNativo.hayPendientes()", completionHandler: nil)
    }

    func recibirArchivo(_ url: URL) {
        let acceso = url.startAccessingSecurityScopedResource()
        defer { if acceso { url.stopAccessingSecurityScopedResource() } }
        guard let datos = try? Data(contentsOf: url), datos.count < 200_000,
              let texto = String(data: datos, encoding: .utf8) ?? String(data: datos, encoding: .isoLatin1) else { return }
        recibir(["tipo": "texto", "texto": texto, "origen": url.lastPathComponent])
    }

    // El velo de privacidad y el bloqueo. Volver antes de un minuto no vuelve a pedir Face ID.
    func cambioDeFase(_ fase: ScenePhase) {
        guard NativoAjustes.bloqueo else { velo = false; bloqueada = false; return }
        switch fase {
        case .background:
            velo = true
            if salidaEn == nil { salidaEn = Date() }
        case .inactive:
            velo = true
        case .active:
            if let s = salidaEn, Date().timeIntervalSince(s) > 60 { bloqueada = true }
            salidaEn = nil
            velo = false
            if bloqueada { desbloquear() }
        @unknown default:
            break
        }
    }

    func desbloquear() {
        guard !autenticando else { return }
        autenticando = true
        Task {
            let ok = await Biometria.autenticar("Abrir Bitácora")
            bloqueada = !ok
            autenticando = false
        }
    }
}

struct VeloBloqueo: View {
    let bloqueada: Bool
    let desbloquear: () -> Void

    var body: some View {
        ZStack {
            Color("LaunchBackground").ignoresSafeArea()
            VStack(spacing: 18) {
                Text("bitácora.")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(.white)
                if bloqueada {
                    Button(action: desbloquear) {
                        Text("desbloquear.")
                            .font(.system(size: 17, weight: .semibold))
                            .padding(.horizontal, 22)
                            .padding(.vertical, 12)
                            .background(Color.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(.white)
                    }
                }
            }
        }
    }
}

// Alertas de la web (confirm() se usa antes de cada borrado): una WKWebView sin WKUIDelegate las ignora y confirm()
// devolvía siempre false, así que en la app no se podía borrar nada que preguntara antes.
@MainActor
final class DelegadoUI: NSObject, WKUIDelegate, WKNavigationDelegate, WKDownloadDelegate {
    weak var model: WebViewModel?
    private var ventanas: [WKWebView] = []
    private var descargas: [WKDownload: URL] = [:]

    init(model: WebViewModel) { self.model = model }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard let vc = Pantalla.arriba() else { completionHandler(); return }
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Vale", style: .default) { _ in completionHandler() })
        vc.present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard let vc = Pantalla.arriba() else { completionHandler(false); return }
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Cancelar", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "Aceptar", style: .default) { _ in completionHandler(true) })
        vc.present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        guard let vc = Pantalla.arriba() else { completionHandler(nil); return }
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { $0.text = defaultText }
        a.addAction(UIAlertAction(title: "Cancelar", style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: "Aceptar", style: .default) { _ in completionHandler(a.textFields?.first?.text ?? "") })
        vc.present(a, animated: true)
    }

    // window.open y target=_blank: con dirección, fuera de Bitácora. Sin ella (viajes.js abre la ventana antes del
    // await y le pone la dirección después), una WKWebView invisible que entrega fuera su primera dirección real.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, url.scheme == "http" || url.scheme == "https" || url.scheme == "mailto" || url.scheme == "tel" {
            Pantalla.abrirFuera(url)
            return nil
        }
        let hija = WKWebView(frame: .zero, configuration: configuration)
        hija.navigationDelegate = self
        hija.uiDelegate = self
        ventanas.append(hija)
        return hija
    }

    func webViewDidClose(_ webView: WKWebView) {
        ventanas.removeAll { $0 === webView }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let esquema = url.scheme?.lowercased() else { decisionHandler(.allow); return }
        if ventanas.contains(where: { $0 === webView }) {
            if esquema == "http" || esquema == "https" {
                Pantalla.abrirFuera(url)
                ventanas.removeAll { $0 === webView }
                decisionHandler(.cancel)
            } else { decisionHandler(.allow) }
            return
        }
        if navigationAction.shouldPerformDownload { decisionHandler(.download); return }
        if ["about", "blob", "data", "javascript"].contains(esquema) { decisionHandler(.allow); return }
        if esquema == "http" || esquema == "https" {
            let propio = WebViewModel.hostsPropios.contains(url.host ?? "")
            // Solo los enlaces que se tocan salen fuera: las redirecciones (iniciar sesión, el pago de Stripe) siguen dentro.
            if !propio && navigationAction.navigationType == .linkActivated && navigationAction.targetFrame?.isMainFrame != false {
                Pantalla.abrirFuera(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
            return
        }
        // mailto:, tel:, maps:, la App Store...: a su app.
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    // Descargas («descargar mis datos.», guardar una imagen, exportar): al acabar, la hoja de compartir, que tiene
    // «Guardar en Archivos» y «Guardar imagen».
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let carpeta = FileManager.default.temporaryDirectory.appendingPathComponent("descargas", isDirectory: true)
        try? FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
        let destino = carpeta.appendingPathComponent(suggestedFilename.isEmpty ? "descarga" : suggestedFilename)
        try? FileManager.default.removeItem(at: destino)
        descargas[download] = destino
        completionHandler(destino)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let destino = descargas.removeValue(forKey: download) else { return }
        Pantalla.compartir([destino])
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        descargas.removeValue(forKey: download)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView === model?.webView else { return }
        model?.isLoading = false
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard webView === model?.webView else { return }
        model?.isLoading = false
        if (error as NSError).code != NSURLErrorCancelled { model?.errorMessage = error.localizedDescription }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard webView === model?.webView else { return }
        let e = error as NSError
        model?.isLoading = false
        // Cancelar una navegación (un enlace que se abre fuera, una descarga) también llega aquí: no es un fallo.
        if e.code == NSURLErrorCancelled || (e.domain == "WebKitErrorDomain" && (e.code == 102 || e.code == 204)) { return }
        model?.errorMessage = error.localizedDescription
    }
}
