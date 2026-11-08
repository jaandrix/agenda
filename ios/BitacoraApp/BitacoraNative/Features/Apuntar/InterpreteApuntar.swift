import Foundation
import JavaScriptCore

// «apuntar.» interpreta con el mismo js/apuntar.js de la web (apuntarTrocear, interpretarApunte, apuntarTipo y
// apuntarDescribir), cargado en JavaScriptCore con apuntar-entorno.js y apuntar-puente.js. Así no hay dos intérpretes que
// se separen sin que nadie lo note: pruebas/apuntar-casos.json (que saca pruebas/apuntar-casos.mjs de la web) es el banco
// dorado que los tests de Swift pasan por aquí. Solo interpreta: no toca datos, red ni reloj (la fecha base entra).

struct ContextoApuntar: Sendable, Equatable, Codable {
    struct Categoria: Sendable, Equatable, Codable { let id: String; let type: String; let name: String }
    struct Asignatura: Sendable, Equatable, Codable { let id: String; let name: String }
    var uid = ""
    var categorias: [Categoria] = []
    var asignaturas: [Asignatura] = []
    // Apartados apagados que cambian el tipo propuesto (compra, studies, culture).
    var ocultos: [String] = []

    static func desde(_ doc: DocumentoBitacora, uid: String) -> ContextoApuntar {
        let v = { (k: String) -> JSONValue? in (try? doc.valor(de: k)) ?? nil }
        let cats = (v("financePro")?["categories"]?.lista ?? []).compactMap { c -> Categoria? in
            guard let id = c["id"]?.comoId else { return nil }
            return Categoria(id: id, type: c["type"]?.texto ?? "", name: c["name"]?.texto ?? "")
        }
        let asig = (v("studies")?["subjects"]?.lista ?? []).compactMap { s -> Asignatura? in
            guard let id = s["id"]?.comoId else { return nil }
            return Asignatura(id: id, name: s["name"]?.texto ?? "")
        }
        return ContextoApuntar(uid: uid, categorias: cats, asignaturas: asig,
                               ocultos: ["compra", "studies", "culture"].filter { !Apartados.visible($0, doc) })
    }
}

struct DescripcionApunte: Sendable, Equatable, Decodable { let texto: String; let falta: String }

struct CamposApunte: Sendable, Equatable, Decodable {
    struct Recurrencia: Sendable, Equatable, Decodable { let frecuencia: String; let dias: [String]?; let cada: Int?; let diaMes: Int? }
    struct Estudio: Sendable, Equatable, Decodable { let lista: String; let clase: String }
    let fecha: String
    let fechaDicha: Bool
    let fechaFin: String
    let anioDicho: Bool
    let hora: String
    let horaFin: String
    let importe: String?
    let ingreso: Bool
    let comprar: Bool
    let nota: Bool
    let titulo: String
    let recurrencia: Recurrencia?
    let cumple: Bool
    let estudio: Estudio?
    let clase: Bool
    let viaje: Bool
    let eventoTipo: String
    let lugar: String
    let cuenta: String
    let categoria: String
    let forzado: String
    let conGente: Bool
    let asignaturaId: String?
    let asignaturaNombre: String?
}

struct ApunteInterpretado: Sendable, Equatable, Decodable {
    let texto: String
    let tipo: String
    let describir: [String: DescripcionApunte]
    let nada: Bool
    let r: CamposApunte
}

enum TipoApunte {
    // APUNTAR_TIPOS (js/apuntar.js): clave y nombre en el selector.
    static let todos: [(String, String)] = [("tarea", "tarea"), ("evento", "evento"), ("gasto", "gasto o ingreso"), ("compra", "a la compra"),
        ("nota", "nota"), ("cumple", "cumpleaños"), ("examen", "examen"), ("trabajo", "trabajo o entrega"), ("recurrente", "tarea que se repite"),
        ("clase", "clase del horario"), ("viaje", "viaje"), ("libro", "libro"), ("serie", "serie"), ("peli", "película"), ("juego", "videojuego")]
    // APUNTAR_TIPO_NOMBRE.
    static let nombre: [String: String] = ["tarea": "tarea", "evento": "evento", "gasto": "gasto", "compra": "compra", "nota": "nota",
        "cumple": "cumpleaños", "examen": "examen", "trabajo": "entrega", "recurrente": "tarea que se repite", "clase": "clase", "viaje": "viaje",
        "libro": "libro", "serie": "serie", "peli": "película", "juego": "videojuego"]

