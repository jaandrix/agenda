import Foundation

// Los números se guardan con su texto literal: pasar por Double cambiaría céntimos e identificadores largos
// al volver a escribirlos. Dos números son iguales si valen lo mismo, aunque se escriban distinto («1» y «1.0»).
enum JSONValue: Sendable, Hashable {
    case null
    case bool(Bool)
    case number(String)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    static func == (a: JSONValue, b: JSONValue) -> Bool {
        switch (a, b) {
        case (.null, .null): return true
        case let (.bool(x), .bool(y)): return x == y
        case let (.number(x), .number(y)):
            if x == y { return true }
            guard let dx = Decimal(string: x, locale: Locale(identifier: "en_US_POSIX")),
                  let dy = Decimal(string: y, locale: Locale(identifier: "en_US_POSIX")) else { return false }
            return dx == dy
        case let (.string(x), .string(y)): return x == y
        case let (.array(x), .array(y)): return x == y
        case let (.object(x), .object(y)): return x == y
        default: return false
        }
    }

    func hash(into h: inout Hasher) {
        switch self {
        case .null: h.combine(0)
        case .bool(let b): h.combine(b)
        case .number(let n):
            if let d = Decimal(string: n, locale: Locale(identifier: "en_US_POSIX")) { h.combine(d) } else { h.combine(n) }
        case .string(let s): h.combine(s)
        case .array(let a): h.combine(a)
        case .object(let o): h.combine(o)
        }
    }

    subscript(clave: String) -> JSONValue? {
        if case .object(let o) = self { return o[clave] }
        return nil
    }

    var objeto: [String: JSONValue]? { if case .object(let o) = self { return o }; return nil }
    var lista: [JSONValue]? { if case .array(let a) = self { return a }; return nil }
    var texto: String? { if case .string(let s) = self { return s }; return nil }
    var booleano: Bool? { if case .bool(let b) = self { return b }; return nil }

    // Lo que daría String(x) en JavaScript para un id: sirve para emparejar elementos de listas como hace la web.
    var comoId: String? {
        switch self {
        case .string(let s): return s
        case .number(let n):
            if let d = Decimal(string: n, locale: Locale(identifier: "en_US_POSIX")) { return NSDecimalNumber(decimal: d).stringValue }
            return n
        case .bool(let b): return b ? "true" : "false"
        default: return nil
        }
    }
}

enum ErrorJSON: Error, Equatable {
    case finInesperado
    case caracterInesperado(Int)
    case noEsObjeto
}

struct LectorJSON {
    private let b: [UInt8]
    private(set) var i = 0

    init(_ datos: Data) { b = [UInt8](datos) }

    static func valor(_ datos: Data) throws -> JSONValue {
        var l = LectorJSON(datos)
        let v = try l.valor()
        l.espacios()
        guard l.i == l.b.count else { throw ErrorJSON.caracterInesperado(l.i) }
        return v
    }

    // Claves de primer nivel con el rango de bytes exacto de su valor, en el orden en que llegan.
    static func fragmentosRaiz(_ datos: Data) throws -> [(String, Range<Int>)] {
        var l = LectorJSON(datos)
        l.espacios()
        guard l.i < l.b.count, l.b[l.i] == UInt8(ascii: "{") else { throw ErrorJSON.noEsObjeto }
        l.i += 1
        var r: [(String, Range<Int>)] = []
        l.espacios()
        if l.i < l.b.count, l.b[l.i] == UInt8(ascii: "}") { l.i += 1; return r }
        while true {
            l.espacios()
            let clave = try l.cadena()
            l.espacios()
            try l.esperar(UInt8(ascii: ":"))
            l.espacios()
            let inicio = l.i
            try l.saltarValor()
            r.append((clave, inicio..<l.i))
            l.espacios()
            guard l.i < l.b.count else { throw ErrorJSON.finInesperado }
            if l.b[l.i] == UInt8(ascii: ",") { l.i += 1; continue }
            if l.b[l.i] == UInt8(ascii: "}") { l.i += 1; break }
            throw ErrorJSON.caracterInesperado(l.i)
        }
        l.espacios()
        guard l.i == l.b.count else { throw ErrorJSON.caracterInesperado(l.i) }
        return r
    }

