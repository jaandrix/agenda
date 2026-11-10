import SwiftUI

// Empleo: la agenda laboral de js/agenda-laboral.js (horario por día de la semana, citas `lab_` y si salen en el
// calendario principal) y el empleo actual. Las fichas de empleo, la vida laboral, el CV y el importador con IA siguen
// en la web («fichas, vida laboral y cv.»): PLAN-0.17.md.

struct CitaLaboral: Sendable, Identifiable, Equatable { let id, fecha, ini, fin, titulo, tipo, lugar, notas: String }

struct VistaEmpleo: Sendable, Equatable {
    var enPrincipal: Bool
    var horario: [Int: (String, String)]
    var citas: [CitaLaboral]
    var empleo: String?

    static func == (a: VistaEmpleo, b: VistaEmpleo) -> Bool {
        a.enPrincipal == b.enPrincipal && a.citas == b.citas && a.empleo == b.empleo
            && a.horario.keys.sorted() == b.horario.keys.sorted() && a.horario.allSatisfy { k, v in b.horario[k]?.0 == v.0 && b.horario[k]?.1 == v.1 }
    }
}

enum LecturaEmpleo {
    static let tipos: [(String, String)] = [("reunion", "reunión"), ("turno", "turno"), ("plazo", "plazo"), ("otro", "otro")]
    static let dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

    static func vista(_ doc: DocumentoBitacora, hoy: String) -> VistaEmpleo {
        let a = (try? doc.valor(de: "agendaLaboral")) ?? nil
        var horario: [Int: (String, String)] = [:]
        for (k, v) in a?["horario"]?.objeto ?? [:] {
            if let d = Int(k), let ini = v["ini"]?.texto, let fin = v["fin"]?.texto { horario[d] = (ini, fin) }
        }
        let citas = (a?["citas"]?.lista ?? []).compactMap { x -> CitaLaboral? in
            guard let o = x.objeto, let id = o["id"]?.comoId else { return nil }
            let s = { (k: String) in o[k]?.texto ?? "" }
            return CitaLaboral(id: id, fecha: s("fecha"), ini: s("ini"), fin: s("fin"), titulo: s("titulo"), tipo: s("tipo"), lugar: s("lugar"), notas: s("notas"))
        }.sorted { ($0.fecha, $0.ini) < ($1.fecha, $1.ini) }
        // labEmpleoActual: el primer empleo sin fecha de fin o que acaba hoy o después.
        let empleo = (((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []).compactMap(\.objeto).first {
            $0["type"]?.texto == "work" && (($0["endDate"]?.texto ?? "").isEmpty || ($0["endDate"]?.texto ?? "") >= hoy)
        }.map { o in [o["company"]?.texto ?? o["title"]?.texto ?? "", o["position"]?.texto ?? ""].filter { !$0.isEmpty }.joined(separator: ", ") }
        // laboralEnPrincipal: sin agenda o sin decir nada, sí.
        return VistaEmpleo(enPrincipal: a?["enPrincipal"]?.booleano != false, horario: horario, citas: citas, empleo: empleo)
    }

    static func fecha(_ iso: String) -> Date? {
        guard let d = LocalDay(iso: iso) else { return nil }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = CalendarioBitacora.madrid.zona
        return cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))
    }

    static func nombreTipo(_ t: String) -> String { tipos.first { $0.0 == t }?.1 ?? t }

    static func nuevoId() -> String {
        let letras = "abcdefghijklmnopqrstuvwxyz0123456789"
        return "lab_\(Int64(Date().timeIntervalSince1970 * 1000))_" + String((0..<5).map { _ in letras.randomElement()! })
    }
}

private enum ModalEmpleo: Identifiable {
    case cita(CitaLaboral?)
    case horario
    var id: String {
        switch self { case .cita(let c): return "cita-" + (c?.id ?? "nueva"); case .horario: return "horario" }
    }
}

