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

    // Todos dejan la tinta y la tinta secundaria por encima de 4,5:1 (ver TonoPanorama). «otro» se queda en blanco.
    static func fondo(_ categoria: String) -> Color {
        switch categoria {
        case "social": TonoPanorama.melocoton
        case "teatro": TonoPanorama.rosa
        case "cine": TonoPanorama.lavanda
        case "concierto": TonoPanorama.mantequilla
        case "deportes": TonoPanorama.salvia
        case "estudios", "viajes": TonoPanorama.niebla
        case "trabajo": TonoPanorama.arena
        case "salud": TonoPanorama.salvia
        case "hogar": TonoPanorama.crudo
        default: Lienzo.tarjeta
        }
    }

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
