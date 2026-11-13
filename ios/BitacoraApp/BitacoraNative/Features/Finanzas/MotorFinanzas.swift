import Foundation
import JavaScriptCore
import os

// Finanzas con el código de la web, en JavaScriptCore: las cifras de las cuatro pestañas, el importador de extractos,
// prepararFinanzas y el gestor de suscripciones salen de las mismas funciones que pinta la PWA del móvil
// (finanzas-puente.js las devuelve como datos). Así no hay dos motores que se separen sin que nadie lo note:
// pruebas/finanzas-ios.mjs carga exactamente estos archivos y compara con la web.
//
// Rendimiento (0.20). JavaScriptCore dentro de una app va sin JIT: cada cálculo de la web cuesta varias veces lo que en
// Safari. Por eso se calcula lo menos posible:
// - el documento solo entra en JS si cambian los bytes de sus claves de Finanzas (no por la revisión: cualquier
//   escritura de otro apartado o cada sincronización la cambian) y, si lo que entra es igual a lo que ya hay, no se
//   olvida nada (`cargar` del puente compara campo a campo);
// - las escrituras son incrementales: el estado de JS se queda ya cambiado, se recalcula solo lo que se ve, y cuando la
//   operación vuelve por la cola es lo mismo y no cuesta nada;
// - lo calculado (pestañas y lecturas) se guarda hasta que cambia el estado; prepararFinanzas, una vez por estado.
// Todo fuera del hilo principal: es un actor. `ultimaMedida` y las señales («finanzas» en Instruments) dicen lo que tarda.

enum ErrorMotorFinanzas: LocalizedError {
    case sinArchivos(String), js(String), respuesta

    var errorDescription: String? {
        switch self {
        case .sinArchivos(let n): return "falta \(n) en la app."
        case .js(let e): return e
        case .respuesta: return "no se entendió la respuesta del motor de finanzas."
        }
    }
}

