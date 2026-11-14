import Foundation

// 0.21: más tipos de la bandeja que el iPhone aplica sin esperar a la web: ocio, compra, proyecto, objetivo, estudios y
// deseo. Misma forma de datos que aplicarOpConector (js/conector.js) y la misma línea en `registroConector`, con el
// `deshacer` que entiende deshacerConector de la web. Los ids que la web saca al azar (fases) aquí salen de `ref`, para
// que aplicar dos veces dé lo mismo.
extension OperacionesExtra {
    static let tiposConectorMas: Set<String> = ["ocio", "compra", "proyecto", "objetivo", "estudio_crear", "estudio_editar", "deseo"]
    static let clavesConectorMas = ["listaCompra", "financeProfile"]

    struct LineaConector {
        var r: [String: JSONValue?]
        var tipo: String
        var resumen: String
        var deshacer: JSONValue
    }

    private static func norm(_ t: String) -> String {
        t.lowercased().folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_ES")).trimmingCharacters(in: .whitespaces)
    }
    private static func corto(_ x: String) -> String { let y = x.trimmingCharacters(in: .whitespaces); return y.count > 70 ? String(y.prefix(70)) + "…" : y }
    private static func cifra(_ v: JSONValue?) -> String {
        guard let v else { return "" }
        if let t = v.texto { return t }
        return v == .null ? "" : EscritorJSON.texto(v)
    }

