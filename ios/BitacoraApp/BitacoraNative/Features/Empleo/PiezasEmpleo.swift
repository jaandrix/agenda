import SwiftUI

// Piezas de Empleo 2.0 que aún no están en DesignSystem/V2 (candidatas a subir): la línea de tiempo del horario
// semanal, el formulario sobre el lienzo y el botón principal pegado abajo de las hojas.

// Textos de fechas y horas del apartado.
enum TextoEmpleo {
    /// Día de la semana como en la web (0 = domingo … 6 = sábado), que es la clave de `agendaLaboral.horario`.
    static func diaSemana(_ iso: String) -> Int? { LocalDay(iso: iso).map { ($0.indiceSemanaLunes + 1) % 7 } }

    static func minutosAhora(_ d: Date) -> Int {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = CalendarioBitacora.madrid.zona
        let h = cal.dateComponents([.hour, .minute], from: d)
        return (h.hour ?? 0) * 60 + (h.minute ?? 0)
    }

    /// «marzo de 2025».
    static func mesAnio(_ iso: String) -> String {
        guard let f = LecturaEmpleo.fecha(iso) else { return "" }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "es_ES"); fmt.timeZone = CalendarioBitacora.madrid.zona; fmt.dateFormat = "MMMM 'de' yyyy"
        return fmt.string(from: f)
    }

    /// «hoy», «mañana», «ayer» o «jueves 3 de diciembre».
    static func cuando(_ iso: String, hoy: String) -> String {
        guard let d = LocalDay(iso: iso), let h = LocalDay(iso: hoy) else { return LecturaViajes.fechaLarga(iso) }
        switch h.dias(hasta: d) {
        case 0: return "hoy"
        case 1: return "mañana"
        case -1: return "ayer"
        default: return LecturaViajes.fechaLarga(iso)
        }
    }

    static func dias(_ n: Int) -> String { n == 1 ? "1 día" : "\(n) días" }
}

/// El horario de la semana como línea de tiempo: un renglón por día, la hora real en horizontal (de la primera entrada a
/// la última salida, redondeado a horas) y una barra por jornada. Hoy en carbón con la marca de ahora en naranja; los
/// turnos que pasan de medianoche se alargan hasta el día siguiente.
struct LineaSemanaEmpleo: View {
    let horario: [Int: (String, String)]
    /// Hoy, 0 = domingo.
    let hoy: Int
    /// Minutos desde las 0:00 de ahora, para la marca de hoy.
    var ahora: Int?

