import SwiftUI
import SafariServices

struct Rutina: Sendable, Identifiable, Equatable {
    let id: String
    let texto: String
    let momento: String
    var hecha: Bool
    let semana: Int
}

struct Nota: Sendable, Identifiable, Equatable {
    let id: String
    let fecha: String
    let texto: String
}

struct Entrega: Sendable, Identifiable, Equatable {
    let id: String
    let titulo: String
    let asignatura: String
    let fecha: String
    let tipo: String
}

struct VistaMas: Sendable, Equatable {
    var rutinas: [Rutina]
    var notas: [Nota]
    var entregas: [Entrega]
}

// Rutinas (`habits`: rutinaToca y rutinaHechasSemana de la web, día del calendario), notas (`notes`) y lo que viene de
// las asignaturas (`studies.subjects[].exams/assignments`).
enum LecturaMas {
    static func vista(_ doc: DocumentoBitacora, hoy: LocalDay = CalendarioBitacora.madrid.dia(de: Date())) -> VistaMas {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let semanaDe = { (d: LocalDay) -> Int in
            cal.component(.weekday, from: cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))!) - 1
        }
        let lunes = hoy.sumando(dias: -((semanaDe(hoy) + 6) % 7))
        var rutinas: [Rutina] = []
        for x in ((try? doc.valor(de: "habits")) ?? nil)?.lista ?? [] {
            guard let o = x.objeto, let id = o["id"]?.comoId, o["activo"]?.booleano != false else { continue }
            let f = o["frecuencia"]?.objeto
            if f?["tipo"]?.texto == "dias", let dias = f?["dias"]?.lista, !dias.isEmpty,
               !dias.compactMap({ Dinero.decimal($0) }).map({ NSDecimalNumber(decimal: $0).intValue }).contains(semanaDe(hoy)) { continue }
            let hechas = o["completadas"]?.objeto ?? [:]
            let semana = (0..<7).filter { hechas[lunes.sumando(dias: $0).iso]?.booleano == true }.count
            rutinas.append(Rutina(id: id, texto: o["texto"]?.texto ?? "", momento: o["momento"]?.texto ?? "",
                                  hecha: hechas[hoy.iso]?.booleano == true, semana: semana))
        }
        let notas = (((try? doc.valor(de: "notes")) ?? nil)?.lista ?? []).compactMap { x -> Nota? in
            guard let o = x.objeto, let id = o["id"]?.comoId else { return nil }
            let texto = o["content"]?.texto ?? o["text"]?.texto ?? o["title"]?.texto ?? ""
            return texto.isEmpty ? nil : Nota(id: id, fecha: o["date"]?.texto ?? String((o["createdAt"]?.texto ?? "").prefix(10)), texto: texto)
        }.sorted { $0.fecha > $1.fecha }
        var entregas: [Entrega] = []
        for s in (((try? doc.valor(de: "studies")) ?? nil)?["subjects"]?.lista ?? []) {
            let nombre = s["name"]?.texto ?? ""
            for (k, tipo) in [("exams", "examen"), ("assignments", "trabajo")] {
                for x in s[k]?.lista ?? [] {
                    guard let fecha = x["date"]?.texto, fecha >= hoy.iso, x["done"]?.booleano != true, x["entregado"]?.booleano != true else { continue }
                    entregas.append(Entrega(id: x["id"]?.comoId ?? UUID().uuidString, titulo: x["title"]?.texto ?? tipo, asignatura: nombre, fecha: fecha, tipo: tipo))
                }
            }
        }
        return VistaMas(rutinas: rutinas, notas: Array(notas.prefix(40)), entregas: entregas.sorted { $0.fecha < $1.fecha })
    }
}

