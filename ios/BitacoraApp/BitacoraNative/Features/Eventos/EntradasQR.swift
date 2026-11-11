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

// El QR con la marca de agua de Bitácora en el centro (la «b.» de qrEntradaSvg).
struct CodigoQR: View {
    let datos: Data
    var body: some View {
        if let img = LectorQR.imagen(datos) {
            Image(uiImage: img).interpolation(.none).resizable().scaledToFit()
                .overlay {
                    GeometryReader { g in
                        let lado = g.size.width * 0.2
                        ZStack {
                            RoundedRectangle(cornerRadius: lado * 0.21, style: .continuous).fill(Color(red: 0.188, green: 0.184, blue: 0.173))
                            HStack(alignment: .lastTextBaseline, spacing: 0) {
                                Text("b").font(.system(size: lado * 0.72, weight: .heavy, design: .rounded)).foregroundStyle(Color(red: 0.937, green: 0.929, blue: 0.89))
                                Circle().fill(Color(red: 0.898, green: 0.353, blue: 0.169)).frame(width: lado * 0.17, height: lado * 0.17)
                            }
                        }
                        .frame(width: lado, height: lado)
                        .position(x: g.size.width / 2, y: g.size.height / 2)
                    }
                }
                .padding(18)
                .background(Color.white, in: RoundedRectangle(cornerRadius: Radio.control))
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
        VStack(spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("entrada.").font(Tipo.pie).foregroundStyle(.black.opacity(0.55))
                    Text(titulo).font(Tipo.poppins(22, .bold, estilo: .title2)).foregroundStyle(.black).lineLimit(2)
                    if !detalle.isEmpty { Text(detalle).font(Tipo.pie).foregroundStyle(.black.opacity(0.6)) }
                }
                Spacer()
                Button { cerrar() } label: { Image(systemName: "xmark").font(.system(size: 17, weight: .semibold)).frame(width: 44, height: 44) }
                    .foregroundStyle(.black).accessibilityLabel("cerrar")
            }
            TabView(selection: $indice) {
                ForEach(Array(entradas.enumerated()), id: \.element.id) { i, e in
                    VStack(spacing: 12) {
                        CodigoQR(datos: e.datos)
                        if !e.etiqueta.isEmpty { Text(e.etiqueta).font(Tipo.cuerpoFuerte).foregroundStyle(.black) }
                    }
                    .padding(.horizontal, 8)
                    .tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: entradas.count > 1 ? .always : .never))
            .indexViewStyle(.page(backgroundDisplayMode: .always))
            if entradas.count > 1 {
                Text("\(indice + 1) de \(entradas.count)").font(Tipo.pie).foregroundStyle(.black.opacity(0.6))
            }
        }
        .padding(20)
        .background(Color.white.ignoresSafeArea())
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
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: Espacio.m) {
                PhotosPicker(selection: $foto, matching: .images) {
                    Text(leyendo ? "leyendo…" : "+ añadir entrada.").font(Tipo.cuerpoFuerte).frame(minHeight: 44)
                }
                .disabled(leyendo)
                Button("pegar.") { pegar() }.font(Tipo.cuerpoFuerte).frame(minHeight: 44)
                    .disabled(leyendo || !UIPasteboard.general.hasImages && !UIPasteboard.general.hasStrings)
            }
            .foregroundStyle(Paleta.acento)
            if let error { Text(error).font(Tipo.pie).foregroundStyle(Paleta.error) }
        }
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
