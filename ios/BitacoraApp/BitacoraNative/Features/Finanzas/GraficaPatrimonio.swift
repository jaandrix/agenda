import SwiftUI

// renderFinanzasGrafica(true): «tus cuentas.» o «patrimonio.», el rango, la cifra, cuánto ha cambiado en el periodo y la
// línea del saldo día a día con la raya de donde empezaste. Pasar el dedo cambia la cifra (financeGrafScrub). Los
// puntos se normalizan una vez al crear la vista, no en cada pintado.
// Bitácora 2.0: la cifra protagonista en la tarjeta negra, la variación en un chip, la línea en naranja que se dibuja al
// aparecer (y al cambiar de rango) y el rango en un segmento debajo.
struct GraficaPatrimonio: View {
    let g: GraficaFin
    let oculto: Bool
    @Binding var rango: String
    @Binding var extras: Bool
    @State private var tocado: Int?
    @State private var trazo: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    private let norm: [Double]

    init(g: GraficaFin, oculto: Bool, rango: Binding<String>, extras: Binding<Bool>) {
        self.g = g
        self.oculto = oculto
        _rango = rango
        _extras = extras
        let vals = g.serie.map(\.valor)
        let lo0 = vals.min() ?? 0, hi0 = vals.max() ?? 1
        let marg = (hi0 - lo0) * 0.14 != 0 ? (hi0 - lo0) * 0.14 : (abs(hi0) * 0.05 != 0 ? abs(hi0) * 0.05 : 1)
        let lo = lo0 - marg, hi = hi0 + marg
        norm = vals.map { ($0 - lo) / (hi - lo) }
    }

    private static let meses = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."]

    private func fechaCorta(_ iso: String) -> String {
        let p = iso.split(separator: "-")
        guard p.count == 3, let m = Int(p[1]), let d = Int(p[2]), (1...12).contains(m) else { return iso }
        return "\(d) \(Self.meses[m - 1])"
    }

    private var indice: Int? { tocado.map { min(max($0, 0), g.serie.count - 1) } }

