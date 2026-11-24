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
    @State private var descartar = false
    @State private var error: String?
    @State private var recordar = ""
    @State private var recordarCuando = Date().addingTimeInterval(3600)
    @State private var recordarAntes: JSONValue?
    @State private var subtareas: [Subtarea] = []
    @State private var nuevaSubtarea = ""
    @FocusState private var focoSubtarea: Bool
    @FocusState private var enfocado: Bool
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

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
            ScrollView {
                VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                    Group {
                        textos
                        cuando
                        ajustes
                    }
                    .disabled(inicial.deTrabajo)
                    if let error {
                        Text(error).font(Letra.pie).foregroundStyle(Lienzo.negativo).padding(.horizontal, Medida.xxs)
                    } else if inicial.deTrabajo {
                        Text("viene de estudios o de un proyecto: se cambia allí, en la web. aquí solo se marca.")
                            .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).padding(.horizontal, Medida.xxs)
                    }
                    if !inicial.nueva { tarjetaSubtareas }
                    if !inicial.nueva && !inicial.deTrabajo {
                        Button { confirmarBorrado = true } label: { Text("borrar tarea.").foregroundStyle(Lienzo.negativo) }
                            .buttonStyle(.capsula(.blanco, ancho: true))
                            .padding(.top, Medida.xs)
                    }
                }
                .padding(.horizontal, Medida.margen)
                .padding(.top, Medida.xs)
                .padding(.bottom, Medida.xl)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .fondoLienzo()
            .tint(Lienzo.naranja)
            .safeAreaInset(edge: .bottom) {
                if !inicial.deTrabajo {
                    Button { Task { await guardar() } } label: { Text(guardando ? "guardando." : "guardar.") }
                        .buttonStyle(.capsula(.oscuro, ancho: true))
                        .disabled(guardando || limpio.isEmpty)
                        .padding(.horizontal, Medida.margen)
                        .padding(.vertical, Medida.xs)
                        .background { Lienzo.fondo.ignoresSafeArea() }
                }
            }
            .navigationTitle(inicial.nueva ? "nueva tarea." : "tarea.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { if cambiado { descartar = true } else { cerrar() } } }
            }
            .confirmationDialog("¿borrar esta tarea?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("borrar.", role: .destructive) { Task { await enviar([.borrarTarea(id: inicial.id)]) } }
                Button("cancelar.", role: .cancel) {}
            }
            .onAppear { if inicial.nueva { enfocado = true } }
            .task { await leerExtras() }
            .preguntarAlDescartar(cambiado, preguntar: $descartar) { cerrar() }
        }
        .presentationDetents([.medium, .large])
    }

    // MARK: - Tarjetas

    private var textos: some View {
        VStack(alignment: .leading, spacing: 0) {
            TextField("", text: $titulo, prompt: Text("qué hay que hacer.").foregroundColor(Lienzo.tintaTerciaria), axis: .vertical)
                .font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta)
                .focused($enfocado)
                .padding(.vertical, Medida.xs)
                .accessibilityLabel("qué hay que hacer")
            SeparadorFila(sangria: 0)
            TextField("", text: $notas, prompt: Text("notas.").foregroundColor(Lienzo.tintaTerciaria), axis: .vertical)
                .font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                .lineLimit(1...4)
                .padding(.vertical, Medida.xs)
                .accessibilityLabel("notas")
        }
        .tarjeta(relleno: Medida.s)
    }

    private var cuando: some View {
        VStack(alignment: .leading, spacing: Medida.xxs) {
            EtiquetaSeccion(texto: "cuándo")
            ChipsEleccion(opciones: opcionesDia.map { (valor: $0, titulo: nombre($0)) }, elegido: $dia)
            if dia != nil {
                SeparadorFila(sangria: 0)
                // Cualquier otro día, no solo hoy, mañana y pasado (mover a una fecha concreta).
                DatePicker(selection: fechaElegida, displayedComponents: .date) { rotulo("fecha.") }
                    .environment(\.locale, Locale(identifier: "es_ES"))
                    .frame(minHeight: Medida.toque)
                SeparadorFila(sangria: 0)
                Toggle(isOn: $conHora.animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento))) { rotulo("a una hora.") }
                    .frame(minHeight: Medida.toque)
                if conHora {
                    DatePicker(selection: $hora, displayedComponents: .hourAndMinute) { rotulo("hora.") }
                        .environment(\.locale, Locale(identifier: "es_ES"))
                        .frame(minHeight: Medida.toque)
                        .transition(.opacity.combined(with: .offset(y: -4)))
                }
            }
        }
        .tarjeta(relleno: Medida.s)
        .animation(Muelle.o(Muelle.expandir, reducido: sinMovimiento), value: dia == nil)
    }

    private var ajustes: some View {
        VStack(alignment: .leading, spacing: Medida.xxs) {
            EtiquetaSeccion(texto: "prioridad")
            ChipsEleccion(opciones: [(valor: "", titulo: "ninguna."), (valor: "alta", titulo: "alta."),
                                     (valor: "media", titulo: "media."), (valor: "baja", titulo: "baja.")], elegido: $prioridad)
            SeparadorFila(sangria: 0).padding(.vertical, Medida.xxs)
            EtiquetaSeccion(texto: "recordarme")
            ChipsEleccion(opciones: opcionesRecordar, elegido: $recordar)
            if recordar == "fecha" {
                DatePicker(selection: $recordarCuando, displayedComponents: [.date, .hourAndMinute]) { rotulo("cuándo.") }
                    .environment(\.locale, Locale(identifier: "es_ES"))
                    .frame(minHeight: Medida.toque)
                    .transition(.opacity.combined(with: .offset(y: -4)))
            }
        }
        .tarjeta(relleno: Medida.s)
        .animation(Muelle.o(Muelle.expandir, reducido: sinMovimiento), value: recordar)
    }

    private var opcionesRecordar: [(valor: String, titulo: String)] {
        var r: [(valor: String, titulo: String)] = [(valor: "", titulo: "no.")]
        if conHora && dia != nil { r.append((valor: "hora", titulo: "a la hora de la tarea.")) }
        r.append((valor: "fecha", titulo: "a una hora concreta."))
        return r
    }

    private var tarjetaSubtareas: some View {
        let hechas = subtareas.filter(\.hecha).count
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                EtiquetaSeccion(texto: "subtareas")
                if !subtareas.isEmpty {
                    Text("\(hechas)/\(subtareas.count)").font(Letra.pieFuerte).monospacedDigit()
                        .foregroundStyle(hechas == subtareas.count ? Lienzo.positivo : Lienzo.tintaSecundaria)
                        .contentTransition(.numericText())
                        .padding(.trailing, Medida.xxs)
                }
            }
            .padding(.bottom, Medida.xxs)
            ForEach(subtareas) { s in
                HStack(spacing: 2) {
                    // El mismo cuadrado que las filas del plan (planner-sub-check en la web).
                    CasillaMarcar(hecha: s.hecha) { marcarSubtarea(s.id, !s.hecha) }
                        .padding(.leading, -Medida.xs)
                    Text(s.texto).font(Letra.cuerpo)
                        .foregroundStyle(s.hecha ? Lienzo.tintaTerciaria : Lienzo.tinta)
                        .strikethrough(s.hecha, color: Lienzo.tintaTerciaria)
                    Spacer(minLength: 0)
                    Button { quitarSubtarea(s.id) } label: {
                        Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Lienzo.tintaTerciaria)
                            .frame(width: Medida.toque, height: Medida.toque)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.pulsable(0.85))
                    .accessibilityLabel("quitar «\(s.texto)»")
                }
                .transition(.opacity.combined(with: .offset(y: -4)))
                SeparadorFila(sangria: Medida.toque - Medida.xs + 2)
            }
            HStack {
                // Return añade y deja el campo abierto para la siguiente, como en la web.
                TextField("", text: $nuevaSubtarea, prompt: Text("+ subtarea.").foregroundColor(Lienzo.tintaTerciaria))
                    .font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                    .submitLabel(.next).focused($focoSubtarea)
                    .onSubmit { let habia = !nuevaSubtarea.trimmingCharacters(in: .whitespaces).isEmpty; anadirSubtarea(); focoSubtarea = habia }
                if !nuevaSubtarea.trimmingCharacters(in: .whitespaces).isEmpty {
                    Button("añadir.") { anadirSubtarea() }
                        .font(Letra.pieFuerte).foregroundStyle(Lienzo.naranjaProfundo)
                        .frame(minHeight: Medida.toque)
                        .buttonStyle(.pulsable(0.94))
                        .transition(.opacity)
                }
            }
            .frame(minHeight: Medida.toque)
            .padding(.leading, Medida.xxs)
        }
        .tarjeta(relleno: Medida.s)
        .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: subtareas)
        .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: nuevaSubtarea.isEmpty)
    }

    private func rotulo(_ texto: String) -> some View {
        Text(texto).font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
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

    // B10: lo que guardar cambiaría (las subtareas se guardan al momento y no cuentan).
    private var cambiado: Bool {
        guard !inicial.deTrabajo else { return false }
        let textos = limpio != inicial.titulo.trimmingCharacters(in: .whitespacesAndNewlines) || notasLimpias != inicial.notas.trimmingCharacters(in: .whitespacesAndNewlines)
        let cuando = dia != inicial.dia || horaTexto != inicial.hora || prioridad != (inicial.prioridad ?? "")
        let aviso = recordar != (recordarAntes?["tipo"]?.texto ?? "")
        return textos || cuando || aviso
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
        Task { await c.guardar(OperacionesExtra.op(OperacionesExtra.subtarea, ["id": .string(inicial.id), "subId": .string(id), "texto": .string(texto)])) }
    }

    private func marcarSubtarea(_ sid: String, _ hecha: Bool) {
        if let n = subtareas.firstIndex(where: { $0.id == sid }) { subtareas[n].hecha = hecha }
        Task { await c.guardar(OperacionesExtra.op(OperacionesExtra.marcarSubtarea, ["id": .string(inicial.id), "subId": .string(sid), "hecha": .bool(hecha)])) }
    }

    private func quitarSubtarea(_ sid: String) {
        subtareas.removeAll { $0.id == sid }
        Task { await c.guardar(OperacionesExtra.op(OperacionesExtra.quitarSubtarea, ["id": .string(inicial.id), "subId": .string(sid)])) }
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
