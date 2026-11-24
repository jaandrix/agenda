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

enum FiltroProyectos: Hashable { case enCurso, hechos }

enum TextoProyectos {
    // PROYECTO_COLINA: el paso más cercano a donde está.
    static func colina(_ v: Double?) -> String? {
        guard let v else { return nil }
        return ProyectoDetalleView.colina.min { abs((Double($0.0) ?? 0) - v) < abs((Double($1.0) ?? 0) - v) }?.1
    }

    // «24 nov. 2026» → «24 nov 2026.»
    static func fecha(_ iso: String) -> String {
        let madrid = TimeZone(identifier: "Europe/Madrid")
        let entrada = DateFormatter()
        entrada.locale = Locale(identifier: "es_ES"); entrada.timeZone = madrid; entrada.dateFormat = "yyyy-MM-dd"
        guard let d = entrada.date(from: String(iso.prefix(10))) else { return iso }
        let salida = DateFormatter()
        salida.locale = Locale(identifier: "es_ES"); salida.timeZone = madrid; salida.dateFormat = "d MMM yyyy"
        return salida.string(from: d).lowercased().replacingOccurrences(of: ".", with: "") + "."
    }

    static func tonoEstado(_ e: String) -> Chip.Tono { e == "Completado" ? .verde : e == "En progreso" ? .oscuro : .sutil }
}

