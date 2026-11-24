import Foundation

// Lo que Etiquetas y Conexiones leen de cada entrada de `entries` (las dos vistas solo enseñan y abren su apartado).
struct EntradaSuelta: Sendable, Identifiable, Equatable {
    let id, tipo, titulo, fecha, fin, notas, lugar, companeros, tipoEvento, asignaturaId: String
    let etiquetas: [String]
    let registro: Bool        // isCalendarLogEntry: marcas de «Completado», no cosas del usuario

    static func leer(_ doc: DocumentoBitacora) -> [EntradaSuelta] {
        (((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []).compactMap { x -> EntradaSuelta? in
            guard let o = x.objeto, let id = o["id"]?.comoId else { return nil }
            let t = { (k: String) in o[k]?.texto ?? "" }
            let fecha = t("date").isEmpty ? t("startDate") : t("date")
            let registro = o["calendarLog"]?.booleano == true
                || ["weekly_task_done_", "planner_done_", "recurring_done_"].contains { id.hasPrefix($0) }
            return EntradaSuelta(id: id, tipo: t("type"), titulo: t("title"), fecha: fecha, fin: t("endDate"), notas: t("notes"),
                                 lugar: t("place"), companeros: t("companions"), tipoEvento: t("eventType"),
                                 asignaturaId: o["linkedSubjectId"]?.comoId ?? "",
                                 etiquetas: (o["tags"]?.lista ?? []).compactMap { $0.texto ?? $0.comoId }.filter { !$0.isEmpty },
                                 registro: registro)
        }
    }
}

// TYPE_LABELS / TIPO_PLURAL de la web, el icono del catálogo y el apartado que abre cada tipo.
enum TipoEntrada {
    static func singular(_ t: String) -> String {
        ["book": "libro", "movie": "película", "series": "serie", "game": "videojuego", "travel": "viaje", "work": "empleo",
         "project": "proyecto", "event": "evento", "place": "lugar", "document": "documento", "goal": "objetivo",
         "birthday": "cumpleaños", "subscription": "suscripción", "fixed_expense": "gasto fijo"][t] ?? t
    }
    static func plural(_ t: String) -> String {
        ["book": "libros", "movie": "películas", "series": "series", "game": "videojuegos", "travel": "viajes", "work": "empleos",
         "project": "proyectos", "event": "eventos", "place": "lugares", "document": "documentos", "goal": "objetivos",
         "birthday": "cumpleaños", "subscription": "suscripciones", "fixed_expense": "gastos fijos"][t] ?? t
    }
    static func vista(_ t: String) -> String {
        switch t {
        case "book", "movie", "series", "game": return "culture"
        case "travel", "place": return "travels"
        case "work": return "work"
        case "project": return "projects"
        case "document": return "documents"
        case "goal": return "goals"
        case "subscription", "fixed_expense": return "finances"
        case "event": return "events"
        default: return "calendar"
        }
    }
    static func icono(_ t: String) -> String {
        switch t {
        case "book", "movie", "series", "game": return "ocio"
        case "travel", "place": return "viaje"
        case "work": return "empleo"
        case "project": return "proyectos"
        case "document": return "documentos"
        case "goal": return "objetivos"
        case "subscription", "fixed_expense": return "suscripcion"
        default: return "evento"
        }
    }

    // desgloseTipos: «3 libros, 1 viaje», los tipos más numerosos primero.
    static func desglose(_ l: [EntradaSuelta]) -> String {
        var n: [String: Int] = [:]
        var orden: [String] = []
        for e in l { if n[e.tipo] == nil { orden.append(e.tipo) }; n[e.tipo, default: 0] += 1 }
        return orden.enumerated().sorted { (n[$0.element]!, -$0.offset) > (n[$1.element]!, -$1.offset) }
            .map { "\(n[$0.element]!) \(n[$0.element]! == 1 ? singular($0.element) : plural($0.element))" }
            .joined(separator: ", ")
    }
}

// Una etiqueta raíz con sus hijas («viaje/japón» cuelga de «viaje»), como buildTagTree y entriesForTagPrefix.
struct GrupoEtiqueta: Sendable, Identifiable, Equatable {
    let ruta, nombre: String
    let hijas: [String]          // rutas completas de las hijas directas
    let entradas: [EntradaSuelta]
    var id: String { ruta }
}

enum LecturaEtiquetas {
    static func partes(_ t: String) -> [String] { t.split(separator: "/").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }

    static func conPrefijo(_ ruta: String, _ entradas: [EntradaSuelta]) -> [EntradaSuelta] {
        entradas.filter { e in e.etiquetas.contains { $0 == ruta || $0.hasPrefix(ruta + "/") } }
    }

    static func grupos(_ entradas: [EntradaSuelta], busqueda: String = "") -> [GrupoEtiqueta] {
        let n = { (t: String) in t.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES")) }
        let q = n(busqueda.trimmingCharacters(in: .whitespaces))
        var todas: [String] = []
        for e in entradas { for t in e.etiquetas where !todas.contains(t) && (q.isEmpty || n(t).contains(q)) { todas.append(t) } }
        var raices: [String] = []
        var hijas: [String: [String]] = [:]
        for t in todas {
            let p = partes(t)
            guard let r = p.first else { continue }
            if !raices.contains(r) { raices.append(r) }
            if p.count > 1 {
                let h = r + "/" + p[1]
                if !(hijas[r] ?? []).contains(h) { hijas[r, default: []].append(h) }
            }
        }
        return raices.map { r in
            GrupoEtiqueta(ruta: r, nombre: r, hijas: (hijas[r] ?? []).sorted { $0.localizedCompare($1) == .orderedAscending },
                          entradas: conPrefijo(r, entradas))
        }
        .sorted { $0.entradas.count != $1.entradas.count ? $0.entradas.count > $1.entradas.count : $0.nombre.localizedCompare($1.nombre) == .orderedAscending }
    }
}

// renameTag, deleteTagEverywhere y quitarEtiquetaDeEntrada (js/ajustes.js): solo cambian `tags`, idempotentes.
enum EtiquetasOp {
    static let tipo = "etiqueta"

    static func renombrar(_ de: String, a: String) -> OperacionBitacora {
        OperacionesExtra.op(tipo, ["accion": .string("renombrar"), "de": .string(de), "a": .string(a)])
    }
    static func eliminar(_ de: String) -> OperacionBitacora { OperacionesExtra.op(tipo, ["accion": .string("eliminar"), "de": .string(de)]) }
    static func quitar(_ de: String, de entrada: String) -> OperacionBitacora {
        OperacionesExtra.op(tipo, ["accion": .string("quitar"), "de": .string(de), "entrada": .string(entrada)])
    }

    static func aplicar(_ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        guard let de = d["de"]?.texto, !de.isEmpty, var lista = (valores["entries"] ?? nil)?.lista else { return valores }
        let accion = d["accion"]?.texto ?? ""
        guard ["renombrar", "eliminar", "quitar"].contains(accion) else { return valores }
        let a = (d["a"]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if accion == "renombrar", a.isEmpty || a == de { return valores }
        var cambio = false
        for i in lista.indices {
            guard var o = lista[i].objeto, let tags = o["tags"]?.lista, tags.contains(where: { $0.texto == de }) else { continue }
            if accion == "quitar", o["id"]?.comoId != d["entrada"]?.texto { continue }
            var nuevas: [JSONValue] = []
            for t in tags {
                if t.texto == de {
                    guard accion == "renombrar" else { continue }
                    if !nuevas.contains(.string(a)) { nuevas.append(.string(a)) }
                } else if !nuevas.contains(t) {
                    nuevas.append(t)
                }
            }
            o["tags"] = .array(nuevas)
            lista[i] = .object(o)
            cambio = true
        }
        guard cambio else { return valores }
        var r = valores
        r["entries"] = .some(.array(lista))
        return r
    }
}
