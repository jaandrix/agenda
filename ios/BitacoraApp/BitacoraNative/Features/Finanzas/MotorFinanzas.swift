import Foundation
import JavaScriptCore

// Finanzas con el código de la web, en JavaScriptCore: las cifras de las cuatro pestañas, el importador de extractos,
// prepararFinanzas y el gestor de suscripciones salen de las mismas funciones que pinta la PWA del móvil
// (finanzas-puente.js las devuelve como datos). Así no hay dos motores que se separen sin que nadie lo note:
// pruebas/finanzas-ios.mjs carga exactamente estos archivos y compara con la web.
//
// Rendimiento: el documento se carga una vez por revisión (los bytes de cada clave van tal cual a JSON.parse, sin
// decodificar en Swift), y cada pestaña se calcula una vez por revisión y opciones (`cache`). Todo fuera del hilo
// principal: es un actor.

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

    private var js: JSContext?
    private var cargada: String?
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
        ultimaMedida["arranque"] = Date().timeIntervalSince(t0) * 1000
        js = c
        return c
    }

    // Carga el documento si cambió de revisión. La clave de caché es la revisión que da el coordinador (informe.revision)
    // más el día: las cifras dependen de «hoy».
    func cargar(_ doc: DocumentoBitacora, revision: String) throws {
        let clave = revision + "|" + Self.hoyISO()
        if cargada == clave { return }
        let c = try contexto()
        let t0 = Date()
        let texto = { (k: String) -> Any in doc.bytes(de: k).flatMap { String(data: $0, encoding: .utf8) } ?? NSNull() }
        _ = try llamar(c, "cargar", [texto("financePro"), texto("entries"), texto("financeProfile"), texto("investmentData")])
        cargada = clave
        cache = [:]
        ultimaMedida["cargar"] = Date().timeIntervalSince(t0) * 1000
    }

    func olvidar() { cargada = nil; cache = [:] }

    func pestana<T: Decodable>(_ tab: String, opciones op: String = "{}", como: T.Type) throws -> T {
        let clave = tab + op
        let datos: Data
        if let d = cache[clave] { datos = d } else {
            let t0 = Date()
            datos = try texto("pestana", [tab, op])
            cache[clave] = datos
            ultimaMedida[tab] = Date().timeIntervalSince(t0) * 1000
        }
        return try JSONDecoder().decode(T.self, from: datos)
    }

    func llamar<T: Decodable>(_ funcion: String, _ args: [String] = [], como: T.Type) throws -> T {
        try JSONDecoder().decode(T.self, from: texto(funcion, args))
    }

    // Lo mismo, pero el resultado crudo (los cambios se convierten en operaciones con LectorJSON, que conserva las cifras).
    func crudo(_ funcion: String, _ args: [String] = []) throws -> Data { try texto(funcion, args) }

    private func texto(_ funcion: String, _ args: [Any]) throws -> Data {
        let c = try contexto()
        let v = try llamar(c, funcion, args)
        guard let s = v.toString(), let d = s.data(using: .utf8) else { throw ErrorMotorFinanzas.respuesta }
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

    private static func hoyISO() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }
}
