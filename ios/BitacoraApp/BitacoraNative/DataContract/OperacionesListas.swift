import Foundation

// Listas de Panorama (js/listas.js): `listasPanorama` = [{ id, titulo, color?, ocultarHechas?, tareas: [{ id, texto, hecha,
// hechaEn?, plegada?, hijos: [...] }] }], hasta cuatro niveles. Todo lleva id: la fusión a tres bandas de la web combina
// caja a caja y tarea a tarea, y aquí cada cambio es una operación que se vuelve a aplicar sobre lo último de la nube, así
// que el iPhone nunca reescribe una caja o una tarea que no ha tocado.
//
// `aplicar` es listasAplicarOp (js/listas.js y supabase/functions/bitacora-mcp) con las mismas acciones y la misma
// forma: crear_lista, lista, borrar_lista, quitar_hechas, anadir, editar, borrar y mover. Además, las que la web hace a
// mano y el iPhone necesita como operación: mover_lista (ordenar cajas), plegar_todo, restaurar_lista y reponer_tareas
// (deshacer). Mover comprueba aquí también el límite de niveles (en la web lo comprueba quien llama).
enum ListasOp {
    static let tipo = "listas"
    static let aHoy = "listaAHoy"
    static let niveles = 4
    static let colores: [(String, UInt32)] = [("rosa", 0xF4A7B9), ("melocotón", 0xF7C19A), ("amarillo", 0xF3DC6B), ("menta", 0x9FDCBC),
                                             ("cielo", 0xA3C9EF), ("lavanda", 0xC7B3EE), ("salvia", 0xBFD29D), ("arena", 0xE2CBA6)]

    static func claves(_ t: String) -> [String] { t == aHoy ? ["dayPlanner"] : ["listasPanorama"] }

    static func op(_ datos: [String: JSONValue]) -> OperacionBitacora { OperacionesExtra.op(tipo, datos) }

    // listaNuevoId: prefijo, la hora en base 36 y cinco letras.
    static func nuevoId(_ prefijo: String, ahora: Date = Date()) -> String {
        let letras = "abcdefghijklmnopqrstuvwxyz0123456789"
        return prefijo + "_" + String(Int64(ahora.timeIntervalSince1970 * 1000), radix: 36) + String((0..<5).map { _ in letras.randomElement()! })
    }