    var body: some View {
        let i = indice
        let valor = i.map { g.serie[$0].valor } ?? g.total
        VStack(alignment: .leading, spacing: Medida.s) {
            TarjetaOscura {
                VStack(alignment: .leading, spacing: Medida.xs) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(g.titulo.uppercased()).font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.sobreOscuroSuave)
                            .accessibilityAddTraits(.isHeader)
                        Spacer(minLength: Medida.xs)
                        Text(g.sub).font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave).lineLimit(1)
                    }
                    Text(oculto ? "•••••" : FormatoFin.dinero(valor))
                        .font(Letra.numeroGrande).foregroundStyle(Lienzo.sobreOscuro)
                        .lineLimit(1).minimumScaleFactor(0.6)
                        .contentTransition(.numericText())
                        .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: valor)
                    if g.serie.count > 1 {
                        let base = g.serie[0].valor
                        let c = i.map { g.serie[$0].valor - base } ?? g.cambio
                        HStack(spacing: Medida.xs) {
                            ChipCifra(texto: CifraFin.texto(c, oculto: oculto, signo: true), signo: oculto || abs(c) < 0.005 ? 0 : (c > 0 ? 1 : -1), sobreOscuro: true)
                                .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: c)
                            Text(i.map { "hasta el \(fechaCorta(g.serie[$0].fecha))." } ?? g.periodo + ".")
                                .font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave).lineLimit(1)
                        }
                        if !oculto {
                            linea.frame(height: 150).padding(.top, Medida.s)
                                .accessibilityElement(children: .ignore)
                                .accessibilityLabel("Evolución del patrimonio \(g.periodo): de \(FormatoFin.dinero(base)) a \(FormatoFin.dinero(g.total)).")
                        }
                    } else {
                        Text("La gráfica empieza en cuanto apuntes o importes tu primer movimiento.")
                            .font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave)
                    }
                }
            }
            if g.rangos.count > 1 {
                SegmentoCapsula(opciones: g.rangos.map { SegmentoCapsula<String>.Opcion(valor: $0.key, titulo: $0.corto) },
                                elegido: Binding(get: { g.rango }, set: { rango = $0 }), sobreBlanco: false)
            }
            if g.tieneExtras {
                Button {
                    Haptica.ligera()
                    extras.toggle()
                } label: {
                    Text(g.extras ? "solo las cuentas." : "con inversión y emergencia.").font(Letra.pieFuerte).foregroundStyle(Lienzo.naranjaProfundo)
                        .frame(minHeight: Medida.toque).contentShape(Rectangle())
                }
                .buttonStyle(.pulsable(0.94))
                .padding(.horizontal, Medida.xxs)
                if g.extras { InversionDesdeView(actual: g.inversionDesde) }
            }
        }
        .onAppear { dibujar() }
        .onChange(of: g.rango) { _, _ in trazo = 0; dibujar() }
        .onChange(of: g.extras) { _, _ in trazo = 0; dibujar() }
    }

    private func dibujar() {
        withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento).delay(0.08)) { trazo = 1 }
    }

    private var linea: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height - 22
            let n = norm.count
            let x = { (i: Int) in CGFloat(i) / CGFloat(max(n - 1, 1)) * (w - 6) + 3 }
            let y = { (v: Double) in h - CGFloat(v) * h }
            ZStack(alignment: .topLeading) {
                // La raya de donde empezaste el periodo.
                if let v0 = norm.first {
                    Path { r in r.move(to: CGPoint(x: 0, y: y(v0))); r.addLine(to: CGPoint(x: w, y: y(v0))) }
                        .stroke(Lienzo.sobreOscuroTenue, style: StrokeStyle(lineWidth: 1, dash: [2, 4]))
                }
                AreaSerie(puntos: norm)
                    .fill(LinearGradient(colors: [Lienzo.naranja.opacity(0.22), Lienzo.naranja.opacity(0)], startPoint: .top, endPoint: .bottom))
                    .frame(width: w, height: h)
                    .opacity(Double(trazo))
                LineaSerie(puntos: norm)
                    .trim(from: 0, to: trazo)
                    .stroke(Lienzo.naranja, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    .frame(width: w, height: h)
                if let t = tocado, t >= 0, t < n {
                    Path { v in v.move(to: CGPoint(x: x(t), y: 0)); v.addLine(to: CGPoint(x: x(t), y: h)) }
                        .stroke(Lienzo.sobreOscuroTenue, lineWidth: 1)
                    Circle().fill(Lienzo.naranja)
                        .overlay(Circle().strokeBorder(Lienzo.oscuro, lineWidth: 2))
                        .frame(width: 10, height: 10)
                        .position(x: x(t), y: y(norm[t]))
                } else if trazo >= 1, n > 0 {
                    // El punto de hoy, al final de la línea.
                    Circle().fill(Lienzo.naranja).frame(width: 7, height: 7)
                        .position(x: x(n - 1), y: y(norm[n - 1]))
                        .transition(.scale.combined(with: .opacity))
                }
                HStack {
                    Text(fechaCorta(g.serie.first?.fecha ?? ""))
                    Spacer()
                    Text("hoy")
                }
                .font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroTenue)
                .frame(width: w).offset(y: h + 6)
            }
            .contentShape(Rectangle())
            .simultaneousGesture(DragGesture(minimumDistance: 0)
                .onChanged { v in
                    let i = Int(((v.location.x - 3) / max(w - 6, 1) * CGFloat(max(n - 1, 1))).rounded())
                    let nuevo = min(max(i, 0), n - 1)
                    if nuevo != tocado { Haptica.seleccion() }
                    tocado = nuevo
                }
                .onEnded { _ in withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { tocado = nil } })
        }
    }
}
