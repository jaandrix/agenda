import WidgetKit
import SwiftUI

// WidgetKit no permite teclados ni campos de texto dentro del propio
// widget, así que un importe libre no se puede registrar sin abrir la
// app. Cada mitad es un enlace (bitacora://quick?type=…) que la app
// nativa intercepta en ContentView.swift y usa para abrir directamente
// el registro rápido de Finanzas PRO ya preparado en ese tipo — ver
// handleWidgetDeepLink() en app.js.
struct RegistroRapidoWidgetView: View {
    var body: some View {
        HStack(spacing: 0) {
            Link(destination: URL(string: "bitacora://quick?type=expense")!) {
                quickTile(
                    icon: "minus.circle.fill",
                    iconColor: BitacoraColor.garnet,
                    label: "+ Gasto"
                )
            }
            Rectangle()
                .fill(Color.white.opacity(0.08))
                .frame(width: 1)
                .padding(.vertical, 16)
            Link(destination: URL(string: "bitacora://quick?type=income")!) {
                quickTile(
                    icon: "plus.circle.fill",
                    iconColor: BitacoraColor.good,
                    label: "+ Ingreso"
                )
            }
        }
        .containerBackground(for: .widget) {
            BitacoraColor.cardBackground
        }
    }

    private func quickTile(icon: String, iconColor: Color, label: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(iconColor)
            Text(label)
                .font(.system(size: 16, weight: .heavy, design: .rounded))
                .foregroundColor(.white)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .contentShape(Rectangle())
    }
}

struct RegistroRapidoWidget: Widget {
    let kind = "RegistroRapidoWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { _ in
            RegistroRapidoWidgetView()
        }
        .configurationDisplayName("Registro rápido")
        .description("Abre Finanzas PRO directo al registro rápido de un gasto o un ingreso.")
        .supportedFamilies([.systemMedium])
    }
}

#Preview(as: .systemMedium) {
    RegistroRapidoWidget()
} timeline: {
    SnapshotEntry(date: .now, snapshot: .placeholder)
}