actor MotorFinanzas {
    static let compartido = MotorFinanzas()

    // El orden importa (como en index.html): cada archivo usa lo de los anteriores. pruebas/finanzas-ios.mjs lee esta lista.
    static let archivos = ["nucleo", "datos", "entradas", "finanzas", "finanzas-pro", "presupuesto", "suscripciones", "finanzas-resumen", "inversion", "asistente"]
    static let claves = ["financePro", "entries", "financeProfile", "investmentData"]
    // Lecturas puras: su resultado vale mientras no cambie el estado.
    private static let lecturas: Set<String> = ["logos", "logoPendientes", "gestor", "gestion", "revisar", "buscar", "movimientoDatos",
                                                "suscripcionDatos", "esInversion", "permitir", "serie", "gastosMes", "presupuestoDatos",
                                                "inversionDatos", "dividirCandidatos"]
    static let senales = OSSignposter(subsystem: "es.appbitacora.nativa", category: "finanzas")

    private var js: JSContext?
    private var huellas: [Int]?
    private var adelantado = false
    private var dia = ""
    private var generacion = 0
    private var preparadaEn = -1
    private var cache: [String: Data] = [:]
    private(set) var ultimaMedida: [String: Double] = [:]

    private func contexto() throws -> JSContext {
        if let js { return js }
        let t0 = Date()
        guard let c = JSContext() else { throw ErrorMotorFinanzas.sinArchivos("JavaScriptCore") }
        let paquete = Bundle(for: MarcaPaquete.self)
        for nombre in ["finanzas-entorno"] + Self.archivos + ["finanzas-puente"] {
            guard let url = paquete.url(forResource: nombre, withExtension: "js") ?? Bundle.main.url(forResource: nombre, withExtension: "js"),
                  let s = try? String(contentsOf: url, encoding: .utf8) else { throw ErrorMotorFinanzas.sinArchivos(nombre + ".js") }
            c.exception = nil
            c.evaluateScript(s, withSourceURL: url)
            if let e = c.exception, !e.isUndefined { throw ErrorMotorFinanzas.js("\(nombre).js: \(e.toString() ?? "")") }
        }
        anotar("arranque", desde: t0)
        js = c
        return c
    }

    // `revision` ya no decide nada (se conserva por quien la pasa): mandan los bytes de las claves de Finanzas y el día.
    func cargar(_ doc: DocumentoBitacora, revision: String = "") throws {
        let hoy = Self.hoyISO()
        if hoy != dia {
            // Las cifras dependen de «hoy»: otro día, todo se vuelve a calcular y prepararFinanzas vuelve a pasar.
            if !dia.isEmpty, let c = js { _ = try? llamar(c, "invalidar", []); olvidarCalculado() }
            dia = hoy
        }
        let h = Self.claves.map { Self.huella(doc.bytes(de: $0)) }
        if h == huellas && !adelantado { return }
        let c = try contexto()
        let t0 = Date()
        let estado = Self.senales.beginInterval("cargar")
        defer { Self.senales.endInterval("cargar", estado) }
        let texto = { (k: String) -> Any in doc.bytes(de: k).flatMap { String(data: $0, encoding: .utf8) } ?? NSNull() }
        let r = try llamar(c, "cargar", [texto("financePro"), texto("entries"), texto("financeProfile"), texto("investmentData"), huellas != nil])
        huellas = h
        adelantado = false
        if r.toString() != "igual" { olvidarCalculado() }
        anotar(r.toString() == "igual" ? "cargar (igual)" : "cargar", desde: t0)
    }

    func olvidar() { huellas = nil; olvidarCalculado() }

    private func olvidarCalculado() { cache = [:]; generacion += 1 }

    // prepararFinanzas, como la web antes de pintar Finanzas: una vez por estado (y por día). nil si no cambió nada.
    func preparar() throws -> Data? {
        guard preparadaEn != generacion else { return nil }
        let d = try texto("preparar", [])
        preparadaEn = generacion
        return d
    }

    func pestana<T: Decodable>(_ tab: String, opciones op: String = "{}", como: T.Type) throws -> T {
        try JSONDecoder().decode(T.self, from: try calculado(tab + op, medida: tab) { try self.texto("pestana", [tab, op]) })
    }

    func llamar<T: Decodable>(_ funcion: String, _ args: [String] = [], como: T.Type) throws -> T {
        try JSONDecoder().decode(T.self, from: crudo(funcion, args))
    }

    // Lo mismo, pero el resultado crudo (los cambios se convierten en operaciones con LectorJSON, que conserva las cifras).
    func crudo(_ funcion: String, _ args: [String] = []) throws -> Data {
        guard Self.lecturas.contains(funcion) else { return try texto(funcion, args) }
        return try calculado(funcion + "\u{1}" + args.joined(separator: "\u{1}"), medida: funcion) { try self.texto(funcion, args) }
    }

    // Lo que tarda algo fuera del motor (guardar desde que se toca hasta que está en la cola...), para la misma lista.
    func anotar(_ nombre: String, ms: Double) { ultimaMedida[nombre] = ms }

    private func anotar(_ nombre: String, desde t0: Date) { ultimaMedida[nombre] = Date().timeIntervalSince(t0) * 1000 }

    private func calculado(_ clave: String, medida: String, _ f: () throws -> Data) throws -> Data {
        if let d = cache[clave] { return d }
        let t0 = Date()
        let gen = generacion
        let d = try f()
        anotar(medida, desde: t0)
        if gen == generacion { cache[clave] = d }
        return d
    }

    private func texto(_ funcion: String, _ args: [Any]) throws -> Data {
        let c = try contexto()
        let t0 = Date()
        let estado = Self.senales.beginInterval("js", "\(funcion)")
        defer { Self.senales.endInterval("js", estado) }
        let v = try llamar(c, funcion, args)
        // Una escritura deja el estado ya cambiado: lo calculado deja de valer y el próximo documento se compara.
        if (try? llamar(c, "cambio", []))?.toBool() == true {
            adelantado = true
            olvidarCalculado()
        }
        guard let s = v.toString(), let d = s.data(using: .utf8) else { throw ErrorMotorFinanzas.respuesta }
        if !Self.lecturas.contains(funcion) && funcion != "pestana" { anotar(funcion, desde: t0) }
        return d
    }

    private func llamar(_ c: JSContext, _ funcion: String, _ args: [Any]) throws -> JSValue {
        c.exception = nil
        guard let f = c.objectForKeyedSubscript("__fin")?.objectForKeyedSubscript(funcion), !f.isUndefined else { throw ErrorMotorFinanzas.respuesta }
        let v = f.call(withArguments: args)
        if let e = c.exception, !e.isUndefined { throw ErrorMotorFinanzas.js(e.toString() ?? funcion) }
        guard let v else { throw ErrorMotorFinanzas.respuesta }
        return v
    }

    private static func huella(_ d: Data?) -> Int {
        guard let d else { return 0 }
        var h = Hasher()
        h.combine(d.count)
        d.withUnsafeBytes { h.combine(bytes: $0) }
        return h.finalize()
    }

    private static func hoyISO() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }
}