    private static let orden = [1, 2, 3, 4, 5, 6, 0]
    private static let abreviaturas = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]
    private static let anchoDia: CGFloat = 30
    private static let anchoHoras: CGFloat = 86
    private static let grosor: CGFloat = 6
    private static let marca: CGFloat = 9

    static func minutos(_ t: String) -> Int? {
        let p = t.split(separator: ":").compactMap { Int($0) }
        guard p.count >= 2 else { return nil }
        return p[0] * 60 + p[1]
    }

    static func tramo(_ h: (String, String)) -> (Int, Int)? {
        guard let a = minutos(h.0), let b = minutos(h.1) else { return nil }
        return (a, b > a ? b : b + 24 * 60)
    }

    private var rango: (Int, Int) {
        let t = horario.values.compactMap { Self.tramo($0) }
        guard let a = t.map(\.0).min(), let b = t.map(\.1).max(), b > a else { return (9 * 60, 17 * 60) }
        return ((a / 60) * 60, ((b + 59) / 60) * 60)
    }

    var body: some View {
        let r = rango
        VStack(spacing: Medida.xxs) {
            ForEach(Self.orden, id: \.self) { d in fila(d, rango: r) }
            HStack(spacing: Medida.s) {
                Color.clear.frame(width: Self.anchoDia, height: 1)
                HStack {
                    Text(Self.hora(r.0))
                    Spacer()
                    Text(Self.hora(r.1))
                }
                .font(Letra.pie).monospacedDigit().foregroundStyle(Lienzo.tintaTerciaria)
                Color.clear.frame(width: Self.anchoHoras, height: 1)
            }
            .accessibilityHidden(true)
        }
    }

    private static func hora(_ m: Int) -> String { String(format: "%02d:00", (m / 60) % 24) }

    private func fila(_ d: Int, rango r: (Int, Int)) -> some View {
        let esHoy = d == hoy
        let t = horario[d].flatMap { Self.tramo($0) }
        let total = CGFloat(max(r.1 - r.0, 1))
        return HStack(spacing: Medida.s) {
            Text(Self.abreviaturas[d])
                .font(Letra.pieFuerte)
                .foregroundStyle(esHoy ? Lienzo.naranjaProfundo : Lienzo.tintaSecundaria)
                .frame(width: Self.anchoDia, alignment: .leading)
            GeometryReader { g in
                let ancho = g.size.width
                ZStack(alignment: .leading) {
                    Capsule().fill(Lienzo.sutilSuave).frame(height: Self.grosor)
                    if let t {
                        Capsule().fill(esHoy ? Lienzo.oscuro : Lienzo.tintaTerciaria)
                            .frame(width: max(Self.grosor, ancho * CGFloat(t.1 - t.0) / total), height: Self.grosor)
                            .offset(x: ancho * CGFloat(t.0 - r.0) / total)
                    }
                    if esHoy, let ahora, ahora >= r.0, ahora <= r.1 {
                        Circle().fill(Lienzo.naranja)
                            .overlay(Circle().strokeBorder(Lienzo.tarjeta, lineWidth: 2))
                            .frame(width: Self.marca, height: Self.marca)
                            .offset(x: ancho * CGFloat(ahora - r.0) / total - Self.marca / 2)
                    }
                }
                .frame(maxHeight: .infinity)
            }
            .frame(height: 22)
            Text(horario[d].map { "\($0.0)–\($0.1)" } ?? "libre.")
                .font(Letra.hora)
                .foregroundStyle(t == nil ? Lienzo.tintaTerciaria : (esHoy ? Lienzo.tinta : Lienzo.tintaSecundaria))
                .frame(width: Self.anchoHoras, alignment: .trailing)
        }
        .frame(minHeight: 28)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(LecturaEmpleo.dias[d] + (horario[d].map { ", de \($0.0) a \($0.1)" } ?? ", libre") + (esHoy ? ", hoy" : ""))
    }
}

/// Formulario de las hojas de Empleo sobre el lienzo: filas en tarjeta blanca, filetes casi invisibles y letra de la casa.
struct FormEmpleo<Contenido: View>: View {
    @ViewBuilder var contenido: () -> Contenido

    var body: some View {
        Form {
            Group { contenido() }
                .listRowBackground(Lienzo.tarjeta)
                .listRowSeparatorTint(Lienzo.filo)
        }
        .scrollContentBackground(.hidden)
        .fondoLienzo()
        .tint(Lienzo.oscuro)
        .textCase(nil)
        .font(Letra.cuerpo)
        .foregroundStyle(Lienzo.tinta)
        .environment(\.locale, Locale(identifier: "es_ES"))
    }
}

/// Cabecera de sección de un formulario: etiqueta pequeña en mayúsculas.
struct CabeceraFormEmpleo: View {
    let texto: String
    var body: some View {
        Text(texto.uppercased()).font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.tintaTerciaria)
    }
}

extension View {
    /// La acción principal de una hoja: cápsula negra a todo lo ancho, pegada abajo sobre el lienzo.
    func botonPrincipalEmpleo(_ titulo: String, activo: Bool = true, accion: @escaping () -> Void) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            Button(titulo, action: accion)
                .buttonStyle(.capsula(.oscuro, ancho: true))
                .disabled(!activo)
                .padding(.horizontal, Medida.margen)
                .padding(.vertical, Medida.xs)
                .background(Lienzo.fondo)
        }
    }

    /// Pie de una sección de formulario.
    func pieFormEmpleo() -> some View { font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) }
}
