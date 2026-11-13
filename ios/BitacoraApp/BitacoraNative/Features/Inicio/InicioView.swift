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
        var v = VistaInicio(hoy: hoy, semana: semana, conCosas: Set(rango.filter { d in !(porDia[d] ?? []).isEmpty || !(diasPlan?[d.iso]?.lista ?? []).isEmpty }),
                            agenda: agenda, sinDia: plan.dia == hoy ? plan.sinDia : [], pendientes: plan.tareas.count - hechas, hechas: hechas)
        v.elegido = plan.dia == hoy ? nil : plan.dia
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
    @State private var tiempo: Tiempo?
    @State private var bus: TiemposParada?
    @State private var elegido: LocalDay?
    @State private var nombresPostes: [String: String] = [:]

    var body: some View {
        ScrollView {
            InicioCuerpo(vista: vista, ahora: Date(), estado: c.informe.estado,
                         marcar: { t in marcar(t) },
                         abrir: { t in c.modal = .tarea(EditorTarea(id: t.id, nueva: false, dia: vista?.dia, titulo: t.titulo, hora: t.hora, notas: t.notas, deTrabajo: t.deTrabajo, prioridad: t.prioridad)) },
                         irA: { c.pestana = $0 },
                         foto: foto, tiempo: tiempo, bus: bus,
                         abrirEvento: { e in if let d = vista?.dia { c.modal = .ficha(e, dia: d) } },
                         abrirPerfil: { c.web = Apartados.webURL("friends") },
                         abrirTiempo: { c.modal = .tiempo },
                         abrirBus: { c.pestana = .mas; c.rutaMas = ["transporte"] },
                         nombresPostes: nombresPostes,
                         elegirPoste: { elegirPoste($0) },
                         elegir: { d in elegido = d == vista?.hoy ? nil : d },
                         aviso: aviso)
            .equatable()
        }
        .scrollIndicators(.hidden)
        .background(Paleta.contexto.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar(); await cargarServicios(forzar: true) }
        .task(id: "\(c.informe.revision)-\(elegido?.iso ?? "")") { await cargar() }
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

    // Como Plan: un toque a la vez por tarea y, si la cola no se puede guardar, aviso (la vista se rehace con lo real).
    private func marcar(_ t: TareaPlan) {
        guard !enVuelo.contains(t.id) else { return }
        enVuelo.insert(t.id)
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

// Inicio en dirección 02: toda la pantalla sobre Paleta.contexto (sin altura fija ni hoja de otro color), con foto,
// marca y tiempo ligeros, mes, carrusel de días y lo siguiente; debajo, el día con su avance y los pendientes sin día.
// Textos, separadores, progreso y filas usan los tokens de contexto.
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
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    private let ct = Paleta.sobreContexto
    private let cs = Paleta.sobreContextoSuave
    private let cp = Paleta.progreso
    private let cf = Paleta.filoContexto

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                barra
                if let v = vista {
                    Text(PanoramaView.meses[v.dia.month - 1] + ".").font(Tipo.poppins(14, .semibold, estilo: .subheadline))
                        .foregroundStyle(cs).padding(.top, Tipo.tamano(Espacio.s))
                    CarruselDias(dias: v.semana, dia: v.dia, hoy: v.hoy, conCosas: v.conCosas, elegir: elegir)
                    TimelineView(.everyMinute) { ctx in
                        BloqueSiguiente(vista: v, ahora: v.dia == v.hoy ? max(ctx.date, ahora) : ahora, bus: bus, abrirBus: abrirBus,
                                        nombres: nombresPostes, elegirPoste: elegirPoste)
                    }
                    .id(v.dia)
                }
            }
            .padding(.horizontal, 20).padding(.bottom, Espacio.m)
            VStack(alignment: .leading, spacing: 0) {
                if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.error).padding(.top, Espacio.s) }
                if let v = vista {
                    VStack(alignment: .leading, spacing: 0) { dia(v) }
                        .id(v.dia)
                        .transition(sinMovimiento ? .identity : .opacity.combined(with: .offset(y: 4)))
                } else {
                    ProgressView().tint(cs).frame(maxWidth: .infinity).padding(.top, Espacio.xl)
                }
            }
            .padding(.horizontal, 20).padding(.top, Espacio.s).padding(.bottom, Espacio.xl)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .animation(sinMovimiento ? nil : .easeOut(duration: 0.15), value: vista?.dia)
    }

    @ViewBuilder private func dia(_ v: VistaInicio) -> some View {
        cabeceraDia(v)
        if v.agenda.isEmpty {
            Text(v.dia == v.hoy ? "nada para hoy." : "nada este día.").font(Tipo.cuerpo).foregroundStyle(cs).padding(.vertical, Espacio.s)
        }
        ForEach(v.agenda) { cosa in
            if let t = cosa.tarea {
                FilaAgenda(hora: cosa.hora, titulo: cosa.titulo, notas: cosa.notas, hecho: cosa.hecha, acento: cosa.acento,
                           colorTexto: ct, colorSuave: cs, colorAcento: cp, colorFilo: cf, colorSobreAcento: Paleta.sobreProgreso) {
                    marcar(t)
                } abrir: { abrir(t) }
            } else if let e = cosa.evento {
                FilaEvento(hora: cosa.hora, titulo: cosa.titulo, detalle: cosa.notas, suave: cosa.suave, entradas: cosa.entradas,
                           colorTexto: ct, colorSuave: cs, colorAcento: cp, colorFilo: cf, colorTinte: Paleta.tinteContexto) { abrirEvento(e) }
            }
        }
        if !v.sinDia.isEmpty {
            CabeceraSeccion(titulo: "pendientes sin día.", detalle: "\(v.sinDia.count)", colorTexto: ct, colorSuave: cs, colorRaya: cp)
            if let t = v.sinDia.first {
                FilaAgenda(hora: nil, titulo: t.titulo, notas: t.notas, hecho: t.hecha, mostrarHora: false,
                           colorTexto: ct, colorSuave: cs, colorAcento: cp, colorFilo: cf, colorSobreAcento: Paleta.sobreProgreso) { marcar(t) } abrir: { abrir(t) }
            }
            if v.sinDia.count > 1 { AccionTexto(texto: "ver todas.", color: cp) { irA(.plan) } }
        }
    }

    // Foto de 34 a la izquierda, «bitácora.» centrada y el tiempo a la derecha; mientras la nube trabaja, su estado.
    // Si la foto falla queda un círculo fijo: la cabecera no se mueve.
    private var barra: some View {
        ZStack {
            (Text("bitácora").foregroundColor(ct) + Text(".").foregroundColor(Paleta.marca))
                .font(Tipo.poppins(19, .bold, estilo: .title3)).kerning(Tipo.tamano(-0.4))
                .accessibilityAddTraits(.isHeader)
            HStack {
                Button(action: abrirPerfil) { Avatar(foto: foto, tamano: Tipo.tamano(34), fondo: Paleta.tinteContexto, icono: cs) }
                    .buttonStyle(.plain).frame(minWidth: 44, minHeight: 44, alignment: .leading)
                    .accessibilityLabel("mi perfil")
                Spacer()
                HuecoNubeTiempo(estado: estado, tiempo: tiempo, ciudad: vista?.ciudad.nombre ?? "", color: ct, abrirTiempo: abrirTiempo)
            }
        }
        .frame(minHeight: max(52, Tipo.tamano(52)))
    }

    private func cabeceraDia(_ v: VistaInicio) -> some View {
        let n = v.hoy.dias(hasta: v.dia)
        let titulo = n == 0 ? "hoy." : n == 1 ? "mañana." : n == -1 ? "ayer." : FichaEventoView.fecha(v.dia) + "."
        let total = v.pendientes + v.hechas
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(titulo).font(Tipo.poppins(30, .bold, estilo: .title)).kerning(Tipo.tamano(-1)).foregroundStyle(ct)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Text(total == 0 ? "libre." : "\(v.pendientes) pendientes, \(v.hechas) hechas").font(Tipo.pie).foregroundStyle(cs)
            }
            if total > 0 {
                HStack(spacing: Espacio.s) {
                    BarraAvance(valor: Double(v.hechas) / Double(total), fondo: cf, color: cp, alto: max(3, Tipo.tamano(3)))
                    Text("\(v.hechas * 100 / total) %").font(Tipo.poppins(12, .semibold, estilo: .caption)).monospacedDigit().foregroundStyle(cs)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("día al \(v.hechas * 100 / total) por ciento")
            }
        }
        .padding(.top, Espacio.m).padding(.bottom, Espacio.s)
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
// hay. Solo esta pieza se repinta cada minuto.
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

    var body: some View {
        let esHoy = vista.dia == vista.hoy
        let ahoraMin = minutoActual
        let conHora = vista.agenda.first { !$0.hecha && (Self.minutos($0.hora) ?? -1) >= (esHoy ? ahoraMin : 0) }
        let tarea = vista.agenda.first { !$0.hecha && $0.tarea != nil }
        VStack(alignment: .leading, spacing: 4) {
            if let s = conHora, let h = s.hora, let m = Self.minutos(h) {
                Text(esHoy ? "siguiente, " + Self.falta(m - ahoraMin) + "." : (vista.dia > vista.hoy ? "lo primero." : "a esa hora."))
                    .font(Tipo.poppins(13, .semibold, estilo: .footnote)).foregroundStyle(Paleta.progreso)
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(h).font(Tipo.poppins(34, .bold, estilo: .title)).monospacedDigit().foregroundStyle(Paleta.sobreContexto)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.titulo).font(Tipo.poppins(17, .semibold, estilo: .body)).foregroundStyle(Paleta.sobreContexto).lineLimit(2)
                        if !s.notas.isEmpty { Text(s.notas).font(Tipo.poppins(13.5, .regular, estilo: .footnote)).foregroundStyle(Paleta.sobreContextoSuave).lineLimit(1) }
                    }
                }
            } else if let t = tarea {
                Text("lo siguiente.").font(Tipo.poppins(13, .semibold, estilo: .footnote)).foregroundStyle(Paleta.progreso)
                Text(t.titulo).font(Tipo.poppins(20, .semibold, estilo: .title3)).foregroundStyle(Paleta.sobreContexto).lineLimit(2)
            } else {
                Text("día despejado.").font(Tipo.poppins(22, .bold, estilo: .title3)).foregroundStyle(Paleta.sobreContexto)
            }
            if esHoy, let poste = vista.poste {
                SelectorPoste(poste: poste, postes: vista.postes, nombres: nombres, elegir: elegirPoste, abrirTransporte: abrirBus)
                    .padding(.top, 6)
                    .overlay(alignment: .top) { Rectangle().fill(Paleta.filoContexto).frame(height: 1) }
                Button(action: abrirBus) {
                    HStack(alignment: .center, spacing: Tipo.tamano(10)) {
                        IconoBus().fill(Paleta.sobreContexto).frame(width: Tipo.tamano(20), height: Tipo.tamano(20))
                        ResumenBus.texto(bus, mias: vista.lineas, color: Paleta.sobreContexto).font(Tipo.poppins(15, .regular, estilo: .body))
                            .foregroundColor(Paleta.sobreContextoSuave)
                            .frame(maxWidth: .infinity, alignment: .leading).multilineTextAlignment(.leading)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("tu bus")
            }
        }
        .padding(.top, Espacio.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }

    static func falta(_ m: Int) -> String {
        if m <= 0 { return "ya" }
        if m < 60 { return "en \(m) min" }
        return m % 60 == 0 ? "en \(m / 60) h" : "en \(m / 60) h \(m % 60) min"
    }
}

