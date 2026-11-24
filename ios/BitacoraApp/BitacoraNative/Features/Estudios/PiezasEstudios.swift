import SwiftUI

// Piezas propias de Estudios. InicialCuadrada, BarraFina y CuentaAtras viven ya en DesignSystem/V2.

// Cálculos solo de presentación sobre lo que ya lee LecturaEstudios.
enum CuentaEstudios {
    private static let iso: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    private static let corta: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "EEE d MMM"
        return f
    }()
    private static let utc: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    static func dias(hasta fecha: String, hoy: String) -> Int? {
        guard let a = iso.date(from: hoy), let b = iso.date(from: fecha) else { return nil }
        return utc.dateComponents([.day], from: a, to: b).day
    }

    static func fechaCorta(_ fecha: String) -> String {
        guard let d = iso.date(from: fecha) else { return fecha }
        return corta.string(from: d).replacingOccurrences(of: ".", with: "").lowercased()
    }

    private static func numero(_ t: String) -> Double? { Double(t.replacingOccurrences(of: ",", with: ".")) }

    /// Media de las notas puestas: ponderada si todas llevan peso, si no, simple.
    static func media(_ items: [ItemEstudio]) -> String? {
        let con = items.compactMap { i in numero(i.nota).map { (nota: $0, peso: numero(i.peso) ?? 0) } }
        guard !con.isEmpty else { return nil }
        let pesos = con.map(\.peso)
        let m: Double
        if pesos.allSatisfy({ $0 > 0 }) {
            m = con.reduce(0) { $0 + $1.nota * $1.peso } / pesos.reduce(0, +)
        } else {
            m = con.reduce(0) { $0 + $1.nota } / Double(con.count)
        }
        return String(format: "%.1f", m).replacingOccurrences(of: ".", with: ",")
    }
}
