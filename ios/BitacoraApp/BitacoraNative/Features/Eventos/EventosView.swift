import SwiftUI

// renderMobileEvents (nucleo.js): los eventos por venir agrupados por mes, los partidos de tus equipos y los seis
// últimos pasados. Cada fila abre su ficha (con el QR si hay entrada).
struct VistaEventos: Sendable, Equatable {
    struct Fila: Sendable, Equatable, Identifiable {
        let evento: EventoDia
        let dia: LocalDay
        var id: String { evento.id + dia.iso }
    }
    var proximos: [Fila] = []
    var pasados: [Fila] = []

    static func desde(_ doc: DocumentoBitacora, hoy: LocalDay = CalendarioBitacora.madrid.dia(de: Date())) -> VistaEventos {
        var v = VistaEventos()
        let cats = Dictionary((((try? doc.valor(de: "categories")) ?? nil)?.lista ?? []).compactMap { c in
            c["id"]?.comoId.map { ($0, c["name"]?.texto ?? "") } }, uniquingKeysWith: { a, _ in a })
        for x in ((try? doc.valor(de: "entries")) ?? nil)?.lista ?? [] {
            guard let o = x.objeto, o["type"]?.texto == "event", let id = o["id"]?.comoId, !LecturaCalendario.esMarca(o, id: id),
                  let dia = (o["date"]?.texto).flatMap(LocalDay.init(iso:)) else { continue }
            let f = Fila(evento: LecturaCalendario.evento(o, id: id, tipo: "event", anio: dia.year, categorias: cats), dia: dia)
            if dia >= hoy { v.proximos.append(f) } else { v.pasados.append(f) }
        }
        v.proximos.sort { ($0.dia.iso, $0.evento.hora ?? "") < ($1.dia.iso, $1.evento.hora ?? "") }
        v.pasados = Array(v.pasados.sorted { $0.dia.iso > $1.dia.iso }.prefix(6))
        return v
    }
}

