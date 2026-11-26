import SwiftUI
import UIKit
import VisionKit
import Vision

// 3.2: escáner de ISBN, como Libib (y de cajas de videojuegos: ver BuscarJuegoEAN). La cámara lee el código de barras de la contraportada (EAN-13 que empieza por 978 o
// 979), se busca esa edición en Open Library y Google Books (las dos sin clave, desde el iPhone; solo viaja el ISBN) y
// se añade el libro con su portada. Sin cámara compatible (DataScannerViewController pide un A12 o posterior) o sin
// permiso, se puede escribir el ISBN a mano.

struct LibroISBN: Equatable {
    let isbn: String
    let titulo: String
    let autor: String
    let anio: String
    let portada: String
}

enum BuscarISBN {
    private static let sesion: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 10
        c.httpAdditionalHeaders = ["User-Agent": "Bitacora/1.0 (iOS)"]
        return URLSession(configuration: c)
    }()

    // El ISBN de un código de barras: 13 cifras que empiezan por 978 o 979.
    static func deCodigo(_ codigo: String) -> String? {
        let s = codigo.filter(\.isNumber)
        guard s.count == 13, s.hasPrefix("978") || s.hasPrefix("979") else { return nil }
        return s
    }

    static func buscar(_ isbn: String) async -> LibroISBN? {
        async let ol = openLibrary(isbn)
        async let gb = googleBooks(isbn)
        let a = await ol, b = await gb
        var titulo = a?.titulo ?? b?.titulo ?? ""
        // 3.4: si ni Open Library ni Google Books conocen el ISBN (pasa con novedades), Apple Books.
        var apple: CandidataPortada?
        if titulo.isEmpty, let x = await PortadasApple.libroPorISBN(isbn) { apple = x; titulo = x.titulo }
        guard !titulo.isEmpty else { return nil }
        if let apple { return LibroISBN(isbn: isbn, titulo: titulo, autor: apple.autor, anio: apple.anio, portada: apple.imagen) }
        var portada = a?.portada ?? ""
        if portada.isEmpty { portada = b?.portada ?? "" }
        if portada.isEmpty { portada = await portadaPorISBN(isbn) ?? "" }
        // 3.4: los libros recientes a menudo solo tienen portada en Apple Books.
        if portada.isEmpty { portada = await PortadasApple.porISBN(isbn) ?? "" }
        let autor = (a?.autor).flatMap { $0.isEmpty ? nil : $0 } ?? b?.autor ?? ""
        let anio = (a?.anio).flatMap { $0.isEmpty ? nil : $0 } ?? b?.anio ?? ""
        return LibroISBN(isbn: isbn, titulo: titulo, autor: autor, anio: anio, portada: portada)
    }

    // Solo la portada de esa edición (al guardar un libro con ISBN y sin portada): Open Library y, si no, Google Books.
    static func portada(_ isbn: String) async -> String? {
        if let p = await portadaPorISBN(isbn) { return p }
        let g = await googleBooks(isbn)?.portada ?? ""
        if !g.isEmpty { return g }
        return await PortadasApple.porISBN(isbn)
    }

    static func anio(_ texto: String) -> String {
        guard let r = texto.range(of: #"\d{4}"#, options: .regularExpression) else { return "" }
        return String(texto[r])
    }

    private static func json(_ url: URL) async -> [String: Any]? {
        guard let res = try? await sesion.data(from: url), (res.1 as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return (try? JSONSerialization.jsonObject(with: res.0)) as? [String: Any]
    }

    private static func openLibrary(_ isbn: String) async -> LibroISBN? {
        guard let url = URL(string: "https://openlibrary.org/api/books?bibkeys=ISBN:\(isbn)&format=json&jscmd=data"),
              let d = await json(url)?["ISBN:\(isbn)"] as? [String: Any],
              let titulo = d["title"] as? String, !titulo.isEmpty else { return nil }
        let autor = ((d["authors"] as? [[String: Any]])?.first?["name"] as? String) ?? ""
        let cubierta = d["cover"] as? [String: Any]
        let img = (cubierta?["large"] as? String) ?? (cubierta?["medium"] as? String) ?? ""
        return LibroISBN(isbn: isbn, titulo: titulo, autor: autor, anio: anio((d["publish_date"] as? String) ?? ""),
                         portada: img.replacingOccurrences(of: "http://", with: "https://"))
    }

    private static func googleBooks(_ isbn: String) async -> LibroISBN? {
        guard let url = URL(string: "https://www.googleapis.com/books/v1/volumes?q=isbn:\(isbn)&maxResults=1"),
              let item = (await json(url)?["items"] as? [[String: Any]])?.first,
              let v = item["volumeInfo"] as? [String: Any], let titulo = v["title"] as? String, !titulo.isEmpty else { return nil }
        let enlaces = v["imageLinks"] as? [String: Any]
        // Como la función `portadas`: https, zoom=2 (más grande) y sin la esquina doblada.
        let img = ((enlaces?["thumbnail"] as? String) ?? (enlaces?["smallThumbnail"] as? String) ?? "")
            .replacingOccurrences(of: "http://", with: "https://").replacingOccurrences(of: "zoom=1", with: "zoom=2")
            .replacingOccurrences(of: "&edge=curl", with: "")
        return LibroISBN(isbn: isbn, titulo: titulo, autor: ((v["authors"] as? [String])?.first) ?? "",
                         anio: anio((v["publishedDate"] as? String) ?? ""), portada: img)
    }

    // covers.openlibrary.org responde 404 con `default=false` si no tiene esa portada (sin él, da un píxel vacío).
    private static func portadaPorISBN(_ isbn: String) async -> String? {
        let texto = "https://covers.openlibrary.org/b/isbn/\(isbn)-L.jpg"
        guard let url = URL(string: texto + "?default=false") else { return nil }
        var p = URLRequest(url: url)
        p.httpMethod = "HEAD"
        guard let res = try? await sesion.data(for: p), (res.1 as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return texto
    }
}

// 3.2: cajas de videojuegos. Su código es un EAN de producto (no un ISBN), así que se busca en UPCitemdb (su API de
// prueba, sin clave y con unas 100 consultas al día; solo viaja el código). De ahí salen el título y la plataforma; la
// portada se busca luego en la función `portadas` y, si no hay, se usa la foto del producto.
struct JuegoEAN: Equatable {
    let ean: String
    let titulo: String
    let plataforma: String
    let imagen: String
}

enum BuscarJuegoEAN {
    private static let sesion: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 10
        c.httpAdditionalHeaders = ["User-Agent": "Bitacora/1.0 (iOS)", "Accept": "application/json"]
        return URLSession(configuration: c)
    }()

    // EAN-13, UPC-A (12) o EAN-8 que no sea de libro.
    static func deCodigo(_ codigo: String) -> String? {
        let s = codigo.filter(\.isNumber)
        guard [8, 12, 13].contains(s.count), BuscarISBN.deCodigo(s) == nil else { return nil }
        return s
    }

    static func buscar(_ ean: String) async -> JuegoEAN? {
        guard let url = URL(string: "https://api.upcitemdb.com/prod/trial/lookup?upc=\(ean)"),
              let res = try? await sesion.data(from: url), (res.1 as? HTTPURLResponse)?.statusCode == 200,
              let j = (try? JSONSerialization.jsonObject(with: res.0)) as? [String: Any],
              let item = (j["items"] as? [[String: Any]])?.first,
              let crudo = item["title"] as? String else { return nil }
        let titulo = limpiar(crudo)
        guard !titulo.isEmpty else { return nil }
        let imagen = ((item["images"] as? [String]) ?? [])
            .map { $0.replacingOccurrences(of: "http://", with: "https://") }
            .first { $0.hasPrefix("https://") } ?? ""
        return JuegoEAN(ean: ean, titulo: titulo, plataforma: plataforma(de: crudo), imagen: imagen)
    }

    // Los nombres de plataforma que usa el filtro de la biblioteca. El orden importa: «switch 2» antes que «switch».
    private static let plataformas: [(nombre: String, patron: String)] = [
        ("Switch 2", #"switch\s*2"#), ("Switch", #"\bswitch\b"#),
        ("3DS", #"\b(new\s*)?(nintendo\s*)?[23]ds\b|\b3ds\b"#), ("NDS", #"\bn?ds\b|nintendo\s*ds\b"#),
        ("PS5", #"\bps\s*5\b|playstation\s*5"#), ("PS4", #"\bps\s*4\b|playstation\s*4"#),
        ("PS3", #"\bps\s*3\b|playstation\s*3"#), ("PS2", #"\bps\s*2\b|playstation\s*2"#),
        ("PS1", #"\bps\s*1\b|\bpsx\b|\bpsone\b|playstation\s*1\b|playstation\s*(?!\s*\d)"#),
        ("Xbox Series", #"xbox\s*series"#), ("Xbox One", #"xbox\s*one"#), ("Xbox 360", #"xbox\s*360"#),
        ("PC", #"\bpc\b|windows|cd-?rom"#)
    ]

    static func plataforma(de texto: String) -> String {
        plataformas.first { texto.range(of: $0.patron, options: [.regularExpression, .caseInsensitive]) != nil }?.nombre ?? ""
    }

    // «Nintendo Switch - Mario Kart 8 Deluxe (Videojuego) [PEGI 3]» → «Mario Kart 8 Deluxe».
    static func limpiar(_ texto: String) -> String {
        var t = texto.replacingOccurrences(of: #"\([^)]*\)|\[[^\]]*\]"#, with: " ", options: .regularExpression)
        let ruido = [#"nintendo\s*switch(\s*2)?"#, #"\bswitch(\s*2)?\b"#, #"\b(new\s*)?(nintendo\s*)?[23]?ds\b"#,
                     #"(sony\s*)?playstation(\s*\d)?"#, #"\bps\s*\d\b|\bpsx\b|\bpsone\b"#,
                     #"(microsoft\s*)?xbox(\s*(series\s*[xs](\s*[|/]\s*[xs])?|one|360))?"#, #"\bpc(\s*(dvd|cd)(-rom)?)?\b"#,
                     #"\b(videojuego|video\s*game|pegi\s*\d+)\b"#, #"\b(nintendo|sony|microsoft)\b"#]
        for r in ruido { t = t.replacingOccurrences(of: r, with: " ", options: [.regularExpression, .caseInsensitive]) }
        t = t.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        // Separadores que se quedan colgando o repetidos al quitar la plataforma.
        t = t.replacingOccurrences(of: #"\s*[-–|,:/](\s*[-–|,:/])+"#, with: " -", options: .regularExpression)
        return t.trimmingCharacters(in: CharacterSet(charactersIn: "-–|,:/").union(.whitespaces))
    }
}

// Lo que encuentra el escáner, libro o juego, para pintarlo igual en la tarjeta.
enum EscaneadoOcio: Equatable {
    case libro(LibroISBN)
    case juego(JuegoEAN)

    var codigo: String { switch self { case .libro(let l): return l.isbn; case .juego(let j): return j.ean } }
    var titulo: String { switch self { case .libro(let l): return l.titulo; case .juego(let j): return j.titulo } }
    var detalle: String { switch self { case .libro(let l): return l.autor; case .juego(let j): return j.plataforma } }
    var portada: String { switch self { case .libro(let l): return l.portada; case .juego(let j): return j.imagen } }
    var pie: String {
        switch self {
        case .libro(let l): return [l.anio, "isbn \(l.isbn)"].filter { !$0.isEmpty }.joined(separator: ", ")
        case .juego(let j): return "código \(j.ean)"
        }
    }
}

// La cámara de VisionKit leyendo códigos de barras. `activo` la pausa mientras se busca o se enseña el libro.
@MainActor
struct CamaraISBNOcio: UIViewControllerRepresentable {
    let activo: Bool
    let leido: (String) -> Void

    @MainActor static var disponible: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }
    @MainActor static var compatible: Bool { DataScannerViewController.isSupported }

    func makeCoordinator() -> Coordinador { Coordinador(leido: leido) }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce])],
                                           qualityLevel: .balanced, recognizesMultipleItems: false,
                                           isHighFrameRateTrackingEnabled: false, isPinchToZoomEnabled: true,
                                           isGuidanceEnabled: false, isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        // Antes de estar en pantalla, startScanning falla sin avisar: se reintenta en la siguiente vuelta.
        let arrancar = activo
        Task { @MainActor in if arrancar, !vc.isScanning { try? vc.startScanning() } }
        return vc
    }

    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {
        context.coordinator.leido = leido
        if activo, !vc.isScanning { try? vc.startScanning() }
        if !activo, vc.isScanning { vc.stopScanning() }
    }

    static func dismantleUIViewController(_ vc: DataScannerViewController, coordinator: Coordinador) {
        vc.stopScanning()
    }

    @MainActor final class Coordinador: NSObject, DataScannerViewControllerDelegate {
        var leido: (String) -> Void
        init(leido: @escaping (String) -> Void) { self.leido = leido }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            for item in addedItems {
                if case .barcode(let b) = item, let texto = b.payloadStringValue { leido(texto); return }
            }
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) {
            if case .barcode(let b) = item, let texto = b.payloadStringValue { leido(texto) }
        }
    }
}

// La hoja del escáner: la primera vez, un aviso centrado que explica qué hace; luego la cámara con un marco y, abajo,
// una tarjeta con lo que va pasando (buscando, el libro encontrado con «añadir.», o que no se encontró).
@MainActor
struct HojaEscanerOcio: View {
    enum Paso: Equatable {
        case escaneando
        case buscando(String)
        case encontrado(EscaneadoOcio)
        case noEncontrado(String)
    }

    @Environment(\.dismiss) private var cerrar
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @AppStorage private var visto: Bool
    /// "book" o "game".
    let tipo: String
    let existentes: Set<String>
    let anadir: (EscaneadoOcio, String) -> Void

    @State private var paso: Paso = .escaneando
    @State private var estado: String
    // 3.4: la plataforma del juego (la que se adivina del producto, o la que se toque) y el título a mano si el código
    // no aparece en el catálogo.
    @State private var plataforma = ""
    @State private var tituloAMano = ""
    @State private var manual = ""
    @State private var anadidos = 0
    @State private var aviso: String?
    @FocusState private var escribiendo: Bool

    init(tipo: String = "book", existentes: Set<String>, anadir: @escaping (EscaneadoOcio, String) -> Void) {
        self.tipo = tipo
        self.existentes = existentes
        self.anadir = anadir
        _visto = AppStorage(wrappedValue: false, tipo == "game" ? "ocio.escanerJuegosVisto" : "ocio.escanerVisto")
        _estado = State(initialValue: tipo == "game" ? "Por jugar" : "Por leer")
        _modoJuego = State(initialValue: tipo == "game")
    }

    // 3.4 (Alejandro escaneaba cajas de juegos desde Libros y no las aceptaba): un solo escáner para los dos. Empieza en
    // el modo de la pestaña y cambia solo según el código: un ISBN (978/979) es un libro; otro EAN, UPC o EAN-8, un juego.
    @State private var modoJuego: Bool
    private var esJuego: Bool { modoJuego }
    private var estados: [(String, String)] {
        esJuego ? [("Por jugar", "por jugar."), ("Jugando", "jugando."), ("Completado", "completado.")]
                : [("Por leer", "por leer."), ("Leyendo", "leyendo."), ("Completado", "leído.")]
    }

    var body: some View {
        ZStack {
            Lienzo.oscuro.ignoresSafeArea()
            if visto && CamaraISBNOcio.disponible {
                CamaraISBNOcio(activo: paso == .escaneando && !escribiendo) { leido($0) }
                    .ignoresSafeArea()
                    .accessibilityLabel(esJuego ? "cámara. apunta al código de barras de la caja." : "cámara. apunta al código de barras de la contraportada.")
                marco
            }
            VStack(spacing: Medida.s) {
                barraArriba
                Spacer()
                if visto { tarjeta.transition(.move(edge: .bottom).combined(with: .opacity)) }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.vertical, Medida.s)
            if !visto { presentacion.transition(.scale(scale: 0.92).combined(with: .opacity)) }
        }
        .animation(Muelle.o(Muelle.modal, reducido: sinMovimiento), value: visto)
        .animation(Muelle.o(Muelle.expandir, reducido: sinMovimiento), value: paso)
        .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: aviso)
    }

    // MARK: - Partes

    private var barraArriba: some View {
        HStack {
            if anadidos > 0 {
                Text(anadidos == 1 ? "1 añadido." : "\(anadidos) añadidos.")
                    .font(Letra.pieFuerte).foregroundStyle(Lienzo.sobreOscuro)
                    .padding(.horizontal, Medida.s).frame(minHeight: 32)
                    .background(Lienzo.oscuroElevado, in: Capsule())
                    .contentTransition(.numericText())
            }
            Spacer()
            BotonRedondo(sistema: "xmark", tono: .blanco, etiqueta: "cerrar el escáner") { cerrar() }
        }
    }

    private var marco: some View {
        RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous)
            .strokeBorder(paso == .escaneando ? Lienzo.naranja : Lienzo.sobreOscuroTenue, lineWidth: 3)
            .frame(width: 260, height: 140)
            .offset(y: -60)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    private var presentacion: some View {
        VStack(spacing: Medida.m) {
            Image(systemName: "barcode.viewfinder")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(Lienzo.sobreNaranja)
                .frame(width: 72, height: 72)
                .background(Lienzo.naranja, in: RoundedRectangle(cornerRadius: Medida.radioControl + 6, style: .continuous))
                .accessibilityHidden(true)
            VStack(spacing: Medida.xxs) {
                Text(esJuego ? "Escanea tus juegos." : "Escanea tus libros.").font(Letra.titulo).foregroundStyle(Lienzo.tinta)
                    .accessibilityAddTraits(.isHeader)
                Text(esJuego ? "apunta la cámara al código de barras de la caja. buscamos el juego y su plataforma y lo añadimos a tu biblioteca, en físico."
                             : "apunta la cámara al código de barras de la contraportada. buscamos esa edición y la añadimos a tu biblioteca con su portada.")
                    .font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: Medida.xs) {
                pasoMini("1", "apunta.")
                pasoMini("2", "lo buscamos.")
                pasoMini("3", "añádelo.")
            }
            Button("empezar.") { Haptica.media(); visto = true }
                .buttonStyle(.capsula(.naranja, ancho: true))
            Button("ahora no.") { cerrar() }
                .font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
                .frame(minHeight: Medida.toque)
                .buttonStyle(.pulsable(0.94))
        }
        .padding(Medida.xl)
        .frame(maxWidth: 340)
        .background(Lienzo.tarjeta, in: RoundedRectangle(cornerRadius: Medida.radioModal, style: .continuous))
        .sombra(.flotante)
        .padding(.horizontal, Medida.margen)
    }

    private func pasoMini(_ n: String, _ texto: String) -> some View {
        VStack(spacing: Medida.xxs) {
            Text(n).font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta).monospacedDigit()
                .frame(width: 26, height: 26).background(Lienzo.sutil, in: Circle())
            Text(texto).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var tarjeta: some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            switch paso {
            case .escaneando:
                Text(CamaraISBNOcio.disponible ? "apunta al código de barras." : textoSinCamara)
                    .font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                    .fixedSize(horizontal: false, vertical: true)
                if let aviso { Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) }
                campoManual
            case .buscando(let codigo):
                HStack(spacing: Medida.s) {
                    ProgressView().tint(Lienzo.tintaTerciaria)
                    Text("buscando \(codigo)…").font(Letra.cuerpo).foregroundStyle(Lienzo.tinta).monospacedDigit()
                }
                .frame(minHeight: Medida.toque)
            case .encontrado(let item):
                encontrado(item)
            case .noEncontrado(let codigo):
                Text(esJuego ? "no encuentro el juego \(codigo)." : "no encuentro el \(codigo).").font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                Text("escribe el título y lo añadimos con su portada, o prueba con otro.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                HStack(spacing: Medida.xs) {
                    TextField(esJuego ? "título del juego." : "título del libro.", text: $tituloAMano)
                        .font(Letra.cuerpo)
                        .focused($escribiendo)
                        .submitLabel(.done)
                        .padding(.horizontal, Medida.s)
                        .frame(minHeight: Medida.alturaControl)
                        .background(Lienzo.sutil, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
                    Button("seguir.") { porTitulo(codigo) }
                        .buttonStyle(.capsula(.oscuro))
                        .disabled(tituloAMano.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                Button("escanear otro.") { seguir() }.buttonStyle(.capsula(.claro, ancho: true))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjeta()
    }

    private var textoSinCamara: String {
        CamaraISBNOcio.compatible
            ? "la cámara no está disponible. permite el acceso en ajustes, o escribe \(esJuego ? "el código" : "el isbn")."
            : "este iPhone no puede leer códigos con la cámara. escribe \(esJuego ? "el código" : "el isbn")."
    }

    private var campoManual: some View {
        HStack(spacing: Medida.xs) {
            TextField(esJuego ? "o escribe el código." : "o escribe el isbn.", text: $manual)
                .keyboardType(.numberPad)
                .font(Letra.cuerpo)
                .focused($escribiendo)
                .padding(.horizontal, Medida.s)
                .frame(minHeight: Medida.alturaControl)
                .background(Lienzo.sutil, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
                .accessibilityLabel(esJuego ? "código de barras" : "isbn")
            Button("buscar.") {
                escribiendo = false
                // Como con la cámara: un ISBN es un libro y cualquier otro código de producto, un juego.
                let limpio = OcioDatosOp.isbnLimpio(manual)
                if BuscarISBN.deCodigo(manual) != nil || limpio.count == 10 {
                    cambiarModo(juego: false); manual = ""; Task { await buscar(limpio) }
                } else if let ean = BuscarJuegoEAN.deCodigo(manual) {
                    cambiarModo(juego: true); manual = ""; Task { await buscar(ean) }
                } else {
                    aviso = "un código de barras tiene 8, 10, 12 o 13 cifras."; Haptica.error()
                }
            }
            .buttonStyle(.capsula(.oscuro))
            .disabled(manual.filter(\.isNumber).count < 8)
        }
    }

    private func encontrado(_ item: EscaneadoOcio) -> some View {
        let repetido = existentes.contains(item.codigo) || existentes.contains("t:" + LecturaOcio.normalizar(item.titulo))
        return VStack(alignment: .leading, spacing: Medida.s) {
            HStack(alignment: .top, spacing: Medida.s) {
                PortadaOcio(url: item.portada, titulo: item.titulo, ancho: 58, radio: Medida.radioIcono)
                VStack(alignment: .leading, spacing: 2) {
                    Text(MayusculaOcio.inicial(item.titulo)).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta).lineLimit(3)
                    if !item.detalle.isEmpty { Text(item.detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1) }
                    Text(item.pie)
                        .font(Letra.pie).foregroundStyle(Lienzo.tintaTerciaria).monospacedDigit()
                    if repetido { Chip(texto: "ya está en tu biblioteca.", tono: .naranja).padding(.top, Medida.xxs) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .accessibilityElement(children: .combine)
            ChipsEleccion(opciones: estados.map { (valor: $0.0, titulo: $0.1) }, elegido: $estado)
            if case .juego = item {
                ChipsEleccion(opciones: [(valor: "", titulo: "sin plataforma.")] + PlataformasOcio.comunes.map { (valor: $0, titulo: $0) },
                              elegido: $plataforma)
            }
            HStack(spacing: Medida.xs) {
                Button("otro.") { seguir() }.buttonStyle(.capsula(.claro, ancho: true))
                Button("añadir.") {
                    Haptica.exito()
                    if case .juego(let j) = item {
                        anadir(.juego(JuegoEAN(ean: j.ean, titulo: j.titulo, plataforma: plataforma, imagen: j.imagen)), estado)
                    } else {
                        anadir(item, estado)
                    }
                    anadidos += 1
                    seguir()
                }
                .buttonStyle(.capsula(.naranja, ancho: true))
            }
        }
    }

    // MARK: - Lógica

    private func leido(_ codigo: String) {
        guard paso == .escaneando else { return }
        if let _ = BuscarISBN.deCodigo(codigo) { cambiarModo(juego: false) }
        else if let _ = BuscarJuegoEAN.deCodigo(codigo) { cambiarModo(juego: true) }
        let valido = esJuego ? BuscarJuegoEAN.deCodigo(codigo) : BuscarISBN.deCodigo(codigo)
        guard let valido else {
            if aviso == nil { aviso = esJuego ? "ese código es de un libro." : "ese código no es de un libro."; Haptica.tope() }
            return
        }
        Haptica.media()
        Task { await buscar(valido) }
    }

    private func cambiarModo(juego: Bool) {
        guard modoJuego != juego else { return }
        modoJuego = juego
        estado = juego ? "Por jugar" : "Por leer"
    }

    private func buscar(_ codigo: String) async {
        aviso = nil
        paso = .buscando(codigo)
        let item: EscaneadoOcio?
        if esJuego { item = await BuscarJuegoEAN.buscar(codigo).map(EscaneadoOcio.juego) }
        else { item = await BuscarISBN.buscar(codigo).map(EscaneadoOcio.libro) }
        if case .juego(let j) = item { plataforma = j.plataforma }
        if let item { paso = .encontrado(item); Haptica.ligera() }
        else { tituloAMano = ""; paso = .noEncontrado(codigo); Haptica.error() }
    }

    // El código no está en el catálogo: con el título que se escribe, la portada se busca al añadir (como en el editor).
    private func porTitulo(_ codigo: String) {
        let t = tituloAMano.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        escribiendo = false
        plataforma = ""
        paso = .encontrado(esJuego ? .juego(JuegoEAN(ean: codigo, titulo: t, plataforma: "", imagen: ""))
                                   : .libro(LibroISBN(isbn: codigo, titulo: t, autor: "", anio: "", portada: "")))
    }

    private func seguir() {
        aviso = nil
        paso = .escaneando
    }
}
