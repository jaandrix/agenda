import SwiftUI

struct TareaProyecto: Sendable, Identifiable, Equatable {
    let id: String
    let texto: String
    let estado: String
    let enHoy: Bool
    var faseId: String?
}

struct FaseProyecto: Sendable, Identifiable, Equatable {
    let id: String
    let nombre: String
    let fecha: String
    let hecha: Bool
}

struct ApunteProyecto: Sendable, Identifiable, Equatable {
    let id: String
    let fecha: String
    let texto: String
}

struct ProyectoVista: Sendable, Identifiable, Equatable {
    let id: String
    let titulo: String
    let estado: String
    let tareas: [TareaProyecto]
    let siguiente: String?
    var fases: [FaseProyecto] = []
    var diario: [ApunteProyecto] = []
    var colina: Double?
    var hechas: Int { tareas.filter { $0.estado == "hecha" }.count }
}

// Proyectos de `entries` con proyectoDatos y proyectoSiguiente de la web (CONTRATO-ESTUDIOS-PROYECTOS.md).
enum LecturaProyectos {
    static func vista(_ doc: DocumentoBitacora, hoy: String = CalendarioBitacora.madrid.diaLogico(Date()).iso) -> [ProyectoVista] {
        // La pareja proyecto y tarea: las tareas heredadas de `tasks` se llaman pt_c0, pt_c1... en todos los proyectos.
        let enHoy = Set((((try? doc.valor(de: "dayPlanner")) ?? nil)?["days"]?[hoy]?.lista ?? []).compactMap { t -> String? in
            guard let pid = t["proyectoId"]?.comoId, let tid = t["proyectoTareaId"]?.comoId else { return nil }
            return pid + "|" + tid
        })
        return (((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []).compactMap { x -> ProyectoVista? in
            guard x["type"]?.texto == "project", let o = x.objeto, let id = o["id"]?.comoId else { return nil }
            let p = AplicarOperaciones.proyectoNormalizado(o)
            let tareas = (p["tareas"]?.lista ?? []).compactMap { t -> TareaProyecto? in
                guard let tid = t["id"]?.comoId else { return nil }
                return TareaProyecto(id: tid, texto: t["texto"]?.texto ?? "", estado: t["estado"]?.texto ?? "pendiente", enHoy: enHoy.contains(id + "|" + tid),
                                     faseId: t["faseId"]?.comoId)
            }
            let vivas = tareas.filter { $0.estado != "hecha" }
            let sig = vivas.first { $0.id == p["siguienteId"]?.comoId } ?? vivas.first { $0.estado == "curso" } ?? vivas.first
            var v = ProyectoVista(id: id, titulo: p["title"]?.texto ?? "proyecto", estado: p["status"]?.texto ?? "", tareas: tareas, siguiente: sig?.id)
            v.fases = (p["fases"]?.lista ?? []).compactMap { f in
                f["id"]?.comoId.map { FaseProyecto(id: $0, nombre: f["nombre"]?.texto ?? "", fecha: f["fecha"]?.texto ?? "", hecha: f["hecha"]?.booleano == true) }
            }
            v.diario = (p["diario"]?.lista ?? []).compactMap { d in
                d["id"]?.comoId.map { ApunteProyecto(id: $0, fecha: d["fecha"]?.texto ?? "", texto: d["texto"]?.texto ?? "") }
            }
            v.colina = Dinero.decimal(p["colina"]).map { NSDecimalNumber(decimal: $0).doubleValue }
            return v
        }
        .sorted { ($0.estado == "Completado" ? 1 : 0, $0.titulo.lowercased()) < ($1.estado == "Completado" ? 1 : 0, $1.titulo.lowercased()) }
    }
}

struct ProyectosView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var proyectos: [ProyectoVista]?
    @State private var nuevo = ""
    @State private var idNuevo = OperacionBitacora.nuevoIdProyecto("proy")
    @State private var aviso: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                let activos = (proyectos ?? []).filter { $0.estado != "Completado" }.count
                CabeceraApartado(titulo: "proyectos", contexto: proyectos.map { $0.isEmpty ? "ninguno todavía." : "\(activos) en marcha." }) { EmptyView() }
                if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.error).padding(.top, Espacio.s) }
                CampoAlta(texto: $nuevo, sugerencia: "nuevo proyecto.") { crear() }.padding(.top, Espacio.m)
                ForEach(proyectos ?? []) { p in
                    NavigationLink { ProyectoDetalleView(id: p.id) } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(p.titulo).font(Tipo.poppins(17, .semibold, estilo: .body)).foregroundStyle(p.estado == "Completado" ? Paleta.textoSecundario : Paleta.texto)
                                    .multilineTextAlignment(.leading)
                                Spacer()
                                Text("\(p.hechas)/\(p.tareas.count)").font(Tipo.poppins(14, .semibold, estilo: .footnote)).monospacedDigit().foregroundStyle(Paleta.textoSecundario)
                            }
                            if let s = p.siguiente, let t = p.tareas.first(where: { $0.id == s }) {
                                Text("siguiente, \(t.texto)").font(Tipo.poppins(13.5, .regular, estilo: .footnote)).foregroundStyle(Paleta.textoSecundario).lineLimit(2)
                            }
                            BarraProgreso(valor: p.tareas.isEmpty ? 0 : Double(p.hechas) / Double(p.tareas.count))
                        }
                        .padding(.vertical, 14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                }
            }
            .padding(.horizontal, 20).padding(.bottom, Espacio.xl)
        }
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .refreshable { await c.sincronizar() }
        .task(id: c.informe.revision) {
            let doc = await c.documentoVisible()
            proyectos = await Task.detached(priority: .userInitiated) { doc.map { LecturaProyectos.vista($0) } }.value
        }
    }

    private func crear() {
        let titulo = String(nuevo.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
        guard !titulo.isEmpty else { return }
        let id = idNuevo
        Task {
            do {
                try await c.encolar(.crearProyecto(id: id, titulo: titulo, fecha: CalendarioBitacora.madrid.dia(de: Date()).iso))
                nuevo = ""
                idNuevo = OperacionBitacora.nuevoIdProyecto("proy")
                aviso = nil
            } catch { aviso = "no se pudo guardar en este iPhone." }
        }
    }
}

