import Foundation

enum TipoRapido: String, Codable, Sendable {
    case expense, income
}

enum IntencionEntrante: Codable, Sendable, Equatable, Identifiable {
    case apuntar(texto: String, url: String?)
    case rapido(TipoRapido)

    var id: String {
        switch self {
        case .apuntar(let t, let u): return "apuntar:\(t.hashValue):\(u ?? "")"
        case .rapido(let t): return "rapido:\(t.rawValue)"
        }
    }
}

// bitacora:// es de la app actual (la envoltura web). Mientras las dos convivan en el iPhone, esta usa bitacoradev://
// para que iOS no elija al azar; acepta las dos por si se instala sola.
enum EnlaceProfundo {
    static let esquemas: Set<String> = ["bitacora", "bitacoradev"]
    static let maxTexto = 4000
    static let maxURL = 2048

    static func interpretar(_ url: URL) -> IntencionEntrante? {
        guard let esquema = url.scheme?.lowercased(), esquemas.contains(esquema),
              let comp = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let q = Dictionary((comp.queryItems ?? []).map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { a, _ in a })
        switch comp.host?.lowercased() {
        case "apuntar":
            let texto = (q["texto"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            var enlace: String?
            if let u = q["url"], u.count <= maxURL, let parsed = URL(string: u), ["http", "https"].contains(parsed.scheme?.lowercased() ?? "") {
                enlace = u
            }
            guard texto.count <= maxTexto, !texto.isEmpty || enlace != nil else { return nil }
            return .apuntar(texto: texto, url: enlace)
        case "quick":
            guard let t = TipoRapido(rawValue: q["type"] ?? "") else { return nil }
            return .rapido(t)
        default:
            return nil
        }
    }

    // «Abrir en» de un .txt desde otra app: llega como archivo y se apunta como borrador.
    static func desdeArchivo(_ url: URL) -> IntencionEntrante? {
        guard url.isFileURL else { return nil }
        let acceso = url.startAccessingSecurityScopedResource()
        defer { if acceso { url.stopAccessingSecurityScopedResource() } }
        guard let tam = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, tam <= 64 * 1024,
              let d = try? Data(contentsOf: url), let t = String(data: d, encoding: .utf8) else { return nil }
        let texto = String(t.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxTexto))
        return texto.isEmpty ? nil : .apuntar(texto: texto, url: nil)
    }
}

// Lo que llega antes de tener sesión, con la app bloqueada o cargando se guarda aquí y se atiende después.
// En archivo protegido: puede llevar texto del usuario.
struct ColaIntenciones {
    private let url: URL

    init(url: URL? = nil) {
        self.url = url ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("BitacoraNativa/intenciones.json")
    }

    // El atajo de Siri y la app pueden tocar el archivo a la vez: leer y escribir van bajo el mismo cerrojo.
    private static let cerrojo = NSLock()

    func leer() -> [IntencionEntrante] {
        ColaIntenciones.cerrojo.lock(); defer { ColaIntenciones.cerrojo.unlock() }
        return leerSinCerrojo()
    }

    private func leerSinCerrojo() -> [IntencionEntrante] {
        guard let d = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([IntencionEntrante].self, from: d)) ?? []
    }

    func guardar(_ lista: [IntencionEntrante]) {
        ColaIntenciones.cerrojo.lock(); defer { ColaIntenciones.cerrojo.unlock() }
        try? escribir(lista)
    }

    // Añade sin pisar lo que otro haya dejado entretanto; si no se puede escribir, lo dice.
    func anadir(_ i: IntencionEntrante) throws {
        ColaIntenciones.cerrojo.lock(); defer { ColaIntenciones.cerrojo.unlock() }
        try escribir(leerSinCerrojo() + [i])
    }

    private func escribir(_ lista: [IntencionEntrante]) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(Array(lista.suffix(20))).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