// Proyectos 3.0: tarjetas blancas con su estado, el siguiente paso y la barra de lo hecho; «hechos.» en el segmento.
struct ProyectosView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var proyectos: [ProyectoVista]?
    @State private var nuevo = ""
    @State private var idNuevo = OperacionBitacora.nuevoIdProyecto("proy")
    @State private var aviso: String?
    @State private var filtro = FiltroProyectos.enCurso

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                let todos = proyectos ?? []
                let hechos = todos.filter { $0.estado == "Completado" }
                let vivos = todos.filter { $0.estado != "Completado" }
                CabeceraPagina(titulo: "proyectos.", subtitulo: proyectos.map { $0.isEmpty ? "ninguno todavía." : "\(vivos.count) en marcha." })
                    .padding(.bottom, Medida.xxs)
                if let aviso { Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.negativo).padding(.horizontal, Medida.xxs) }
                if !hechos.isEmpty {
                    SegmentoCapsula(opciones: [.init(valor: FiltroProyectos.enCurso, titulo: "en curso"),
                                               .init(valor: FiltroProyectos.hechos, titulo: "hechos")],
                                    elegido: $filtro, sobreBlanco: false)
                }
                if proyectos == nil {
                    ProgressView().tint(Lienzo.tintaSecundaria).frame(maxWidth: .infinity).padding(.top, Medida.xl)
                } else if filtro == .hechos && !hechos.isEmpty {
                    ForEach(Array(hechos.enumerated()), id: \.element.id) { n, p in tarjeta(p).entradaEscalonada(n) }
                } else {
                    CampoObjetivos(texto: $nuevo, sugerencia: "nuevo proyecto.", boton: "crear.", accion: crear)
                        .tarjeta(relleno: Medida.s)
                    if vivos.isEmpty {
                        TarjetaInvitacion(frase: todos.isEmpty ? "ningún proyecto todavía." : "nada en marcha ahora.",
                                          destacado: "ponle nombre al siguiente.")
                            .entradaEscalonada(0)
                    }
                    ForEach(Array(vivos.enumerated()), id: \.element.id) { n, p in tarjeta(p).entradaEscalonada(n) }
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: proyectos)
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: filtro)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
        .refreshable { await c.sincronizar() }
        .task(id: c.revision) {
            let doc = await c.documentoVisible()
            guard let nuevo = await ultimaGana({ doc.map { LecturaProyectos.vista($0) } }) else { return }
            proyectos = nuevo
            if !(nuevo ?? []).contains(where: { $0.estado == "Completado" }) { filtro = .enCurso }
        }
    }

    private func tarjeta(_ p: ProyectoVista) -> some View {
        let hecho = p.estado == "Completado"
        return NavigationLink { ProyectoDetalleView(id: p.id).huecoDeBarra() } label: {
            VStack(alignment: .leading, spacing: Medida.s) {
                HStack(alignment: .center, spacing: Medida.s) {
                    IconoCuadrado(id: "projects", tono: hecho ? .claro : .oscuro, tamano: Medida.icono)
                    Text(p.titulo).font(Letra.tituloTarjeta).foregroundStyle(hecho ? Lienzo.tintaSecundaria : Lienzo.tinta)
                        .multilineTextAlignment(.leading).lineLimit(2)
                    Spacer(minLength: Medida.xs)
                    if !p.estado.isEmpty { Chip(texto: p.estado.lowercased() + ".", tono: TextoProyectos.tonoEstado(p.estado)) }
                }
                if !hecho, let s = p.siguiente, let t = p.tareas.first(where: { $0.id == s }) {
                    HStack(alignment: .top, spacing: Medida.xs) {
                        Puntito(color: Lienzo.naranja, tamano: 6).padding(.top, 6)
                        VStack(alignment: .leading, spacing: 1) {
                            Text("siguiente paso.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                            Text(t.texto).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).lineLimit(2).multilineTextAlignment(.leading)
                        }
                    }
                    .padding(Medida.s)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Lienzo.sutilSuave, in: RoundedRectangle(cornerRadius: Medida.radioFila, style: .continuous))
                }
                HStack(spacing: Medida.s) {
                    BarraFinaObjetivos(valor: p.tareas.isEmpty ? 0 : Double(p.hechas) / Double(p.tareas.count))
                    Text("\(p.hechas)/\(p.tareas.count)").font(Letra.hora).foregroundStyle(Lienzo.tintaSecundaria)
                }
                if let fase = TextoProyectos.colina(p.colina), !hecho {
                    Text("en la colina, " + fase).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                }
            }
            .tarjeta()
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        }
        .buttonStyle(.pulsable(0.97))
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

// Una raya fina con lo hecho en naranja: el avance, no un adorno.
struct BarraProgreso: View {
    let valor: Double
    var body: some View { BarraFinaObjetivos(valor: valor).accessibilityHidden(true) }
}

// Un renglón para escribir y «añadir.», en gris dentro de una tarjeta blanca.
struct CampoAlta: View {
    @Binding var texto: String
    let sugerencia: String
    let alta: () -> Void

    var body: some View { CampoObjetivos(texto: $texto, sugerencia: sugerencia, boton: "añadir.", multilinea: true, accion: alta) }
}

// El gestor del proyecto (js/proyecto.js): siguiente paso en negro, la colina, tareas por fases plegables, fases y diario.
struct ProyectoDetalleView: View {
    let id: String
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var p: ProyectoVista?
    @State private var aviso: String?
    @State private var marcadas = 0
    @State private var tarea = ""
    @State private var fase = ""
    @State private var apunte = ""
    @State private var editando: TareaProyecto?
    @State private var textoEditado = ""
    @State private var plegadas: Set<String> = []
    @State private var apunteAbierto: String?

    // PROYECTO_COLINA.
    static let colina: [(String, String)] = [("0.08", "pensando."), ("0.28", "probando."), ("0.5", "decidido."), ("0.72", "haciendo."), ("0.93", "rematando.")]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                if let p {
                    CabeceraPagina(titulo: p.titulo.lowercased() + ".", subtitulo: "\(p.hechas) de \(p.tareas.count) hechas.")
                        .padding(.bottom, Medida.xxs)
                    if let aviso { Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.negativo).padding(.horizontal, Medida.xxs) }
                    if let sid = p.siguiente, let s = p.tareas.first(where: { $0.id == sid }) {
                        siguiente(s).entradaEscalonada(0)
                    }
                    colinaBloque(p).entradaEscalonada(1)
                    EtiquetaSeccion(texto: "tareas").padding(.top, Medida.s)
                    tareas(p).entradaEscalonada(2)
                    EtiquetaSeccion(texto: "fases").padding(.top, Medida.s)
                    fases(p).entradaEscalonada(3)
                    EtiquetaSeccion(texto: "diario").padding(.top, Medida.s)
                    CampoAlta(texto: $apunte, sugerencia: "una decisión o un avance.") {
                        let t = apunte.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !t.isEmpty else { return }
                        apunte = ""
                        cambiar(.apuntar(id: OperacionBitacora.nuevoIdProyecto("pd"), fecha: CalendarioBitacora.madrid.dia(de: Date()).iso, texto: String(t.prefix(2000))))
                    }
                    .tarjeta(relleno: Medida.s)
                    .entradaEscalonada(4)
                    ForEach(Array(p.diario.enumerated()), id: \.element.id) { n, d in apunteDiario(d).entradaEscalonada(n + 5) }
                } else {
                    ProgressView().tint(Lienzo.tintaSecundaria).frame(maxWidth: .infinity).padding(.top, Medida.xl)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: p)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
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
        .task(id: c.revision) {
            let doc = await c.documentoVisible()
            let pid = id
            guard let nuevo = await ultimaGana({ doc.flatMap { LecturaProyectos.vista($0).first { $0.id == pid } } }) else { return }
            p = nuevo
        }
    }

    // MARK: - Siguiente paso

    private func siguiente(_ s: TareaProyecto) -> some View {
        TarjetaOscura {
            VStack(alignment: .leading, spacing: Medida.s) {
                HStack(alignment: .firstTextBaseline) {
                    Text("SIGUIENTE PASO").font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.sobreOscuroSuave)
                    Spacer()
                    if s.estado == "curso" { Text("en marcha.").font(Letra.pieFuerte).foregroundStyle(Lienzo.naranja) }
                    else if s.enHoy { Text("en el plan de hoy.").font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave) }
                }
                Text(s.texto).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.sobreOscuro).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: Medida.xs) {
                    Button("hecho.") { estado(s, "hecha", celebrar: true) }.buttonStyle(.capsula(.naranja))
                    if !s.enHoy { Button("→ hoy.") { Haptica.ligera(); aHoy(s) }.buttonStyle(.capsula(.claro)) }
                }
                .padding(.top, Medida.xxs)
            }
        }
    }

    // MARK: - La colina

    // proyectoColinaSvg simplificada: dónde está en una barra fina y los cinco pasos para ponerla.
    private func colinaBloque(_ p: ProyectoVista) -> some View {
        let frase = p.colina.map { $0 < 0.5 ? "cuesta arriba: aún decidiendo cómo." : $0 < 0.6 ? "en la cima: ya sabes cómo hacerlo." : "cuesta abajo: ya solo es hacer." } ?? "¿dónde está? elige abajo."
        return VStack(alignment: .leading, spacing: Medida.s) {
            HStack(alignment: .firstTextBaseline) {
                EtiquetaSeccion(texto: "la colina")
                if let t = TextoProyectos.colina(p.colina) { Text(t).font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta) }
            }
            BarraFinaObjetivos(valor: p.colina ?? 0)
            Text(frase).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).padding(.horizontal, Medida.xxs)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Medida.xxs + 2) {
                    ForEach(Self.colina, id: \.0) { par in
                        let v = par.0, t = par.1
                        let activa = p.colina.map { abs($0 - (Double(v) ?? 0)) < 0.05 } ?? false
                        Button {
                            Haptica.seleccion()
                            cambiar(.colina(v))
                        } label: {
                            Text(t).font(Letra.pestana)
                                .foregroundStyle(activa ? Lienzo.sobreOscuro : Lienzo.tintaSecundaria)
                                .padding(.horizontal, Medida.s).frame(height: 32)
                                .background(activa ? Lienzo.oscuro : Lienzo.sutil, in: Capsule())
                                .frame(minHeight: Medida.toque).contentShape(Rectangle())
                        }
                        .buttonStyle(Pulsable(escala: 0.94, haptica: false))
                        .accessibilityAddTraits(activa ? .isSelected : [])
                    }
                }
            }
            .scrollClipDisabled()
        }
        .tarjeta()
    }

    // MARK: - Tareas

    private func tareas(_ p: ProyectoVista) -> some View {
        let sinFase = p.tareas.filter { t in t.faseId == nil || !p.fases.contains { $0.id == t.faseId } }
        return VStack(alignment: .leading, spacing: Medida.xs) {
            CampoAlta(texto: $tarea, sugerencia: "nueva tarea.") {
                let t = tarea.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !t.isEmpty else { return }
                tarea = ""
                for linea in t.split(separator: "\n").map({ $0.trimmingCharacters(in: .whitespaces) }).filter({ !$0.isEmpty }) {
                    cambiar(.anadirTarea(id: OperacionBitacora.nuevoIdProyecto("pt"), texto: String(linea.prefix(300)), faseId: nil))
                }
            }
            if p.tareas.isEmpty {
                EstadoVacio(texto: "sin tareas. escribe la primera arriba.")
            }
            filas(sinFase, p)
            ForEach(p.fases) { f in
                let suyas = p.tareas.filter { $0.faseId == f.id }
                if !suyas.isEmpty {
                    SeparadorFila(sangria: 0)
                    SeccionPlegable(titulo: f.nombre.lowercased() + ".", detalle: "\(suyas.filter { $0.estado == "hecha" }.count)/\(suyas.count)",
                                    abierta: Binding(get: { !plegadas.contains(f.id) },
                                                     set: { if $0 { plegadas.remove(f.id) } else { plegadas.insert(f.id) } })) {
                        filas(suyas, p)
                    }
                }
            }
        }
        .tarjeta()
    }

    private func filas(_ lista: [TareaProyecto], _ p: ProyectoVista) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(lista.enumerated()), id: \.element.id) { n, t in
                if n > 0 { SeparadorFila(sangria: Medida.toque - Medida.s) }
                filaTarea(t, p)
            }
        }
    }

    private func filaTarea(_ t: TareaProyecto, _ p: ProyectoVista) -> some View {
        let hecha = t.estado == "hecha"
        let alternar = { estado(t, hecha ? "pendiente" : "hecha") }
        return HStack(spacing: Medida.xxs) {
            CasillaMarcar(hecha: hecha, marcar: alternar)
            VStack(alignment: .leading, spacing: 1) {
                Text(t.texto).font(Letra.cuerpo).foregroundStyle(hecha ? Lienzo.tintaSecundaria : Lienzo.tinta)
                    .strikethrough(hecha, color: Lienzo.tintaTerciaria).multilineTextAlignment(.leading)
                if t.enHoy && !hecha { Text("en el plan de hoy.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) }
            }
            Spacer(minLength: Medida.xs)
            if t.estado == "curso" { Chip(texto: "en marcha.", tono: .naranja) }
            else if t.id == p.siguiente { Chip(texto: "siguiente.", tono: .oscuro) }
        }
        .padding(.leading, -Medida.s)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(nombre(t.estado))
        .accessibilityAction { alternar() }
        .accessibilityHint("mantén pulsado para más")
        .contextMenu {
            if t.estado == "pendiente" { Button("en marcha.") { estado(t, "curso") } }
            if t.estado == "curso" { Button("pendiente.") { estado(t, "pendiente") } }
            if !hecha && !t.enHoy { Button("→ hoy.") { aHoy(t) } }
            if !hecha { Button(t.id == p.siguiente ? "quitar de siguiente paso." : "siguiente paso.") { cambiar(.siguiente(id: t.id == p.siguiente ? nil : t.id)) } }
            Button("editar.") { textoEditado = t.texto; editando = t }
            Button("borrar.", role: .destructive) { cambiar(.borrarTarea(id: t.id)) }
        }
    }

    // MARK: - Fases

    private func fases(_ p: ProyectoVista) -> some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            if !p.fases.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(p.fases.enumerated()), id: \.element.id) { n, f in
                        if n > 0 { SeparadorFila(sangria: Medida.toque - Medida.s) }
                        HStack(spacing: Medida.xxs) {
                            CasillaMarcar(hecha: f.hecha) { cambiar(.faseHecha(id: f.id, hecha: !f.hecha)) }
                            Text(f.nombre).font(Letra.cuerpo).foregroundStyle(f.hecha ? Lienzo.tintaSecundaria : Lienzo.tinta)
                                .strikethrough(f.hecha, color: Lienzo.tintaTerciaria)
                            Spacer(minLength: Medida.xs)
                            if !f.fecha.isEmpty { Text(TextoProyectos.fecha(f.fecha)).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) }
                        }
                        .padding(.leading, -Medida.s)
                        .accessibilityElement(children: .combine)
                        .accessibilityValue(f.hecha ? "hecha" : "pendiente")
                        .accessibilityAction { cambiar(.faseHecha(id: f.id, hecha: !f.hecha)) }
                    }
                }
            }
            CampoAlta(texto: $fase, sugerencia: "nueva fase.") {
                let n = fase.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !n.isEmpty else { return }
                fase = ""
                cambiar(.anadirFase(id: OperacionBitacora.nuevoIdProyecto("pf"), nombre: String(n.prefix(200)), fecha: ""))
            }
        }
        .tarjeta()
    }

    // MARK: - Diario

    private func apunteDiario(_ d: ApunteProyecto) -> some View {
        let lineas = d.texto.split(separator: "\n", maxSplits: 1).map(String.init)
        let abierta = apunteAbierto == d.id
        return TarjetaNota(titulo: lineas.first ?? d.texto, extracto: lineas.count > 1 ? lineas[1] : "",
                           fecha: d.fecha.isEmpty ? nil : TextoProyectos.fecha(d.fecha), expandida: abierta) {
            withAnimation(Muelle.o(Muelle.expandir, reducido: sinMovimiento)) { apunteAbierto = abierta ? nil : d.id }
        }
        .contextMenu { Button("quitar.", role: .destructive) { cambiar(.quitarApunte(id: d.id)) } }
    }

    // MARK: - Operaciones

    private func nombre(_ e: String) -> String { e == "hecha" ? "hecha." : e == "curso" ? "en marcha." : "pendiente." }

    private func estado(_ t: TareaProyecto, _ e: String, celebrar: Bool = false) {
        if celebrar { marcadas += 1 }
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
