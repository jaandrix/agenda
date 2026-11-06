import Foundation

// Una operación local que espera a subir. En la fase 1 la cola existe (y se guarda) pero nadie la llena: la app es
// de solo lectura hasta demostrar que ninguna clave se pierde.
struct OperacionPendiente: Codable, Sendable, Equatable, Identifiable {
    let id: UUID
    let dispositivo: String
    let creada: Date
    let versionContrato: Int
    let tipo: String
    let carga: Data
}

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
        try escribir(datos, en: carpeta(uid).appendingPathComponent("base.json"))
    }

    func leerBase(uid: String) -> Data? {
        guard let u = try? carpeta(uid).appendingPathComponent("base.json") else { return nil }
        return try? Data(contentsOf: u)
    }

    func estado(uid: String) -> EstadoAlmacen {
        guard let u = try? carpeta(uid).appendingPathComponent("estado.json"),
              let d = try? Data(contentsOf: u),
              let e = try? AlmacenLocal.decodificador.decode(EstadoAlmacen.self, from: d) else { return EstadoAlmacen() }
        return e
    }

    func actualizarEstado(uid: String, _ cambio: (inout EstadoAlmacen) -> Void) throws {
        var e = estado(uid: uid)
        cambio(&e)
        try escribir(AlmacenLocal.codificador.encode(e), en: carpeta(uid).appendingPathComponent("estado.json"))
    }

    func borrarUsuario(_ uid: String) {
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
