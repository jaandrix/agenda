import SwiftUI

// Piezas comunes, sacadas de la PWA móvil. No conocen SyncEngine ni JSON: reciben lo que pintan y qué hacer al tocar.

// .m-check: círculo de 30 con borde de 2 (--border-strong); marcado, lleno de acento con el check en --m-sobre-acento.
// Al marcarse se sella: crece un poco y vuelve, 160 ms; sin animación si se pide movimiento reducido.
struct BitacoraCheck: View {
    let hecho: Bool
    var acento = false
    let accion: () -> Void
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var sello = false

    var body: some View {
        Button {
            if !hecho && !sinMovimiento {
                sello = true
                DispatchQueue.main.asyncAfter(deadline: .now() + Duracion.sello) { sello = false }
            }
            accion()
        } label: {
            ZStack {
                Circle().strokeBorder(hecho ? Paleta.acento : (acento ? Paleta.acento : Paleta.bordeFuerte), lineWidth: 2)
                if hecho {
                    Circle().fill(Paleta.acento)
                    Image(systemName: "checkmark").font(.system(size: 13, weight: .heavy)).foregroundStyle(Paleta.sobreAcento)
                }
            }
            .frame(width: 30, height: 30)
            .scaleEffect(sello ? 1.1 : 1)
            .animation(sinMovimiento ? nil : .easeOut(duration: Duracion.sello), value: sello)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.success, trigger: hecho) { antes, ahora in !antes && ahora }
    }
}

// Cabecera de un apartado: título enorme en minúscula con el punto en el acento (renderMobileCabecera) y una línea de
// contexto debajo. Sin barra de navegación grande encima.
struct CabeceraApartado<Accion: View>: View {
    let titulo: String
    var contexto: String?
    @ViewBuilder var accion: () -> Accion

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                (Text(titulo).foregroundColor(Paleta.texto) + Text(".").foregroundColor(Paleta.acento))
                    .font(Tipo.tituloApartado)
                    .kerning(-1)
                    .accessibilityAddTraits(.isHeader)
                if let contexto { Text(contexto).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
            }
            Spacer(minLength: Espacio.s)
            accion()
        }
        .padding(.top, Espacio.s)
    }
}

// Título de sección en minúscula con punto, contador opcional y sin caja (la sección vive sobre el fondo).
struct CabeceraSeccion: View {
    let titulo: String
    var detalle: String?
    var raya = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(titulo).font(Tipo.subtitulo).foregroundStyle(Paleta.texto).accessibilityAddTraits(.isHeader)
                Spacer()
                if let detalle { Text(detalle).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
            }
            // .m-dia-raya: una rayita corta del acento debajo del título del día.
            if raya { Capsule().fill(Paleta.acento).frame(width: 28, height: 3) }
        }
        .padding(.top, Espacio.l)
        .padding(.bottom, Espacio.xs)
    }
}

// Fila de la agenda: hora en columna fija, círculo, título y nota, filete continuo debajo. Lo arrastrado o en curso en
// el acento. Tocar el texto abre; el círculo solo marca. Las acciones también van por VoiceOver.
struct FilaAgenda: View {
    let hora: String?
    let titulo: String
    var notas = ""
    let hecho: Bool
    var acento = false
    var mostrarHora = true
    let marcar: () -> Void
    var abrir: (() -> Void)?

    var body: some View {
        HStack(alignment: .center, spacing: Espacio.s) {
            if mostrarHora {
                Text(hora ?? "")
                    .font(Tipo.mono)
                    .foregroundStyle(acento && !hecho ? Paleta.acento : Paleta.textoSecundario)
                    .frame(width: 46, alignment: .leading)
            }
            BitacoraCheck(hecho: hecho, acento: acento, accion: marcar)
            Button { (abrir ?? marcar)() } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(titulo)
                        .font(Tipo.cuerpoFuerte)
                        .foregroundStyle(hecho ? Paleta.textoSecundario : (acento ? Paleta.acento : Paleta.texto))
                        .strikethrough(hecho, color: Paleta.textoSecundario)
                        .multilineTextAlignment(.leading)
                    if !notas.isEmpty { Text(notas).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).lineLimit(2) }
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 4)
        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel([hora, titulo].compactMap { $0 }.joined(separator: ", "))
        .accessibilityValue(hecho ? "hecha" : (acento ? "pendiente, de días anteriores" : "pendiente"))
        .accessibilityAction(named: hecho ? "desmarcar" : "marcar", marcar)
        .accessibilityAction(named: "abrir") { (abrir ?? marcar)() }
    }
}

// Botón de texto del acento («+ tarea.»): una acción contextual, sin caja.
struct AccionTexto: View {
    let texto: String
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            Text(texto).font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.acento).frame(minHeight: 44, alignment: .leading)
        }
        .buttonStyle(.plain)
    }
}

// .m-tabbar: superficie con las esquinas de arriba de 26, filo arriba y sombra baja; iconos en un círculo con un 6 % de
// tinta; la activa en el texto principal con un punto del acento; el + central de 72 en el acento, con un aro del color
// de la barra y subido 28 pt.
struct BarraBitacora: View {
    struct Pestana: Identifiable {
        let id: String
        let titulo: String
        let icono: String
    }
    let pestanas: [Pestana]
    let activa: String
    let elegir: (String) -> Void
    let capturar: () -> Void

    var body: some View {
        let mitad = pestanas.count / 2
        HStack(alignment: .top, spacing: 0) {
            ForEach(pestanas.prefix(mitad)) { boton($0) }
            botonCentral
            ForEach(pestanas.suffix(pestanas.count - mitad)) { boton($0) }
        }
        .padding(.horizontal, Espacio.s)
        .padding(.top, 6)
        .background(alignment: .top) {
            UnevenRoundedRectangle(topLeadingRadius: Radio.barra, topTrailingRadius: Radio.barra)
                .fill(Paleta.superficie)
                .overlay(alignment: .top) {
                    UnevenRoundedRectangle(topLeadingRadius: Radio.barra, topTrailingRadius: Radio.barra)
                        .stroke(Paleta.borde, lineWidth: 1)
                }
                .shadow(color: .black.opacity(0.18), radius: 16, y: -6)
                .ignoresSafeArea(edges: .bottom)
        }
    }

    private func boton(_ p: Pestana) -> some View {
        let on = p.id == activa
        return Button { elegir(p.id) } label: {
            VStack(spacing: 4) {
                Image(systemName: p.icono)
                    .font(.system(size: 19, weight: .semibold))
                    .frame(width: 46, height: 46)
                    .background(on ? Paleta.tinteAcento : Paleta.tinteTexto, in: Circle())
                Text(p.titulo).font(Tipo.poppins(12.5, .bold, estilo: .caption2)).lineLimit(1)
                Circle().fill(on ? Paleta.acento : .clear).frame(width: 4, height: 4)
            }
            .foregroundStyle(on ? Paleta.texto : Paleta.textoSecundario)
            .frame(maxWidth: .infinity, minHeight: 64)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(p.titulo)
        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
    }

    private var botonCentral: some View {
        Button(action: capturar) {
            Image(systemName: "plus")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(Paleta.sobreAcento)
                .frame(width: 60, height: 60)
                .background(Paleta.acento, in: Circle())
                .padding(6)
                .background(Paleta.superficie, in: Circle())
        }
        .buttonStyle(.plain)
        .offset(y: -22)
        .frame(width: 80)
        .accessibilityLabel("apuntar")
    }
}
