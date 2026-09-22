import Foundation

/// Resumen que la web dentro de la app nativa (ver ContentView.swift) deja
/// escrito en el App Group tras cada cambio real, para que los widgets
/// (que corren en un proceso aparte, sin acceso a la web) puedan leerlo sin
/// conexión. Ver la función `bitacoraSnapshotPayload()` en app.js — su
/// forma tiene que coincidir exactamente con esta struct.
struct BitacoraSnapshot: Codable {
    struct TaskState: Codable {
        let done: Bool
    }

    struct EventItem: Codable {
        let time: String
        let title: String
    }

    var streakDays: Int
    var tasksToday: [TaskState]
    var balance: Double
    var balancePct: Double?
    var events: [EventItem]
    var updatedAtISO: String

    static let appGroupID = "group.com.bitacora.app"
    static let defaultsKey = "bitacora.snapshot.v1"

    static func load() -> BitacoraSnapshot? {
        guard let defaults = UserDefaults(suiteName: appGroupID),
              let data = defaults.data(forKey: defaultsKey) else { return nil }
        return try? JSONDecoder().decode(BitacoraSnapshot.self, from: data)
    }

    /// Datos de muestra — solo para las vistas previas de Xcode y como
    /// último recurso si todavía no ha llegado ningún snapshot real (recién
    /// instalada la app, antes de abrirla una vez).
    static var placeholder: BitacoraSnapshot {
        BitacoraSnapshot(
            streakDays: 12,
            tasksToday: [
                TaskState(done: true), TaskState(done: true), TaskState(done: true),
                TaskState(done: true), TaskState(done: true),
                TaskState(done: false), TaskState(done: false)
            ],
            balance: 1248.50,
            balancePct: 3.2,
            events: [
                EventItem(time: "10:00", title: "Reunión de equipo"),
                EventItem(time: "13:30", title: "Comida con Marta"),
                EventItem(time: "18:00", title: "Gimnasio")
            ],
            updatedAtISO: ISO8601DateFormatter().string(from: Date())
        )
    }
}
