import SwiftUI
import UIKit

// Lo que pinta la portada, sacado de lo que ya leen Plan y Calendario (sin cálculos nuevos sobre los datos).
struct VistaInicio: Equatable {
    struct Cosa: Equatable, Identifiable {
        let id: String
        let hora: String?
        let titulo: String
        let notas: String
        let hecha: Bool
        let acento: Bool
        let tarea: TareaPlan?
        var suave = false
        var entradas = 0
        var evento: EventoDia?
    }
    let hoy: LocalDay
    let semana: [LocalDay]
    let conCosas: Set<LocalDay>
    var agenda: [Cosa]
    let sinDia: [TareaPlan]
    let pendientes: Int
    let hechas: Int
    var ciudad: Ciudad = .defecto
    // mobileBusPoste: la primera parada de bus guardada, si Transporte está a la vista.
    var poste: String?
    var lineas: [String] = []
    // Todas las paradas de bus guardadas (claves «bus:N»), para elegir desde Inicio cuál se ve.
    var postes: [String] = []
    // El día elegido en la semana (mobileElegirDia); nil es hoy.
    var elegido: LocalDay?
    // Bitácora 2.0: qué hay cada día de las tres semanas (los puntitos de la semana) y el nombre para el saludo.
    var tipos: [LocalDay: [TipoPunto]] = [:]
    var nombre = ""
    var dia: LocalDay { elegido ?? hoy }

    static func desde(_ doc: DocumentoBitacora, ahora: Date = Date(), elegido: LocalDay? = nil) -> VistaInicio {
        let hoy = CalendarioBitacora.madrid.diaLogico(ahora)
        let plan = LecturaPlanificador.vista(doc, desplazamiento: elegido.map { hoy.dias(hasta: $0) } ?? 0, ahora: ahora)
        // La semana es siempre lunes-domingo (Madrid) y se lee entera de la copia local.
        let centro = elegido ?? hoy
        let semana = centro.semanaLunesDomingo
        let lunes = semana[0]
        // Carrusel real: semana anterior, actual y siguiente (21 días) desde la copia local, sin red.
        let rango = (0..<21).map { lunes.sumando(dias: $0 - 7) }
        var meses = Set<YearMonth>()
        for d in rango { meses.insert(d.yearMonth) }
        var porDia: [LocalDay: [EventoDia]] = [:]
        for m in meses { porDia.merge(LecturaCalendario.mes(doc, m).porDia) { a, _ in a } }
        // renderMobileDiaPanel: lo apuntado como evento y como tarea a la misma hora se queda solo como tarea.
        let clave = { (t: String, h: String?) in "\(t.trimmingCharacters(in: .whitespaces).lowercased())|\(h ?? "")" }
        let enPlan = Set(plan.tareas.map { clave($0.titulo, $0.hora) })
        let eventos = (porDia[plan.dia] ?? []).filter { $0.tipo == "birthday" || !enPlan.contains(clave($0.titulo, $0.hora)) }.map {
            Cosa(id: "e" + $0.id, hora: $0.hora, titulo: $0.titulo, notas: $0.meta, hecha: false, acento: false, tarea: nil,
                 suave: $0.suave, entradas: $0.entradas, evento: $0)
        }
        let tareas = plan.tareas.map { Cosa(id: "t" + $0.id, hora: $0.hora, titulo: $0.titulo, notas: $0.notas, hecha: $0.hecha, acento: $0.arrastrada, tarea: $0) }
        let agenda = (eventos + tareas).sorted { ($0.hora ?? "") < ($1.hora ?? "") }
        let hechas = plan.tareas.filter(\.hecha).count
        // Como la PWA: un día tiene punto si hay algo en el calendario o en el planificador (tres semanas, copia local).
        let diasPlan = ((try? doc.valor(de: "dayPlanner")) ?? nil)?["days"]?.objeto
        var tipos: [LocalDay: [TipoPunto]] = [:]
        for d in rango {
            var s = Set((porDia[d] ?? []).map { TipoPunto.de($0.tipo) })
            if !(diasPlan?[d.iso]?.lista ?? []).isEmpty { s.insert(.tarea) }
            if !s.isEmpty { tipos[d] = s.sorted() }
        }
        var v = VistaInicio(hoy: hoy, semana: semana, conCosas: Set(tipos.keys),
                            agenda: agenda, sinDia: plan.dia == hoy ? plan.sinDia : [], pendientes: plan.tareas.count - hechas, hechas: hechas)
        v.elegido = plan.dia == hoy ? nil : plan.dia
        v.tipos = tipos
        let nombre = (((try? doc.valor(de: "userName")) ?? nil)?.texto ?? "").trimmingCharacters(in: .whitespaces)
        v.nombre = nombre.split(separator: " ").first.map { String($0).lowercased() } ?? ""
        if let c = (try? doc.valor(de: "ciudadTiempo")) ?? nil, let n = c["nombre"]?.texto,
           let la = Dinero.decimal(c["lat"]), let lo = Dinero.decimal(c["lon"]) {
            v.ciudad = Ciudad(nombre: n, lat: NSDecimalNumber(decimal: la).doubleValue, lon: NSDecimalNumber(decimal: lo).doubleValue)
        }
        let tr = ((try? doc.valor(de: "servicios")) ?? nil)?["transporte"]
        if Apartados.visible("transporte", doc), let fav = LecturaTransporte.posteInicio(tr) {
            v.poste = String(fav.dropFirst(4))
            v.lineas = tr?["lineas"]?[fav]?.lista?.compactMap(\.texto) ?? []
            v.postes = LecturaTransporte.postesBus(tr)
        }
        return v
    }
}

