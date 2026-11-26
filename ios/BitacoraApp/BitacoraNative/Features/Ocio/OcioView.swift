import SwiftUI
import UniformTypeIdentifiers

private enum PestanaOcio: String, CaseIterable, Identifiable, Hashable {
    case book, series, movie, game, lists
    var id: String { rawValue }
    var titulo: String {
        switch self { case .book: return "libros"; case .series: return "series"; case .movie: return "películas"; case .game: return "videojuegos"; case .lists: return "listas" }
    }
    // En el segmento: cinco opciones en el ancho de un iPhone.
    var corto: String {
        switch self { case .book: return "libros"; case .series: return "series"; case .movie: return "pelis"; case .game: return "juegos"; case .lists: return "listas" }
    }
    var importador: FuenteImportacionOcio? {
        switch self { case .book: return .goodreads; case .movie: return .letterboxd; case .series: return .imdb; default: return nil }
    }
    var nombreImportador: String {
        switch self { case .book: return "goodreads"; case .movie: return "letterboxd"; case .series: return "imdb"; default: return "" }
    }
    var invitacion: String {
        switch self {
        case .book: return "apunta lo que estás leyendo."
        case .series: return "apunta lo que estás viendo."
        case .movie: return "apunta la última que viste."
        case .game: return "apunta a qué estás jugando."
        case .lists: return ""
        }
    }
}

private enum ModalOcio: Identifiable {
    case ficha(EntradaOcio)
    case entrada(EntradaOcio?, String)
    case lista(ListaOcio?)
    case escaner(String)
    var id: String {
        switch self {
        case .escaner(let tipo): return "escaner-\(tipo)"
        case .ficha(let e): return "ficha-\(e.id)"
        case .entrada(let e, let tipo): return "entrada-\(e?.id ?? tipo)"
        case .lista(let l): return "lista-\(l?.id ?? "nueva")"
        }
    }
}

