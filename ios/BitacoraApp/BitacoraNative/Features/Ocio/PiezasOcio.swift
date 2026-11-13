import SwiftUI

// Estrellas con medios puntos (0.20). Tocar la mitad izquierda de una estrella deja media; arrastrar va recorriendo.
// Con VoiceOver se ajusta de medio en medio.
struct EstrellasOcio: View {
    let valor: Double
    var tamano: CGFloat = 26
    var color: Color = Paleta.acento
    var cambiar: ((Double) -> Void)?

    var body: some View {
        let lado = Tipo.tamano(tamano)
        HStack(spacing: lado * 0.18) {
            ForEach(0..<5, id: \.self) { i in
                let resto = valor - Double(i)
                Image(systemName: resto >= 1 ? "star.fill" : resto >= 0.5 ? "star.leadinghalf.filled" : "star")
                    .font(.system(size: lado * 0.82, weight: .semibold))
                    .foregroundStyle(resto >= 0.5 ? color : Paleta.aro)
                    .frame(width: lado, height: lado)
            }
        }
        .frame(minHeight: cambiar == nil ? nil : 44)
        .contentShape(Rectangle())
        .gesture(cambiar == nil ? nil : DragGesture(minimumDistance: 0).onChanged { g in
            let paso = lado * 1.18
            let v = min(5, max(0.5, (Double(g.location.x / paso) * 2).rounded(.up) / 2))
            if v != valor { cambiar?(v) }
        })
        .sensoryFeedback(.selection, trigger: valor)
        .accessibilityElement()
        .accessibilityLabel("nota")
        .accessibilityValue(valor == 0 ? "sin valorar" : LecturaOcio.textoNota(valor))
        .accessibilityAdjustableAction { d in
            guard let cambiar else { return }
            cambiar(d == .increment ? min(5, valor + 0.5) : max(0, valor - 0.5))
        }
    }
}

// Buscador de Ocio: superficie, filo del tema y lupa, como los campos de la casa (antes era un TextField sin fondo).
struct BuscadorOcio: View {
    @Binding var texto: String
    let placeholder: String
    @FocusState private var activo: Bool

    var body: some View {
        HStack(spacing: Espacio.s) {
            Image(systemName: "magnifyingglass").font(.system(size: Tipo.tamano(15), weight: .semibold)).foregroundStyle(Paleta.textoSecundario)
            TextField(placeholder, text: $texto)
                .font(Tipo.cuerpo).foregroundStyle(Paleta.texto)
                .textInputAutocapitalization(.never).autocorrectionDisabled().submitLabel(.search)
                .focused($activo)
            if !texto.isEmpty {
                Button { texto = "" } label: {
                    Image(systemName: "xmark.circle.fill").font(.system(size: Tipo.tamano(16))).foregroundStyle(Paleta.textoSecundario)
                        .frame(width: 32, height: 44)
                }
                .buttonStyle(.plain).accessibilityLabel("borrar la búsqueda")
            }
        }
        .campoCasa(activo: activo)
    }
}

// Portadas con la función `portadas` (la misma de la web: TMDB para películas y series, Open Library y Google Books
// para libros, Steam para juegos).
struct CandidataPortada: Identifiable, Equatable {
    let titulo: String
    let anio: String
    let autor: String
    let imagen: String
    var id: String { imagen }
}

enum BuscarPortadas {
    static func buscar(_ c: AppCoordinator, tipo: String, q: String, anio: String = "") async -> [CandidataPortada] {
        let q = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, let s = try? await c.entorno.auth.sesionValida() else { return [] }
        var cuerpo: [String: Any] = ["tipo": tipo, "q": q]
        if !anio.isEmpty { cuerpo["anio"] = String(anio.prefix(4)) }
        let cliente = c.entorno.cliente
        guard let datos = try? JSONSerialization.data(withJSONObject: cuerpo),
              let res = try? await cliente.enviar(cliente.peticion("functions/v1/portadas", metodo: "POST", token: s.accessToken, cuerpo: datos, tiempo: 15)),
              res.1 == 200, let j = (try? JSONSerialization.jsonObject(with: res.0)) as? [String: Any],
              let r = j["resultados"] as? [[String: Any]] else { return [] }
        return r.compactMap { x in
            guard let img = x["imagen"] as? String, img.hasPrefix("http") else { return nil }
            let anio = (x["anio"] as? String) ?? (x["anio"] as? Int).map(String.init) ?? ""
            return CandidataPortada(titulo: x["titulo"] as? String ?? "", anio: anio, autor: x["autor"] as? String ?? "", imagen: img)
        }
    }

    // portadaAuto (js/ocio.js): la candidata con el mismo título o, si no, la primera si lo contiene.
    static func mejor(_ r: [CandidataPortada], titulo: String) -> CandidataPortada? {
        let n = { (t: String) in LecturaOcio.normalizar(t).replacingOccurrences(of: #"[^a-z0-9]+"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces) }
        let t = n(titulo)
        if let igual = r.first(where: { n($0.titulo) == t }) { return igual }
        if let p = r.first, t.count > 3, n(p.titulo).contains(t) { return p }
        return nil
    }
}

// La portada guardada o, sin ella, la inicial sobre el tinte del tema.
struct PortadaOcio: View {
    let url: String
    let titulo: String
    var ancho: CGFloat = 48

    var body: some View {
        let alto = ancho * 1.45
        Group {
            if let u = URL(string: url), !url.isEmpty {
                AsyncImage(url: u, transaction: Transaction(animation: nil)) { fase in
                    if let img = fase.image { img.resizable().scaledToFill() } else { inicial }
                }
            } else { inicial }
        }
        .frame(width: ancho, height: alto)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Paleta.borde, lineWidth: 1))
        .accessibilityHidden(true)
    }

    private var inicial: some View {
        Paleta.tinteTexto.overlay(Text(String(titulo.prefix(1)).lowercased()).font(Tipo.poppins(20, .bold, estilo: .title3)).foregroundStyle(Paleta.textoSecundario))
    }
}
