import WidgetKit
import SwiftUI

// Homenaje directo al anillo de marcas del reloj de Stoic — discreto, no
// compite con el número.
private struct TickRing: View {
    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            ZStack {
                ForEach(0..<16, id: \.self) { i in
                    Rectangle()
                        .fill(Color.white.opacity(0.14))
                        .frame(width: 2, height: 10)
                        .offset(y: -side / 2 + 12)
                        .rotationEffect(.degrees(Double(i) * 22.5))
                }
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .center)
            .position(x: geo.size.width / 2, y: geo.size.height / 2)
        }
    }
}

struct RachaWidgetView: View {
    var snapshot: BitacoraSnapshot

    var body: some View {
        ZStack {
            TickRing()
            VStack(alignment: .leading, spacing: 0) {
                Text("RACHA · BITÁCORA")
                    .font(.bitacora(.bold, size: 11))
                    .tracking(1.2)
                    .foregroundColor(BitacoraColor.labelMuted)

                Spacer(minLength: 6)

                VStack(alignment: .leading, spacing: 6) {
                    Text("\(snapshot.streakDays)")
                        .font(.bitacora(.black, size: 52))
                        .foregroundColor(.white)
                    Text("días actualizando")
                        .font(.bitacora(.semibold, size: 12))
                        .foregroundColor(Color(white: 0.62))
                }

                Spacer(minLength: 6)

                VStack(alignment: .leading, spacing: 7) {
                    HStack(spacing: 6) {
                        ForEach(0..<min(snapshot.tasksToday.count, 7), id: \.self) { i in
                            Circle()
                                .fill(snapshot.tasksToday[i].done ? BitacoraColor.accent : BitacoraColor.garnet)
                                .frame(width: 10, height: 10)
                        }
                    }
                    Text("TAREAS DE HOY")
                        .font(.bitacora(.bold, size: 9))
                        .tracking(0.5)
                        .foregroundColor(BitacoraColor.labelFaint)
                }
            }
        }
        .padding(18)
        .containerBackground(for: .widget) {
            BitacoraColor.cardBackground
        }
    }
}

struct RachaWidget: Widget {
    let kind = "RachaWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
            RachaWidgetView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Racha Bitácora")
        .description("Tu racha de días actualizando Bitácora y las tareas de hoy del planificador.")
        .supportedFamilies([.systemSmall])
    }
}

#Preview(as: .systemSmall) {
    RachaWidget()
} timeline: {
    SnapshotEntry(date: .now, snapshot: .placeholder)
}
