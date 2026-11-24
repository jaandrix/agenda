import SwiftUI

enum Carga<T: Equatable>: Equatable {
    case cargando
    case lista(T)
    case vacia
}

@MainActor
@Observable
final class PlanModel {
    private(set) var carga: Carga<VistaPlan> = .cargando
    private(set) var aviso: String?
    private(set) var marcadas = 0
    private(set) var marcas = MarcasPlan()
    var desplazamiento = 0
    @ObservationIgnored private var enVuelo = Set<String>()
    // 0.23 (auditoría): la última carga gana (una lectura vieja ya no desmarca lo que se acaba de marcar).
    @ObservationIgnored private var turno = 0

    // Solo decodifica `dayPlanner` y `recurringTasks`, fuera del hilo principal.
    func cargar(_ c: AppCoordinator) async {
        turno += 1
        let mio = turno
        let doc = await c.documentoVisible()
        let d = desplazamiento
        let leido: (VistaPlan, MarcasPlan)? = await Task.detached(priority: .userInitiated) {
            guard let doc else { return nil }
            return (LecturaPlanificador.vista(doc, desplazamiento: d), MarcasPlan.de(doc))
        }.value
        guard d == desplazamiento, mio == turno else { return }
        if let leido {
            var vista = leido.0
            marcas = leido.1
            // Lo que se está guardando ahora mismo conserva el estado que ya se ve.
            if case .lista(let antes) = carga {
                for i in vista.tareas.indices where enVuelo.contains(vista.tareas[i].id) {
                    if let t = antes.tareas.first(where: { $0.id == vista.tareas[i].id }) { vista.tareas[i].hecha = t.hecha }
                }
            }
            carga = .lista(vista)
        } else if case .cargando = carga {
            carga = .vacia
        }
    }

    // Se ve al momento; el cambio va a la cola en disco y, si eso falla, vuelve atrás y avisa.
    func marcar(_ t: TareaPlan, enSinDia: Bool, _ c: AppCoordinator) async {
        guard !enVuelo.contains(t.id), case .lista(var v) = carga else { return }
        let hecha = !t.hecha
        if enSinDia { v.sinDia.removeAll { $0.id == t.id } } else if let i = v.tareas.firstIndex(where: { $0.id == t.id }) { v.tareas[i].hecha = hecha }
        enVuelo.insert(t.id)
        carga = .lista(v)
        if hecha { marcadas += 1 }
        defer { enVuelo.remove(t.id) }
        await guardar(.marcarTarea(id: t.id, hecha: hecha, momentoMs: Self.ahoraMs), c)
    }

    func marcar(_ r: RecurrenteHoy, _ c: AppCoordinator) async {
        guard !enVuelo.contains(r.id), case .lista(var v) = carga, let i = v.recurrentes.firstIndex(where: { $0.id == r.id }) else { return }
        v.recurrentes[i].hecha.toggle()
        let hecha = v.recurrentes[i].hecha
        enVuelo.insert(r.id)
        carga = .lista(v)
        if hecha { marcadas += 1 }
        defer { enVuelo.remove(r.id) }
        await guardar(.marcarRecurrente(id: r.id, dia: v.hoyCivil.iso, hecha: hecha, momentoMs: Self.ahoraMs), c)
    }

    func guardar(_ op: OperacionBitacora, _ c: AppCoordinator) async {
        aviso = nil
        do { try await c.encolar(op) } catch {
            aviso = "no se pudo guardar el cambio en este iPhone."
            await cargar(c)
        }
    }

    static var ahoraMs: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
}

