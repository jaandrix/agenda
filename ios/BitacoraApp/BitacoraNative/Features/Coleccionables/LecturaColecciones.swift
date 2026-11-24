import Foundation

// Coleccionables (js/bajo-demanda/coleccionables.js): `collectibles` = [{ id, name, category, value, createdAt, carta?,
// mercadoId? }] y `collectibleCategories` = [{ id, name }]. Sin categorías, la web enseña Cartas y Videojuegos y las guarda
// al primer cambio. Las piezas no tienen foto ni marca de «la tengo»: todo lo apuntado es lo que tienes.

struct Coleccionable: Sendable, Identifiable, Equatable {
    let id, nombre, categoria, creado: String
    let valor: Decimal
    let set, numero, anio, estado: String
}

struct CategoriaColeccion: Sendable, Identifiable, Equatable { let id, nombre: String }

enum LecturaColecciones {
    static let porDefecto = [CategoriaColeccion(id: "cat_cartas", nombre: "Cartas"), CategoriaColeccion(id: "cat_videojuegos", nombre: "Videojuegos")]
    static let estadosCarta = ["Sellado", "Mint", "Near Mint", "Excellent", "Good", "Light Played", "Played", "Poor"]
    static let estadoCorto = ["Sellado": "sellado", "Mint": "M", "Near Mint": "NM", "Excellent": "EX", "Good": "GD", "Light Played": "LP", "Played": "PL", "Poor": "PO"]

    static func leer(_ doc: DocumentoBitacora) -> ([Coleccionable], [CategoriaColeccion]) {
        let piezas = (((try? doc.valor(de: "collectibles")) ?? nil)?.lista ?? []).compactMap { x -> Coleccionable? in
            guard let o = x.objeto, let id = o["id"]?.comoId else { return nil }
            let carta = o["carta"]?.objeto ?? [:]
            return Coleccionable(id: id, nombre: o["name"]?.texto ?? "", categoria: o["category"]?.comoId ?? "",
                                 creado: o["createdAt"]?.texto ?? id, valor: max(0, Dinero.decimal(o["value"]) ?? 0),
                                 set: carta["set"]?.texto ?? "", numero: carta["numero"]?.comoId ?? "",
                                 anio: carta["anio"]?.comoId ?? "", estado: carta["estado"]?.texto ?? "")
        }
        let cats = (((try? doc.valor(de: "collectibleCategories")) ?? nil)?.lista ?? []).compactMap { x -> CategoriaColeccion? in
            guard let o = x.objeto, let id = o["id"]?.comoId else { return nil }
            return CategoriaColeccion(id: id, nombre: o["name"]?.texto ?? "")
        }
        return (piezas, cats.isEmpty ? porDefecto : cats)
    }

    // esCategoriaCartas: por el id por defecto o por el nombre («Carta», «cartas»).
    static func esCartas(_ id: String, _ nombre: String) -> Bool {
        id == "cat_cartas" || nombre.trimmingCharacters(in: .whitespaces).range(of: "^cartas?$", options: [.regularExpression, .caseInsensitive]) != nil
    }

    // collCoincide: nombre, set, número y año, sin tildes ni mayúsculas.
    static func coincide(_ p: Coleccionable, _ q: String) -> Bool {
        let n = { (t: String) in t.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES")) }
        let b = n(q.trimmingCharacters(in: .whitespaces))
        return b.isEmpty || n([p.nombre, p.set, p.numero, p.anio].filter { !$0.isEmpty }.joined(separator: " ")).contains(b)
    }

    enum Orden: Hashable { case valor, nombre, recientes }

    static func ordenar(_ l: [Coleccionable], _ o: Orden) -> [Coleccionable] {
        let nombre = { (a: Coleccionable, b: Coleccionable) in a.nombre.localizedCompare(b.nombre) == .orderedAscending }
        switch o {
        case .nombre: return l.sorted(by: nombre)
        case .recientes: return l.sorted { $0.creado > $1.creado }
        case .valor: return l.sorted { $0.valor != $1.valor ? $0.valor > $1.valor : nombre($0, $1) }
        }
    }

    static func nuevoId(_ prefijo: String) -> String {
        let letras = "abcdefghijklmnopqrstuvwxyz0123456789"
        return prefijo + "_\(Int64(Date().timeIntervalSince1970 * 1000))_" + String((0..<5).map { _ in letras.randomElement()! })
    }
}

// Operaciones nuevas (por OperacionesExtra): guardar una pieza (saveNewCollectible / saveEditCollectible), quitarla
// (deleteCollectible) y guardar una categoría (saveNewCollectibleCategory). Idempotentes y sin tocar campos ajenos
// (mercadoId, lo que añada la web después).
enum ColeccionesOp {
    static let tipoGuardar = "coleccionable"
    static let tipoQuitar = "quitarColeccionable"
    static let tipoCategoria = "categoriaColeccionable"
    static let claves = ["collectibles", "collectibleCategories"]

