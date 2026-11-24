import SwiftUI

// Letra de los números del mes. Pendiente de subir a `Letra` (DesignSystem/V2): la semana flotante usa el mismo tamaño.
enum LetraCalendario {
    static func numero(_ fuerte: Bool) -> Font { Tipo.poppins(15, fuerte ? .semibold : .regular, estilo: .headline).monospacedDigit() }
}

// El mes entero en la tarjeta semi flotante, con el mismo lenguaje que `SemanaFlotante`: placa gris para el día elegido
// que se desliza de un día a otro, hoy en naranja y hasta tres puntitos por día. Se pasa de mes deslizando (paginado
// nativo, conserva la inercia del dedo) o con las flechas; la altura sigue a las semanas del mes con un muelle.
struct MesFlotanteCalendario: View {
    let hoy: LocalDay
    let elegido: LocalDay
    /// El mes que se ve. Cambia al deslizar; quien lo usa decide qué día queda elegido.
    @Binding var mes: YearMonth
    /// Los colores de los puntitos de un día (se pintan tres como mucho). Debe ser barato: se llama al pintar.
    let puntos: (LocalDay) -> [Color]
    let elegir: (LocalDay) -> Void
    /// Meses navegables a cada lado de hoy.
    var alcance = 36
    /// Lo que va a la derecha del mes (el paso a la semana).
    var accesorio: AnyView?

