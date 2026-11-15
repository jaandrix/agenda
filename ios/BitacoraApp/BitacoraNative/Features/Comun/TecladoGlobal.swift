import UIKit

// 0.22 (usabilidad): el teclado se cierra igual en toda la app, sin repetirlo en cada uno de los ~85 campos.
// - Campos de una línea: la tecla de retorno ya lo cierra (SwiftUI); solo hay que no volver a enfocarlos en `onSubmit`.
// - Campos de varias líneas (`axis: .vertical`, TextEditor): ahí retorno es un salto de línea, así que llevan una barra
//   con «listo.» encima del teclado. Se pone al empezar a escribir en cualquier UITextView, que es lo que SwiftUI usa.
// - Tocar fuera de un campo lo cierra (el toque sigue llegando a lo que se tocó) y arrastrar una lista también.
@MainActor
enum TecladoGlobal {
    private static var instalado = false
    private static let quitador = Quitador()

    static func instalar() {
        guard !instalado else { return }
        instalado = true
        UIScrollView.appearance().keyboardDismissMode = .interactive
        let centro = NotificationCenter.default
        centro.addObserver(forName: UITextView.textDidBeginEditingNotification, object: nil, queue: .main) { n in
            MainActor.assumeIsolated {
                guard let v = n.object as? UITextView, v.isEditable, v.inputAccessoryView == nil else { return }
                v.inputAccessoryView = barra()
                v.reloadInputViews()
            }
        }
        centro.addObserver(forName: UIWindow.didBecomeKeyNotification, object: nil, queue: .main) { n in
            MainActor.assumeIsolated { if let w = n.object as? UIWindow { quitador.vigilar(w) } }
        }
        for escena in UIApplication.shared.connectedScenes {
            (escena as? UIWindowScene)?.windows.forEach { quitador.vigilar($0) }
        }
    }

    static func cerrar() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    private static func barra() -> UIToolbar {
        let b = UIToolbar(frame: CGRect(x: 0, y: 0, width: 320, height: 44))
        let listo = UIBarButtonItem(title: "listo.", style: .done, target: quitador, action: #selector(Quitador.listo))
        let letra = UIFontMetrics(forTextStyle: .body).scaledFont(for: UIFont(name: "Poppins-SemiBold", size: 16) ?? .boldSystemFont(ofSize: 16))
        listo.setTitleTextAttributes([.font: letra], for: .normal)
        listo.accessibilityLabel = "cerrar el teclado"
        b.items = [UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil), listo]
        b.sizeToFit()
        return b
    }

    @MainActor final class Quitador: NSObject, UIGestureRecognizerDelegate {
        private var vigiladas = Set<ObjectIdentifier>()

        func vigilar(_ w: UIWindow) {
            guard vigiladas.insert(ObjectIdentifier(w)).inserted else { return }
            let g = UITapGestureRecognizer(target: self, action: #selector(tocado(_:)))
            g.cancelsTouchesInView = false
            g.delegate = self
            w.addGestureRecognizer(g)
        }

        @objc func listo() { TecladoGlobal.cerrar() }

        @objc func tocado(_ g: UITapGestureRecognizer) {
            if g.state == .ended { g.view?.endEditing(true) }
        }

        // Un toque en otro campo no cierra: pasa a ese campo sin que el teclado baje y suba.
        func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive toque: UITouch) -> Bool {
            var v = toque.view
            while let x = v {
                if x is UITextField || x is UITextView { return false }
                v = x.superview
            }
            return true
        }

        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otro: UIGestureRecognizer) -> Bool { true }
    }
}
