import SwiftUI

// Piezas propias de Rutinas. AnilloProgreso vive ya en DesignSystem/V2.

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