// Carrusel real de días (lunes-domingo, Madrid): recibe la semana visible y deriva las adyacentes con LocalDay;
// conCosas cubre las tres semanas desde la copia local (sin red). Durante el arrastre horizontal las semanas
// anterior/actual/siguiente siguen el dedo; al soltar hace snap a una semana completa centrada. Umbral: 44 pt o
// predicted 70 pt (una semana exacta, ±7 días); si no, vuelve al centro. No compite con el scroll vertical.
// Reduce Motion: cambio inmediato, sin animación extensa. Los tamaños usan Tipo/LetraActiva (escala de Ajustes).
struct CarruselDias: View {
    let dias: [LocalDay]
    let dia: LocalDay
    let hoy: LocalDay
    let conCosas: Set<LocalDay>
    let elegir: (LocalDay) -> Void
    @State private var arrastre: CGFloat = 0
    @State private var eje: Bool?
    @State private var pendiente: Int = 0
    @State private var estado = EstadoCarrusel()
    @State private var semanasPasadas = 0
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    static let letras = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
    static let umbral: CGFloat = 44
    static let umbralPredicho: CGFloat = 70

    private var base: LocalDay { estado.lunesVisible(semanaInicio: dias.first ?? dia) }
    private var marcado: LocalDay { estado.diaMarcado(dia: dia) }

