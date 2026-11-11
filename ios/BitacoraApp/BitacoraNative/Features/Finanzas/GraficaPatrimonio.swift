import SwiftUI

// renderFinanzasGrafica(true): «tus cuentas.» o «patrimonio.», el rango, la cifra, cuánto ha cambiado en el periodo y la
// línea del saldo día a día con la raya de donde empezaste. Pasar el dedo cambia la cifra (financeGrafScrub). Los
// puntos se normalizan una vez al crear la vista, no en cada pintado.
struct GraficaPatrimonio: View {
    let g: GraficaFin
    let oculto: Bool
    @Binding var rango: String
    @Binding var extras: Bool
    @State private var tocado: Int?
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

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(g.titulo).font(Tipo.poppins(17, .semibold, estilo: .headline)).foregroundStyle(Paleta.texto)
                    Text(g.sub).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                }
                Spacer()
            }
            HStack(spacing: 2) {
                ForEach(g.rangos) { r in
                    let on = r.key == g.rango
                    Button { rango = r.key } label: {
                        Text(r.corto).font(Tipo.poppins(13, on ? .semibold : .regular, estilo: .caption))
                            .foregroundStyle(on ? Paleta.texto : Paleta.textoSecundario)
                            .frame(maxWidth: .infinity, minHeight: 32)
                            .background(on ? Paleta.superficie : Color.clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(r.largo)
                    .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
                }
            }
            .padding(3)
            .background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            let i = tocado.map { min(max($0, 0), g.serie.count - 1) }
            let valor = i.map { g.serie[$0].valor } ?? g.total
            Text(oculto ? "•••••" : FormatoFin.dinero(valor))
                .font(Tipo.poppins(36, .bold, estilo: .largeTitle)).monospacedDigit().foregroundStyle(Paleta.texto)
                .lineLimit(1).minimumScaleFactor(0.6).padding(.top, 6)
                .contentTransition(.numericText())
            if g.serie.count > 1 {
                let base = g.serie[0].valor
                let c = i.map { g.serie[$0].valor - base } ?? g.cambio
                (Text(oculto ? "•••" : (c >= 0 ? "+" : "−") + FormatoFin.dinero(abs(c))).bold().foregroundColor(c < 0 ? Paleta.atencion : Paleta.texto)
                    + Text(i.map { " hasta el \(fechaCorta(g.serie[$0].fecha))." } ?? " \(g.periodo)."))
                    .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                if !oculto {
                    linea.frame(height: 190).padding(.top, 6)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("Evolución del patrimonio \(g.periodo): de \(FormatoFin.dinero(base)) a \(FormatoFin.dinero(g.total)).")
                }
            } else {
                Text("La gráfica empieza en cuanto apuntes o importes tu primer movimiento.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            }
            if g.tieneExtras {
                Button { extras.toggle() } label: {
                    Text(g.extras ? "solo las cuentas." : "con inversión y emergencia.").font(Tipo.poppins(14, .medium, estilo: .footnote))
                        .foregroundStyle(Paleta.acento).frame(minHeight: 40)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, Espacio.m)
    }

    private var linea: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height - 22
            let n = norm.count
            let x = { (i: Int) in CGFloat(i) / CGFloat(max(n - 1, 1)) * (w - 6) + 3 }
            let y = { (v: Double) in h - CGFloat(v) * h }
            ZStack(alignment: .topLeading) {
                Canvas { ctx, _ in
                    var l = Path()
                    for (i, v) in norm.enumerated() {
                        let p = CGPoint(x: x(i), y: y(v))
                        if i == 0 { l.move(to: p) } else { l.addLine(to: p) }
                    }
                    var a = l
                    a.addLine(to: CGPoint(x: x(n - 1), y: h)); a.addLine(to: CGPoint(x: x(0), y: h)); a.closeSubpath()
                    ctx.fill(a, with: .color(Paleta.tinteAcento))
                    // La raya de donde empezaste el periodo.
                    if let v0 = norm.first {
                        var r = Path(); r.move(to: CGPoint(x: 0, y: y(v0))); r.addLine(to: CGPoint(x: w, y: y(v0)))
                        ctx.stroke(r, with: .color(Paleta.bordeFuerte), style: StrokeStyle(lineWidth: 1, dash: [3, 4]))
                    }
                    ctx.stroke(l, with: .color(Paleta.acento), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    if let t = tocado, t >= 0, t < n {
                        var v = Path(); v.move(to: CGPoint(x: x(t), y: 0)); v.addLine(to: CGPoint(x: x(t), y: h))
                        ctx.stroke(v, with: .color(Paleta.bordeFuerte), lineWidth: 1)
                        ctx.fill(Path(ellipseIn: CGRect(x: x(t) - 4, y: y(norm[t]) - 4, width: 8, height: 8)), with: .color(Paleta.acento))
                    }
                }
                HStack {
                    Text(fechaCorta(g.serie.first?.fecha ?? ""))
                    Spacer()
                    Text("hoy")
                }
                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                .frame(width: w).offset(y: h + 6)
            }
            .contentShape(Rectangle())
            .simultaneousGesture(DragGesture(minimumDistance: 0)
                .onChanged { v in
                    let i = Int(((v.location.x - 3) / max(w - 6, 1) * CGFloat(max(n - 1, 1))).rounded())
                    tocado = min(max(i, 0), n - 1)
                }
                .onEnded { _ in tocado = nil })
        }
    }
}