    static func aplicarConectorMas(_ op: [String: JSONValue], ref: String, ahoraMs: Int64, hoy: String, _ valores: [String: JSONValue?]) -> LineaConector? {
        // sinPuntoMedioConector, como en aplicarConector.
        func t(_ k: String) -> String { (op[k]?.texto ?? "").replacingOccurrences(of: " · ", with: ", ").replacingOccurrences(of: "·", with: ",") }
        var r = valores
        switch t("tipo") {
        case "compra":
            var lc = (valores["listaCompra"] ?? nil)?.objeto ?? [:]
            var listas = lc["listas"]?.lista ?? []
            let nombre = t("lista").lowercased()
            guard let n = (nombre.isEmpty ? nil : listas.firstIndex { ($0["nombre"]?.texto ?? "").lowercased() == nombre })
                    ?? listas.firstIndex(where: { $0["id"]?.comoId == lc["actual"]?.comoId }) ?? (listas.isEmpty ? nil : 0),
                  var l = listas[n].objeto else { return nil }
            var items = l["items"]?.lista ?? []
            var ids: [JSONValue] = []
            for (i, c) in (op["cosas"]?.lista ?? []).enumerated() {
                let it = Compra.interpretar(c.texto ?? "")
                guard !it.texto.isEmpty, !items.contains(where: { $0["hecho"]?.booleano != true && ($0["texto"]?.texto ?? "").lowercased() == it.texto.lowercased() }) else { continue }
                let id = "\(ref)_\(i)"
                items.append(.object(["id": .string(id), "texto": .string(it.texto), "cantidad": .string(it.cantidad),
                                      "precio": it.precio.map { .number($0) } ?? .null, "hecho": .bool(false)]))
                ids.append(.string(id))
            }
            guard !ids.isEmpty else { return nil }
            l["items"] = .array(items); listas[n] = .object(l); lc["listas"] = .array(listas)
            r["listaCompra"] = .some(.object(lc))
            return LineaConector(r: r, tipo: "compra", resumen: "\(ids.count) \(ids.count == 1 ? "cosa" : "cosas") a la lista «\(corto(l["nombre"]?.texto ?? ""))».",
                                 deshacer: .object(["accion": .string("compra"), "listaId": l["id"] ?? .null, "ids": .array(ids)]))

        case "deseo":
            var fp = (valores["financeProfile"] ?? nil)?.objeto ?? [:]
            var lista = fp["wishlist"]?.lista ?? []
            if t("accion") == "quitar" {
                guard let i = lista.firstIndex(where: { $0["id"]?.comoId == t("id") }) else { return nil }
                let item = lista.remove(at: i)
                fp["wishlist"] = .array(lista); r["financeProfile"] = .some(.object(fp))
                return LineaConector(r: r, tipo: "deseo", resumen: "quitado de deseos: «\(corto(item["title"]?.texto ?? ""))».",
                                     deshacer: .object(["accion": .string("deseo_reponer"), "item": item, "i": .number(String(i))]))
            }
            guard !lista.contains(where: { $0["id"]?.comoId == ref }) else { return nil }
            let precio = Dinero.decimal(op["precio"]) ?? 0
            lista.append(.object(["id": .string(ref), "title": .string(t("titulo")), "price": .number(NSDecimalNumber(decimal: precio).stringValue)]))
            fp["wishlist"] = .array(lista); r["financeProfile"] = .some(.object(fp))
            return LineaConector(r: r, tipo: "deseo", resumen: "deseo «\(corto(t("titulo")))»" + (precio > 0 ? ", \(Dinero.formato(precio))." : "."),
                                 deshacer: .object(["accion": .string("deseo_quitar"), "id": .string(ref)]))

        case "ocio":
            var entradas = (valores["entries"] ?? nil)?.lista ?? []
            let datos = op["datos"]?.objeto ?? [:]
            let nombres = ["book": "libro", "movie": "película", "series": "serie", "game": "videojuego"]
            let id = t("id")
            if !id.isEmpty {
                guard let n = entradas.firstIndex(where: { $0["id"]?.comoId == id }), var e = entradas[n].objeto else { return nil }
                var antes: [String: JSONValue] = [:]
                for (k, v) in datos { if let viejo = e[k] { antes[k] = viejo }; e[k] = v }
                entradas[n] = .object(e)
                r["entries"] = .some(.array(entradas))
                if e["type"]?.texto == "movie", (Dinero.decimal(datos["rating"]) ?? 0) > 0 {
                    r = ValorarOcio.aplicarCompletar(["entradaId": .string(id)], r)
                }
                let que: [String] = [datos["endDate"] != nil ? "terminado" : "", Dinero.decimal(datos["rating"]).map { $0 > 0 ? "\(cifra(datos["rating"]))/5" : "" } ?? "",
                           datos["status"] != nil && datos["endDate"] == nil ? (datos["status"]?.texto ?? "").lowercased() : ""].filter { !$0.isEmpty }.joined(separator: ", ")
                let nombre = nombres[e["type"]?.texto ?? ""] ?? "ocio"
                return LineaConector(r: r, tipo: "ocio", resumen: "\(nombre) «\(corto(e["title"]?.texto ?? ""))»" + (que.isEmpty ? " actualizado." : ": \(que)."),
                                     deshacer: .object(["accion": .string("restaurar"), "id": .string(id), "antes": .object(antes)]))
            }
            let tipoE = t("entryType")
            guard let cat = CrearApunte.categoriaOcio[tipoE], !entradas.contains(where: { $0["id"]?.comoId == ref }) else { return nil }
            var o: [String: JSONValue] = ["id": .string(ref), "type": .string(tipoE), "categoryId": .string(cat), "tags": .array([]), "date": .string("")]
            datos.forEach { o[$0.key] = $0.value }
            o["title"] = .string(t("titulo"))
            entradas.append(.object(o))
            r["entries"] = .some(.array(entradas))
            return LineaConector(r: r, tipo: "ocio", resumen: "\(nombres[tipoE] ?? "ocio") «\(corto(t("titulo")))» añadido a ocio.",
                                 deshacer: .object(["accion": .string("quitar"), "coleccion": .string("evento"), "id": .string(ref)]))

        case "objetivo":
            var entradas = (valores["entries"] ?? nil)?.lista ?? []
            guard let n = entradas.firstIndex(where: { $0["id"]?.comoId == t("id") && $0["type"]?.texto == "goal" }), var g = entradas[n].objeto else { return nil }
            let titulo = corto(g["title"]?.texto ?? "")
            if t("accion") == "quitar" {
                let item = entradas.remove(at: n)
                r["entries"] = .some(.array(entradas))
                return LineaConector(r: r, tipo: "objetivo", resumen: "objetivo quitado: «\(titulo)».",
                                     deshacer: .object(["accion": .string("reinsertar"), "coleccion": .string("evento"), "item": item, "i": .number(String(n))]))
            }
            let antes: JSONValue = .object(["milestones": g["milestones"]?.lista.map(JSONValue.array) ?? .array([]), "currentValue": g["currentValue"] ?? .null,
                                            "targetValue": g["targetValue"] ?? .null, "goalType": g["goalType"] ?? .null])
            var hitos = g["milestones"]?.lista ?? []
            let buscado = norm(t("hito"))
            let h = hitos.firstIndex { norm($0["text"]?.texto ?? "") == buscado } ?? (buscado.isEmpty ? nil : hitos.firstIndex { norm($0["text"]?.texto ?? "").contains(buscado) })
            let resumen: String
            switch t("accion") {
            case "hitos":
                let nuevos = (op["hitos"]?.lista ?? []).compactMap(\.texto).filter { x in !hitos.contains { norm($0["text"]?.texto ?? "") == norm(x) } }
                guard !nuevos.isEmpty else { return nil }
                hitos += nuevos.map { .object(["text": .string($0), "done": .bool(false)]) }
                resumen = "\(nuevos.count) \(nuevos.count == 1 ? "hito" : "hitos") en «\(titulo)»."
            case "hito_hecho":
                guard let h, var m = hitos[h].objeto else { return nil }
                let hecho = op["hecho"]?.booleano != false
                m["done"] = .bool(hecho); hitos[h] = .object(m)
                resumen = "hito «\(corto(m["text"]?.texto ?? ""))» \(hecho ? "hecho" : "pendiente") (\(titulo))."
            case "hito_quitar":
                guard let h else { return nil }
                let m = hitos.remove(at: h)
                resumen = "hito quitado «\(corto(m["text"]?.texto ?? ""))» (\(titulo))."
            case "progreso":
                guard let actual = op["actual"], actual != .null else { return nil }
                g["goalType"] = .string("numeric"); g["currentValue"] = actual
                if let meta = op["meta"], meta != .null { g["targetValue"] = meta }
                let meta = cifra(g["targetValue"])
                resumen = "«\(titulo)»: \(cifra(actual))\(meta.isEmpty || meta == "0" ? "" : " de " + meta) \(g["unit"]?.texto ?? "")".trimmingCharacters(in: .whitespaces) + "."
            default:
                return nil
            }
            g["milestones"] = .array(hitos)
            entradas[n] = .object(g)
            r["entries"] = .some(.array(entradas))
            return LineaConector(r: r, tipo: "objetivo", resumen: resumen, deshacer: .object(["accion": .string("restaurar"), "id": g["id"] ?? .null, "antes": antes]))

        case "proyecto":
            return proyectoConector(op, ref: ref, hoy: hoy, valores)

        case "estudio_crear", "estudio_editar":
            return estudioConector(op, ref: ref, ahoraMs: ahoraMs, valores)

        default:
            return nil
        }
    }