struct EmpleoView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaEmpleo?
    @State private var modal: ModalEmpleo?
    @State private var verPasadas = false

    private var hoy: String { CalendarioBitacora.madrid.dia(de: Date()).iso }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                CabeceraContexto(titulo: "empleo", detalle: vista?.empleo.map { $0 + "." }) {
                    Text("tu agenda laboral.").font(Tipo.poppins(24, .bold, estilo: .title3)).foregroundStyle(Paleta.sobreContexto)
                    Text("horario, turnos, reuniones y plazos.").font(Tipo.pie).foregroundStyle(Paleta.sobreContextoSuave)
                }
                VStack(alignment: .leading, spacing: 0) {
                    if let v = vista { contenido(v) } else { ProgressView().frame(maxWidth: .infinity).padding(.top, Espacio.xl) }
                }.modifier(HojaContenido())
            }
        }
        .background(Paleta.fondo.ignoresSafeArea()).scrollIndicators(.hidden)
        .refreshable { await c.sincronizar() }.task(id: c.informe.revision) { await cargar() }
        .sheet(item: $modal) { m in
            switch m {
            case .cita(let cita): EditorCitaLaboral(cita: cita, hoy: hoy).environment(c)
            case .horario: EditorHorarioLaboral(horario: vista?.horario ?? [:]).environment(c)
            }
        }
    }

    @ViewBuilder private func contenido(_ v: VistaEmpleo) -> some View {
        HStack { CabeceraSeccion(titulo: "horario.", detalle: nil); Spacer(); AccionTexto(texto: "cambiar.") { modal = .horario } }
        if v.horario.isEmpty {
            Text("todavía no has puesto tu horario.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s)
        }
        ForEach([1, 2, 3, 4, 5, 6, 0].filter { v.horario[$0] != nil }, id: \.self) { d in
            HStack {
                Text(LecturaEmpleo.dias[d] + ".").font(Tipo.cuerpo).foregroundStyle(Paleta.texto)
                Spacer()
                Text("\(v.horario[d]!.0) – \(v.horario[d]!.1)").font(Tipo.cuerpo).monospacedDigit().foregroundStyle(Paleta.textoSecundario)
            }.frame(minHeight: 40).overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
        }
        Toggle(isOn: Binding(get: { v.enPrincipal }, set: { si in Task { try? await c.encolar(.laboralEnPrincipal(si)) } })) {
            Text("en el calendario principal.").font(Tipo.cuerpo)
        }.tint(Paleta.acento).padding(.vertical, Espacio.s)

        let proximas = v.citas.filter { $0.fecha >= hoy }
        let pasadas = v.citas.filter { $0.fecha < hoy }.reversed()
        HStack { CabeceraSeccion(titulo: "citas.", detalle: proximas.isEmpty ? nil : "\(proximas.count)"); Spacer(); AccionTexto(texto: "+ cita.") { modal = .cita(nil) } }
        if proximas.isEmpty { Text("nada a la vista.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s) }
        ForEach(proximas) { fila($0) }
        if !pasadas.isEmpty {
            AccionTexto(texto: verPasadas ? "ocultar las pasadas." : "ver las pasadas (\(pasadas.count)).") { verPasadas.toggle() }.padding(.top, Espacio.s)
            if verPasadas { ForEach(Array(pasadas)) { fila($0) } }
        }
        AccionTexto(texto: "fichas, vida laboral y cv.") { c.web = Apartados.webURL("work") }.padding(.top, Espacio.l)
    }

    private func fila(_ cita: CitaLaboral) -> some View {
        Button { modal = .cita(cita) } label: {
            HStack(alignment: .firstTextBaseline, spacing: Espacio.s) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(LecturaViajes.fechaLarga(cita.fecha)).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    Text((cita.titulo.isEmpty ? LecturaEmpleo.nombreTipo(cita.tipo) : cita.titulo).lowercased() + ".").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto)
                    Text([LecturaEmpleo.nombreTipo(cita.tipo), cita.lugar].filter { !$0.isEmpty }.joined(separator: ", ")).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Text(cita.ini.isEmpty ? "" : cita.ini + (cita.fin.isEmpty ? "" : "–" + cita.fin)).font(Tipo.pie).monospacedDigit().foregroundStyle(Paleta.textoSecundario)
            }.padding(.vertical, 10).overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
        }.buttonStyle(.plain)
        .contextMenu { Button("eliminar cita.", role: .destructive) { Task { try? await c.encolar(.borrarCitaLaboral(id: cita.id)) } } }
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        let h = hoy
        vista = await Task.detached(priority: .userInitiated) { doc.map { LecturaEmpleo.vista($0, hoy: h) } }.value
    }
}

