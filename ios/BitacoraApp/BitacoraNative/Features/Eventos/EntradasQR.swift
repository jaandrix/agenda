import SwiftUI
import PhotosUI
import Vision
import CoreImage.CIFilterBuiltins

// Entradas con QR de un evento (abrirEntradas y procesarImagenEntrada en js/eventos.js). Se guarda el contenido del QR,
// nunca la imagen: la web descarta al guardar un evento las entradas sin `qr` ni `qrB64`, así que una imagen suelta se
// perdería en cuanto alguien editara el evento desde la web.
struct EntradaQR: Identifiable, Equatable {
    let id: String
    let datos: Data
    let etiqueta: String

    static func desde(_ x: JSONValue) -> EntradaQR? {
        // qrEntradaSvg: qrB64 son los bytes tal cual; qr, el texto en UTF-8.
        let datos = x["qrB64"]?.texto.flatMap { Data(base64Encoded: $0) } ?? x["qr"]?.texto.flatMap { $0.isEmpty ? nil : Data($0.utf8) }
        guard let datos else { return nil }
        return EntradaQR(id: x["id"]?.comoId ?? UUID().uuidString, datos: datos, etiqueta: x["etiqueta"]?.texto ?? "")
    }
}

enum LectorQR {
    // Vision primero (lee capturas giradas y con poco contraste); CIDetector como respaldo.
    static func leer(_ imagen: UIImage) -> String? {
        guard let cg = imagen.cgImage ?? CIContext().createCGImage(CIImage(image: imagen) ?? CIImage(), from: CIImage(image: imagen)?.extent ?? .zero) else { return nil }
        let peticion = VNDetectBarcodesRequest()
        peticion.symbologies = [.qr]
        try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([peticion])
        if let texto = peticion.results?.compactMap(\.payloadStringValue).first(where: { !$0.isEmpty }) { return texto }
        let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])
        return detector?.features(in: CIImage(cgImage: cg)).compactMap { ($0 as? CIQRCodeFeature)?.messageString }.first { !$0.isEmpty }
    }

    // Corrección alta (H), como la web: así la «b.» del centro tapa módulos sin que el lector de la puerta falle.
    static func imagen(_ datos: Data) -> UIImage? {
        let f = CIFilter.qrCodeGenerator()
        f.message = datos
        f.correctionLevel = "H"
        guard let img = f.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)),
              let cg = CIContext().createCGImage(img, from: img.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

// El QR con la «b.» integrada (QRMarcado): hueco limpio, placa del tema y ojos redondeados. Si el dibujo propio
// falla, el del sistema sin marca, que siempre se lee.
struct CodigoQR: View {
    let datos: Data
    var body: some View {
        if let img = QRMarcado.imagen(datos, placa: QRMarcado.colorPlaca(), letra: QRMarcado.colorLetra(), punto: UIColor(Lienzo.naranja)) ?? LectorQR.imagen(datos) {
            Image(uiImage: img).interpolation(.none).resizable().scaledToFit()
                .padding(Medida.xxs)
                .background(Lienzo.tarjeta, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous).strokeBorder(Lienzo.filo))
                .accessibilityLabel("código qr de la entrada")
        }
    }
}

// .entrada-ticket a pantalla entera: fondo blanco, brillo al máximo mientras se enseña y el de antes al cerrar.
struct EntradaPantallaCompleta: View {
    @Environment(\.dismiss) private var cerrar
    let titulo: String
    let detalle: String
    let entradas: [EntradaQR]
    @State var indice: Int
    @State private var brilloAntes: CGFloat?