    var body: some View {
        GeometryReader { geo in
            let ancho = max(geo.size.width, 1)
            PaginasSemanas(base: base, marcado: marcado, hoy: hoy, conCosas: conCosas, ancho: ancho, tocar: { tocar($0) })
                .equatable()
                .offset(x: -ancho + arrastre)
            .contentShape(Rectangle())
            .simultaneousGesture(pendiente == 0 ? gesto(ancho: ancho) : nil)
        }
        .frame(height: Tipo.tamano(64))
        .clipped()
        .sensoryFeedback(.selection, trigger: semanasPasadas)
        .padding(.top, Espacio.s)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(FichaEventoView.fecha(marcado) + (marcado == hoy ? ", hoy" : ""))
        .accessibilityValue("día elegido")
        .accessibilityAdjustableAction { d in
            if d == .increment { tocar(marcado.sumando(dias: 1)) } else if d == .decrement { tocar(marcado.sumando(dias: -1)) }
        }
        .accessibilityAction(named: "semana anterior") { tocar(marcado.sumando(dias: -7)) }
        .accessibilityAction(named: "semana siguiente") { tocar(marcado.sumando(dias: 7)) }
        .accessibilityAction(named: "ir a hoy.") { tocar(hoy) }
        .onChange(of: dia) {
            if pendiente != 0 { pendiente = 0; arrastre = 0 }
            var tx = Transaction(); tx.disablesAnimations = true
            withTransaction(tx) { estado.llega(dia) }
        }
    }

