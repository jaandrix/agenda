import SwiftUI
import UIKit

// 0.24 (auditoría B10): los editores en hoja se cerraban al bajarlos con el dedo y se perdía lo escrito. Con cambios
// (el borrador distinto del original) la hoja no se deja bajar y el intento pregunta, igual que «cancelar.».
// SwiftUI no avisa del intento: GestoCerrarHoja se pone delante del delegado de la presentación solo para
// presentationControllerDidAttemptToDismiss y pasa todo lo demás al de SwiftUI. Si no lo encuentra, la hoja
// sigue sin poder bajarse (no se pierde nada; solo falta la pregunta).
struct PreguntarAlDescartar: ViewModifier {
    let cambiado: Bool
    @Binding var preguntar: Bool
    let cerrar: () -> Void

    func body(content: Content) -> some View {
        content
            .interactiveDismissDisabled(cambiado)
            .background(GestoCerrarHoja(activo: cambiado) { preguntar = true }.frame(width: 0, height: 0))
            .confirmationDialog("¿descartar los cambios?", isPresented: $preguntar, titleVisibility: .visible) {
                Button("descartar.", role: .destructive) { cerrar() }
                Button("seguir editando.", role: .cancel) {}
            }
    }
}

extension View {
    // `cambiado`: el borrador frente al original. `preguntar`: el mismo estado que pone «cancelar.» con cambios.
    func preguntarAlDescartar(_ cambiado: Bool, preguntar: Binding<Bool>, cerrar: @escaping () -> Void) -> some View {
        modifier(PreguntarAlDescartar(cambiado: cambiado, preguntar: preguntar, cerrar: cerrar))
    }
}

struct GestoCerrarHoja: UIViewRepresentable {
    let activo: Bool
    let intento: () -> Void

    func makeCoordinator() -> Intermediario { Intermediario() }

    func makeUIView(context: Context) -> Vista {
        let v = Vista()
        v.intermediario = context.coordinator
        v.isUserInteractionEnabled = false
        return v
    }

    func updateUIView(_ v: Vista, context: Context) {
        context.coordinator.activo = activo
        context.coordinator.intento = intento
        v.enganchar()
    }

    static func dismantleUIView(_ v: Vista, coordinator: Intermediario) { coordinator.soltar() }

    final class Vista: UIView {
        weak var intermediario: Intermediario?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            DispatchQueue.main.async { [weak self] in self?.enganchar() }
        }

        func enganchar() {
            guard window != nil, let i = intermediario else { return }
            var r: UIResponder? = self
            while let x = r, !(x is UIViewController) { r = x.next }
            guard var vc = r as? UIViewController else { return }
            while let p = vc.parent { vc = p }
            guard vc.presentingViewController != nil, let pc = vc.presentationController else { return }
            i.enganchar(pc)
        }
    }

    final class Intermediario: NSObject, UIAdaptivePresentationControllerDelegate {
        var activo = false
        var intento: () -> Void = {}
        private weak var controlador: UIPresentationController?
        private weak var original: UIAdaptivePresentationControllerDelegate?

        @MainActor func enganchar(_ pc: UIPresentationController) {
            if controlador === pc, pc.delegate === self { return }
            if pc.delegate !== self { original = pc.delegate }
            controlador = pc
            pc.delegate = self
        }

        @MainActor func soltar() {
            if let pc = controlador, pc.delegate === self { pc.delegate = original }
        }

        @MainActor func presentationControllerDidAttemptToDismiss(_ pc: UIPresentationController) {
            original?.presentationControllerDidAttemptToDismiss?(pc)
            if activo { intento() }
        }

        override func responds(to aSelector: Selector!) -> Bool {
            if super.responds(to: aSelector) { return true }
            return original?.responds(to: aSelector) ?? false
        }

        override func forwardingTarget(for aSelector: Selector!) -> Any? {
            if let o = original, o.responds(to: aSelector) { return o }
            return super.forwardingTarget(for: aSelector)
        }
    }
}