    // Elementos de una lista u objeto sin construir sus valores (para el resumen de «estado.»).
    static func contarElementos(_ datos: Data) -> Int? {
        var l = LectorJSON(datos)
        l.espacios()
        guard l.i < l.b.count, l.b[l.i] == UInt8(ascii: "[") || l.b[l.i] == UInt8(ascii: "{") else { return nil }
        let esObjeto = l.b[l.i] == UInt8(ascii: "{")
        l.i += 1
        l.espacios()
        if l.i < l.b.count, l.b[l.i] == UInt8(ascii: esObjeto ? "}" : "]") { return 0 }
        var n = 0
        while l.i < l.b.count {
            l.espacios()
            if esObjeto {
                guard (try? l.cadena()) != nil else { return nil }
                l.espacios()
                guard l.i < l.b.count, l.b[l.i] == UInt8(ascii: ":") else { return nil }
                l.i += 1
            }
            guard (try? l.saltarValor()) != nil else { return nil }
            n += 1
            l.espacios()
            guard l.i < l.b.count else { return nil }
            if l.b[l.i] == UInt8(ascii: ",") { l.i += 1; continue }
            return n
        }
        return nil
    }

    // Avanza sobre un valor comprobando que está bien formado pero sin construirlo: localizar las claves de un
    // documento grande no debe costar lo mismo que decodificarlo entero.
    mutating func saltarValor() throws {
        espacios()
        guard i < b.count else { throw ErrorJSON.finInesperado }
        switch b[i] {
        case UInt8(ascii: "\""):
            try saltarCadena()
        case UInt8(ascii: "{"), UInt8(ascii: "["):
            var pila: [UInt8] = []
            repeat {
                guard i < b.count else { throw ErrorJSON.finInesperado }
                let c = b[i]
                switch c {
                case UInt8(ascii: "\""): try saltarCadena(); continue
                case UInt8(ascii: "{"): pila.append(UInt8(ascii: "}"))
                case UInt8(ascii: "["): pila.append(UInt8(ascii: "]"))
                case UInt8(ascii: "}"), UInt8(ascii: "]"):
                    guard pila.popLast() == c else { throw ErrorJSON.caracterInesperado(i) }
                default: break
                }
                i += 1
            } while !pila.isEmpty
        default:
            _ = try valor()
        }
    }

    private mutating func saltarCadena() throws {
        i += 1
        while i < b.count {
            let c = b[i]
            if c == 0x5C { i += 2; continue }
            i += 1
            if c == 0x22 { return }
        }
        throw ErrorJSON.finInesperado
    }

    mutating func espacios() {
        while i < b.count, b[i] == 0x20 || b[i] == 0x09 || b[i] == 0x0A || b[i] == 0x0D { i += 1 }
    }

    private mutating func esperar(_ c: UInt8) throws {
        guard i < b.count else { throw ErrorJSON.finInesperado }
        guard b[i] == c else { throw ErrorJSON.caracterInesperado(i) }
        i += 1
    }

    private mutating func literal(_ s: String, _ v: JSONValue) throws -> JSONValue {
        for c in s.utf8 { try esperar(c) }
        return v
    }

    mutating func valor() throws -> JSONValue {
        espacios()
        guard i < b.count else { throw ErrorJSON.finInesperado }
        switch b[i] {
        case UInt8(ascii: "{"): return try objeto()
        case UInt8(ascii: "["): return try arreglo()
        case UInt8(ascii: "\""): return .string(try cadena())
        case UInt8(ascii: "t"): return try literal("true", .bool(true))
        case UInt8(ascii: "f"): return try literal("false", .bool(false))
        case UInt8(ascii: "n"): return try literal("null", .null)
        default: return try numero()
        }
    }

    private mutating func objeto() throws -> JSONValue {
        try esperar(UInt8(ascii: "{"))
        var o: [String: JSONValue] = [:]
        espacios()
        if i < b.count, b[i] == UInt8(ascii: "}") { i += 1; return .object(o) }
        while true {
            espacios()
            let k = try cadena()
            espacios()
            try esperar(UInt8(ascii: ":"))
            o[k] = try valor()
            espacios()
            guard i < b.count else { throw ErrorJSON.finInesperado }
            if b[i] == UInt8(ascii: ",") { i += 1; continue }
            if b[i] == UInt8(ascii: "}") { i += 1; return .object(o) }
            throw ErrorJSON.caracterInesperado(i)
        }
    }

    private mutating func arreglo() throws -> JSONValue {
        try esperar(UInt8(ascii: "["))
        var a: [JSONValue] = []
        espacios()
        if i < b.count, b[i] == UInt8(ascii: "]") { i += 1; return .array(a) }
        while true {
            a.append(try valor())
            espacios()
            guard i < b.count else { throw ErrorJSON.finInesperado }
            if b[i] == UInt8(ascii: ",") { i += 1; continue }
            if b[i] == UInt8(ascii: "]") { i += 1; return .array(a) }
            throw ErrorJSON.caracterInesperado(i)
        }
    }

