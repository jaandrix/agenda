import SwiftUI

// Piezas propias de Eventos. El bloque de fecha y la cuenta atrás viven ya en DesignSystem/V2 (BloqueFecha, CuentaAtras).

enum LetraEventos {
    static var marcaAgua: Font { Tipo.poppins(64, .bold, estilo: .largeTitle) }
}

enum MedidaEventos {
    static let qrMiniatura: CGFloat = 52
}

enum TextoEventos {
    static func horario(_ e: EventoDia) -> String? {
        guard let h = e.hora else { return nil }
        return e.fin.map { "de \(h) a \($0)" } ?? h
    }
}

extension MedidaEventos {
    static let botonQR: CGFloat = 44
}

// 3.2: el tipo del evento (eventCategoria en js/nucleo.js) da un fondo palo a su tarjeta, y la cercanía, un velo rojo
// sobre el bloque de fecha (.event-sq-day-en-N del escritorio), más oscuro cuanto más cerca.
enum TonoEventos {
    static let deportes: Set<String> = ["futbol", "baloncesto", "f1", "motogp"]
    static let categorias: Set<String> = ["social", "teatro", "cine", "concierto", "deportes", "estudios", "trabajo", "salud", "hogar", "viajes", "otro"]

    static func categoria(_ tipo: String?) -> String {
        guard let t = tipo?.lowercased(), !t.isEmpty else { return "otro" }
        if deportes.contains(t) { return "deportes" }
        return categorias.contains(t) ? t : "otro"
    }

    // 3.2, «pastel.» (la propuesta de color elegida): la tarjeta va rellena del pastel de su tipo y la segunda línea en el
    // tono oscuro de ese color. Las cinco primeras parejas son las de `Lienzo` en la rama de color (evento, cumple,
    // viaje, dinero, estudio); las otras cuatro, nuevas y de la misma familia. Todas ≥ 5:1 la tinta sobre su relleno y
    // ≥ 15:1 el título en carbón. «otro» se queda en blanco con la tinta secundaria de siempre.
    private static func c(_ v: UInt32) -> Color { Color(uiColor: UIColor(rgb: v)) }
    static let pasteles: [String: (relleno: UInt32, tinta: UInt32)] = [
        "social": (0xFFE9E2, 0xA8401F),      // coral (rellenoEvento / tintaEvento)
        "teatro": (0xFCE4EC, 0x9C2A55),      // rosa
        "cine": (0xEEE7FF, 0x5B3FA0),        // violeta (rellenoViaje / tintaViaje)
        "concierto": (0xFFF2D1, 0x80590A),   // ámbar (rellenoCumple / tintaCumple)
        "deportes": (0xDDF3E7, 0x1C6E4D),    // verde (rellenoDinero / tintaDinero)
        "estudios": (0xE3EAFF, 0x2F4FA8),    // azul (rellenoEstudio / tintaEstudio)
        "trabajo": (0xE6ECF2, 0x3E5368),     // pizarra
        "salud": (0xDDF2F0, 0x1F6B66),       // agua
        "hogar": (0xF4ECDF, 0x6B5330),       // arena
        "viajes": (0xEEE7FF, 0x5B3FA0),      // violeta
    ]

    static func relleno(_ categoria: String) -> Color? { pasteles[categoria].map { c($0.relleno) } }
    static func tinta(_ categoria: String) -> Color { pasteles[categoria].map { c($0.tinta) } ?? Lienzo.tintaSecundaria }

    // Opacidad del velo rojo (en multiplicar: oscurece fondo y letra a la vez, así el contraste se conserva). Hoy ya va en
    // naranja; tope 0,15 para que el «NOV» del bloque no baje de 4,5:1.
    static func cercania(_ dias: Int) -> Double {
        switch dias {
        case 1: 0.15
        case 2: 0.12
        case 3: 0.09
        case 4: 0.07
        case 5: 0.05
        case 6: 0.035
        default: 0
        }
    }
}

struct QREventoAbierto: Identifiable {
    let id: String
    let titulo: String
    let detalle: String
    let entradas: [EntradaQR]
}
