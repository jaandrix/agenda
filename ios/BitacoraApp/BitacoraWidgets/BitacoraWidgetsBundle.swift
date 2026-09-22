import WidgetKit
import SwiftUI

@main
struct BitacoraWidgetsBundle: WidgetBundle {
    var body: some Widget {
        RachaWidget()
        FinanzasWidget()
        RegistroRapidoWidget()
        LockScreenCircularWidget()
        LockScreenRectangularWidget()
        LockScreenInlineWidget()
    }
}

// ============================================================
//  Proveedor compartido — todos los widgets leen el mismo
//  BitacoraSnapshot desde el App Group. No hay nada que calcular
//  aquí: el cálculo (racha, tareas, saldo...) lo hace la web y lo
//  deja ya preparado; el widget solo lee y pinta.
// ============================================================
struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: BitacoraSnapshot
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry {
        SnapshotEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(SnapshotEntry(date: Date(), snapshot: BitacoraSnapshot.load() ?? .placeholder))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        let entry = SnapshotEntry(date: Date(), snapshot: BitacoraSnapshot.load() ?? .placeholder)
        // La app pide un refresco (WidgetCenter.reloadAllTimelines) cada vez
        // que hay un dato nuevo de verdad, así que este límite es solo una
        // red de seguridad por si la app no se abre en un rato.
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// Paleta compartida — mismos valores que el mockup aprobado (Widgets de
// Bitácora), no el azul/verde por defecto de iOS.
enum BitacoraColor {
    static let cardBackground = Color(red: 0.055, green: 0.059, blue: 0.075)
    static let accent = Color(red: 0.373, green: 0.553, blue: 0.984)
    static let garnet = Color(red: 0.557, green: 0.204, blue: 0.275)
    static let good = Color(red: 0.310, green: 0.808, blue: 0.561)
    static let bad = Color(red: 0.863, green: 0.353, blue: 0.353)
    static let labelMuted = Color(white: 0.55)
    static let labelFaint = Color(white: 0.38)
}
