import SwiftUI

// Tarjetas, listas y controles de Bitácora 2.0 (fotos 2, 3 y 4).

// MARK: - Buscador

/// Buscador en cápsula (foto 2). Sobre el lienzo va blanco; sobre una tarjeta blanca, `sobreBlanco: true` lo pone gris.
struct BuscadorCapsula: View {
    @Binding var texto: String
    var placeholder = "buscar"
    var sobreBlanco = false
    var enfocar: FocusState<Bool>.Binding?

    @FocusState private var foco: Bool

    var body: some View {
        HStack(spacing: Medida.xs) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Lienzo.tintaTerciaria)
                .accessibilityHidden(true)
            campo
            if !texto.isEmpty {
                Button { withAnimation(Muelle.rapido) { texto = "" } } label: {
                    Image(systemName: "xmark.circle.fill").font(.system(size: 16)).foregroundStyle(Lienzo.tintaTerciaria)
                        .frame(width: 32, height: 32)
                        // 3.2: 44 de toque sin ensanchar la cápsula.
                        .padding(6).contentShape(Rectangle())
                }
                .buttonStyle(.pulsable(0.85))
                .padding(-6)
                .accessibilityLabel("borrar búsqueda")
                .transition(.scale(scale: 0.5).combined(with: .opacity))
            }
        }
        .padding(.leading, 16).padding(.trailing, 6)
        .frame(height: Medida.alturaBuscador)
        .background(sobreBlanco ? Lienzo.sutil : Lienzo.tarjeta, in: Capsule())
        .overlay { if !sobreBlanco { Capsule().strokeBorder(Lienzo.filo) } }
        .animation(Muelle.rapido, value: texto.isEmpty)
    }

    @ViewBuilder private var campo: some View {
        let t = TextField("", text: $texto, prompt: Text(placeholder).foregroundColor(Lienzo.tintaTerciaria))
            .font(Letra.cuerpo)
            .foregroundStyle(Lienzo.tinta)
            .submitLabel(.search)
            .autocorrectionDisabled()
            .accessibilityLabel(placeholder)
        if let enfocar { t.focused(enfocar) } else { t.focused($foco) }
    }
}

// MARK: - Tarjeta de nota (foto 2)

/// Tarjeta de nota: título en seminegrita, extracto de dos líneas en gris, y abajo un dato a la izquierda (duración,
/// etiqueta, hora) y la fecha a la derecha. Al expandirse enseña el texto entero con un muelle, sin saltos.
struct TarjetaNota: View {
    let titulo: String
    var extracto: String = ""
    var dato: String?
    var fecha: String?
    var etiqueta: String?
    var expandida = false
    var alTocar: (() -> Void)?

    var body: some View {
        let contenido = VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: Medida.xs) {
                Text(titulo).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta)
                    .lineLimit(expandida ? nil : 1)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                if let etiqueta { Chip(texto: etiqueta, tono: .naranja) }
            }
            if !extracto.isEmpty {
                Text(extracto).font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                    .lineLimit(expandida ? nil : 2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if dato != nil || fecha != nil {
                HStack {
                    if let dato { Text(dato).font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta).monospacedDigit() }
                    Spacer()
                    if let fecha { Text(fecha).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit() }
                }
                .padding(.top, 4)
            }
        }
        .tarjeta()
        .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))

        if let alTocar {
            Button(action: alTocar) { contenido }
                .buttonStyle(.pulsable(0.97))
                .accessibilityHint(expandida ? "toca para recoger" : "toca para ver entera")
        } else {
            contenido
        }
    }
}

// MARK: - Segmentos (foto 4: «To do / Completed / Pending»)