private struct EditorCitaLaboral: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let cita: CitaLaboral?
    @State private var tipo: String
    @State private var titulo: String
    @State private var fecha: Date
    @State private var conHoras: Bool
    @State private var ini: Date
    @State private var fin: Date
    @State private var lugar: String
    @State private var notas: String
    @State private var id: String
    @State private var confirmarBorrado = false

    init(cita: CitaLaboral?, hoy: String) {
        self.cita = cita
        _tipo = State(initialValue: cita?.tipo ?? "reunion"); _titulo = State(initialValue: cita?.titulo ?? "")
        _fecha = State(initialValue: LecturaEmpleo.fecha(cita?.fecha ?? hoy) ?? Date())
        _conHoras = State(initialValue: !(cita?.ini ?? "").isEmpty)
        _ini = State(initialValue: EditorCitaLaboral.hora(cita?.ini, "09:00")); _fin = State(initialValue: EditorCitaLaboral.hora(cita?.fin, "10:00"))
        _lugar = State(initialValue: cita?.lugar ?? ""); _notas = State(initialValue: cita?.notas ?? "")
        _id = State(initialValue: cita?.id ?? LecturaEmpleo.nuevoId())
    }

    var body: some View {
        NavigationStack {
            Form {
                Picker("tipo.", selection: $tipo) { ForEach(LecturaEmpleo.tipos, id: \.0) { t in Text(t.1 + ".").tag(t.0) } }.pickerStyle(.segmented)
                TextField(tipo == "turno" ? "qué (opcional)." : "qué.", text: $titulo)
                DatePicker("cuándo.", selection: $fecha, displayedComponents: .date)
                Toggle("con horas.", isOn: $conHoras)
                if conHoras {
                    DatePicker("de.", selection: $ini, displayedComponents: .hourAndMinute)
                    DatePicker("a.", selection: $fin, displayedComponents: .hourAndMinute)
                }
                TextField("dónde.", text: $lugar)
                TextField("notas.", text: $notas, axis: .vertical).lineLimit(1...4)
                if cita != nil { Section { Button("eliminar cita.", role: .destructive) { confirmarBorrado = true } } }
            }
            .environment(\.locale, Locale(identifier: "es_ES"))
            .navigationTitle(cita == nil ? "nueva cita de trabajo." : "editar cita.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        let op = OperacionBitacora.guardarCitaLaboral(id: id, fecha: CalendarioBitacora.madrid.dia(de: fecha).iso,
                                                                       ini: conHoras ? texto(ini) : "", fin: conHoras ? texto(fin) : "",
                                                                       titulo: titulo.trimmingCharacters(in: .whitespacesAndNewlines), tipo: tipo,
                                                                       lugar: lugar.trimmingCharacters(in: .whitespacesAndNewlines),
                                                                       notas: notas.trimmingCharacters(in: .whitespacesAndNewlines))
                        Task { try? await c.encolar(op) }
                        cerrar()
                    }.disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty && tipo != "turno")
                }
            }
            .confirmationDialog("¿eliminar esta cita?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("eliminar.", role: .destructive) { Task { try? await c.encolar(.borrarCitaLaboral(id: id)) }; cerrar() }
                Button("cancelar.", role: .cancel) {}
            }
        }
    }

    private func texto(_ d: Date) -> String {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = CalendarioBitacora.madrid.zona
        let h = cal.dateComponents([.hour, .minute], from: d)
        return String(format: "%02d:%02d", h.hour ?? 0, h.minute ?? 0)
    }

    static func hora(_ texto: String?, _ porDefecto: String) -> Date {
        let t = (texto ?? "").isEmpty ? porDefecto : texto!
        let p = t.split(separator: ":").compactMap { Int($0) }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = CalendarioBitacora.madrid.zona
        return p.count >= 2 ? (cal.date(bySettingHour: p[0], minute: p[1], second: 0, of: Date()) ?? Date()) : Date()
    }
}

private struct EditorHorarioLaboral: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    @State private var activos: Set<Int>
    @State private var ini: [Int: Date]
    @State private var fin: [Int: Date]

    // openHorarioLaboral: sin horario guardado, de lunes a viernes de 9 a 17.
    init(horario: [Int: (String, String)]) {
        let base = horario.isEmpty ? Dictionary(uniqueKeysWithValues: [1, 2, 3, 4, 5].map { ($0, ("09:00", "17:00")) }) : horario
        _activos = State(initialValue: Set(base.keys))
        _ini = State(initialValue: Dictionary(uniqueKeysWithValues: (0...6).map { ($0, EditorCitaLaboral.hora(base[$0]?.0, "09:00")) }))
        _fin = State(initialValue: Dictionary(uniqueKeysWithValues: (0...6).map { ($0, EditorCitaLaboral.hora(base[$0]?.1, "17:00")) }))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach([1, 2, 3, 4, 5, 6, 0], id: \.self) { d in
                        Toggle(LecturaEmpleo.dias[d] + ".", isOn: Binding(get: { activos.contains(d) }, set: { if $0 { activos.insert(d) } else { activos.remove(d) } }))
                        if activos.contains(d) {
                            HStack {
                                DatePicker("entrada.", selection: Binding(get: { ini[d] ?? Date() }, set: { ini[d] = $0 }), displayedComponents: .hourAndMinute).labelsHidden()
                                Text("a").foregroundStyle(Paleta.textoSecundario)
                                DatePicker("salida.", selection: Binding(get: { fin[d] ?? Date() }, set: { fin[d] = $0 }), displayedComponents: .hourAndMinute).labelsHidden()
                            }
                        }
                    }
                } footer: { Text("los cambios puntuales (un turno distinto, una guardia) apúntalos como cita de tipo turno.") }
            }
            .environment(\.locale, Locale(identifier: "es_ES"))
            .navigationTitle("horario laboral.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        var cal = Calendar(identifier: .gregorian); cal.timeZone = CalendarioBitacora.madrid.zona
                        let t = { (d: Date?) -> String in let h = cal.dateComponents([.hour, .minute], from: d ?? Date()); return String(format: "%02d:%02d", h.hour ?? 0, h.minute ?? 0) }
                        let dias = Dictionary(uniqueKeysWithValues: activos.map { (String($0), t(ini[$0]) + "|" + t(fin[$0])) })
                        Task { try? await c.encolar(.horarioLaboral(dias: dias)) }
                        cerrar()
                    }
                }
            }
        }
    }
}