// «tu bus.»: el próximo de cada línea (las elegidas, si hay), del que llega antes al que más tarda, cuatro como mucho.
enum ResumenBus {
    static func lineas(_ t: TiemposParada, mias: [String]) -> [(String, Int)] {
        var vistas = Set<String>(), r: [(String, Int)] = []
        for x in t.llegadas.filter({ $0.minutos != nil && (mias.isEmpty || mias.contains($0.linea)) }).sorted(by: { $0.minutos! < $1.minutos! })
        where !vistas.contains(x.linea) {
            vistas.insert(x.linea)
            r.append((x.linea, x.minutos!))
        }
        return Array(r.prefix(4))
    }

    static func texto(_ t: TiemposParada?, mias: [String], color: Color = Paleta.texto) -> Text {
        guard let t else { return Text("mirando el próximo…") }
        let l = lineas(t, mias: mias)
        if l.isEmpty {
            if t.error != nil && t.llegadas.isEmpty && t.error != "El servicio de Avanza no responde" { return Text("sin datos ahora.") }
            return Text(mias.isEmpty ? "sin buses previstos ahora." : "bus \(mias.joined(separator: ", ")), sin buses previstos ahora.")
        }
        var r = Text("")
        for (i, par) in l.enumerated() {
            let fuerte = { (s: String) -> Text in Text(s).fontWeight(.bold).foregroundColor(color) }
            if i > 0 { r = r + Text("; ") }
            r = r + Text("bus ") + fuerte(par.0) + Text(", ")
            r = r + (par.1 == 0 ? fuerte("ya") : Text("en ") + fuerte("\(par.1) min"))
        }
        return r + Text(".")
    }
}