// Ocio 3.0: «ocio.», el segmento por tipo con la píldora negra y el buscador en cápsula; lo que estás leyendo, viendo o
// jugando en tarjetas oscuras que se deslizan en horizontal, y el resto en una rejilla de tarjetas blancas con portada.
// Tocar una abre su ficha (portada grande, nota y acciones); el editor y las listas siguen en hojas.
struct OcioView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var vista: VistaOcio?
    // 3.4: lo que los amigos te han recomendado (todas las pestañas; se filtra por tipo al pintar).
    @State private var recomendadas: [RecomendacionOcio] = []
    @State private var pestana: PestanaOcio = .book
    @State private var modal: ModalOcio?
    @State private var busqueda = ""
    @State private var fuenteImportacion: FuenteImportacionOcio?
    @State private var mostrarImportador = false
    @State private var aviso: String?
    @State private var primeraCarga = true
    // 3.2: orden, filtro y plataforma de la pestaña (PreferenciasOcio los recuerda por tipo).
    @State private var orden: OrdenOcio = PreferenciasOcio.orden("book")
    @State private var filtro: FiltroOcio = PreferenciasOcio.filtro("book")
    @State private var plataforma = PreferenciasOcio.plataforma("book")

    // 3.3 (petición de Alejandro): cuatro por fila en vez de tres, para ver más de un vistazo.
    private let columnas = Array(repeating: GridItem(.flexible(), spacing: Medida.xs, alignment: .top), count: 4)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "ocio.", subtitulo: subtitulo) { acciones }
                    .padding(.bottom, Medida.xxs)
                SegmentoCapsula(opciones: PestanaOcio.allCases.map { SegmentoCapsula<PestanaOcio>.Opcion(valor: $0, titulo: $0.corto) },
                                elegido: $pestana, sobreBlanco: false)
                if pestana != .lists {
                    BuscadorCapsula(texto: $busqueda, placeholder: "buscar \(pestana.titulo)")
                }
                if let aviso {
                    Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        .padding(.horizontal, Medida.xxs)
                        .transition(.opacity)
                }
                if let vista {
                    Group {
                        if pestana == .lists { listas(vista) } else { biblioteca(vista) }
                    }
                    .id(pestana)
                    .transition(.opacity)
                } else {
                    ProgressView().tint(Lienzo.tintaTerciaria).frame(maxWidth: .infinity).padding(.top, Medida.xl)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: pestana)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: aviso)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
        .refreshable { await c.sincronizar() }
        .tareaVisible(id: c.revision) { await cargar() }
        .task { await cargarRecomendadas() }
        .onChange(of: pestana) { _, p in
            busqueda = ""
            orden = PreferenciasOcio.orden(p.rawValue)
            filtro = PreferenciasOcio.filtro(p.rawValue)
            plataforma = PreferenciasOcio.plataforma(p.rawValue)
            Task { await precargar() }
        }
        .onChange(of: orden) { _, _ in recordar() }
        .onChange(of: filtro) { _, _ in recordar() }
        .onChange(of: plataforma) { _, _ in recordar() }
        .hoja(item: $modal) { m in
            switch m {
            case .ficha(let entrada):
                FichaOcio(entrada: entrada,
                          valorar: { v in Task { await guardar(Self.datos(entrada, valoracion: v), previo: entrada) } },
                          editar: { modal = .entrada(entrada, entrada.tipo) },
                          eliminar: { Task { await c.guardar(.borrarEntrada(id: entrada.id)) } },
                          cambiarPortada: { url in Task { await c.guardar(OcioDatosOp.op(id: entrada.id, portada: url)) } })
                    .environment(c)
            case .entrada(let entrada, let tipo):
                EditorOcio(entrada: entrada, tipo: tipo) { datos in Task { await guardar(datos, previo: entrada) } }
                    .environment(c)
            case .lista(let lista):
                EditorListaOcio(lista: lista, entradas: vista?.entradas ?? []) { nombre, ids in Task { await guardarLista(lista, nombre, ids) } }
            case .escaner(let tipo):
                HojaEscanerOcio(tipo: tipo, existentes: existentes(tipo)) { item, estado in Task { await anadirEscaneado(item, estado: estado) } }
            }
        }
        .fileImporter(isPresented: $mostrarImportador, allowedContentTypes: [.commaSeparatedText, .plainText]) { resultado in
            let fuente = fuenteImportacion
            guard let fuente else { return }
            Task { await importar(resultado, fuente: fuente) }
        }
    }

    // MARK: - Cabecera

    private var acciones: some View {
        HStack(spacing: Medida.xxs) {
            if pestana == .book || pestana == .game {
                Button { Haptica.ligera(); modal = .escaner(pestana.rawValue) } label: {
                    Label("escáner.", systemImage: "barcode.viewfinder").labelStyle(.titleAndIcon)
                        .lineLimit(1)
                }
                .buttonStyle(EstiloCapsula(tono: .blanco, alto: 40))
                // 3.2: con las acciones a la altura del título, el botón cedía ancho y salía «e...»; ahora encoge el título.
                .fixedSize()
                .frame(minHeight: Medida.toque)
                .accessibilityLabel(pestana == .game ? "escáner de juegos" : "escáner de isbn")
                .accessibilityHint(pestana == .game ? "añade juegos leyendo el código de barras de la caja" : "añade libros leyendo el código de barras")
            }
            if let fuente = pestana.importador {
                BotonRedondo(sistema: "square.and.arrow.down", tono: .blanco, etiqueta: "importar de \(pestana.nombreImportador)") {
                    abrirImportador(fuente)
                }
            }
            BotonRedondo(sistema: "plus", tono: .oscuro,
                         etiqueta: pestana == .lists ? "nueva lista" : "añadir \(LecturaOcio.nombre(pestana.rawValue))") {
                modal = pestana == .lists ? .lista(nil) : .entrada(nil, pestana.rawValue)
            }
        }
    }

    private var subtitulo: String? {
        guard let v = vista else { return nil }
        if pestana == .lists { return v.listas.count == 1 ? "1 lista." : "\(v.listas.count) listas." }
        let delTipo = v.entradas.filter { $0.tipo == pestana.rawValue }
        let n = delTipo.count, enCurso = delTipo.filter(Self.enCurso).count
        if n == 0 { return "nada todavía." }
        let total = n == 1 ? "1 \(LecturaOcio.nombre(pestana.rawValue))." : "\(n) \(pestana.titulo)."
        return enCurso == 0 ? total : total + " \(enCurso) en curso."
    }

    // MARK: - Biblioteca

    // «ahora mismo»: lo empezado y sin terminar (las películas no tienen estado en curso).
    static func enCurso(_ e: EntradaOcio) -> Bool {
        e.fechaFin.isEmpty && ["Leyendo", "Viendo", "Jugando"].contains(e.estado)
    }

    @ViewBuilder private func biblioteca(_ v: VistaOcio) -> some View {
        let tipo = pestana.rawValue
        let paraMi = recomendadas.filter { $0.tipo == tipo }
        if !paraMi.isEmpty {
            FranjaRecomendacionesOcio(lista: paraMi, anadir: { r in Task { await aceptar(r) } },
                                      descartar: { r in Task { await quitarRecomendada(r) } })
                .padding(.top, Medida.xs)
        }
        let q = LecturaOcio.normalizar(busqueda)
        let delTipo = v.entradas.filter { $0.tipo == tipo }
        let buscadas = q.isEmpty ? delTipo : delTipo.filter { $0.buscable.contains(q) }
        let ahora = q.isEmpty ? delTipo.filter(Self.enCurso) : []
        // 3.2: debajo de «Ahora mismo.», toda la biblioteca con su orden y su filtro (en los juegos, por plataforma).
        let filtradas = BibliotecaOcio.ordenar(BibliotecaOcio.filtrar(buscadas, filtro, plataforma: tipo == "game" ? plataforma : ""), orden)
        if delTipo.isEmpty {
            TarjetaInvitacion(frase: "aún no hay \(pestana.titulo) aquí.", destacado: pestana.invitacion, boton: "añadir.") {
                modal = .entrada(nil, tipo)
            }
            .entradaEscalonada(0)
            if pestana == .book || pestana == .game {
                Button("o escanea sus códigos de barras.") { modal = .escaner(pestana.rawValue) }
                    .buttonStyle(.capsula(.claro))
                    .frame(maxWidth: .infinity)
                    .entradaEscalonada(1)
            }
            if let fuente = pestana.importador {
                Button("o importa tu \(pestana.nombreImportador).") { abrirImportador(fuente) }
                    .buttonStyle(.capsula(.claro))
                    .frame(maxWidth: .infinity)
                    .entradaEscalonada(2)
            }
        } else if buscadas.isEmpty {
            TarjetaInvitacion(frase: "nada coincide con", destacado: "«\(busqueda.trimmingCharacters(in: .whitespaces))».",
                              boton: "borrar búsqueda.") {
                Haptica.ligera()
                busqueda = ""
            }
            .transition(.opacity.combined(with: .scale(scale: 0.98)))
        } else {
            if !ahora.isEmpty {
                TituloSeccionOcio(texto: "Ahora mismo.").padding(.top, Medida.xxs)
                filaAhora(ahora)
            }
            controles(delTipo)
                .padding(.top, ahora.isEmpty ? 0 : Medida.xs)
            if filtradas.isEmpty {
                Text("nada con este filtro.").font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                    .frame(maxWidth: .infinity).padding(.vertical, Medida.l)
                    .transition(.opacity)
            } else if tipo == "game" && plataforma.isEmpty {
                let grupos = BibliotecaOcio.porPlataforma(filtradas)
                ForEach(Array(grupos.enumerated()), id: \.element.id) { n, g in
                    TituloSeccionOcio(texto: g.plataforma.isEmpty ? "Sin plataforma." : g.plataforma + ".", detalle: "\(g.entradas.count)")
                        .padding(.top, n == 0 ? 0 : Medida.xs)
                    rejilla(g.entradas)
                }
            } else {
                TituloSeccionOcio(texto: "Tu biblioteca.", detalle: "\(filtradas.count)")
                rejilla(filtradas)
            }
        }
    }

    private func rejilla(_ lista: [EntradaOcio]) -> some View {
        LazyVGrid(columns: columnas, alignment: .leading, spacing: Medida.xs) {
            ForEach(Array(lista.enumerated()), id: \.element.id) { i, e in
                celda(e).modifier(AparicionOcio(indice: i, activa: primeraCarga && i < 12))
            }
        }
    }

    // Filtro en chips y orden en un menú redondo; en los juegos, además, la plataforma.
    @ViewBuilder private func controles(_ delTipo: [EntradaOcio]) -> some View {
        let tipo = pestana.rawValue
        HStack(spacing: Medida.xs) {
            ChipsEleccion(opciones: FiltroOcio.allCases.map { (valor: $0, titulo: $0.titulo(tipo)) }, elegido: $filtro)
            MenuRedondo(sistema: "arrow.up.arrow.down", etiqueta: "ordenar: " + orden.titulo) {
                Picker("ordenar.", selection: $orden) {
                    ForEach(OrdenOcio.opciones(tipo)) { Text($0.titulo).tag($0) }
                }
            }
        }
        if tipo == "game" {
            let plataformas = BibliotecaOcio.plataformas(delTipo)
            if !plataformas.isEmpty {
                let opciones: [(valor: String, titulo: String)] = [("", "todas las plataformas.")] + plataformas.map { ($0, $0.lowercased() + ".") }
                ChipsEleccion(opciones: opciones, elegido: $plataforma)
            }
        }
    }

    // Con una sola, la tarjeta ocupa el ancho; con varias, se deslizan y encajan una a una.
    @ViewBuilder private func filaAhora(_ lista: [EntradaOcio]) -> some View {
        if lista.count == 1, let e = lista.first {
            tarjetaAhora(e).entradaEscalonada(0)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Medida.s) {
                    ForEach(Array(lista.enumerated()), id: \.element.id) { i, e in
                        tarjetaAhora(e).frame(width: 290).entradaEscalonada(i)
                    }
                }
                .scrollTargetLayout()
                .padding(.vertical, Medida.xs)
            }
            .contentMargins(.horizontal, Medida.margen, for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
            .scrollClipDisabled()
            .padding(.horizontal, -Medida.margen)
            .padding(.vertical, -Medida.xs)
        }
    }

    private func tarjetaAhora(_ e: EntradaOcio) -> some View {
        let anchoPortada: CGFloat = 62
        let dias = Self.diasDesde(e)
        return Button { modal = .ficha(e) } label: {
            TarjetaOscura {
                HStack(alignment: .top, spacing: Medida.s) {
                    PortadaOcio(url: e.portada, titulo: e.titulo, ancho: anchoPortada, radio: Medida.radioIcono,
                                cinco: BibliotecaOcio.cinco(e))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(e.estado.lowercased() + ".").font(Letra.pieFuerte).foregroundStyle(Lienzo.sobreOscuroSuave)
                        Text(MayusculaOcio.inicial(e.titulo)).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.sobreOscuro)
                            .lineLimit(2).multilineTextAlignment(.leading)
                        if !e.autor.isEmpty {
                            Text(e.autor).font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave).lineLimit(1)
                        } else if !e.plataforma.isEmpty {
                            Text(e.plataforma).font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave).lineLimit(1)
                        }
                        Spacer(minLength: Medida.xs)
                        if let dias {
                            BarraCursoOcio(fraccion: Double(dias) / 30)
                            Text(Self.textoDias(dias)).font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave).monospacedDigit()
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(height: anchoPortada * PortadaOcio.proporcion)
            }
        }
        .buttonStyle(.pulsable(0.97))
        .contextMenu { menuEntrada(e) }
        .accessibilityElement(children: .combine)
        .accessibilityHint("abre su ficha")
    }

    private func celda(_ e: EntradaOcio) -> some View {
        let cinco = BibliotecaOcio.cinco(e)
        return Button { modal = .ficha(e) } label: {
            VStack(alignment: .leading, spacing: 3) {
                PortadaOcio(url: e.portada, titulo: e.titulo, ancho: nil,
                            radio: Medida.concentrico(Medida.radioIcono + 2, relleno: Medida.xxs + 1))
                Text(MayusculaOcio.inicial(e.titulo)).font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta)
                    .lineLimit(2, reservesSpace: true).multilineTextAlignment(.leading)
                    .minimumScaleFactor(0.9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                // 3.2: con chapa de 5 estrellas no se repite la nota debajo. 3.3: en cuatro columnas el dato se corta
                // antes que la nota.
                HStack(alignment: .center, spacing: Medida.xxs) {
                    Text(Self.meta(e)).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                    Spacer(minLength: 0)
                    if e.valoracion > 0, !cinco { NotaDiscretaOcio(valor: e.valoracion).layoutPriority(1) }
                }
            }
            .tarjeta(relleno: Medida.xxs + 1, radio: Medida.radioIcono + 2)
            // 3.2: la chapa de 5 estrellas en la esquina de la tarjeta, asomando por fuera.
            .overlay(alignment: .topTrailing) {
                if cinco { ChapaCincoOcio(lado: 20).offset(x: 5, y: -5) }
            }
        }
        .buttonStyle(.pulsable(0.96))
        .contextMenu { menuEntrada(e) }
        .accessibilityElement(children: .combine)
        .accessibilityHint("abre su ficha")
    }

    // «2 de 3 temp.», «2 temp.» o, sin vistas, «3 temp.».
    static func textoTemporadas(_ e: EntradaOcio) -> String? {
        switch (e.temporadasVistas, e.temporadasTotal) {
        case (0, 0): return nil
        case (let v, 0): return "\(v) temp. vistas"
        case (0, let t): return "\(t) temp."
        case (let v, let t): return v >= t ? "\(t) temp." : "\(v) de \(t) temp."
        }
    }

    // Bajo el título: el autor de un libro, la plataforma y el formato de un juego o el año.
    static func meta(_ e: EntradaOcio) -> String {
        if e.tipo == "book", !e.autor.isEmpty { return e.autor }
        if e.tipo == "series", let t = textoTemporadas(e) { return t }
        if e.tipo == "game" {
            let partes = [e.plataforma, BibliotecaOcio.textoFormato(e.formato)].filter { !$0.isEmpty }
            if !partes.isEmpty { return partes.joined(separator: ", ") }
        }
        return e.anio
    }

    @ViewBuilder private func menuEntrada(_ e: EntradaOcio) -> some View {
        Button("editar.") { modal = .entrada(e, e.tipo) }
        if let url = URL(string: e.enlace), !e.enlace.isEmpty { Link("abrir enlace.", destination: url) }
        Button("eliminar.", role: .destructive) { Task { await c.guardar(.borrarEntrada(id: e.id)) } }
    }

    // «visto el 12 nov.» / «terminado el …»: cuándo, de un vistazo.
    static func cuando(_ e: EntradaOcio) -> String {
        let f = e.fechaFin.isEmpty ? e.fechaInicio : e.fechaFin
        guard let d = LocalDay(iso: f) else { return "" }
        let mes = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.month - 1]
        let verbo = e.tipo == "movie" ? "vista" : (e.fechaFin.isEmpty ? "desde" : (e.tipo == "series" ? "terminada" : "terminado"))
        return "\(verbo) el \(d.day) \(mes)" + (d.year == CalendarioBitacora.madrid.dia(de: Date()).year ? "" : " \(d.year)")
    }

    // Días desde que se empezó (en UTC, sin cambios de hora). Nil si no hay fecha de inicio.
    static func diasDesde(_ e: EntradaOcio) -> Int? {
        guard let d = LocalDay(iso: e.fechaInicio) else { return nil }
        let hoy = CalendarioBitacora.madrid.dia(de: Date())
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC") ?? .current
        guard let a = cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12)),
              let b = cal.date(from: DateComponents(year: hoy.year, month: hoy.month, day: hoy.day, hour: 12)),
              let n = cal.dateComponents([.day], from: a, to: b).day else { return nil }
        return max(0, n)
    }

    static func textoDias(_ n: Int) -> String {
        n == 0 ? "empezado hoy." : n == 1 ? "desde ayer." : "\(n) días."
    }

    // MARK: - Listas

    @ViewBuilder private func listas(_ v: VistaOcio) -> some View {
        if v.listas.isEmpty {
            TarjetaInvitacion(frase: "agrupa favoritos, pendientes", destacado: "o cualquier selección.", boton: "crear lista.") {
                modal = .lista(nil)
            }
            .entradaEscalonada(0)
        } else {
            let porId = Dictionary(v.entradas.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            VStack(spacing: 0) {
                ForEach(Array(v.listas.enumerated()), id: \.element.id) { i, lista in
                    if i > 0 { SeparadorFila(sangria: 52 + Medida.s) }
                    filaLista(lista, portadas: lista.entryIds.compactMap { porId[$0] }.prefix(3).map { $0 })
                        .entradaEscalonada(i)
                }
            }
            .tarjeta(relleno: Medida.xs)
        }
    }

    private func filaLista(_ lista: ListaOcio, portadas: [EntradaOcio]) -> some View {
        Button { modal = .lista(lista) } label: {
            HStack(spacing: Medida.s) {
                ZStack(alignment: .leading) {
                    if portadas.isEmpty {
                        IconoCuadrado(id: "culture", tono: .claro, tamano: Medida.icono)
                    }
                    ForEach(Array(portadas.enumerated().reversed()), id: \.element.id) { n, e in
                        PortadaOcio(url: e.portada, titulo: e.titulo, ancho: 26, radio: 6)
                            .offset(x: CGFloat(n) * 13)
                    }
                }
                .frame(width: 52, alignment: .leading)
                VStack(alignment: .leading, spacing: 2) {
                    Text(MayusculaOcio.inicial(lista.nombre) + ".").font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).lineLimit(1)
                    Text(lista.entryIds.count == 1 ? "1 elemento." : "\(lista.entryIds.count) elementos.")
                        .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                }
                Spacer(minLength: Medida.xs)
                FlechaFila()
            }
            .padding(.horizontal, Medida.xs)
            .frame(minHeight: 60)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pulsable(0.98))
        .contextMenu { Button("eliminar lista.", role: .destructive) { Task { await c.guardar(.borrarListaOcio(id: lista.id)) } } }
    }

    // MARK: - Datos

    private func cargar() async {
        let doc = await c.documentoVisible()
        guard let nuevo = await ultimaGana({ doc.map { LecturaOcio.vista($0) } }) else { return }
        if vista == nil {
            // 3.2: las primeras portadas, del disco a la memoria antes de pintar (si no, salían en blanco un momento).
            if let nuevo { await Imagenes.precargar(Self.primerasPortadas(nuevo, tipo: pestana.rawValue), lado: PortadaOcio.ladoRejilla, soloDisco: true) }
            vista = nuevo
            Task {
                try? await Task.sleep(for: .seconds(1))
                primeraCarga = false
            }
            Task { await rellenarPortadas() }
        } else if vista != nuevo {
            withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento)) { vista = nuevo }
        }
    }

    private static func primerasPortadas(_ v: VistaOcio, tipo: String) -> [URL] {
        Array(v.entradas.lazy.filter { $0.tipo == tipo && !$0.portada.isEmpty }.prefix(12).compactMap { URL(string: $0.portada) })
    }

    private func precargar() async {
        guard let vista else { return }
        await Imagenes.precargar(Self.primerasPortadas(vista, tipo: pestana.rawValue), lado: PortadaOcio.ladoRejilla)
    }

    private func recordar() {
        PreferenciasOcio.guardar(pestana.rawValue, orden: orden, filtro: filtro, plataforma: plataforma)
    }

    // ISBN y títulos de lo que ya hay de ese tipo, para que el escáner avise de los repetidos.
    private func existentes(_ tipo: String) -> Set<String> {
        var r = Set<String>()
        for e in vista?.entradas ?? [] where e.tipo == tipo {
            if !e.isbn.isEmpty { r.insert(e.isbn) }
            r.insert("t:" + LecturaOcio.normalizar(e.titulo))
        }
        return r
    }

    // La misma entrada con otra nota: valorar desde la ficha guarda igual que el editor.
    fileprivate static func datos(_ e: EntradaOcio, valoracion: Double) -> DatosEditorOcio {
        DatosEditorOcio(tipo: e.tipo, titulo: e.titulo, autor: e.autor, estado: e.estado, fechaInicio: e.fechaInicio,
                        fechaFin: e.fechaFin, anio: e.anio, valoracion: valoracion, notas: e.notas, enlace: e.enlace, portada: e.portada)
    }

    private func guardar(_ d: DatosEditorOcio, previo: EntradaOcio?) async {
        let id = previo?.id ?? OperacionBitacora.nuevoIdProyecto("ocio")
        let op = { (portada: String) in OperacionBitacora.guardarOcio(id: id, tipo: d.tipo,
            titulo: d.titulo, autor: d.autor, estado: d.estado, fechaInicio: d.fechaInicio, fechaFin: d.fechaFin,
            anio: d.anio, valoracion: String(d.valoracion), notas: d.notas, enlace: d.enlace, portada: portada) }
        var ops = [op(d.portada)]
        // 3.2: ISBN, plataforma y formato van en su propia operación (nil = no se tocan, como al valorar desde la ficha).
        if d.isbn != nil || d.plataforma != nil || d.formato != nil || d.temporadasVistas != nil || d.temporadasTotal != nil {
            ops.append(OcioDatosOp.op(id: id, isbn: d.isbn, plataforma: d.plataforma, formato: d.formato,
                                      temporadasVistas: d.temporadasVistas, temporadasTotal: d.temporadasTotal))
        }
        // Valorarla da por hecha su tarea «valorar …» (completarTareaValorarPelicula).
        if d.valoracion > 0 { ops.append(OperacionesExtra.op(ValorarOcio.completar, ["entradaId": .string(id)])) }
        do { try await c.encolar(ops); aviso = nil } catch { aviso = "no se pudo guardar en este iPhone."; return }
        // portadaAuto: sin portada, se busca sola; primero la de esa edición por ISBN y, si no, por título, autor y año.
        guard d.portada.isEmpty else { return }
        var img: String?
        if let isbn = d.isbn, !OcioDatosOp.isbnLimpio(isbn).isEmpty { img = await BuscarISBN.portada(OcioDatosOp.isbnLimpio(isbn)) }
        if img == nil {
            let r = await BuscarPortadas.buscar(c, tipo: d.tipo, q: d.tipo == "book" && !d.autor.isEmpty ? d.titulo + " " + d.autor : d.titulo,
                                                anio: d.tipo == "movie" || d.tipo == "series" ? d.anio : "")
            img = await BuscarPortadas.primeraQueCarga(BuscarPortadas.ordenadas(r, titulo: d.titulo, autor: d.tipo == "book" ? d.autor : "", anio: d.anio))
        }
        if let img { await c.guardar(OcioDatosOp.op(id: id, portadaSiFalta: img)) }
    }

    // 3.4: recomendaciones de los amigos (las mismas que en la web).
    private func cargarRecomendadas() async {
        let repo = RepositorioSocial(cliente: c.entorno.cliente, auth: c.entorno.auth)
        let r = await repo.recomendaciones()
        if r != recomendadas { recomendadas = r }
    }

    // Como anadirRecomendacionABiblioteca (js/ocio.js): entra sin empezar, con quién la recomendó en las notas.
    private func aceptar(_ r: RecomendacionOcio) async {
        let id = OperacionBitacora.nuevoIdProyecto("ocio")
        let estado = r.tipo == "book" ? "Por leer" : r.tipo == "game" ? "Por jugar" : ""
        let notas = r.nota.isEmpty ? "Recomendado por \(r.de)" : "Recomendado por \(r.de): \(r.nota)"
        let ok = await c.guardar([.guardarOcio(id: id, tipo: r.tipo, titulo: MayusculaOcio.inicial(r.titulo), autor: r.autor, estado: estado,
                                               fechaInicio: "", fechaFin: "", anio: r.anio, valoracion: "0", notas: notas, enlace: "",
                                               portada: r.portada.hasPrefix("https://") ? r.portada : "")])
        if ok { Haptica.exito(); await quitarRecomendada(r) }
    }

    private func quitarRecomendada(_ r: RecomendacionOcio) async {
        withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento)) { recomendadas.removeAll { $0.id == r.id } }
        let repo = RepositorioSocial(cliente: c.entorno.cliente, auth: c.entorno.auth)
        try? await repo.quitarRecomendacion(r.id)
    }

    // 3.2: lo que llega del escáner. Un juego entra en físico, con su plataforma, y su portada es la de Steam si la hay
    // (vertical, como las demás) o, si no, la foto del producto.
    private func anadirEscaneado(_ item: EscaneadoOcio, estado: String) async {
        let hoy = CalendarioBitacora.madrid.dia(de: Date())
        let inicio = estado == "Leyendo" || estado == "Jugando" ? String(format: "%04d-%02d-%02d", hoy.year, hoy.month, hoy.day) : ""
        guard case .libro(let l) = item else {
            guard case .juego(let j) = item else { return }
            let id = OperacionBitacora.nuevoIdProyecto("ocio")
            let titulo = MayusculaOcio.inicial(j.titulo)
            await c.guardar([.guardarOcio(id: id, tipo: "game", titulo: titulo, autor: "", estado: estado, fechaInicio: inicio,
                                          fechaFin: "", anio: "", valoracion: "0", notas: "", enlace: "", portada: ""),
                             OcioDatosOp.op(id: id, plataforma: j.plataforma.isEmpty ? nil : j.plataforma, formato: "fisico")])
            let r = await BuscarPortadas.buscar(c, tipo: "game", q: j.titulo)
            // 3.3: solo una portada que carga (la vertical de Steam no existe para todos los juegos).
            let img = await BuscarPortadas.primeraQueCarga(BuscarPortadas.ordenadas(r, titulo: j.titulo))
                ?? (j.imagen.isEmpty ? nil : j.imagen)
            if let img { await c.guardar(OcioDatosOp.op(id: id, portadaSiFalta: img)) }
            return
        }
        let id = OperacionBitacora.nuevoIdProyecto("ocio")
        await c.guardar([.guardarOcio(id: id, tipo: "book", titulo: MayusculaOcio.inicial(l.titulo), autor: MayusculaOcio.inicial(l.autor),
                                      estado: estado, fechaInicio: inicio, fechaFin: "", anio: l.anio, valoracion: "0", notas: "",
                                      enlace: "", portada: l.portada),
                         OcioDatosOp.op(id: id, isbn: l.isbn)])
        // Muchas ediciones españolas no tienen portada por ISBN: como el editor, se busca por título y autor.
        guard l.portada.isEmpty else { return }
        let r = await BuscarPortadas.buscar(c, tipo: "book", q: l.autor.isEmpty ? l.titulo : l.titulo + " " + l.autor)
        if let img = await BuscarPortadas.primeraQueCarga(BuscarPortadas.ordenadas(r, titulo: l.titulo, autor: l.autor, anio: l.anio)) {
            await c.guardar(OcioDatosOp.op(id: id, portadaSiFalta: img))
        }
    }

    // 3.2: portadas que se buscan solas al abrir Ocio; cada entrada se intenta una sola vez por iPhone. 3.4 (Alejandro
    // añadió 93 juegos de golpe): todas las que faltan, no 6 por visita, de 4 en 4 y guardando cada tanda para que se
    // vean llegar. Solo corre en la primera carga de la vista.
    private func rellenarPortadas() async {
        let clave = "ocio.portadasIntentadas"
        var intentadas = Set(UserDefaults.standard.stringArray(forKey: clave) ?? [])
        let faltan = (vista?.entradas ?? []).filter { $0.portada.isEmpty && !intentadas.contains($0.id) }
        let coordinador = c
        for inicio in stride(from: 0, to: faltan.count, by: 4) {
            guard !Task.isCancelled else { break }
            let tanda = Array(faltan[inicio..<min(inicio + 4, faltan.count)])
            let halladas: [(id: String, img: String)] = await withTaskGroup(of: (String, String?).self) { g in
                for e in tanda { g.addTask { (e.id, await Self.portadaPara(e, coordinador)) } }
                var r: [(id: String, img: String)] = []
                for await (id, img) in g { if let img { r.append((id, img)) } }
                return r
            }
            tanda.forEach { intentadas.insert($0.id) }
            UserDefaults.standard.set(Array(intentadas.suffix(4000)), forKey: clave)
            if !halladas.isEmpty { _ = await c.guardar(halladas.map { OcioDatosOp.op(id: $0.id, portadaSiFalta: $0.img) }) }
        }
    }

    nonisolated private static func portadaPara(_ e: EntradaOcio, _ c: AppCoordinator) async -> String? {
        if !e.isbn.isEmpty, let p = await BuscarISBN.portada(e.isbn) { return p }
        let r = await BuscarPortadas.buscar(c, tipo: e.tipo, q: e.tipo == "book" && !e.autor.isEmpty ? e.titulo + " " + e.autor : e.titulo,
                                            anio: e.tipo == "movie" || e.tipo == "series" ? e.anio : "")
        return await BuscarPortadas.primeraQueCarga(BuscarPortadas.ordenadas(r, titulo: e.titulo, autor: e.autor, anio: e.anio))
    }

    private func guardarLista(_ previa: ListaOcio?, _ nombre: String, _ ids: [String]) async {
        await c.guardar(.guardarListaOcio(id: previa?.id ?? OperacionBitacora.nuevoIdProyecto("clist"), nombre: nombre, entryIds: ids))
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
                try await c.encolar(.guardarOcio(id: OperacionBitacora.nuevoIdProyecto("ocio"), tipo: e.tipo, titulo: MayusculaOcio.inicial(e.titulo),
                    autor: MayusculaOcio.inicial(e.autor), estado: e.estado, fechaInicio: e.fechaInicio, fechaFin: e.fechaFin, anio: e.anio,
                    valoracion: e.valoracion, notas: e.notas, enlace: e.enlace, portada: ""))
                anadidas += 1
            }
            aviso = "\(anadidas) importados. \(salida.omitidas + salida.entradas.count - anadidas) omitidos."
            Haptica.exito()
        } catch { aviso = "no se pudo leer ese archivo."; Haptica.error() }
    }
}

