import SwiftUI

// Histéresis del estado de la nube en la barra de Inicio. Cada sincronización corta (la bandeja, volver a la app)
// pasaba de «sincronizando.» al tiempo y vuelta en milisegundos, y el hueco parpadeaba varias veces seguidas.
// Un estado que no es reposo solo se enseña si dura `aparecer`; una vez enseñado, se queda al menos `minimo`.
enum HisteresisSync {
    static let aparecer: TimeInterval = 0.4
    static let minimo: TimeInterval = 1.2

    // Qué hacer con un estado nuevo: esperar `espera` segundos y, si sigue igual, enseñar `estado`.
    static func siguiente(real: EstadoSync, visible: EstadoSync, visibleDesde: Date, ahora: Date) -> (espera: TimeInterval, estado: EstadoSync)? {
        if real == visible { return nil }
        if visible == .reposo { return (aparecer, real) }
        let resta = minimo - ahora.timeIntervalSince(visibleDesde)
        return (max(0, resta), real)
    }
}

// El tiempo solo cambia de vista si cambia lo que se ve (no la hora de la consulta).
struct TiempoBarra: View, Equatable {
    let temp: Int
    let tipo: String
    let ciudad: String
    let color: Color
    let abrir: () -> Void

    static func == (a: TiempoBarra, b: TiempoBarra) -> Bool { a.temp == b.temp && a.tipo == b.tipo && a.ciudad == b.ciudad && a.color == b.color }

    var body: some View {
        Button(action: abrir) {
            HStack(spacing: 6) {
                Image(systemName: Tiempo.simbolo[tipo] ?? "cloud.fill").font(.system(size: Tipo.tamano(15)))
                Text("\(temp)°").font(Tipo.poppins(15, .semibold)).monospacedDigit()
            }
            .foregroundStyle(color)
            .frame(minWidth: 44, minHeight: 44, alignment: .trailing)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(ciudad): \(Tiempo.texto[tipo] ?? ""), \(temp) grados")
    }
}

// Un solo hueco para la nube y el tiempo: los dos están siempre puestos y solo cambia cuál se ve, con un fundido.
// Así no compiten por el sitio ni encadenan animaciones de entrada y salida.
struct HuecoNubeTiempo: View {
    let estado: EstadoSync
    let tiempo: Tiempo?
    let ciudad: String
    let color: Color
    let abrirTiempo: () -> Void
    @State private var visible: EstadoSync = .reposo
    @State private var desde = Date.distantPast
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        let nube = visible != .reposo
        ZStack(alignment: .trailing) {
            if let t = tiempo {
                TiempoBarra(temp: Int(t.temp.rounded()), tipo: t.tipo, ciudad: ciudad, color: color, abrir: abrirTiempo)
                    .equatable()
                    .opacity(nube ? 0 : 1)
                    .allowsHitTesting(!nube)
                    .accessibilityHidden(nube)
            }
            IndicadorSync(estado: nube ? visible : .trayendo)
                .opacity(nube ? 1 : 0)
                .accessibilityHidden(!nube)
        }
        .animation(sinMovimiento ? nil : .easeOut(duration: 0.18), value: nube)
        .task(id: estado) { await seguir(estado) }
    }

    private func seguir(_ real: EstadoSync) async {
        guard let paso = HisteresisSync.siguiente(real: real, visible: visible, visibleDesde: desde, ahora: Date()) else { return }
        if paso.espera > 0 { try? await Task.sleep(for: .seconds(paso.espera)) }
        guard !Task.isCancelled else { return }
        if visible == .reposo || paso.estado == .reposo { desde = Date() }
        visible = paso.estado
    }
}
