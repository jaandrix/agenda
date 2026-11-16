import SwiftUI

// Solo para la prueba de interfaz (BitacoraNativeUITests, argumento -pruebaCarrusel): el carrusel de Inicio dentro
// de un ScrollView vertical y conectado como en InicioView, con la recarga de Inicio que llega tarde y una sincronización
// de fondo que vuelve a escribir el mismo día. Así se prueba el carrusel real sin sesión ni red.
struct PruebaCarruselView: View {
    static var activa: Bool { ProcessInfo.processInfo.arguments.contains("-pruebaCarrusel") }

    @State private var dia = LocalDay(iso: "2026-11-12")!
    @State private var elegido: LocalDay?
    @State private var revision = 0
    private let hoy = LocalDay(iso: "2026-11-12")!

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                CarruselDias(dias: dia.semanaLunesDomingo, dia: dia, hoy: hoy, conCosas: [hoy], elegir: { elegido = $0 })
                Text(dia.inicioSemanaLunes.iso).accessibilityIdentifier("semana-cargada")
                ForEach(0..<30, id: \.self) { Text("fila \($0)").frame(height: 44) }
            }
            .padding(.horizontal, 20)
        }
        .task(id: "\(revision)-\(elegido?.iso ?? "")") {
            let objetivo = elegido
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled, elegido == objetivo else { return }
            dia = objetivo ?? hoy
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(700))
                revision += 1
            }
        }
    }
}
