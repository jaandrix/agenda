import Foundation

// Bandeja del conector en el iPhone: aplicarOpConector y deshacerConector (js/conector.js) para los tipos que el iPhone
// sabe aplicar, con la misma forma de datos y la misma línea en `registroConector`. El resto se queda en el servidor
// para la web, que lo aplica al abrirse.
extension OperacionesExtra {
    static let conector = "conector"
    static let descartarConector = "descartarConector"
    static let tiposConector: Set<String> = ["tarea", "editar_tarea", "evento", "correo", "pedido", "entrada", "nota", "movimiento", "borrar"]
    static let clavesConector = ["registroConector", "entries", "dayPlanner", "pedidos", "notes", "financePro", "studies"]

    static func descartar(_ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        var r = valores
        guard let ref = d["ref"]?.texto else { return r }
        var reg = (valores["registroConector"] ?? nil)?.lista ?? []
        guard !reg.contains(where: { $0["id"]?.comoId == ref }) else { return r }
        reg.insert(.object(["id": .string(ref), "cuando": .string(d["cuando"]?.texto ?? ""), "tipo": d["tipo"] ?? .null,
                            "resumen": .string(d["resumen"]?.texto ?? ""), "deshacer": .null, "origen": .string("descartado")]), at: 0)
        r["registroConector"] = .some(.array(Array(reg.prefix(300))))
        return r
    }

    // Deshacer lo que la web o el iPhone crearon desde la bandeja (más casos que `quitarLoDelConector`).
    static func deshacerMas(_ dh: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?]? {
        var r = valores
        let id = dh["id"]?.comoId ?? ""
        switch (dh["accion"]?.texto ?? "", dh["coleccion"]?.texto ?? "") {
        case ("quitar", "movimiento"):
            guard var fp = (valores["financePro"] ?? nil)?.objeto else { return nil }
            fp["transactions"] = .array((fp["transactions"]?.lista ?? []).filter { $0["id"]?.comoId != id })
            r["financePro"] = .some(.object(fp))
        case ("reinsertar", let col):
            guard let item = dh["item"], item["id"]?.comoId != nil else { return nil }
            let i = dh["i"].flatMap { Int(EscritorJSON.texto($0)) }
            func meter(_ l: inout [JSONValue]) { l.insert(item, at: min(max(0, i ?? l.count), l.count)) }
            if col == "tarea" {
                var p = AplicarOperaciones.planificador(valores["dayPlanner"] ?? nil)
                if let dia = dh["dia"]?.texto {
                    var dias = p["days"]?.objeto ?? [:]
                    var l = dias[dia]?.lista ?? []
                    meter(&l); dias[dia] = .array(l); p["days"] = .object(dias)
                } else {
                    var l = p["backlog"]?.lista ?? []
                    meter(&l); p["backlog"] = .array(l)
                }
                r["dayPlanner"] = .some(.object(p))
            } else if col == "evento" {
                var l = (valores["entries"] ?? nil)?.lista ?? []
                meter(&l); r["entries"] = .some(.array(l))
            } else if col == "movimiento", var fp = (valores["financePro"] ?? nil)?.objeto {
                var l = fp["transactions"]?.lista ?? []
                meter(&l); fp["transactions"] = .array(l); r["financePro"] = .some(.object(fp))
            } else { return nil }
        case ("tarea", _):
            // editar_tarea: la tarea vuelve a como estaba y a su sitio.
            guard let antes = dh["antes"]?.objeto, let item = antes["item"], !id.isEmpty else { return nil }
            var p = AplicarOperaciones.planificador(valores["dayPlanner"] ?? nil)
            var dias = p["days"]?.objeto ?? [:]
            for (k, v) in dias { dias[k] = .array((v.lista ?? []).filter { $0["id"]?.comoId != id }) }
            var b = (p["backlog"]?.lista ?? []).filter { $0["id"]?.comoId != id }
            let i = antes["i"].flatMap { Int(EscritorJSON.texto($0)) }
            if let dia = antes["dia"]?.texto {
                var l = dias[dia]?.lista ?? []
                l.insert(item, at: min(max(0, i ?? l.count), l.count)); dias[dia] = .array(l)
            } else {
                b.insert(item, at: min(max(0, i ?? b.count), b.count))
            }
            p["days"] = .object(dias); p["backlog"] = .array(b)
            r["dayPlanner"] = .some(.object(p))
        case ("nota", _):
            guard let nid = dh["notaId"]?.comoId, var notas = (valores["notes"] ?? nil)?.lista,
                  let n = notas.firstIndex(where: { $0["id"]?.comoId == nid }), var nota = notas[n].objeto else { return nil }
            let antes = dh["antes"]?["content"]?.texto ?? ""
            let despues = dh["despues"]?.texto ?? ""
            let anadido = despues.hasPrefix(antes) ? String(despues.dropFirst(antes.count)) : ""
            let contenido = nota["content"]?.texto ?? ""
            if !anadido.isEmpty, let rango = contenido.range(of: anadido) {
                nota["content"] = .string(contenido.replacingCharacters(in: rango, with: "").trimmingCharacters(in: .whitespacesAndNewlines))
            }
            if let t = dh["titulo"]?.texto, !t.isEmpty, nota["title"]?.texto == t { nota.removeValue(forKey: "title") }
            notas[n] = .object(nota)
            r["notes"] = .some(.array(notas))
        default:
            return nil
        }
        return r
    }

