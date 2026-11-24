import SwiftUI

// Secciones, tarjetas de filas y filas comunes de Bitácora 3.0. Antes vivían en Finanzas (TarjetaSeccion, TarjetaLista,
// FilaDato), Menú (TarjetaFilas, EstiloFilaMenu) y Ajustes (EstiloFila).

/// Sección: etiqueta pequeña encima (con detalle o acción) y el contenido en una tarjeta blanca.
struct TarjetaSeccion<Contenido: View>: View {
    let titulo: String
    var detalle: String?
    var accion: (titulo: String, hacer: () -> Void)?
    var relleno: CGFloat = Medida.rellenoTarjeta
    var arriba: CGFloat = Medida.entreSecciones
    var enTarjeta = true          // false: el contenido trae su propia tarjeta (TarjetaLista, TarjetaFilas)
    @ViewBuilder var contenido: () -> Contenido

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            HStack(alignment: .firstTextBaseline) {
                EtiquetaSeccion(texto: titulo, accion: accion)
                if let detalle, accion == nil {
                    Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit().lineLimit(1)
                        .padding(.trailing, Medida.xxs)
                }
            }
            if enTarjeta {
                VStack(alignment: .leading, spacing: 0) { contenido() }
                    .tarjeta(relleno: relleno)
            } else {
                contenido()
            }
        }
        .padding(.top, arriba)
    }
}

/// Lista de elementos en una tarjeta blanca: relleno lateral normal, poco vertical y separadores sangrados.
struct TarjetaLista<Elemento: Identifiable, Fila: View>: View {
    let elementos: [Elemento]
    @ViewBuilder var fila: (Elemento) -> Fila

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(elementos.enumerated()), id: \.element.id) { i, e in
                if i > 0 { SeparadorFila() }
                fila(e)
            }
        }
        .padding(.horizontal, Medida.rellenoTarjeta)
        .padding(.vertical, Medida.xxs)
        .tarjeta(relleno: 0)
    }
}

/// Tarjeta blanca sin relleno lateral y recortada, para filas a todo el ancho con el velo de `EstiloFila` al pulsar.
struct TarjetaFilas<Contenido: View>: View {
    @ViewBuilder var contenido: () -> Contenido

    var body: some View {
        VStack(spacing: 0) { contenido() }
            .padding(.vertical, Medida.xxs)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Lienzo.tarjeta)
            .clipShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous).strokeBorder(Lienzo.filo))
            .sombra(.suave)
    }
}

/// Pulsado de una fila dentro de una tarjeta: un velo gris suave con muelle, sin hundir la tarjeta entera.
struct EstiloFila: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Lienzo.sutilSuave : Color.clear)
            .contentShape(Rectangle())
            .animation(configuration.isPressed ? Muelle.toque : Muelle.soltar, value: configuration.isPressed)
    }
}

/// Fila «etiqueta …… valor» dentro de una tarjeta, con letra pequeña y filete abajo.
struct FilaDato: View {
    let etiqueta: String
    var valor: String = ""
    var tono: Color = Lienzo.tinta
    var separador = true

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Medida.xs) {
            Text(etiqueta).font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(2)
            Spacer(minLength: Medida.xs)
            if !valor.isEmpty {
                Text(valor).font(Letra.numero).foregroundStyle(tono).lineLimit(1).contentTransition(.numericText())
            }
        }
        .frame(minHeight: 40)
        .overlay(alignment: .bottom) { if separador { Rectangle().fill(Lienzo.filo).frame(height: 1) } }
        .accessibilityElement(children: .combine)
    }
}

/// Fila de importe (movimiento, gasto, cobro): icono, concepto con punto de aviso, detalle y la cifra con signo a la
/// derecha. Sin raya propia: la pone la lista que la contiene (TarjetaLista).
struct FilaImporte<Icono: View>: View {
    let titulo: String
    var detalle: String = ""
    let cifra: String
    var tono: Color = Lienzo.tinta
    var apagado = false           // lo que aún no ha pasado: título en gris
    var aviso = false             // punto naranja junto al título (por revisar)
    @ViewBuilder var icono: () -> Icono

    var body: some View {
        HStack(alignment: .center, spacing: Medida.s) {
            icono()
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 5) {
                    Text(titulo).font(Letra.cuerpoFuerte).foregroundStyle(apagado ? Lienzo.tintaSecundaria : Lienzo.tinta).lineLimit(1)
                    if aviso { Puntito(color: Lienzo.naranja, tamano: 6) }
                }
                if !detalle.isEmpty {
                    Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                }
            }
            Spacer(minLength: Medida.xs)
            Text(cifra).font(Letra.numero).foregroundStyle(tono).lineLimit(1).contentTransition(.numericText())
        }
        .frame(minHeight: 58)
        .contentShape(Rectangle())
    }
}

extension FilaImporte where Icono == EmptyView {
    init(titulo: String, detalle: String = "", cifra: String, tono: Color = Lienzo.tinta, apagado: Bool = false, aviso: Bool = false) {
        self.titulo = titulo; self.detalle = detalle; self.cifra = cifra; self.tono = tono
        self.apagado = apagado; self.aviso = aviso; icono = { EmptyView() }
    }
}
