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

    // Reduce sin decodificar la imagen entera: ImageIO lee solo lo que hace falta para el lado pedido.
    static func reducida(_ datos: Data, lado: CGFloat) -> UIImage? {
        // Fuera del hilo principal no hay pantalla a la que preguntar: 3 es la escala de los iPhone actuales.
        let escala: CGFloat = 3
        let opciones: [CFString: Any] = [kCGImageSourceShouldCache: false]
        guard let fuente = CGImageSourceCreateWithData(datos as CFData, opciones as CFDictionary) else { return nil }
        let miniatura: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                          kCGImageSourceShouldCacheImmediately: true,
                                          kCGImageSourceCreateThumbnailWithTransform: true,
                                          kCGImageSourceThumbnailMaxPixelSize: max(1, lado * escala)]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(fuente, 0, miniatura as CFDictionary) else { return nil }
        return UIImage(cgImage: cg, scale: escala, orientation: .up)
    }

    // Para datos que ya están en memoria (la foto de perfil): la clave es su huella y el lado.
    static func desde(_ datos: Data, lado: CGFloat) -> UIImage? {
        var h = Hasher()
        datos.withUnsafeBytes { h.combine(bytes: $0) }
        let clave = "d\(datos.count)-\(h.finalize())@\(Int(lado))"
        if let img = guardada(clave) { return img }
        guard let img = reducida(datos, lado: lado) else { return nil }
        guardar(img, clave)
        return img
    }

    static func clave(_ url: URL, lado: CGFloat) -> String { "\(url.absoluteString)@\(Int(lado))" }

    // Baja (con la caché de URLSession) y reduce fuera del hilo principal.
    static func cargar(_ url: URL, lado: CGFloat) async -> UIImage? {
        let k = clave(url, lado: lado)
        if let img = guardada(k) { return img }
        guard let respuesta = try? await URLSession.shared.data(from: url) else { return nil }
        let datos = respuesta.0
        let img = await Task.detached(priority: .utility) { Imagenes.reducida(datos, lado: lado) }.value
        if let img { guardar(img, k) }
        return img
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
