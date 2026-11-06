import Foundation

// La fila `bitacora.data` tal como llega, partida en sus claves de primer nivel. Cada clave guarda sus bytes
// originales: lo que la app nativa no entiende (o no ha tocado) viaja de vuelta sin pasar por ningún modelo.
struct DocumentoBitacora: Sendable, Equatable {
    private(set) var claves: [String]
    private(set) var fragmentos: [String: Data]

    init(datos original: Data) throws {
        // Copia con índices desde 0: los rangos del lector cuentan desde el principio.
        let datos = Data([UInt8](original))
        let partes = try LectorJSON.fragmentosRaiz(datos)
        var claves: [String] = []
        var fragmentos: [String: Data] = [:]
        for (k, rango) in partes {
            // Con claves repetidas, JSON.parse y jsonb se quedan con la última; aquí también.
            if fragmentos[k] == nil { claves.append(k) }
            fragmentos[k] = datos.subdata(in: rango)
        }
        self.claves = claves
        self.fragmentos = fragmentos
    }

    static let vacio = try! DocumentoBitacora(datos: Data("{}".utf8))

    var tamano: Int { fragmentos.values.reduce(0) { $0 + $1.count } }

    func bytes(de clave: String) -> Data? { fragmentos[clave] }

    func valor(de clave: String) throws -> JSONValue? {
        guard let d = fragmentos[clave] else { return nil }
        return try LectorJSON.valor(d)
    }

    var clavesDesconocidas: [String] { claves.filter { !ContratoDatos.conocida($0) } }
    var clavesAusentes: [String] { ContratoDatos.sincronizadas.filter { fragmentos[$0] == nil } }

    func serializado() -> Data {
        var d = Data("{".utf8)
        for (n, k) in claves.enumerated() {
            if n > 0 { d.append(contentsOf: Array(",".utf8)) }
            d.append(contentsOf: Array(EscritorJSON.cadena(k).utf8))
            d.append(contentsOf: Array(":".utf8))
            d.append(fragmentos[k]!)
        }
        d.append(contentsOf: Array("}".utf8))
        return d
    }

    // Solo cambia las claves del parche; las demás conservan sus bytes. Es la forma del `p_patch` que espera
    // `merge_bitacora_data` en el servidor, que también mezcla por claves de primer nivel.
    func aplicandoParche(_ parche: [String: JSONValue]) -> DocumentoBitacora {
        var r = self
        for k in parche.keys.sorted() {
            if r.fragmentos[k] == nil { r.claves.append(k) }
            r.fragmentos[k] = EscritorJSON.datos(parche[k]!)
        }
        return r
    }

    // Comprueba que volver a escribir el documento no cambia nada: cada clave, con los mismos bytes y el mismo valor.
    func conservaTodoAlReescribir() -> Bool {
        guard let otra = try? DocumentoBitacora(datos: serializado()) else { return false }
        guard otra.claves == claves, otra.fragmentos == fragmentos else { return false }
        guard let a = try? LectorJSON.valor(serializado()) else { return false }
        return claves.allSatisfy { k in (try? valor(de: k)) == a[k] }
    }
}
