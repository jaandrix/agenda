import Foundation

// 0.23 (auditoría): las exportaciones y los documentos bajados van cada uno a su carpeta temporal con nombre aleatorio y
// protección completa; se borran al cerrar la hoja o Quick Look, al cerrar sesión y al arrancar (restos de un cierre).
enum ArchivosTemporales {
    static var raiz: URL { FileManager.default.temporaryDirectory.appendingPathComponent("bitacora-tmp", isDirectory: true) }

    // Una carpeta nueva para un archivo; `nombre` llega de fuera y solo se usa su último componente.
    static func destino(_ nombre: String) throws -> URL {
        let dir = raiz.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
        var limpio = (nombre as NSString).lastPathComponent.replacingOccurrences(of: "/", with: "_")
        if limpio.isEmpty || limpio == "." || limpio == ".." { limpio = "archivo" }
        return dir.appendingPathComponent(limpio)
    }

    static func escribir(_ datos: Data, como nombre: String) throws -> URL {
        let u = try destino(nombre)
        try datos.write(to: u, options: [.atomic, .completeFileProtection])
        return u
    }

    // Borra el archivo y su carpeta (solo si está dentro de la raíz).
    static func borrar(_ url: URL?) {
        guard let url, url.standardizedFileURL.path.hasPrefix(raiz.standardizedFileURL.path) else { return }
        try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
    }

    static func limpiarTodo() { try? FileManager.default.removeItem(at: raiz) }
}