private struct DatosEditorOcio {
    let tipo: String; let titulo: String; let autor: String; let estado: String; let fechaInicio: String; let fechaFin: String
    let anio: String; let valoracion: Double; let notas: String; let enlace: String; let portada: String
    var isbn: String? = nil; var plataforma: String? = nil; var formato: String? = nil
    var temporadasVistas: Int? = nil; var temporadasTotal: Int? = nil
}

// MARK: - Ficha

// La ficha de una entrada: portada grande que entra con un muelle, título, datos en chips, la nota con estrellas (se
// guarda con «guardar nota.» si cambia) y las acciones en cápsulas.
private struct FichaOcio: View {
    @Environment(\.dismiss) private var cerrar
    @Environment(\.openURL) private var abrirURL
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @Environment(AppCoordinator.self) private var c
    let entrada: EntradaOcio
    let valorar: (Double) -> Void
    let editar: () -> Void
    let eliminar: () -> Void
    let cambiarPortada: (String) -> Void
    @State private var nota: Double
    @State private var dentro = false
    @State private var confirmarBorrar = false
    // La ficha llega con la entrada de cuando se abrió: la portada nueva se ve al momento sin esperar a la recarga.
    @State private var portada: String
    @State private var cambiandoPortada = false
    @State private var recomendando = false

