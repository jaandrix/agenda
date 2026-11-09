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
        .background(Paleta.fondo.ignoresSafeArea()).scrollIndicators(.hidden).toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar() }.task(id: c.informe.revision) { await cargar() }
        .sheet(item: $modal) { m in
            switch m {
            case .entrada(let entrada, let tipo):
                EditorOcio(entrada: entrada, tipo: tipo) { datos in Task { await guardar(datos, previo: entrada) } }
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
        let filtradas = v.entradas.filter { $0.tipo == tipo && (busqueda.isEmpty || LecturaOcio.normalizar($0.titulo + " " + $0.autor).contains(LecturaOcio.normalizar(busqueda))) }
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: Espacio.s) {
                TextField("buscar.", text: $busqueda).font(Tipo.cuerpo)
                Button("+ añadir.") { modal = .entrada(nil, tipo) }.font(Tipo.pie).buttonStyle(.bordered)
            }.padding(.vertical, Espacio.s)
            HStack(spacing: Espacio.s) {
                if pestana == .book { Button("importar goodreads.") { abrirImportador(.goodreads) }.buttonStyle(.plain) }
                if pestana == .movie { Button("importar letterboxd.") { abrirImportador(.letterboxd) }.buttonStyle(.plain) }
                if pestana == .series { Button("importar imdb.") { abrirImportador(.imdb) }.buttonStyle(.plain) }
            }.font(Tipo.pie).foregroundStyle(Paleta.acento).padding(.bottom, Espacio.xs)
            if filtradas.isEmpty {
                Text(busqueda.isEmpty ? "todavía no hay nada aquí." : "no hay resultados.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.l)
            }
            ForEach(filtradas) { entrada in fila(entrada) }
        }
    }

    private func fila(_ entrada: EntradaOcio) -> some View {
        HStack(spacing: Espacio.m) {
            portada(entrada)
            Button { modal = .entrada(entrada, entrada.tipo) } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Text(entrada.titulo.lowercased() + ".").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto).lineLimit(2)
                    let meta = [entrada.autor, entrada.anio, entrada.estado].filter { !$0.isEmpty }.joined(separator: ". ")
                    if !meta.isEmpty { Text(meta).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).lineLimit(2) }
                    if entrada.valoracion > 0 { Text("\(entrada.valoracion) de 5.").font(Tipo.pie).foregroundStyle(Paleta.acento) }
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

    @ViewBuilder private func portada(_ entrada: EntradaOcio) -> some View {
        if let url = URL(string: entrada.portada), !entrada.portada.isEmpty {
            AsyncImage(url: url) { imagen in imagen.resizable().scaledToFill() } placeholder: { Color.clear }
                .frame(width: 44, height: 62).clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        } else {
            RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Paleta.tinteContexto).frame(width: 44, height: 62)
                .overlay(Text(String(entrada.titulo.prefix(1)).lowercased()).font(Tipo.poppins(20, .bold, estilo: .title3)).foregroundStyle(Paleta.contexto))
        }
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
        try? await c.encolar(.guardarOcio(id: previo?.id ?? OperacionBitacora.nuevoIdProyecto("ocio"), tipo: d.tipo,
            titulo: d.titulo, autor: d.autor, estado: d.estado, fechaInicio: d.fechaInicio, fechaFin: d.fechaFin,
            anio: d.anio, valoracion: String(d.valoracion), notas: d.notas, enlace: d.enlace, portada: d.portada))
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
    let anio: String; let valoracion: Int; let notas: String; let enlace: String; let portada: String
}

private struct EditorOcio: View {
    @Environment(\.dismiss) private var cerrar
    let tipo: String
    let guardar: (DatosEditorOcio) -> Void
    @State private var titulo: String; @State private var autor: String; @State private var estado: String
    @State private var fechaInicio: String; @State private var fechaFin: String; @State private var anio: String
    @State private var valoracion: Int; @State private var notas: String; @State private var enlace: String; @State private var portada: String

    init(entrada: EntradaOcio?, tipo: String, guardar: @escaping (DatosEditorOcio) -> Void) {
        self.tipo = tipo; self.guardar = guardar
        _titulo = State(initialValue: entrada?.titulo ?? ""); _autor = State(initialValue: entrada?.autor ?? "")
        _estado = State(initialValue: entrada?.estado ?? LecturaOcio.estadoInicial(tipo)); _fechaInicio = State(initialValue: entrada?.fechaInicio ?? "")
        _fechaFin = State(initialValue: entrada?.fechaFin ?? ""); _anio = State(initialValue: entrada?.anio ?? "")
        _valoracion = State(initialValue: entrada?.valoracion ?? 0); _notas = State(initialValue: entrada?.notas ?? "")
        _enlace = State(initialValue: entrada?.enlace ?? ""); _portada = State(initialValue: entrada?.portada ?? "")
    }

    var body: some View {
        NavigationStack { Form {
            TextField("título.", text: $titulo)
            if tipo == "book" { TextField("autor.", text: $autor) }
            TextField("año.", text: $anio).keyboardType(.numberPad)
            TextField(tipo == "movie" ? "fecha." : "fecha de inicio.", text: $fechaInicio).textContentType(.dateTime)
            if tipo != "movie" { TextField("fecha de finalización.", text: $fechaFin).textContentType(.dateTime) }
            if !estados.isEmpty { Picker("estado.", selection: $estado) { ForEach(estados, id: \.self) { Text($0.lowercased() + ".").tag($0) } } }
            Stepper(valoracion == 0 ? "sin valorar." : "\(valoracion) de 5.", value: $valoracion, in: 0...5)
            Section("notas.") { TextEditor(text: $notas).frame(minHeight: 90) }
            TextField("enlace.", text: $enlace).keyboardType(.URL).textInputAutocapitalization(.never)
            TextField("url de portada.", text: $portada).keyboardType(.URL).textInputAutocapitalization(.never)
        }.navigationTitle(LecturaOcio.nombre(tipo) + ".").toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
            ToolbarItem(placement: .confirmationAction) { Button("guardar.") { guardar(.init(tipo: tipo, titulo: titulo, autor: autor, estado: estado, fechaInicio: fechaInicio, fechaFin: fechaFin, anio: anio, valoracion: valoracion, notas: notas, enlace: enlace, portada: portada)); cerrar() }.disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty) }
        } }
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
