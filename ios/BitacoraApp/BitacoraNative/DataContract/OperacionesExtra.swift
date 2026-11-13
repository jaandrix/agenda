import Foundation

// Operaciones de la 0.18. Van por `OperacionBitacora.extra(tipo:json:)` para que cada corte nuevo no tenga que tocar el
// enum común (otra sesión trabaja a la vez en Finanzas). Mismas reglas que las demás: idempotentes, por bloque y sin
// tocar lo que no conocen.
enum OperacionesExtra {
    static let entradaQR = "entradaQR"
    static let quitarEntradaQR = "quitarEntradaQR"
    static let recordatorio = "recordatorio"
    static let subtarea = "subtarea"
    static let marcarSubtarea = "marcarSubtarea"
    static let quitarSubtarea = "quitarSubtarea"
    static let quitarConector = "quitarConector"

    static func op(_ tipo: String, _ datos: [String: JSONValue]) -> OperacionBitacora {
        .extra(tipo: tipo, json: EscritorJSON.texto(.object(datos)))
    }

    static func claves(_ tipo: String) -> [String] {
        switch tipo {
        case entradaQR, quitarEntradaQR: return ["entries"]
        case quitarConector, conector, descartarConector: return clavesConector
        case CambioFinanzas.tipo: return CambioFinanzas.claves
        case ValorarOcio.tipo: return ValorarOcio.claves
        default: return ["dayPlanner"]
        }
    }

