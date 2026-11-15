import Foundation

// Escrituras de Ajustes que viven en la fila de `bitacora` (0.22). Por `OperacionBitacora.extra`, idempotentes:
// - aviso: toggleAvisoAutomatico (js/ajustes.js). `preferenciasAvisos[tipo] = false` lo apaga; encendido, la clave se quita.
// - feed: cambiarEnlaceCalendario. `calendarioFeedVersion` con el número ya calculado (reaplicar no vuelve a sumar).
// - token: atajoToken (js/servicios.js). `servicios.siriToken` o `servicios.correoToken`.
enum OperacionesAjustes {
    static let aviso = "ajusteAviso"
    static let feed = "ajusteFeed"
    static let token = "ajusteToken"

    // AVISOS_AUTOMATICOS de la web, en el mismo orden.
    static let avisos: [(tipo: String, titulo: String, texto: String)] = [
        ("eventos", "eventos.", "una hora antes de cada evento con hora."),
        ("aportaciones", "cargos vigilados.", "un cargo que avisa si no aparece en el banco y no ha llegado 3 días después."),
        ("estudios", "exámenes y entregas.", "los de hoy y los exámenes de mañana."),
        ("documentos", "documentos que caducan.", "a 30 días, 7 días, un día y el mismo día."),
        ("pedidos", "envíos.", "cuando un pedido con seguimiento cambia de estado."),
        ("reembolsos", "reembolsos atascados.", "un ingreso que lleva más de 7 días pendiente."),
        ("cumpleanos", "cumpleaños.", "los de hoy y los de mañana."),
        ("ritmo", "ritmo de gasto.", "cuando el día a día va bastante por encima de lo normal en ti."),
        ("bandeja", "propuestas.", "cambios de Claude que llevan más de un día esperando."),
        ("semana", "tu semana.", "el domingo a las 20:00, lo que viene."),
        ("volver", "si llevas días sin entrar.", "tras 4 días sin abrir bitácora, como mucho uno por semana."),
        ("regalos", "regalos de cumpleaños.", "una semana antes, la tarea «pensar regalo»."),
    ]

    static func claves(_ tipo: String) -> [String] {
        switch tipo {
        case aviso: return ["preferenciasAvisos"]
        case feed: return ["calendarioFeedVersion"]
        default: return ["servicios"]
        }
    }

    static func avisoOp(tipo: String, activo: Bool) -> OperacionBitacora {
        OperacionesExtra.op(aviso, ["tipo": .string(tipo), "activo": .bool(activo)])
    }

    static func feedOp(version: Int) -> OperacionBitacora {
        OperacionesExtra.op(feed, ["version": .number(String(version))])
    }

    static func tokenOp(clave: String, token: String) -> OperacionBitacora {
        OperacionesExtra.op(token, ["clave": .string(clave), "token": .string(token)])
    }

    static func aplicar(_ tipo: String, _ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        var r = valores
        switch tipo {
        case aviso:
            guard let t = d["tipo"]?.texto, avisos.contains(where: { $0.tipo == t }), let activo = d["activo"]?.booleano else { break }
            var p = (valores["preferenciasAvisos"] ?? nil)?.objeto ?? [:]
            if activo { p.removeValue(forKey: t) } else { p[t] = .bool(false) }
            r["preferenciasAvisos"] = .some(.object(p))
        case feed:
            guard case let .number(n)? = d["version"], Int(n) != nil else { break }
            r["calendarioFeedVersion"] = .some(.number(n))
        case token:
            guard let k = d["clave"]?.texto, ["siriToken", "correoToken"].contains(k), let v = d["token"]?.texto, !v.isEmpty else { break }
            var s = (valores["servicios"] ?? nil)?.objeto ?? [:]
            s[k] = .string(v)
            r["servicios"] = .some(.object(s))
        default:
            break
        }
        return r
    }

    // Lo que Ajustes lee del documento.
    struct Lectura: Sendable, Equatable {
        var nombre = ""
        var perfil = "ambos"
        var opcionales: [String: Bool] = [:]
        var avisosApagados: Set<String> = []
        var feedVersion = 0
        var siriToken: String?
        var correoToken: String?
    }

    static func leer(_ doc: DocumentoBitacora) -> Lectura {
        var l = Lectura()
        l.nombre = ((try? doc.valor(de: "userName")) ?? nil)?.texto ?? ""
        let cfg = (try? doc.valor(de: "apartadosConfig")) ?? nil
        l.perfil = cfg?["perfil"]?.texto ?? "ambos"
        for (k, v) in cfg?["opcionales"]?.objeto ?? [:] { if let b = v.booleano { l.opcionales[k] = b } }
        for (k, v) in ((try? doc.valor(de: "preferenciasAvisos")) ?? nil)?.objeto ?? [:] where v.booleano == false { l.avisosApagados.insert(k) }
        if case let .number(n)? = (try? doc.valor(de: "calendarioFeedVersion")) ?? nil { l.feedVersion = Int(Double(n) ?? 0) }
        let serv = (try? doc.valor(de: "servicios")) ?? nil
        l.siriToken = serv?["siriToken"]?.texto
        l.correoToken = serv?["correoToken"]?.texto
        return l
    }
}