/// Selector de segmentos en cápsula: la opción activa es una píldora negra que se desliza.
struct SegmentoCapsula<Valor: Hashable>: View {
    struct Opcion: Identifiable {
        let valor: Valor
        let titulo: String
        var icono: String?            // SF Symbol pequeño, opcional
        var id: Valor { valor }
    }
    let opciones: [Opcion]
    @Binding var elegido: Valor
    var sobreBlanco = true

    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    // 3.2 (lag de la píldora, visto en el iPhone): una sola píldora que se mueve con `offset` en vez de
    // matchedGeometryEffect. El offset no cambia el diseño de nada, así que animarlo no recoloca la página entera
    // (Finanzas, Plan) en cada fotograma; con matchedGeometryEffect sí, y daba tirones aunque el contenido esperase.
    var body: some View {
        let indice = opciones.firstIndex { $0.valor == elegido } ?? 0
        HStack(spacing: 2) {
            ForEach(opciones) { o in
                let on = o.valor == elegido
                Button {
                    guard !on else { return }
                    Haptica.seleccion()
                    withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { elegido = o.valor }
                } label: {
                    HStack(spacing: 5) {
                        if let i = o.icono { Image(systemName: i).font(.system(size: 11, weight: .bold)) }
                        Text(o.titulo).font(Letra.pestana).lineLimit(1)
                    }
                    .foregroundStyle(on ? Lienzo.sobreOscuro : Lienzo.tintaSecundaria)
                    .frame(maxWidth: .infinity, minHeight: 36)
                    .contentShape(Capsule())
                }
                .buttonStyle(Pulsable(escala: 0.94, haptica: false))
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .background(alignment: .leading) {
            GeometryReader { g in
                let n = CGFloat(max(opciones.count, 1))
                let ancho = (g.size.width - 2 * (n - 1)) / n
                Capsule().fill(Lienzo.oscuro)
                    .frame(width: ancho, height: g.size.height)
                    .offset(x: CGFloat(indice) * (ancho + 2))
            }
        }
        .padding(4)
        .background(sobreBlanco ? Lienzo.sutil : Lienzo.tarjeta, in: Capsule())
    }
}

// MARK: - Sección plegable (foto 4: «▾ Morning»)

/// Grupo con título y triángulo que se pliega con un muelle; el contenido entra y sale fundido.
struct SeccionPlegable<Contenido: View>: View {
    let titulo: String
    var detalle: String?
    @Binding var abierta: Bool
    @ViewBuilder var contenido: () -> Contenido
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                Haptica.ligera()
                withAnimation(Muelle.o(Muelle.expandir, reducido: sinMovimiento)) { abierta.toggle() }
            } label: {
                HStack(spacing: Medida.xs) {
                    Image(systemName: "triangle.fill")
                        .font(.system(size: 7, weight: .bold))
                        .rotationEffect(.degrees(abierta ? 180 : 90))
                        .foregroundStyle(Lienzo.tinta)
                    Text(titulo).font(Letra.seccion).foregroundStyle(Lienzo.tinta)
                    Spacer()
                    if let detalle { Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit() }
                }
                .frame(minHeight: Medida.toque)
                .contentShape(Rectangle())
            }
            .buttonStyle(Pulsable(escala: 0.98, haptica: false))
            .accessibilityValue(abierta ? "abierta" : "plegada")
            .accessibilityAddTraits(.isHeader)
            if abierta {
                contenido()
                    .transition(.opacity.combined(with: .offset(y: -6)))
            }
        }
        .clipped()
    }
}

// MARK: - Filas

/// Fila dentro de una tarjeta: icono cuadrado, título, detalle y algo a la derecha (valor, chevron, check…).
struct FilaTarjeta<Derecha: View>: View {
    var icono: String?
    var tonoIcono: IconoCuadrado.Tono = .claro
    let titulo: String
    var detalle: String?
    @ViewBuilder var derecha: () -> Derecha

    var body: some View {
        HStack(spacing: Medida.s) {
            if let icono { IconoCuadrado(id: icono, tono: tonoIcono) }
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).lineLimit(2)
                if let detalle, !detalle.isEmpty {
                    Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(2)
                }
            }
            Spacer(minLength: Medida.xs)
            derecha()
        }
        .frame(minHeight: 52)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

extension FilaTarjeta where Derecha == EmptyView {
    init(icono: String? = nil, tonoIcono: IconoCuadrado.Tono = .claro, titulo: String, detalle: String? = nil) {
        self.icono = icono; self.tonoIcono = tonoIcono; self.titulo = titulo; self.detalle = detalle; derecha = { EmptyView() }
    }
}

