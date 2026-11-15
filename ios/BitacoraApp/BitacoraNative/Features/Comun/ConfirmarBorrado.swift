import SwiftUI

// 0.22 (usabilidad): lo que se borra sin vuelta atrás pregunta antes. Se pone la cosa en `cosa` y el diálogo sale solo.
extension View {
    func confirmarBorrado<T>(_ cosa: Binding<T?>, titulo: @escaping (T) -> String, boton: String = "borrar.", accion: @escaping (T) -> Void) -> some View {
        confirmationDialog(cosa.wrappedValue.map(titulo) ?? "",
                           isPresented: Binding(get: { cosa.wrappedValue != nil }, set: { if !$0 { cosa.wrappedValue = nil } }),
                           titleVisibility: .visible, presenting: cosa.wrappedValue) { x in
            Button(boton, role: .destructive) { accion(x) }
            Button("cancelar.", role: .cancel) {}
        }
    }
}