    static func guardar(id: String, nombre: String, categoria: String, valor: String, creado: String,
                        set: String = "", numero: String = "", anio: String = "", estado: String = "") -> OperacionBitacora {
        OperacionesExtra.op(tipoGuardar, ["id": .string(id), "nombre": .string(nombre), "categoria": .string(categoria), "valor": .string(valor),
                                      "creado": .string(creado),
                                      "carta": .object(["set": .string(set), "numero": .string(numero), "anio": .string(anio), "estado": .string(estado)])])
    }
    static func quitar(id: String) -> OperacionBitacora { OperacionesExtra.op(tipoQuitar, ["id": .string(id)]) }
    static func categoria(id: String, nombre: String) -> OperacionBitacora {
        OperacionesExtra.op(tipoCategoria, ["id": .string(id), "nombre": .string(nombre)])
    }

    static func aplicar(_ tipo: String, _ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        var r = valores
        let catsOriginal = (valores["collectibleCategories"] ?? nil)?.lista ?? []
        var cats = catsOriginal.isEmpty
            ? LecturaColecciones.porDefecto.map { JSONValue.object(["id": .string($0.id), "name": .string($0.nombre)]) }
            : catsOriginal
        var lista = (valores["collectibles"] ?? nil)?.lista ?? []
        switch tipo {
        case tipoGuardar:
            guard let id = d["id"]?.texto, let cat = d["categoria"]?.texto, !cat.isEmpty,
                  let catObj = cats.first(where: { $0["id"]?.comoId == cat }) else { return valores }
            let nombre = String((d["nombre"]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
            guard !nombre.isEmpty else { return valores }
            let valor = max(0, Dinero.decimal(texto: d["valor"]?.texto ?? "") ?? 0)
            let cartas = LecturaColecciones.esCartas(cat, catObj["name"]?.texto ?? "")
            let carta = cartaDe(d["carta"]?.objeto ?? [:])
            if let n = lista.firstIndex(where: { $0["id"]?.comoId == id }) {
                guard var o = lista[n].objeto else { return valores }
                o["name"] = .string(nombre); o["category"] = .string(cat)
                if Dinero.decimal(o["value"]) != valor { o["value"] = .number("\(valor)") }
                // aplicarCartaFields: fuera de Cartas, los datos de carta se conservan escondidos.
                if cartas { if let carta { o["carta"] = carta } else { o.removeValue(forKey: "carta") } }
                lista[n] = .object(o)
            } else {
                var o: [String: JSONValue] = ["id": .string(id), "name": .string(nombre), "category": .string(cat), "value": .number("\(valor)"),
                                              "createdAt": .string(d["creado"]?.texto ?? "")]
                if cartas, let carta { o["carta"] = carta }
                lista.append(.object(o))
            }
        case tipoQuitar:
            guard let id = d["id"]?.texto else { return valores }
            let antes = lista.count
            lista.removeAll { $0["id"]?.comoId == id }
            guard antes != lista.count else { return valores }
        case tipoCategoria:
            guard let id = d["id"]?.texto else { return valores }
            let nombre = String((d["nombre"]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(80))
            guard !nombre.isEmpty else { return valores }
            if let n = cats.firstIndex(where: { $0["id"]?.comoId == id }), var o = cats[n].objeto {
                o["name"] = .string(nombre); cats[n] = .object(o)
            } else {
                // Como saveNewCollectibleCategory: no dos con el mismo nombre.
                guard !cats.contains(where: { ($0["name"]?.texto ?? "").lowercased() == nombre.lowercased() }) else { return valores }
                cats.append(.object(["id": .string(id), "name": .string(nombre)]))
            }
        default:
            return valores
        }
        r["collectibles"] = .some(.array(lista))
        if cats != catsOriginal { r["collectibleCategories"] = .some(.array(cats)) }
        return r
    }

    // leerCartaFields: solo lo que tiene valor; el año, número.
    private static func cartaDe(_ c: [String: JSONValue]) -> JSONValue? {
        var o: [String: JSONValue] = [:]
        for k in ["set", "numero", "estado"] {
            let v = (c[k]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !v.isEmpty { o[k] = .string(String(v.prefix(120))) }
        }
        if let a = Int((c["anio"]?.texto ?? "").trimmingCharacters(in: .whitespaces)), a > 0 { o["anio"] = .number(String(a)) }
        return o.isEmpty ? nil : .object(o)
    }
}