    static func disponibles(_ ctx: ContextoApuntar) -> [(String, String)] {
        todos.filter { k, _ in
            (k != "compra" || !ctx.ocultos.contains("compra"))
                && (!["examen", "trabajo", "clase"].contains(k) || !ctx.ocultos.contains("studies"))
                && (!["libro", "serie", "peli", "juego"].contains(k) || !ctx.ocultos.contains("culture"))
        }
    }
}

enum ErrorInterprete: Error { case sinArchivos, js(String) }

// Para encontrar el paquete de la app también desde los tests.
final class MarcaPaquete {}

actor InterpreteApuntar {
    static let compartido = InterpreteApuntar()

    private var js: JSContext?
    private var contextoPuesto: ContextoApuntar?

    private func preparado() throws -> JSContext {
        if let js { return js }
        guard let c = JSContext() else { throw ErrorInterprete.sinArchivos }
        let paquete = Bundle(for: MarcaPaquete.self)
        for nombre in ["apuntar-entorno", "apuntar", "apuntar-puente"] {
            guard let url = paquete.url(forResource: nombre, withExtension: "js") ?? Bundle.main.url(forResource: nombre, withExtension: "js"),
                  let s = try? String(contentsOf: url, encoding: .utf8) else { throw ErrorInterprete.sinArchivos }
            c.evaluateScript(s, withSourceURL: url)
            if let e = c.exception, !e.isUndefined { throw ErrorInterprete.js(e.toString() ?? nombre) }
        }
        js = c
        return c
    }

    // Solo para las pruebas: «ahora» fijo, como pruebas/apuntar-casos.mjs.
    func fijarAhora(_ a: Int, _ m: Int, _ d: Int, _ h: Int) throws {
        _ = try preparado().objectForKeyedSubscript("__fijarAhora").call(withArguments: [a, m, d, h])
    }

    func interpretar(_ texto: String, fechaBase: String?, contexto: ContextoApuntar) throws -> [ApunteInterpretado] {
        let c = try preparado()
        if contextoPuesto != contexto {
            let json = String(decoding: try JSONEncoder().encode(contexto), as: UTF8.self)
            _ = c.objectForKeyedSubscript("__contexto").call(withArguments: [json])
            contextoPuesto = contexto
        }
        c.exception = nil
        let salida = c.objectForKeyedSubscript("__apuntar").call(withArguments: [texto, fechaBase ?? NSNull()])
        if let e = c.exception, !e.isUndefined { c.exception = nil; throw ErrorInterprete.js(e.toString() ?? "error") }
        guard let s = salida?.toString() else { throw ErrorInterprete.js("sin respuesta") }
        return try JSONDecoder().decode([ApunteInterpretado].self, from: Data(s.utf8))
    }
}

// compraInterpretar (js/compra.js): cantidad delante o «x 3» detrás, y precio con €.
enum Compra {
    struct Item: Equatable { let texto: String; let cantidad: String; let precio: String? }

    static func interpretar(_ texto: String) -> Item {
        var t = texto.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        var precio: String?
        if let m = buscar(#"(\d+(?:[.,]\d{1,2})?)\s*€"#, t) {
            if let d = Decimal(string: m[1].replacingOccurrences(of: ",", with: "."), locale: Locale(identifier: "en_US_POSIX")) {
                precio = NSDecimalNumber(decimal: d).stringValue
            }
            t = t.replacingOccurrences(of: m[0], with: "").trimmingCharacters(in: .whitespaces)
        }
        var cantidad = ""
        if let m = buscar(#"^(\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|uds?|paquetes?|botes?|latas?|docenas?)?)\s+(.+)$"#, t, mayusculas: true) {
            cantidad = m[1]; t = m[2]
        } else if let m = buscar(#"^(.+?)\s+x\s*(\d+)$"#, t, mayusculas: true) {
            cantidad = m[2]; t = m[1]
        }
        return Item(texto: t.prefix(1).uppercased() + t.dropFirst(), cantidad: cantidad, precio: precio)
    }

    static func buscar(_ patron: String, _ t: String, mayusculas: Bool = false) -> [String]? {
        guard let re = try? NSRegularExpression(pattern: patron, options: mayusculas ? [.caseInsensitive] : []),
              let m = re.firstMatch(in: t, range: NSRange(t.startIndex..., in: t)) else { return nil }
        return (0..<m.numberOfRanges).map { i in Range(m.range(at: i), in: t).map { String(t[$0]) } ?? "" }
    }
}
