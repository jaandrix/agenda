import UIKit
import ImageIO
import CoreImage

// procesarFotoPerfil (perfil.js), igual que la web: recorte cuadrado centrado, 256 px, niveles automáticos sin los
// extremos del histograma (2 % y 98 %), curva en S suave y grano monocromo, JPEG al 80 %. Core Image recorta y
// escala; los niveles y el grano van píxel a píxel con la misma fórmula que la web para que las fotos casen.
enum ProcesoFotoPerfil {
    static let lado = 256

    static func procesar(_ datos: Data) throws -> Data {
        guard let cg = reducida(datos) else { throw ErrorPerfil.imagenNoValida }
        let ci = CIImage(cgImage: cg)
        let w = ci.extent.width, h = ci.extent.height
        let corte = min(w, h)
        guard corte >= 1 else { throw ErrorPerfil.imagenNoValida }
        let rect = CGRect(x: (w - corte) / 2, y: (h - corte) / 2, width: corte, height: corte)
        let escala = CGFloat(lado) / corte
        let cuadrada = ci.cropped(to: rect)
            .transformed(by: CGAffineTransform(translationX: -rect.minX, y: -rect.minY))
            .applyingFilter("CILanczosScaleTransform", parameters: [kCIInputScaleKey: escala, kCIInputAspectRatioKey: 1])
        let contexto = CIContext()
        guard let escalada = contexto.createCGImage(cuadrada, from: CGRect(x: 0, y: 0, width: lado, height: lado)) else {
            throw ErrorPerfil.imagenNoValida
        }
        guard let gris = granulada(escalada) else { throw ErrorPerfil.imagenNoValida }
        let img = UIImage(cgImage: gris)
        for calidad in [0.8, 0.6, 0.45] as [CGFloat] {
            if let jpeg = img.jpegData(compressionQuality: calidad),
               jpeg.base64EncodedString().count + 23 <= PerfilPropio.maxFoto { return jpeg }
        }
        throw ErrorPerfil.demasiadoGrande
    }

    // Una foto de 48 Mpx no se decodifica entera: ImageIO la lee ya reducida y con la orientación aplicada.
    private static func reducida(_ datos: Data) -> CGImage? {
        guard let fuente = CGImageSourceCreateWithData(datos as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        let opciones: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                         kCGImageSourceCreateThumbnailWithTransform: true,
                                         kCGImageSourceShouldCacheImmediately: true,
                                         kCGImageSourceThumbnailMaxPixelSize: 1024]
        return CGImageSourceCreateThumbnailAtIndex(fuente, 0, opciones as CFDictionary)
    }

    private static func granulada(_ cg: CGImage) -> CGImage? {
        let n = lado * lado
        guard let ctx = CGContext(data: nil, width: lado, height: lado, bitsPerComponent: 8, bytesPerRow: lado * 4,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue),
              let base = ctx.data else { return nil }
        ctx.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
        ctx.fill(CGRect(x: 0, y: 0, width: lado, height: lado))
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: lado, height: lado))
        let p = base.bindMemory(to: UInt8.self, capacity: n * 4)
        var luz = [Double](repeating: 0, count: n)
        var hist = [Int](repeating: 0, count: 256)
        for i in 0..<n {
            let l = 0.299 * Double(p[i * 4]) + 0.587 * Double(p[i * 4 + 1]) + 0.114 * Double(p[i * 4 + 2])
            luz[i] = l
            hist[min(255, Int(l.rounded()))] += 1
        }
        func percentil(_ q: Double) -> Double {
            var acum = 0
            for v in 0..<256 { acum += hist[v]; if Double(acum) >= Double(n) * q { return Double(v) } }
            return 255
        }
        let bajo = percentil(0.02), alto = max(percentil(0.98), bajo + 1)
        guard let salida = CGContext(data: nil, width: lado, height: lado, bitsPerComponent: 8, bytesPerRow: lado,
                                     space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue),
              let destino = salida.data else { return nil }
        let q = destino.bindMemory(to: UInt8.self, capacity: n)
        for i in 0..<n {
            var v = min(1, max(0, (luz[i] - bajo) / (alto - bajo)))
            let s = v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v)
            v = (v * 0.45 + s * 0.55) * 255
            v += (Double.random(in: 0..<1) + Double.random(in: 0..<1) + Double.random(in: 0..<1) - 1.5) * 30
            q[i] = UInt8(min(255, max(0, v)))
        }
        return salida.makeImage()
    }
}
