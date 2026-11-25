import SwiftUI
import UIKit

// Movimiento de Bitácora 2.0. Regla de oro (WWDC18 «Designing Fluid Interfaces», WWDC23 «Animate with springs»): en todo
// lo que toca el dedo, muelles interrumpibles; nunca .linear ni .easeInOut lentos. Solo se animan transformaciones
// (escala, desplazamiento, opacidad, brillo), no el layout de listas largas. Con «reducir movimiento», fundidos breves.
enum Muelle {
    /// Cambio de pestaña, de día, de filtro o de segmento.
    static let rapido = Animation.spring(duration: 0.28, bounce: 0.15)
    /// Compresión y rebote de un botón al tocarlo.
    static let toque = Animation.spring(response: 0.22, dampingFraction: 0.55)
    /// Al soltar un botón: vuelve con algo más de rebote que al hundirse.
    static let soltar = Animation.spring(response: 0.34, dampingFraction: 0.5)
    /// Abrir y cerrar el modal flotante.
    static let modal = Animation.spring(duration: 0.42, bounce: 0.22)
    /// Expandir una tarjeta (nota, evento) en su sitio.
    static let expandir = Animation.spring(duration: 0.36, bounce: 0.12)
    /// Entradas de contenido y cambios de tamaño sin rebote.
    static let suave = Animation.spring(duration: 0.45, bounce: 0)
    /// Lista que aparece: cada fila entra con este muelle y un retraso de `escalon * índice`.
    static let entrada = Animation.spring(duration: 0.5, bounce: 0.18)
    static let escalon: Double = 0.035

    /// El muelle pedido, o un fundido corto si el usuario ha pedido menos movimiento.
    static func o(_ a: Animation, reducido: Bool) -> Animation { reducido ? .easeOut(duration: 0.16) : a }
}

// Háptica centralizada. Los generadores se preparan una vez; las vistas SwiftUI pueden usar también .sensoryFeedback.
@MainActor
enum Haptica {
    private static let ligero = UIImpactFeedbackGenerator(style: .light)
    private static let medio = UIImpactFeedbackGenerator(style: .medium)
    private static let blando = UIImpactFeedbackGenerator(style: .soft)
    private static let rigido = UIImpactFeedbackGenerator(style: .rigid)
    private static let seleccionG = UISelectionFeedbackGenerator()
    private static let aviso = UINotificationFeedbackGenerator()

    /// Cambiar de día o de pestaña.
    static func ligera() { ligero.impactOccurred(intensity: 0.7) }
    /// Apoyar el dedo en el botón de apuntar.
    static func media(_ intensidad: CGFloat = 0.8) { medio.impactOccurred(intensity: intensidad) }
    /// Soltar un botón, cerrar el modal.
    static func suave() { blando.impactOccurred(intensity: 0.9) }
    /// Tope al arrastrar (llegar al límite del rubber-band).
    static func tope() { rigido.impactOccurred(intensity: 0.5) }
    /// Mover una selección (segmentos, ruedas).
    static func seleccion() { seleccionG.selectionChanged() }
    static func exito() { aviso.notificationOccurred(.success) }
    static func error() { aviso.notificationOccurred(.error) }

    static func preparar() { ligero.prepare(); medio.prepare(); blando.prepare() }
}

// Rubber-banding: resistencia creciente pasado un límite (fórmula de UIScrollView, c = 0.55).
enum Elastico {
    static func resistencia(_ desplazamiento: CGFloat, limite: CGFloat = 300, c: CGFloat = 0.55) -> CGFloat {
        let signo: CGFloat = desplazamiento < 0 ? -1 : 1
        let x = abs(desplazamiento)
        return signo * (1 - 1 / (x * c / limite + 1)) * limite
    }

    /// Dónde acabaría un gesto soltado con esa velocidad (proyección de WWDC18, deceleración normal).
    static func proyeccion(_ velocidad: CGFloat, deceleracion: CGFloat = 0.998) -> CGFloat {
        (velocidad / 1000) * deceleracion / (1 - deceleracion)
    }
}

// Entrada escalonada de una fila: sube 8 pt y aparece. `indice` ordena el escalón.
// 3.2 (rendimiento): a partir de la fila 12 ya no se anima (antes esperaban el último escalón). En una lista perezosa cada
// fila que vuelve a entrar al desplazarse se rehacía y volvía a fundirse; esas filas ya salen quietas.
struct EntradaEscalonada: ViewModifier {
    let indice: Int
    @State private var visible: Bool

    init(indice: Int) {
        self.indice = indice
        _visible = State(initialValue: indice >= Self.tope)
    }

    static let tope = 12
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    func body(content: Content) -> some View {
        content
            .opacity(visible ? 1 : 0)
            .offset(y: visible || sinMovimiento ? 0 : 8)
            .onAppear {
                guard !visible else { return }
                withAnimation(Muelle.o(Muelle.entrada, reducido: sinMovimiento).delay(Double(indice) * Muelle.escalon)) { visible = true }
            }
    }
}

extension View {
    func entradaEscalonada(_ indice: Int) -> some View { modifier(EntradaEscalonada(indice: indice)) }
}