struct InicioView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaInicio?
    @State private var aviso: String?
    @State private var enVuelo = Set<String>()
    @State private var foto: Data?
    @State private var perfilAbierto = false
    @State private var tiempo: Tiempo?
    @State private var bus: TiemposParada?
    @State private var elegido: LocalDay?
    @State private var nombresPostes: [String: String] = [:]

    var body: some View {
        ScrollView {
            InicioCuerpo(vista: vista, ahora: Date(), estado: c.estadoSync,
                         marcar: { t in marcar(t) },
                         abrir: { t in c.modal = .tarea(EditorTarea(id: t.id, nueva: false, dia: vista?.dia, titulo: t.titulo, hora: t.hora, notas: t.notas, deTrabajo: t.deTrabajo, prioridad: t.prioridad)) },
                         irA: { c.pestana = $0 },
                         foto: foto, tiempo: tiempo, bus: bus,
                         abrirEvento: { e in if let d = vista?.dia { c.modal = .ficha(e, dia: d) } },
                         abrirPerfil: { perfilAbierto = true },
                         abrirTiempo: { c.modal = .tiempo },
                         abrirBus: { c.pestana = .mas; c.rutaMas = ["transporte"] },
                         nombresPostes: nombresPostes,
                         elegirPoste: { elegirPoste($0) },
                         elegir: { d in elegir(d) },
                         aviso: aviso)
            .equatable()
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar(); await cargarServicios(forzar: true) }
        .hoja(isPresented: $perfilAbierto, onDismiss: { if let uid = c.sesion?.userId { foto = c.entorno.servicios.perfil.guardada(uid) } }) { PerfilHoja() }
        .task(id: "\(c.revision)-\(elegido?.iso ?? "")") { await cargar() }
        .task(id: vista?.ciudad.clave) { await cargarServicios(forzar: false) }
        // Nada se repinta cada 30 s: solo el bloque «siguiente.» cada minuto (su TimelineView) y la portada al cambiar
        // de día lógico (4:00). El bus, cada 30 s y solo mientras se ve Inicio. Los servicios (foto, tiempo) no dependen
        // del día elegido.
        .task(id: vista?.hoy) { await esperarCambioDeDia() }
        .task(id: vista?.postes.count ?? 0) {
            guard (vista?.postes.count ?? 0) > 1 else { return }
            let todas = await c.entorno.servicios.transporte.paradas()
            var n: [String: String] = [:]
            for p in todas where p.tipo == "bus" { n[p.clave] = p.nombre.lowercased() }
            nombresPostes = n
        }
        .task(id: vista?.poste) {
            while !Task.isCancelled {
                await cargarBus()
                try? await Task.sleep(for: .seconds(30))
            }
        }
    }

    private func esperarCambioDeDia() async {
        guard let hoy = vista?.hoy else { return }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let m = hoy.sumando(dias: 1)
        guard let cuando = cal.date(from: DateComponents(year: m.year, month: m.month, day: m.day, hour: 4, minute: 0, second: 1)) else { return }
        try? await Task.sleep(for: .seconds(max(1, cuando.timeIntervalSinceNow)))
        guard !Task.isCancelled else { return }
        elegido = nil
        await cargar()
    }

    private func cargar() async {
        let objetivo = elegido
        let doc = await c.documentoVisible()
        guard var v = await Task.detached(priority: .userInitiated, operation: { doc.map { VistaInicio.desde($0, elegido: objetivo) } }).value,
              let doc else { vista = nil; return }
        guard elegido == objetivo, !Task.isCancelled else { return }
        vista = v
        Medidas.inicioConDatos()
        Medidas.terminarAlPintar("marcar tarea hasta Inicio", "carrusel: otro día", "carrusel: otra semana")
        // Los partidos de tus equipos (srv_p_) se añaden después, sin esperar a pintar (con su caché de 12 h).
        let partidos = await c.entorno.servicios.deportes.eventos(doc, desde: v.dia, dias: 1)[v.dia] ?? []
        guard !partidos.isEmpty else { return }
        v.agenda = (v.agenda + partidos.map { VistaInicio.Cosa(id: "e" + $0.id, hora: $0.hora, titulo: $0.titulo, notas: $0.meta, hecha: false, acento: false, tarea: nil, evento: $0) })
            .sorted { ($0.hora ?? "") < ($1.hora ?? "") }
        if elegido == objetivo, !Task.isCancelled, vista?.dia == v.dia { vista = v }
    }

    // Cada pieza por su lado: si una falla, las demás siguen. No dependen del día elegido.
    private func cargarServicios(forzar: Bool) async {
        let s = c.entorno.servicios
        let ciudad = vista?.ciudad ?? .defecto
        if tiempo == nil { tiempo = s.tiempo.guardado(ciudad) }
        let uid = c.sesion?.userId
        if let uid, foto == nil { foto = s.perfil.guardada(uid) }
        async let t = s.tiempo.actual(ciudad, forzar: forzar)
        if let uid { foto = await s.perfil.foto(uid) ?? foto }
        if let nuevo = await t, Self.cambiaTiempo(tiempo, nuevo) { tiempo = nuevo }
    }

    // La consulta trae una hora nueva cada vez: solo se repinta si cambia lo que se ve o la previsión.
    static func cambiaTiempo(_ a: Tiempo?, _ b: Tiempo) -> Bool {
        guard let a else { return true }
        return Int(a.temp.rounded()) != Int(b.temp.rounded()) || a.tipo != b.tipo || a.clave != b.clave || a.dias != b.dias
    }

    // transporteElegirInicio: se ve al momento y la vista se rehace con lo guardado.
    private func elegirPoste(_ clave: String) {
        guard clave != "bus:" + (vista?.poste ?? ""), var v = vista else { return }
        v.poste = String(clave.dropFirst(4))
        v.lineas = []
        bus = nil
        vista = v
        Task {
            do { try await c.encolar(.transporteElegirInicio(clave: clave)); aviso = nil } catch {
                aviso = "no se pudo guardar el cambio en este iPhone."
                await cargar()
            }
        }
    }

    private func cargarBus() async {
        guard let poste = vista?.poste else { bus = nil; return }
        bus = await c.entorno.servicios.transporte.tiempos(poste: poste)
    }

    private func elegir(_ d: LocalDay) {
        if let v = vista { Medidas.empezar(d.inicioSemanaLunes == v.dia.inicioSemanaLunes ? "carrusel: otro día" : "carrusel: otra semana") }
        elegido = d == vista?.hoy ? nil : d
    }

    // Como Plan: un toque a la vez por tarea y, si la cola no se puede guardar, aviso (la vista se rehace con lo real).
    private func marcar(_ t: TareaPlan) {
        guard !enVuelo.contains(t.id) else { return }
        enVuelo.insert(t.id)
        Medidas.empezar("marcar tarea hasta Inicio")
        Task {
            defer { enVuelo.remove(t.id) }
            do {
                try await c.encolar(.marcarTarea(id: t.id, hecha: !t.hecha, momentoMs: Int64(Date().timeIntervalSince1970 * 1000)))
                aviso = nil
            } catch {
                aviso = "no se pudo guardar el cambio en este iPhone."
                await cargar()
            }
        }
    }
}