    private static func proyectoConector(_ op: [String: JSONValue], ref: String, hoy: String, _ valores: [String: JSONValue?]) -> LineaConector? {
        func t(_ k: String) -> String { op[k]?.texto ?? "" }
        var r = valores
        var entradas = (valores["entries"] ?? nil)?.lista ?? []
        var nFase = 0
        func nuevaFase(_ nombre: String, en p: inout [String: JSONValue]) -> String {
            nFase += 1
            let id = "pf_\(ref)_\(nFase)"
            p["fases"] = .array((p["fases"]?.lista ?? []) + [.object(["id": .string(id), "nombre": .string(nombre), "fecha": .string(""), "hecha": .bool(false)])])
            return id
        }
        func cerrar(_ p: [String: JSONValue], _ n: Int?) -> [String: JSONValue?] {
            var p = p
            p["tasks"] = .array((p["tareas"]?.lista ?? []).map { .object(["text": $0["texto"] ?? .string(""), "done": .bool($0["estado"]?.texto == "hecha")]) })
            if let n { entradas[n] = .object(p) } else { entradas.append(.object(p)) }
            var x = r
            x["entries"] = .some(.array(entradas))
            return x
        }
        if t("accion") == "crear" {
            guard !entradas.contains(where: { $0["id"]?.comoId == ref }) else { return nil }
            var p: [String: JSONValue] = ["id": .string(ref), "type": .string("project"), "title": .string(t("titulo")), "tags": .array([]), "date": .string(hoy),
                                          "notes": .string(t("texto")), "status": .string("Pendiente"), "tareas": .array([]), "fases": .array([]), "diario": .array([])]
            if let cat = entradas.first(where: { $0["type"]?.texto == "project" && $0["categoryId"] != nil })?["categoryId"] { p["categoryId"] = cat }
            let faseId = t("fase").isEmpty ? nil : nuevaFase(t("fase"), en: &p)
            let tareas = (op["tareas"]?.lista ?? []).compactMap(\.texto).enumerated().map { i, x -> JSONValue in
                .object(["id": .string("\(ref)_\(i)"), "texto": .string(x), "estado": .string("pendiente"), "faseId": faseId.map(JSONValue.string) ?? .null])
            }
            p["tareas"] = .array(tareas)
            r = cerrar(p, nil)
            return LineaConector(r: r, tipo: "proyecto", resumen: "proyecto nuevo «\(corto(t("titulo")))»" + (tareas.isEmpty ? "." : ", \(tareas.count) tareas."),
                                 deshacer: .object(["accion": .string("quitar"), "coleccion": .string("evento"), "id": .string(ref)]))
        }
        guard let n = entradas.firstIndex(where: { $0["id"]?.comoId == t("proyectoId") && $0["type"]?.texto == "project" }),
              var p = entradas[n].objeto.map(AplicarOperaciones.proyectoNormalizado) else { return nil }
        if p["fases"]?.lista == nil { p["fases"] = .array([]) }
        if p["diario"]?.lista == nil { p["diario"] = .array([]) }
        let titulo = corto(p["title"]?.texto ?? "")
        var tareas = p["tareas"]?.lista ?? []
        func buscar(_ x: String) -> Int? {
            let k = norm(x)
            return tareas.firstIndex { norm($0["texto"]?.texto ?? "") == k } ?? (k.isEmpty ? nil : tareas.firstIndex { norm($0["texto"]?.texto ?? "").contains(k) })
        }
        func faseDe(_ nombre: String, crear: Bool) -> String? {
            let k = norm(nombre), fases = p["fases"]?.lista ?? []
            if let f = fases.first(where: { norm($0["nombre"]?.texto ?? "") == k }) ?? fases.first(where: { !k.isEmpty && norm($0["nombre"]?.texto ?? "").contains(k) }) {
                return f["id"]?.comoId
            }
            return crear ? nuevaFase(nombre, en: &p) : nil
        }
        let resumen: String, deshacer: JSONValue
        switch t("accion") {
        case "tareas":
            let faseId = t("fase").isEmpty ? nil : faseDe(t("fase"), crear: true)
            var ids: [JSONValue] = []
            for (i, x) in (op["tareas"]?.lista ?? []).compactMap(\.texto).enumerated() {
                if let j = buscar(x), norm(tareas[j]["texto"]?.texto ?? "") == norm(x) { continue }
                let id = "\(ref)_\(i)"
                tareas.append(.object(["id": .string(id), "texto": .string(x), "estado": .string("pendiente"), "faseId": faseId.map(JSONValue.string) ?? .null]))
                ids.append(.string(id))
            }
            guard !ids.isEmpty else { return nil }
            resumen = "\(ids.count) \(ids.count == 1 ? "tarea" : "tareas") en «\(titulo)»."
            deshacer = .object(["accion": .string("proyecto_tareas"), "proyectoId": p["id"] ?? .null, "ids": .array(ids)])
        case "siguiente", "completar":
            guard let j = buscar(t("tarea")), var x = tareas[j].objeto else { return nil }
            let antes: JSONValue = .object(["siguienteId": p["siguienteId"] ?? .null, "estado": x["estado"] ?? .null])
            if t("accion") == "siguiente" { p["siguienteId"] = x["id"] } else { x["estado"] = .string("hecha"); tareas[j] = .object(x) }
            resumen = "\(t("accion") == "siguiente" ? "siguiente paso" : "hecha"): «\(corto(x["texto"]?.texto ?? ""))» (\(titulo))."
            deshacer = .object(["accion": .string("proyecto_tarea"), "proyectoId": p["id"] ?? .null, "tareaId": x["id"] ?? .null, "antes": antes])
        case "apunte":
            var diario = p["diario"]?.lista ?? []
            guard !diario.contains(where: { $0["id"]?.comoId == ref }) else { return nil }
            diario.insert(.object(["id": .string(ref), "fecha": .string(hoy), "texto": .string(t("texto"))]), at: 0)
            p["diario"] = .array(diario)
            resumen = "apunte en el diario de «\(titulo)»."
            deshacer = .object(["accion": .string("proyecto_apunte"), "proyectoId": p["id"] ?? .null, "id": .string(ref)])
        case "quitar", "mover", "estado", "fecha", "fase":
            let antes: JSONValue = .object(["tareas": .array(tareas), "fases": p["fases"] ?? .array([]), "siguienteId": p["siguienteId"] ?? .null])
            if t("accion") == "fase" {
                let nuevo = t("nuevo_nombre")
                guard let fid = faseDe(t("fase"), crear: nuevo.isEmpty) else { return nil }
                var fases = p["fases"]?.lista ?? []
                guard let k = fases.firstIndex(where: { $0["id"]?.comoId == fid }), var f = fases[k].objeto else { return nil }
                if !nuevo.isEmpty { f["nombre"] = .string(nuevo) }
                if !t("fecha").isEmpty { f["fecha"] = .string(t("fecha")) }
                fases[k] = .object(f); p["fases"] = .array(fases)
                resumen = nuevo.isEmpty ? "fase «\(corto(f["nombre"]?.texto ?? ""))» en «\(titulo)»." : "fase «\(corto(t("fase")))» → «\(corto(nuevo))» (\(titulo))."
            } else {
                guard let j = buscar(t("tarea")), var x = tareas[j].objeto else { return nil }
                let texto = corto(x["texto"]?.texto ?? "")
                switch t("accion") {
                case "quitar":
                    tareas.remove(at: j)
                    if p["siguienteId"]?.comoId == x["id"]?.comoId { p.removeValue(forKey: "siguienteId") }
                    resumen = "quitada «\(texto)» (\(titulo))."
                case "mover":
                    x["faseId"] = faseDe(t("fase"), crear: true).map(JSONValue.string) ?? .null; tareas[j] = .object(x)
                    resumen = "«\(texto)» a la fase «\(corto(t("fase")))» (\(titulo))."
                case "estado":
                    guard ["pendiente", "curso", "hecha"].contains(t("estado")) else { return nil }
                    x["estado"] = .string(t("estado")); tareas[j] = .object(x)
                    resumen = "«\(texto)»: \(t("estado") == "curso" ? "en curso" : t("estado")) (\(titulo))."
                default:
                    x["fecha"] = .string(t("fecha")); tareas[j] = .object(x)
                    resumen = "«\(texto)»: \(t("fecha").isEmpty ? "sin fecha" : t("fecha")) (\(titulo))."
                }
            }
            deshacer = .object(["accion": .string("proyecto_restaurar"), "proyectoId": p["id"] ?? .null, "antes": antes])
        default:
            return nil
        }
        p["tareas"] = .array(tareas)
        r = cerrar(p, n)
        return LineaConector(r: r, tipo: "proyecto", resumen: resumen, deshacer: deshacer)
    }