    static func deshacerMasPosible(_ dh: [String: JSONValue]) -> Bool {
        switch (dh["accion"]?.texto ?? "", dh["coleccion"]?.texto ?? "") {
        case ("tarea", _), ("quitar", "movimiento"), ("reinsertar", "tarea"), ("reinsertar", "evento"), ("reinsertar", "movimiento"), ("nota", _): return true
        default: return false
        }
    }

    // `ref` es «ia_» + el id de la fila: si ya está aplicado (aquí o en la web), no hace nada.
    static func aplicarConector(_ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        guard let ref = d["ref"]?.texto, var op = d["op"]?.objeto, let tipo = op["tipo"]?.texto else { return valores }
        var r = valores
        var reg = (valores["registroConector"] ?? nil)?.lista ?? []
        if reg.contains(where: { $0["id"]?.comoId == ref }) { return r }
        let cuando = d["cuando"]?.texto ?? ""
        let hoy = d["hoy"]?.texto ?? ""
        // sinPuntoMedioConector: el punto medio no se usa como separador en Bitácora.
        func t(_ k: String) -> String {
            (op[k]?.texto ?? "").replacingOccurrences(of: " · ", with: ", ").replacingOccurrences(of: "·", with: ",")
        }
        func corto(_ x: String) -> String { let y = x.trimmingCharacters(in: .whitespaces); return y.count > 70 ? String(y.prefix(70)) + "…" : y }
        var tipoLinea = tipo, resumen = "", deshacer: JSONValue = .null
        var planner = AplicarOperaciones.planificador(valores["dayPlanner"] ?? nil)
        var entradas = (valores["entries"] ?? nil)?.lista ?? []
        if tipo == "correo" {
            op = ["tipo": .string("tarea"), "titulo": .string(t("asunto").isEmpty ? "Correo reenviado" : "Correo: " + t("asunto")),
                  "notas": .string([t("de").isEmpty ? "" : "De " + t("de"), t("extracto")].filter { !$0.isEmpty }.joined(separator: "\n"))]
        }
        switch op["tipo"]?.texto ?? "" {
        case "tarea":
            if AplicarOperaciones.buscar(ref, en: planner) != nil { return r }
            let fecha = t("fecha"), hora = t("hora")
            if !fecha.isEmpty && !hora.isEmpty {
                _ = AplicarOperaciones.poner(["id": .string(ref), "time": .string(hora), "title": .string(t("titulo")),
                                              "notes": .string(t("notas")), "done": .bool(false)], en: fecha, de: &planner)
            } else {
                var b = planner["backlog"]?.lista ?? []
                b.insert(.object(["id": .string(ref), "title": .string(t("titulo")), "done": .bool(false),
                                  "notes": .string([fecha.isEmpty ? "" : "para el " + fecha, t("notas")].filter { !$0.isEmpty }.joined(separator: ", "))]), at: 0)
                planner["backlog"] = .array(b)
            }
            r["dayPlanner"] = .some(.object(planner))
            resumen = tipo == "correo" ? "correo «\(corto(t("titulo")))» en tareas pendientes."
                : "tarea «\(corto(t("titulo")))»" + (!fecha.isEmpty && !hora.isEmpty ? " el \(fecha) a las \(hora)." : " en tareas pendientes.")
            deshacer = .object(["accion": .string("quitar"), "coleccion": .string("tarea"), "id": .string(ref)])
        case "editar_tarea":
            // moverTareaConector: con día y hora va a la línea de ese día; sin alguno de los dos, a pendientes sin día.
            let id = t("id")
            guard let sitio = AplicarOperaciones.buscar(id, en: planner), var it = AplicarOperaciones.tareaEn(sitio, planner) else { return valores }
            let antesDia: String?, antesI: Int
            switch sitio { case let .dia(k, n): antesDia = k; antesI = n; case let .pendiente(n): antesDia = nil; antesI = n }
            let antes: JSONValue = .object(["item": .object(it), "dia": antesDia.map(JSONValue.string) ?? .null, "i": .number(String(antesI))])
            let c = op["cambios"]?.objeto ?? [:]
            func ct(_ k: String) -> String? { c[k]?.texto }
            if let x = ct("titulo") { it["title"] = .string(x) }
            if let x = ct("notas") { it["notes"] = .string(x) }
            let sinFecha = c["sinFecha"]?.booleano == true
            if ct("fecha") != nil || ct("hora") != nil || sinFecha {
                switch sitio {
                case let .dia(k, n):
                    var dias = planner["days"]?.objeto ?? [:]
                    var l = dias[k]?.lista ?? []; l.remove(at: n); dias[k] = .array(l); planner["days"] = .object(dias)
                case let .pendiente(n):
                    var l = planner["backlog"]?.lista ?? []; l.remove(at: n); planner["backlog"] = .array(l)
                }
                let dia = sinFecha ? nil : (ct("fecha").flatMap { $0.isEmpty ? nil : $0 } ?? antesDia)
                let hora = sinFecha ? "" : (ct("hora").flatMap { $0.isEmpty ? nil : $0 } ?? it["time"]?.texto ?? "")
                if let dia, !hora.isEmpty {
                    it["time"] = .string(hora)
                    _ = AplicarOperaciones.poner(it, en: dia, de: &planner)
                } else {
                    it.removeValue(forKey: "time")
                    var b = planner["backlog"]?.lista ?? []; b.insert(.object(it), at: 0); planner["backlog"] = .array(b)
                }
            } else {
                AplicarOperaciones.cambiar(sitio, en: &planner) { $0 = it }
            }
            r["dayPlanner"] = .some(.object(planner))
            if let hecha = c["hecha"]?.booleano {
                let ms = Int64(EscritorJSON.texto(d["ahoraMs"] ?? .number("0"))) ?? 0
                r = AplicarOperaciones.aplicar(.marcarTarea(id: id, hecha: hecha, momentoMs: ms), a: r)
            }
            let que = [c["hecha"]?.booleano == true ? "hecha" : c["hecha"]?.booleano == false ? "pendiente otra vez" : "",
                       sinFecha ? "a tareas pendientes" : (ct("fecha") != nil || ct("hora") != nil) ? "al \(ct("fecha") ?? antesDia ?? "mismo día")" + (ct("hora").map { " a las " + $0 } ?? "") : "",
                       ct("titulo") != nil ? "nuevo título" : ""].filter { !$0.isEmpty }.joined(separator: ", ")
            tipoLinea = "cambio"
            resumen = "tarea «\(corto(t("resumen")))»: \(que.isEmpty ? "cambiada" : que)."
            deshacer = .object(["accion": .string("tarea"), "id": .string(id), "antes": antes])
        case "evento":
            if entradas.contains(where: { $0["id"]?.comoId == ref }) { return r }
            entradas.append(.object(["id": .string(ref), "title": .string(t("titulo")), "type": .string("event"), "categoryId": .string("cat_evento"),
                                     "tags": .array([]), "eventType": .string(t("eventType").isEmpty ? "otro" : t("eventType")),
                                     "date": .string(t("fecha")), "time": .string(t("hora")), "place": .string(t("lugar")), "notes": .string(t("notas"))]))
            r["entries"] = .some(.array(entradas))
            resumen = "evento «\(corto(t("titulo")))» el \(t("fecha"))" + (t("hora").isEmpty ? "." : " a las \(t("hora")).")
            deshacer = .object(["accion": .string("quitar"), "coleccion": .string("evento"), "id": .string(ref)])
        case "pedido":
            var pedidos = (valores["pedidos"] ?? nil)?.lista ?? []
            let seg = t("seguimiento").uppercased()
            if pedidos.contains(where: { $0["id"]?.comoId == ref || (!seg.isEmpty && $0["seguimiento"]?.texto == seg) }) { return r }
            pedidos.append(.object([
                "id": .string(ref), "titulo": .string(t("titulo").isEmpty ? "Pedido" : t("titulo")),
                "tienda": .string(t("tienda").isEmpty ? t("transportista") : t("tienda")), "seguimiento": .string(seg), "url": .string(t("url")),
                "fechaPedido": .string(t("fechaPedido").isEmpty ? hoy : t("fechaPedido")), "fechaEstimada": .string(t("fechaEstimada")),
                "estado": .string("pedido"),
                "historial": .array([.object(["fecha": .string(hoy), "estado": .string("pedido"), "nota": .string("Llegó por tu correo")])])]))
            r["pedidos"] = .some(.array(pedidos))
            resumen = "envío «\(corto(t("titulo")))»" + (t("tienda").isEmpty ? "." : " de \(t("tienda")).")
            deshacer = .object(["accion": .string("pedido_quitar"), "id": .string(ref)])
        case "entrada":
            let eid = t("eventoId"), qr = op["qr"]?.texto ?? "", b64 = t("qrB64")
            guard let n = entradas.firstIndex(where: { $0["id"]?.comoId == eid }), var ev = entradas[n].objeto else { return r }
            var l = ev["entradas"]?.lista ?? []
            if l.contains(where: { $0["id"]?.comoId == ref || (!b64.isEmpty && $0["qrB64"]?.texto == b64) || (b64.isEmpty && !qr.isEmpty && $0["qr"]?.texto == qr) }) { return r }
            var x: [String: JSONValue] = ["id": .string(ref), "qr": .string(qr), "etiqueta": .string(t("etiqueta"))]
            if !b64.isEmpty { x["qrB64"] = .string(b64) }
            l.append(.object(x)); ev["entradas"] = .array(l); entradas[n] = .object(ev)
            r["entries"] = .some(.array(entradas))
            resumen = "entrada con QR para «\(corto(ev["title"]?.texto ?? ""))»."
            deshacer = .object(["accion": .string("entrada"), "eventoId": .string(eid), "id": .string(ref)])
        case "nota":
            let fecha = t("fecha").isEmpty ? hoy : t("fecha")
            var notas = (valores["notes"] ?? nil)?.lista ?? []
            if !notas.contains(where: { $0["date"]?.texto == fecha }) {
                notas.append(.object(["id": .string("note_" + ref), "date": .string(fecha), "content": .string(""), "createdAt": .string(cuando)]))
            }
            guard let i = notas.firstIndex(where: { $0["date"]?.texto == fecha }), var nota = notas[i].objeto else { return r }
            var refs = nota["refsConector"]?.lista ?? []
            if refs.contains(where: { $0.texto == ref }) { return r }
            let antes: JSONValue = .object(["content": .string(nota["content"]?.texto ?? ""), "title": nota["title"] ?? .null])
            let titulo = t("titulo").trimmingCharacters(in: .whitespaces)
            let usaTitulo = !titulo.isEmpty && (nota["title"]?.texto ?? "").isEmpty
                && (nota["content"]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            if usaTitulo { nota["title"] = .string(titulo) }
            let texto = [usaTitulo ? "" : titulo, t("texto")].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.joined(separator: "\n")
            nota["content"] = .string([nota["content"]?.texto ?? "", texto].filter { !$0.isEmpty }.joined(separator: "\n\n"))
            refs.append(.string(ref)); nota["refsConector"] = .array(refs)
            notas[i] = .object(nota)
            r["notes"] = .some(.array(notas))
            resumen = "en la nota del \(fecha): «\(corto(titulo.isEmpty ? t("texto") : titulo))»."
            deshacer = .object(["accion": .string("nota"), "notaId": nota["id"] ?? .null, "antes": antes, "despues": nota["content"] ?? .null,
                                "titulo": .string(usaTitulo ? titulo : "")])
        case "movimiento":
            guard var fp = (valores["financePro"] ?? nil)?.objeto else { return r }
            var txs = fp["transactions"]?.lista ?? []
            if txs.contains(where: { $0["id"]?.comoId == ref }) { return r }
            var tx: [String: JSONValue] = ["id": .string(ref), "date": .string(t("fecha")), "account": .string(t("cuenta")),
                                           "type": op["type"] ?? .string("expense"), "amount": op["importe"] ?? .number("0"),
                                           "manual": .bool(true), "needsReview": .bool(t("categoria").isEmpty)]
            if !t("categoria").isEmpty { tx["category"] = .string(t("categoria")) }
            if !t("concepto").isEmpty { tx["note"] = .string(t("concepto")) }
            txs.append(.object(tx)); fp["transactions"] = .array(txs)
            r["financePro"] = .some(.object(fp))
            let importe = op["importe"].map { $0.texto ?? EscritorJSON.texto($0) } ?? ""
            resumen = "\(op["type"]?.texto == "income" ? "ingreso" : "gasto") de \(importe) €, \(corto(t("concepto"))) (\(t("fecha")))."
            deshacer = .object(["accion": .string("quitar"), "coleccion": .string("movimiento"), "id": .string(ref)])
        case "borrar":
            let id = t("id"), col = t("coleccion")
            var item: JSONValue?, dia: String?, i = 0
            if col == "tarea", let sitio = AplicarOperaciones.buscar(id, en: planner) {
                item = AplicarOperaciones.tareaEn(sitio, planner).map(JSONValue.object)
                switch sitio {
                case let .dia(k, n):
                    dia = k; i = n
                    var dias = planner["days"]?.objeto ?? [:]
                    var l = dias[k]?.lista ?? []
                    l.remove(at: n); dias[k] = .array(l); planner["days"] = .object(dias)
                case let .pendiente(n):
                    i = n
                    var l = planner["backlog"]?.lista ?? []
                    l.remove(at: n); planner["backlog"] = .array(l)
                }
                r["dayPlanner"] = .some(.object(planner))
            } else if col == "evento", let n = entradas.firstIndex(where: { $0["id"]?.comoId == id }) {
                item = entradas.remove(at: n); i = n
                r["entries"] = .some(.array(entradas))
            } else if col == "movimiento", var fp = (valores["financePro"] ?? nil)?.objeto, var txs = fp["transactions"]?.lista,
                      let n = txs.firstIndex(where: { $0["id"]?.comoId == id }) {
                item = txs.remove(at: n); i = n
                fp["transactions"] = .array(txs)
                r["financePro"] = .some(.object(fp))
            }
            guard let item else { return valores }
            tipoLinea = "borrado"
            resumen = "borrado: \(corto(t("resumen")))."
            deshacer = .object(["accion": .string("reinsertar"), "coleccion": .string(col), "item": item,
                                "dia": dia.map(JSONValue.string) ?? .null, "i": .number(String(i))])
        default:
            return valores
        }
        reg.insert(.object(["id": .string(ref), "cuando": .string(cuando), "tipo": .string(tipoLinea), "resumen": .string(resumen),
                            "deshacer": deshacer, "origen": .string(d["origen"]?.texto ?? "auto")]), at: 0)
        r["registroConector"] = .some(.array(Array(reg.prefix(300))))
        return r
    }
}