struct PlanView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var modelo = PlanModel()
    @State private var tareaABorrar: TareaPlan?

    var body: some View {
        ScrollView {
            PlanCuerpo(
                carga: modelo.carga, desplazamiento: $modelo.desplazamiento, estado: c.estadoSync,
                pendientes: c.pendientes, aviso: modelo.aviso,
                acciones: PlanCuerpo.Acciones(
                    marcar: { t, sinDia in Task { await modelo.marcar(t, enSinDia: sinDia, c) } },
                    marcarRecurrente: { r in Task { await modelo.marcar(r, c) } },
                    abrir: { t, dia in
                        c.modal = .tarea(EditorTarea(id: t.id, nueva: false, dia: dia, titulo: t.titulo, hora: t.hora, notas: t.notas, deTrabajo: t.deTrabajo, prioridad: t.prioridad))
                    },
                    mover: { t, dia in Task { await modelo.guardar(.moverTarea(id: t.id, dia: dia?.iso), c) } },
                    borrar: { t in tareaABorrar = t },
                    prioridad: { t, p in Task { await modelo.guardar(.parcharTarea(id: t.id, campos: ["prioridad": p ?? ""]), c) } },
                    nueva: { dia in
                        c.modal = .tarea(EditorTarea(id: OperacionBitacora.nuevoIdTarea(sinDia: dia == nil), nueva: true, dia: dia))
                    },
                    abrirApartado: { c.abrirApartado($0) }
                ),
                marcas: modelo.marcas
            )
            .equatable()
            .padding(.horizontal, Medida.margen)
            .padding(.bottom, Medida.entreSecciones)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar() }
        .task(id: "\(c.revision)-\(modelo.desplazamiento)") {
            let t0 = Medidas.ahora
            await modelo.cargar(c)
            if !Task.isCancelled { await Medidas.anotar("pestaña plan (cargar)", desde: t0) }
        }
        .confirmarBorrado($tareaABorrar, titulo: { "¿borrar «\($0.titulo)»?" }) { t in Task { await modelo.guardar(.borrarTarea(id: t.id), c) } }
    }
}

// Solo se rehace si cambia lo que pinta: los informes de la nube llegan a todas las pestañas vivas.
extension PlanCuerpo: Equatable {
    static func == (a: PlanCuerpo, b: PlanCuerpo) -> Bool {
        a.carga == b.carga && a.desplazamiento == b.desplazamiento && a.estado == b.estado && a.pendientes == b.pendientes && a.aviso == b.aviso
            && a.marcas == b.marcas
    }
}

enum SegmentoPlan: Hashable { case porHacer, hechas, sinDia }

// Un grupo del día (foto 4: «▾ Morning»): lo arrastrado, lo que no tiene hora y la mañana, la tarde y la noche.
struct GrupoPlan: Identifiable {
    let id: String
    let titulo: String
    let tareas: [TareaPlan]
}

// La pantalla sin estado propio: recibe lo que pinta y qué hacer. Así se puede dibujar igual en las capturas del CI.
struct PlanCuerpo: View {
    struct Acciones {
        var marcar: (TareaPlan, Bool) -> Void = { _, _ in }
        var marcarRecurrente: (RecurrenteHoy) -> Void = { _ in }
        var abrir: (TareaPlan, LocalDay?) -> Void = { _, _ in }
        var mover: (TareaPlan, LocalDay?) -> Void = { _, _ in }
        var borrar: (TareaPlan) -> Void = { _ in }
        var prioridad: (TareaPlan, String?) -> Void = { _, _ in }
        var nueva: (LocalDay?) -> Void = { _ in }
        var abrirApartado: (String) -> Void = { _ in }
    }