// Inicio en Bitácora 2.0 (foto 3, curado y con aire): degradado naranja arriba que se funde con el lienzo, la marca
// con el tiempo y el perfil, un saludo pequeño con la cuenta del día, la semana en su tarjeta blanca (foto 4), «ahora.»
// en una tarjeta oscura con el bus y el día en tarjetas blancas que entran escalonadas. Al cambiar de día, el contenido
// funde y sube con Muelle.rapido.
struct InicioCuerpo: View {
    let vista: VistaInicio?
    let ahora: Date
    let estado: EstadoSync
    var marcar: (TareaPlan) -> Void = { _ in }
    var abrir: (TareaPlan) -> Void = { _ in }
    var irA: (Pestana) -> Void = { _ in }
    var foto: Data?
    var tiempo: Tiempo?
    var bus: TiemposParada?
    var abrirEvento: (EventoDia) -> Void = { _ in }
    var abrirPerfil: () -> Void = {}
    var abrirTiempo: () -> Void = {}
    var abrirBus: () -> Void = {}
    var nombresPostes: [String: String] = [:]
    var elegirPoste: (String) -> Void = { _ in }
    var elegir: (LocalDay) -> Void = { _ in }
    var aviso: String?
    @State private var sinDiaAbierta = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    private var cambioDeDia: AnyTransition {
        sinMovimiento ? .opacity : .opacity.combined(with: .offset(y: 8))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.entreSecciones) {
            VStack(alignment: .leading, spacing: Medida.s) {
                cabecera
                saludo
            }
            if let v = vista {
                CarruselDias(dias: v.semana, dia: v.dia, hoy: v.hoy, conCosas: v.conCosas, elegir: elegir, tipos: v.tipos)
                    .equatable()
                TimelineView(.everyMinute) { ctx in
                    TarjetaOscura {
                        BloqueSiguiente(vista: v, ahora: v.dia == v.hoy ? max(ctx.date, ahora) : ahora, bus: bus, abrirBus: abrirBus,
                                        nombres: nombresPostes, elegirPoste: elegirPoste)
                    }
                }
                .id(v.dia)
                .transition(cambioDeDia)
                if let aviso {
                    Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.negativo)
                }
                VStack(alignment: .leading, spacing: Medida.entreSecciones) { dia(v) }
                    .id(v.dia)
                    .transition(cambioDeDia)
            } else {
                ProgressView().tint(Lienzo.tintaSecundaria).frame(maxWidth: .infinity).padding(.top, Medida.xl)
            }
        }
        .padding(.horizontal, Medida.margen)
        .padding(.bottom, Medida.xl)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cabeceraPortada(sobreBorde: Medida.sobrePortada)
        .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: vista?.dia)
    }

    // La b. y «bitácora» en pequeño; a la derecha, la nube o el tiempo (un solo hueco) y la foto de perfil.
    private var cabecera: some View {
        CabeceraMarca {
            HStack(spacing: Medida.xxs) {
                HuecoNubeTiempo(estado: estado, tiempo: tiempo, ciudad: vista?.ciudad.nombre ?? "", color: Lienzo.tinta, abrirTiempo: abrirTiempo)
                Button(action: abrirPerfil) {
                    Avatar(foto: foto, tamano: MedidaInicio.avatar, fondo: Lienzo.tarjeta, icono: Lienzo.tintaTerciaria)
                        .overlay(Circle().strokeBorder(Lienzo.filo))
                        .frame(minWidth: Medida.toque, minHeight: Medida.toque)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.pulsable(0.9))
                .accessibilityLabel("mi perfil")
            }
        }
    }

    private var saludo: some View {
        VStack(alignment: .leading, spacing: Medida.xxs) {
            Text(vista.map { $0.nombre.isEmpty ? "hola." : "hola, \($0.nombre)." } ?? "hola.")
                .font(Letra.titulo).foregroundStyle(Lienzo.tinta).kerning(-0.4)
                .accessibilityAddTraits(.isHeader)
            if let v = vista {
                Text(contexto(v)).font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                    .contentTransition(.numericText())
                    .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: contexto(v))
            }
        }
    }

    // «3 pendientes, 1 hecha.»; otro día lleva delante cuál es.
    private func contexto(_ v: VistaInicio) -> String {
        let total = v.pendientes + v.hechas
        let cuenta: String
        if total == 0 {
            cuenta = v.dia == v.hoy ? "día libre." : "nada apuntado."
        } else {
            cuenta = "\(v.pendientes) \(v.pendientes == 1 ? "pendiente" : "pendientes"), \(v.hechas) \(v.hechas == 1 ? "hecha" : "hechas")."
        }
        return v.dia == v.hoy ? cuenta : Self.nombreDia(v) + ", " + cuenta
    }

    static func nombreDia(_ v: VistaInicio) -> String {
        let n = v.hoy.dias(hasta: v.dia)
        return n == 0 ? "hoy" : n == 1 ? "mañana" : n == -1 ? "ayer" : FichaEventoView.fecha(v.dia)
    }

    @ViewBuilder private func dia(_ v: VistaInicio) -> some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            EtiquetaSeccion(texto: Self.nombreDia(v), accion: (titulo: "ver el plan.", hacer: { irA(.plan) }))
            if v.agenda.isEmpty {
                EstadoVacio(texto: v.dia == v.hoy ? "nada para hoy." : "nada este día.", icono: "plan")
                    .tarjeta()
                    .entradaEscalonada(0)
            } else {
                ForEach(Array(v.agenda.enumerated()), id: \.element.id) { i, cosa in
                    fila(cosa).entradaEscalonada(i)
                }
            }
        }
        if !v.sinDia.isEmpty {
            SeccionPlegable(titulo: "pendientes sin día.", detalle: "\(v.sinDia.count)", abierta: $sinDiaAbierta) {
                VStack(alignment: .leading, spacing: Medida.xs) {
                    ForEach(Array(v.sinDia.prefix(MedidaInicio.sinDiaVisibles).enumerated()), id: \.element.id) { i, t in
                        FilaTareaInicio(hora: nil, titulo: t.titulo, notas: t.notas, hecha: t.hecha, subtareas: t.subtareas, subHechas: t.subHechas,
                                        marcar: { marcar(t) }, abrir: { abrir(t) })
                            .entradaEscalonada(i)
                    }
                    if v.sinDia.count > MedidaInicio.sinDiaVisibles {
                        Button("ver todas.") { irA(.plan) }.buttonStyle(.capsula(.claro))
                    }
                }
                .padding(.top, Medida.xxs)
            }
        }
    }

    @ViewBuilder private func fila(_ cosa: VistaInicio.Cosa) -> some View {
        if let t = cosa.tarea {
            FilaTareaInicio(hora: cosa.hora, titulo: cosa.titulo, notas: cosa.notas, hecha: cosa.hecha, arrastrada: cosa.acento,
                            subtareas: t.subtareas, subHechas: t.subHechas, marcar: { marcar(t) }, abrir: { abrir(t) })
        } else if let e = cosa.evento {
            FilaEventoInicio(hora: cosa.hora, titulo: cosa.titulo, detalle: cosa.notas, tipo: TipoPunto.de(e.tipo), suave: cosa.suave,
                             entradas: cosa.entradas, abrir: { abrirEvento(e) })
        } else {
            FilaEventoInicio(hora: cosa.hora, titulo: cosa.titulo, detalle: cosa.notas, suave: cosa.suave, entradas: cosa.entradas)
        }
    }
}

