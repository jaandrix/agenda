import SwiftUI

struct ItemEstudio: Sendable, Identifiable, Equatable {
    let id: String
    let lista: String
    let titulo: String
    let fecha: String
    let hora: String
    let estado: String
    let hecho: Bool
    var nota = ""
    var peso = ""
    var esTrabajo: Bool { lista == "assignments" }
}

struct AsignaturaVista: Sendable, Identifiable, Equatable {
    let id: String
    let nombre: String
    let pendientes: [ItemEstudio]
    let pasados: [ItemEstudio]
}

// studies.subjects[] con estadoItemAsignatura de la web (CONTRATO-ESTUDIOS-PROYECTOS.md).
enum LecturaEstudios {
    static func vista(_ doc: DocumentoBitacora, hoy: String = CalendarioBitacora.madrid.dia(de: Date()).iso) -> [AsignaturaVista] {
        (((try? doc.valor(de: "studies")) ?? nil)?["subjects"]?.lista ?? []).compactMap { s in
            guard let id = s["id"]?.comoId else { return nil }
            var pend: [ItemEstudio] = [], pas: [ItemEstudio] = []
            for k in ["exams", "assignments"] {
                for x in s[k]?.lista ?? [] {
                    guard let iid = x["id"]?.comoId else { continue }
                    let fecha = x["date"]?.texto ?? "", hecho = x["done"]?.booleano == true
                    let nota: String? = {
                        switch x["grade"] {
                        case .number(let n)?: return n
                        case .string(let t)? where !t.isEmpty && Double(t.replacingOccurrences(of: ",", with: ".")) != nil: return t
                        default: return nil
                        }
                    }()
                    let estado: String
                    if let nota { estado = "calificado, \(nota)." }
                    else if k == "assignments" && hecho { estado = "entregado." }
                    else if !fecha.isEmpty && fecha < hoy { estado = k == "assignments" ? "vencido." : "hecho, sin nota." }
                    else { estado = "pendiente." }
                    let item = ItemEstudio(id: iid, lista: k, titulo: x["title"]?.texto.flatMap { $0.isEmpty ? nil : $0 } ?? "sin título",
                                           fecha: fecha, hora: x["time"]?.texto ?? "", estado: estado, hecho: hecho, nota: nota ?? "",
                                           peso: { () -> String in switch x["weight"] { case .number(let n)?: return n; case .string(let t)?: return t; default: return "" } }())
                    if estado == "pendiente." || estado == "vencido." { pend.append(item) } else { pas.append(item) }
                }
            }
            let orden = { (a: ItemEstudio, b: ItemEstudio) in (a.fecha.isEmpty ? "9" : a.fecha) + a.hora < (b.fecha.isEmpty ? "9" : b.fecha) + b.hora }
            return AsignaturaVista(id: id, nombre: s["name"]?.texto ?? "asignatura", pendientes: pend.sorted(by: orden),
                                   pasados: Array(pas.sorted(by: orden).reversed()))
        }
    }
}

