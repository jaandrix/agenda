import SwiftUI

// Piezas propias de Rutinas 2.0. Candidatas a subir a DesignSystem/V2 si otro apartado las necesita (ver el informe).

/// Anillo fino de progreso: pista gris y arco naranja que se llena con el muelle de quien cambie `progreso`.
/// `celebrar` (un contador) lanza un pulso y una onda que se abre y se apaga, sin confeti.
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

/// Siete puntitos de lunes a domingo: hechos en el verde de rutina, pendientes en gris, los días que no tocan más
/// tenues, y hoy con un aro naranja. Al marcar, el de hoy late una vez.
struct PuntosSemana: View {
    let dias: [DiaRutina]
    private let tamano: CGFloat = 6
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        HStack(spacing: 5) {
            ForEach(dias) { d in
                Puntito(color: color(d), tamano: tamano)
                    .phaseAnimator([false, true], trigger: d.hecho) { p, fase in
                        p.scaleEffect(fase && d.esHoy && !sinMovimiento ? 1.6 : 1)
                    } animation: { fase in fase ? Muelle.toque : Muelle.soltar }
                    .frame(width: tamano + 5, height: tamano + 5)
                    .overlay { if d.esHoy { Circle().strokeBorder(Lienzo.naranja, lineWidth: 1.2) } }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(dias.filter(\.hecho).count) días hechos esta semana")
    }

    private func color(_ d: DiaRutina) -> Color {
        if d.hecho { return Lienzo.Punto.rutina }
        return d.toca ? Lienzo.sutil : Lienzo.sutilSuave
    }
}