// Una raya fina de la tinta con lo hecho en el acento: el avance, no un adorno.
struct BarraProgreso: View {
    let valor: Double

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Paleta.borde)
                Capsule().fill(Paleta.acento).frame(width: g.size.width * min(max(valor, 0), 1))
            }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }
}

// Un renglón para escribir y «añadir.»: sin caja, con el filete debajo.
struct CampoAlta: View {
    @Binding var texto: String
    let sugerencia: String
    let alta: () -> Void

    var body: some View {
        HStack(alignment: .bottom) {
            TextField(sugerencia, text: $texto, axis: .vertical).font(Tipo.cuerpo).foregroundStyle(Paleta.texto).padding(.vertical, 12)
                .submitLabel(.done).onSubmit(alta)
            AccionTexto(texto: "añadir.", accion: alta).disabled(texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
    }
}

// El gestor del proyecto (js/proyecto.js): siguiente paso, la colina, tareas por fases, fases y diario.
struct ProyectoDetalleView: View {
    let id: String
    @Environment(AppCoordinator.self) private var c
    @State private var p: ProyectoVista?
    @State private var aviso: String?
    @State private var marcadas = 0
    @State private var tarea = ""
    @State private var fase = ""
    @State private var apunte = ""
    @State private var editando: TareaProyecto?
    @State private var textoEditado = ""

    // PROYECTO_COLINA.
    static let colina: [(String, String)] = [("0.08", "pensando."), ("0.28", "probando."), ("0.5", "decidido."), ("0.72", "haciendo."), ("0.93", "rematando.")]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if let p {
                    CabeceraApartado(titulo: p.titulo.lowercased(), contexto: "\(p.hechas) de \(p.tareas.count) hechas.") { EmptyView() }
                    if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.error).padding(.top, Espacio.s) }
                    if let sid = p.siguiente, let s = p.tareas.first(where: { $0.id == sid }) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("siguiente paso.").font(Tipo.poppins(22, .bold, estilo: .title2)).kerning(-0.66).foregroundStyle(Paleta.texto)
                            Text(s.texto).font(Tipo.poppins(17, .medium, estilo: .body)).foregroundStyle(Paleta.texto)
                            HStack(spacing: Espacio.l) {
                                AccionTexto(texto: "hecho.") { estado(s, "hecha") }
                                if !s.enHoy { AccionTexto(texto: "→ hoy.") { aHoy(s) } }
                            }
                        }
                        .modifier(BloqueAhora())
                    }
                    colinaBloque(p)
                    Etiqueta(texto: "tareas.")
                    CampoAlta(texto: $tarea, sugerencia: "nueva tarea.") {
                        let t = tarea.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !t.isEmpty else { return }
                        tarea = ""
                        for linea in t.split(separator: "\n").map({ $0.trimmingCharacters(in: .whitespaces) }).filter({ !$0.isEmpty }) {
                            cambiar(.anadirTarea(id: OperacionBitacora.nuevoIdProyecto("pt"), texto: String(linea.prefix(300)), faseId: nil))
                        }
                    }
                    if p.tareas.isEmpty { Text("sin tareas.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s) }
                    let sinFase = p.tareas.filter { t in t.faseId == nil || !p.fases.contains { $0.id == t.faseId } }
                    ForEach(sinFase) { filaTarea($0, p) }
                    ForEach(p.fases) { f in
                        let suyas = p.tareas.filter { $0.faseId == f.id }
                        if !suyas.isEmpty {
                            Text(f.nombre.lowercased() + ".").font(Tipo.poppins(13, .bold, estilo: .footnote)).foregroundStyle(Paleta.textoSecundario).padding(.top, Espacio.m)
                            ForEach(suyas) { filaTarea($0, p) }
                        }
                    }
                    Etiqueta(texto: "fases.")
                    ForEach(p.fases) { f in
                        FilaAgenda(hora: nil, titulo: f.nombre, notas: f.fecha, hecho: f.hecha, mostrarHora: false) {
                            cambiar(.faseHecha(id: f.id, hecha: !f.hecha))
                        }
                    }
                    CampoAlta(texto: $fase, sugerencia: "nueva fase.") {
                        let n = fase.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !n.isEmpty else { return }
                        fase = ""
                        cambiar(.anadirFase(id: OperacionBitacora.nuevoIdProyecto("pf"), nombre: String(n.prefix(200)), fecha: ""))
                    }
                    Etiqueta(texto: "diario.")
                    CampoAlta(texto: $apunte, sugerencia: "una decisión o un avance.") {
                        let t = apunte.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !t.isEmpty else { return }
                        apunte = ""
                        cambiar(.apuntar(id: OperacionBitacora.nuevoIdProyecto("pd"), fecha: CalendarioBitacora.madrid.dia(de: Date()).iso, texto: String(t.prefix(2000))))
                    }
                    ForEach(p.diario) { d in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(d.texto).font(Tipo.cuerpo).foregroundStyle(Paleta.texto)
                            Text(d.fecha).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 10)
                        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                        .contextMenu { Button("quitar.", role: .destructive) { cambiar(.quitarApunte(id: d.id)) } }
                    }
                } else {
                    ProgressView().tint(Paleta.textoSecundario).frame(maxWidth: .infinity).padding(.top, Espacio.xl)
                }
            }
            .padding(.horizontal, 20).padding(.bottom, Espacio.xl)
        }
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .sensoryFeedback(.success, trigger: marcadas)
        .refreshable { await c.sincronizar() }
        .alert("tarea.", isPresented: Binding(get: { editando != nil }, set: { if !$0 { editando = nil } })) {
            TextField("tarea.", text: $textoEditado)
            Button("guardar.") {
                if let t = editando, !textoEditado.trimmingCharacters(in: .whitespaces).isEmpty {
                    cambiar(.editarTarea(id: t.id, texto: String(textoEditado.trimmingCharacters(in: .whitespaces).prefix(300))))
                }
            }
            Button("cancelar.", role: .cancel) {}
        }
        .task(id: c.informe.revision) {
            let doc = await c.documentoVisible()
            let pid = id
            p = await Task.detached(priority: .userInitiated) { doc.flatMap { LecturaProyectos.vista($0).first { $0.id == pid } } }.value
        }
    }

    // proyectoColinaSvg simplificada: la frase de dónde está y los cinco pasos para ponerla.
    private func colinaBloque(_ p: ProyectoVista) -> some View {
        let frase = p.colina.map { $0 < 0.5 ? "cuesta arriba: aún decidiendo cómo." : $0 < 0.6 ? "en la cima: ya sabes cómo hacerlo." : "cuesta abajo: ya solo es hacer." } ?? "¿dónde está? elige abajo."
        return VStack(alignment: .leading, spacing: 8) {
            Etiqueta(texto: "la colina.")
            Text(frase).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Self.colina, id: \.0) { par in
                        let v = par.0, t = par.1
                        let activa = p.colina.map { abs($0 - (Double(v) ?? 0)) < 0.05 } ?? false
                        Button(t) { cambiar(.colina(v)) }
                            .font(Tipo.poppins(14, .semibold, estilo: .footnote))
                            .foregroundStyle(activa ? Paleta.sobreAcento : Paleta.texto)
                            .padding(.horizontal, 12).frame(minHeight: 36)
                            .background(activa ? Paleta.acento : Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: Radio.control))
                    }
                }
            }
        }
    }

    private func filaTarea(_ t: TareaProyecto, _ p: ProyectoVista) -> some View {
        Button { ciclar(t) } label: {
            HStack(spacing: Espacio.m) {
                Image(systemName: t.estado == "hecha" ? "checkmark.circle.fill" : t.estado == "curso" ? "circle.lefthalf.filled" : "circle")
                    .font(.system(size: 24))
                    .foregroundStyle(t.estado == "hecha" ? Paleta.textoSecundario : t.estado == "curso" ? Paleta.acento : Paleta.bordeFuerte)
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.texto).font(Tipo.poppins(16.5, .semibold, estilo: .body)).foregroundStyle(t.estado == "hecha" ? Paleta.textoSecundario : Paleta.texto)
                        .strikethrough(t.estado == "hecha").multilineTextAlignment(.leading)
                    Text(nombre(t.estado) + (t.id == p.siguiente ? " siguiente paso." : "") + (t.enHoy ? " en el plan de hoy." : ""))
                        .font(Tipo.poppins(13.5, .regular, estilo: .footnote)).foregroundStyle(Paleta.textoSecundario)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
        .accessibilityHint("cambia el estado; mantén pulsado para más")
        .contextMenu {
            if t.estado != "hecha" && !t.enHoy { Button("→ hoy.") { aHoy(t) } }
            if t.estado != "hecha" { Button(t.id == p.siguiente ? "quitar de siguiente paso." : "siguiente paso.") { cambiar(.siguiente(id: t.id == p.siguiente ? nil : t.id)) } }
            Button("editar.") { textoEditado = t.texto; editando = t }
            Button("borrar.", role: .destructive) { cambiar(.borrarTarea(id: t.id)) }
        }
    }

    private func nombre(_ e: String) -> String { e == "hecha" ? "hecha." : e == "curso" ? "en marcha." : "pendiente." }

    // El mismo ciclo que proyectoCambiarEstado, pero la operación lleva el estado final.
    private func ciclar(_ t: TareaProyecto) {
        estado(t, t.estado == "pendiente" ? "curso" : t.estado == "curso" ? "hecha" : "pendiente")
    }

    private func estado(_ t: TareaProyecto, _ e: String) {
        if e == "hecha" { marcadas += 1 }
        enviar(.estadoTareaProyecto(proyectoId: id, tareaId: t.id, estado: e))
    }

    private func aHoy(_ t: TareaProyecto) {
        enviar(.proyectoAHoy(proyectoId: id, tareaId: t.id, idTarea: OperacionBitacora.nuevoIdTarea(),
                             dia: CalendarioBitacora.madrid.diaLogico(Date()).iso))
    }

    private func cambiar(_ cambio: CambioProyecto) { enviar(.cambiarProyecto(proyectoId: id, cambio: cambio)) }

    private func enviar(_ op: OperacionBitacora) {
        Task {
            do { try await c.encolar(op); aviso = nil } catch { aviso = "no se pudo guardar en este iPhone." }
        }
    }
}