    private mutating func hex4() throws -> UInt32 {
        guard i + 4 <= b.count else { throw ErrorJSON.finInesperado }
        var v: UInt32 = 0
        for _ in 0..<4 {
            let c = b[i]
            let d: UInt32
            switch c {
            case 0x30...0x39: d = UInt32(c - 0x30)
            case 0x41...0x46: d = UInt32(c - 0x41 + 10)
            case 0x61...0x66: d = UInt32(c - 0x61 + 10)
            default: throw ErrorJSON.caracterInesperado(i)
            }
            v = v * 16 + d
            i += 1
        }
        return v
    }

    mutating func cadena() throws -> String {
        try esperar(UInt8(ascii: "\""))
        var out: [UInt8] = []
        while true {
            guard i < b.count else { throw ErrorJSON.finInesperado }
            let c = b[i]
            i += 1
            if c == UInt8(ascii: "\"") { break }
            if c != UInt8(ascii: "\\") { out.append(c); continue }
            guard i < b.count else { throw ErrorJSON.finInesperado }
            let e = b[i]
            i += 1
            switch e {
            case UInt8(ascii: "\""): out.append(0x22)
            case UInt8(ascii: "\\"): out.append(0x5C)
            case UInt8(ascii: "/"): out.append(0x2F)
            case UInt8(ascii: "b"): out.append(0x08)
            case UInt8(ascii: "f"): out.append(0x0C)
            case UInt8(ascii: "n"): out.append(0x0A)
            case UInt8(ascii: "r"): out.append(0x0D)
            case UInt8(ascii: "t"): out.append(0x09)
            case UInt8(ascii: "u"):
                var u = try hex4()
                if (0xD800...0xDBFF).contains(u), i + 6 <= b.count, b[i] == 0x5C, b[i + 1] == UInt8(ascii: "u") {
                    let guardado = i
                    i += 2
                    let bajo = try hex4()
                    if (0xDC00...0xDFFF).contains(bajo) {
                        u = 0x10000 + ((u - 0xD800) << 10) + (bajo - 0xDC00)
                    } else {
                        i = guardado
                    }
                }
                let escalar = Unicode.Scalar(u) ?? "\u{FFFD}"
                out.append(contentsOf: Array(String(Character(escalar)).utf8))
            default: throw ErrorJSON.caracterInesperado(i - 1)
            }
        }
        return String(decoding: out, as: UTF8.self)
    }

    private mutating func numero() throws -> JSONValue {
        let inicio = i
        if i < b.count, b[i] == UInt8(ascii: "-") { i += 1 }
        guard digitos() > 0 else { throw ErrorJSON.caracterInesperado(inicio) }
        if i < b.count, b[i] == UInt8(ascii: ".") {
            i += 1
            guard digitos() > 0 else { throw ErrorJSON.caracterInesperado(i) }
        }
        if i < b.count, b[i] == UInt8(ascii: "e") || b[i] == UInt8(ascii: "E") {
            i += 1
            if i < b.count, b[i] == UInt8(ascii: "+") || b[i] == UInt8(ascii: "-") { i += 1 }
            guard digitos() > 0 else { throw ErrorJSON.caracterInesperado(i) }
        }
        return .number(String(decoding: b[inicio..<i], as: UTF8.self))
    }

    private mutating func digitos() -> Int {
        let s = i
        while i < b.count, (0x30...0x39).contains(b[i]) { i += 1 }
        return i - s
    }
}

enum EscritorJSON {
    static func datos(_ v: JSONValue) -> Data { Data(texto(v).utf8) }

    static func texto(_ v: JSONValue) -> String {
        var s = ""
        escribir(v, en: &s)
        return s
    }

    private static func escribir(_ v: JSONValue, en s: inout String) {
        switch v {
        case .null: s += "null"
        case .bool(let x): s += x ? "true" : "false"
        case .number(let n): s += n
        case .string(let t): s += cadena(t)
        case .array(let a):
            s += "["
            for (n, x) in a.enumerated() {
                if n > 0 { s += "," }
                escribir(x, en: &s)
            }
            s += "]"
        case .object(let o):
            s += "{"
            for (n, k) in o.keys.sorted().enumerated() {
                if n > 0 { s += "," }
                s += cadena(k)
                s += ":"
                escribir(o[k]!, en: &s)
            }
            s += "}"
        }
    }

    static func cadena(_ t: String) -> String {
        var s = "\""
        for u in t.unicodeScalars {
            switch u {
            case "\"": s += "\\\""
            case "\\": s += "\\\\"
            case "\n": s += "\\n"
            case "\r": s += "\\r"
            case "\t": s += "\\t"
            case "\u{08}": s += "\\b"
            case "\u{0C}": s += "\\f"
            default:
                if u.value < 0x20 {
                    s += String(format: "\\u%04x", u.value)
                } else {
                    s.unicodeScalars.append(u)
                }
            }
        }
        return s + "\""
    }
}
