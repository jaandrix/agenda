import Foundation

// 0.23 (auditoría, cargas desordenadas): cada vista calculaba su modelo con Task.detached y lo escribía en @State al
// volver, aunque mientras tanto hubiera empezado otra carga más nueva; si la vieja acababa después, devolvía datos
// viejos (casillas que se desmarcaban, ajustes que volvían atrás). Con esto cada carga lleva su turno y solo la última
// pedida desde ese sitio publica: nil si la tarea se canceló o llegó otra después.
@MainActor
enum UltimaGana {
    private static var contador = 0
    private static var ultimo: [String: Int] = [:]

    static func calcular<T: Sendable>(_ sitio: String, prioridad: TaskPriority, _ f: @escaping @Sendable () -> T) async -> T? {
        contador += 1
        let turno = contador
        ultimo[sitio] = turno
        let r = await Task.detached(priority: prioridad, operation: f).value
        guard !Task.isCancelled, ultimo[sitio] == turno else { return nil }
        return r
    }
}

// Calcula fuera del hilo principal; nil si la carga ya no es la última (no hay que publicar nada).
@MainActor
func ultimaGana<T: Sendable>(_ prioridad: TaskPriority = .userInitiated, archivo: String = #fileID, linea: Int = #line, _ f: @escaping @Sendable () -> T) async -> T? {
    await UltimaGana.calcular("\(archivo):\(linea)", prioridad: prioridad, f)
}