    @State private var visible: YearMonth?
    @Namespace private var espacio
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    static let altoDia: CGFloat = 46
    static let entreFilas: CGFloat = 2
    private static let iniciales = ["L", "M", "X", "J", "V", "S", "D"]
    static let meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
                        "octubre", "noviembre", "diciembre"]

    private var paginas: [YearMonth] { (-alcance...alcance).map { Self.mover(hoy.yearMonth, $0) } }
    private var mesVisible: YearMonth { visible ?? mes }

    var body: some View {
        VStack(spacing: Medida.xs) {
            cabecera
            HStack(spacing: Self.entreFilas) {
                ForEach(Self.iniciales, id: \.self) { l in
                    Text(l).font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.tintaTerciaria)
                        .frame(maxWidth: .infinity)
                }
            }
            .accessibilityHidden(true)
            ScrollView(.horizontal) {
                LazyHStack(spacing: 0) {
                    ForEach(paginas, id: \.self) { m in
                        pagina(m).containerRelativeFrame(.horizontal)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $visible)
            .scrollIndicators(.hidden)
            .frame(height: Self.alto(Self.filas(mesVisible)))
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: Self.filas(mesVisible))
        }
        .padding(.top, Medida.xs)
        .padding(.bottom, Medida.xs)
        .padding(.horizontal, 6)
        .background(Lienzo.tarjeta, in: RoundedRectangle(cornerRadius: Medida.radioTarjeta + 2, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Medida.radioTarjeta + 2, style: .continuous).strokeBorder(Lienzo.filo))
        .sombra(.flotante)
        .onAppear { visible = mes }
        .onChange(of: visible) { _, v in if let v, v != mes { mes = v } }
        .onChange(of: mes) { _, m in
            if m != visible { withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { visible = m } }
        }
        .sensoryFeedback(.selection, trigger: visible)
        .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: elegido)
    }

    private var fueraDeHoy: Bool { elegido != hoy || mesVisible != hoy.yearMonth }

    private var cabecera: some View {
        HStack(spacing: Medida.xxs) {
            Text(titulo(mesVisible))
                .font(Letra.seccion).foregroundStyle(Lienzo.tinta)
                .contentTransition(.numericText())
                .animation(Muelle.rapido, value: mesVisible)
                .padding(.leading, 10)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: Medida.xxs)
            if fueraDeHoy {
                Button {
                    elegir(hoy)
                    withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { visible = hoy.yearMonth }
                } label: { Chip(texto: "hoy", tono: .naranja).frame(minHeight: Medida.toque) }
                .buttonStyle(.pulsable(0.9))
                .transition(.scale(scale: 0.7).combined(with: .opacity))
                .accessibilityLabel("volver a hoy")
            }
            BotonRedondo(sistema: "chevron.left", tono: .sutil, tamano: 30, etiqueta: "mes anterior") { pasar(-1) }
            BotonRedondo(sistema: "chevron.right", tono: .sutil, tamano: 30, etiqueta: "mes siguiente") { pasar(1) }
            if let accesorio { accesorio }
        }
        .padding(.trailing, Medida.xxs)
        .animation(Muelle.rapido, value: fueraDeHoy)
    }

    private func pasar(_ n: Int) {
        let destino = Self.mover(mesVisible, n)
        guard paginas.contains(destino) else { Haptica.tope(); return }
        withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { visible = destino }
    }

    private func pagina(_ m: YearMonth) -> some View {
        let primero = LocalDay(year: m.year, month: m.month, day: 1)!
        let hueco = primero.indiceSemanaLunes
        let total = Self.diasDe(m)
        return VStack(spacing: Self.entreFilas) {
            ForEach(0..<Self.filas(m), id: \.self) { f in
                HStack(spacing: Self.entreFilas) {
                    ForEach(0..<7, id: \.self) { i in
                        let n = f * 7 + i - hueco
                        if n >= 0 && n < total {
                            dia(primero.sumando(dias: n))
                        } else {
                            Color.clear.frame(maxWidth: .infinity).frame(height: Self.altoDia)
                        }
                    }
                }
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }

    private func dia(_ d: LocalDay) -> some View {
        let on = d == elegido
        let esHoy = d == hoy
        let colores = Array(puntos(d).prefix(3))
        return Button {
            guard d != elegido else { return }
            Haptica.ligera()
            elegir(d)
        } label: {
            VStack(spacing: 4) {
                Text("\(d.day)")
                    .font(LetraCalendario.numero(on || esHoy))
                    .foregroundStyle(esHoy ? Lienzo.naranjaProfundo : (d < hoy && !on ? Lienzo.tintaSecundaria : Lienzo.tinta))
                HStack(spacing: 3) {
                    ForEach(Array(colores.enumerated()), id: \.offset) { _, c in Puntito(color: c, tamano: 4.5) }
                }
                .frame(height: 5)
            }
            .frame(maxWidth: .infinity)
            .frame(height: Self.altoDia)
            .background {
                if on {
                    RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous)
                        .fill(Lienzo.sutil)
                        .matchedGeometryEffect(id: "elegido", in: espacio)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(Pulsable(escala: 0.9, haptica: false))
        .accessibilityLabel("\(d.day) de \(Self.meses[d.month - 1])\(esHoy ? ", hoy" : "")")
        .accessibilityValue(colores.isEmpty ? "sin nada" : "con cosas")
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func titulo(_ m: YearMonth) -> String {
        let nombre = Self.meses[m.month - 1]
        return m.year == hoy.year ? nombre : "\(nombre) \(m.year)"
    }

    // MARK: - Cuentas de calendario (días civiles, sin horas)

    static func mover(_ m: YearMonth, _ n: Int) -> YearMonth {
        var y = m.year, mm = m.month + n
        while mm < 1 { mm += 12; y -= 1 }
        while mm > 12 { mm -= 12; y += 1 }
        return YearMonth(year: y, month: mm)!
    }

    static func diasDe(_ m: YearMonth) -> Int {
        var n = 28
        while LocalDay(year: m.year, month: m.month, day: n + 1) != nil { n += 1 }
        return n
    }

    static func filas(_ m: YearMonth) -> Int {
        let hueco = LocalDay(year: m.year, month: m.month, day: 1)!.indiceSemanaLunes
        return (hueco + diasDe(m) + 6) / 7
    }

    static func alto(_ filas: Int) -> CGFloat { CGFloat(filas) * altoDia + CGFloat(max(filas - 1, 0)) * entreFilas }
}
