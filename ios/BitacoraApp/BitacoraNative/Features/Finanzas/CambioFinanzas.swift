import Foundation

// Escrituras de Finanzas hechas con el código de la web (MotorFinanzas): lo que cambió al importar un extracto, al
// preparar Finanzas (cargos de suscripciones, programados...) o al dar de baja una suscripción viaja como una sola
// operación `extra(tipo: "finanzas")`, como commitFinanceChange en la web: o entra entera o no entra.
//
// Se aplica sobre lo último de la nube, no sobre la copia de la que salió, y por eso solo toca lo que cambió:
//   movimientos: anadir (si el id no está), cambiar (campo a campo) y quitar, por id;
//   entradas: lo mismo sobre `entries`;
//   pro y perfil: claves de primer nivel de financePro y financeProfile (null la quita).
// Un movimiento añadido lleva `clave` y `vez` (ClaveImportacion): si otro dispositivo ya importó esa misma fila, la
// nube la tiene más veces de las que había y no se vuelve a añadir. Aplicarla dos veces da lo mismo que una.
enum CambioFinanzas {
    static let tipo = "finanzas"
    static let claves = ["financePro", "financeProfile", "entries"]

    // De la respuesta del motor (`{resultado, cambios}`) a la operación, con `vez` contada sobre el documento de partida.
    static func operacion(_ cambios: JSONValue, sobre doc: DocumentoBitacora?) -> OperacionBitacora? {
        guard var c = cambios.objeto else { return nil }
        if var mov = c["movimientos"]?.objeto, let anadir = mov["anadir"]?.lista, !anadir.isEmpty {
            var cuenta: [String: Int] = [:]
            let antes = ((try? doc?.valor(de: "financePro")) ?? nil)?["transactions"]?.lista ?? []
            for t in antes { for k in ClaveImportacion.claves(t) { cuenta[k, default: 0] += 1 } }
            mov["anadir"] = .array(anadir.map { x in
                guard let t = x["t"] else { return x }
                var o: [String: JSONValue] = ["t": t]
                if let k = ClaveImportacion.claves(t).first {
                    o["clave"] = .string(k)
                    o["vez"] = .number(String(cuenta[k, default: 0]))
                    cuenta[k, default: 0] += 1
                }
                return .object(o)
            })
            c["movimientos"] = .object(mov)
        }
        return .extra(tipo: tipo, json: EscritorJSON.texto(.object(c)))
    }

    static func aplicar(_ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        var r = valores
        let mov = d["movimientos"]?.objeto ?? [:]
        let pro = d["pro"]?.objeto ?? [:]
        if !(mov["anadir"]?.lista ?? []).isEmpty || !(mov["cambiar"]?.lista ?? []).isEmpty || !(mov["quitar"]?.lista ?? []).isEmpty || !pro.isEmpty {
            var p = (valores["financePro"] ?? nil)?.objeto ?? [:]
            var lista = p["transactions"]?.lista ?? []
            lista = cambiarLista(lista, mov, conClave: true)
            p["transactions"] = .array(lista)
            for (k, v) in pro where k != "transactions" { if v == .null { p.removeValue(forKey: k) } else { p[k] = v } }
            r["financePro"] = .some(.object(p))
        }
        if let perfil = d["perfil"]?.objeto, !perfil.isEmpty {
            var p = (valores["financeProfile"] ?? nil)?.objeto ?? [:]
            for (k, v) in perfil { if v == .null { p.removeValue(forKey: k) } else { p[k] = v } }
            r["financeProfile"] = .some(.object(p))
        }
        if let ent = d["entradas"]?.objeto, !(ent["anadir"]?.lista ?? []).isEmpty || !(ent["cambiar"]?.lista ?? []).isEmpty || !(ent["quitar"]?.lista ?? []).isEmpty {
            let lista = (valores["entries"] ?? nil)?.lista ?? []
            r["entries"] = .some(.array(cambiarLista(lista, ent, conClave: false)))
        }
        return r
    }

    private static func cambiarLista(_ entrada: [JSONValue], _ c: [String: JSONValue], conClave: Bool) -> [JSONValue] {
        var lista = entrada
        let quitar = Set((c["quitar"]?.lista ?? []).compactMap { $0.comoId ?? $0.texto })
        if !quitar.isEmpty { lista.removeAll { quitar.contains($0["id"]?.comoId ?? "") } }
        for x in c["cambiar"]?.lista ?? [] {
            guard let id = x["id"]?.comoId ?? x["id"]?.texto, let n = lista.firstIndex(where: { $0["id"]?.comoId == id }), var o = lista[n].objeto else { continue }
            for (k, v) in x["poner"]?.objeto ?? [:] { o[k] = v }
            for k in x["quitar"]?.lista ?? [] { if let k = k.texto { o.removeValue(forKey: k) } }
            lista[n] = .object(o)
        }
        var ids = Set(lista.compactMap { $0["id"]?.comoId })
        var veces: [String: Int]?
        for x in c["anadir"]?.lista ?? [] {
            let t = conClave ? (x["t"] ?? x) : x
            guard let id = t["id"]?.comoId, !ids.contains(id) else { continue }
            if conClave, let k = x["clave"]?.texto, let vez = x["vez"].flatMap({ Dinero.decimal($0) }) {
                if veces == nil {
                    var v: [String: Int] = [:]
                    for t in lista { for k in ClaveImportacion.claves(t) { v[k, default: 0] += 1 } }
                    veces = v
                }
                if Decimal(veces![k, default: 0]) > vez { continue }
                veces![k, default: 0] += 1
            }
            lista.append(t)
            ids.insert(id)
        }
        return lista
    }
}
