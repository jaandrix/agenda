import Foundation

// Cambios pequeños y con significado, no documentos. Se guardan en la cola antes de enseñarse y, al subir, se vuelven
// a aplicar sobre lo último de la nube (no sobre la copia vieja): así respetan lo que la web o el conector cambiaron
// entretanto. Todas son idempotentes: aplicarlas dos veces da lo mismo que una, y por eso repetir una subida cuya
// respuesta se perdió no duplica nada.
enum OperacionBitacora: Codable, Sendable, Equatable {
    case crearTarea(id: String, dia: String, titulo: String, hora: String?)
    case marcarTarea(id: String, hecha: Bool, momentoMs: Int64)

    var clave: String {
        switch self {
        case .crearTarea, .marcarTarea: return "dayPlanner"
        }
    }

    // Mismo formato que la web (`planner_<ms>_<azar>`), para que nada distinga de dónde salió la tarea.
    static func nuevoIdTarea(ahora: Date = Date()) -> String {
        let letras = "abcdefghijklmnopqrstuvwxyz0123456789"
        return "planner_\(Int64(ahora.timeIntervalSince1970 * 1000))_" + String((0..<5).map { _ in letras.randomElement()! })
    }
}

struct OperacionPendiente: Codable, Sendable, Equatable, Identifiable {
    let id: UUID
    let dispositivo: String
    let creada: Date
    let versionContrato: Int
    let operacion: OperacionBitacora

    init(_ operacion: OperacionBitacora, dispositivo: String = Dispositivo.id, creada: Date = Date()) {
        id = UUID()
        self.dispositivo = dispositivo
        self.creada = creada
        versionContrato = ContratoDatos.version
        self.operacion = operacion
    }
}

enum AplicarOperaciones {
    // Aplica las operaciones sobre un documento y devuelve el resultado y el parche (solo las claves que cambian).
    static func sobre(_ doc: DocumentoBitacora, _ ops: [OperacionBitacora]) -> (DocumentoBitacora, [String: JSONValue]) {
        var valores: [String: JSONValue] = [:]
        var originales: [String: JSONValue?] = [:]
        for op in ops {
            let k = op.clave
            if originales[k] == nil { originales[k] = .some((try? doc.valor(de: k)) ?? nil) }
            let actual = valores[k] ?? originales[k]!
            valores[k] = aplicar(op, a: actual)
        }
        var parche: [String: JSONValue] = [:]
        for (k, v) in valores where v != originales[k]! { parche[k] = v }
        return (parche.isEmpty ? doc : doc.aplicandoParche(parche), parche)
    }

    static func aplicar(_ op: OperacionBitacora, a valor: JSONValue?) -> JSONValue {
        switch op {
        case let .crearTarea(id, dia, titulo, hora):
            var p = planificador(valor)
            if buscar(id, en: p) != nil { return valor ?? .object(p) }
            var dias = p["days"]?.objeto ?? [:]
            var lista = dias[dia]?.lista ?? []
            lista.append(.object(["id": .string(id), "time": .string(hora ?? ""), "title": .string(titulo), "notes": .string(""), "done": .bool(false)]))
            dias[dia] = .array(lista)
            p["days"] = .object(dias)
            return .object(p)
        case let .marcarTarea(id, hecha, momento):
            var p = planificador(valor)
            // Borrada en otro sitio mientras esperaba: no se resucita.
            guard var sitio = buscar(id, en: p) else { return valor ?? .object(p) }
            // Si sigue en un día pasado, primero se trae a hoy como haría arrastrarPlanner en la web al abrirse.
            let hoy = CalendarioBitacora.madrid.diaLogico(Date(timeIntervalSince1970: Double(momento) / 1000)).iso
            if case let .dia(dia, n) = sitio, dia < hoy {
                var dias = p["days"]!.objeto!
                var origen = dias[dia]!.lista!
                var t = origen.remove(at: n).objeto ?? [:]
                t["arrastrado"] = .bool(true)
                dias[dia] = .array(origen)
                var destino = dias[hoy]?.lista ?? []
                destino.append(.object(t))
                dias[hoy] = .array(destino)
                p["days"] = .object(dias)
                sitio = .dia(hoy, destino.count - 1)
            }
            return .object(cambiar(sitio, en: p) { t in
                t["done"] = .bool(hecha)
                if hecha { t["hechaEn"] = .number(String(momento)) } else { t.removeValue(forKey: "hechaEn") }
            })
        }
    }

    // migratePlannerData (js/planificador.js): el formato viejo { dayKey, items } pasa a { days, backlog }.
    static func planificador(_ v: JSONValue?) -> [String: JSONValue] {
        var p = v?.objeto ?? [:]
        if p["days"]?.objeto == nil {
            var dias: [String: JSONValue] = [:]
            if let items = p["items"]?.lista, !items.isEmpty, let dia = p["dayKey"]?.texto { dias[dia] = .array(items) }
            p["days"] = .object(dias)
            p.removeValue(forKey: "items")
            p.removeValue(forKey: "dayKey")
        }
        if p["backlog"]?.lista == nil { p["backlog"] = .array([]) }
        return p
    }

    private enum Sitio { case dia(String, Int), pendiente(Int) }

    private static func buscar(_ id: String, en p: [String: JSONValue]) -> Sitio? {
        for (dia, lista) in p["days"]?.objeto ?? [:] {
            if let n = lista.lista?.firstIndex(where: { $0["id"]?.comoId == id }) { return .dia(dia, n) }
        }
        if let n = p["backlog"]?.lista?.firstIndex(where: { $0["id"]?.comoId == id }) { return .pendiente(n) }
        return nil
    }

    private static func cambiar(_ sitio: Sitio, en p: [String: JSONValue], _ f: (inout [String: JSONValue]) -> Void) -> [String: JSONValue] {
        var p = p
        switch sitio {
        case let .dia(dia, n):
            var dias = p["days"]!.objeto!
            var lista = dias[dia]!.lista!
            var t = lista[n].objeto ?? [:]
            f(&t)
            lista[n] = .object(t)
            dias[dia] = .array(lista)
            p["days"] = .object(dias)
        case let .pendiente(n):
            var lista = p["backlog"]!.lista!
            var t = lista[n].objeto ?? [:]
            f(&t)
            lista[n] = .object(t)
            p["backlog"] = .array(lista)
        }
        return p
    }
}
