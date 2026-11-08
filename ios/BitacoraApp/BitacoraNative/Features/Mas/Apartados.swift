import Foundation

// NAV_SECTIONS, APARTADOS_OPCIONALES, apartadoVisible y enMenu (js/nucleo.js): la misma lista y la misma visibilidad
// que el menú del móvil. Lo que aún no es nativo abre su página de la web (`appbitacora.es/#vista`).
struct Apartado: Sendable, Identifiable, Equatable {
    let vista: String
    let nombre: String
    var id: String { vista }
}

enum Apartados {
    static let secciones: [(String, [Apartado])] = [
        ("general", [a("calendar", "inicio"), a("home", "panorama"), a("planner", "planificador"), a("compra", "despensa"),
                     a("habits", "rutinas"), a("notes", "notas")]),
        ("desarrollo", [a("events", "eventos"), a("finances", "finanzas"), a("work", "empleo"), a("studies", "estudios"),
                        a("profesorado", "profesorado"), a("documents", "documentos"), a("goals", "objetivos"),
                        a("projects", "proyectos"), a("links", "enlaces")]),
        ("otros", [a("culture", "ocio"), a("friends", "social"), a("travels", "viajes"), a("actualizaciones", "envíos"),
                   a("transporte", "transporte"), a("collectibles", "coleccionables"), a("tags", "etiquetas"), a("graph", "conexiones")]),
        ("sistema", [a("bandeja", "propuestas"), a("suggestions", "sugerencias"), a("settings", "ajustes")]),
    ]
    private static func a(_ v: String, _ n: String) -> Apartado { Apartado(vista: v, nombre: n) }

    static func webURL(_ vista: String) -> URL { URL(string: "https://appbitacora.es/#\(vista)")! }

    // porDefecto() de cada opcional, sin elección guardada.
    static func visible(_ vista: String, _ doc: DocumentoBitacora) -> Bool {
        let cfg = ((try? doc.valor(de: "apartadosConfig")) ?? nil)
        if let v = cfg?["opcionales"]?[vista]?.booleano { return v }
        let perfil = cfg?["perfil"]?.texto
        let lista = { (k: String) -> [JSONValue] in ((try? doc.valor(de: k)) ?? nil)?.lista ?? [] }
        let entradas = { lista("entries") }
        switch vista {
        case "studies": return perfil != "trabajador"
        case "work": return perfil != "estudiante"
        case "estudiar": return !((((try? doc.valor(de: "estudiar")) ?? nil)?["tarjetas"]?.lista ?? []).isEmpty)
        case "universidad": return false
        case "profesorado": return !((((try? doc.valor(de: "profesorado")) ?? nil)?["clases"]?.lista ?? []).isEmpty)
        case "compra": return (((try? doc.valor(de: "listaCompra")) ?? nil)?["listas"]?.lista ?? []).contains { !($0["items"]?.lista ?? []).isEmpty }
        case "actualizaciones": return !lista("pedidos").isEmpty
        case "transporte": return !((((try? doc.valor(de: "servicios")) ?? nil)?["transporte"]?["favoritos"]?.lista ?? []).isEmpty)
        case "projects": return entradas().contains { $0["type"]?.texto == "project" }
        case "links": return !lista("links").isEmpty
        case "tags": return entradas().contains { !($0["tags"]?.lista ?? []).isEmpty }
        case "graph": return entradas().count >= 30
        case "collectibles": return !lista("collectibles").isEmpty
        default: return true
        }
    }

    static func enMenu(_ vista: String, _ doc: DocumentoBitacora) -> Bool {
        vista == "studies" ? ["studies", "estudiar", "universidad"].contains { visible($0, doc) } : visible(vista, doc)
    }

    static func visibles(_ doc: DocumentoBitacora) -> [(String, [Apartado])] {
        secciones.map { ($0.0, $0.1.filter { enMenu($0.vista, doc) }) }.filter { !$0.1.isEmpty }
    }
}
