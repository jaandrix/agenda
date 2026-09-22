import WidgetKit
import SwiftUI

private struct Sparkline: View {
    // Trazo de muestra — hasta que tengamos histórico real en el snapshot
    // (fase 2), representa la tendencia con una forma plausible en vez de
    // una línea plana sin significado.
    let points: [CGFloat] = [0.78, 0.64, 0.7, 0.42, 0.5, 0.16, 0.24]

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            Path { path in
                for (i, p) in points.enumerated() {
                    let x = w * CGFloat(i) / CGFloat(points.count - 1)
                    let y = h * p
                    if i == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
                }
            }
            .stroke(BitacoraColor.accent, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
        }
    }
}

struct FinanzasWidgetView: View {
    var snapshot: BitacoraSnapshot

    var body: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 8) {
                Text("SITUACIÓN FINANCIERA")
                    .font(.bitacora(.bold, size: 11))
                    .tracking(1.2)
                    .foregroundColor(BitacoraColor.labelMuted)
                Text(formattedBalance)
                    .font(.bitacora(.black, size: 30))
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                if let pct = snapshot.balancePct {
                    Text(String(format: "%+.1f%%", pct))
                        .font(.bitacora(.bold, size: 13))
                        .foregroundColor(pct >= 0 ? BitacoraColor.good : BitacoraColor.bad)
                }
            }
            Spacer(minLength: 12)
            Sparkline()
                .frame(width: 90, height: 48)
        }
        .padding(20)
        .containerBackground(for: .widget) {
            BitacoraColor.cardBackground
        }
    }

    private var formattedBalance: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        formatter.groupingSeparator = "."
        formatter.decimalSeparator = ","
        let n = formatter.string(from: NSNumber(value: snapshot.balance)) ?? "0,00"
        return "\(n) €"
    }
}

struct FinanzasWidget: Widget {
    let kind = "FinanzasWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
            FinanzasWidgetView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Situación financiera")
        .description("Tu saldo de Finanzas PRO y su variación frente al mes anterior.")
        .supportedFamilies([.systemMedium])
    }
}

#Preview(as: .systemMedium) {
    FinanzasWidget()
} timeline: {
    SnapshotEntry(date: .now, snapshot: .placeholder)
}
