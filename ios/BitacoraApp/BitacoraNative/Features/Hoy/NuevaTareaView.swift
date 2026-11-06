import SwiftUI

struct NuevaTareaView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let dia: LocalDay

    // El id se decide al abrir: si «guardar.» llega dos veces, las dos llevan el mismo y la tarea sale una vez.
    @State private var id = OperacionBitacora.nuevoIdTarea()
    @State private var titulo = ""
    @State private var conHora = false
    @State private var hora = Date()
    @State private var guardando = false
    @State private var error: String?
    @FocusState private var enfocado: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("qué hay que hacer.", text: $titulo, axis: .vertical)
                        .font(Tipo.cuerpo)
                        .focused($enfocado)
                        .submitLabel(.done)
                        .onSubmit { Task { await guardar() } }
                    Toggle("a una hora.", isOn: $conHora.animation(.easeOut(duration: 0.15)))
                        .font(Tipo.cuerpo)
                    if conHora {
                        DatePicker("hora.", selection: $hora, displayedComponents: .hourAndMinute)
                            .font(Tipo.cuerpo)
                            .environment(\.locale, Locale(identifier: "es_ES"))
                    }
                } footer: {
                    if let error { Text(error).foregroundStyle(Paleta.error) }
                }
                .listRowBackground(Paleta.superficie)
            }
            .scrollContentBackground(.hidden)
            .background(Paleta.fondo)
            .navigationTitle("nueva tarea.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("cancelar.") { cerrar() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") { Task { await guardar() } }
                        .disabled(guardando || limpio.isEmpty)
                }
            }
            .onAppear { enfocado = true }
        }
        .presentationDetents([.medium])
    }

    private var limpio: String { titulo.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var horaTexto: String? {
        guard conHora else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let c = cal.dateComponents([.hour, .minute], from: hora)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    private func guardar() async {
        guard !guardando, !limpio.isEmpty else { return }
        guardando = true
        defer { guardando = false }
        do {
            try await c.encolar(.crearTarea(id: id, dia: dia.iso, titulo: String(limpio.prefix(500)), hora: horaTexto))
            cerrar()
        } catch {
            self.error = "no se pudo guardar en este iPhone."
        }
    }
}
