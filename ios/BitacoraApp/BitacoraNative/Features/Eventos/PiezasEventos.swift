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