    // estudio_crear / estudio_editar: el examen o trabajo y, como syncExamCalendarEvent y syncAssignmentPlannerItem, su
    // evento y su tarea del plan, con las mismas operaciones que usa Estudios en el iPhone.
    private static func estudioConector(_ op: [String: JSONValue], ref: String, ahoraMs: Int64, _ valores: [String: JSONValue?]) -> LineaConector? {
        let aid = op["subjectId"]?.comoId ?? "", lista = op["lista"]?.texto ?? ""
        guard lista == "exams" || lista == "assignments" else { return nil }
        let asignaturas = (valores["studies"] ?? nil)?["subjects"]?.lista ?? []
        guard let asig = asignaturas.first(where: { $0["id"]?.comoId == aid })?.objeto else { return nil }
        let nombre = (asig["name"]?.texto ?? "").lowercased()
        let etiqueta = lista == "exams" ? "examen" : "trabajo"
        func extras(_ id: String, _ campos: [String: JSONValue], _ r: [String: JSONValue?]) -> [String: JSONValue?] {
            guard !campos.isEmpty, var st = (r["studies"] ?? nil)?.objeto, var subs = st["subjects"]?.lista,
                  let i = subs.firstIndex(where: { $0["id"]?.comoId == aid }), var s = subs[i].objeto, var items = s[lista]?.lista,
                  let j = items.firstIndex(where: { $0["id"]?.comoId == id }), var x = items[j].objeto else { return r }
            campos.forEach { x[$0.key] = $0.value }
            items[j] = .object(x); s[lista] = .array(items); subs[i] = .object(s); st["subjects"] = .array(subs)
            var out = r
            out["studies"] = .some(.object(st))
            return out
        }
        if op["tipo"]?.texto == "estudio_crear" {
            let item = op["item"]?.objeto ?? [:]
            guard !(asig[lista]?.lista ?? []).contains(where: { $0["id"]?.comoId == ref }) else { return nil }
            let titulo = item["title"]?.texto ?? "", fecha = item["date"]?.texto ?? "", hora = item["time"]?.texto ?? ""
            var r = AplicarOperaciones.aplicar(.crearEntrega(asignaturaId: aid, lista: lista, id: ref, titulo: titulo, fecha: fecha, hora: hora), a: valores)
            r = extras(ref, item.filter { !["id", "title", "date", "time"].contains($0.key) }, r)
            if lista == "assignments", item["done"]?.booleano == true {
                r = AplicarOperaciones.aplicar(.marcarTrabajo(asignaturaId: aid, id: ref, hecho: true, momentoMs: ahoraMs), a: r)
            }
            return LineaConector(r: r, tipo: "estudios", resumen: "\(etiqueta) «\(corto(titulo))» en \(nombre)" + (fecha.isEmpty ? "" : " el \(fecha)") + (hora.isEmpty ? "." : " a las \(hora)."),
                                 deshacer: .object(["accion": .string("estudio_quitar"), "subjectId": .string(aid), "lista": .string(lista), "id": .string(ref)]))
        }
        let id = op["id"]?.comoId ?? ""
        guard let x = (asig[lista]?.lista ?? []).first(where: { $0["id"]?.comoId == id })?.objeto else { return nil }
        let c = op["cambios"]?.objeto ?? [:]
        var antes: [String: JSONValue] = [:]
        for k in c.keys { if let v = x[k] { antes[k] = v } }
        let titulo = c["title"]?.texto ?? x["title"]?.texto ?? ""
        let fecha = c["date"]?.texto ?? x["date"]?.texto ?? ""
        let hora = c["time"]?.texto ?? x["time"]?.texto ?? ""
        var r = AplicarOperaciones.aplicar(.editarItemEstudio(asignaturaId: aid, lista: lista, id: id, titulo: titulo, fecha: fecha, hora: hora,
                                                              nota: cifra(c["grade"] ?? x["grade"]), peso: cifra(c["weight"] ?? x["weight"])), a: valores)
        r = extras(id, c.filter { !["id", "title", "date", "time", "grade", "weight", "done"].contains($0.key) }, r)
        if lista == "assignments", let hecho = c["done"]?.booleano {
            r = AplicarOperaciones.aplicar(.marcarTrabajo(asignaturaId: aid, id: id, hecho: hecho, momentoMs: ahoraMs), a: r)
        }
        let que: [String] = [c["grade"] != nil ? "nota \(cifra(c["grade"]))" : "", c["done"]?.booleano == true ? "entregado" : c["done"]?.booleano == false ? "pendiente" : "",
                   c["date"] != nil ? "fecha \(fecha)" : "", c["time"] != nil ? "hora \(hora)" : "", c["weight"] != nil ? "peso \(cifra(c["weight"])) %" : "",
                   c["title"] != nil ? "nuevo título" : ""].filter { !$0.isEmpty }.joined(separator: ", ")
        let resumen = op["resumen"]?.texto ?? titulo
        return LineaConector(r: r, tipo: "estudios", resumen: "«\(corto(resumen))»: \(que.isEmpty ? "cambiado" : que).",
                             deshacer: .object(["accion": .string("estudio_restaurar"), "subjectId": .string(aid), "lista": .string(lista), "id": .string(id), "antes": .object(antes)]))
    }
}
