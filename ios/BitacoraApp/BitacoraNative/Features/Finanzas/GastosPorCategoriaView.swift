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

    private func din(_ v: Double) -> String { oculto ? "•••" : FormatoFin.dinero(v) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("gastos por categoría.").font(Tipo.poppins(17, .semibold, estilo: .headline)).foregroundStyle(Paleta.texto).accessibilityAddTraits(.isHeader)
                Spacer()
            }
            if let m {
                HStack {
                    flecha("chevron.left", m.mesAnterior, "mes anterior")
                    Spacer()
                    VStack(spacing: 2) {
                        Text(m.titulo.lowercased() + ".").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto)
                        Text(din(m.total) + comparacion(m.total, m.totalAnterior, m.anteriorNombre)).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    }
                    Spacer()
                    flecha("chevron.right", m.mesSiguiente, "mes siguiente")
                }
                if m.categorias.isEmpty {
                    Text("Sin gastos este mes.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                } else {
                    let tope = m.categorias.first?.total ?? 1
                    ForEach(todas ? m.categorias : Array(m.categorias.prefix(6))) { x in fila(x, tope: tope, mesAnterior: m.anteriorNombre) }
                    if m.categorias.count > 6 {
                        Button(todas ? "ver menos." : "ver las \(m.categorias.count).") { todas.toggle() }
                            .font(Tipo.pie).foregroundStyle(Paleta.acento).buttonStyle(.plain)
                    }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.top, Espacio.m)
        .task(id: "\(c.informe.revision)|\(mes)") { await cargar() }
    }

    private func flecha(_ icono: String, _ destino: String, _ etiqueta: String) -> some View {
        Button { mes = destino } label: {
            Image(systemName: icono).font(.system(size: 14, weight: .semibold)).frame(width: 44, height: 36)
        }
        .buttonStyle(.plain)
        .foregroundStyle(destino.isEmpty ? Paleta.borde : Paleta.texto)
        .disabled(destino.isEmpty)
        .accessibilityLabel(etiqueta)
    }

    private func comparacion(_ v: Double, _ antes: Double, _ nombre: String) -> String {
        guard !oculto, antes > 0 else { return "" }
        let d = v - antes
        if abs(d) < 0.005 { return ", igual que en \(nombre)" }
        return ", \(d > 0 ? "+" : "−")\(FormatoFin.dinero(abs(d))) que en \(nombre)"
    }

    private func fila(_ x: GastosMes.Cat, tope: Double, mesAnterior: String) -> some View {
        HStack(alignment: .center, spacing: Espacio.s) {
            IconoCategoria(icono: x.icono, color: x.color, tam: 30)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(x.nombre).font(Tipo.cuerpo).foregroundStyle(Paleta.texto).lineLimit(1)
                    Spacer(minLength: 6)
                    Text(din(x.total)).font(Tipo.poppins(15, .semibold, estilo: .body)).monospacedDigit().foregroundStyle(Paleta.texto)
                }
                BarraAvance(valor: tope > 0 ? max(0.02, x.total / tope) : 0, fondo: Paleta.borde, color: x.color.isEmpty ? Paleta.textoSecundario : Color(hexWeb: x.color), alto: 5)
                Text(detalle(x, mesAnterior)).font(Tipo.pie).foregroundStyle(cambioColor(x)).lineLimit(1)
            }
        }
        .padding(.vertical, 4)
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
        guard !oculto, x.anterior > 0 else { return Paleta.textoSecundario }
        return x.total > x.anterior * 1.1 ? Paleta.atencion : x.total < x.anterior * 0.9 ? Paleta.progreso : Paleta.textoSecundario
    }

    private func cargar() async {
        guard let motor = try? await motorListo(c), let r = try? await motor.llamar("gastosMes", [mes], como: GastosMes.self) else { return }
        m = r
    }
}
