import SwiftUI

@MainActor
@Observable
final class CalendarioModel {
    var mes: YearMonth
    var elegido: LocalDay
    private(set) var vista: VistaMes?
    // 0.23 (auditoría): la última carga gana aunque el mes sea el mismo (una lectura vieja ya no pisa a la nueva).
    @ObservationIgnored private var turno = 0

    init() {
        let hoy = CalendarioBitacora.madrid.dia(de: Date())
        mes = hoy.yearMonth
        elegido = hoy
    }

    func cargar(_ c: AppCoordinator) async {
        turno += 1
        let mio = turno
        let t0 = Medidas.ahora
        let doc = await c.documentoVisible()
        let m = mes
        let v: VistaMes? = await Task.detached(priority: .userInitiated) {
            doc.map { LecturaCalendario.mes($0, m) }
        }.value
        guard mio == turno else { return }
        if m == mes { vista = v; Medidas.anotar("pestaña calendario (cargar)", desde: t0) }
        // Los partidos de tus equipos, cuando llegan de la red.
        guard let doc, let v, let primero = LocalDay(year: m.year, month: m.month, day: 1) else { return }
        let partidos = await c.entorno.servicios.deportes.eventos(doc, desde: primero, dias: 31)
        guard !partidos.isEmpty, m == mes, mio == turno else { return }
        var porDia = v.porDia
        for (d, l) in partidos where d.yearMonth == m { porDia[d, default: []].append(contentsOf: l); porDia[d]?.sort { ($0.hora ?? "") < ($1.hora ?? "") } }
        vista = VistaMes(mes: m, porDia: porDia)
    }

    func moverMes(_ n: Int) {
        var y = mes.year, m = mes.month + n
        while m < 1 { m += 12; y -= 1 }
        while m > 12 { m -= 12; y += 1 }
        mes = YearMonth(year: y, month: m)!
        elegido = LocalDay(year: y, month: m, day: 1)!
    }
}

