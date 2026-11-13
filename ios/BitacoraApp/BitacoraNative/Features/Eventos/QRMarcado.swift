import UIKit
import CoreImage.CIFilterBuiltins

// El QR de una entrada dibujado módulo a módulo (0.20). Antes la «b.» iba pegada encima de la imagen del sistema y
// tapaba medios módulos. Ahora:
// - corrección H y un hueco limpio en el centro, de un número impar de módulos (~24 % del lado, menos del 6 % del
//   área: H recupera hasta el 30 %), así no queda ningún módulo cortado debajo de la placa;
// - la «b.» va en una placa redondeada de la tinta oscura del tema, con medio módulo de margen;
// - los tres ojos, redondeados como los controles de la app (radio de 10 sobre 44);
// - margen blanco de 3 módulos alrededor, que los lectores necesitan.
// `QRMarcadoTests` lo genera y lo vuelve a leer con Vision.
enum QRMarcado {
    struct Matriz: Equatable {
        let n: Int
        let modulos: [Bool]
        func oscuro(_ x: Int, _ y: Int) -> Bool { modulos[y * n + x] }
    }

    static let silencio = 3
    private static let cache = NSCache<NSString, UIImage>()

    static func matriz(_ datos: Data) -> Matriz? {
        let f = CIFilter.qrCodeGenerator()
        f.message = datos
        f.correctionLevel = "H"
        guard let img = f.outputImage, let cg = CIContext().createCGImage(img, from: img.extent) else { return nil }
        let w = cg.width, h = cg.height
        guard w == h, w > 0 else { return nil }
        var px = [UInt8](repeating: 255, count: w * h)
        let ok: Bool = px.withUnsafeMutableBytes { buf in
            guard let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                      space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
            ctx.interpolationQuality = .none
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard ok else { return nil }
        // El generador deja su propio margen: se busca el primer módulo oscuro (la esquina del ojo de arriba).
        guard let primero = px.firstIndex(where: { $0 < 128 }) else { return nil }
        let margen = min(primero / w, primero % w)
        let n = w - 2 * margen
        guard n >= 21, (n - 17) % 4 == 0 else { return nil }
        var m = [Bool](repeating: false, count: n * n)
        for y in 0..<n { for x in 0..<n { m[y * n + x] = px[(y + margen) * w + x + margen] < 128 } }
        return Matriz(n: n, modulos: m)
    }

    // Lado del hueco central, en módulos: impar para que quede centrado en la rejilla.
    static func hueco(_ n: Int) -> Int {
        var h = Int((Double(n) * 0.24).rounded())
        if h % 2 == 0 { h += 1 }
        return max(5, h)
    }

    static func enOjo(_ x: Int, _ y: Int, _ n: Int) -> Bool {
        (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7)
    }

    static func imagen(_ datos: Data, placa: UIColor, letra: UIColor, punto: UIColor, porModulo: CGFloat = 12) -> UIImage? {
        let clave = "\(datos.hashValue)-\(placa.description)-\(porModulo)" as NSString
        if let ya = cache.object(forKey: clave) { return ya }
        guard let m = matriz(datos) else { return nil }
        let n = m.n, s = porModulo, total = CGFloat(n + 2 * silencio) * s, o = CGFloat(silencio) * s
        let h = hueco(n), h0 = (n - h) / 2
        let formato = UIGraphicsImageRendererFormat()
        formato.scale = 1
        formato.opaque = true
        let img = UIGraphicsImageRenderer(size: CGSize(width: total, height: total), format: formato).image { r in
            let ctx = r.cgContext
            ctx.setFillColor(UIColor.white.cgColor)
            ctx.fill(CGRect(x: 0, y: 0, width: total, height: total))
            ctx.setFillColor(UIColor.black.cgColor)
            for y in 0..<n {
                for x in 0..<n where m.oscuro(x, y) && !enOjo(x, y, n) && !(x >= h0 && x < h0 + h && y >= h0 && y < h0 + h) {
                    ctx.fill(CGRect(x: o + CGFloat(x) * s, y: o + CGFloat(y) * s, width: s, height: s))
                }
            }
            for (ex, ey) in [(0, 0), (n - 7, 0), (0, n - 7)] {
                let base = CGRect(x: o + CGFloat(ex) * s, y: o + CGFloat(ey) * s, width: 7 * s, height: 7 * s)
                let aro = UIBezierPath(roundedRect: base, cornerRadius: 2.2 * s)
                aro.append(UIBezierPath(roundedRect: base.insetBy(dx: s, dy: s), cornerRadius: 1.5 * s).reversing())
                aro.fill()
                UIBezierPath(roundedRect: base.insetBy(dx: 2 * s, dy: 2 * s), cornerRadius: 1.1 * s).fill()
            }
            let caja = CGRect(x: o + CGFloat(h0) * s, y: o + CGFloat(h0) * s, width: CGFloat(h) * s, height: CGFloat(h) * s).insetBy(dx: s / 2, dy: s / 2)
            placa.setFill()
            UIBezierPath(roundedRect: caja, cornerRadius: caja.width * 0.28).fill()
            let tam = caja.width * 0.66
            let fuente = UIFont(name: "Poppins-Bold", size: tam) ?? .systemFont(ofSize: tam, weight: .heavy)
            let b = NSAttributedString(string: "b", attributes: [.font: fuente, .foregroundColor: letra])
            let medida = b.size()
            let diam = tam * 0.2, sep = tam * 0.04
            let ancho = medida.width + sep + diam
            let x0 = caja.midX - ancho / 2, y0 = caja.midY - medida.height / 2
            b.draw(at: CGPoint(x: x0, y: y0))
            punto.setFill()
            let linea = y0 + fuente.ascender
            UIBezierPath(ovalIn: CGRect(x: x0 + medida.width + sep, y: linea - diam, width: diam, height: diam)).fill()
        }
        cache.setObject(img, forKey: clave)
        return img
    }

    // La tinta oscura del tema (en asfalto, su fondo; en los claros, su texto), siempre en la versión clara del tema:
    // el QR se lee sobre blanco.
    static func colorPlaca() -> UIColor {
        let t = TemaTokens.de(TemaActivo.elegido, sistemaOscuro: false)
        let a = UIColor(rgb: t.texto), b = UIColor(rgb: t.fondo)
        return luminancia(a) <= luminancia(b) ? a : b
    }

    static func colorLetra() -> UIColor {
        let t = TemaTokens.de(TemaActivo.elegido, sistemaOscuro: false)
        let a = UIColor(rgb: t.texto), b = UIColor(rgb: t.fondo)
        return luminancia(a) <= luminancia(b) ? b : a
    }

    static func luminancia(_ c: UIColor) -> CGFloat {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
}