struct EventosView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaEventos?
    @State private var partidos: [VistaEventos.Fila] = []
    @State private var hayEquipos = false
    @State private var partidosCargados = false
    @State private var hoy = CalendarioBitacora.madrid.dia(de: Date())
    @Environment(\.scenePhase) private var fase

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                CabeceraApartado(titulo: "eventos", contexto: contexto) { EmptyView() }
                Button("+ evento.") {
                    c.modal = .evento(EditorEvento(id: OperacionBitacora.nuevoIdEntrada(), nuevo: true, fecha: hoy))
                }
                .buttonStyle(BotonPrincipal()).padding(.top, Espacio.m).padding(.bottom, 14)
                if hayEquipos {
                    Etiqueta(texto: "tus equipos.")
                    if partidos.isEmpty {
                        Text(partidosCargados ? "sin partidos en los próximos 30 días." : "cargando sus partidos…")
                            .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s)
                    }
                    ForEach(partidos.prefix(6)) { fila($0) }
                }
                if let v = vista {
                    if v.proximos.isEmpty { Text("ningún evento por venir.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.m) }
                    ForEach(Array(v.proximos.enumerated()), id: \.element.id) { n, f in
                        if n == 0 || Self.mes(v.proximos[n - 1].dia, hoy) != Self.mes(f.dia, hoy) { Etiqueta(texto: Self.mes(f.dia, hoy)) }
                        fila(f)
                    }
                    if !v.pasados.isEmpty {
                        Etiqueta(texto: "pasados.")
                        ForEach(v.pasados) { fila($0).opacity(0.7) }
                    }
                }
            }
            .padding(.horizontal, 20).padding(.bottom, Espacio.xl)
        }
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .refreshable { await c.sincronizar() }
        .onChange(of: fase) { _, f in if f == .active { hoy = CalendarioBitacora.madrid.dia(de: Date()) } }
        .task(id: "\(c.informe.revision)-\(hoy.iso)") {
            let doc = await c.documentoVisible()
            vista = await Task.detached(priority: .userInitiated) { doc.map { VistaEventos.desde($0) } }.value
            guard let doc else { return }
            hayEquipos = !((((try? doc.valor(de: "servicios")) ?? nil)?["equipos"]?.lista ?? []).isEmpty)
            if hayEquipos {
                let r = await c.entorno.servicios.deportes.eventos(doc, desde: hoy, dias: 30)
                partidos = r.flatMap { d, l in l.map { VistaEventos.Fila(evento: $0, dia: d) } }
                    .sorted { ($0.dia.iso, $0.evento.hora ?? "") < ($1.dia.iso, $1.evento.hora ?? "") }
                partidosCargados = true
            }
        }
    }

    // eventCountdownLabel.
    private var contexto: String {
        guard let p = vista?.proximos.first else { return vista == nil ? "" : "nada a la vista." }
        let n = hoy.dias(hasta: p.dia)
        return "el próximo, " + (n <= 0 ? "hoy." : n == 1 ? "mañana." : "en \(n) días.")
    }

    // .m-evento: el día a 30 en negrita con el día de la semana debajo, título y «hora, lugar»; QR si hay entrada.
    private func fila(_ f: VistaEventos.Fila) -> some View {
        Button { c.modal = .ficha(f.evento, dia: f.dia) } label: {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("\(f.dia.day)").font(Tipo.poppins(30, .bold, estilo: .title)).kerning(-1.5).foregroundStyle(Paleta.texto).monospacedDigit()
                    Text(Self.diaSemana(f.dia) + ".").font(Tipo.poppins(11, .semibold, estilo: .caption2)).foregroundStyle(Paleta.textoSecundario)
                }
                .frame(width: 46, alignment: .leading)
                VStack(alignment: .leading, spacing: 2) {
                    Text(f.evento.titulo).font(Tipo.poppins(16, .semibold, estilo: .body)).foregroundStyle(Paleta.texto).multilineTextAlignment(.leading)
                    let meta = [f.evento.hora ?? "", f.evento.lugar.isEmpty ? f.evento.notas : f.evento.lugar].filter { !$0.isEmpty }.joined(separator: ", ")
                    if !meta.isEmpty { Text(meta).font(Tipo.poppins(13.5, .regular, estilo: .footnote)).foregroundStyle(Paleta.textoSecundario).lineLimit(2) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if f.evento.entradas > 0 {
                    Label("qr.", systemImage: "qrcode").font(Tipo.poppins(13, .semibold, estilo: .footnote)).foregroundStyle(Paleta.texto)
                        .padding(.horizontal, 10).frame(minHeight: 32).background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: Radio.control))
                } else if f.evento.tipo == "partido" {
                    Text("auto.").font(Tipo.pie).foregroundStyle(Paleta.textoApagado)
                }
            }
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }

    static func mes(_ d: LocalDay, _ hoy: LocalDay) -> String {
        let nombres = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        return nombres[d.month - 1] + (d.year != hoy.year ? " \(d.year)" : "") + "."
    }

    static func diaSemana(_ d: LocalDay) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let n = cal.component(.weekday, from: cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))!) - 1
        return ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][n]
    }
}

// .m-bloque-cab con .m-etiqueta: 12 seminegrita gris sobre una raya de 2 de la tinta.
struct Etiqueta: View {
    let texto: String

    var body: some View {
        Text(texto).font(Tipo.poppins(12, .semibold, estilo: .caption)).foregroundStyle(Paleta.textoSecundario)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 8)
            .overlay(alignment: .bottom) { Rectangle().fill(Paleta.texto).frame(height: 2) }
            .padding(.top, 30)
            .accessibilityAddTraits(.isHeader)
    }
}

extension LocalDay {
    func dias(hasta otro: LocalDay) -> Int {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let f = { (d: LocalDay) in cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))! }
        return cal.dateComponents([.day], from: f(self), to: f(otro)).day ?? 0
    }
}
