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
    @State private var tramo = Tramo.proximos
    @Environment(\.scenePhase) private var fase

    enum Tramo: Hashable { case proximos, pasados }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "eventos.", subtitulo: subtitulo) {
                    BotonRedondo(sistema: "plus", tono: .oscuro, etiqueta: "nuevo evento") {
                        c.modal = .evento(EditorEvento(id: OperacionBitacora.nuevoIdEntrada(), nuevo: true, fecha: hoy))
                    }
                }
                .padding(.bottom, Medida.xxs)
                if let v = vista, !v.pasados.isEmpty {
                    SegmentoCapsula(opciones: [.init(valor: Tramo.proximos, titulo: "próximos"), .init(valor: Tramo.pasados, titulo: "pasados")],
                                    elegido: $tramo, sobreBlanco: false)
                }
                if let v = vista {
                    Group {
                        if tramo == .pasados && !v.pasados.isEmpty { pasados(v) } else { proximos(v) }
                    }
                    .id(tramo)
                    .transition(.opacity)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .refreshable { await c.sincronizar() }
        .onChange(of: fase) { _, f in if f == .active { hoy = CalendarioBitacora.madrid.dia(de: Date()) } }
        .task(id: "\(c.revision)-\(hoy.iso)") {
            let doc = await c.documentoVisible()
            guard let nuevo = await ultimaGana({ doc.map { VistaEventos.desde($0) } }) else { return }
            vista = nuevo
            if nuevo?.pasados.isEmpty ?? true { tramo = .proximos }
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

    private var subtitulo: String {
        guard let v = vista else { return "" }
        let n = v.proximos.count
        return n == 0 ? "nada a la vista." : n == 1 ? "1 próximo." : "\(n) próximos."
    }

    // El más cercano, destacado en negro con su cuenta atrás; el resto, por meses.
    @ViewBuilder private func proximos(_ v: VistaEventos) -> some View {
        if let primero = v.proximos.first {
            destacado(primero).entradaEscalonada(0)
            let resto = Array(v.proximos.dropFirst())
            ForEach(Array(resto.enumerated()), id: \.element.id) { n, f in
                VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                    if n == 0 || Self.mes(resto[n - 1].dia, hoy) != Self.mes(f.dia, hoy) {
                        EtiquetaSeccion(texto: Self.mesSinPunto(f.dia, hoy)).padding(.top, Medida.s)
                    }
                    tarjeta(f, tono: f.dia == hoy ? .naranja : .claro)
                }
                .entradaEscalonada(n + 1)
            }
        } else {
            TarjetaInvitacion(frase: "ningún evento por venir.", destacado: "apunta tu próximo plan.", boton: "apuntar.") { c.abrirApuntar() }
                .entradaEscalonada(0)
        }
        if hayEquipos {
            EtiquetaSeccion(texto: "tus equipos").padding(.top, Medida.s)
            if partidos.isEmpty {
                EstadoVacio(texto: partidosCargados ? "sin partidos en los próximos 30 días." : "cargando sus partidos…")
                    .tarjeta(relleno: Medida.xs)
            }
            ForEach(Array(partidos.prefix(6).enumerated()), id: \.element.id) { n, f in
                tarjeta(f, tono: f.dia == hoy ? .naranja : .claro).entradaEscalonada(n + v.proximos.count)
            }
        }
    }

    @ViewBuilder private func pasados(_ v: VistaEventos) -> some View {
        ForEach(Array(v.pasados.enumerated()), id: \.element.id) { n, f in
            tarjeta(f, tono: .apagado).entradaEscalonada(n)
        }
    }

    // eventCountdownLabel, en grande: el próximo con su bloque de fecha en naranja.
    private func destacado(_ f: VistaEventos.Fila) -> some View {
        Button { abrir(f) } label: {
            TarjetaOscura {
                VStack(alignment: .leading, spacing: Medida.s) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("EL PRÓXIMO").font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.sobreOscuroSuave)
                        Spacer()
                        TimelineView(.periodic(from: .now, by: 60)) { t in
                            Text(CuentaAtras.texto(f.dia, hora: f.evento.hora, hoy: hoy, ahora: t.date))
                                .font(Letra.cuentaAtras).foregroundStyle(Lienzo.naranja)
                                .contentTransition(.numericText())
                        }
                    }
                    HStack(spacing: Medida.s) {
                        BloqueFecha(dia: f.dia, tono: .naranja)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(f.evento.titulo).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.sobreOscuro)
                                .lineLimit(2).multilineTextAlignment(.leading)
                            Text(([Self.diaSemana(f.dia) + "."] + [meta(f)].compactMap { $0 }).joined(separator: " "))
                                .font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave).lineLimit(2)
                        }
                        Spacer(minLength: 0)
                        if f.evento.entradas > 0 { Chip(texto: "qr.", tono: .blanco, icono: "qrcode") }
                    }
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        }
        .buttonStyle(.pulsable(0.97))
        .accessibilityElement(children: .combine)
        .accessibilityHint("abre la ficha del evento")
    }

    // .m-evento: bloque de fecha, título y «día, hora, lugar»; QR si hay entrada.
    private func tarjeta(_ f: VistaEventos.Fila, tono: BloqueFecha.Tono) -> some View {
        Button { abrir(f) } label: {
            HStack(spacing: Medida.s) {
                BloqueFecha(dia: f.dia, tono: tono)
                VStack(alignment: .leading, spacing: 2) {
                    Text(f.evento.titulo).font(Letra.tituloTarjeta)
                        .foregroundStyle(tono == .apagado ? Lienzo.tintaSecundaria : Lienzo.tinta)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    HStack(spacing: Medida.xs) {
                        Text(Self.diaSemana(f.dia) + ".").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        if let h = f.evento.hora { Text(h).font(Letra.hora).foregroundStyle(Lienzo.tinta) }
                        if let lugar = lugar(f) {
                            Text(lugar).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                        }
                    }
                }
                Spacer(minLength: Medida.xxs)
                if f.evento.entradas > 0 {
                    Chip(texto: "qr.", tono: tono == .apagado ? .sutil : .oscuro, icono: "qrcode")
                } else if f.evento.tipo == "partido" {
                    Chip(texto: "auto.")
                }
            }
            .tarjeta(relleno: Medida.s)
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        }
        .buttonStyle(.pulsable(0.97))
        .accessibilityElement(children: .combine)
        .accessibilityHint("abre la ficha del evento")
    }

    private func abrir(_ f: VistaEventos.Fila) {
        Haptica.ligera()
        c.modal = .ficha(f.evento, dia: f.dia)
    }

    private func lugar(_ f: VistaEventos.Fila) -> String? {
        let l = f.evento.lugar.isEmpty ? f.evento.notas : f.evento.lugar
        return l.isEmpty ? nil : l
    }

    private func meta(_ f: VistaEventos.Fila) -> String? {
        let m = [f.evento.hora ?? "", lugar(f) ?? ""].filter { !$0.isEmpty }.joined(separator: ", ")
        return m.isEmpty ? nil : m
    }

    static func mesSinPunto(_ d: LocalDay, _ hoy: LocalDay) -> String { String(mes(d, hoy).dropLast()) }

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
        Text(texto).font(Letra.pieFuerte).foregroundStyle(Paleta.textoSecundario)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 8)
            .overlay(alignment: .bottom) { Rectangle().fill(Paleta.texto).frame(height: 2) }
            .padding(.top, 30)
            .accessibilityAddTraits(.isHeader)
    }
}
