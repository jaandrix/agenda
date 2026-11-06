import Foundation

// Traducción literal de fusionarTresBandas (js/datos.js). nil equivale a undefined y .null a null, porque la web
// los distingue. Falta PREPARAR_FUSION (arrastrar el planificador a hoy en los tres lados): hay que portarlo antes
// de que la app nativa escriba en dayPlanner.
enum Fusion {
    static func tresBandas(base: JSONValue?, local: JSONValue?, nube: JSONValue?) -> JSONValue? {
        if local == base { return nube }
        if nube == base || local == nube { return local }
        if case .object(let l) = local, case .object(let n) = nube {
            let b = base?.objeto ?? [:]
            var r: [String: JSONValue] = [:]
            for k in Set(l.keys).union(n.keys) {
                if let v = tresBandas(base: b[k], local: l[k], nube: n[k]) { r[k] = v }
            }
            return .object(r)
        }
        if case .array(let l) = local, case .array(let n) = nube, !(l.isEmpty && n.isEmpty), idsUnicos(l), idsUnicos(n) {
            let B = mapa(base?.lista ?? []), L = mapa(l), N = mapa(n)
            var r: [JSONValue] = []
            var vistos = Set<String>()
            for x in l + n {
                guard let id = x["id"]?.comoId, !vistos.contains(id) else { continue }
                vistos.insert(id)
                let bx = B[id], lx = L[id], nx = N[id]
                if lx != nil, nx != nil {
                    if let v = tresBandas(base: bx, local: lx, nube: nx) { r.append(v) }
                    continue
                }
                // Solo está en un lado: o es nuevo, o el otro lo borró; el borrado gana salvo que este lado lo cambiara.
                let unico = lx ?? nx
                if let bx, unico == bx { continue }
                if let unico { r.append(unico) }
            }
            return .array(r)
        }
        return local
    }

    private static func idsUnicos(_ a: [JSONValue]) -> Bool {
        var ids = Set<String>()
        for x in a {
            guard case .object(let o) = x, let id = o["id"], id != .null, let s = id.comoId else { return false }
            ids.insert(s)
        }
        return ids.count == a.count
    }

    private static func mapa(_ a: [JSONValue]) -> [String: JSONValue] {
        var m: [String: JSONValue] = [:]
        for x in a {
            if case .object(let o) = x, let id = o["id"]?.comoId { m[id] = x }
        }
        return m
    }
}
