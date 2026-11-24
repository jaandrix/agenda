import SwiftUI

// Indicadores comunes de Bitácora 3.0: barras y anillos de avance, cifras con su variación, prioridad, iniciales y las
// formas de una serie. Antes vivían sueltos en Finanzas, Estudios, Rutinas y Plan.

/// Barra fina de avance en cápsula que crece con un muelle al aparecer; `falta` pinta un tramo pálido a continuación.
struct BarraFina: View {
    let valor: Double
    var color: Color = Lienzo.naranja
    var fondo: Color = Lienzo.sutil
    var alto: CGFloat = Medida.barra
    var falta: Double = 0
    @State private var visto = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        GeometryReader { g in
            let v = min(max(valor, 0), 1)
            let f = min(max(falta, 0), 1 - v)
            ZStack(alignment: .leading) {
                Capsule().fill(fondo)
                if f > 0 {
                    Capsule().fill(color.opacity(0.28)).frame(width: g.size.width * (v + f) * (visto ? 1 : 0))
                }
                Capsule().fill(color).frame(width: max(v > 0 ? alto : 0, g.size.width * v * (visto ? 1 : 0)))
            }
        }
        .frame(height: alto)
        .onAppear { withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento).delay(0.05)) { visto = true } }
        .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: valor)
        .accessibilityHidden(true)
    }
}

/// Anillo fino de progreso: pista gris y arco naranja. `celebrar` (un contador) lanza un pulso y una onda, sin confeti.
struct AnilloProgreso: View {
    let progreso: Double
    var tamano: CGFloat = 44
    var grosor: CGFloat = 3
    var celebrar = 0
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    private enum Onda: CaseIterable { case reposo, aparece, fuera }

    var body: some View {
        ZStack {
            Circle().stroke(Lienzo.sutil, lineWidth: grosor)
            Circle()
                .trim(from: 0, to: min(max(progreso, 0), 1))
                .stroke(Lienzo.naranja, style: StrokeStyle(lineWidth: grosor, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: tamano, height: tamano)
        .phaseAnimator([false, true], trigger: celebrar) { anillo, fase in
            anillo.scaleEffect(fase && !sinMovimiento ? 1.1 : 1)
        } animation: { fase in fase ? Muelle.toque : Muelle.soltar }
        .background {
            if !sinMovimiento {
                Circle()
                    .strokeBorder(Lienzo.naranja, lineWidth: grosor * 0.7)
                    .phaseAnimator(Onda.allCases, trigger: celebrar) { onda, fase in
                        onda.scaleEffect(fase == .fuera ? 1.7 : 1).opacity(fase == .aparece ? 0.5 : 0)
                    } animation: { fase in fase == .fuera ? Muelle.suave : Muelle.rapido }
            }
        }
        .animation(Muelle.o(Muelle.expandir, reducido: sinMovimiento), value: progreso)
        .accessibilityHidden(true)
    }
}

/// Variación en cápsula: verde si sube, roja si baja, gris si no cambia. `sobreOscuro` para la tarjeta negra.
struct ChipCifra: View {
    let texto: String
    let signo: Int           // 1 sube, -1 baja, 0 igual
    var sobreOscuro = false

    var body: some View {
        HStack(spacing: 3) {
            if signo != 0 {
                Image(systemName: signo > 0 ? "arrow.up.right" : "arrow.down.right").font(.system(size: 9, weight: .heavy))
            }
            Text(texto).font(Letra.pieFuerte).monospacedDigit().lineLimit(1)
        }
        .padding(.horizontal, 10).frame(height: 24)
        .foregroundStyle(tinta)
        .background(fondo, in: Capsule())
        .contentTransition(.numericText())
    }

    private var tinta: Color {
        signo > 0 ? Lienzo.positivo : signo < 0 ? Lienzo.negativo : (sobreOscuro ? Lienzo.sobreOscuroSuave : Lienzo.tintaSecundaria)
    }
    private var fondo: Color {
        if sobreOscuro { return Color.white.opacity(0.1) }
        return signo > 0 ? Lienzo.positivo.opacity(0.12) : signo < 0 ? Lienzo.negativo.opacity(0.1) : Lienzo.sutil
    }
}

/// Cifra grande (saldo, gasto del mes, cuenta atrás) con su etiqueta pequeña encima y, si hay, la variación debajo.
struct CifraGrande: View {
    let texto: String
    var etiqueta: String?
    var punto: Color?
    var tono: Color?
    var variacion: (texto: String, signo: Int)?
    var sobreOscuro = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let etiqueta {
                HStack(spacing: 5) {
                    if let punto { Puntito(color: punto, tamano: 6) }
                    Text(etiqueta).font(Letra.pie).foregroundStyle(sobreOscuro ? Lienzo.sobreOscuroSuave : Lienzo.tintaSecundaria)
                }
            }
            Text(texto).font(Letra.numeroGrande)
                .foregroundStyle(tono ?? (sobreOscuro ? Lienzo.sobreOscuro : Lienzo.tinta))
                .lineLimit(1).minimumScaleFactor(0.7)
                .contentTransition(.numericText())
            if let variacion {
                ChipCifra(texto: variacion.texto, signo: variacion.signo, sobreOscuro: sobreOscuro).padding(.top, Medida.xxs)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Prioridad discreta: un puntito (alta naranja, media ámbar, baja gris).
struct MarcaPrioridad: View {
    let prioridad: String

    var body: some View {
        Puntito(color: color, tamano: 6)
            .frame(width: 12, height: 12)
    }

    private var color: Color {
        switch prioridad {
        case "alta": Lienzo.naranja
        case "media": Lienzo.aviso
        default: Lienzo.tintaTerciaria
        }
    }
}

/// Squircle con una inicial, para lo que no tiene icono del catálogo (asignaturas, personas). `oscuro` lo destaca.
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

/// Línea de una serie normalizada (0…1) para animarla con `.trim`. `margenX` deja sitio al punto del extremo.
struct LineaSerie: Shape {
    let puntos: [Double]
    var margenX: CGFloat = 3

    func path(in r: CGRect) -> Path {
        var p = Path()
        let n = puntos.count
        guard n > 0 else { return p }
        for (i, v) in puntos.enumerated() {
            let x = CGFloat(i) / CGFloat(max(n - 1, 1)) * (r.width - margenX * 2) + margenX
            let y = r.height - CGFloat(v) * r.height
            if i == 0 { p.move(to: CGPoint(x: x, y: y)) } else { p.addLine(to: CGPoint(x: x, y: y)) }
        }
        return p
    }
}

/// El área bajo una LineaSerie, para un relleno muy tenue.
struct AreaSerie: Shape {
    let puntos: [Double]
    var margenX: CGFloat = 3

    func path(in r: CGRect) -> Path {
        var p = LineaSerie(puntos: puntos, margenX: margenX).path(in: r)
        guard !puntos.isEmpty else { return p }
        p.addLine(to: CGPoint(x: r.width - margenX, y: r.height))
        p.addLine(to: CGPoint(x: margenX, y: r.height))
        p.closeSubpath()
        return p
    }
}
