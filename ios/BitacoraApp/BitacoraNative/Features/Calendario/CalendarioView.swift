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
        VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
            HStack(alignment: .firstTextBaseline) {
                Text(nombreDia(d) + ".").font(Letra.seccion).foregroundStyle(Lienzo.tinta)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                if !lista.isEmpty {
                    Text(lista.count == 1 ? "1 cosa" : "\(lista.count) cosas").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        .monospacedDigit()
                }
            }
            .padding(.horizontal, Medida.xxs)
            if vista(d.yearMonth) == nil {
                Color.clear.frame(height: 120)
            } else if lista.isEmpty {
                TarjetaInvitacion(frase: d == hoy ? "hoy no tienes nada apuntado." : "este día está libre.",
                                  destacado: "¿apuntas algo?", boton: "apuntar.") { c.abrirApuntar(dia: d) }
            } else {
                if !todoElDia.isEmpty {
                    EtiquetaSeccion(texto: "todo el día").padding(.top, Medida.xxs)
                    ForEach(Array(todoElDia.enumerated()), id: \.element.id) { i, e in tarjeta(e, dia: d).entradaEscalonada(i) }
                }
                if !conHora.isEmpty {
                    if !todoElDia.isEmpty { EtiquetaSeccion(texto: "con hora").padding(.top, Medida.xs) }
                    ForEach(Array(conHora.enumerated()), id: \.element.id) { i, e in
                        tarjeta(e, dia: d).entradaEscalonada(todoElDia.count + i)
                    }
                }
                HStack(spacing: Medida.xs) {
                    Button("apuntar.") { c.abrirApuntar(dia: d) }.buttonStyle(.capsula(.blanco))
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
        return Button { c.modal = .ficha(e, dia: d) } label: {
            HStack(spacing: Medida.s) {
                if let hora = e.hora {
                    BloqueHoraCalendario(hora: hora, fin: e.fin)
                } else {
                    IconoCuadrado(id: Self.icono(e.tipo), tono: e.tipo == "birthday" ? .suave : .claro)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(e.titulo).font(Letra.tituloTarjeta).foregroundStyle(e.suave ? Lienzo.tintaSecundaria : Lienzo.tinta)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    if !detalle.isEmpty {
                        Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                    }
                }
                Spacer(minLength: Medida.xs)
                if e.entradas > 0 { Chip(texto: e.entradas == 1 ? "1 entrada" : "\(e.entradas) entradas", tono: .naranja) }
                if e.hora != nil { IconoCuadrado(id: Self.icono(e.tipo), tono: .claro, tamano: Medida.iconoPequeno) }
            }
            .frame(minHeight: Medida.toque)
            .tarjeta(relleno: Medida.s, radio: Medida.radioFila + 4)
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioFila + 4, style: .continuous))
        }
        .buttonStyle(.pulsable(0.97))
        .accessibilityElement(children: .combine)
        .accessibilityLabel([e.hora ?? "todo el día", e.titulo, detalle].filter { !$0.isEmpty }.joined(separator: ", "))
        .contextMenu {
            if e.editable { Button("borrar.", role: .destructive) { borrando = e } }
        }
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

    var body: some View {
        VStack(spacing: 1) {
            Text(hora).font(Letra.hora).foregroundStyle(Lienzo.tinta)
            if let fin { Text(fin).font(Letra.etiqueta).foregroundStyle(Lienzo.tintaTerciaria).monospacedDigit() }
        }
        .frame(width: 52, height: Medida.icono + 6)
        .background(Lienzo.sutil, in: RoundedRectangle(cornerRadius: Medida.radioIcono, style: .continuous))
        .accessibilityHidden(true)
    }
}