    let carga: Carga<VistaPlan>
    @Binding var desplazamiento: Int
    let estado: EstadoSync
    let pendientes: Int
    let aviso: String?
    var acciones = Acciones()
    var marcas = MarcasPlan()
    @State var verTodasSinDia = false
    @State var moviendo: TareaPlan?
    @State var verRecuerdos = false
    @State var segmento: SegmentoPlan = .porHacer
    // Lo marcado en esta visita se queda en «por hacer», tachado y al final de su grupo, hasta cambiar de día o de
    // segmento (como los 30 minutos del inicio de la PWA): la fila baja con un muelle en vez de desaparecer de golpe.
    @State var recienHechas: Set<String> = []
    @State var plegadas: Set<String> = []
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        let hoy = CalendarioBitacora.madrid.diaLogico(Date())
        VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
            cabecera(hoy)
            SemanaFlotante(hoy: hoy, elegido: hoy.sumando(dias: desplazamiento),
                           puntos: { marcas.colores($0, hoy: hoy) },
                           elegir: { desplazamiento = Self.dias(de: hoy, a: $0) })
                .padding(.top, Medida.xxs)
            if let aviso { Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.negativo).padding(.horizontal, Medida.xxs) }
            switch carga {
            case .cargando:
                ProgressView().tint(Lienzo.tintaSecundaria).frame(maxWidth: .infinity).padding(.top, Medida.xl)
            case .vacia:
                TarjetaInvitacion(frase: "aún no hay copia de tus datos en este iPhone.", destacado: "se traerá en cuanto haya red.")
            case .lista(let v):
                SegmentoCapsula(opciones: [.init(valor: SegmentoPlan.porHacer, titulo: "por hacer"),
                                           .init(valor: SegmentoPlan.hechas, titulo: "hechas"),
                                           .init(valor: SegmentoPlan.sinDia, titulo: "sin día")],
                                elegido: $segmento, sobreBlanco: false)
                    .padding(.top, Medida.xxs)
                VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                    switch segmento {
                    case .porHacer: porHacer(v)
                    case .hechas: hechas(v)
                    case .sinDia: sinDia(v)
                    }
                }
                .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: firma(v))
                // renderEnEsteDiaBoton: discreto, al final del plan de hoy y solo si hay algo.
                if desplazamiento == 0 && !v.recuerdos.isEmpty {
                    Button("en este día, " + (v.recuerdos.count == 1 ? "un recuerdo." : "\(v.recuerdos.count) recuerdos.")) { verRecuerdos = true }
                        .buttonStyle(.capsula(.blanco))
                        .frame(maxWidth: .infinity)
                        .padding(.top, Medida.xs)
                }
            }
        }
        .padding(.top, Medida.xs)
        .onChange(of: desplazamiento) { recienHechas = [] }
        .onChange(of: segmento) { recienHechas = [] }
        .hoja(item: $moviendo) { t in MoverAFecha(tarea: t) { d in acciones.mover(t, d) } }
        .hoja(isPresented: $verRecuerdos) {
            if case .lista(let v) = carga {
                EnEsteDiaHoja(recuerdos: v.recuerdos, hoy: v.hoyCivil) { vista in
                    verRecuerdos = false
                    acciones.abrirApartado(vista)
                }
            }
        }
    }

    // «plan.» en pequeño con «4 por hacer, 2 hechas.»; a la derecha compartir el día y añadir (al día elegido, o sin
    // día si se está viendo «sin día»).
    private func cabecera(_ hoy: LocalDay) -> some View {
        CabeceraPagina(titulo: "plan.", subtitulo: contexto) {
            HStack(spacing: Medida.xxs) {
                if case .lista(let v) = carga, !v.tareas.isEmpty {
                    BotonCompartirRedondo(texto: textoCompartir(v), etiqueta: "compartir el día")
                }
                BotonRedondo(sistema: "plus", tono: .oscuro, etiqueta: segmento == .sinDia ? "nueva tarea sin día" : "nueva tarea") {
                    acciones.nueva(segmento == .sinDia ? nil : hoy.sumando(dias: desplazamiento))
                }
            }
        }
    }

    // MARK: - Segmentos

    @ViewBuilder private func porHacer(_ v: VistaPlan) -> some View {
        let grupos = gruposPorHacer(v)
        let rutinas = v.recurrentes.filter { !$0.hecha || recienHechas.contains($0.id) }
        if grupos.isEmpty && rutinas.isEmpty {
            TarjetaInvitacion(frase: v.tareas.isEmpty ? "nada apuntado para este día." : "todo hecho.",
                              destacado: v.tareas.isEmpty ? nil : "lo marcado está en «hechas».",
                              boton: "añadir tarea.") { acciones.nueva(v.dia) }
                .transition(.opacity)
        } else {
            ForEach(grupos) { g in tarjetaGrupo(g, v) }
            if !rutinas.isEmpty {
                tarjetaRecurrentes(rutinas, detalle: "\(v.recurrentes.filter(\.hecha).count) de \(v.recurrentes.count)")
            }
        }
    }

    @ViewBuilder private func hechas(_ v: VistaPlan) -> some View {
        let tareas = v.tareas.filter(\.hecha)
        let rutinas = v.recurrentes.filter(\.hecha)
        if tareas.isEmpty && rutinas.isEmpty {
            TarjetaInvitacion(frase: "aún no has marcado nada.", destacado: desplazamiento == 0 ? "el día acaba de empezar." : nil)
                .transition(.opacity)
        } else {
            if !tareas.isEmpty { tarjetaGrupo(GrupoPlan(id: "hechas", titulo: "hechas.", tareas: tareas), v, detalle: "\(tareas.count)") }
            if !rutinas.isEmpty { tarjetaRecurrentes(rutinas, detalle: "\(rutinas.count) de \(v.recurrentes.count)") }
        }
    }

    // Como en el inicio de la PWA: con contador y solo las primeras, salvo «ver todas».
    @ViewBuilder private func sinDia(_ v: VistaPlan) -> some View {
        if v.sinDia.isEmpty {
            TarjetaInvitacion(frase: "nada pendiente sin día.", boton: "apuntar una.") { acciones.nueva(nil) }
                .transition(.opacity)
        } else {
            let visibles = verTodasSinDia ? v.sinDia : Array(v.sinDia.prefix(5))
            SeccionPlegable(titulo: "sin día.", detalle: "\(v.sinDia.count)", abierta: abierta("sinDia")) {
                VStack(alignment: .leading, spacing: 0) {
                    filas(visibles, v, enSinDia: true)
                    if v.sinDia.count > 5 {
                        Button(verTodasSinDia ? "ver menos." : "ver todas.") {
                            withAnimation(Muelle.o(Muelle.expandir, reducido: sinMovimiento)) { verTodasSinDia.toggle() }
                        }
                        .font(Letra.pieFuerte).foregroundStyle(Lienzo.naranjaProfundo)
                        .frame(minHeight: Medida.toque)
                        .buttonStyle(.pulsable(0.94))
                        .padding(.leading, sangria)
                    }
                }
            }
            .tarjeta(relleno: Medida.s)
        }
    }

    // MARK: - Tarjetas y filas

    private func tarjetaGrupo(_ g: GrupoPlan, _ v: VistaPlan, detalle: String? = nil) -> some View {
        SeccionPlegable(titulo: g.titulo, detalle: detalle ?? "\(g.tareas.filter { !$0.hecha }.count)", abierta: abierta(g.id)) {
            filas(g.tareas, v, enSinDia: false)
        }
        .tarjeta(relleno: Medida.s)
        .transition(.opacity.combined(with: .scale(scale: 0.98, anchor: .top)))
    }

    private func tarjetaRecurrentes(_ lista: [RecurrenteHoy], detalle: String) -> some View {
        SeccionPlegable(titulo: "recurrentes.", detalle: detalle, abierta: abierta("recurrentes")) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(lista.enumerated()), id: \.element.id) { i, r in
                    if i > 0 { SeparadorFila(sangria: sangria) }
                    FilaTareaV2(titulo: r.texto, hecha: r.hecha, marcar: { marcarRecurrente(r) })
                        .transition(.opacity)
                }
            }
        }
        .tarjeta(relleno: Medida.s)
        .transition(.opacity.combined(with: .scale(scale: 0.98, anchor: .top)))
    }

    private func filas(_ tareas: [TareaPlan], _ v: VistaPlan, enSinDia: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(tareas.enumerated()), id: \.element.id) { i, t in
                if i > 0 { SeparadorFila(sangria: sangria) }
                FilaTareaV2(titulo: t.titulo, hora: enSinDia ? nil : t.hora, notas: t.notas, hecha: t.hecha, arrastrada: t.arrastrada,
                            prioridad: t.prioridad, subtareas: t.subtareas, subHechas: t.subHechas,
                            marcar: { marcar(t, enSinDia: enSinDia) },
                            abrir: { acciones.abrir(t, enSinDia ? nil : v.dia) })
                    .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: Medida.radioFila, style: .continuous))
                    .contextMenu { menu(t, v, enSinDia: enSinDia) }
                    .transition(.opacity.combined(with: .offset(y: -4)))
            }
        }
    }

    // El texto de la fila empieza tras la casilla (44 de área táctil, metida 8 hacia el borde, y 2 de aire).
    private var sangria: CGFloat { Medida.toque - Medida.xs + 2 }

    // MARK: - Marcar

    private func marcar(_ t: TareaPlan, enSinDia: Bool) {
        if t.hecha {
            recienHechas.remove(t.id)
        } else if enSinDia {
            // La de «sin día» sale de la lista al marcarse: la casilla no llega a sonar, así que suena aquí.
            Haptica.exito()
        } else {
            recienHechas.insert(t.id)
        }
        acciones.marcar(t, enSinDia)
    }

    private func marcarRecurrente(_ r: RecurrenteHoy) {
        if r.hecha { recienHechas.remove(r.id) } else { recienHechas.insert(r.id) }
        acciones.marcarRecurrente(r)
    }

    // MARK: - Grupos

    private static let momentos = [("sinHora", "sin hora."), ("manana", "por la mañana."), ("tarde", "por la tarde."), ("noche", "por la noche.")]

    private static func momento(_ hora: String?) -> String {
        guard let h = hora?.split(separator: ":").first.flatMap({ Int($0) }) else { return "sinHora" }
        switch h {
        case 4..<14: return "manana"
        case 14..<20: return "tarde"
        default: return "noche"
        }
    }

    private func gruposPorHacer(_ v: VistaPlan) -> [GrupoPlan] {
        let visibles = v.tareas.filter { !$0.hecha || recienHechas.contains($0.id) }
        // Dentro de cada grupo, lo recién hecho baja al final (el orden de la web se respeta en lo demás).
        let ordenar = { (l: [TareaPlan]) -> [TareaPlan] in l.filter { !$0.hecha } + l.filter { $0.hecha } }
        var grupos: [GrupoPlan] = []
        let arrastradas = visibles.filter(\.arrastrada)
        if !arrastradas.isEmpty { grupos.append(GrupoPlan(id: "arrastradas", titulo: "de otros días.", tareas: ordenar(arrastradas))) }
        let resto = visibles.filter { !$0.arrastrada }
        for (id, titulo) in Self.momentos {
            let l = resto.filter { Self.momento($0.hora) == id }
            if !l.isEmpty { grupos.append(GrupoPlan(id: id, titulo: titulo, tareas: ordenar(l))) }
        }
        return grupos
    }

    // Lo que cambia el orden o el estado de las filas: con esto se anima la recolocación.
    private func firma(_ v: VistaPlan) -> [String] {
        var f: [String] = v.tareas.map { $0.id + ($0.hecha ? "1" : "0") }
        f += v.recurrentes.map { $0.id + ($0.hecha ? "1" : "0") }
        f += v.sinDia.map(\.id)
        f += recienHechas.sorted()
        f.append(verTodasSinDia ? "todas" : "")
        return f
    }

    private func abierta(_ id: String) -> Binding<Bool> {
        Binding(get: { !plegadas.contains(id) }, set: { abrir in
            if abrir { plegadas.remove(id) } else { plegadas.insert(id) }
        })
    }

    static func dias(de a: LocalDay, a b: LocalDay) -> Int {
        let cal: Calendar = {
            var c = Calendar(identifier: .gregorian)
            c.timeZone = TimeZone(identifier: "UTC")!
            return c
        }()
        let fecha = { (d: LocalDay) in cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12)) ?? Date() }
        return cal.dateComponents([.day], from: fecha(a), to: fecha(b)).day ?? 0
    }

    // «mover a una fecha.» desde el menú de la fila: un calendario y listo, sin abrir el editor.
    private struct MoverAFecha: View {
        let tarea: TareaPlan
        let mover: (LocalDay) -> Void
        @Environment(\.dismiss) private var cerrar
        @State private var fecha = Date()

        var body: some View {
            NavigationStack {
                DatePicker("fecha.", selection: $fecha, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .environment(\.locale, Locale(identifier: "es_ES"))
                    .tint(Lienzo.naranja)
                    .tarjeta(relleno: Medida.xs)
                    .padding(.horizontal, Medida.margen)
                    .navigationTitle("mover «\(tarea.titulo)».")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("mover.") { mover(CalendarioBitacora.madrid.dia(de: fecha)); cerrar() }
                        }
                    }
                    .frame(maxHeight: .infinity, alignment: .top)
                    .fondoLienzo()
            }
            .presentationDetents([.medium, .large])
        }
    }

    // Lo que antes eran gestos laterales: mantener pulsado, y también por VoiceOver.
    @ViewBuilder private func menu(_ t: TareaPlan, _ v: VistaPlan, enSinDia: Bool) -> some View {
        if !t.deTrabajo {
            let hoy = v.dia.sumando(dias: -desplazamiento)
            if enSinDia || desplazamiento != 0 { Button("pasar a hoy.") { acciones.mover(t, hoy) } }
            if !enSinDia && desplazamiento == 0 { Button("pasar a mañana.") { acciones.mover(t, hoy.sumando(dias: 1)) } }
            if !enSinDia { Button("dejar sin día.") { acciones.mover(t, nil) } }
            Button("mover a una fecha.") { moviendo = t }
            Menu("prioridad.") {
                ForEach(["alta", "media", "baja", ""], id: \.self) { k in
                    let nombre = k.isEmpty ? "ninguna." : k + "."
                    Button { acciones.prioridad(t, k.isEmpty ? nil : k) } label: {
                        if (t.prioridad ?? "") == k { Label(nombre, systemImage: "checkmark") } else { Text(nombre) }
                    }
                }
            }
            Button("borrar.", role: .destructive) { acciones.borrar(t) }
        }
    }

    // «hoy, 4 por hacer, 2 hechas.» (más el estado de la nube si no está en reposo).
    private var contexto: String {
        var partes = [nombreDia]
        if case .lista(let v) = carga {
            let h = v.tareas.filter(\.hecha).count
            partes.append("\(v.tareas.count - h) por hacer")
            partes.append(h == 1 ? "1 hecha" : "\(h) hechas")
        }
        switch estado {
        case .sinConexion: partes.append("sin conexión")
        case .error: partes.append("error al sincronizar")
        case .trayendo: partes.append("sincronizando")
        case .reposo: break
        }
        if pendientes > 0 { partes.append("\(pendientes) por subir") }
        return partes.joined(separator: ", ") + "."
    }

    private var nombreDia: String {
        switch desplazamiento {
        case 0: "hoy"
        case 1: "mañana"
        case -1: "ayer"
        default: fecha
        }
    }

    private static let formatoFecha: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.timeZone = CalendarioBitacora.madrid.zona
        f.dateFormat = "EEEE d 'de' MMMM"
        return f
    }()

    private var fecha: String {
        let d = CalendarioBitacora.madrid.diaLogico(Date(), desplazamiento: desplazamiento)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        guard let f = cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12)) else { return d.iso }
        return Self.formatoFecha.string(from: f)
    }

    private func textoCompartir(_ v: VistaPlan) -> String {
        ([fecha + "."] + v.tareas.map { ($0.hecha ? "[x] " : "[ ] ") + ($0.hora.map { $0 + " " } ?? "") + $0.titulo }).joined(separator: "\n")
    }
}

