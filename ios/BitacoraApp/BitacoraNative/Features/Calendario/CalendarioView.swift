import SwiftUI

@MainActor
@Observable
final class CalendarioModel {
    var mes: YearMonth
    var elegido: LocalDay
    private(set) var vista: VistaMes?

    init() {
        let hoy = CalendarioBitacora.madrid.dia(de: Date())
        mes = hoy.yearMonth
        elegido = hoy
    }

    func cargar(_ c: AppCoordinator) async {
        let doc = await c.documentoVisible()
        let m = mes
        let v: VistaMes? = await Task.detached(priority: .userInitiated) {
            doc.map { LecturaCalendario.mes($0, m) }
        }.value
        if m == mes { vista = v }
        // Los partidos de tus equipos, cuando llegan de la red.
        guard let doc, let v, let primero = LocalDay(year: m.year, month: m.month, day: 1) else { return }
        let partidos = await c.entorno.servicios.deportes.eventos(doc, desde: primero, dias: 31)
        guard !partidos.isEmpty, m == mes else { return }
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

// El mes sin caja: semana desde el lunes, el día elegido en un círculo del acento y puntos discretos. Debajo, la agenda
// del día con las mismas filas que Plan e Inicio. Nada de aspecto de selector de fechas ampliado.
struct CalendarioView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var modelo = CalendarioModel()
    @State private var borrando: EventoDia?
    @State private var aviso: String?

    @State private var hoy = CalendarioBitacora.madrid.dia(de: Date())
    @Environment(\.scenePhase) private var fase
    private let columnas = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                CabeceraApartado(titulo: "calendario", contexto: nombreMes) {
                    HStack(spacing: 0) {
                        boton("chevron.left", "mes anterior") { modelo.moverMes(-1) }
                        boton("chevron.right", "mes siguiente") { modelo.moverMes(1) }
                    }
                }
                if modelo.mes != hoy.yearMonth || modelo.elegido != hoy {
                    AccionTexto(texto: "volver a hoy.") { modelo.mes = hoy.yearMonth; modelo.elegido = hoy }
                }
                LazyVGrid(columns: columnas, spacing: 2) {
                    ForEach(Array(["l", "m", "x", "j", "v", "s", "d"].enumerated()), id: \.offset) { _, l in
                        Text(l).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).frame(height: 28)
                    }
                    ForEach(0..<huecoInicial, id: \.self) { _ in Color.clear.frame(height: 48) }
                    ForEach(diasDelMes, id: \.self) { d in celda(d) }
                }
                .padding(.top, Espacio.m)
                if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.error).padding(.top, Espacio.s) }
                let eventos = modelo.vista?.porDia[modelo.elegido] ?? []
                CabeceraSeccion(titulo: nombreDia(modelo.elegido) + ".", detalle: eventos.isEmpty ? nil : "\(eventos.count)", raya: true)
                if eventos.isEmpty {
                    Text("nada este día.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s)
                }
                ForEach(eventos) { e in
                    FilaEvento(hora: e.hora, titulo: e.titulo, detalle: e.meta.isEmpty ? e.notas : e.meta, suave: e.suave, entradas: e.entradas) {
                        c.modal = .ficha(e, dia: modelo.elegido)
                    }
                        .contextMenu {
                            if e.editable { Button("borrar.", role: .destructive) { borrando = e } }
                        }
                }
                AccionTexto(texto: "+ evento.") {
                    c.modal = .evento(EditorEvento(id: OperacionBitacora.nuevoIdEntrada(), nuevo: true, fecha: modelo.elegido))
                }
                .padding(.top, Espacio.xs)
            }
            .padding(.horizontal, Espacio.l - 4)
            .padding(.bottom, Espacio.xl)
        }
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar() }
        .task(id: "\(c.informe.revision)-\(modelo.mes.iso)-\(hoy.iso)") { await modelo.cargar(c) }
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

    private func boton(_ icono: String, _ etiqueta: String, _ accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            Image(systemName: icono).font(.system(size: 17, weight: .semibold)).foregroundStyle(Paleta.texto).frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(etiqueta)
    }

    private func celda(_ d: LocalDay) -> some View {
        let n = modelo.vista?.porDia[d]?.count ?? 0
        let elegido = d == modelo.elegido
        return Button { modelo.elegido = d } label: {
            VStack(spacing: 3) {
                Text("\(d.day)")
                    .font(Tipo.poppins(16, d == hoy || elegido ? .semibold : .regular, estilo: .body))
                    .foregroundStyle(elegido ? Paleta.sobreAcento : (d == hoy ? Paleta.acento : Paleta.texto))
                    .frame(width: 34, height: 34)
                    .background(elegido ? Paleta.acento : Color.clear, in: Circle())
                Circle().fill(n > 0 && !elegido ? Paleta.acento : .clear).frame(width: 4, height: 4)
            }
            .frame(maxWidth: .infinity, minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(nombreDia(d) + (n > 0 ? ", \(n) cosas" : ""))
        .accessibilityAddTraits(elegido ? [.isSelected, .isButton] : .isButton)
    }

    private func abrir(_ e: EventoDia) {
        guard e.editable else { return }
        c.modal = .evento(EditorEvento(id: e.id, nuevo: false, fecha: modelo.elegido, hora: e.hora, titulo: e.titulo, lugar: e.lugar, notas: e.notas))
    }

    private var diasDelMes: [LocalDay] {
        var r: [LocalDay] = []
        var d = LocalDay(year: modelo.mes.year, month: modelo.mes.month, day: 1)!
        while d.yearMonth == modelo.mes { r.append(d); d = d.sumando(dias: 1) }
        return r
    }

    // Semanas que empiezan en lunes.
    private var huecoInicial: Int {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let f = cal.date(from: DateComponents(year: modelo.mes.year, month: modelo.mes.month, day: 1, hour: 12))!
        return (cal.component(.weekday, from: f) + 5) % 7
    }

    // Formateadores hechos una vez: crearlos en cada pintado costaba más que pintar la rejilla.
    private static let utc: Calendar = { var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "UTC")!; return cal }()
    private static func formato(_ f: String) -> DateFormatter {
        let d = DateFormatter()
        d.locale = Locale(identifier: "es_ES")
        d.timeZone = TimeZone(identifier: "UTC")
        d.dateFormat = f
        return d
    }
    private static let formatoMes = formato("LLLL yyyy")
    private static let formatoDia = formato("EEEE d 'de' MMMM")

    private var nombreMes: String {
        Self.formatoMes.string(from: Self.utc.date(from: DateComponents(year: modelo.mes.year, month: modelo.mes.month, day: 1, hour: 12))!) + "."
    }

    private func nombreDia(_ d: LocalDay) -> String {
        Self.formatoDia.string(from: Self.utc.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))!)
    }
}