    private func tocar(_ d: LocalDay) {
        guard d != marcado else { return }
        var tx = Transaction(); tx.disablesAnimations = true
        withTransaction(tx) { estado.tocar(d) }
        elegir(d)
    }

    private func gesto(ancho: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 14)
            .onChanged { v in
                guard pendiente == 0 else { return }
                if eje == nil { eje = abs(v.translation.width) > abs(v.translation.height) * 1.35 }
                if eje == true { arrastre = v.translation.width }
            }
            .onEnded { v in
                defer { eje = nil }
                guard eje == true, pendiente == 0 else { arrastre = 0; return }
                let dx = v.translation.width, px = v.predictedEndTranslation.width
                let paso = Self.paso(dx: dx, px: px)
                // Encaje físico: el muelle arranca con la velocidad del dedo (relativa a lo que falta), así la semana
                // sigue el lanzamiento en vez de reiniciarse; el cambio de semana se confirma al asentarse, no con un reloj.
                let vx = v.velocity.width
                if paso == 0 {
                    if sinMovimiento { arrastre = 0 } else {
                        withAnimation(Self.muelle(velocidad: vx, desde: arrastre, hasta: 0)) { arrastre = 0 }
                    }
                } else {
                    if sinMovimiento {
                        var tx = Transaction(); tx.disablesAnimations = true
                        var nuevoDia = dia
                        withTransaction(tx) { nuevoDia = estado.paso(paso, semanaInicio: dias.first ?? dia, dia: dia); arrastre = 0 }
                        elegir(nuevoDia)
                    } else {
                        pendiente = paso
                        let destino: CGFloat = paso > 0 ? -ancho : ancho
                        let esperado = paso
                        withAnimation(Self.muelle(velocidad: vx, desde: arrastre, hasta: destino), completionCriteria: .logicallyComplete) {
                            arrastre = destino
                        } completion: {
                            guard pendiente == esperado else { return }
                            var tx = Transaction(); tx.disablesAnimations = true
                            var nuevoDia = dia
                            withTransaction(tx) {
                                nuevoDia = estado.paso(paso, semanaInicio: dias.first ?? dia, dia: dia)
                                arrastre = 0; pendiente = 0
                            }
                            semanasPasadas += 1
                            elegir(nuevoDia)
                        }
                    }
                }
            }
    }

    // Velocidad inicial relativa (fracción de la distancia por segundo), acotada para que un lanzamiento fuerte no rebote.
    static func muelle(velocidad: CGFloat, desde: CGFloat, hasta: CGFloat) -> Animation {
        let falta = hasta - desde
        let relativa = abs(falta) < 1 ? 0 : min(max(velocidad / falta, 0), 8)
        return .interpolatingSpring(duration: 0.34, bounce: 0.06, initialVelocity: relativa)
    }

    static func paso(dx: CGFloat, px: CGFloat) -> Int {
        let porTramo = abs(dx) > umbral
        let porFuerza = abs(px) > umbralPredicho
        guard porTramo || porFuerza else { return 0 }
        let dir = porFuerza ? px : dx
        return dir < 0 ? 7 : -7
    }

}