extension InicioCuerpo: Equatable {
    // `ahora` no cuenta: el bloque «siguiente.» tiene su propio reloj (TimelineView) y la portada se rehace al cambiar de día.
    static func == (a: InicioCuerpo, b: InicioCuerpo) -> Bool {
        a.vista == b.vista && a.estado == b.estado && a.foto == b.foto && a.tiempo == b.tiempo && a.bus == b.bus
            && a.aviso == b.aviso && a.nombresPostes == b.nombresPostes
    }
}

// Lo siguiente con hora (o la siguiente tarea útil; si no hay nada, «día despejado.»), con lo que falta y el bus si lo
// hay. Va dentro de una TarjetaOscura; solo esta pieza se repinta cada minuto.
struct BloqueSiguiente: View {
    let vista: VistaInicio
    let ahora: Date
    var bus: TiemposParada?
    var abrirBus: () -> Void = {}
    var nombres: [String: String] = [:]
    var elegirPoste: (String) -> Void = { _ in }

    private var minutoActual: Int {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let c = cal.dateComponents([.hour, .minute], from: ahora)
        // Antes de las 4:00 el día lógico sigue siendo el anterior.
        return ((c.hour ?? 0) < 4 ? 24 + (c.hour ?? 0) : (c.hour ?? 0)) * 60 + (c.minute ?? 0)
    }

    static func minutos(_ h: String?) -> Int? {
        guard let h, h.count >= 4 else { return nil }
        let p = h.split(separator: ":").compactMap { Int($0) }
        guard p.count >= 2 else { return nil }
        return (p[0] < 4 ? 24 + p[0] : p[0]) * 60 + p[1]
    }

    private func etiqueta(_ s: String) -> some View {
        Text(s).font(Letra.pieFuerte).foregroundStyle(Lienzo.naranja)
    }

    var body: some View {
        let esHoy = vista.dia == vista.hoy
        let ahoraMin = minutoActual
        let conHora = vista.agenda.first { !$0.hecha && (Self.minutos($0.hora) ?? -1) >= (esHoy ? ahoraMin : 0) }
        let tarea = vista.agenda.first { !$0.hecha && $0.tarea != nil }
        VStack(alignment: .leading, spacing: Medida.xs) {
            if let s = conHora, let h = s.hora, let m = Self.minutos(h) {
                etiqueta(esHoy ? "siguiente, " + Self.falta(m - ahoraMin) + "." : (vista.dia > vista.hoy ? "lo primero." : "a esa hora."))
                HStack(alignment: .firstTextBaseline, spacing: Medida.s) {
                    Text(h).font(Letra.numeroGrande).foregroundStyle(Lienzo.sobreOscuro)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.titulo).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.sobreOscuro).lineLimit(2)
                        if !s.notas.isEmpty { Text(s.notas).font(Letra.detalle).foregroundStyle(Lienzo.sobreOscuroSuave).lineLimit(1) }
                    }
                }
            } else if let t = tarea {
                etiqueta("lo siguiente.")
                Text(t.titulo).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.sobreOscuro).lineLimit(2)
            } else {
                etiqueta("ahora.")
                Text("día despejado.").font(Letra.titulo).foregroundStyle(Lienzo.sobreOscuro)
            }
            if esHoy, let poste = vista.poste {
                Rectangle().fill(Lienzo.filoOscuro).frame(height: 1).padding(.top, Medida.xxs)
                SelectorPoste(poste: poste, postes: vista.postes, nombres: nombres, elegir: elegirPoste, abrirTransporte: abrirBus)
                Button(action: abrirBus) {
                    HStack(alignment: .center, spacing: Medida.s) {
                        IconoCuadrado(id: "transporte", tono: .translucido, tamano: Medida.iconoPequeno)
                        ResumenBus.texto(bus, mias: vista.lineas, color: Lienzo.sobreOscuro).font(Letra.detalle)
                            .foregroundColor(Lienzo.sobreOscuroSuave)
                            .frame(maxWidth: .infinity, alignment: .leading).multilineTextAlignment(.leading)
                    }
                    .frame(minHeight: Medida.toque)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.pulsable(0.98))
                .accessibilityLabel("tu bus")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }

    static func falta(_ m: Int) -> String {
        if m <= 0 { return "ya" }
        if m < 60 { return "en \(m) min" }
        return m % 60 == 0 ? "en \(m / 60) h" : "en \(m / 60) h \(m % 60) min"
    }
}