// openEnEsteDia: lo de otros años en un día como hoy; cada fila lleva a su apartado.
struct EnEsteDiaHoja: View {
    let recuerdos: [Recuerdo]
    let hoy: LocalDay
    let abrir: (String) -> Void
    @Environment(\.dismiss) private var cerrar

    private static let meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
                                "noviembre", "diciembre"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Medida.s) {
                    Text("lo que pasó un \(hoy.day) de \(Self.meses[hoy.month - 1]) de otros años.")
                        .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        .padding(.horizontal, Medida.xxs)
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(recuerdos.enumerated()), id: \.offset) { i, r in
                            if i > 0 { SeparadorFila() }
                            Button { abrir(r.vista) } label: { fila(r) }
                                .buttonStyle(Pulsable(escala: 0.98, haptica: false))
                                .entradaEscalonada(i)
                        }
                    }
                    .tarjeta(relleno: Medida.s)
                }
                .padding(.horizontal, Medida.margen).padding(.bottom, Medida.xl)
            }
            .fondoLienzo()
            .navigationTitle("en este día.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } } }
        }
        .presentationDetents([.medium, .large])
    }

    private func fila(_ r: Recuerdo) -> some View {
        let anios = hoy.year - r.anio
        return FilaTarjeta(icono: r.vista, titulo: r.titulo, detalle: "\(r.tipo), \(String(r.anio)).") {
            Text(anios == 1 ? "hace un año" : "hace \(anios) años").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
            FlechaFila()
        }
        .accessibilityHint("abre \(Apartados.nombre(r.vista))")
    }
}
