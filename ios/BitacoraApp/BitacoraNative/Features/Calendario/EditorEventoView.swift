import SwiftUI

struct EditorEvento: Identifiable, Equatable {
    let id: String
    let nuevo: Bool
    var fecha: LocalDay
    var hora: String?
    var titulo = ""
    var lugar = ""
    var notas = ""
}

struct EditorEventoView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let inicial: EditorEvento

    @State private var titulo: String
    @State private var lugar: String
    @State private var notas: String
    @State private var fecha: Date
    @State private var conHora: Bool
    @State private var hora: Date
    @State private var guardando = false
    @State private var confirmarBorrado = false
    @State private var error: String?
    @FocusState private var enfocado: Bool

    private static var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = CalendarioBitacora.madrid.zona
        return c
    }

    init(inicial: EditorEvento) {
        self.inicial = inicial
        _titulo = State(initialValue: inicial.titulo)
        _lugar = State(initialValue: inicial.lugar)
        _notas = State(initialValue: inicial.notas)
        let f = Self.cal.date(from: DateComponents(year: inicial.fecha.year, month: inicial.fecha.month, day: inicial.fecha.day, hour: 12)) ?? Date()
        _fecha = State(initialValue: f)
        let p = (inicial.hora ?? "").split(separator: ":").compactMap { Int($0) }
        _conHora = State(initialValue: p.count >= 2)
        _hora = State(initialValue: p.count >= 2 ? (Self.cal.date(bySettingHour: p[0], minute: p[1], second: 0, of: f) ?? f) : (Self.cal.date(bySettingHour: 10, minute: 0, second: 0, of: f) ?? f))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("qué es.", text: $titulo).focused($enfocado)
                    TextField("dónde.", text: $lugar)
                    TextField("notas.", text: $notas, axis: .vertical).lineLimit(1...4)
                }
                .listRowBackground(Paleta.superficie)
                Section {
                    DatePicker("día.", selection: $fecha, displayedComponents: .date)
                    Toggle("a una hora.", isOn: $conHora.animation(.easeOut(duration: 0.15)))
                    if conHora { DatePicker("hora.", selection: $hora, displayedComponents: .hourAndMinute) }
                } footer: {
                    if let error { Text(error).foregroundStyle(Paleta.error) }
                }
                .listRowBackground(Paleta.superficie)
                .environment(\.locale, Locale(identifier: "es_ES"))
                if !inicial.nuevo {
                    Section { Button("borrar.", role: .destructive) { confirmarBorrado = true } }.listRowBackground(Paleta.superficie)
                }
            }
            .font(Tipo.cuerpo)
            .scrollContentBackground(.hidden)
            .background(Paleta.fondo)
            .navigationTitle(inicial.nuevo ? "nuevo evento." : "evento.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") { Task { await enviar(guardado) } }.disabled(guardando || limpio(titulo).isEmpty)
                }
            }
            .confirmationDialog("¿borrar este evento?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("borrar.", role: .destructive) { Task { await enviar(.borrarEntrada(id: inicial.id)) } }
                Button("cancelar.", role: .cancel) {}
            }
            .onAppear { if inicial.nuevo { enfocado = true } }
        }
        .presentationDetents([.large])
    }

    private func limpio(_ s: String, _ max: Int = 500) -> String { String(s.trimmingCharacters(in: .whitespacesAndNewlines).prefix(max)) }

    private var guardado: OperacionBitacora {
        let d = Self.cal.dateComponents([.year, .month, .day], from: fecha)
        let dia = LocalDay(year: d.year!, month: d.month!, day: d.day!)!
        let h = Self.cal.dateComponents([.hour, .minute], from: hora)
        let horaTexto = conHora ? String(format: "%02d:%02d", h.hour ?? 0, h.minute ?? 0) : nil
        if inicial.nuevo {
            return .guardarEvento(id: inicial.id, fecha: dia.iso, hora: horaTexto, titulo: limpio(titulo), lugar: limpio(lugar), notas: limpio(notas, 2000))
        }
        // Solo lo que cambió: si la web tocó otro campo mientras tanto, se queda.
        var campos: [String: String] = [:]
        if limpio(titulo) != inicial.titulo { campos["title"] = limpio(titulo) }
        if limpio(lugar) != inicial.lugar { campos["place"] = limpio(lugar) }
        if limpio(notas, 2000) != inicial.notas { campos["notes"] = limpio(notas, 2000) }
        if dia != inicial.fecha { campos["date"] = dia.iso }
        if horaTexto != inicial.hora { campos["time"] = horaTexto ?? "" }
        return .parcharEvento(id: inicial.id, campos: campos)
    }

    // El id viene decidido al abrir: dos toques en «guardar.» guardan el mismo evento una vez.
    private func enviar(_ op: OperacionBitacora) async {
        guard !guardando else { return }
        guardando = true
        defer { guardando = false }
        do {
            try await c.encolar(op)
            cerrar()
        } catch {
            self.error = "no se pudo guardar en este iPhone."
        }
    }
}
