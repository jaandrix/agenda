import SwiftUI

struct ItemEstudio: Sendable, Identifiable, Equatable {
    let id: String
    let lista: String
    let titulo: String
    let fecha: String
    let hora: String
    let estado: String
    let hecho: Bool
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
                                           fecha: fecha, hora: x["time"]?.texto ?? "", estado: estado, hecho: hecho)
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

    var body: some View {
        List {
            if let aviso { Section { Text(aviso).foregroundStyle(Paleta.error) } }
            if let a = asignaturas, a.isEmpty {
                Text("aún no hay asignaturas. se crean en la web.").foregroundStyle(Paleta.textoSecundario).listRowBackground(Paleta.superficie)
            }
            ForEach(asignaturas ?? []) { s in
                Section {
                    ForEach(s.pendientes + (verPasados ? s.pasados : [])) { fila($0, asignatura: s.id) }
                    HStack {
                        Button("+ trabajo.") { creando = NuevaEntrega(asignaturaId: s.id, lista: "assignments") }
                        Spacer()
                        Button("+ examen.") { creando = NuevaEntrega(asignaturaId: s.id, lista: "exams") }
                    }
                    .buttonStyle(.borderless)
                    .font(Tipo.cuerpoFuerte)
                    .foregroundStyle(Paleta.acento)
                    .frame(minHeight: 44)
                    .listRowBackground(Paleta.superficie)
                } header: {
                    Text(s.nombre.lowercased() + ".").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).textCase(nil)
                }
            }
        }
        .font(Tipo.cuerpo)
        .scrollContentBackground(.hidden)
        .background(Paleta.fondo)
        .navigationTitle("estudios.")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button(verPasados ? "solo pendientes." : "ver todo.") { verPasados.toggle() } }
        }
        .refreshable { await c.sincronizar() }
        .sensoryFeedback(.success, trigger: marcadas)
        .sheet(item: $creando) { n in EditorEntregaView(nueva: n) { aviso = $0 } }
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
            VStack(alignment: .leading, spacing: 2) {
                Text(i.titulo).foregroundStyle(i.hecho ? Paleta.textoSecundario : Paleta.texto).strikethrough(i.hecho)
                let cuando = [i.fecha, i.hora].filter { !$0.isEmpty }.joined(separator: ", ")
                Text("\(i.esTrabajo ? "trabajo" : "examen")\(cuando.isEmpty ? "" : ", " + cuando). \(i.estado)")
                    .font(Tipo.pie).foregroundStyle(i.estado == "vencido." ? Paleta.acento : Paleta.textoSecundario)
            }
            Spacer()
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
    let id = OperacionBitacora.nuevoIdItem()
    let asignaturaId: String
    let lista: String
}

struct EditorEntregaView: View {
    let nueva: NuevaEntrega
    let alFallar: (String?) -> Void
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
            }
            .environment(\.locale, Locale(identifier: "es_ES"))
            .navigationTitle(nueva.lista == "exams" ? "nuevo examen." : "nuevo trabajo.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") { guardar() }.disabled(guardando || titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
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
        let op = OperacionBitacora.crearEntrega(asignaturaId: nueva.asignaturaId, lista: nueva.lista, id: nueva.id,
                                                titulo: String(titulo.trimmingCharacters(in: .whitespaces).prefix(300)), fecha: dia, hora: h)
        Task {
            do { try await c.encolar(op); alFallar(nil); cerrar() } catch { guardando = false; alFallar("no se pudo guardar en este iPhone.") }
        }
    }
}