struct MasView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaMas?
    @State private var web = false
    @State private var nota = ""
    @State private var idNota = OperacionBitacora.nuevoIdNota()
    @State private var marcadas = 0
    @State private var aviso: String?

    var body: some View {
        List {
            if let aviso { Section { Text(aviso).foregroundStyle(Paleta.error) } }
            if let v = vista {
                Section("rutinas de hoy.") {
                    if v.rutinas.isEmpty { Text("ninguna hoy.").foregroundStyle(Paleta.textoSecundario).listRowBackground(Paleta.superficie) }
                    ForEach(v.rutinas) { r in
                        Button { marcar(r) } label: {
                            HStack(spacing: Espacio.m) {
                                Image(systemName: r.hecha ? "checkmark.circle.fill" : "circle").font(.title3)
                                    .foregroundStyle(r.hecha ? Paleta.textoSecundario : Paleta.texto)
                                    .contentTransition(.symbolEffect(.replace))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(r.texto).foregroundStyle(r.hecha ? Paleta.textoSecundario : Paleta.texto).strikethrough(r.hecha)
                                    Text("\(r.semana) esta semana" + (r.momento.isEmpty ? "" : ", \(r.momento)")).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                                }
                                Spacer()
                            }
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(Paleta.superficie)
                    }
                }
                Section("entregas.") {
                    if v.entregas.isEmpty { Text("nada pendiente.").foregroundStyle(Paleta.textoSecundario).listRowBackground(Paleta.superficie) }
                    ForEach(v.entregas) { e in
                        LabeledContent {
                            Text(e.fecha).font(Tipo.mono).foregroundStyle(Paleta.textoSecundario)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.titulo).foregroundStyle(Paleta.texto)
                                Text("\(e.tipo), \(e.asignatura)").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                            }
                        }
                        .listRowBackground(Paleta.superficie)
                    }
                }
                Section("notas.") {
                    HStack {
                        TextField("nota rápida.", text: $nota, axis: .vertical)
                        Button("guardar.") { guardarNota() }.disabled(nota.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    .listRowBackground(Paleta.superficie)
                    ForEach(v.notas) { n in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(n.texto).foregroundStyle(Paleta.texto).lineLimit(4)
                            Text(n.fecha).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        }
                        .textSelection(.enabled)
                        .listRowBackground(Paleta.superficie)
                    }
                }
            }
            Section {
                Button("abrir bitácora web.") { web = true }.frame(minHeight: 44).listRowBackground(Paleta.superficie)
            } footer: {
                Text("viajes, ocio, despensa, proyectos, enlaces, empleo, social y lo demás siguen en la web. entra con tu cuenta la primera vez.")
            }
            Section {
                NavigationLink("estado de la sincronización.") { EstadoView() }.listRowBackground(Paleta.superficie)
            }
        }
        .font(Tipo.cuerpo)
        .scrollContentBackground(.hidden)
        .background(Paleta.fondo)
        .navigationTitle("más.")
        .refreshable { await c.sincronizar() }
        .sensoryFeedback(.success, trigger: marcadas)
        .fullScreenCover(isPresented: $web) { NavegadorWeb(url: Config.webURL).ignoresSafeArea() }
        .task(id: c.informe.revision) {
            let doc = await c.documentoVisible()
            vista = await Task.detached(priority: .userInitiated) { doc.map { LecturaMas.vista($0) } }.value
        }
    }

    private func marcar(_ r: Rutina) {
        guard var v = vista, let i = v.rutinas.firstIndex(where: { $0.id == r.id }) else { return }
        v.rutinas[i].hecha.toggle()
        vista = v
        if v.rutinas[i].hecha { marcadas += 1 }
        let hecha = v.rutinas[i].hecha
        Task {
            do { try await c.encolar(.marcarRutina(id: r.id, dia: CalendarioBitacora.madrid.dia(de: Date()).iso, hecha: hecha)) } catch {
                if var w = vista, let j = w.rutinas.firstIndex(where: { $0.id == r.id }) { w.rutinas[j].hecha = !hecha; vista = w }
                aviso = "no se pudo guardar en este iPhone."
            }
        }
    }

    private func guardarNota() {
        let texto = String(nota.trimmingCharacters(in: .whitespacesAndNewlines).prefix(5000))
        guard !texto.isEmpty else { return }
        let id = idNota
        // El texto se queda en el campo hasta que la cola lo tiene guardado.
        Task {
            do {
                try await c.encolar(.crearNota(id: id, dia: CalendarioBitacora.madrid.dia(de: Date()).iso, texto: texto,
                                               creada: ISO8601DateFormatter().string(from: Date())))
                if nota.trimmingCharacters(in: .whitespacesAndNewlines) == texto { nota = "" }
                idNota = OperacionBitacora.nuevoIdNota()
                aviso = nil
            } catch {
                aviso = "no se pudo guardar la nota en este iPhone."
            }
        }
    }
}

// Lo no migrado se abre en un Safari dentro de la app (no un WKWebView): misma web, sin puente ni cookies compartidas.
struct NavegadorWeb: UIViewControllerRepresentable {
    let url: URL
    @Environment(\.dismiss) private var cerrar

    func makeCoordinator() -> Coordinador { Coordinador(cerrar: { cerrar() }) }
    func makeUIViewController(context: Context) -> SFSafariViewController {
        let v = SFSafariViewController(url: url)
        v.delegate = context.coordinator
        v.dismissButtonStyle = .close
        return v
    }
    func updateUIViewController(_ c: SFSafariViewController, context: Context) {}

    final class Coordinador: NSObject, SFSafariViewControllerDelegate {
        let cerrar: () -> Void
        init(cerrar: @escaping () -> Void) { self.cerrar = cerrar }
        func safariViewControllerDidFinish(_ controller: SFSafariViewController) { cerrar() }
    }
}
