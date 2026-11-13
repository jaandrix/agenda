import SwiftUI
import UniformTypeIdentifiers

private enum PestanaOcio: String, CaseIterable, Identifiable {
    case book, series, movie, game, lists
    var id: String { rawValue }
    var titulo: String {
        switch self { case .book: return "libros"; case .series: return "series"; case .movie: return "películas"; case .game: return "videojuegos"; case .lists: return "listas" }
    }
}

private enum ModalOcio: Identifiable {
    case entrada(EntradaOcio?, String)
    case lista(ListaOcio?)
    var id: String {
        switch self { case .entrada(let e, let tipo): return "entrada-\(e?.id ?? tipo)"; case .lista(let l): return "lista-\(l?.id ?? "nueva")" }
    }
}

struct OcioView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaOcio?
    @State private var pestana: PestanaOcio = .book
    @State private var modal: ModalOcio?
    @State private var busqueda = ""
    @State private var fuenteImportacion: FuenteImportacionOcio?
    @State private var mostrarImportador = false
    @State private var aviso: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                CabeceraContexto(titulo: "ocio", detalle: detalle) {
                    Text("tu biblioteca.").font(Tipo.poppins(24, .bold, estilo: .title3)).foregroundStyle(Paleta.sobreContexto)
                    Text("libros, series, películas y videojuegos.").font(Tipo.pie).foregroundStyle(Paleta.sobreContextoSuave)
                }
                VStack(alignment: .leading, spacing: 0) {
                    selector
                    if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.xs) }
                    if let vista {
                        if pestana == .lists { listas(vista) } else { biblioteca(vista) }
                    } else { ProgressView().frame(maxWidth: .infinity).padding(.top, Espacio.xl) }
                }.modifier(HojaContenido())
            }
        }
        .background(Paleta.fondo.ignoresSafeArea()).scrollIndicators(.hidden)
        .refreshable { await c.sincronizar() }.task(id: c.informe.revision) { await cargar() }
        .sheet(item: $modal) { m in
            switch m {
            case .entrada(let entrada, let tipo):
                EditorOcio(entrada: entrada, tipo: tipo) { datos in Task { await guardar(datos, previo: entrada) } }
                    .environment(c)
            case .lista(let lista):
                EditorListaOcio(lista: lista, entradas: vista?.entradas ?? []) { nombre, ids in Task { await guardarLista(lista, nombre, ids) } }
            }
        }
        .fileImporter(isPresented: $mostrarImportador, allowedContentTypes: [.commaSeparatedText, .plainText]) { resultado in
            let fuente = fuenteImportacion
            guard let fuente else { return }
            Task { await importar(resultado, fuente: fuente) }
        }
    }

    private var detalle: String? { vista.map { "\($0.entradas.count) elementos. \($0.listas.count) listas." } }

    private var selector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Espacio.xs) {
                ForEach(PestanaOcio.allCases) { p in
                    Button { pestana = p; busqueda = "" } label: {
                        Text(p.titulo + ".").font(Tipo.poppins(14, pestana == p ? .semibold : .medium, estilo: .footnote))
                            .padding(.horizontal, 11).padding(.vertical, 8)
                            .foregroundStyle(pestana == p ? Paleta.sobreAcento : Paleta.textoSecundario)
                            .background(pestana == p ? Paleta.acento : Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }.buttonStyle(.plain)
                }
            }.padding(.vertical, Espacio.xs)
        }
    }

    private func biblioteca(_ v: VistaOcio) -> some View {
        let tipo = pestana.rawValue
        let q = LecturaOcio.normalizar(busqueda)
        let filtradas = v.entradas.filter { $0.tipo == tipo && (q.isEmpty || $0.buscable.contains(q)) }
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: Espacio.s) {
                BuscadorOcio(texto: $busqueda, placeholder: "buscar \(pestana.titulo).")
                Button { modal = .entrada(nil, tipo) } label: {
                    Text("+ añadir.").font(Tipo.poppins(15, .semibold, estilo: .subheadline)).foregroundStyle(Paleta.sobreAcento)
                        .padding(.horizontal, 14).frame(minHeight: 48)
                        .background(Paleta.acento, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }.buttonStyle(.plain)
            }.padding(.vertical, Espacio.s)
            HStack(spacing: Espacio.s) {
                if pestana == .book { Button("importar goodreads.") { abrirImportador(.goodreads) }.buttonStyle(.plain) }
                if pestana == .movie { Button("importar letterboxd.") { abrirImportador(.letterboxd) }.buttonStyle(.plain) }
                if pestana == .series { Button("importar imdb.") { abrirImportador(.imdb) }.buttonStyle(.plain) }
            }.font(Tipo.pie).foregroundStyle(Paleta.acento).padding(.bottom, Espacio.xs)
            if filtradas.isEmpty {
                Text(busqueda.isEmpty ? "todavía no hay nada aquí." : "no hay resultados.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.l)
            }
            LazyVStack(spacing: 0) { ForEach(filtradas) { entrada in fila(entrada) } }
        }
    }

    private func fila(_ entrada: EntradaOcio) -> some View {
        HStack(spacing: Espacio.m) {
            PortadaOcio(url: entrada.portada, titulo: entrada.titulo)
            Button { modal = .entrada(entrada, entrada.tipo) } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Text(entrada.titulo.lowercased() + ".").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto).lineLimit(2)
                    let meta = [entrada.autor, entrada.anio, entrada.estado.lowercased(), Self.cuando(entrada)].filter { !$0.isEmpty }.joined(separator: ", ")
                    if !meta.isEmpty { Text(meta + ".").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).lineLimit(2) }
                    if entrada.valoracion > 0 {
                        EstrellasOcio(valor: entrada.valoracion, tamano: 13).accessibilityLabel(LecturaOcio.textoNota(entrada.valoracion))
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }.buttonStyle(.plain)
            if let url = URL(string: entrada.enlace), !entrada.enlace.isEmpty {
                Link(destination: url) { Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .semibold)) }.foregroundStyle(Paleta.textoSecundario)
            }
            Menu {
                Button("editar.") { modal = .entrada(entrada, entrada.tipo) }
                Button("eliminar.", role: .destructive) { Task { try? await c.encolar(.borrarEntrada(id: entrada.id)) } }
            } label: { Image(systemName: "ellipsis").foregroundStyle(Paleta.textoSecundario).frame(width: 32, height: 40) }
        }.padding(.vertical, 10).overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
            .swipeActions { Button("borrar", role: .destructive) { Task { try? await c.encolar(.borrarEntrada(id: entrada.id)) } } }
    }

    // «visto el 12 nov.» / «terminado el …»: cuándo, de un vistazo.
    static func cuando(_ e: EntradaOcio) -> String {
        let f = e.fechaFin.isEmpty ? e.fechaInicio : e.fechaFin
        guard let d = LocalDay(iso: f) else { return "" }
        let mes = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.month - 1]
        let verbo = e.tipo == "movie" ? "vista" : (e.fechaFin.isEmpty ? "desde" : (e.tipo == "series" ? "terminada" : "terminado"))
        return "\(verbo) el \(d.day) \(mes)" + (d.year == CalendarioBitacora.madrid.dia(de: Date()).year ? "" : " \(d.year)")
    }

    private func listas(_ v: VistaOcio) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack { CabeceraSeccion(titulo: "tus listas.", detalle: "\(v.listas.count)"); Spacer(); AccionTexto(texto: "+ lista.") { modal = .lista(nil) } }
            if v.listas.isEmpty { Text("agrupa aquí favoritos, pendientes o cualquier selección.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.l) }
            ForEach(v.listas) { lista in
                Button { modal = .lista(lista) } label: {
                    HStack { VStack(alignment: .leading, spacing: 2) { Text(lista.nombre.lowercased() + ".").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto); Text("\(lista.entryIds.count) elementos.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }; Spacer(); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Paleta.textoApagado) }
                        .frame(minHeight: 56).overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                }.buttonStyle(.plain).contextMenu { Button("eliminar lista.", role: .destructive) { Task { try? await c.encolar(.borrarListaOcio(id: lista.id)) } } }
            }
        }
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        vista = await Task.detached(priority: .userInitiated) { doc.map { LecturaOcio.vista($0) } }.value
    }

    private func guardar(_ d: DatosEditorOcio, previo: EntradaOcio?) async {
        let id = previo?.id ?? OperacionBitacora.nuevoIdProyecto("ocio")
        let op = { (portada: String) in OperacionBitacora.guardarOcio(id: id, tipo: d.tipo,
            titulo: d.titulo, autor: d.autor, estado: d.estado, fechaInicio: d.fechaInicio, fechaFin: d.fechaFin,
            anio: d.anio, valoracion: String(d.valoracion), notas: d.notas, enlace: d.enlace, portada: portada) }
        var ops = [op(d.portada)]
        // Valorarla da por hecha su tarea «valorar …» (completarTareaValorarPelicula).
        if d.valoracion > 0 { ops.append(OperacionesExtra.op(ValorarOcio.completar, ["entradaId": .string(id)])) }
        do { try await c.encolar(ops); aviso = nil } catch { aviso = "no se pudo guardar en este iPhone."; return }
        // portadaAuto: sin portada, se busca sola y se pone si el título coincide.
        guard d.portada.isEmpty else { return }
        let r = await BuscarPortadas.buscar(c, tipo: d.tipo, q: d.tipo == "book" && !d.autor.isEmpty ? d.titulo + " " + d.autor : d.titulo,
                                            anio: d.tipo == "movie" || d.tipo == "series" ? d.anio : "")
        if let buena = BuscarPortadas.mejor(r, titulo: d.titulo) { try? await c.encolar(op(buena.imagen)) }
    }

    private func guardarLista(_ previa: ListaOcio?, _ nombre: String, _ ids: [String]) async {
        try? await c.encolar(.guardarListaOcio(id: previa?.id ?? OperacionBitacora.nuevoIdProyecto("clist"), nombre: nombre, entryIds: ids))
    }

    private func abrirImportador(_ fuente: FuenteImportacionOcio) {
        fuenteImportacion = fuente
        mostrarImportador = true
    }

    private func importar(_ resultadoURL: Result<URL, Error>, fuente: FuenteImportacionOcio) async {
        defer { fuenteImportacion = nil }
        do {
            let url = try resultadoURL.get()
            let acceso = url.startAccessingSecurityScopedResource(); defer { if acceso { url.stopAccessingSecurityScopedResource() } }
            let texto = try String(contentsOf: url, encoding: .utf8)
            let salida = try await Task.detached { try ImportadoresOcio.importar(texto, fuente: fuente) }.value
            let existentes = Set((vista?.entradas ?? []).map { $0.tipo + "|" + LecturaOcio.normalizar($0.titulo) + "|" + $0.anio })
            var vistos = existentes, anadidas = 0
            for e in salida.entradas {
                let clave = e.tipo + "|" + LecturaOcio.normalizar(e.titulo) + "|" + e.anio
                guard vistos.insert(clave).inserted else { continue }
                try await c.encolar(.guardarOcio(id: OperacionBitacora.nuevoIdProyecto("ocio"), tipo: e.tipo, titulo: e.titulo,
                    autor: e.autor, estado: e.estado, fechaInicio: e.fechaInicio, fechaFin: e.fechaFin, anio: e.anio,
                    valoracion: e.valoracion, notas: e.notas, enlace: e.enlace, portada: ""))
                anadidas += 1
            }
            aviso = "\(anadidas) importados. \(salida.omitidas + salida.entradas.count - anadidas) omitidos."
        } catch { aviso = "no se pudo leer ese archivo." }
    }
}

private struct DatosEditorOcio {
    let tipo: String; let titulo: String; let autor: String; let estado: String; let fechaInicio: String; let fechaFin: String
    let anio: String; let valoracion: Double; let notas: String; let enlace: String; let portada: String
}

// Editor de una película, serie, libro o juego: portada buscada en la función `portadas`, cuándo la viste (o
// empezaste y terminaste) con fechas de verdad, y nota con medias estrellas.
private struct EditorOcio: View {
    @Environment(\.dismiss) private var cerrar
    @Environment(AppCoordinator.self) private var c
    let tipo: String
    let nueva: Bool
    let guardar: (DatosEditorOcio) -> Void
    @State private var titulo: String; @State private var autor: String; @State private var estado: String
    @State private var conInicio: Bool; @State private var inicio: Date
    @State private var conFin: Bool; @State private var fin: Date
    @State private var anio: String
    @State private var valoracion: Double; @State private var notas: String; @State private var enlace: String; @State private var portada: String
    @State private var candidatas: [CandidataPortada] = []
    @State private var buscando = false
    @State private var sinResultados = false

    private static var cal: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = CalendarioBitacora.madrid.zona; return c }
    private static func fecha(_ iso: String) -> Date? {
        guard let d = LocalDay(iso: iso) else { return nil }
        return cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))
    }
    private static func iso(_ f: Date) -> String {
        let d = cal.dateComponents([.year, .month, .day], from: f)
        return String(format: "%04d-%02d-%02d", d.year ?? 2000, d.month ?? 1, d.day ?? 1)
    }

    init(entrada: EntradaOcio?, tipo: String, guardar: @escaping (DatosEditorOcio) -> Void) {
        self.tipo = tipo; self.guardar = guardar; self.nueva = entrada == nil
        _titulo = State(initialValue: entrada?.titulo ?? ""); _autor = State(initialValue: entrada?.autor ?? "")
        _estado = State(initialValue: entrada?.estado ?? LecturaOcio.estadoInicial(tipo))
        let i = Self.fecha(entrada?.fechaInicio ?? ""), f = Self.fecha(entrada?.fechaFin ?? "")
        // Una película nueva se apunta como vista hoy: es lo normal al añadirla.
        _conInicio = State(initialValue: i != nil || (entrada == nil && tipo == "movie"))
        _inicio = State(initialValue: i ?? Date())
        _conFin = State(initialValue: f != nil)
        _fin = State(initialValue: f ?? Date())
        _anio = State(initialValue: entrada?.anio ?? "")
        _valoracion = State(initialValue: entrada?.valoracion ?? 0); _notas = State(initialValue: entrada?.notas ?? "")
        _enlace = State(initialValue: entrada?.enlace ?? ""); _portada = State(initialValue: entrada?.portada ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("título.", text: $titulo)
                    if tipo == "book" { TextField("autor.", text: $autor) }
                    TextField("año.", text: $anio).keyboardType(.numberPad)
                }.listRowBackground(Paleta.superficie)
                seccionPortada.listRowBackground(Paleta.superficie)
                Section("cuándo.") {
                    if tipo == "movie" {
                        Toggle("la he visto.", isOn: $conInicio)
                        if conInicio { DatePicker("el día.", selection: $inicio, displayedComponents: .date) }
                    } else {
                        Toggle("empecé.", isOn: $conInicio)
                        if conInicio { DatePicker("el día.", selection: $inicio, displayedComponents: .date) }
                        Toggle("terminé.", isOn: $conFin)
                        if conFin { DatePicker("el día.", selection: $fin, in: (conInicio ? inicio : .distantPast)..., displayedComponents: .date) }
                        if !estados.isEmpty {
                            Picker("estado.", selection: $estado) { ForEach(estados, id: \.self) { Text($0.lowercased() + ".").tag($0) } }
                        }
                    }
                }
                .listRowBackground(Paleta.superficie)
                .environment(\.locale, Locale(identifier: "es_ES"))
                .onChange(of: estado) { _, e in if e.hasPrefix("Complet") && !conFin { conFin = true; fin = Date() } }
                .onChange(of: conFin) { _, si in if si, let completo = estados.first(where: { $0.hasPrefix("Complet") }), !estado.hasPrefix("Abandon") { estado = completo } }
                Section {
                    HStack {
                        EstrellasOcio(valor: valoracion, tamano: 30) { valoracion = $0 }
                        Spacer()
                        if valoracion > 0 { Button("quitar.") { valoracion = 0 }.font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).buttonStyle(.plain) }
                    }
                } header: { Text("tu nota.") } footer: {
                    Text(valoracion == 0 ? "sin valorar. toca la mitad de una estrella para media." : LecturaOcio.textoNota(valoracion))
                }
                .listRowBackground(Paleta.superficie)
                Section("notas.") { TextEditor(text: $notas).editorCasa(alto: 90) }.listRowBackground(Paleta.superficie)
                Section { TextField("enlace.", text: $enlace).keyboardType(.URL).textInputAutocapitalization(.never) }.listRowBackground(Paleta.superficie)
            }
            .font(Tipo.cuerpo)
            .formularioCasa()
            .navigationTitle(LecturaOcio.nombre(tipo) + ".")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        let i = conInicio ? Self.iso(inicio) : "", f = tipo != "movie" && conFin ? Self.iso(fin) : ""
                        guardar(.init(tipo: tipo, titulo: titulo, autor: autor, estado: estado, fechaInicio: i, fechaFin: f, anio: anio,
                                      valoracion: valoracion, notas: notas, enlace: enlace, portada: portada))
                        cerrar()
                    }.disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private var seccionPortada: some View {
        Section {
            HStack(alignment: .top, spacing: Espacio.m) {
                PortadaOcio(url: portada, titulo: titulo.isEmpty ? "?" : titulo, ancho: 64)
                VStack(alignment: .leading, spacing: 6) {
                    Button(buscando ? "buscando…" : "buscar portada.") { Task { await buscar() } }
                        .font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.acento)
                        .disabled(buscando || titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                    if !portada.isEmpty { Button("quitar.") { portada = "" }.font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
                    if sinResultados { Text("no he encontrado portadas con ese título.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if !candidatas.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 10) {
                        ForEach(candidatas) { k in
                            Button {
                                portada = k.imagen
                                if anio.isEmpty { anio = String(k.anio.prefix(4)) }
                                if tipo == "book", autor.isEmpty { autor = k.autor }
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    PortadaOcio(url: k.imagen, titulo: k.titulo, ancho: 70)
                                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(portada == k.imagen ? Paleta.acento : .clear, lineWidth: 3))
                                    Text(k.titulo.lowercased()).font(Tipo.poppins(11, .medium, estilo: .caption2)).foregroundStyle(Paleta.texto).lineLimit(2)
                                    if !k.anio.isEmpty { Text(k.anio).font(Tipo.poppins(11, .regular, estilo: .caption2)).foregroundStyle(Paleta.textoSecundario) }
                                }
                                .frame(width: 70, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("portada de \(k.titulo)" + (k.anio.isEmpty ? "" : ", \(k.anio)") + (portada == k.imagen ? ", elegida" : ""))
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            TextField("o pega la url de una imagen.", text: $portada).keyboardType(.URL).textInputAutocapitalization(.never).font(Tipo.pie)
        } header: { Text("portada.") }
    }

    private func buscar() async {
        buscando = true
        defer { buscando = false }
        let q = tipo == "book" && !autor.isEmpty ? titulo + " " + autor : titulo
        candidatas = await BuscarPortadas.buscar(c, tipo: tipo, q: q, anio: tipo == "movie" || tipo == "series" ? anio : "")
        sinResultados = candidatas.isEmpty
        if portada.isEmpty, let m = BuscarPortadas.mejor(candidatas, titulo: titulo) { portada = m.imagen; if anio.isEmpty { anio = String(m.anio.prefix(4)) } }
    }

    private var estados: [String] {
        switch tipo { case "book": return ["Leyendo", "Completado", "Abandonado"]; case "series": return ["Viendo", "Completada", "Abandonada"]; case "game": return ["Jugando", "Completado", "Abandonado"]; default: return [] }
    }
}

private struct EditorListaOcio: View {
    @Environment(\.dismiss) private var cerrar
    let entradas: [EntradaOcio]
    let guardar: (String, [String]) -> Void
    @State private var nombre: String
    @State private var seleccion: Set<String>
    @State private var busqueda = ""

    init(lista: ListaOcio?, entradas: [EntradaOcio], guardar: @escaping (String, [String]) -> Void) {
        self.entradas = entradas; self.guardar = guardar
        _nombre = State(initialValue: lista?.nombre ?? ""); _seleccion = State(initialValue: Set(lista?.entryIds ?? []))
    }

    var body: some View {
        NavigationStack { List {
            TextField("nombre.", text: $nombre)
            TextField("buscar en la biblioteca.", text: $busqueda)
            ForEach(entradas.filter { busqueda.isEmpty || LecturaOcio.normalizar($0.titulo).contains(LecturaOcio.normalizar(busqueda)) }) { e in
                Button { if seleccion.contains(e.id) { seleccion.remove(e.id) } else { seleccion.insert(e.id) } } label: {
                    HStack { Image(systemName: seleccion.contains(e.id) ? "checkmark.circle.fill" : "circle"); VStack(alignment: .leading) { Text(e.titulo); Text(LecturaOcio.nombre(e.tipo) + ".").font(.caption).foregroundStyle(.secondary) } }
                }.foregroundStyle(.primary)
            }
        }.navigationTitle("lista.").toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
            ToolbarItem(placement: .confirmationAction) { Button("guardar.") { guardar(nombre, Array(seleccion)); cerrar() }.disabled(nombre.trimmingCharacters(in: .whitespaces).isEmpty) }
        } }
    }
}
