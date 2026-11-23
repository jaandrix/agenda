import SwiftUI

// Piezas propias de Estudios en Bitácora 2.0. Candidatas a subir a DesignSystem/V2 si otro apartado las necesita.

/// Squircle con la inicial de una asignatura (el dato no trae color: va en gris sutil, o en carbón si se destaca).
struct InicialCuadrada: View {
    let nombre: String
    var oscuro = false
    var tamano: CGFloat = Medida.icono

    var body: some View {
        RoundedRectangle(cornerRadius: tamano * 0.3, style: .continuous)
            .fill(oscuro ? Lienzo.oscuro : Lienzo.sutil)
            .overlay {
                Text(inicial).font(Letra.pieFuerte).foregroundStyle(oscuro ? Lienzo.sobreOscuro : Lienzo.tinta)
            }
            .frame(width: tamano, height: tamano)
            .accessibilityHidden(true)
    }

    private var inicial: String {
        nombre.trimmingCharacters(in: .whitespacesAndNewlines).first.map { String($0).lowercased() } ?? "a"
    }
}

/// Barra fina de progreso (hecho / total) dentro de una tarjeta de asignatura.
struct BarraProgresoEstudio: View {
    let fraccion: Double
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Lienzo.sutil)
                Capsule().fill(Lienzo.tinta).frame(width: max(4, g.size.width * min(max(fraccion, 0), 1)))
            }
        }
        .frame(height: 4)
        .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: fraccion)
        .accessibilityHidden(true)
    }
}

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

    /// Texto grande de la cuenta atrás.
    static func cuentaAtras(_ d: Int) -> String {
        switch d {
        case ..<0: return d == -1 ? "ayer." : "hace \(-d) días."
        case 0: return "hoy."
        case 1: return "mañana."
        default: return "en \(d) días."
        }
    }

    /// Texto corto del chip.
    static func chip(_ d: Int) -> String {
        switch d {
        case ..<0: return "vencido"
        case 0: return "hoy"
        case 1: return "mañana"
        default: return "\(d) días"
        }
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