// Las tres semanas del carrusel (anterior, la que se ve y la siguiente). Equatable: mientras el dedo arrastra solo
// cambia el desplazamiento de fuera y estas celdas no se vuelven a calcular.
struct PaginasSemanas: View, Equatable {
    let base: LocalDay
    let marcado: LocalDay
    let hoy: LocalDay
    let conCosas: Set<LocalDay>
    let ancho: CGFloat
    let tocar: (LocalDay) -> Void

    static func == (a: PaginasSemanas, b: PaginasSemanas) -> Bool {
        a.base == b.base && a.marcado == b.marcado && a.hoy == b.hoy && a.conCosas == b.conCosas && a.ancho == b.ancho
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach([-7, 0, 7], id: \.self) { delta in
                HStack(spacing: 0) { ForEach(0..<7, id: \.self) { celda(base.sumando(dias: delta + $0)) } }
                    .frame(width: ancho)
            }
        }
    }

    private func celda(_ d: LocalDay) -> some View {
        let sel = d == marcado
        let letra = CarruselDias.letras[d.indiceSemanaLunes]
        return Button { tocar(d) } label: {
            VStack(spacing: Tipo.tamano(1.5)) {
                Text(letra).font(Tipo.poppins(10.5, sel ? .semibold : .medium, estilo: .caption2))
                    .lineLimit(1).minimumScaleFactor(0.65)
                    .foregroundStyle(sel ? Paleta.sobreContexto : Paleta.sobreContextoSuave)
                Text("\(d.day)").font(Tipo.poppins(22, .bold, estilo: .title3)).monospacedDigit()
                    .lineLimit(1).minimumScaleFactor(0.65)
                    .frame(maxWidth: .infinity).frame(height: Tipo.tamano(38))
                    .background(sel ? Paleta.progreso : .clear, in: RoundedRectangle(cornerRadius: Tipo.tamano(11), style: .continuous))
                    .foregroundStyle(sel ? Paleta.sobreProgreso : Paleta.sobreContexto)
                Circle().fill(conCosas.contains(d) ? Paleta.sobreContextoSuave : .clear).frame(width: Tipo.tamano(4), height: Tipo.tamano(4))
                    .overlay(Circle().strokeBorder(d == hoy && !sel ? Paleta.progreso : .clear, lineWidth: 1.5).frame(width: Tipo.tamano(8), height: Tipo.tamano(8)))
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(FichaEventoView.fecha(d) + (d == hoy ? ", hoy" : ""))
        .accessibilityAddTraits(sel ? .isSelected : [])
    }
}

// La parada que se ve en Inicio, siempre nombrada. Con más de una guardada, tocarla abre la lista con la elegida
// marcada; «elegir en transporte.» lleva a la página entera.
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
            Text(nombre("bus:" + poste) + ".").font(Tipo.poppins(13, .semibold, estilo: .footnote)).foregroundStyle(Paleta.sobreContextoSuave)
                .lineLimit(1).truncationMode(.tail)
            if postes.count > 1 {
                Text("cambiar.").font(Tipo.poppins(13, .semibold, estilo: .footnote)).foregroundStyle(Paleta.progreso)
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
            .buttonStyle(.plain)
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
            if let foto, let img = UIImage(data: foto) {
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
                Text(hora ?? "").font(Tipo.poppins(14, .semibold, estilo: .footnote)).monospacedDigit()
                    .foregroundStyle(colorSuave).frame(width: Tipo.tamano(46), alignment: .leading)
                Circle().fill(suave ? colorFilo : colorAcento).frame(width: Tipo.tamano(12), height: Tipo.tamano(12)).frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: Tipo.tamano(2)) {
                    Text(titulo).font(Tipo.poppins(16.5, .semibold, estilo: .body))
                        .foregroundStyle(suave ? colorSuave : colorTexto).multilineTextAlignment(.leading)
                    if !detalle.isEmpty { Text(detalle).font(Tipo.poppins(13.5, .regular, estilo: .footnote)).foregroundStyle(colorSuave).lineLimit(2) }
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                if entradas > 0 {
                    Label("qr.", systemImage: "qrcode").font(Tipo.poppins(13, .semibold, estilo: .footnote)).foregroundStyle(colorTexto)
                        .padding(.horizontal, Tipo.tamano(10)).frame(minHeight: max(32, Tipo.tamano(32)))
                        .background(colorTinte, in: RoundedRectangle(cornerRadius: Radio.control))
                }
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(abrir == nil)
        .overlay(alignment: .bottom) { Rectangle().fill(colorFilo).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }
}
