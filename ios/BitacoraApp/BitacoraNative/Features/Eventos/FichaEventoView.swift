import SwiftUI
import CoreImage.CIFilterBuiltins

// La ficha de un evento (openEntryDetail y abrirEntradas de la web): qué es, cuándo, dónde y sus notas; las entradas
// con su QR, a pantalla entera para que lo lean. Los eventos propios se editan desde aquí; lo que viene de otro
// apartado (trabajo, pagos, Estudios, partidos) solo se consulta.
struct FichaEventoView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let evento: EventoDia
    let dia: LocalDay
    @State private var entradas: [EntradaQR] = []
    @State private var indice = 0
    @State private var pantallaCompleta = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(evento.titulo).font(Tipo.poppins(26, .bold, estilo: .title)).kerning(-0.5).foregroundStyle(Paleta.texto)
                        .padding(.top, Espacio.s)
                    FilaLibro(etiqueta: "día.", valor: Self.fecha(dia))
                    if let h = evento.hora { FilaLibro(etiqueta: "hora.", valor: h) }
                    if !evento.lugar.isEmpty { FilaLibro(etiqueta: "dónde.", valor: evento.lugar) }
                    if !evento.meta.isEmpty && evento.meta != evento.lugar { FilaLibro(etiqueta: "más.", valor: evento.meta) }
                    if !evento.notas.isEmpty {
                        Text(evento.notas).font(Tipo.cuerpo).foregroundStyle(Paleta.texto).textSelection(.enabled).padding(.vertical, Espacio.m)
                    }
                    if !entradas.isEmpty { entrada }
                    if evento.tipo == "event" {
                        AnadirEntradaQR(eventoId: evento.id) { Task { await cargarEntradas(forzar: true) } }
                            .padding(.top, Espacio.m)
                    }
                    if evento.editable {
                        Button("editar.") {
                            c.modal = .evento(EditorEvento(id: evento.id, nuevo: false, fecha: dia, hora: evento.hora, titulo: evento.titulo,
                                                           lugar: evento.lugar, notas: evento.notas))
                        }
                        .buttonStyle(BotonPrincipal()).padding(.top, Espacio.l)
                    } else {
                        Text(origen).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.top, Espacio.m)
                    }
                }
                .padding(.horizontal, 20).padding(.bottom, Espacio.xl)
            }
            .background(Paleta.fondo)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } } }
        }
        .presentationDetents(entradas.isEmpty ? [.medium, .large] : [.large])
        .task { await cargarEntradas() }
        .fullScreenCover(isPresented: $pantallaCompleta) {
            EntradaPantallaCompleta(titulo: evento.titulo, detalle: [evento.lugar, evento.hora ?? ""].filter { !$0.isEmpty }.joined(separator: ", "),
                                    entradas: entradas, indice: min(indice, max(entradas.count - 1, 0)))
        }
    }

    private var origen: String {
        switch evento.tipo {
        case "work", "laboral": return "viene de empleo. se cambia en la agenda laboral de la web."
        case "pago": return "pago recurrente de finanzas."
        case "estudio": return "viene de estudios."
        case "birthday": return "cumpleaños."
        case "partido": return "lo añade bitácora porque sigues a este equipo."
        default: return evento.id.hasPrefix("evt_") ? "lo mantiene estudios: se cambia allí." : ""
        }
    }

    // .entrada-ticket: el QR grande sobre blanco, «n de m» si hay varias. Tocarlo lo abre a pantalla entera.
    private var entrada: some View {
        let e = entradas[min(indice, entradas.count - 1)]
        return VStack(spacing: Espacio.s) {
            Button { pantallaCompleta = true } label: { CodigoQR(datos: e.datos) }
                .buttonStyle(.plain)
                .accessibilityHint("abre la entrada a pantalla completa con el brillo al máximo")
                .contextMenu {
                    Button("abrir a pantalla completa.") { pantallaCompleta = true }
                    Button("quitar esta entrada.", role: .destructive) { quitar(e) }
                }
            if !e.etiqueta.isEmpty { Text(e.etiqueta).font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto) }
            if entradas.count > 1 {
                HStack {
                    Button { indice = (indice + entradas.count - 1) % entradas.count } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                        .accessibilityLabel("entrada anterior")
                    Text("\(indice + 1) de \(entradas.count)").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    Button { indice = (indice + 1) % entradas.count } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }
                        .accessibilityLabel("entrada siguiente")
                }
                .foregroundStyle(Paleta.texto)
            }
            Button("ver a pantalla completa.") { pantallaCompleta = true }.buttonStyle(BotonPrincipal())
            Text("con la pantalla completa el brillo sube solo. mantén pulsado el qr para quitarlo.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Espacio.l)
    }

    private func quitar(_ e: EntradaQR) {
        Task {
            try? await c.encolar(OperacionesExtra.op(OperacionesExtra.quitarEntradaQR, ["eventoId": .string(evento.id), "id": .string(e.id)]))
            await cargarEntradas(forzar: true)
        }
    }

    private func cargarEntradas(forzar: Bool = false) async {
        guard forzar || evento.entradas > 0, let doc = await c.documentoVisible() else { return }
        let lista = ((try? doc.valor(de: "entries")) ?? nil)?.lista?.first { $0["id"]?.comoId == evento.id }?["entradas"]?.lista ?? []
        entradas = lista.compactMap(EntradaQR.desde)
        indice = min(indice, max(entradas.count - 1, 0))
    }

    // Formateadores hechos una vez (0.20): el carrusel de Inicio pedía 21 fechas en cada fotograma del arrastre y cada
    // una creaba su DateFormatter.
    private static let utc: Calendar = { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "UTC")!; return c }()
    private static func formato(_ f: String) -> DateFormatter {
        let d = DateFormatter()
        d.locale = Locale(identifier: "es_ES")
        d.timeZone = TimeZone(identifier: "UTC")
        d.dateFormat = f
        return d
    }
    private static let formatoLargo = formato("EEEE d 'de' MMMM")
    static let formatoCorto = formato("EEE")
    static func mediodia(_ d: LocalDay) -> Date { utc.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))! }

    static func fecha(_ d: LocalDay) -> String { formatoLargo.string(from: mediodia(d)) }
}

