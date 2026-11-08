import SwiftUI

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
    }
    let hoy: LocalDay
    let semana: [LocalDay]
    let conCosas: Set<LocalDay>
    let agenda: [Cosa]
    let sinDia: [TareaPlan]
    let pendientes: Int
    let hechas: Int

    static func desde(_ doc: DocumentoBitacora, ahora: Date = Date()) -> VistaInicio {
        let plan = LecturaPlanificador.vista(doc, ahora: ahora)
        let hoy = plan.dia
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let semanaDe = cal.component(.weekday, from: cal.date(from: DateComponents(year: hoy.year, month: hoy.month, day: hoy.day, hour: 12))!)
        let lunes = hoy.sumando(dias: -((semanaDe + 5) % 7))
        let semana = (0..<7).map { lunes.sumando(dias: $0) }
        var meses = [hoy.yearMonth]
        if let ultimo = semana.last, ultimo.yearMonth != hoy.yearMonth { meses.append(ultimo.yearMonth) }
        if let primero = semana.first, primero.yearMonth != hoy.yearMonth { meses.append(primero.yearMonth) }
        var porDia: [LocalDay: [EventoDia]] = [:]
        for m in meses { porDia.merge(LecturaCalendario.mes(doc, m).porDia) { a, _ in a } }
        let eventos = (porDia[hoy] ?? []).map { Cosa(id: "e" + $0.id, hora: $0.hora, titulo: $0.titulo, notas: $0.lugar, hecha: false, acento: false, tarea: nil) }
        let tareas = plan.tareas.map { Cosa(id: "t" + $0.id, hora: $0.hora, titulo: $0.titulo, notas: $0.notas, hecha: $0.hecha, acento: $0.arrastrada, tarea: $0) }
        let agenda = (eventos + tareas).sorted { ($0.hora ?? "") < ($1.hora ?? "") }
        let hechas = plan.tareas.filter(\.hecha).count
        return VistaInicio(hoy: hoy, semana: semana, conCosas: Set(semana.filter { !(porDia[$0] ?? []).isEmpty }),
                           agenda: agenda, sinDia: plan.sinDia, pendientes: plan.tareas.count - hechas, hechas: hechas)
    }
}

struct InicioView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaInicio?

    var body: some View {
        ScrollView {
            InicioCuerpo(vista: vista, ahora: Date(), estado: c.informe.estado,
                         marcar: { t in Task { try? await c.encolar(.marcarTarea(id: t.id, hecha: !t.hecha, momentoMs: Int64(Date().timeIntervalSince1970 * 1000))) } },
                         abrir: { t in c.modal = .tarea(EditorTarea(id: t.id, nueva: false, dia: vista?.hoy, titulo: t.titulo, hora: t.hora, notas: t.notas, deTrabajo: t.deTrabajo)) },
                         irA: { c.pestana = $0 })
                .padding(.horizontal, Espacio.l - 4)
                .padding(.bottom, Espacio.xl)
        }
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar() }
        .task(id: c.informe.revision) {
            let doc = await c.documentoVisible()
            vista = await Task.detached(priority: .userInitiated) { doc.map { VistaInicio.desde($0) } }.value
        }
    }
}

// La portada de la PWA aprobada: marca centrada, la semana, «ahora.» como único bloque con relieve, «hoy.» con su
// rayita, la agenda continua y los pendientes sin día resumidos. Sin foto ni tiempo mientras no haya datos reales.
struct InicioCuerpo: View {
    let vista: VistaInicio?
    let ahora: Date
    let estado: EstadoSync
    var marcar: (TareaPlan) -> Void = { _ in }
    var abrir: (TareaPlan) -> Void = { _ in }
    var irA: (Pestana) -> Void = { _ in }

