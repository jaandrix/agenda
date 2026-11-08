import SwiftUI

struct EditorTareaView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let inicial: EditorTarea

    @State private var titulo = ""
    @State private var notas = ""
    @State private var conHora = false
    @State private var hora = Date()
    @State private var dia: LocalDay?
    @State private var guardando = false
    @State private var confirmarBorrado = false
    @State private var error: String?
    @FocusState private var enfocado: Bool

    // El id viene decidido al abrir: si «guardar.» llega dos veces, las dos llevan el mismo y la tarea sale una vez.
    init(inicial: EditorTarea) {
        self.inicial = inicial
        _titulo = State(initialValue: inicial.titulo)
        _notas = State(initialValue: inicial.notas)
        _dia = State(initialValue: inicial.dia)
        if let h = inicial.hora, let fecha = EditorTareaView.fecha(de: h) {
            _conHora = State(initialValue: true)
            _hora = State(initialValue: fecha)
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Group {
                Section {
                    TextField("qué hay que hacer.", text: $titulo, axis: .vertical)
                        .focused($enfocado)
                    TextField("notas.", text: $notas, axis: .vertical)
                        .lineLimit(1...4)
                }
                .listRowBackground(Paleta.superficie)
                Section {
                    Picker("día.", selection: $dia) {
                        ForEach(opcionesDia, id: \.self) { d in Text(nombre(d)).tag(d) }
                    }
                    if dia != nil {
                        Toggle("a una hora.", isOn: $conHora.animation(.easeOut(duration: 0.15)))
                        if conHora {
                            DatePicker("hora.", selection: $hora, displayedComponents: .hourAndMinute)
                                .environment(\.locale, Locale(identifier: "es_ES"))
                        }
                    }
                } footer: {
                    if let error { Text(error).foregroundStyle(Paleta.error) }
                    else if inicial.deTrabajo { Text("viene de estudios o de un proyecto: se cambia allí, en la web. aquí solo se marca.") }
                }
                .listRowBackground(Paleta.superficie)
                }
                .disabled(inicial.deTrabajo)
                if !inicial.nueva && !inicial.deTrabajo {
                    Section {
                        Button("borrar.", role: .destructive) { confirmarBorrado = true }
                    }
                    .listRowBackground(Paleta.superficie)
                }
            }
            .font(Tipo.cuerpo)
            .scrollContentBackground(.hidden)
            .background(Paleta.fondo)
            .navigationTitle(inicial.nueva ? "nueva tarea." : "tarea.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") { Task { await guardar() } }.disabled(guardando || limpio.isEmpty || inicial.deTrabajo)
                }
            }
            .confirmationDialog("¿borrar esta tarea?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("borrar.", role: .destructive) { Task { await enviar([.borrarTarea(id: inicial.id)]) } }
                Button("cancelar.", role: .cancel) {}
            }
            .onAppear { if inicial.nueva { enfocado = true } }
        }
        .presentationDetents([.medium, .large])
    }

    private var hoy: LocalDay { CalendarioBitacora.madrid.diaLogico(Date()) }

    private var opcionesDia: [LocalDay?] {
        var r: [LocalDay?] = [hoy, hoy.sumando(dias: 1), hoy.sumando(dias: 2), nil]
        if let d = inicial.dia, !r.contains(d) { r.insert(d, at: 0) }
        return r
    }

    private func nombre(_ d: LocalDay?) -> String {
        guard let d else { return "sin día." }
        if d == hoy { return "hoy." }
        if d == hoy.sumando(dias: 1) { return "mañana." }
        if d == hoy.sumando(dias: 2) { return "pasado mañana." }
        return d.iso
    }

    private var limpio: String { String(titulo.trimmingCharacters(in: .whitespacesAndNewlines).prefix(500)) }
    private var notasLimpias: String { String(notas.trimmingCharacters(in: .whitespacesAndNewlines).prefix(2000)) }

    private var horaTexto: String? {
        guard conHora, dia != nil else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let c = cal.dateComponents([.hour, .minute], from: hora)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    private static func fecha(de h: String) -> Date? {
        let p = h.split(separator: ":").compactMap { Int($0) }
        guard p.count >= 2 else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        return cal.date(bySettingHour: p[0], minute: p[1], second: 0, of: Date())
    }

    private func guardar() async {
        guard !limpio.isEmpty else { return }
        guard !inicial.deTrabajo else { return }
        var ops: [OperacionBitacora] = []
        if inicial.nueva {
            ops.append(.crearTarea(id: inicial.id, dia: dia?.iso, titulo: limpio, hora: horaTexto))
            if !notasLimpias.isEmpty { ops.append(.parcharTarea(id: inicial.id, campos: ["notes": notasLimpias])) }
        } else {
            if dia != inicial.dia { ops.append(.moverTarea(id: inicial.id, dia: dia?.iso)) }
            // Solo lo que cambió: si la web tocó otro campo mientras tanto, se queda.
            var campos: [String: String] = [:]
            if limpio != inicial.titulo { campos["title"] = limpio }
            if notasLimpias != inicial.notas { campos["notes"] = notasLimpias }
            if horaTexto != inicial.hora { campos["time"] = horaTexto ?? "" }
            if !campos.isEmpty { ops.append(.parcharTarea(id: inicial.id, campos: campos)) }
        }
        await enviar(ops)
    }

    private func enviar(_ ops: [OperacionBitacora]) async {
        guard !guardando else { return }
        guardando = true
        defer { guardando = false }
        do {
            if !ops.isEmpty { try await c.encolar(ops) }
            cerrar()
        } catch {
            self.error = "no se pudo guardar en este iPhone."
        }
    }
}
