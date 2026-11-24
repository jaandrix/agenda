import SwiftUI

// Las categorías de Finanzas con los iconos de la web (FINANCE_PRO_CATEGORY_ICON_SET en js/finanzas.js, el set dibujado
// por Alejandro en una rejilla de 48): IconosCategorias.xcassets tiene esos mismos SVG, uno por clave (`fincat-<clave>`),
// como plantilla para teñirlos con el color de la categoría.
enum IconosCategoria {
    struct Icono: Identifiable { let clave, nombre: String; var id: String { clave } }
    static let lista: [Icono] = [
        .init(clave: "food", nombre: "Comida y bebida"), .init(clave: "home", nombre: "Vivienda"), .init(clave: "car", nombre: "Transporte"), .init(clave: "bag", nombre: "Compras"), .init(clave: "ticket", nombre: "Ocio"),
        .init(clave: "heart", nombre: "Salud"), .init(clave: "phone", nombre: "Comunicación"), .init(clave: "bank", nombre: "Comisiones e impuestos"), .init(clave: "book", nombre: "Educación"),
        .init(clave: "family", nombre: "Familia y mascotas"), .init(clave: "briefcase", nombre: "Sueldo / trabajo"), .init(clave: "coin", nombre: "Ingreso extra"), .init(clave: "trend", nombre: "Inversiones"),
        .init(clave: "gift", nombre: "Regalos"), .init(clave: "repeat", nombre: "Reembolsos"), .init(clave: "plane", nombre: "Viajes"), .init(clave: "paw", nombre: "Mascotas"), .init(clave: "dumbbell", nombre: "Deporte"),
        .init(clave: "laptop", nombre: "Tecnología"), .init(clave: "sparkle", nombre: "Bienestar y belleza"), .init(clave: "key", nombre: "Alquileres"), .init(clave: "star", nombre: "Coleccionables"),
        .init(clave: "fuel", nombre: "Gasolina"), .init(clave: "other", nombre: "Otros")
    ]
    private static let claves = Set(lista.map(\.clave))

    static func imagen(_ clave: String) -> String { "fincat-" + (claves.contains(clave) ? clave : "other") }

    // Un icono que encaje con el nombre al crear una categoría (si no, se elige a mano: nunca «otros» sin querer).
    private static let pistas: [(String, [String])] = [
        ("fuel", ["gasolina", "combustible", "diesel", "gasoil"]),
        ("gift", ["regalo", "cumple"]),
        ("plane", ["viaje", "vacacion", "vuelo", "hotel"]),
        ("paw", ["mascota", "perro", "gato", "veterinari"]),
        ("dumbbell", ["deporte", "gimnasio", "gym", "padel", "futbol", "crossfit"]),
        ("sparkle", ["belleza", "peluquer", "bienestar", "spa", "estetica"]),
        ("key", ["alquiler"]),
        ("star", ["coleccion", "cartas", "pokemon"]),
        ("trend", ["inversion", "broker", "bolsa", "cripto", "fondo"]),
        ("repeat", ["reembolso", "devolucion"]),
        ("briefcase", ["sueldo", "nomina", "trabajo"]),
        ("coin", ["extra", "bizum", "ingreso", "ahorro"]),
        ("laptop", ["tecnolog", "ordenador", "software", "app", "suscripcion"]),
        ("phone", ["movil", "telefono", "internet", "fibra"]),
        ("bank", ["comision", "impuesto", "banco", "hacienda", "multa", "seguro"]),
        ("book", ["educacion", "libro", "curso", "universidad", "academia", "estudio", "clase"]),
        ("family", ["familia", "hijo", "nino", "bebe"]),
        ("heart", ["salud", "medic", "farmacia", "dentista", "fisio"]),
        ("car", ["coche", "transporte", "taxi", "bus", "metro", "tren", "parking", "uber", "moto"]),
        ("home", ["casa", "hogar", "vivienda", "luz", "agua", "comunidad", "hipoteca", "mueble"]),
        ("ticket", ["ocio", "cine", "concierto", "entrada", "fiesta", "copas", "teatro", "juego"]),
        ("food", ["comida", "restaurante", "bar", "cafe", "super", "mercado", "cena", "comer", "bebida", "desayuno", "almuerzo"]),
        ("bag", ["compra", "ropa", "tienda", "amazon", "zapat"])
    ]