    // new Date().toISOString(): con milésimas y en UTC.
    static func iso(_ ms: Int64) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: Date(timeIntervalSince1970: Double(ms) / 1000))
    }
    static var ahoraISO: String { iso(Int64(Date().timeIntervalSince1970 * 1000)) }

    static func nodo(_ id: String, _ texto: String) -> JSONValue {
        .object(["id": .string(id), "texto": .string(texto), "hecha": .bool(false), "hijos": .array([])])
    }

    // MARK: árbol

    static func hijos(_ n: JSONValue) -> [JSONValue] { n["hijos"]?.lista ?? [] }
    static func todas(_ arr: [JSONValue]) -> [JSONValue] { arr.flatMap { [$0] + todas(hijos($0)) } }
    static func altura(_ n: JSONValue) -> Int { 1 + (hijos(n).map(altura).max() ?? 0) }

    // Camino de índices hasta la tarea (el último es su sitio entre sus hermanas).
    static func ruta(_ id: String, _ arr: [JSONValue]) -> [Int]? {
        for (i, n) in arr.enumerated() {
            if n["id"]?.comoId == id { return [i] }
            if let r = ruta(id, hijos(n)) { return [i] + r }
        }
        return nil
    }

    static func nodo(_ arr: [JSONValue], _ r: [Int]) -> JSONValue? {
        guard let i = r.first, arr.indices.contains(i) else { return nil }
        return r.count == 1 ? arr[i] : nodo(hijos(arr[i]), Array(r.dropFirst()))
    }

    // Cambia la lista de hermanas que cuelga de `padre` (vacío = la raíz de la caja).
    static func hermanas(_ arr: inout [JSONValue], _ padre: [Int], _ f: (inout [JSONValue]) -> Void) {
        guard let i = padre.first else { f(&arr); return }
        guard arr.indices.contains(i), var o = arr[i].objeto else { return }
        var h = o["hijos"]?.lista ?? []
        hermanas(&h, Array(padre.dropFirst()), f)
        o["hijos"] = .array(h)
        arr[i] = .object(o)
    }

    static func cambiarNodo(_ arr: inout [JSONValue], _ r: [Int], _ f: (inout [String: JSONValue]) -> Void) {
        guard let ultimo = r.last else { return }
        hermanas(&arr, Array(r.dropLast())) { h in
            guard h.indices.contains(ultimo), var o = h[ultimo].objeto else { return }
            f(&o)
            h[ultimo] = .object(o)
        }
    }

    static func marcar(_ o: inout [String: JSONValue], _ hecha: Bool, _ cuando: String) {
        if hecha {
            if o["hecha"]?.booleano != true { o["hecha"] = .bool(true); o["hechaEn"] = .string(cuando) }
        } else {
            o["hecha"] = .bool(false); o.removeValue(forKey: "hechaEn")
        }
    }

    // Marca la tarea y, con `conSubtareas`, todo lo que cuelga de ella.
    static func marcarRama(_ n: JSONValue, _ hecha: Bool, _ cuando: String, conSubtareas: Bool) -> JSONValue {
        guard var o = n.objeto else { return n }
        marcar(&o, hecha, cuando)
        if conSubtareas, let h = o["hijos"]?.lista { o["hijos"] = .array(h.map { marcarRama($0, hecha, cuando, conSubtareas: true) }) }
        return .object(o)
    }

    // MARK: aplicar

    static func aplicar(_ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        var r = valores
        var listas = (valores["listasPanorama"] ?? nil)?.lista ?? []
        if aplicar(d, &listas) { r["listasPanorama"] = .some(.array(listas)) }
        return r
    }

    // false si no había nada que hacer (como listasAplicarOp).
    static func aplicar(_ op: [String: JSONValue], _ listas: inout [JSONValue]) -> Bool {
        let accion = op["accion"]?.texto ?? ""
        let cuando = op["cuando"]?.texto ?? ahoraISO
        let antes = listas
        let ids = Set(antes.flatMap { todas($0["tareas"]?.lista ?? []).compactMap { $0["id"]?.comoId } })
        func existe(_ id: String) -> Bool { ids.contains(id) }
        func indiceCaja(_ id: String?) -> Int? {
            guard let id else { return nil }
            return antes.firstIndex { $0["id"]?.comoId == id }
        }

        switch accion {
        case "crear_lista":
            guard let id = op["id"]?.comoId, indiceCaja(id) == nil else { return false }
            var c: [String: JSONValue] = ["id": .string(id), "titulo": .string(op["titulo"]?.texto ?? "")]
            if let color = op["color"]?.texto, !color.isEmpty { c["color"] = .string(color) }
            c["tareas"] = .array((op["tareas"]?.lista ?? []).filter { !existe($0["id"]?.comoId ?? "") })
            listas.append(.object(c))
            return true
        case "restaurar_lista":
            guard let c = op["caja"], let id = c["id"]?.comoId, indiceCaja(id) == nil else { return false }
            let i = op["indice"].flatMap { Dinero.decimal($0) }.map { NSDecimalNumber(decimal: $0).intValue } ?? listas.count
            listas.insert(c, at: max(0, min(i, listas.count)))
            return true
        default: break
        }

        guard let ci = indiceCaja(op["lista"]?.comoId), var caja = listas[ci].objeto else { return false }
        var tareas = caja["tareas"]?.lista ?? []
        var hecho = true

        switch accion {
        case "lista":
            if let t = op["titulo"]?.texto { caja["titulo"] = .string(t) }
            if let v = op["color"] { if let t = v.texto, !t.isEmpty { caja["color"] = .string(t) } else { caja.removeValue(forKey: "color") } }
            if let v = op["ocultarHechas"] { if v.booleano == true { caja["ocultarHechas"] = .bool(true) } else { caja.removeValue(forKey: "ocultarHechas") } }
        case "borrar_lista":
            listas.remove(at: ci)
            return true
        case "mover_lista":
            let i = op["indice"].flatMap { Dinero.decimal($0) }.map { NSDecimalNumber(decimal: $0).intValue } ?? ci
            let c = listas.remove(at: ci)
            listas.insert(c, at: max(0, min(i, listas.count)))
            return true
        case "quitar_hechas":
            func filtrar(_ a: [JSONValue]) -> [JSONValue] {
                a.filter { $0["hecha"]?.booleano != true }.map { n in
                    guard var o = n.objeto, let h = o["hijos"]?.lista else { return n }
                    o["hijos"] = .array(filtrar(h))
                    return .object(o)
                }
            }
            tareas = filtrar(tareas)
        case "reponer_tareas":
            tareas = op["tareas"]?.lista ?? tareas
        case "plegar_todo":
            let plegar = op["plegada"]?.booleano == true
            func recorrer(_ a: [JSONValue]) -> [JSONValue] {
                a.map { n in
                    guard var o = n.objeto else { return n }
                    let h = o["hijos"]?.lista ?? []
                    if plegar && !h.isEmpty { o["plegada"] = .bool(true) } else { o.removeValue(forKey: "plegada") }
                    if !h.isEmpty { o["hijos"] = .array(recorrer(h)) }
                    return .object(o)
                }
            }
            tareas = recorrer(tareas)
        case "anadir":
            let nodos = (op["tareas"]?.lista ?? []).filter { !existe($0["id"]?.comoId ?? "") }
            guard !nodos.isEmpty, insertar(&tareas, padre: op["padre"]?.comoId, indice: op["indice"], nodos) else { return false }
        case "editar", "borrar", "mover":
            guard let id = op["id"]?.comoId, let r = ruta(id, tareas) else { return false }
            if accion == "editar" {
                cambiarNodo(&tareas, r) { o in
                    if let t = op["texto"]?.texto { o["texto"] = .string(t) }
                    if let h = op["hecha"]?.booleano {
                        let n = marcarRama(.object(o), h, cuando, conSubtareas: op["conSubtareas"]?.booleano == true)
                        o = n.objeto ?? o
                    }
                    if let p = op["plegada"] { if p.booleano == true { o["plegada"] = .bool(true) } else { o.removeValue(forKey: "plegada") } }
                }
            } else if accion == "borrar" {
                hermanas(&tareas, Array(r.dropLast())) { _ = $0.remove(at: r.last!) }
            } else {
                guard let n = nodo(tareas, r) else { return false }
                let padre = op["padre"]?.comoId
                if let padre, padre == id || todas(hijos(n)).contains(where: { $0["id"]?.comoId == padre }) { return false }
                let destino = op["aLista"]?.comoId ?? op["lista"]?.comoId
                guard let di = indiceCaja(destino) else { return false }
                var sinEl = tareas
                hermanas(&sinEl, Array(r.dropLast())) { _ = $0.remove(at: r.last!) }
                if di == ci {
                    guard cabe(n, padre, sinEl), insertar(&sinEl, padre: padre, indice: op["indice"], [n]) else { return false }
                    tareas = sinEl
                } else {
                    var otra = listas[di].objeto ?? [:]
                    var suyas = otra["tareas"]?.lista ?? []
                    guard cabe(n, padre, suyas), insertar(&suyas, padre: padre, indice: op["indice"], [n]) else { return false }
                    otra["tareas"] = .array(suyas)
                    listas[di] = .object(otra)
                    tareas = sinEl
                }
            }
        default:
            hecho = false
        }
        guard hecho else { return false }
        caja["tareas"] = .array(tareas)
        listas[ci] = .object(caja)
        return true
    }

    // listasNormalizar: en el orden en que se recorre el árbol (cada tarea y luego sus hijas), un id ya visto se quita.
    static func normalizar(_ arr: [JSONValue], _ vistos: inout Set<String>) -> [JSONValue] {
        var r: [JSONValue] = []
        for n in arr {
            guard var o = n.objeto, let id = o["id"]?.comoId, !vistos.contains(id) else { continue }
            vistos.insert(id)
            if let h = o["hijos"]?.lista { o["hijos"] = .array(normalizar(h, &vistos)) }
            r.append(.object(o))
        }
        return r
    }

    // Que la rama quepa en los cuatro niveles colgada de `padre`.
    static func cabe(_ n: JSONValue, _ padre: String?, _ arr: [JSONValue]) -> Bool {
        guard let padre else { return altura(n) <= niveles }
        guard let r = ruta(padre, arr) else { return false }
        return r.count + altura(n) <= niveles
    }

    static func insertar(_ arr: inout [JSONValue], padre: String?, indice: JSONValue?, _ nodos: [JSONValue]) -> Bool {
        var camino: [Int] = []
        if let padre {
            guard let r = ruta(padre, arr) else { return false }
            camino = r
            cambiarNodo(&arr, r) { o in o.removeValue(forKey: "plegada"); if o["hijos"]?.lista == nil { o["hijos"] = .array([]) } }
        }
        let i = indice.flatMap { Dinero.decimal($0) }.map { NSDecimalNumber(decimal: $0).intValue }
        hermanas(&arr, camino) { h in h.insert(contentsOf: nodos, at: i.map { max(0, min($0, h.count)) } ?? h.count) }
        return true
    }

    // «→ hoy» (listaAHoy): la tarea del día con listaId y listaTareaId. Si ese día ya la tiene, no se repite.
    static func aplicarAHoy(_ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        var r = valores
        guard let lid = d["lista"]?.comoId, let tid = d["id"]?.comoId, let pid = d["idTarea"]?.comoId, let dia = d["dia"]?.texto else { return r }
        var p = AplicarOperaciones.planificador(valores["dayPlanner"] ?? nil)
        guard AplicarOperaciones.buscar(pid, en: p) == nil,
              !(p["days"]?[dia]?.lista ?? []).contains(where: { $0["listaTareaId"]?.comoId == tid }) else { return r }
        _ = AplicarOperaciones.poner(["id": .string(pid), "time": .string(""), "title": .string(d["titulo"]?.texto ?? "tarea"), "notes": .string(""),
                                      "done": .bool(false), "listaId": .string(lid), "listaTareaId": .string(tid)], en: dia, de: &p)
        r["dayPlanner"] = .some(.object(p))
        return r
    }

    // listaTareaDesdePlanner: marcar en el plan marca la tarea de la lista (sola, sin sus subtareas).
    static func desdePlan(_ valor: JSONValue?, lista: String, id: String, hecha: Bool, cuando: String) -> JSONValue? {
        var listas = valor?.lista ?? []
        guard let ci = listas.firstIndex(where: { $0["id"]?.comoId == lista }), var caja = listas[ci].objeto else { return nil }
        var tareas = caja["tareas"]?.lista ?? []
        guard let r = ruta(id, tareas), let n = nodo(tareas, r), (n["hecha"]?.booleano == true) != hecha else { return nil }
        cambiarNodo(&tareas, r) { marcar(&$0, hecha, cuando) }
        caja["tareas"] = .array(tareas)
        listas[ci] = .object(caja)
        return .array(listas)
    }
}