    var body: some View {
        VStack(spacing: Medida.m) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Entrada.").font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
                    Text(titulo).font(Letra.titulo).kerning(-0.4).foregroundStyle(Lienzo.tinta).lineLimit(2)
                    if !detalle.isEmpty { Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) }
                }
                Spacer()
                BotonRedondo(sistema: "xmark", tono: .sutil, tamano: 36, etiqueta: "cerrar") { cerrar() }
            }
            TabView(selection: $indice) {
                ForEach(Array(entradas.enumerated()), id: \.element.id) { i, e in
                    VStack(spacing: Medida.s) {
                        CodigoQR(datos: e.datos)
                        if !e.etiqueta.isEmpty { Text(e.etiqueta).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta) }
                    }
                    .padding(.horizontal, Medida.xs)
                    .tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: entradas.count > 1 ? .always : .never))
            .indexViewStyle(.page(backgroundDisplayMode: .always))
            .onChange(of: indice) { _, _ in Haptica.seleccion() }
            if entradas.count > 1 {
                Text("\(indice + 1) de \(entradas.count)").font(Letra.hora).foregroundStyle(Lienzo.tintaSecundaria)
                    .contentTransition(.numericText())
            }
        }
        .padding(Medida.l)
        // La marca de agua, sutil: «bitácora.» grande abajo, casi del color del papel. No toca el QR.
        .background(alignment: .bottom) {
            ZStack(alignment: .bottom) {
                Lienzo.tarjeta.ignoresSafeArea()
                Text("bitácora.").font(LetraEventos.marcaAgua).kerning(-2.5)
                .foregroundStyle(Lienzo.tinta.opacity(0.035))
                .lineLimit(1).minimumScaleFactor(0.5)
                .padding(.bottom, 28)
                .accessibilityHidden(true)
            }
        }
        .preferredColorScheme(.light)
        .onAppear {
            brilloAntes = UIScreen.main.brightness
            UIScreen.main.brightness = 1
        }
        .onDisappear { if let b = brilloAntes { UIScreen.main.brightness = b } }
    }
}

// «+ añadir entrada.»: una foto o captura del carrete, o la imagen copiada.
struct AnadirEntradaQR: View {
    @Environment(AppCoordinator.self) private var c
    let eventoId: String
    var alAnadir: () -> Void
    @State private var foto: PhotosPickerItem?
    @State private var leyendo = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            HStack(spacing: Medida.xs) {
                PhotosPicker(selection: $foto, matching: .images) {
                    Label(leyendo ? "leyendo…" : "añadir entrada.", systemImage: leyendo ? "ellipsis" : "qrcode.viewfinder")
                        .contentTransition(.opacity)
                }
                .buttonStyle(.capsula(.claro, ancho: true))
                .disabled(leyendo)
                Button("pegar.") { pegar() }
                    .buttonStyle(.capsula(.claro))
                    .disabled(leyendo || !UIPasteboard.general.hasImages && !UIPasteboard.general.hasStrings)
            }
            if let error {
                Text(error).font(Letra.pie).foregroundStyle(Lienzo.negativo).padding(.horizontal, Medida.xxs)
                    .transition(.opacity)
            }
        }
        .animation(Muelle.rapido, value: error)
        .animation(Muelle.rapido, value: leyendo)
        .onChange(of: foto) { _, item in
            guard let item else { return }
            leyendo = true
            Task {
                let datos = try? await item.loadTransferable(type: Data.self)
                foto = nil
                await guardar(datos.flatMap(UIImage.init(data:)).flatMap(LectorQR.leer))
            }
        }
    }

    private func pegar() {
        leyendo = true
        let pb = UIPasteboard.general
        let texto = pb.image.flatMap(LectorQR.leer) ?? (pb.hasImages ? nil : pb.string?.trimmingCharacters(in: .whitespacesAndNewlines))
        Task { await guardar(texto) }
    }

    private func guardar(_ texto: String?) async {
        defer { leyendo = false }
        guard let texto, !texto.isEmpty else { error = "no he encontrado ningún qr en esa imagen."; return }
        do {
            try await c.encolar(OperacionesExtra.op(OperacionesExtra.entradaQR, [
                "eventoId": .string(eventoId), "id": .string("ent_\(Int64(Date().timeIntervalSince1970 * 1000))"),
                "qr": .string(texto), "etiqueta": .string("")]))
            error = nil
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            alAnadir()
        } catch {
            self.error = "no se pudo guardar en este iphone."
        }
    }
}
