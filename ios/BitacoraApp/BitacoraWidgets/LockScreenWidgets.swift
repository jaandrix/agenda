import WidgetKit
import SwiftUI

// Los tres widgets de la pantalla de bloqueo. iOS los tiñe en blanco
// translúcido sobre el fondo real automáticamente — no elegimos nosotros
// el color, así que aquí no se usa BitacoraColor salvo para el propio
// contenido semántico (el sistema lo reinterpreta igualmente).

struct LockCircularView: View {
    var snapshot: BitacoraSnapshot

    // Provisional: % del presupuesto del mes hasta que el snapshot incluya
    // un dato de presupuesto real (fase 2).
    private var progress: Double { 0.68 }

    var body: some View {
        Gauge(value: min(max(progress, 0), 1)) {
            Text("Bitácora")
        } currentValueLabel: {
            Text("\(Int(progress * 100))%")
                .font(.bitacora(.bold, size: 15))
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .containerBackground(for: .widget) { Color.clear }
    }
}

struct LockScreenCircularWidget: Widget {
    let kind = "LockScreenCircularWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
            LockCircularView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Progreso (bloqueo)")
        .description("Un vistazo circular al presupuesto del mes, sin abrir la app.")
        .supportedFamilies([.accessoryCircular])
    }
}

struct LockRectangularView: View {
    var snapshot: BitacoraSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let next = snapshot.events.first {
                Text(next.title)
                    .font(.bitacora(.bold, size: 14))
                    .lineLimit(1)
                Text(next.time)
                    .font(.bitacora(.semibold, size: 13))
                    .opacity(0.75)
            } else {
                Text("Sin eventos hoy")
                    .font(.bitacora(.bold, size: 14))
            }
        }
        .containerBackground(for: .widget) { Color.clear }
    }
}

struct LockScreenRectangularWidget: Widget {
    let kind = "LockScreenRectangularWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
            LockRectangularView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Próximo evento (bloqueo)")
        .description("El siguiente evento de tu calendario de hoy, sin abrir la app.")
        .supportedFamilies([.accessoryRectangular])
    }
}

struct LockInlineView: View {
    var snapshot: BitacoraSnapshot

    var body: some View {
        Text("Bitácora · \(snapshot.streakDays) días")
            .containerBackground(for: .widget) { Color.clear }
    }
}

struct LockScreenInlineWidget: Widget {
    let kind = "LockScreenInlineWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
            LockInlineView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Racha (línea, bloqueo)")
        .description("Tu racha de Bitácora en una sola línea, junto al reloj.")
        .supportedFamilies([.accessoryInline])
    }
}

#Preview(as: .accessoryRectangular) {
    LockScreenRectangularWidget()
} timeline: {
    SnapshotEntry(date: .now, snapshot: .placeholder)
}
