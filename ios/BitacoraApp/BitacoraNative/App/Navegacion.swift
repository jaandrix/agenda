import Foundation

// Tocar una pestaña de la barra. En «menú.», un segundo toque vacía la pila y vuelve a la raíz (y la sube arriba).
enum Navegacion {
    struct Resultado: Equatable { var pestana: Pestana; var ruta: [String]; var subir: Bool }

    static func tocar(_ p: Pestana, actual: Pestana, ruta: [String]) -> Resultado {
        guard p == actual else { return Resultado(pestana: p, ruta: ruta, subir: false) }
        if p == .mas { return Resultado(pestana: p, ruta: [], subir: ruta.isEmpty) }
        return Resultado(pestana: p, ruta: ruta, subir: true)
    }
}

// Aperturas de cada apartado en este iPhone, por cuenta (nunca se sincronizan ni guardan textos del usuario).
// score = log2(1 + aperturas en 30 días) × 3 + aperturas en 7 días × 2 + bonus de recencia.
struct UsoApartados: Codable, Equatable, Sendable {
    var aperturas: [String: [Double]] = [:]   // vista → instantes (segundos desde 1970), los de los últimos 30 días

    mutating func anotar(_ vista: String, ahora: Date = Date()) {
        let t = ahora.timeIntervalSince1970
        var l = (aperturas[vista] ?? []).filter { t - $0 < 30 * 86400 }
        l.append(t)
        aperturas[vista] = Array(l.suffix(200))
    }

    func puntos(_ vista: String, ahora: Date = Date()) -> Double {
        let t = ahora.timeIntervalSince1970
        let l = (aperturas[vista] ?? []).filter { t - $0 < 30 * 86400 }
        guard let ultima = l.max() else { return 0 }
        let siete = l.filter { t - $0 < 7 * 86400 }.count
        let horas = (t - ultima) / 3600
        let bonus = horas < 24 ? 3.0 : horas < 72 ? 1.5 : horas < 168 ? 0.5 : 0
        return log2(1 + Double(l.count)) * 3 + Double(siete) * 2 + bonus
    }

    // Los cinco: por puntos, a igualdad por el orden del menú; si faltan, se completan con el orden del menú.
    func ranking(candidatos: [String], excluir: Set<String>, ahora: Date = Date(), cuantos: Int = 5) -> [String] {
        let lista = candidatos.filter { !excluir.contains($0) }
        let orden = Dictionary(uniqueKeysWithValues: lista.enumerated().map { ($0.element, $0.offset) })
        let usados = lista.filter { puntos($0, ahora: ahora) > 0 }
            .sorted { (puntos($0, ahora: ahora), -orden[$0]!) > (puntos($1, ahora: ahora), -orden[$1]!) }
        return Array((usados + lista.filter { !usados.contains($0) }).prefix(cuantos))
    }

    static func cargar(_ uid: String) -> UsoApartados {
        UserDefaults.standard.data(forKey: "bitacora.uso.\(uid)").flatMap { try? JSONDecoder().decode(UsoApartados.self, from: $0) } ?? UsoApartados()
    }
    func guardar(_ uid: String) {
        if let d = try? JSONEncoder().encode(self) { UserDefaults.standard.set(d, forKey: "bitacora.uso.\(uid)") }
    }
}