struct EstudiosView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var asignaturas: [AsignaturaVista]?
    @State private var aviso: String?
    @State private var creando: NuevaEntrega?
    @State private var verPasados = false
    @State private var marcadas = 0
    @State private var editando: ItemEditando?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                let pendientes = (asignaturas ?? []).reduce(0) { $0 + $1.pendientes.count }
                CabeceraApartado(titulo: "estudios", contexto: asignaturas == nil ? nil : pendientes == 0 ? "todo al día." : "\(pendientes) por hacer.") {
                    AccionTexto(texto: verPasados ? "pendientes." : "ver todo.") { verPasados.toggle() }
                }
                if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.error).padding(.top, Espacio.s) }
                if let a = asignaturas, a.isEmpty {
                    Text("aún no hay asignaturas. se crean en la web.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.m)
                }
                ForEach(asignaturas ?? []) { s in
                    Etiqueta(texto: s.nombre.lowercased() + ".")
                    ForEach(s.pendientes + (verPasados ? s.pasados : [])) {
                        fila($0, asignatura: s.id).overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                    }
                    HStack(spacing: Espacio.l) {
                        AccionTexto(texto: "+ trabajo.") { creando = NuevaEntrega(asignaturaId: s.id, lista: "assignments") }
                        AccionTexto(texto: "+ examen.") { creando = NuevaEntrega(asignaturaId: s.id, lista: "exams") }
                    }
                }
            }
            .padding(.horizontal, 20).padding(.bottom, Espacio.xl)
        }
        .font(Tipo.cuerpo)
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .refreshable { await c.sincronizar() }
        .sensoryFeedback(.success, trigger: marcadas)
        .sheet(item: $creando) { n in EditorEntregaView(nueva: n) { aviso = $0 } }
        .sheet(item: $editando) { e in EditorEntregaView(nueva: e.nueva, existente: e.item) { aviso = $0 } }
        .task(id: c.informe.revision) {
            let doc = await c.documentoVisible()
            asignaturas = await Task.detached(priority: .userInitiated) { doc.map { LecturaEstudios.vista($0) } }.value
        }
    }

    private func fila(_ i: ItemEstudio, asignatura: String) -> some View {
        HStack(spacing: Espacio.m) {
            if i.esTrabajo {
                Button { marcar(i, asignatura: asignatura) } label: {
                    Image(systemName: i.hecho ? "checkmark.circle.fill" : "circle").font(.title3)
                        .foregroundStyle(i.hecho ? Paleta.textoSecundario : Paleta.texto)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(i.hecho ? "marcar sin entregar" : "marcar entregado")
            } else {
                Image(systemName: "doc.text").foregroundStyle(Paleta.textoSecundario).frame(width: 44, height: 44).accessibilityHidden(true)
            }
            Button { editando = ItemEditando(NuevaEntrega(asignaturaId: asignatura, lista: i.lista, idFijo: i.id), i) } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(i.titulo).foregroundStyle(i.hecho ? Paleta.textoSecundario : Paleta.texto).strikethrough(i.hecho)
                let cuando = [i.fecha, i.hora].filter { !$0.isEmpty }.joined(separator: ", ")
                Text("\(i.esTrabajo ? "trabajo" : "examen")\(cuando.isEmpty ? "" : ", " + cuando). \(i.estado)")
                    .font(Tipo.pie).foregroundStyle(i.estado == "vencido." ? Paleta.acento : Paleta.textoSecundario)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .listRowBackground(Paleta.superficie)
    }

    private func marcar(_ i: ItemEstudio, asignatura: String) {
        if !i.hecho { marcadas += 1 }
        Task {
            do {
                try await c.encolar(.marcarTrabajo(asignaturaId: asignatura, id: i.id, hecho: !i.hecho, momentoMs: Int64(Date().timeIntervalSince1970 * 1000)))
                aviso = nil
            } catch { aviso = "no se pudo guardar en este iPhone." }
        }
    }
}

struct NuevaEntrega: Identifiable, Equatable {
    let id: String
    let asignaturaId: String
    let lista: String
    init(asignaturaId: String, lista: String, idFijo: String? = nil) {
        id = idFijo ?? OperacionBitacora.nuevoIdItem()
        self.asignaturaId = asignaturaId
        self.lista = lista
    }
}

struct ItemEditando: Identifiable {
    let nueva: NuevaEntrega
    let item: ItemEstudio
    init(_ n: NuevaEntrega, _ i: ItemEstudio) { nueva = n; item = i }
    var id: String { nueva.id }
}

struct EditorEntregaView: View {
    let nueva: NuevaEntrega
    var existente: ItemEstudio?
    let alFallar: (String?) -> Void
    @State private var nota = ""
    @State private var peso = ""
    @State private var confirmarBorrado = false
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    @State private var titulo = ""
    @State private var conFecha = true
    @State private var fecha = Date()
    @State private var conHora = false
    @State private var hora = Calendar.current.date(bySettingHour: 9, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var guardando = false

    var body: some View {
        NavigationStack {
            Form {
                TextField(nueva.lista == "exams" ? "examen." : "trabajo.", text: $titulo)
                Toggle("con fecha.", isOn: $conFecha)
                if conFecha {
                    DatePicker("fecha.", selection: $fecha, displayedComponents: .date)
                    Toggle("con hora.", isOn: $conHora)
                    if conHora { DatePicker("hora.", selection: $hora, displayedComponents: .hourAndMinute) }
                }
                if existente != nil {
                    Section {
                        TextField("nota.", text: $nota).keyboardType(.decimalPad)
                        TextField("peso en la media (%).", text: $peso).keyboardType(.decimalPad)
                    }
                    Section { Button("borrar.", role: .destructive) { confirmarBorrado = true } }
                }
            }
            .confirmationDialog("¿borrar este \(nueva.lista == "exams" ? "examen" : "trabajo")?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("borrar.", role: .destructive) { borrar() }
                Button("cancelar.", role: .cancel) {}
            }
            .onAppear(perform: rellenar)
            .environment(\.locale, Locale(identifier: "es_ES"))
            .navigationTitle(existente != nil ? (nueva.lista == "exams" ? "examen." : "trabajo.") : nueva.lista == "exams" ? "nuevo examen." : "nuevo trabajo.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") { guardar() }.disabled(guardando || titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func rellenar() {
        guard let e = existente, titulo.isEmpty else { return }
        titulo = e.titulo
        nota = e.nota
        peso = e.peso
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        conFecha = !e.fecha.isEmpty
        if let d = f.date(from: e.fecha) { fecha = d }
        f.dateFormat = "HH:mm"
        conHora = !e.hora.isEmpty
        if let h = f.date(from: e.hora) { hora = Calendar.current.date(bySettingHour: Calendar.current.component(.hour, from: h), minute: Calendar.current.component(.minute, from: h), second: 0, of: fecha) ?? hora }
    }

    private func borrar() {
        let op = OperacionBitacora.borrarItemEstudio(asignaturaId: nueva.asignaturaId, lista: nueva.lista, id: nueva.id)
        Task {
            do { try await c.encolar(op); alFallar(nil); cerrar() } catch { alFallar("no se pudo borrar en este iPhone.") }
        }
    }

    private func guardar() {
        guardando = true
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        let dia = conFecha ? f.string(from: fecha) : nil
        f.dateFormat = "HH:mm"
        let h = conFecha && conHora ? f.string(from: hora) : nil
        let limpio = String(titulo.trimmingCharacters(in: .whitespaces).prefix(300))
        let op = existente != nil
            ? OperacionBitacora.editarItemEstudio(asignaturaId: nueva.asignaturaId, lista: nueva.lista, id: nueva.id, titulo: limpio, fecha: dia, hora: h,
                                                  nota: nota, peso: peso)
            : OperacionBitacora.crearEntrega(asignaturaId: nueva.asignaturaId, lista: nueva.lista, id: nueva.id, titulo: limpio, fecha: dia, hora: h)
        Task {
            do { try await c.encolar(op); alFallar(nil); cerrar() } catch { guardando = false; alFallar("no se pudo guardar en este iPhone.") }
        }
    }
}
