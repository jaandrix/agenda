import SwiftUI

// Piezas de Despensa 2.0 que aún no están en DesignSystem/V2. Llevan el prefijo del apartado para no chocar; candidatas a
// subir: CampoAnadirDespensa (campo cápsula con botón de enviar), MenuRedondoDespensa (BotonRedondo que abre un Menu).

/// Campo en cápsula para añadir rápido: el «+» a la izquierda y, con texto, un botón negro redondo que entra con muelle.
struct CampoAnadirDespensa: View {
    @Binding var texto: String
    var placeholder: String
    var foco: FocusState<Bool>.Binding
    let enviar: () -> Void

    private var vacio: Bool { texto.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        HStack(spacing: Medida.xs) {
            Image(systemName: "plus")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Lienzo.tintaTerciaria)
                .accessibilityHidden(true)
            TextField("", text: $texto, prompt: Text(placeholder).foregroundColor(Lienzo.tintaTerciaria))
                .font(Letra.cuerpo)
                .foregroundStyle(Lienzo.tinta)
                .submitLabel(.done)
                .focused(foco)
                .onSubmit(enviar)
                .accessibilityLabel("añadir a la lista")
            if !vacio {
                Button(action: enviar) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Lienzo.sobreOscuro)
                        .frame(width: Medida.icono, height: Medida.icono)
                        .background(Lienzo.oscuro, in: Circle())
                        .contentShape(Circle())
                }
                .buttonStyle(.pulsable(0.85))
                .accessibilityLabel("añadir")
                .transition(.scale(scale: 0.5).combined(with: .opacity))
            }
        }
        .padding(.leading, Medida.m).padding(.trailing, Medida.xxs)
        .frame(height: Medida.alturaControl)
        .background(Lienzo.tarjeta, in: Capsule())
        .overlay(Capsule().strokeBorder(foco.wrappedValue ? Lienzo.filoFuerte : Lienzo.filo))
        .sombra(.suave)
        .animation(Muelle.rapido, value: vacio)
    }
}

/// Puntos que abren un menú. Redondo y blanco en la cabecera (como BotonRedondo); suelto y gris dentro de una tarjeta.
struct MenuRedondoDespensa<Contenido: View>: View {
    var etiqueta: String
    var suelto = false
    @ViewBuilder var contenido: () -> Contenido

    var body: some View {
        Menu { contenido() } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(suelto ? Lienzo.tintaSecundaria : Lienzo.tinta)
                .frame(width: suelto ? Medida.toque : 40, height: suelto ? Medida.toque : 40)
                .background { if !suelto { Circle().fill(Lienzo.tarjeta) } }
                .overlay { if !suelto { Circle().strokeBorder(Lienzo.filo) } }
                .frame(minWidth: Medida.toque, minHeight: Medida.toque)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(etiqueta)
    }
}

/// Coste orientativo de una receta con los precios apuntados en las listas (cada ingrediente cuenta una vez).
enum DespensaCoste {
    static func precios(_ listas: [ListaDespensa]) -> [String: Decimal] {
        var r: [String: Decimal] = [:]
        for l in listas { for i in l.items { if let p = i.precio, p > 0 { r[RecetaALista.clave(i.texto)] = p } } }
        return r
    }

    static func receta(_ r: RecetaDespensa, precios: [String: Decimal]) -> (total: Decimal, conPrecio: Int)? {
        var total = Decimal(0), n = 0, vistos = Set<String>()
        for i in r.ingredientes {
            let k = RecetaALista.clave(i.texto)
            guard vistos.insert(k).inserted, let p = precios[k] else { continue }
            total += p; n += 1
        }
        return n == 0 ? nil : (total, n)
    }
}