// MARK: lectura

struct FilaLista: Sendable, Identifiable, Equatable {
    let id: String
    let texto: String
    let hecha: Bool
    let nivel: Int
    let plegada: Bool
    let hijas: Int
    let hijasHechas: Int
    // Lo que cuelga de ella, a cualquier profundidad, sin hacer: si hay, marcarla pregunta.
    let pendientesDebajo: Int
    // Los ids de todo lo que cuelga de ella (marcar con sus subtareas también las marca en el plan).
    let debajo: [String]
    let padreId: String?
    let indice: Int
    let hermanas: Int
    let previaId: String?
    let abueloId: String?
    let indicePadre: Int?
    let altura: Int
}

struct CajaLista: Sendable, Identifiable, Equatable {
    let id: String
    let titulo: String
    let color: String?
    let ocultarHechas: Bool
    let filas: [FilaLista]
    let total: Int
    let hechas: Int
    let hayHijas: Bool
}

struct VistaListas: Sendable, Equatable {
    var cajas: [CajaLista] = []
    // listaTareaId → (id de la tarea del día, hecha) en el plan de hoy (día lógico).
    var enHoy: [String: EnHoy] = [:]
    var hoy = ""
    struct EnHoy: Sendable, Equatable { let tarea: String; let hecha: Bool }