// Carrusel de semanas (lunes-domingo, Madrid), 0.23: un ScrollView horizontal paginado del sistema, una página por
// semana con id = su lunes, sin recentrar. El fallo de la 0.19 a la 0.22: el arrastre era un DragGesture simultáneo
// dentro del ScrollView vertical de Inicio; el scroll vertical se quedaba el toque y cancelaba el gesto sin llamar a
// onEnded, así que la semana no cambiaba en el iPhone aunque la lógica (EstadoCarrusel) estuviera bien. El paginado
// nativo convive con el scroll vertical. conCosas cubre las tres semanas alrededor del día que se ve (copia local).
// Equatable (0.23, medido en RendimientoAppTests): marcar una tarea o sincronizar rehace Inicio, pero el carrusel solo
// se vuelve a evaluar si cambia lo suyo; y la lista de semanas se calcula una vez por centro (CacheSemanas), no en cada
// pintado (eran 521 sumas de calendario cada vez).
// 2.0: con el aspecto de SemanaFlotante (tarjeta blanca, mes arriba, «hoy.» para volver, placa gris que se desliza al
// tocar otro día de la semana y puntitos por tipo), pero con la lógica y el identificador que exige CarruselUITests.
struct CarruselDias: View, Equatable {
    static func == (a: CarruselDias, b: CarruselDias) -> Bool {
        a.dias == b.dias && a.dia == b.dia && a.hoy == b.hoy && a.conCosas == b.conCosas && a.tipos == b.tipos
    }

    let dias: [LocalDay]
    let dia: LocalDay
    let hoy: LocalDay
    let conCosas: Set<LocalDay>
    let elegir: (LocalDay) -> Void
    let tipos: [LocalDay: [TipoPunto]]
    @State private var visible: LocalDay?
    @State private var estado = EstadoCarrusel()
    @State private var semanasPasadas = 0
    // Hasta que el scroll se coloca en la semana del día, sus avisos de posición no son del dedo.
    @State private var listo = false
    @State private var cache = CacheSemanas()
    @Namespace private var espacio
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    static let letras = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]

    init(dias: [LocalDay], dia: LocalDay, hoy: LocalDay, conCosas: Set<LocalDay>, elegir: @escaping (LocalDay) -> Void,
         tipos: [LocalDay: [TipoPunto]] = [:]) {
        self.dias = dias; self.dia = dia; self.hoy = hoy; self.conCosas = conCosas; self.elegir = elegir; self.tipos = tipos
        _visible = State(initialValue: dias.first ?? dia.inicioSemanaLunes)
    }

    private var semanaInicio: LocalDay { dias.first ?? dia.inicioSemanaLunes }
    private var base: LocalDay { estado.lunesVisible(semanaInicio: semanaInicio) }
    private var marcado: LocalDay { estado.diaMarcado(dia: dia) }
    private var lejosDeHoy: Bool { marcado != hoy || base != hoy.inicioSemanaLunes }

    var body: some View {
        VStack(spacing: Medida.xs) {
            cabecera
            ScrollViewReader { proxy in
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 0) {
                        ForEach(cache.semanas(hoy: hoy, visible: base), id: \.self) { lunes in
                            SemanaCarrusel(lunes: lunes, marcado: marcado, hoy: hoy, conCosas: conCosas, tipos: tipos, espacio: espacio,
                                           tocar: { tocar($0) })
                                .equatable()
                                .containerRelativeFrame(.horizontal)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.paging)
                .scrollPosition(id: $visible, anchor: .center)
                .scrollIndicators(.hidden)
                .onAppear {
                    proxy.scrollTo(base, anchor: .center)
                    DispatchQueue.main.async { listo = true }
                }
            }
            .frame(height: Tipo.tamano(MedidaInicio.alturaSemana))
            .sensoryFeedback(.selection, trigger: semanasPasadas)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("carrusel-semanas")
            .accessibilityLabel(FichaEventoView.fecha(marcado) + (marcado == hoy ? ", hoy" : ""))
            .accessibilityValue("día elegido")
            .accessibilityAdjustableAction { d in
                if d == .increment { tocar(marcado.sumando(dias: 1)) } else if d == .decrement { tocar(marcado.sumando(dias: -1)) }
            }
            .accessibilityAction(named: "semana anterior") { tocar(marcado.sumando(dias: -7)) }
            .accessibilityAction(named: "semana siguiente") { tocar(marcado.sumando(dias: 7)) }
            .accessibilityAction(named: "ir a hoy.") { tocar(hoy) }
        }
        .padding(.top, Medida.s)
        .padding(.bottom, Medida.xs)
        .padding(.horizontal, Medida.xxs)
        .background(Lienzo.tarjeta, in: RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous).strokeBorder(Lienzo.filo))
        .sombra(.flotante)
        .onChange(of: visible) { _, nuevo in
            guard listo, let nuevo, let d = estado.irA(lunes: nuevo, semanaInicio: semanaInicio, dia: dia) else { return }
            semanasPasadas += 1
            elegir(d)
        }
        .onChange(of: dia) {
            estado.llega(dia)
            colocar(estado.lunesVisible(semanaInicio: semanaInicio))
        }
    }

    // El mes de la semana que se ve y, si no es la de hoy, «hoy.» para volver.
    private var cabecera: some View {
        HStack(spacing: Medida.xs) {
            Text(tituloMes(base))
                .font(Letra.seccion).foregroundStyle(Lienzo.tinta)
                .contentTransition(.numericText())
                .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: base)
            Spacer()
            if lejosDeHoy {
                Button { tocar(hoy) } label: { Chip(texto: "hoy.", tono: .naranja) }
                    .buttonStyle(.pulsable(0.9))
                    .frame(minHeight: Medida.toque)
                    .transition(.scale(scale: 0.7).combined(with: .opacity))
                    .accessibilityLabel("volver a hoy")
            }
        }
        .padding(.horizontal, Medida.s)
        .frame(height: Medida.toque - Medida.xs)
        .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: lejosDeHoy)
    }

    // El mes del jueves de la semana (como la ISO): «noviembre» o «noviembre 2027» si no es este año.
    private func tituloMes(_ l: LocalDay) -> String {
        let j = l.sumando(dias: 3)
        let mes = PanoramaView.meses[j.month - 1]
        return j.year == hoy.year ? mes + "." : "\(mes) \(j.year)."
    }

    // Lleva el scroll a una semana sin animación (hoy a las 4:00, «ir a hoy.», un día tocado de otra semana).
    private func colocar(_ lunes: LocalDay) {
        guard visible != lunes else { return }
        var tx = Transaction(); tx.disablesAnimations = true
        withTransaction(tx) { visible = lunes }
    }

    // Tocar un día: en la misma semana la placa gris se desliza con un muelle; a otra semana, salta.
    private func tocar(_ d: LocalDay) {
        guard d != marcado else { return }
        Haptica.ligera()
        if d.inicioSemanaLunes == base {
            withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { estado.tocar(d) }
        } else {
            estado.tocar(d)
        }
        colocar(d.inicioSemanaLunes)
        elegir(d)
    }
}

