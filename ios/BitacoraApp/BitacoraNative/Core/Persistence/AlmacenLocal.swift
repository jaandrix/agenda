import Foundation

struct EstadoAlmacen: Codable, Sendable, Equatable {
    var version = 1
    var actualizadoNube: String?
    var ultimaSincronizacion: Date?
    var ultimoError: String?
    var pendientes: [OperacionPendiente] = []
    var confirmadasRecientes: [UUID] = []
}

// El equivalente de la copia en IndexedDB de la web: por usuario, en archivos con protección de datos. `base.json` es
// la última fila confirmada por la nube, byte a byte; `estado.json`, la cola y el diagnóstico.
actor AlmacenLocal {
    private let raiz: URL
    private let fm = FileManager.default
    // Copia en memoria de base.json y estado.json (0.18, rendimiento): cada pantalla pedía el documento y se leía y
    // descodificaba del disco cada vez. Toda escritura pasa por aquí, así que la memoria nunca va por detrás del disco.
    private var memoriaBase: [String: Data] = [:]
    private var memoriaEstado: [String: EstadoAlmacen] = [:]
    private(set) var version = 0

    init(raiz: URL? = nil) {
        if let raiz {
            self.raiz = raiz
        } else {
            let soporte = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            self.raiz = soporte.appendingPathComponent("BitacoraNativa", isDirectory: true)
        }
    }

    private func carpeta(_ uid: String) throws -> URL {
        // El uid viene de Supabase, pero se limpia igual para que nunca forme una ruta fuera de la carpeta.
        let limpio = uid.filter { $0.isLetter || $0.isNumber || $0 == "-" }
        guard !limpio.isEmpty else { throw CocoaError(.fileWriteInvalidFileName) }
        let u = raiz.appendingPathComponent(limpio, isDirectory: true)
        if !fm.fileExists(atPath: u.path) {
            try fm.createDirectory(at: u, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
            var valores = URLResourceValues()
            valores.isExcludedFromBackup = true
            var copia = u
            try? copia.setResourceValues(valores)
        }
        return u
    }

    private func escribir(_ d: Data, en url: URL) throws {
        try d.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func guardarBase(_ datos: Data, uid: String) throws {
        version += 1
        memoriaBase[uid] = nil
        try escribir(datos, en: carpeta(uid).appendingPathComponent("base.json"))
        memoriaBase[uid] = datos
    }

    func leerBase(uid: String) -> Data? {
        if let d = memoriaBase[uid] { return d }
        guard let u = try? carpeta(uid).appendingPathComponent("base.json"), let d = try? Data(contentsOf: u) else { return nil }
        memoriaBase[uid] = d
        return d
    }

    // Si estado.json existe pero no se entiende, se lanza error en vez de empezar de cero: dentro puede haber cambios
    // sin subir, y escribir encima los borraría.
    func estado(uid: String) throws -> EstadoAlmacen {
        if let e = memoriaEstado[uid] { return e }
        let u = try carpeta(uid).appendingPathComponent("estado.json")
        guard fm.fileExists(atPath: u.path) else { return EstadoAlmacen() }
        let e = try AlmacenLocal.decodificador.decode(EstadoAlmacen.self, from: Data(contentsOf: u))
        memoriaEstado[uid] = e
        return e
    }

    func actualizarEstado(uid: String, _ cambio: (inout EstadoAlmacen) -> Void) throws {
        var e = try estado(uid: uid)
        cambio(&e)
        version += 1
        memoriaEstado[uid] = nil
        try escribir(AlmacenLocal.codificador.encode(e), en: carpeta(uid).appendingPathComponent("estado.json"))
        memoriaEstado[uid] = e
    }

    func borrarUsuario(_ uid: String) {
        version += 1
        memoriaBase[uid] = nil
        memoriaEstado[uid] = nil
        guard let u = try? carpeta(uid) else { return }
        try? fm.removeItem(at: u)
    }

    private static let codificador: JSONEncoder = { let e = JSONEncoder(); e.dateEncodingStrategy = .iso8601; return e }()
    private static let decodificador: JSONDecoder = { let d = JSONDecoder(); d.dateDecodingStrategy = .iso8601; return d }()
}

// Identificador del dispositivo para firmar operaciones: aleatorio, no sensible y estable mientras la app esté instalada.
enum Dispositivo {
    static var id: String {
        let k = "bitacora.dispositivo"
        if let v = UserDefaults.standard.string(forKey: k) { return v }
        let v = UUID().uuidString
        UserDefaults.standard.set(v, forKey: k)
        return v
    }
}