    var pendientes: Int { cajas.reduce(0) { $0 + $1.total - $1.hechas } }

    static func desde(_ doc: DocumentoBitacora, ahora: Date = Date()) -> VistaListas {
        var v = VistaListas()
        v.hoy = CalendarioBitacora.madrid.diaLogico(ahora).iso
        for t in ((try? doc.valor(de: "dayPlanner")) ?? nil)?["days"]?[v.hoy]?.lista ?? [] {
            if let lt = t["listaTareaId"]?.comoId, let id = t["id"]?.comoId { v.enHoy[lt] = EnHoy(tarea: id, hecha: t["done"]?.booleano == true) }
        }
        // listasNormalizar: un id repetido (una tarea movida en un dispositivo y editada en otro) se queda en su primer sitio.
        var vistos = Set<String>()
        for c in ((try? doc.valor(de: "listasPanorama")) ?? nil)?.lista ?? [] {
            guard let o = c.objeto, let id = o["id"]?.comoId, !vistos.contains("caja:" + id) else { continue }
            vistos.insert("caja:" + id)
            let ocultar = o["ocultarHechas"]?.booleano == true
            var filas: [FilaLista] = []
            var total = 0, hechas = 0, hayHijas = false
            func recorrer(_ validas: [JSONValue], nivel: Int, padre: String?, abuelo: String?, indicePadre: Int?, oculta: Bool) {
                for (i, n) in validas.enumerated() {
                    let nid = n["id"]!.comoId!
                    let h = ListasOp.hijos(n)
                    let hecha = n["hecha"]?.booleano == true
                    total += 1
                    if hecha { hechas += 1 }
                    if !h.isEmpty { hayHijas = true }
                    let plegada = n["plegada"]?.booleano == true && !h.isEmpty
                    let esconder = oculta || (ocultar && hecha)
                    if !esconder {
                        filas.append(FilaLista(id: nid, texto: n["texto"]?.texto ?? "", hecha: hecha, nivel: nivel, plegada: plegada,
                                               hijas: h.count, hijasHechas: h.filter { $0["hecha"]?.booleano == true }.count,
                                               pendientesDebajo: ListasOp.todas(h).filter { $0["hecha"]?.booleano != true }.count,
                                               debajo: ListasOp.todas(h).compactMap { $0["id"]?.comoId },
                                               padreId: padre, indice: i, hermanas: validas.count,
                                               previaId: i > 0 ? validas[i - 1]["id"]?.comoId : nil, abueloId: abuelo, indicePadre: indicePadre,
                                               altura: ListasOp.altura(n)))
                    }
                    recorrer(h, nivel: nivel + 1, padre: nid, abuelo: padre, indicePadre: i, oculta: esconder || plegada)
                }
            }
            recorrer(ListasOp.normalizar(o["tareas"]?.lista ?? [], &vistos), nivel: 0, padre: nil, abuelo: nil, indicePadre: nil, oculta: false)
            v.cajas.append(CajaLista(id: id, titulo: o["titulo"]?.texto ?? "", color: o["color"]?.texto, ocultarHechas: ocultar,
                                     filas: filas, total: total, hechas: hechas, hayHijas: hayHijas))
        }
        return v
    }
}