final class CacheSemanas {
    private var clave: LocalDay?
    private var lista: [LocalDay] = []

    func semanas(hoy: LocalDay, visible: LocalDay) -> [LocalDay] {
        let c = EstadoCarrusel.centro(hoy: hoy, visible: visible)
        if c != clave { lista = EstadoCarrusel.semanas(centro: c); clave = c }
        return lista
    }
}

// Una semana del carrusel. Equatable: al desplazarse solo se pintan las semanas que entran.
struct SemanaCarrusel: View, Equatable {
    let lunes: LocalDay
    let marcado: LocalDay
    let hoy: LocalDay
    let conCosas: Set<LocalDay>
    var tipos: [LocalDay: [TipoPunto]] = [:]
    let espacio: Namespace.ID
    let tocar: (LocalDay) -> Void

    static func == (a: SemanaCarrusel, b: SemanaCarrusel) -> Bool {
        a.lunes == b.lunes && a.marcado == b.marcado && a.hoy == b.hoy && a.conCosas == b.conCosas && a.tipos == b.tipos
    }

    var body: some View {
        HStack(spacing: 2) { ForEach(0..<7, id: \.self) { celda(lunes.sumando(dias: $0)) } }
    }

    // Sin la lectura por tipos (pruebas, capturas), un día con cosas lleva un puntito gris.
    private func colores(_ d: LocalDay) -> [Color] {
        let t = tipos[d] ?? (conCosas.contains(d) ? [.otro] : [])
        return t.prefix(3).map(\.color)
    }

    private func celda(_ d: LocalDay) -> some View {
        let sel = d == marcado
        let esHoy = d == hoy
        let puntos = colores(d)
        return Button { tocar(d) } label: {
            VStack(spacing: 5) {
                Text(CarruselDias.letras[d.indiceSemanaLunes]).font(Letra.pie)
                    .lineLimit(1).minimumScaleFactor(0.65)
                    .foregroundStyle(sel ? Lienzo.tintaSecundaria : Lienzo.tintaTerciaria)
                Text("\(d.day)").font(sel || esHoy ? Letra.numero : Letra.dia)
                    .lineLimit(1).minimumScaleFactor(0.65)
                    .foregroundStyle(esHoy ? Lienzo.naranjaProfundo : (d < hoy && !sel ? Lienzo.tintaSecundaria : Lienzo.tinta))
                HStack(spacing: 3) {
                    ForEach(Array(puntos.enumerated()), id: \.offset) { _, c in Puntito(color: c, tamano: MedidaInicio.puntoSemana) }
                }
                .frame(height: 5)
            }
            .frame(maxWidth: .infinity, minHeight: Medida.toque)
            .padding(.vertical, Medida.xs)
            .background {
                if sel {
                    RoundedRectangle(cornerRadius: Medida.radioFila, style: .continuous)
                        .fill(Lienzo.sutil)
                        .matchedGeometryEffect(id: "elegido", in: espacio)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(Pulsable(escala: 0.9, haptica: false))
        .accessibilityLabel(FichaEventoView.fecha(d) + (esHoy ? ", hoy" : ""))
        .accessibilityValue(puntos.isEmpty ? "sin nada" : "con cosas")
        .accessibilityAddTraits(sel ? .isSelected : [])
    }
}

// La parada que se ve en Inicio, siempre nombrada, sobre la tarjeta oscura. Con más de una guardada, tocarla abre la
// lista con la elegida marcada; «elegir en transporte.» lleva a la página entera.
struct SelectorPoste: View {
    let poste: String
    let postes: [String]
    let nombres: [String: String]
    let elegir: (String) -> Void
    let abrirTransporte: () -> Void

    private func nombre(_ clave: String) -> String {
        let n = "poste " + String(clave.dropFirst(4))
        return nombres[clave].map { n + ", " + $0 } ?? n
    }

    private var etiqueta: some View {
        HStack(spacing: 6) {
            Text(nombre("bus:" + poste) + ".").font(Letra.pieFuerte).foregroundStyle(Lienzo.sobreOscuroSuave)
                .lineLimit(1).truncationMode(.tail)
            if postes.count > 1 {
                Text("cambiar.").font(Letra.pieFuerte).foregroundStyle(Lienzo.naranja)
            }
            Spacer(minLength: 0)
        }
        .frame(minHeight: 36)
        .contentShape(Rectangle())
    }

    var body: some View {
        let actual = "bus:" + poste
        if postes.count > 1 {
            Menu {
                Section("parada en inicio.") {
                    ForEach(postes, id: \.self) { k in
                        Button { elegir(k) } label: {
                            if k == actual { Label(nombre(k), systemImage: "checkmark") } else { Text(nombre(k)) }
                        }
                    }
                }
                Button("elegir en transporte.", action: abrirTransporte)
            } label: { etiqueta }
            .buttonStyle(.pulsable(0.97))
            .accessibilityLabel("parada en inicio: " + nombre(actual))
            .accessibilityHint("cambia la parada que se ve aquí")
        } else {
            etiqueta.accessibilityElement(children: .combine)
        }
    }
}

// .m-ahora-bloque: margen 22/6, relleno 18 18 16, radio 20, acento al 7 % con filo al 16 %.
struct BloqueAhora: ViewModifier {
    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 18).padding(.top, 18).padding(.bottom, 16)
            .background(Paleta.tinteAcento, in: RoundedRectangle(cornerRadius: Radio.bloque))
            .overlay(RoundedRectangle(cornerRadius: Radio.bloque).strokeBorder(Paleta.filoAcento, lineWidth: 1))
            .padding(.top, 22).padding(.bottom, 6)
            .accessibilityElement(children: .contain)
    }
}

// avatarHtml (perfil.js): la foto en un círculo; sin foto, un círculo vacío del tono indicado.
struct Avatar: View {
    let foto: Data?
    var tamano: CGFloat = 36
    var fondo: Color = Paleta.superficie
    var icono: Color = Paleta.textoSecundario

