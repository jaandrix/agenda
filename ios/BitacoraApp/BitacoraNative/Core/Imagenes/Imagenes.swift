import SwiftUI
import UIKit
import ImageIO

// 0.22: imágenes decodificadas una vez y al tamaño al que se pintan. `AsyncImage` no guarda nada en memoria (cada vez
// que una portada volvía a la pantalla se bajaba y decodificaba otra vez, a tamaño completo) y la foto de perfil se
// decodificaba en cada pintado de Inicio. Aquí se reducen con ImageIO al lado en píxeles, fuera del hilo principal,
// y se guardan en una NSCache (iOS la vacía sola si falta memoria).
enum Imagenes {
    private static let cache: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.totalCostLimit = 24 * 1024 * 1024
        return c
    }()

    static func guardada(_ clave: String) -> UIImage? { cache.object(forKey: clave as NSString) }

    private static func guardar(_ img: UIImage, _ clave: String) {
        let coste = Int(img.size.width * img.size.height * img.scale * img.scale * 4)
        cache.setObject(img, forKey: clave as NSString, cost: coste)
    }

    // Tinta (0.25): las imágenes se guardan ya en gris (una vez, al decodificar) y con su propia clave, así pintarlas no
    // cuesta nada más y al volver a un tema de color salen las de color.
    static var gris: Bool { TemaActivo.elegido == .tinta }

    // Reduce sin decodificar la imagen entera: ImageIO lee solo lo que hace falta para el lado pedido.
    static func reducida(_ datos: Data, lado: CGFloat, gris: Bool = false) -> UIImage? {
        // Fuera del hilo principal no hay pantalla a la que preguntar: 3 es la escala de los iPhone actuales.
        let escala: CGFloat = 3
        let opciones: [CFString: Any] = [kCGImageSourceShouldCache: false]
        guard let fuente = CGImageSourceCreateWithData(datos as CFData, opciones as CFDictionary) else { return nil }
        let miniatura: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                          kCGImageSourceShouldCacheImmediately: true,
                                          kCGImageSourceCreateThumbnailWithTransform: true,
                                          kCGImageSourceThumbnailMaxPixelSize: max(1, lado * escala)]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(fuente, 0, miniatura as CFDictionary) else { return nil }
        return UIImage(cgImage: gris ? enGris(cg) ?? cg : cg, scale: escala, orientation: .up)
    }

    private static func enGris(_ cg: CGImage) -> CGImage? {
        guard let ctx = CGContext(data: nil, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
        // Sin alfa: lo transparente (logos PNG) sale sobre el blanco, no sobre negro.
        ctx.setFillColor(gray: 1, alpha: 1)
        ctx.fill(CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        return ctx.makeImage()
    }

    // Para datos que ya están en memoria (la foto de perfil): la clave es su huella y el lado.
    static func desde(_ datos: Data, lado: CGFloat) -> UIImage? {
        var h = Hasher()
        datos.withUnsafeBytes { h.combine(bytes: $0) }
        let gris = Self.gris
        let clave = "d\(datos.count)-\(h.finalize())@\(Int(lado))" + (gris ? "g" : "")
        if let img = guardada(clave) { return img }
        guard let img = reducida(datos, lado: lado, gris: gris) else { return nil }
        guardar(img, clave)
        return img
    }

    // 0.23 (auditoría): solo respuestas 2xx de tipo imagen y de 8 MB como mucho; lo demás no se decodifica.
    static let maxBytes = 8 << 20
    static func aceptable(_ datos: Data, _ r: URLResponse) -> Data? {
        guard let h = r as? HTTPURLResponse, (200..<300).contains(h.statusCode), (h.mimeType ?? "image/").hasPrefix("image/"),
              h.expectedContentLength <= Int64(maxBytes), datos.count <= maxBytes else { return nil }
        return datos
    }

    static func clave(_ url: URL, lado: CGFloat) -> String { "\(url.absoluteString)@\(Int(lado))" + (gris ? "g" : "") }

    // Baja (con la caché de URLSession) y reduce fuera del hilo principal.
    static func cargar(_ url: URL, lado: CGFloat) async -> UIImage? {
        await cargarDetalle(url, lado: lado)?.imagen
    }

    // 3.2: primero la memoria, luego el disco (`ImagenesDisco`) y solo después la red; lo bajado se guarda en disco.
    // `deRed` dice si ha hecho falta bajarla (la portada que ya estaba en el iPhone sale sin fundido).
    static func cargarDetalle(_ url: URL, lado: CGFloat) async -> (imagen: UIImage, deRed: Bool)? {
        let k = clave(url, lado: lado)
        if let img = guardada(k) { return (img, false) }
        let gris = Self.gris
        let delDisco = await Task.detached(priority: .userInitiated) { () -> UIImage? in
            guard let datos = ImagenesDisco.leer(url) else { return nil }
            if let img = Imagenes.reducida(datos, lado: lado, gris: gris) { return img }
            ImagenesDisco.borrar(url)
            return nil
        }.value
        if let delDisco { guardar(delDisco, k); return (delDisco, false) }
        guard let respuesta = try? await URLSession.shared.data(from: url), let datos = aceptable(respuesta.0, respuesta.1) else { return nil }
        let img = await Task.detached(priority: .utility) { () -> UIImage? in
            let img = Imagenes.reducida(datos, lado: lado, gris: gris)
            if img != nil { ImagenesDisco.escribir(datos, url) }
            return img
        }.value
        guard let img else { return nil }
        guardar(img, k)
        return (img, true)
    }

    // Deja en memoria las primeras portadas de una lista antes de que se pinten (al abrir Ocio). Con `soloDisco`, solo
    // las que ya están en el iPhone (no espera a la red), varias a la vez.
    static func precargar(_ urls: [URL], lado: CGFloat, soloDisco: Bool = false) async {
        let faltan = urls.filter { guardada(clave($0, lado: lado)) == nil && (!soloDisco || ImagenesDisco.existe($0)) }
        await withTaskGroup(of: Void.self) { g in
            for u in faltan { g.addTask { _ = await Imagenes.cargarDetalle(u, lado: lado) } }
        }
    }
}

// Como `AsyncImage` con su contenido de reserva, pero con la caché de arriba: si ya está decodificada, sale en el
// primer pintado, sin parpadeo.
struct ImagenRemota<Reserva: View>: View {
    let url: URL
    let lado: CGFloat
    @ViewBuilder let reserva: () -> Reserva
    @State private var cargada: (url: URL, imagen: UIImage)? = nil

    var body: some View {
        Group {
            if let img = cargada.flatMap({ $0.url == url ? $0.imagen : nil }) ?? Imagenes.guardada(Imagenes.clave(url, lado: lado)) {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                reserva()
            }
        }
        .task(id: url) {
            guard cargada?.url != url, let img = await Imagenes.cargar(url, lado: lado) else { return }
            cargada = (url, img)
        }
    }
}
