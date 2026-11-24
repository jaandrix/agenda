import SwiftUI

// Resumen: los gastos de un mes por categoría (gastosMes en finanzas-puente.js), de más a menos, cada una con su icono,
// su total, una barra y lo que cambió desde el mes anterior. Sin lo neutro (ahorro, ajustes, inversión) ni traspasos.
struct GastosMes: Decodable, Equatable {
    struct Cat: Decodable, Equatable, Identifiable { let id, nombre, icono, color: String; let total, anterior: Double; let n: Int }
    let mes, titulo, anteriorNombre, mesAnterior, mesSiguiente: String
    let total, totalAnterior: Double
    let categorias: [Cat]
}

struct GastosPorCategoriaView: View {
    @Environment(AppCoordinator.self) private var c
    let oculto: Bool
    @State private var mes = ""
    @State private var m: GastosMes?
    @State private var todas = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    private func din(_ v: Double) -> String { oculto ? "•••" : FormatoFin.dinero(v) }

    var body: some View {
        TarjetaSeccion(titulo: "gastos por categoría.") {
            VStack(alignment: .leading, spacing: Medida.s) {
                if let m {
                    HStack(spacing: Medida.xs) {
                        flecha("chevron.left", m.mesAnterior, "mes anterior")
                        Spacer(minLength: 0)
                        VStack(spacing: 2) {
                            Text(m.titulo.lowercased() + ".").font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta)
                                .contentTransition(.opacity)
                            Text(din(m.total) + comparacion(m.total, m.totalAnterior, m.anteriorNombre)).font(Letra.pie).monospacedDigit()
                                .foregroundStyle(Lienzo.tintaSecundaria).multilineTextAlignment(.center)
                        }
                        Spacer(minLength: 0)
                        flecha("chevron.right", m.mesSiguiente, "mes siguiente")
                    }
                    if m.categorias.isEmpty {
                        EstadoVacio(texto: "Sin gastos este mes.")
                    } else {
                        let tope = m.categorias.first?.total ?? 1
                        let visibles = todas ? m.categorias : Array(m.categorias.prefix(6))
                        VStack(spacing: 0) {
                            ForEach(Array(visibles.enumerated()), id: \.element.id) { i, x in
                                if i > 0 { SeparadorFila() }
                                fila(x, tope: tope, primera: i == 0, mesAnterior: m.anteriorNombre)
                            }
                        }
                        if m.categorias.count > 6 {
                            Button(todas ? "ver menos." : "ver las \(m.categorias.count).") {
                                withAnimation(Muelle.o(Muelle.expandir, reducido: sinMovimiento)) { todas.toggle() }
                            }
                            .buttonStyle(.capsula(.claro, ancho: true))
                        }
                    }
                } else {
                    ProgressView().tint(Lienzo.tintaTerciaria).frame(maxWidth: .infinity).padding(.vertical, Medida.l)
                }
            }
        }
        .task(id: "\(c.revision)|\(mes)") { await cargar() }
    }

    private func flecha(_ icono: String, _ destino: String, _ etiqueta: String) -> some View {
        BotonRedondo(sistema: icono, tono: .sutil, tamano: 32, etiqueta: etiqueta) {
            Haptica.ligera()
            mes = destino
        }
        .disabled(destino.isEmpty)
    }

    private func comparacion(_ v: Double, _ antes: Double, _ nombre: String) -> String {
        guard !oculto, antes > 0 else { return "" }
        let d = v - antes
        if abs(d) < 0.005 { return ", igual que en \(nombre)" }
        return ", \(d > 0 ? "+" : "−")\(FormatoFin.dinero(abs(d))) que en \(nombre)"
    }

    // La categoría que más gasta va en naranja; las demás, en gris: la barra compara, el color no distrae.
    private func fila(_ x: GastosMes.Cat, tope: Double, primera: Bool, mesAnterior: String) -> some View {
        HStack(alignment: .center, spacing: Medida.s) {
            IconoCategoria(icono: x.icono, color: x.color, tam: Medida.icono)
            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline) {
                    Text(x.nombre).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).lineLimit(1)
                    Spacer(minLength: 6)
                    Text(din(x.total)).font(Letra.numero).foregroundStyle(Lienzo.tinta)
                }
                BarraCapsula(valor: tope > 0 ? max(0.02, x.total / tope) : 0, color: primera ? Lienzo.naranja : Lienzo.tintaTerciaria, alto: 5)
                Text(detalle(x, mesAnterior)).font(Letra.pie).foregroundStyle(cambioColor(x)).lineLimit(1)
            }
        }
        .padding(.vertical, Medida.s)
        .accessibilityElement(children: .combine)
    }

    private func detalle(_ x: GastosMes.Cat, _ nombre: String) -> String {
        let mov = "\(x.n) \(x.n == 1 ? "movimiento" : "movimientos")"
        guard !oculto else { return mov }
        if x.anterior <= 0 { return mov + ", nada en \(nombre)" }
        let pct = (x.total - x.anterior) / x.anterior * 100
        return mov + ", " + FormatoFin.pct(pct) + " que en \(nombre)"
    }

    // Gastar más que el mes anterior se marca; gastar menos, en verde.
    private func cambioColor(_ x: GastosMes.Cat) -> Color {
        guard !oculto, x.anterior > 0 else { return Lienzo.tintaSecundaria }
        return x.total > x.anterior * 1.1 ? Lienzo.negativo : x.total < x.anterior * 0.9 ? Lienzo.positivo : Lienzo.tintaSecundaria
    }

    private func cargar() async {
        guard let motor = try? await motorListo(c), let r = try? await motor.llamar("gastosMes", [mes], como: GastosMes.self) else { return }
        m = r
    }
}