// Bitácora 2.0: el mes en una tarjeta semi flotante (o la semana, si se prefiere) y, debajo, la agenda del día en
// tarjetas blancas. Cumpleaños y lo que dura todo el día van arriba; lo que tiene hora, en orden, con su bloque de hora.
struct CalendarioView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var modelo = CalendarioModel()
    @State private var borrando: EventoDia?
    @State private var aviso: String?
    // Lo ya leído de otros meses, para que sus puntitos estén al volver deslizando sin esperar a la lectura.
    @State private var vistas: [YearMonth: VistaMes] = [:]
    @State private var haciaDelante = true
    // 3.0.1: las tareas del día elegido (solo para verlas: se marcan en Plan e Inicio).
    @State private var tareasDia: [TareaPlan] = []
    @State private var borrandoTarea: TareaPlan?
    @AppStorage("bitacora.calendario.semana") private var enSemana = false

    @State private var hoy = CalendarioBitacora.madrid.dia(de: Date())
    @Environment(\.scenePhase) private var fase
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.l) {
                CabeceraPagina(titulo: "calendario.", subtitulo: nombreMes) {
                    SegmentoCapsula(opciones: [.init(valor: false, titulo: "mes"), .init(valor: true, titulo: "semana")],
                                    elegido: $enSemana, sobreBlanco: false)
                        .frame(width: 156)
                        .accessibilityLabel("ver el mes o la semana")
                }
                ZStack(alignment: .top) {
                    if enSemana {
                        SemanaFlotante(hoy: hoy, elegido: modelo.elegido, puntos: puntos, elegir: elegir)
                            .transition(.opacity.combined(with: .scale(scale: 0.98, anchor: .top)))
                    } else {
                        MesFlotanteCalendario(hoy: hoy, elegido: modelo.elegido,
                                    mes: Binding(get: { modelo.mes }, set: { cambiarMes($0) }),
                                    puntos: puntos, elegir: elegir)
                            .transition(.opacity.combined(with: .scale(scale: 0.98, anchor: .top)))
                    }
                }
                if let aviso {
                    Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.negativo).padding(.horizontal, Medida.xxs)
                }
                ZStack(alignment: .top) {
                    agenda(modelo.elegido)
                        .id(modelo.elegido)
                        .transition(transicionDia)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.l)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar() }
        .task(id: "\(c.revision)-\(modelo.mes.iso)-\(hoy.iso)") { await modelo.cargar(c) }
        .task(id: "\(c.revision)-\(modelo.elegido.iso)") { await cargarTareas(modelo.elegido) }
        .onChange(of: modelo.vista) { _, v in if let v { vistas[v.mes] = v } }
        .onChange(of: c.revision) { _, _ in vistas = vistas.filter { $0.key == modelo.mes } }
        .onChange(of: fase) { _, f in if f == .active { hoy = CalendarioBitacora.madrid.dia(de: Date()) } }
        .confirmationDialog("¿borrar este evento?", isPresented: Binding(get: { borrando != nil }, set: { if !$0 { borrando = nil } }), titleVisibility: .visible) {
            Button("borrar.", role: .destructive) {
                guard let e = borrando else { return }
                Task {
                    do { try await c.encolar(.borrarEntrada(id: e.id)); aviso = nil } catch { aviso = "no se pudo borrar en este iPhone." }
                }
            }
            Button("cancelar.", role: .cancel) {}
        }
        // 3.1: las tareas del día también se borran desde aquí (mantener pulsada la tarjeta).
        .confirmationDialog("¿borrar esta tarea?", isPresented: Binding(get: { borrandoTarea != nil }, set: { if !$0 { borrandoTarea = nil } }), titleVisibility: .visible) {
            Button("borrar.", role: .destructive) {
                guard let t = borrandoTarea else { return }
                borrarTarea(t)
            }
            Button("cancelar.", role: .cancel) {}
        } message: {
            Text(borrandoTarea?.titulo ?? "")
        }
    }

    private func borrarTarea(_ t: TareaPlan) {
        let antes = tareasDia
        withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento)) { tareasDia.removeAll { $0.id == t.id } }
        Task {
            do {
                try await c.encolar(.borrarTarea(id: t.id))
                aviso = nil
                Haptica.exito()
            } catch {
                withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento)) { tareasDia = antes }
                aviso = "no se pudo borrar en este iPhone."
            }
        }
    }

    // MARK: - Día elegido

    private var transicionDia: AnyTransition {
        guard !sinMovimiento else { return .opacity }
        return .asymmetric(insertion: .offset(x: haciaDelante ? 28 : -28).combined(with: .opacity), removal: .opacity)
    }

    private func elegir(_ d: LocalDay) {
        guard d != modelo.elegido else { return }
        haciaDelante = d > modelo.elegido
        withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) {
            if d.yearMonth != modelo.mes { modelo.mes = d.yearMonth }
            modelo.elegido = d
        }
    }

    // Al deslizar de mes: hoy si es el mes de hoy; si no, el día 1.
    private func cambiarMes(_ m: YearMonth) {
        guard m != modelo.mes else { return }
        haciaDelante = m > modelo.mes
        withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) {
            modelo.mes = m
            modelo.elegido = m == hoy.yearMonth ? hoy : LocalDay(year: m.year, month: m.month, day: 1)!
        }
    }

    private func vista(_ m: YearMonth) -> VistaMes? {
        if let v = modelo.vista, v.mes == m { return v }
        return vistas[m]
    }

    private func eventos(_ d: LocalDay) -> [EventoDia] { vista(d.yearMonth)?.porDia[d] ?? [] }

    private func puntos(_ d: LocalDay) -> [Color] {
        var r: [Color] = []
        for e in eventos(d) {
            let p = Self.punto(e.tipo)
            if !r.contains(p) { r.append(p) }
            if r.count == 3 { break }
        }
        return r
    }

    // MARK: - Agenda

    @ViewBuilder private func agenda(_ d: LocalDay) -> some View {
        let lista = eventos(d)
        let todoElDia = lista.filter { $0.hora == nil && $0.tipo == "birthday" } + lista.filter { $0.hora == nil && $0.tipo != "birthday" }
        let conHora = lista.filter { $0.hora != nil }
        let tareas = tareasSinRepetir(lista)
        let total = lista.count + tareas.count
        VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
            HStack(alignment: .firstTextBaseline) {
                Text(nombreDia(d) + ".").font(Letra.seccion).foregroundStyle(Lienzo.tinta)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                if total > 0 {
                    Text(total == 1 ? "1 cosa" : "\(total) cosas").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        .monospacedDigit()
                }
            }
            .padding(.horizontal, Medida.xxs)
            if vista(d.yearMonth) == nil {
                Color.clear.frame(height: 120)
            } else if total == 0 {
                TarjetaInvitacion(frase: d == hoy ? "hoy no tienes nada apuntado." : "este día está libre.",
                                  destacado: "¿apuntas algo?", boton: "apuntar.") { c.abrirApuntar(dia: d) }
            } else {
                if !todoElDia.isEmpty {
                    EtiquetaSeccion(texto: "todo el día").padding(.top, Medida.xxs)
                    HiloAgenda {
                        ForEach(Array(todoElDia.enumerated()), id: \.element.id) { i, e in tarjeta(e, dia: d).entradaEscalonada(i) }
                    }
                }
                let delDia = ordenadas(conHora, tareas)
                if !delDia.isEmpty {
                    if !todoElDia.isEmpty { EtiquetaSeccion(texto: "con hora").padding(.top, Medida.xs) }
                    HiloAgenda {
                        ForEach(Array(delDia.enumerated()), id: \.element.id) { i, cosa in
                            fila(cosa, dia: d).entradaEscalonada(todoElDia.count + i)
                        }
                    }
                }
                // 3.0.1: «apuntar.» repetía el + de la barra; aquí solo queda crear un evento en este día.
                HStack(spacing: Medida.xs) {
                    Button("nuevo evento.") {
                        c.modal = .evento(EditorEvento(id: OperacionBitacora.nuevoIdEntrada(), nuevo: true, fecha: d))
                    }
                    .buttonStyle(.capsula)
                    Spacer(minLength: 0)
                }
                .padding(.top, Medida.xs)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func tarjeta(_ e: EventoDia, dia d: LocalDay) -> some View {
        let detalle = e.meta.isEmpty ? e.notas : e.meta
        // 3.2, «pastel.»: la tarjeta va rellena del pastel de su tipo (lo suave, en blanco) y lo de dentro en blanco translúcido.
        let tipo: TipoPunto = e.suave ? .otro : TipoPunto.de(e.tipo)
        let pastel = tipo.relleno != nil
        return Button { c.modal = .ficha(e, dia: d) } label: {
            HStack(spacing: Medida.s) {
                if let hora = e.hora {
                    BloqueHoraCalendario(hora: hora, fin: e.fin, tinte: Self.punto(e.tipo), fondo: pastel ? Lienzo.sobreRelleno : nil)
                } else {
                    IconoCuadrado(id: Self.icono(e.tipo), tono: pastel ? .blanco : (e.tipo == "birthday" ? .suave : .claro))
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(e.titulo).font(Letra.tituloTarjeta).foregroundStyle(e.suave ? Lienzo.tintaSecundaria : Lienzo.tinta)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    if !detalle.isEmpty {
                        Text(detalle).font(Letra.pie).foregroundStyle(tipo.tintaRelleno).lineLimit(1)
                    }
                }
                Spacer(minLength: Medida.xs)
                if e.entradas > 0 { Chip(texto: e.entradas == 1 ? "1 entrada" : "\(e.entradas) entradas", tono: pastel ? .blanco : .naranja) }
                if e.hora != nil { IconoCuadrado(id: Self.icono(e.tipo), tono: pastel ? .blanco : .claro, tamano: Medida.iconoPequeno) }
            }
            .frame(minHeight: Medida.toque)
            .tarjetaTipo(tipo, relleno: Medida.s, radio: Medida.radioFila + 4)
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioFila + 4, style: .continuous))
        }
        .buttonStyle(.pulsable(0.97))
        .accessibilityElement(children: .combine)
        .accessibilityLabel([e.hora ?? "todo el día", e.titulo, detalle].filter { !$0.isEmpty }.joined(separator: ", "))
        .contextMenu {
            if e.editable { Button("borrar.", role: .destructive) { borrando = e } }
        }
    }

    @ViewBuilder private func fila(_ cosa: CosaDia, dia d: LocalDay) -> some View {
        switch cosa {
        case .evento(let e): tarjeta(e, dia: d)
        case .tarea(let t): tarjetaTarea(t, dia: d)
        }
    }

    // Una tarea del planificador: se ve, no se marca. Borde discontinuo y sin sombra (no es una tarjeta de evento), su
    // hora sobre el tinte de las tareas y «tarea» como detalle. Tocarla abre su editor, como en Inicio.
    private func tarjetaTarea(_ t: TareaPlan, dia d: LocalDay) -> some View {
        let forma = RoundedRectangle(cornerRadius: Medida.radioFila + 4, style: .continuous)
        return Button {
            c.modal = .tarea(EditorTarea(id: t.id, nueva: false, dia: d, titulo: t.titulo, hora: t.hora, notas: t.notas,
                                         deTrabajo: t.deTrabajo, prioridad: t.prioridad))
        } label: {
            HStack(spacing: Medida.s) {
                if let hora = t.hora {
                    BloqueHoraCalendario(hora: hora, tinte: TipoPunto.tarea.color)
                } else {
                    IconoCuadrado(id: "plan", tono: .claro)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.titulo).font(Letra.tituloTarjeta)
                        .foregroundStyle(t.hecha ? Lienzo.tintaSecundaria : Lienzo.tinta)
                        .strikethrough(t.hecha, color: Lienzo.tintaTerciaria)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    Text(t.hecha ? "tarea, hecha" : "tarea").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                }
                Spacer(minLength: Medida.xs)
                if t.hora != nil { IconoCuadrado(id: "plan", tono: .claro, tamano: Medida.iconoPequeno) }
            }
            .frame(minHeight: Medida.toque)
            .padding(Medida.s)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Lienzo.fondo, in: forma)
            .overlay(forma.strokeBorder(Lienzo.filoFuerte, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            .contentShape(forma)
        }
        .buttonStyle(.pulsable(0.97))
        .accessibilityElement(children: .combine)
        .accessibilityLabel([t.hora ?? "", "tarea", t.titulo, t.hecha ? "hecha" : ""].filter { !$0.isEmpty }.joined(separator: ", "))
        .accessibilityAction(named: "borrar") { borrandoTarea = t }
        .contextMenu {
            Button("borrar.", role: .destructive) { borrandoTarea = t }
        }
    }

    fileprivate enum CosaDia: Identifiable {
        case evento(EventoDia), tarea(TareaPlan)
        var id: String {
            switch self {
            case .evento(let e): return "e" + e.id
            case .tarea(let t): return "t" + t.id
            }
        }
        var hora: String {
            switch self {
            case .evento(let e): return e.hora ?? ""
            case .tarea(let t): return t.hora ?? "~"
            }
        }
    }

    // Eventos con hora y tareas, por hora; las tareas sin hora, al final.
    private func ordenadas(_ eventos: [EventoDia], _ tareas: [TareaPlan]) -> [CosaDia] {
        let todas = eventos.map { CosaDia.evento($0) } + tareas.map { CosaDia.tarea($0) }
        return todas.enumerated()
            .sorted { $0.element.hora == $1.element.hora ? $0.offset < $1.offset : $0.element.hora < $1.element.hora }
            .map { $0.element }
    }

    // Como Inicio (renderMobileDiaPanel): lo apuntado como evento y como tarea a la misma hora sale una sola vez.
    private func tareasSinRepetir(_ eventos: [EventoDia]) -> [TareaPlan] {
        let clave = { (t: String, h: String?) -> String in "\(t.trimmingCharacters(in: .whitespaces).lowercased())|\(h ?? "")" }
        let ya = Set(eventos.map { clave($0.titulo, $0.hora) })
        return tareasDia.filter { !ya.contains(clave($0.titulo, $0.hora)) }
    }

    private func cargarTareas(_ d: LocalDay) async {
        let doc = await c.documentoVisible()
        let desplazamiento = CalendarioBitacora.madrid.diaLogico(Date()).dias(hasta: d)
        guard let nuevas = await ultimaGana({ doc.map { LecturaPlanificador.vista($0, desplazamiento: desplazamiento).tareas } }) else { return }
        guard d == modelo.elegido else { return }
        tareasDia = nuevas ?? []
    }

    // Tipos de EventoDia (LecturaCalendario y los partidos de ServiciosRemotos) → icono del catálogo y puntito.
    static func icono(_ tipo: String) -> String {
        switch tipo {
        case "birthday": "social"
        case "travel": "viajes"
        case "estudio": "estudios"
        case "work", "laboral": "empleo"
        case "pago": "suscripcion"
        default: "eventos"
        }
    }

    static func punto(_ tipo: String) -> Color { TipoPunto.de(tipo).color }

    // MARK: - Textos

    // Formateador hecho una vez: crearlo en cada pintado costaba más que pintar la rejilla.
    private static let utc: Calendar = { var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "UTC")!; return cal }()
    private static let formatoDia: DateFormatter = {
        let d = DateFormatter()
        d.locale = Locale(identifier: "es_ES")
        d.timeZone = TimeZone(identifier: "UTC")
        d.dateFormat = "EEEE d 'de' MMMM"
        return d
    }()

    private var nombreMes: String { "\(MesFlotanteCalendario.meses[modelo.mes.month - 1]) de \(modelo.mes.year)." }

    private func nombreDia(_ d: LocalDay) -> String {
        let t = Self.formatoDia.string(from: Self.utc.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))!)
        if d == hoy { return "hoy, " + t }
        if d == hoy.sumando(dias: 1) { return "mañana, " + t }
        return t
    }
}

