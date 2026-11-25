import Foundation
import UIKit
import ImageIO
import CryptoKit

// 3.2: las portadas bajadas se quedan en el iPhone. Antes solo vivían en la NSCache de `Imagenes` (se vacía al cerrar
// la app) y en la caché de URLSession (pequeña y sin garantías), así que al abrir Ocio salían en blanco y se volvían a
// bajar, y sin conexión no había portadas. Se guardan los bytes de cada URL (no la miniatura: la misma imagen se pinta
// a varios tamaños) en Application Support, fuera de la copia de iCloud. Va en Application Support y no en Caches
// porque iOS vacía Caches cuando le falta espacio y la idea es que se vean sin red. Con más de `limite` se borran las
// más antiguas al arrancar.
enum ImagenesDisco {
    static let limite = 200 * 1024 * 1024
    // Una portada de más de esto (las de Open Library -L pasan de 300 KB) se guarda reducida: la ficha la pinta a
    // 164 pt de ancho, unos 720 px de alto a escala 3.
    static let maxGuardado = 350 * 1024
    static let ladoGuardado: CGFloat = 900

    static let carpeta: URL? = {
        guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        var u = base.appendingPathComponent("Portadas", isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        var v = URLResourceValues()
        v.isExcludedFromBackup = true
        try? u.setResourceValues(v)
        return u
    }()

    static func archivo(_ url: URL) -> URL? {
        let h = SHA256.hash(data: Data(url.absoluteString.utf8)).map { String(format: "%02x", $0) }.joined()
        return carpeta?.appendingPathComponent(h, isDirectory: false)
    }

    static func existe(_ url: URL) -> Bool {
        guard let a = archivo(url) else { return false }
        return FileManager.default.fileExists(atPath: a.path)
    }

    static func leer(_ url: URL) -> Data? {
        guard let a = archivo(url) else { return nil }
        return try? Data(contentsOf: a, options: .mappedIfSafe)
    }

    // Se llama fuera del hilo principal (reducir y escribir cuestan).
    static func escribir(_ datos: Data, _ url: URL) {
        _ = recorteInicial
        guard let a = archivo(url) else { return }
        let guardar = datos.count > maxGuardado ? (compacta(datos) ?? datos) : datos
        try? guardar.write(to: a, options: .atomic)
    }

    static func borrar(_ url: URL) {
        guard let a = archivo(url) else { return }
        try? FileManager.default.removeItem(at: a)
    }

    // JPEG de `ladoGuardado` px de lado mayor. Nil si no se puede (se guarda el original).
    static func compacta(_ datos: Data) -> Data? {
        guard let fuente = CGImageSourceCreateWithData(datos as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        let opciones: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                         kCGImageSourceCreateThumbnailWithTransform: true,
                                         kCGImageSourceThumbnailMaxPixelSize: ladoGuardado]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(fuente, 0, opciones as CFDictionary),
              let jpeg = UIImage(cgImage: cg).jpegData(compressionQuality: 0.82), jpeg.count < datos.count else { return nil }
        return jpeg
    }

    // Una vez por arranque, en segundo plano, al guardar la primera.
    private static let recorteInicial: Void = {
        _ = Task.detached(priority: .background) { recortar() }
    }()

    static func recortar(hasta maximo: Int = ImagenesDisco.limite) {
        guard let carpeta else { return }
        let claves: [URLResourceKey] = [.contentModificationDateKey, .fileAllocatedSizeKey]
        guard let archivos = try? FileManager.default.contentsOfDirectory(at: carpeta, includingPropertiesForKeys: claves) else { return }
        var lista = archivos.compactMap { u -> (URL, Date, Int)? in
            guard let v = try? u.resourceValues(forKeys: Set(claves)) else { return nil }
            return (u, v.contentModificationDate ?? .distantPast, v.fileAllocatedSize ?? 0)
        }
        var total = lista.reduce(0) { $0 + $1.2 }
        guard total > maximo else { return }
        lista.sort { $0.1 < $1.1 }
        for (u, _, tamano) in lista where total > maximo * 8 / 10 {
            try? FileManager.default.removeItem(at: u)
            total -= tamano
        }
    }
}
