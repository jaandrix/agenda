import SwiftUI
import UIKit
import VisionKit
import Vision

// 3.2: escáner de ISBN, como Libib. La cámara lee el código de barras de la contraportada (EAN-13 que empieza por 978 o
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
        let titulo = a?.titulo ?? b?.titulo ?? ""
        guard !titulo.isEmpty else { return nil }
        var portada = a?.portada ?? ""
        if portada.isEmpty { portada = b?.portada ?? "" }
        if portada.isEmpty { portada = await portadaPorISBN(isbn) ?? "" }
        let autor = (a?.autor).flatMap { $0.isEmpty ? nil : $0 } ?? b?.autor ?? ""
        let anio = (a?.anio).flatMap { $0.isEmpty ? nil : $0 } ?? b?.anio ?? ""
        return LibroISBN(isbn: isbn, titulo: titulo, autor: autor, anio: anio, portada: portada)
    }

    // Solo la portada de esa edición (al guardar un libro con ISBN y sin portada): Open Library y, si no, Google Books.
    static func portada(_ isbn: String) async -> String? {
        if let p = await portadaPorISBN(isbn) { return p }
        let g = await googleBooks(isbn)?.portada ?? ""
        return g.isEmpty ? nil : g
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

// La cámara de VisionKit leyendo códigos de barras. `activo` la pausa mientras se busca o se enseña el libro.
@MainActor
struct CamaraISBNOcio: UIViewControllerRepresentable {
    let activo: Bool
    let leido: (String) -> Void

    @MainActor static var disponible: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }
    @MainActor static var compatible: Bool { DataScannerViewController.isSupported }

    func makeCoordinator() -> Coordinador { Coordinador(leido: leido) }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.ean13])],
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
        case encontrado(LibroISBN)
        case noEncontrado(String)
    }

    @Environment(\.dismiss) private var cerrar
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @AppStorage("ocio.escanerVisto") private var visto = false
    let existentes: Set<String>
    let anadir: (LibroISBN, String) -> Void

    @State private var paso: Paso = .escaneando
    @State private var estado = "Por leer"
    @State private var manual = ""
    @State private var anadidos = 0
    @State private var aviso: String?
    @FocusState private var escribiendo: Bool

    private let estados = [("Por leer", "por leer."), ("Leyendo", "leyendo."), ("Completado", "leído.")]

    var body: some View {
        ZStack {
            Lienzo.oscuro.ignoresSafeArea()
            if visto && CamaraISBNOcio.disponible {
                CamaraISBNOcio(activo: paso == .escaneando && !escribiendo) { leido($0) }
                    .ignoresSafeArea()
                    .accessibilityLabel("cámara. apunta al código de barras de la contraportada.")
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
                Text("Escanea tus libros.").font(Letra.titulo).foregroundStyle(Lienzo.tinta)
                    .accessibilityAddTraits(.isHeader)
                Text("apunta la cámara al código de barras de la contraportada. buscamos esa edición y la añadimos a tu biblioteca con su portada.")
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
            case .buscando(let isbn):
                HStack(spacing: Medida.s) {
                    ProgressView().tint(Lienzo.tintaTerciaria)
                    Text("buscando \(isbn)…").font(Letra.cuerpo).foregroundStyle(Lienzo.tinta).monospacedDigit()
                }
                .frame(minHeight: Medida.toque)
            case .encontrado(let libro):
                encontrado(libro)
            case .noEncontrado(let isbn):
                Text("no encuentro el \(isbn).").font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                Text("puedes añadirlo a mano con el +, o probar con otro.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                Button("escanear otro.") { seguir() }.buttonStyle(.capsula(.oscuro, ancho: true))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjeta()
    }

    private var textoSinCamara: String {
        CamaraISBNOcio.compatible
            ? "la cámara no está disponible. permite el acceso en ajustes, o escribe el isbn."
            : "este iPhone no puede leer códigos con la cámara. escribe el isbn."
    }

    private var campoManual: some View {
        HStack(spacing: Medida.xs) {
            TextField("o escribe el isbn.", text: $manual)
                .keyboardType(.numberPad)
                .font(Letra.cuerpo)
                .focused($escribiendo)
                .padding(.horizontal, Medida.s)
                .frame(minHeight: Medida.alturaControl)
                .background(Lienzo.sutil, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
                .accessibilityLabel("isbn")
            Button("buscar.") {
                escribiendo = false
                let limpio = OcioDatosOp.isbnLimpio(manual)
                if limpio.isEmpty { aviso = "un isbn tiene 10 o 13 cifras."; Haptica.error() } else { manual = ""; Task { await buscar(limpio) } }
            }
            .buttonStyle(.capsula(.oscuro))
            .disabled(manual.filter(\.isNumber).count < 10)
        }
    }

    private func encontrado(_ libro: LibroISBN) -> some View {
        let repetido = existentes.contains(libro.isbn) || existentes.contains("t:" + LecturaOcio.normalizar(libro.titulo))
        return VStack(alignment: .leading, spacing: Medida.s) {
            HStack(alignment: .top, spacing: Medida.s) {
                PortadaOcio(url: libro.portada, titulo: libro.titulo, ancho: 58, radio: Medida.radioIcono)
                VStack(alignment: .leading, spacing: 2) {
                    Text(MayusculaOcio.inicial(libro.titulo)).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta).lineLimit(3)
                    if !libro.autor.isEmpty { Text(libro.autor).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1) }
                    Text([libro.anio, "isbn \(libro.isbn)"].filter { !$0.isEmpty }.joined(separator: ", "))
                        .font(Letra.pie).foregroundStyle(Lienzo.tintaTerciaria).monospacedDigit()
                    if repetido { Chip(texto: "ya está en tu biblioteca.", tono: .naranja).padding(.top, Medida.xxs) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .accessibilityElement(children: .combine)
            ChipsEleccion(opciones: estados.map { (valor: $0.0, titulo: $0.1) }, elegido: $estado)
            HStack(spacing: Medida.xs) {
                Button("otro.") { seguir() }.buttonStyle(.capsula(.claro, ancho: true))
                Button("añadir.") {
                    Haptica.exito()
                    anadir(libro, estado)
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
        guard let isbn = BuscarISBN.deCodigo(codigo) else {
            if aviso == nil { aviso = "ese código no es de un libro."; Haptica.tope() }
            return
        }
        Haptica.media()
        Task { await buscar(isbn) }
    }

    private func buscar(_ isbn: String) async {
        aviso = nil
        paso = .buscando(isbn)
        if let libro = await BuscarISBN.buscar(isbn) { paso = .encontrado(libro); Haptica.ligera() }
        else { paso = .noEncontrado(isbn); Haptica.error() }
    }

    private func seguir() {
        aviso = nil
        paso = .escaneando
    }
}
