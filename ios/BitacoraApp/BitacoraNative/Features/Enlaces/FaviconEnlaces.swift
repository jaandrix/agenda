import SwiftUI
import UIKit

// 3.2: el logo de cada enlace. Se pide solo a la propia web del enlace (nunca a un servicio de favicons de terceros, que
// sabría qué webs guardas): primero su apple-touch-icon, luego el <link rel="icon"> de su portada y por último
// /favicon.ico. Se guarda en disco (Caches/favicons) y en memoria; si la web no tiene logo se anota y no se vuelve a
// preguntar en una semana. Sin red no se anota nada: se reintenta la próxima vez.
enum FaviconEnlaces {
    nonisolated(unsafe) private static let memoria: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.countLimit = 300
        return c
    }()
    private static let reintento: TimeInterval = 7 * 86_400
    private static let espera: TimeInterval = 8
    private static let minimoPixeles: CGFloat = 16

    static func host(_ url: String) -> String? {
        let t = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let u = URL(string: t.contains("://") ? t : "https://" + t),
              ["http", "https"].contains(u.scheme?.lowercased() ?? ""), let h = u.host?.lowercased(), !h.isEmpty else { return nil }
        return h
    }

    static func enMemoria(_ url: String) -> UIImage? {
        host(url).flatMap { memoria.object(forKey: $0 as NSString) }
    }

    static func imagen(url: String, lado: CGFloat) async -> UIImage? {
        guard let h = host(url) else { return nil }
        if let img = memoria.object(forKey: h as NSString) { return img }
        let img = await Task.detached(priority: .utility) { await FaviconEnlaces.cargar(host: h, lado: lado) }.value
        if let img { memoria.setObject(img, forKey: h as NSString) }
        return img
    }

    private static var carpeta: URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.appendingPathComponent("favicons", isDirectory: true)
    }

    private static func nombre(_ host: String) -> String {
        host.replacingOccurrences(of: "[^a-z0-9.-]", with: "_", options: .regularExpression)
    }

    private static func cargar(host: String, lado: CGFloat) async -> UIImage? {
        guard let carpeta else { return nil }
        let fm = FileManager.default
        try? fm.createDirectory(at: carpeta, withIntermediateDirectories: true)
        let archivo = carpeta.appendingPathComponent(nombre(host) + ".img")
        let sinLogo = carpeta.appendingPathComponent(nombre(host) + ".no")
        if let datos = try? Data(contentsOf: archivo), let img = util(datos, lado) { return img }
        if let f = (try? fm.attributesOfItem(atPath: sinLogo.path))?[.modificationDate] as? Date,
           Date().timeIntervalSince(f) < reintento { return nil }

        var respondio = true
        var candidatos: [URL?] = [URL(string: "https://\(host)/apple-touch-icon.png")]
        let (enPagina, paginaRespondio) = await iconoDeLaPortada(host)
        respondio = respondio && paginaRespondio
        candidatos.append(enPagina)
        candidatos.append(URL(string: "https://\(host)/favicon.ico"))
        for case let u? in candidatos {
            let (datos, ok) = await bajar(u)
            respondio = respondio && ok
            if let datos, let img = util(datos, lado) {
                try? datos.write(to: archivo, options: .atomic)
                try? fm.removeItem(at: sinLogo)
                return img
            }
        }
        if respondio { try? Data().write(to: sinLogo, options: .atomic) }
        return nil
    }

    // Reducida al lado en que se pinta; fuera los iconos diminutos, que escalados se ven borrosos (mejor la inicial).
    private static func util(_ datos: Data, _ lado: CGFloat) -> UIImage? {
        guard let img = Imagenes.reducida(datos, lado: lado), img.size.width * img.scale >= minimoPixeles else { return nil }
        return img
    }

    // (datos, respondió): `respondió` es false solo si falló la red, para no anotar «sin logo» estando sin conexión.
    private static func bajar(_ url: URL) async -> (Data?, Bool) {
        var p = URLRequest(url: url, timeoutInterval: espera)
        p.setValue("image/*", forHTTPHeaderField: "Accept")
        do {
            let (d, r) = try await URLSession.shared.data(for: p)
            return (Imagenes.aceptable(d, r), true)
        } catch {
            return (nil, false)
        }
    }

    private static func iconoDeLaPortada(_ host: String) async -> (URL?, Bool) {
        guard let base = URL(string: "https://\(host)/") else { return (nil, true) }
        let p = URLRequest(url: base, timeoutInterval: espera)
        do {
            let (d, r) = try await URLSession.shared.data(for: p)
            guard let h = r as? HTTPURLResponse, (200..<300).contains(h.statusCode) else { return (nil, true) }
            let html = String(decoding: d.prefix(300_000), as: UTF8.self)
            return (enlaceIcono(html, base: h.url ?? base), true)
        } catch {
            return (nil, false)
        }
    }

    // El primer <link rel="…icon…" href="…">, con preferencia por apple-touch-icon (suele ser el más grande).
    static func enlaceIcono(_ html: String, base: URL) -> URL? {
        guard let etiquetas = try? NSRegularExpression(pattern: "<link\\b[^>]*>", options: [.caseInsensitive]),
              let rel = try? NSRegularExpression(pattern: "rel\\s*=\\s*[\"']([^\"']*)[\"']", options: [.caseInsensitive]),
              let href = try? NSRegularExpression(pattern: "href\\s*=\\s*[\"']([^\"']+)[\"']", options: [.caseInsensitive]) else { return nil }
        let todo = NSRange(html.startIndex..., in: html)
        var tactil: URL?
        var normal: URL?
        for m in etiquetas.matches(in: html, range: todo) {
            guard let r = Range(m.range, in: html) else { continue }
            let tag = String(html[r])
            let t = NSRange(tag.startIndex..., in: tag)
            guard let mr = rel.firstMatch(in: tag, range: t), let rr = Range(mr.range(at: 1), in: tag),
                  let mh = href.firstMatch(in: tag, range: t), let rh = Range(mh.range(at: 1), in: tag) else { continue }
            let tipo = tag[rr].lowercased()
            guard tipo.contains("icon"), !tag.lowercased().contains(".svg"),
                  let u = URL(string: String(tag[rh]), relativeTo: base)?.absoluteURL,
                  ["http", "https"].contains(u.scheme?.lowercased() ?? "") else { continue }
            if tipo.contains("apple-touch-icon") { if tactil == nil { tactil = u } } else if normal == nil { normal = u }
        }
        return tactil ?? normal
    }
}