    static func adivinar(_ nombre: String) -> String? {
        let n = nombre.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES"))
        guard !n.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return pistas.first { $0.1.contains { n.contains($0) } }?.0
    }
}

// El icono de una categoría en el cuadrado de IconoCuadrado (V2): un tinte suave de su color y el dibujo en su color,
// como financeProCategoryBadge en la web. Sin color, el gris sutil y la tinta.
struct IconoCategoria: View {
    let icono: String
    var color: String = ""
    var tam: CGFloat = 28

    var body: some View {
        let tinta = color.isEmpty ? Lienzo.tinta : Color(hexWeb: color)
        RoundedRectangle(cornerRadius: tam * 0.3, style: .continuous)
            .fill(color.isEmpty ? Lienzo.sutil : tinta.opacity(0.14))
            .overlay {
                Image(IconosCategoria.imagen(icono))
                    .renderingMode(.template)
                    .resizable().scaledToFit()
                    .foregroundStyle(tinta)
                    .padding(tam * 0.24)
            }
            .frame(width: tam, height: tam)
            .accessibilityHidden(true)
    }
}

// Rejilla para elegir el icono de una categoría nueva.
struct RejillaIconos: View {
    @Binding var seleccion: String
    var color: String = ""

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Medida.xs), count: 6), spacing: Medida.xs) {
            ForEach(IconosCategoria.lista) { i in
                let on = seleccion == i.clave
                Button {
                    Haptica.seleccion()
                    withAnimation(Muelle.rapido) { seleccion = i.clave }
                } label: {
                    IconoCategoria(icono: i.clave, color: on ? color : "", tam: 40)
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Lienzo.tinta, lineWidth: on ? 2 : 0))
                        .scaleEffect(on ? 1.06 : 1)
                }
                .buttonStyle(.pulsable(0.9))
                .accessibilityLabel(i.nombre.lowercased())
                .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(.vertical, Medida.xxs)
    }
}

// La categoría de un movimiento en el editor: todas a la vista, con su icono, en vez de un desplegable. La elegida, en
// negro (como la píldora de los segmentos).
struct SelectorCategoria: View {
    let opciones: [EditorMovimientoView.Opcion]
    @Binding var seleccion: String

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: Medida.xs)], spacing: Medida.xs) {
            ficha(id: "", nombre: "sin categoría.", icono: nil, color: "")
            ForEach(opciones) { o in ficha(id: o.id, nombre: o.nombre.lowercased(), icono: o.icono ?? "other", color: o.color ?? "") }
        }
        .padding(.vertical, Medida.xxs)
    }

    private func ficha(id: String, nombre: String, icono: String?, color: String) -> some View {
        let on = seleccion == id
        return Button {
            Haptica.seleccion()
            withAnimation(Muelle.rapido) { seleccion = id }
        } label: {
            VStack(spacing: Medida.xxs) {
                if let icono { IconoCategoria(icono: icono, color: color, tam: 30) } else {
                    IconoFinanzas(clave: "other", tamano: 30)
                }
                Text(nombre).font(Letra.etiqueta).foregroundStyle(on ? Lienzo.sobreOscuro : Lienzo.tinta)
                    .lineLimit(2).multilineTextAlignment(.center).minimumScaleFactor(0.85)
            }
            .frame(maxWidth: .infinity, minHeight: 70)
            .padding(.vertical, Medida.xxs)
            .background(on ? Lienzo.oscuro : Lienzo.tarjeta, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous).strokeBorder(on ? Color.clear : Lienzo.filo))
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
        }
        .buttonStyle(.pulsable(0.94))
        .accessibilityLabel(nombre)
        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
    }
}
