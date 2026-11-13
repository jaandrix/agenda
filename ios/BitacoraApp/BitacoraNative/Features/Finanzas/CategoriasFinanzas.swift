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

// El icono de una categoría sobre un cuadrado con un tinte de su color, como financeProCategoryBadge en la web.
struct IconoCategoria: View {
    let icono: String
    var color: String = ""
    var tam: CGFloat = 28

    var body: some View {
        let tinta = color.isEmpty ? Paleta.textoSecundario : Color(hexWeb: color)
        Image(IconosCategoria.imagen(icono))
            .renderingMode(.template)
            .resizable().scaledToFit()
            .foregroundStyle(tinta)
            .padding(tam * 0.2)
            .frame(width: tam, height: tam)
            .background(tinta.opacity(0.16), in: RoundedRectangle(cornerRadius: tam * 0.3, style: .continuous))
            .accessibilityHidden(true)
    }
}

// Rejilla para elegir el icono de una categoría nueva.
struct RejillaIconos: View {
    @Binding var seleccion: String
    var color: String = ""

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 6), spacing: 8) {
            ForEach(IconosCategoria.lista) { i in
                Button { seleccion = i.clave } label: {
                    IconoCategoria(icono: i.clave, color: seleccion == i.clave ? color : "", tam: 40)
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Paleta.texto, lineWidth: seleccion == i.clave ? 2 : 0))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(i.nombre.lowercased())
                .accessibilityAddTraits(seleccion == i.clave ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(.vertical, 4)
    }
}

// La categoría de un movimiento en el editor: todas a la vista, con su icono, en vez de un desplegable.
struct SelectorCategoria: View {
    let opciones: [EditorMovimientoView.Opcion]
    @Binding var seleccion: String

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
            ficha(id: "", nombre: "sin categoría.", icono: nil, color: "")
            ForEach(opciones) { o in ficha(id: o.id, nombre: o.nombre.lowercased(), icono: o.icono ?? "other", color: o.color ?? "") }
        }
        .padding(.vertical, 4)
    }

    private func ficha(id: String, nombre: String, icono: String?, color: String) -> some View {
        let on = seleccion == id
        return Button { seleccion = id } label: {
            VStack(spacing: 4) {
                if let icono { IconoCategoria(icono: icono, color: color, tam: 30) } else {
                    Image(systemName: "circle.dashed").font(.system(size: 20)).foregroundStyle(Paleta.textoSecundario).frame(width: 30, height: 30)
                }
                Text(nombre).font(Tipo.poppins(11, on ? .semibold : .medium, estilo: .caption)).foregroundStyle(on ? Paleta.texto : Paleta.textoSecundario)
                    .lineLimit(2).multilineTextAlignment(.center).minimumScaleFactor(0.85)
            }
            .frame(maxWidth: .infinity, minHeight: 66)
            .padding(.vertical, 4)
            .background(on ? Paleta.tinteAcento : Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(on ? Paleta.acento : .clear, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(nombre)
        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
    }
}