    init(entrada: EntradaOcio, valorar: @escaping (Double) -> Void, editar: @escaping () -> Void, eliminar: @escaping () -> Void,
         cambiarPortada: @escaping (String) -> Void) {
        self.entrada = entrada; self.valorar = valorar; self.editar = editar; self.eliminar = eliminar
        self.cambiarPortada = cambiarPortada
        _nota = State(initialValue: entrada.valoracion)
        _portada = State(initialValue: entrada.portada)
    }

    private var meta: String {
        let isbn = entrada.isbn.isEmpty ? "" : "isbn \(entrada.isbn)"
        return [entrada.autor, entrada.plataforma, BibliotecaOcio.textoFormato(entrada.formato), entrada.anio, isbn]
            .filter { !$0.isEmpty }.joined(separator: ", ")
    }
    private var enlace: URL? { entrada.enlace.isEmpty ? nil : URL(string: entrada.enlace) }
    private var cambiada: Bool { nota != entrada.valoracion }

    var body: some View {
        ScrollView {
            VStack(spacing: Medida.l) {
                HStack {
                    Spacer()
                    BotonRedondo(sistema: "xmark", tono: .sutil, etiqueta: "cerrar") { cerrar() }
                }
                PortadaOcio(url: portada, titulo: entrada.titulo, ancho: 164, radio: Medida.radioControl,
                            cinco: BibliotecaOcio.cinco(entrada))
                    .sombra(.flotante)
                    .scaleEffect(dentro || sinMovimiento ? 1 : 0.9)
                    .opacity(dentro ? 1 : 0)
                VStack(spacing: Medida.xxs) {
                    Text(MayusculaOcio.inicial(entrada.titulo) + ".").font(Letra.titulo).foregroundStyle(Lienzo.tinta).kerning(-0.4)
                        .multilineTextAlignment(.center)
                        .accessibilityAddTraits(.isHeader)
                    if !meta.isEmpty { Text(meta).font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria) }
                }
                chips
                valoracion
                if !entrada.notas.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    VStack(alignment: .leading, spacing: Medida.xs) {
                        TituloSeccionOcio(texto: "Notas.").padding(.horizontal, -Medida.xxs)
                        Text(entrada.notas).font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .tarjeta()
                }
                acciones
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.expandir, reducido: sinMovimiento), value: cambiada)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .confirmationDialog("¿eliminar «\(MayusculaOcio.inicial(entrada.titulo))»?", isPresented: $confirmarBorrar, titleVisibility: .visible) {
            Button("eliminar.", role: .destructive) { Haptica.media(); eliminar(); cerrar() }
            Button("cancelar.", role: .cancel) {}
        }
        .hoja(isPresented: $recomendando) {
            RecomendarOcioView(entrada: entrada, portada: portada).environment(c)
        }
        .hoja(isPresented: $cambiandoPortada) {
            CambiarPortadaOcio(entrada: entrada, actual: portada) { url in
                portada = url
                cambiarPortada(url)
            }
            .environment(c)
        }
        .onAppear {
            withAnimation(Muelle.o(Muelle.modal, reducido: sinMovimiento).delay(0.06)) { dentro = true }
        }
    }

    private var chips: some View {
        HStack(spacing: Medida.xxs + 2) {
            Chip(texto: LecturaOcio.nombre(entrada.tipo))
            if !entrada.estado.isEmpty {
                Chip(texto: entrada.estado.lowercased(), tono: OcioView.enCurso(entrada) ? .naranja : .sutil)
            }
            let cuando = OcioView.cuando(entrada)
            if !cuando.isEmpty { Chip(texto: cuando, tono: .blanco) }
        }
    }

    private var valoracion: some View {
        VStack(spacing: Medida.xs) {
            EstrellasOcio(valor: nota, tamano: 30) { nota = $0 }
            Text(nota == 0 ? "sin valorar. toca una estrella, o su mitad para media." : LecturaOcio.textoNota(nota))
                .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit()
                .contentTransition(.numericText())
                .animation(Muelle.rapido, value: nota)
            if cambiada {
                Button("guardar nota.") {
                    Haptica.exito()
                    valorar(nota)
                    cerrar()
                }
                .buttonStyle(.capsula(.naranja))
                .transition(.scale(scale: 0.85).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity)
        .tarjeta()
    }

    private var acciones: some View {
        VStack(spacing: Medida.xs) {
            HStack(spacing: Medida.xs) {
                Button("editar.") { editar() }.buttonStyle(.capsula(.oscuro, ancho: true))
                if let enlace {
                    Button("abrir enlace.") { abrirURL(enlace) }.buttonStyle(.capsula(.blanco, ancho: true))
                }
            }
            HStack(spacing: Medida.xs) {
                Button(portada.isEmpty ? "añadir portada." : "cambiar portada.") { cambiandoPortada = true }
                    .buttonStyle(.capsula(.blanco, ancho: true))
                Button("recomendar.") { recomendando = true }
                    .buttonStyle(.capsula(.blanco, ancho: true))
            }
            Button("eliminar.") { confirmarBorrar = true }.buttonStyle(.capsula(.claro, ancho: true))
        }
    }
}

// MARK: - Editor

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
    // 3.2: ISBN (libros), plataforma y formato (juegos).
    @State private var isbn: String; @State private var plataforma: String; @State private var formato: String
    // 3.4: series, temporadas vistas y en total.
    @State private var vistas: Int; @State private var totales: Int
    private let estadoInicial: String
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
        _isbn = State(initialValue: entrada?.isbn ?? ""); _plataforma = State(initialValue: entrada?.plataforma ?? "")
        _formato = State(initialValue: entrada?.formato ?? ""); estadoInicial = entrada?.estado ?? ""
        _vistas = State(initialValue: entrada?.temporadasVistas ?? 0); _totales = State(initialValue: entrada?.temporadasTotal ?? 0)
    }

    var body: some View {
        NavigationStack {
            FormCasa {
                Section {
                    TextField("título.", text: $titulo)
                    if tipo == "book" { TextField("autor.", text: $autor) }
                    TextField(tipo == "book" ? "año de publicación." : "año.", text: $anio).keyboardType(.numberPad)
                    if tipo == "book" {
                        TextField("isbn.", text: $isbn).keyboardType(.numberPad).font(Letra.mono)
                            .accessibilityLabel("isbn")
                    }
                }
                if tipo == "game" { seccionJuego }
                if tipo == "series" { seccionTemporadas }
                seccionPortada
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
                .environment(\.locale, Locale(identifier: "es_ES"))
                .onChange(of: estado) { _, e in if e.hasPrefix("Complet") && !conFin { conFin = true; fin = Date() } }
                .onChange(of: conFin) { _, si in if si, let completo = estados.first(where: { $0.hasPrefix("Complet") }), !estado.hasPrefix("Abandon") { estado = completo } }
                Section {
                    HStack {
                        EstrellasOcio(valor: valoracion, tamano: 30) { valoracion = $0 }
                        Spacer()
                        if valoracion > 0 {
                            Button("quitar.") { valoracion = 0 }
                                .font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
                                .buttonStyle(.pulsable(0.92))
                        }
                    }
                } header: { Text("tu nota.") } footer: {
                    Text(valoracion == 0 ? "sin valorar. toca la mitad de una estrella para media." : LecturaOcio.textoNota(valoracion))
                }
                Section("notas.") { TextEditor(text: $notas).editorCasa(alto: 90) }
                Section { TextField("enlace.", text: $enlace).keyboardType(.URL).textInputAutocapitalization(.never) }
            }
            .font(Letra.cuerpo)
            .navigationTitle(LecturaOcio.nombre(tipo) + ".")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        let i = conInicio ? Self.iso(inicio) : "", f = tipo != "movie" && conFin ? Self.iso(fin) : ""
                        guardar(.init(tipo: tipo, titulo: MayusculaOcio.inicial(titulo), autor: MayusculaOcio.inicial(autor), estado: estado, fechaInicio: i, fechaFin: f, anio: anio,
                                      valoracion: valoracion, notas: notas, enlace: enlace, portada: portada,
                                      isbn: tipo == "book" ? isbn : nil,
                                      plataforma: tipo == "game" ? MayusculaOcio.inicial(plataforma) : nil,
                                      formato: tipo == "game" ? formato : nil,
                                      temporadasVistas: tipo == "series" ? vistas : nil,
                                      temporadasTotal: tipo == "series" ? totales : nil))
                        cerrar()
                    }.disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private var seccionPortada: some View {
        Section {
            HStack(alignment: .top, spacing: Medida.m) {
                PortadaOcio(url: portada, titulo: titulo.isEmpty ? "?" : titulo, ancho: 64, radio: Medida.radioIcono)
                VStack(alignment: .leading, spacing: Medida.xs) {
                    Button(buscando ? "buscando…" : "buscar portada.") { Task { await buscar() } }
                        .buttonStyle(.capsula(.claro))
                        .disabled(buscando || titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                    if !portada.isEmpty {
                        Button("quitar.") { portada = "" }
                            .font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
                            .buttonStyle(.pulsable(0.92))
                    }
                    if sinResultados { Text("no he encontrado portadas con ese título.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if !candidatas.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 10) {
                        ForEach(candidatas) { k in
                            let elegida = portada == k.imagen
                            Button {
                                Haptica.seleccion()
                                portada = k.imagen
                                if anio.isEmpty { anio = String(k.anio.prefix(4)) }
                                if tipo == "book", autor.isEmpty { autor = k.autor }
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    PortadaOcio(url: k.imagen, titulo: k.titulo, ancho: 70)
                                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous)
                                            .strokeBorder(elegida ? Lienzo.naranja : .clear, lineWidth: 2.5))
                                        .scaleEffect(elegida ? 1 : 0.96)
                                        .animation(Muelle.toque, value: elegida)
                                    Text(MayusculaOcio.inicial(k.titulo)).font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta).lineLimit(2)
                                    if !k.anio.isEmpty { Text(k.anio).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) }
                                }
                                .frame(width: 70, alignment: .leading)
                            }
                            .buttonStyle(.pulsable(0.95))
                            .accessibilityLabel("portada de \(k.titulo)" + (k.anio.isEmpty ? "" : ", \(k.anio)") + (elegida ? ", elegida" : ""))
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            TextField("o pega la url de una imagen.", text: $portada).keyboardType(.URL).textInputAutocapitalization(.never).font(Letra.pie)
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

    // 3.2: «Por leer» y «Por jugar» para lo que está en la biblioteca sin empezar. Un estado que no está en la lista
    // (el vacío de las recomendaciones de la web) se conserva como opción para no cambiarlo sin querer.
    private var estados: [String] {
        let base: [String]
        switch tipo {
        case "book": base = ["Leyendo", "Por leer", "Completado", "Abandonado"]
        case "series": base = ["Viendo", "Por ver", "Completada", "Abandonada"]
        case "game": base = ["Jugando", "Por jugar", "Completado", "Abandonado"]
        default: base = []
        }
        return base.isEmpty || base.contains(estadoInicial) || estadoInicial.isEmpty ? base : base + [estadoInicial]
    }

    // 3.4 (petición de Alejandro): «tiene 3 temporadas pero solo vi 2». Con «abandonada» no cuenta ni como viendo ni
    // como terminada.
    private var seccionTemporadas: some View {
        Section {
            Stepper(value: $vistas, in: 0...99) {
                Text(vistas == 0 ? "temporadas vistas: sin indicar." : "temporadas vistas: \(vistas).").monospacedDigit()
            }
            Stepper(value: $totales, in: 0...99) {
                Text(totales == 0 ? "temporadas en total: sin indicar." : "temporadas en total: \(totales).").monospacedDigit()
            }
        } header: { Text("temporadas.") } footer: {
            Text("si la dejaste a medias, pon «abandonada» arriba: no saldrá ni en viendo ni en terminadas.")
        }
    }

    // Plataforma (atajos de las más comunes o escrita) y formato: físico, digital u otro.
    private var seccionJuego: some View {
        Section {
            TextField("plataforma.", text: $plataforma).textInputAutocapitalization(.words)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(PlataformasOcio.comunes, id: \.self) { p in
                        let on = LecturaOcio.normalizar(p) == LecturaOcio.normalizar(plataforma)
                        Button { Haptica.seleccion(); plataforma = on ? "" : p } label: {
                            Chip(texto: p, tono: on ? .oscuro : .sutil).frame(minHeight: Medida.toque).contentShape(Rectangle())
                        }
                        .buttonStyle(.pulsable(0.92))
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
            }
            Picker("formato.", selection: $formato) {
                Text("sin indicar.").tag("")
                ForEach(OcioDatosOp.formatos, id: \.self) { Text(BibliotecaOcio.textoFormato($0) + ".").tag($0) }
            }
            .pickerStyle(.segmented)
            .accessibilityLabel("formato")
        } header: { Text("dónde lo tienes.") }
    }
}

// MARK: - Lista

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
        NavigationStack {
            FormCasa {
                Section {
                    TextField("nombre.", text: $nombre)
                    TextField("buscar en la biblioteca.", text: $busqueda).autocorrectionDisabled()
                }
                Section {
                    ForEach(entradas.filter { busqueda.isEmpty || LecturaOcio.normalizar($0.titulo).contains(LecturaOcio.normalizar(busqueda)) }) { e in
                        let dentro = seleccion.contains(e.id)
                        Button {
                            Haptica.seleccion()
                            if dentro { seleccion.remove(e.id) } else { seleccion.insert(e.id) }
                        } label: {
                            HStack(spacing: Medida.s) {
                                PortadaOcio(url: e.portada, titulo: e.titulo, ancho: 28, radio: 6)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(MayusculaOcio.inicial(e.titulo)).font(Letra.cuerpo).foregroundStyle(Lienzo.tinta).lineLimit(1)
                                    Text(LecturaOcio.nombre(e.tipo) + ".").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                                }
                                Spacer(minLength: Medida.xs)
                                Image(systemName: dentro ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 20, weight: .semibold))
                                    .foregroundStyle(dentro ? Lienzo.tinta : Lienzo.tintaTerciaria)
                                    .contentTransition(.symbolEffect(.replace))
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.pulsable(0.98))
                        .accessibilityAddTraits(dentro ? .isSelected : [])
                    }
                } header: { Text(seleccion.count == 1 ? "1 elegido." : "\(seleccion.count) elegidos.") }
            }
            .font(Letra.cuerpo)
            .navigationTitle("lista.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") { guardar(nombre, Array(seleccion)); cerrar() }
                        .disabled(nombre.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