/// Chevron de fila navegable.
struct FlechaFila: View {
    var body: some View {
        Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(Lienzo.tintaTerciaria)
            .accessibilityHidden(true)
    }
}

/// Separador fino entre filas de una tarjeta, sangrado desde el texto (no desde el icono).
struct SeparadorFila: View {
    var sangria: CGFloat = Medida.icono + Medida.s
    var body: some View { Rectangle().fill(Lienzo.filo).frame(height: 1).padding(.leading, sangria) }
}

/// Casilla cuadrada de marcar (foto 4): cuadrado de esquinas suaves; marcada, negra con el check blanco y un sello.
struct CasillaMarcar: View {
    let hecha: Bool
    /// 3.2: qué se marca («comprar pan»), para VoiceOver. Sin ella dice solo «hecha» o «pendiente».
    var etiqueta: String? = nil
    let marcar: () -> Void
    @State private var sello = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        Button {
            if !hecha && !sinMovimiento {
                sello = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { sello = false }
            }
            marcar()
        } label: {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(hecha ? Lienzo.oscuro : Lienzo.tarjeta)
                .overlay { RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(hecha ? Lienzo.oscuro : Lienzo.filoFuerte, lineWidth: 1.5) }
                .overlay {
                    if hecha {
                        Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(Lienzo.sobreOscuro)
                            .transition(.scale(scale: 0.3).combined(with: .opacity))
                    }
                }
                .frame(width: 22, height: 22)
                .scaleEffect(sello ? 1.15 : 1)
                .frame(width: Medida.toque, height: Medida.toque)
                .contentShape(Rectangle())
        }
        .buttonStyle(Pulsable(escala: 0.85, haptica: false))
        .animation(Muelle.toque, value: hecha)
        .animation(Muelle.toque, value: sello)
        .sensoryFeedback(.success, trigger: hecha) { antes, ahora in !antes && ahora }
        .accessibilityLabel(etiqueta ?? (hecha ? "hecha" : "pendiente"))
        .accessibilityValue(etiqueta == nil ? "" : (hecha ? "hecha" : "pendiente"))
        .accessibilityHint(hecha ? "desmarcar" : "marcar como hecha")
    }
}

// MARK: - Invitación y vacío (foto 3)

/// Tarjeta centrada con una frase y un botón negro en cápsula («Looking for more Inspiration? · Get Inspired»).
struct TarjetaInvitacion: View {
    let frase: String
    var destacado: String?
    var boton: String?
    var accion: (() -> Void)?

    var body: some View {
        VStack(spacing: Medida.m) {
            (Text(frase).foregroundColor(Lienzo.tinta) + Text(destacado.map { "\n" + $0 } ?? "").fontWeight(.bold).foregroundColor(Lienzo.tinta))
                .font(Tipo.poppins(17, .regular, estilo: .headline))
                .multilineTextAlignment(.center)
            if let boton, let accion {
                Button(boton, action: accion).buttonStyle(.capsula)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Medida.xxl + 8)
        .padding(.horizontal, Medida.l)
        .background(Lienzo.tarjeta.opacity(0.6), in: RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous).strokeBorder(Lienzo.filoFuerte))
    }
}

/// Estado vacío discreto dentro de una tarjeta o sección.
struct EstadoVacio: View {
    let texto: String
    var icono: String?
    var body: some View {
        VStack(spacing: Medida.xs) {
            if let icono { IconoCuadrado(id: icono, tono: .claro, tamano: Medida.iconoGrande) }
            Text(texto).font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Medida.xl)
    }
}

/// Bloque oscuro destacado (para «ahora.», un saldo, el próximo bus): tarjeta negra con texto claro.
struct TarjetaOscura<Contenido: View>: View {
    @ViewBuilder var contenido: () -> Contenido
    var body: some View {
        contenido()
            .padding(Medida.rellenoTarjeta)
            .frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(Lienzo.sobreOscuro)
            .fondoConSombra(Lienzo.oscuro, en: RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous), sombra: .oscura)
    }
}