// El bloque de hora de la agenda: la hora en tinta y, si la hay, la de fin debajo en pequeño, sobre gris suave.
// Candidato a DesignSystem/V2 (Plan e Inicio pintan lo mismo).
struct BloqueHoraCalendario: View {
    let hora: String
    var fin: String?
    // 3.0.1: un tinte muy suave del color de su tipo, para distinguir de un vistazo eventos, cumples, estudios, tareas…
    var tinte: Color = Lienzo.tintaTerciaria
    // 3.2: dentro de una tarjeta pastel, un fondo liso (blanco translúcido) en vez del tinte, y la hora de fin legible.
    var fondo: Color?

    var body: some View {
        VStack(spacing: 1) {
            Text(hora).font(Letra.hora).foregroundStyle(Lienzo.tinta)
            if let fin { Text(fin).font(Letra.etiqueta).foregroundStyle(fondo == nil ? Lienzo.tintaTerciaria : Lienzo.tintaSecundaria).monospacedDigit() }
        }
        .frame(width: 52, height: Medida.icono + 6)
        .background(fondo ?? tinte.opacity(0.13), in: RoundedRectangle(cornerRadius: Medida.radioIcono, style: .continuous))
        .background(fondo == nil ? Lienzo.tarjeta : Color.clear, in: RoundedRectangle(cornerRadius: Medida.radioIcono, style: .continuous))
        .accessibilityHidden(true)
    }
}


// 3.0.1: el hilo conductor de la agenda: una raya fina que baja por el centro, por detrás de las tarjetas, y solo se ve en
// los huecos entre una y otra.
struct HiloAgenda<Contenido: View>: View {
    @ViewBuilder var contenido: () -> Contenido

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.entreTarjetas) { contenido() }
            .background {
                Rectangle().fill(Lienzo.filoFuerte).frame(width: 1.5)
                    .padding(.vertical, Medida.l)
                    .accessibilityHidden(true)
            }
    }
}