// openTiempo: la previsión de los próximos días y la ciudad (la misma que usa la web, `ciudadTiempo`).
struct TiempoView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    @State private var ciudad = Ciudad.defecto
    @State private var tiempo: Tiempo?
    @State private var busqueda = ""
    @State private var resultados: [Ciudad] = []
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let t = tiempo {
                        HStack(spacing: Espacio.m) {
                            Image(systemName: Tiempo.simbolo[t.tipo] ?? "cloud.fill").font(.system(size: 44)).foregroundStyle(Paleta.texto)
                            VStack(alignment: .leading, spacing: 2) {
                                (Text("\(Int(t.temp.rounded()))°").font(Tipo.poppins(40, .bold, estilo: .largeTitle))
                                    + Text(t.sensacion.map { " (sensación de \(Int($0.rounded()))°)" } ?? "").font(Tipo.pie).foregroundColor(Paleta.textoSecundario))
                                    .foregroundStyle(Paleta.texto)
                                Text((Tiempo.texto[t.tipo] ?? "") + "." + (t.dias.first.map { " máx \(Int($0.max.rounded()))°, mín \(Int($0.min.rounded()))°" } ?? ""))
                                    .font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario)
                            }
                        }
                        .padding(.top, Espacio.s)
                        ForEach(t.dias.dropFirst(), id: \.fecha) { d in
                            HStack {
                                Text(Self.diaCorto(d.fecha) + ".").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto).frame(width: 60, alignment: .leading)
                                Image(systemName: Tiempo.simbolo[Tiempo.tipo(d.code, esDia: true)] ?? "cloud.fill").foregroundStyle(Paleta.texto)
                                Spacer()
                                Text("\(Int(d.max.rounded()))°").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto)
                                Text("\(Int(d.min.rounded()))°").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).frame(width: 40, alignment: .trailing)
                            }
                            .frame(minHeight: 44)
                            .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                        }
                    } else {
                        Text("cargando la previsión…").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.top, Espacio.s)
                    }
                    CabeceraSeccion(titulo: "ciudad.", detalle: ciudad.nombre)
                    TextField("busca tu ciudad…", text: $busqueda).font(Tipo.cuerpo).padding(.vertical, 12)
                        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                        .submitLabel(.search)
                    ForEach(resultados, id: \.clave) { r in
                        Button { elegir(r) } label: { FilaLibro(etiqueta: r.nombre, flecha: true) }.buttonStyle(.plain)
                    }
                    if let error { Text(error).font(Tipo.pie).foregroundStyle(Paleta.error).padding(.top, Espacio.s) }
                }
                .padding(.horizontal, 20).padding(.bottom, Espacio.xl)
            }
            .background(Paleta.fondo)
            .navigationTitle("tiempo.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } } }
        }
        .presentationDetents([.medium, .large])
        .task {
            if let doc = await c.documentoVisible() { ciudad = VistaInicio.desde(doc).ciudad }
            tiempo = c.entorno.servicios.tiempo.guardado(ciudad)
            tiempo = await c.entorno.servicios.tiempo.actual(ciudad) ?? tiempo
        }
        .task(id: busqueda) {
            let q = busqueda.trimmingCharacters(in: .whitespaces)
            guard q.count >= 2 else { resultados = []; return }
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            resultados = await c.entorno.servicios.tiempo.buscar(q)
        }
    }

    private func elegir(_ r: Ciudad) {
        Task {
            do {
                try await c.encolar(.ponerCiudadTiempo(nombre: r.nombre, lat: String(r.lat), lon: String(r.lon)))
                ciudad = r
                busqueda = ""
                resultados = []
                tiempo = await c.entorno.servicios.tiempo.actual(r, forzar: true)
            } catch {
                self.error = "no se pudo guardar en este iPhone."
            }
        }
    }

    static func diaCorto(_ iso: String) -> String {
        guard let d = LocalDay(iso: iso) else { return iso }
        return FichaEventoView.formatoCorto.string(from: FichaEventoView.mediodia(d)).replacingOccurrences(of: ".", with: "")
    }
}