    static func aplicar(_ tipo: String, _ json: String, _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        guard let d = (try? LectorJSON.valor(Data(json.utf8)))?.objeto else { return valores }
        var r = valores
        switch tipo {
        case entradaQR:
            // Como la op `entrada` del conector (js/conector.js): no repite el mismo QR ni el mismo id.
            guard let eid = d["eventoId"]?.texto, let id = d["id"]?.texto else { break }
            let qr = d["qr"]?.texto ?? "", b64 = d["qrB64"]?.texto ?? ""
            guard !qr.isEmpty || !b64.isEmpty else { break }
            r["entries"] = .some(cambiarEntrada(eid, valores["entries"] ?? nil) { e in
                var lista = e["entradas"]?.lista ?? []
                if lista.contains(where: { $0["id"]?.texto == id || (!b64.isEmpty && $0["qrB64"]?.texto == b64) || (b64.isEmpty && !qr.isEmpty && $0["qr"]?.texto == qr) }) { return }
                var x: [String: JSONValue] = ["id": .string(id), "qr": .string(qr), "etiqueta": .string(d["etiqueta"]?.texto ?? "")]
                if !b64.isEmpty { x["qrB64"] = .string(b64) }
                lista.append(.object(x))
                e["entradas"] = .array(lista)
            })
        case quitarEntradaQR:
            guard let eid = d["eventoId"]?.texto, let id = d["id"]?.texto else { break }
            r["entries"] = .some(cambiarEntrada(eid, valores["entries"] ?? nil) { e in
                var lista = e["entradas"]?.lista ?? []
                lista.removeAll { $0["id"]?.texto == id }
                if lista.isEmpty { e.removeValue(forKey: "entradas") } else { e["entradas"] = .array(lista) }
            })
        case recordatorio:
            // `recordatorio` en la tarea: {"tipo":"hora"} (a la hora de la tarea) o {"tipo":"fecha","cuando":"AAAA-MM-DDTHH:MM"}.
            // La web no lo usa todavía; Object.assign al editar lo conserva.
            guard let id = d["id"]?.texto else { break }
            r["dayPlanner"] = .some(cambiarTarea(id, valores["dayPlanner"] ?? nil) { t in
                if let v = d["valor"], v != .null { t["recordatorio"] = v } else { t.removeValue(forKey: "recordatorio") }
            })
        case subtarea, marcarSubtarea, quitarSubtarea:
            // addPlannerSubtask / togglePlannerSubtaskDone (js/planificador.js): `subtasks` con {id, text, done}.
            guard let id = d["id"]?.texto, let sid = d["subId"]?.texto else { break }
            r["dayPlanner"] = .some(cambiarTarea(id, valores["dayPlanner"] ?? nil) { t in
                var subs = t["subtasks"]?.lista ?? []
                let n = subs.firstIndex { $0["id"]?.comoId == sid }
                switch tipo {
                case subtarea:
                    let texto = (d["texto"]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                    guard n == nil, !texto.isEmpty else { return }
                    subs.append(.object(["id": .string(sid), "text": .string(texto), "done": .bool(false)]))
                case marcarSubtarea:
                    guard let n, var s = subs[n].objeto else { return }
                    s["done"] = .bool(d["hecha"]?.booleano ?? false)
                    subs[n] = .object(s)
                default:
                    guard let n else { return }
                    subs.remove(at: n)
                }
                t["subtasks"] = .array(subs)
            })
        case quitarConector:
            r = quitarLoDelConector(d, r)
        case conector:
            r = aplicarConector(d, r)
        case descartarConector:
            r = descartar(d, r)
        case CambioFinanzas.tipo:
            r = CambioFinanzas.aplicar(d, r)
        case ValorarOcio.tipo:
            r = ValorarOcio.aplicar(d, r)
        case ValorarOcio.completar:
            r = ValorarOcio.aplicarCompletar(d, r)
        default:
            break
        }
        return r
    }

    static func cambiarEntrada(_ id: String, _ valor: JSONValue?, _ f: (inout [String: JSONValue]) -> Void) -> JSONValue? {
        guard var lista = valor?.lista, let n = lista.firstIndex(where: { $0["id"]?.comoId == id }), var e = lista[n].objeto else { return valor }
        f(&e)
        lista[n] = .object(e)
        return .array(lista)
    }

    static func cambiarTarea(_ id: String, _ valor: JSONValue?, _ f: (inout [String: JSONValue]) -> Void) -> JSONValue? {
        var p = AplicarOperaciones.planificador(valor)
        guard let sitio = AplicarOperaciones.buscar(id, en: p) else { return valor }
        AplicarOperaciones.cambiar(sitio, en: &p, f)
        return .object(p)
    }

    // deshacerConector (js/conector.js) para lo que crean las ops automáticas más comunes: una tarea, un evento, una
    // entrada con QR o un envío. Marca la línea con `deshecho`, como la web; lo demás se deshace en la web.
    static func quitarLoDelConector(_ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        var r = valores
        guard let ref = d["ref"]?.texto, var reg = (valores["registroConector"] ?? nil)?.lista,
              let n = reg.firstIndex(where: { $0["id"]?.comoId == ref }), var l = reg[n].objeto, l["deshecho"]?.booleano != true,
              let dh = l["deshacer"]?.objeto else { return r }
        let id = dh["id"]?.comoId ?? ""
        switch (dh["accion"]?.texto ?? "", dh["coleccion"]?.texto ?? "") {
        case ("quitar", "tarea"):
            var p = AplicarOperaciones.planificador(valores["dayPlanner"] ?? nil)
            var dias = p["days"]?.objeto ?? [:]
            for (k, v) in dias { dias[k] = .array((v.lista ?? []).filter { $0["id"]?.comoId != id }) }
            p["days"] = .object(dias)
            p["backlog"] = .array((p["backlog"]?.lista ?? []).filter { $0["id"]?.comoId != id })
            r["dayPlanner"] = .some(.object(p))
        case ("quitar", "evento"):
            r["entries"] = .some(.array(((valores["entries"] ?? nil)?.lista ?? []).filter { $0["id"]?.comoId != id }))
        case ("entrada", _):
            guard let eid = dh["eventoId"]?.comoId else { return r }
            r["entries"] = .some(cambiarEntrada(eid, valores["entries"] ?? nil) { e in
                e["entradas"] = .array((e["entradas"]?.lista ?? []).filter { $0["id"]?.comoId != id })
            })
        case ("pedido_quitar", _):
            r["pedidos"] = .some(.array(((valores["pedidos"] ?? nil)?.lista ?? []).filter { $0["id"]?.comoId != id }))
        default:
            guard let otro = deshacerMas(dh, valores) else { return r }
            r = otro
        }
        l["deshecho"] = .bool(true)
        reg[n] = .object(l)
        r["registroConector"] = .some(.array(reg))
        return r
    }

    static func sePuedeDeshacer(_ l: [String: JSONValue]) -> Bool {
        guard l["deshecho"]?.booleano != true, let dh = l["deshacer"]?.objeto else { return false }
        switch (dh["accion"]?.texto ?? "", dh["coleccion"]?.texto ?? "") {
        case ("quitar", "tarea"), ("quitar", "evento"), ("entrada", _), ("pedido_quitar", _): return true
        default: return deshacerMasPosible(dh)
        }
    }
}
