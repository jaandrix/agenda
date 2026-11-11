import SwiftUI

// Campos de texto como los de la PWA (.modal-input): superficie del tema, filo visible y, al escribir, el filo del
// acento. El filo usa `aro` (el de los círculos de marcar, 3:1), no `borde` (7 %), que en asfalto no se veía.
extension View {
    func campoCasa(activo: Bool = false) -> some View {
        padding(.horizontal, 14)
            .frame(minHeight: 48)
            .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(activo ? Paleta.acento : Paleta.aro, lineWidth: activo ? 1.5 : 1)
            }
    }

    // TextEditor dentro de un Form: sin el fondo del sistema, que en los temas oscuros lo dejaba casi invisible.
    func editorCasa(alto: CGFloat) -> some View {
        scrollContentBackground(.hidden)
            .font(Tipo.cuerpo)
            .foregroundStyle(Paleta.texto)
            .padding(6)
            .frame(minHeight: alto)
            .background(Paleta.fondo, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Paleta.aro, lineWidth: 1) }
    }

    func formularioCasa() -> some View {
        scrollContentBackground(.hidden)
            .background(Paleta.fondo)
            .tint(Paleta.acento)
    }
}
