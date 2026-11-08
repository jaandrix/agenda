import SwiftUI

struct TareaProyecto: Sendable, Identifiable, Equatable {
    let id: String
    let texto: String
    let estado: String
    let enHoy: Bool
}

struct ProyectoVista: Sendable, Identifiable, Equatable {
    let id: String
    let titulo: String
    let estado: String
    let tareas: [TareaProyecto]
    let siguiente: String?
    var hechas: Int { tareas.filter { $0.estado == "hecha" }.count }
}

// Proyectos de `entries` con proyectoDatos y proyectoSiguiente de la web (CONTRATO-ESTUDIOS-PROYECTOS.md).
enum LecturaProyectos {
    static func vista(_ doc: DocumentoBitacora, hoy: String = CalendarioBitacora.madrid.diaLogico(Date()).iso) -> [ProyectoVista] {
        let enHoy = Set((((try? doc.valor(de: "dayPlanner")) ?? nil)?["days"]?[hoy]?.lista ?? []).compactMap { $0["proyectoTareaId"]?.comoId })
        return (((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []).compactMap { x -> ProyectoVista? in
            guard x["type"]?.texto == "project", let o = x.objeto, let id = o["id"]?.comoId else { return nil }
            let p = AplicarOperaciones.proyectoNormalizado(o)
            let tareas = (p["tareas"]?.lista ?? []).compactMap { t -> TareaProyecto? in
                guard let tid = t["id"]?.comoId else { return nil }
                return TareaProyecto(id: tid, texto: t["texto"]?.texto ?? "", estado: t["estado"]?.texto ?? "pendiente", enHoy: enHoy.contains(tid))
            }
            let vivas = tareas.filter { $0.estado != "hecha" }
            let sig = vivas.first { $0.id == p["siguienteId"]?.comoId } ?? vivas.first { $0.estado == "curso" } ?? vivas.first
            return ProyectoVista(id: id, titulo: p["title"]?.texto ?? "proyecto", estado: p["status"]?.texto ?? "", tareas: tareas, siguiente: sig?.id)
        }
        .sorted { ($0.estado == "Completado" ? 1 : 0, $0.titulo.lowercased()) < ($1.estado == "Completado" ? 1 : 0, $1.titulo.lowercased()) }
    }
}

struct ProyectosView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var proyectos: [ProyectoVista]?

    var body: some View {
        List {
            if let p = proyectos, p.isEmpty {
                Text("aún no hay proyectos. se crean en la web.").foregroundStyle(Paleta.textoSecundario).listRowBackground(Paleta.superficie)
            }
            ForEach(proyectos ?? []) { p in
                NavigationLink {
                    ProyectoDetalleView(id: p.id)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.titulo).foregroundStyle(Paleta.texto)
                        Text("\(p.hechas) de \(p.tareas.count) hechas" + (p.estado.isEmpty ? "" : ", \(p.estado.lowercased())") + ".")
                            .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    }
                    .frame(minHeight: 44, alignment: .leading)
                }
                .listRowBackground(Paleta.superficie)
            }
        }
        .font(Tipo.cuerpo)
        .scrollContentBackground(.hidden)
        .background(Paleta.fondo)
        .navigationTitle("proyectos.")
        .refreshable { await c.sincronizar() }
        .task(id: c.informe.revision) {
            let doc = await c.documentoVisible()
            proyectos = await Task.detached(priority: .userInitiated) { doc.map { LecturaProyectos.vista($0) } }.value
        }
    }
}

struct ProyectoDetalleView: View {
    let id: String
    @Environment(AppCoordinator.self) private var c
    @State private var p: ProyectoVista?
    @State private var aviso: String?
    @State private var marcadas = 0

    var body: some View {
        List {
            if let aviso { Section { Text(aviso).foregroundStyle(Paleta.error) } }
            if let p {
                if let sid = p.siguiente, let s = p.tareas.first(where: { $0.id == sid }) {
                    Section("siguiente paso.") {
                        Text(s.texto).font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto).listRowBackground(Paleta.superficie)
                    }
                }
                Section {
                    if p.tareas.isEmpty { Text("sin tareas.").foregroundStyle(Paleta.textoSecundario).listRowBackground(Paleta.superficie) }
                    ForEach(p.tareas) { t in
                        Button { cambiar(t) } label: {
                            HStack(spacing: Espacio.m) {
                                Image(systemName: t.estado == "hecha" ? "checkmark.circle.fill" : t.estado == "curso" ? "circle.lefthalf.filled" : "circle")
                                    .font(.title3)
                                    .foregroundStyle(t.estado == "hecha" ? Paleta.textoSecundario : t.estado == "curso" ? Paleta.acento : Paleta.texto)
                                    .contentTransition(.symbolEffect(.replace))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(t.texto).foregroundStyle(t.estado == "hecha" ? Paleta.textoSecundario : Paleta.texto).strikethrough(t.estado == "hecha")
                                    Text(nombre(t.estado) + (t.enHoy ? " en el plan de hoy." : "")).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                                }
                                Spacer()
                            }
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("cambia el estado")
                        .listRowBackground(Paleta.superficie)
                        .swipeActions(edge: .trailing) {
                            if t.estado != "hecha" && !t.enHoy { Button("→ hoy.") { aHoy(t) }.tint(Paleta.acento) }
                        }
                    }
                } header: {
                    Text("\(p.hechas) de \(p.tareas.count) hechas. toca para cambiar el estado; desliza para llevarla a hoy.")
                        .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).textCase(nil)
                }
            }
        }
        .font(Tipo.cuerpo)
        .scrollContentBackground(.hidden)
        .background(Paleta.fondo)
        .navigationTitle(p.map { $0.titulo.lowercased() + "." } ?? "proyecto.")
        .navigationBarTitleDisplayMode(.inline)
        .sensoryFeedback(.success, trigger: marcadas)
        .refreshable { await c.sincronizar() }
        .task(id: c.informe.revision) {
            let doc = await c.documentoVisible()
            let pid = id
            p = await Task.detached(priority: .userInitiated) { doc.flatMap { LecturaProyectos.vista($0).first { $0.id == pid } } }.value
        }
    }

    private func nombre(_ e: String) -> String { e == "hecha" ? "hecha." : e == "curso" ? "en marcha." : "pendiente." }

    // El mismo ciclo que proyectoCambiarEstado, pero la operación lleva el estado final.
    private func cambiar(_ t: TareaProyecto) {
        let siguiente = t.estado == "pendiente" ? "curso" : t.estado == "curso" ? "hecha" : "pendiente"
        if siguiente == "hecha" { marcadas += 1 }
        enviar(.estadoTareaProyecto(proyectoId: id, tareaId: t.id, estado: siguiente))
    }

    private func aHoy(_ t: TareaProyecto) {
        enviar(.proyectoAHoy(proyectoId: id, tareaId: t.id, idTarea: OperacionBitacora.nuevoIdTarea(),
                             dia: CalendarioBitacora.madrid.diaLogico(Date()).iso))
    }

    private func enviar(_ op: OperacionBitacora) {
        Task {
            do { try await c.encolar(op); aviso = nil } catch { aviso = "no se pudo guardar en este iPhone." }
        }
    }
}
