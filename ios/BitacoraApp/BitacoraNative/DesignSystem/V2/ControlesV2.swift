import SwiftUI

// Controles comunes de Bitácora 3.0: chips elegibles, interruptor, menú y compartir en círculo. Antes vivían en Plan,
// Finanzas y Ajustes.

/// Fila de chips elegibles (prioridad, día, recordatorio): el elegido en negro, los demás en gris sutil.
struct ChipsEleccion<Valor: Hashable>: View {
    let opciones: [(valor: Valor, titulo: String)]
    @Binding var elegido: Valor
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                ForEach(opciones.indices, id: \.self) { i in
                    let o = opciones[i]
                    let on = o.valor == elegido
                    Button {
                        guard !on else { return }
                        Haptica.seleccion()
                        withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { elegido = o.valor }
                    } label: {
                        Chip(texto: o.titulo, tono: on ? .oscuro : .sutil)
                            .frame(minHeight: Medida.toque)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(Pulsable(escala: 0.92, haptica: false))
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
    }
}

/// Interruptor 2.0: carril gris sutil que se tiñe de naranja al encenderse; la bola blanca se desliza con muelle.
struct InterruptorCasa: ToggleStyle {
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    func makeBody(configuration: Configuration) -> some View {
        Button {
            Haptica.ligera()
            withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { configuration.isOn.toggle() }
        } label: {
            HStack(spacing: 0) {
                configuration.label.frame(maxWidth: .infinity, alignment: .leading)
                ZStack(alignment: configuration.isOn ? .trailing : .leading) {
                    Capsule()
                        .fill(configuration.isOn ? Lienzo.naranja : Lienzo.sutil)
                        .overlay(Capsule().strokeBorder(configuration.isOn ? Color.clear : Lienzo.filoFuerte))
                        .frame(width: 50, height: 30)
                    Circle().fill(Lienzo.tarjeta)
                        .frame(width: 24, height: 24).padding(3)
                        .sombra(.suave)
                }
                .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: configuration.isOn)
            }
            .frame(minHeight: Medida.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(Pulsable(escala: 0.98, haptica: false))
        .accessibilityRepresentation { Toggle(isOn: configuration.$isOn) { configuration.label } }
    }
}

/// Botón redondo blanco que abre un menú (BotonRedondo es un Button y no puede ser la etiqueta de un Menu).
struct MenuRedondo<Contenido: View>: View {
    var sistema = "ellipsis"
    let etiqueta: String
    @ViewBuilder var contenido: () -> Contenido

    var body: some View {
        Menu { contenido() } label: {
            Image(systemName: sistema)
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(Lienzo.tinta)
                .frame(width: 40, height: 40)
                .background(Lienzo.tarjeta, in: Circle())
                .overlay(Circle().strokeBorder(Lienzo.filo))
                .frame(minWidth: Medida.toque, minHeight: Medida.toque)
                .contentShape(Circle())
        }
        .accessibilityLabel(etiqueta)
    }
}

/// Compartir con el mismo círculo blanco que `BotonRedondo`.
struct BotonCompartirRedondo: View {
    let texto: String
    var etiqueta = "compartir"

    var body: some View {
        ShareLink(item: texto) {
            Image(systemName: "square.and.arrow.up")
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(Lienzo.tinta)
                .frame(width: 40, height: 40)
                .background(Lienzo.tarjeta, in: Circle())
                .overlay { Circle().strokeBorder(Lienzo.filo) }
                .frame(minWidth: Medida.toque, minHeight: Medida.toque)
                .contentShape(Circle())
        }
        .buttonStyle(Pulsable(escala: 0.9))
        .accessibilityLabel(etiqueta)
    }
}