    var body: some View {
        Group {
            // Decodificada una vez y al tamaño del círculo (antes, en cada pintado de Inicio).
            if let foto, let img = Imagenes.desde(foto, lado: tamano) {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Image(systemName: "person.fill").font(.system(size: tamano * 0.45)).foregroundStyle(icono)
                    .frame(maxWidth: .infinity, maxHeight: .infinity).background(fondo)
            }
        }
        .frame(width: tamano, height: tamano)
        .clipShape(Circle())
    }
}

// M_BUS_ICONO (nucleo.js), en su caja de 100.
struct IconoBus: Shape {
    func path(in r: CGRect) -> Path {
        let s = min(r.width, r.height) / 100
        var p = Path()
        p.addRoundedRect(in: CGRect(x: 10, y: 10, width: 80, height: 75), cornerSize: CGSize(width: 14, height: 14))
        p.addRoundedRect(in: CGRect(x: 15, y: 75, width: 10, height: 20), cornerSize: CGSize(width: 5, height: 5))
        p.addRoundedRect(in: CGRect(x: 75, y: 75, width: 10, height: 20), cornerSize: CGSize(width: 5, height: 5))
        var huecos = Path()
        huecos.addRect(CGRect(x: 22, y: 26, width: 56, height: 22))
        huecos.addEllipse(in: CGRect(x: 20, y: 62, width: 12, height: 12))
        huecos.addEllipse(in: CGRect(x: 68, y: 62, width: 12, height: 12))
        return p.subtracting(huecos).applying(CGAffineTransform(scaleX: s, y: s).translatedBy(x: (r.width / s - 100) / 2, y: (r.height / s - 100) / 2))
    }
}

// .m-fila de un evento: hora, bola, título y meta. Con entrada, «qr.»; los pagos van suaves. Colores adaptables.
struct FilaEvento: View {
    let hora: String?
    let titulo: String
    var detalle = ""
    var suave = false
    var entradas = 0
    var colorTexto: Color = Paleta.texto
    var colorSuave: Color = Paleta.textoSecundario
    var colorAcento: Color = Paleta.acento
    var colorFilo: Color = Paleta.borde
    var colorTinte: Color = Paleta.tinteTexto
    var abrir: (() -> Void)?

    var body: some View {
        Button { abrir?() } label: {
            HStack(spacing: Espacio.s) {
                Text(hora ?? "").font(Letra.cuerpoFuerte).monospacedDigit()
                    .foregroundStyle(colorSuave).frame(width: Tipo.tamano(46), alignment: .leading)
                Circle().fill(suave ? colorFilo : colorAcento).frame(width: Tipo.tamano(12), height: Tipo.tamano(12)).frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: Tipo.tamano(2)) {
                    Text(titulo).font(Letra.tituloTarjeta)
                        .foregroundStyle(suave ? colorSuave : colorTexto).multilineTextAlignment(.leading)
                    if !detalle.isEmpty { Text(detalle).font(Letra.detalle).foregroundStyle(colorSuave).lineLimit(2) }
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                if entradas > 0 {
                    Label("qr.", systemImage: "qrcode").font(Letra.pestana).foregroundStyle(colorTexto)
                        .padding(.horizontal, Tipo.tamano(10)).frame(minHeight: max(32, Tipo.tamano(32)))
                        .background(colorTinte, in: RoundedRectangle(cornerRadius: Radio.control))
                }
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pulsable(0.98))
        .disabled(abrir == nil)
        .overlay(alignment: .bottom) { Rectangle().fill(colorFilo).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }
}
