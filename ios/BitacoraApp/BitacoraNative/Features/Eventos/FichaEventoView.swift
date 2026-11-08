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
    @State private var entradas: [(texto: Data, etiqueta: String)] = []
    @State private var indice = 0

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

    // .entrada-ticket: el QR grande sobre blanco, «n de m» si hay varias.
    private var entrada: some View {
        let e = entradas[min(indice, entradas.count - 1)]
        return VStack(spacing: Espacio.s) {
            if let img = Self.qr(e.texto) {
                Image(uiImage: img).interpolation(.none).resizable().scaledToFit()
                    .padding(Espacio.m).background(Color.white, in: RoundedRectangle(cornerRadius: Radio.control))
                    .accessibilityLabel("código qr de la entrada")
            }
            if !e.etiqueta.isEmpty { Text(e.etiqueta).font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto) }
            if entradas.count > 1 {
                HStack {
                    Button { indice = (indice + entradas.count - 1) % entradas.count } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                    Text("\(indice + 1) de \(entradas.count)").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    Button { indice = (indice + 1) % entradas.count } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }
                }
                .foregroundStyle(Paleta.texto)
            }
            Text("sube el brillo de la pantalla para que lo lean a la primera.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Espacio.l)
    }

    private func cargarEntradas() async {
        guard evento.entradas > 0, let doc = await c.documentoVisible() else { return }
        let lista = ((try? doc.valor(de: "entries")) ?? nil)?.lista?.first { $0["id"]?.comoId == evento.id }?["entradas"]?.lista ?? []
        entradas = lista.compactMap { x -> (texto: Data, etiqueta: String)? in
            // qrEntradaSvg: qrB64 son los bytes tal cual; qr, el texto en UTF-8.
            let datos = x["qrB64"]?.texto.flatMap { Data(base64Encoded: $0) } ?? x["qr"]?.texto.map { Data($0.utf8) }
            return datos.map { (texto: $0, etiqueta: x["etiqueta"]?.texto ?? "") }
        }
    }

    static func qr(_ datos: Data) -> UIImage? {
        let f = CIFilter.qrCodeGenerator()
        f.message = datos
        f.correctionLevel = "M"
        guard let img = f.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)),
              let cg = CIContext().createCGImage(img, from: img.extent) else { return nil }
        return UIImage(cgImage: cg)
    }

    static func fecha(_ d: LocalDay) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "EEEE d 'de' MMMM"
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return f.string(from: cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))!)
    }
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
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "EEE"
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return f.string(from: cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))!).replacingOccurrences(of: ".", with: "")
    }
}
