import Foundation

// Dinero siempre en Decimal. Acepta el número JSON o la cadena heredada («12,50», «1.200,50», «12.5»).
enum Dinero {
    private static let posix = Locale(identifier: "en_US_POSIX")

    static func decimal(_ v: JSONValue?) -> Decimal? {
        switch v {
        case .number(let n)?: return validar(Decimal(string: n, locale: posix))
        case .string(let s)?: return decimal(texto: s)
        default: return nil
        }
    }

    static func decimal(texto: String) -> Decimal? {
        var s = texto.trimmingCharacters(in: .whitespaces)
        guard !s.isEmpty, s.allSatisfy({ $0.isNumber || $0 == "." || $0 == "," || $0 == "-" || $0 == "+" }) else { return nil }
        if s.contains(",") {
            s = s.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
        }
        guard s.filter({ $0 == "." }).count <= 1 else { return nil }
        return validar(Decimal(string: s, locale: posix))
    }

    private static func validar(_ d: Decimal?) -> Decimal? {
        guard let d, d.isFinite, !d.isNaN else { return nil }
        return d
    }

    // Redondeo bancario (mitad al par) a céntimos; la única política para comparar y enseñar.
    static func redondeado(_ d: Decimal, escala: Int = 2) -> Decimal {
        var entrada = d
        var r = Decimal()
        NSDecimalRound(&r, &entrada, escala, .bankers)
        return r
    }

    static func formato(_ d: Decimal) -> String {
        redondeado(d).formatted(.currency(code: "EUR").locale(Locale(identifier: "es_ES")))
    }
}