    private var hora: String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let c = cal.dateComponents([.hour, .minute], from: ahora)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Spacer()
                (Text("bitácora").foregroundColor(Paleta.texto) + Text(".").foregroundColor(Paleta.acento))
                    .font(Tipo.poppins(22, .bold, estilo: .title3))
                    .accessibilityAddTraits(.isHeader)
                Spacer()
            }
            .overlay(alignment: .trailing) { if estado != .reposo { IndicadorSync(estado: estado) } }
            .padding(.top, Espacio.s)
            if let v = vista {
                semana(v)
                bloqueAhora(v)
                CabeceraSeccion(titulo: "hoy.", detalle: "\(v.pendientes) pendientes, \(v.hechas) hechas", raya: true)
                if v.agenda.isEmpty {
                    Text("nada para hoy.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s)
                }
                ForEach(v.agenda) { cosa in
                    if let t = cosa.tarea {
                        FilaAgenda(hora: cosa.hora, titulo: cosa.titulo, notas: cosa.notas, hecho: cosa.hecha, acento: cosa.acento) {
                            marcar(t)
                        } abrir: { abrir(t) }
                    } else {
                        FilaEvento(hora: cosa.hora, titulo: cosa.titulo, detalle: cosa.notas)
                    }
                }
                if !v.sinDia.isEmpty {
                    CabeceraSeccion(titulo: "pendientes sin día.", detalle: "\(v.sinDia.count)")
                    if let t = v.sinDia.first {
                        FilaAgenda(hora: nil, titulo: t.titulo, notas: t.notas, hecho: t.hecha, mostrarHora: false) { marcar(t) } abrir: { abrir(t) }
                    }
                    if v.sinDia.count > 1 { AccionTexto(texto: "ver todas.") { irA(.plan) } }
                }
            } else {
                ProgressView().tint(Paleta.textoSecundario).frame(maxWidth: .infinity).padding(.top, Espacio.xl)
            }
        }
    }

    // La semana plana: inicial del día y número; hoy en el acento, punto bajo los días con algo en el calendario.
    private func semana(_ v: VistaInicio) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(v.semana.enumerated()), id: \.offset) { n, d in
                VStack(spacing: 4) {
                    Text(["l", "m", "x", "j", "v", "s", "d"][n]).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    Text("\(d.day)")
                        .font(Tipo.poppins(17, d == v.hoy ? .bold : .medium, estilo: .body))
                        .foregroundStyle(d == v.hoy ? Paleta.acento : Paleta.texto)
                    Circle().fill(v.conCosas.contains(d) ? Paleta.acento : .clear).frame(width: 4, height: 4)
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.top, Espacio.l)
    }

    // .m-ahora-bloque: la hora, y lo siguiente que tiene hora hoy. Sin nada después, solo la hora.
    private func bloqueAhora(_ v: VistaInicio) -> some View {
        let siguiente = v.agenda.first { !$0.hecha && ($0.hora ?? "") >= hora }
        return VStack(alignment: .leading, spacing: 4) {
            Text("ahora.").font(Tipo.pie).foregroundStyle(Paleta.acento)
            Text(hora).font(Tipo.poppins(40, .bold, estilo: .largeTitle)).foregroundStyle(Paleta.texto).monospacedDigit()
            if let s = siguiente, let h = s.hora {
                Text("siguiente, \(h) \(s.titulo)").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).lineLimit(2)
            } else {
                Text("nada más con hora hoy.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Paleta.tinteAcento, in: RoundedRectangle(cornerRadius: Radio.bloque))
        .overlay(RoundedRectangle(cornerRadius: Radio.bloque).strokeBorder(Paleta.filoAcento, lineWidth: 1))
        .padding(.top, Espacio.l)
        .accessibilityElement(children: .combine)
    }
}

// Un evento en la agenda: misma columna de hora que las tareas y un punto en vez del círculo (no se marca).
struct FilaEvento: View {
    let hora: String?
    let titulo: String
    var detalle = ""
    var abrir: (() -> Void)?

    var body: some View {
        Button { abrir?() } label: {
            HStack(spacing: Espacio.s) {
                Text(hora ?? "").font(Tipo.mono).foregroundStyle(Paleta.textoSecundario).frame(width: 46, alignment: .leading)
                Circle().fill(Paleta.acento).frame(width: 8, height: 8).frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(titulo).font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto).multilineTextAlignment(.leading)
                    if !detalle.isEmpty { Text(detalle).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).lineLimit(2) }
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(abrir == nil)
        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }
}
