import SwiftUI

// `subtasks` de la tarea (addPlannerSubtask en js/planificador.js).
struct Subtarea: Identifiable, Equatable { let id: String; let texto: String; var hecha: Bool }

struct EditorTareaView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let inicial: EditorTarea

    @State private var titulo = ""
    @State private var notas = ""
    @State private var conHora = false
    @State private var hora = Date()
    @State private var dia: LocalDay?
    @State private var prioridad = ""
    @State private var guardando = false
    @State private var confirmarBorrado = false
    @State private var error: String?
    @State private var recordar = ""
    @State private var recordarCuando = Date().addingTimeInterval(3600)
    @State private var recordarAntes: JSONValue?
    @State private var subtareas: [Subtarea] = []
    @State private var nuevaSubtarea = ""
    @FocusState private var enfocado: Bool

    // El id viene decidido al abrir: si «guardar.» llega dos veces, las dos llevan el mismo y la tarea sale una vez.
    init(inicial: EditorTarea) {
        self.inicial = inicial
        _titulo = State(initialValue: inicial.titulo)
        _notas = State(initialValue: inicial.notas)
        _dia = State(initialValue: inicial.dia)
        _prioridad = State(initialValue: inicial.prioridad ?? "")
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
                        // Cualquier otro día, no solo hoy, mañana y pasado (mover a una fecha concreta).
                        DatePicker("fecha.", selection: fechaElegida, displayedComponents: .date)
                            .environment(\.locale, Locale(identifier: "es_ES"))
                        Toggle("a una hora.", isOn: $conHora.animation(.easeOut(duration: 0.15)))
                        if conHora {
                            DatePicker("hora.", selection: $hora, displayedComponents: .hourAndMinute)
                                .environment(\.locale, Locale(identifier: "es_ES"))
                        }
                    }
                    Picker("prioridad.", selection: $prioridad) {
                        Text("ninguna.").tag("")
                        Text("alta.").tag("alta")
                        Text("media.").tag("media")
                        Text("baja.").tag("baja")
                    }
                    Picker("recordarme.", selection: $recordar) {
                        Text("no.").tag("")
                        if conHora && dia != nil { Text("a la hora de la tarea.").tag("hora") }
                        Text("a una hora concreta.").tag("fecha")
                    }
                    if recordar == "fecha" {
                        DatePicker("cuándo.", selection: $recordarCuando, displayedComponents: [.date, .hourAndMinute])
                            .environment(\.locale, Locale(identifier: "es_ES"))
                    }
                } footer: {
                    if let error { Text(error).foregroundStyle(Paleta.error) }
                    else if inicial.deTrabajo { Text("viene de estudios o de un proyecto: se cambia allí, en la web. aquí solo se marca.") }
                }
                .listRowBackground(Paleta.superficie)
                }
                .disabled(inicial.deTrabajo)
                if !inicial.nueva {
                    Section("subtareas.") {
                        ForEach(subtareas) { s in
                            Button { marcarSubtarea(s.id, !s.hecha) } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: s.hecha ? "checkmark.circle.fill" : "circle").foregroundStyle(s.hecha ? Paleta.acento : Paleta.aro)
                                    Text(s.texto).foregroundStyle(s.hecha ? Paleta.textoSecundario : Paleta.texto).strikethrough(s.hecha)
                                }
                                .frame(minHeight: 36)
                            }
                            .buttonStyle(.plain)
                            .swipeActions { Button("quitar.", role: .destructive) { quitarSubtarea(s.id) } }
                            .accessibilityValue(s.hecha ? "hecha" : "pendiente")
                        }
                        HStack {
                            TextField("+ subtarea.", text: $nuevaSubtarea).submitLabel(.done).onSubmit { anadirSubtarea() }
                            if !nuevaSubtarea.trimmingCharacters(in: .whitespaces).isEmpty {
                                Button("añadir.") { anadirSubtarea() }.foregroundStyle(Paleta.acento)
                            }
                        }
                    }
                    .listRowBackground(Paleta.superficie)
                }
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
            .task { await leerExtras() }
        }
        .presentationDetents([.medium, .large])
    }

    private var hoy: LocalDay { CalendarioBitacora.madrid.diaLogico(Date()) }

    private var opcionesDia: [LocalDay?] {
        var r: [LocalDay?] = [hoy, hoy.sumando(dias: 1), hoy.sumando(dias: 2), nil]
        if let d = inicial.dia, !r.contains(d) { r.insert(d, at: 0) }
        if let d = dia, !r.contains(d) { r.insert(d, at: 0) }
        return r
    }

    private var fechaElegida: Binding<Date> {
        Binding {
            var cal = Calendar(identifier: .gregorian)
            cal.timeZone = CalendarioBitacora.madrid.zona
            let d = dia ?? hoy
            return cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12)) ?? Date()
        } set: { dia = CalendarioBitacora.madrid.dia(de: $0) }
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
            var extra: [String: String] = [:]
            if !notasLimpias.isEmpty { extra["notes"] = notasLimpias }
            if !prioridad.isEmpty { extra["prioridad"] = prioridad }
            if !extra.isEmpty { ops.append(.parcharTarea(id: inicial.id, campos: extra)) }
        } else {
            if dia != inicial.dia { ops.append(.moverTarea(id: inicial.id, dia: dia?.iso)) }
            // Solo lo que cambió: si la web tocó otro campo mientras tanto, se queda.
            var campos: [String: String] = [:]
            if limpio != inicial.titulo { campos["title"] = limpio }
            if notasLimpias != inicial.notas { campos["notes"] = notasLimpias }
            if horaTexto != inicial.hora { campos["time"] = horaTexto ?? "" }
            if prioridad != (inicial.prioridad ?? "") { campos["prioridad"] = prioridad }
            if !campos.isEmpty { ops.append(.parcharTarea(id: inicial.id, campos: campos)) }
        }
        if let r = recordatorioNuevo, r != (recordarAntes ?? .null) {
            ops.append(OperacionesExtra.op(OperacionesExtra.recordatorio, ["id": .string(inicial.id), "valor": r]))
            if r != .null { _ = await Recordatorios.pedirPermiso() }
        }
        await enviar(ops)
    }

    private var recordatorioNuevo: JSONValue? {
        switch recordar {
        case "hora": return conHora && dia != nil ? .object(["tipo": .string("hora")]) : .null
        case "fecha":
            var cal = Calendar(identifier: .gregorian)
            cal.timeZone = CalendarioBitacora.madrid.zona
            let p = cal.dateComponents([.year, .month, .day, .hour, .minute], from: recordarCuando)
            return .object(["tipo": .string("fecha"), "cuando": .string(String(format: "%04d-%02d-%02dT%02d:%02d", p.year ?? 0, p.month ?? 0, p.day ?? 0, p.hour ?? 0, p.minute ?? 0))])
        default: return .null
        }
    }

    // Lo que no viaja en EditorTarea: el recordatorio y las subtareas, leídos de la tarea guardada.
    private func leerExtras() async {
        guard !inicial.nueva, let doc = await c.documentoVisible() else { return }
        let p = AplicarOperaciones.planificador((try? doc.valor(de: "dayPlanner")) ?? nil)
        guard let sitio = AplicarOperaciones.buscar(inicial.id, en: p), let t = AplicarOperaciones.tareaEn(sitio, p) else { return }
        subtareas = (t["subtasks"]?.lista ?? []).compactMap { x in
            guard let id = x["id"]?.comoId else { return nil }
            return Subtarea(id: id, texto: x["text"]?.texto ?? "", hecha: x["done"]?.booleano == true)
        }
        guard let r = t["recordatorio"], r != .null else { return }
        recordarAntes = r
        recordar = r["tipo"]?.texto ?? ""
        if case .dia(let d, _) = sitio, let f = Recordatorios.cuando(r, dia: d, hora: t["time"]?.texto) { recordarCuando = f }
        else if let f = Recordatorios.cuando(r, dia: nil, hora: nil) { recordarCuando = f }
    }

    private func anadirSubtarea() {
        let texto = nuevaSubtarea.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !texto.isEmpty else { return }
        let id = "sub_\(Int64(Date().timeIntervalSince1970 * 1000))_\(String(UUID().uuidString.prefix(4)).lowercased())"
        subtareas.append(Subtarea(id: id, texto: texto, hecha: false))
        nuevaSubtarea = ""
        Task { try? await c.encolar(OperacionesExtra.op(OperacionesExtra.subtarea, ["id": .string(inicial.id), "subId": .string(id), "texto": .string(texto)])) }
    }

    private func marcarSubtarea(_ sid: String, _ hecha: Bool) {
        if let n = subtareas.firstIndex(where: { $0.id == sid }) { subtareas[n].hecha = hecha }
        Task { try? await c.encolar(OperacionesExtra.op(OperacionesExtra.marcarSubtarea, ["id": .string(inicial.id), "subId": .string(sid), "hecha": .bool(hecha)])) }
    }

    private func quitarSubtarea(_ sid: String) {
        subtareas.removeAll { $0.id == sid }
        Task { try? await c.encolar(OperacionesExtra.op(OperacionesExtra.quitarSubtarea, ["id": .string(inicial.id), "subId": .string(sid)])) }
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
