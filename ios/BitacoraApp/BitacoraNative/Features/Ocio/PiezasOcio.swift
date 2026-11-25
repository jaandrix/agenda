import SwiftUI
import UIKit

// Estrellas con medios puntos (0.20). Tocar la mitad izquierda de una estrella deja media; arrastrar va recorriendo.
// Con VoiceOver se ajusta de medio en medio. 3.0: la estrella que se toca late con un muelle.
struct EstrellasOcio: View {
    let valor: Double
    var tamano: CGFloat = 26
    var color: Color = Lienzo.naranja
    var cambiar: ((Double) -> Void)?
    // La nota que había al apoyar el dedo: tocar otra vez la misma la quita (0.22; antes no había forma de volver a «sin valorar»).
    @State private var alApoyar: Double? = nil
    @State private var latido: Int? = nil
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        let lado = Tipo.tamano(tamano)
        HStack(spacing: lado * 0.18) {
            ForEach(0..<5, id: \.self) { i in
                let resto = valor - Double(i)
                Image(systemName: resto >= 1 ? "star.fill" : resto >= 0.5 ? "star.leadinghalf.filled" : "star")
                    .font(.system(size: lado * 0.82, weight: .semibold))
                    .foregroundStyle(resto >= 0.5 ? color : Lienzo.tintaTerciaria)
                    .frame(width: lado, height: lado)
                    .scaleEffect(latido == i && !sinMovimiento ? 1.28 : 1)
                    .animation(latido == i ? Muelle.toque : Muelle.soltar, value: latido)
            }
        }
        .frame(minHeight: cambiar == nil ? nil : Medida.toque)
        .contentShape(Rectangle())
        .gesture(cambiar == nil ? nil : DragGesture(minimumDistance: 0).onChanged { g in
            if alApoyar == nil { alApoyar = valor }
            let v = Self.nota(g.location.x, lado: lado)
            if v != valor { cambiar?(v); latir(v) }
        }.onEnded { g in
            if let antes = alApoyar, abs(g.translation.width) < 6, Self.nota(g.location.x, lado: lado) == antes { cambiar?(0) }
            alApoyar = nil
        })
        .sensoryFeedback(.selection, trigger: valor)
        .accessibilityElement()
        .accessibilityLabel("nota")
        .accessibilityValue(valor == 0 ? "sin valorar" : LecturaOcio.textoNota(valor))
        .accessibilityHint(cambiar == nil ? "" : "toca la misma nota para quitarla")
        .accessibilityAdjustableAction { d in
            guard let cambiar else { return }
            cambiar(d == .increment ? min(5, valor + 0.5) : max(0, valor - 0.5))
        }
    }

    private func latir(_ v: Double) {
        let i = max(0, Int(v.rounded(.up)) - 1)
        latido = i
        Task {
            try? await Task.sleep(for: .milliseconds(140))
            if latido == i { latido = nil }
        }
    }
}

extension EstrellasOcio {
    static func nota(_ x: CGFloat, lado: CGFloat) -> Double { min(5, max(0.5, (Double(x / (lado * 1.18)) * 2).rounded(.up) / 2)) }
}

// Valoración discreta de las tarjetas: una estrella pequeña y la nota («4,5»).
struct NotaDiscretaOcio: View {
    let valor: Double
    var sobreOscuro = false

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "star.fill").font(.system(size: 9, weight: .bold)).foregroundStyle(Lienzo.naranja)
            Text(valor == valor.rounded() ? "\(Int(valor))" : String(format: "%.1f", valor).replacingOccurrences(of: ".", with: ","))
                .font(Letra.pieFuerte).monospacedDigit()
                .foregroundStyle(sobreOscuro ? Lienzo.sobreOscuroSuave : Lienzo.tintaSecundaria)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(LecturaOcio.textoNota(valor))
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

    // portadaAuto (js/ocio.js), con más acierto (3.2): cada candidata puntúa por el título (igual, con subtítulo o que
    // lo contiene; si no, se descarta), por el autor (un apellido en común suma, otro autor resta) y por el año (el mismo
    // o uno de diferencia suma, lejos resta). Desempata el orden de la fuente. Sin autor ni año, lo de siempre: el mismo
    // título o, si no, la primera que lo contiene.
    static func mejor(_ r: [CandidataPortada], titulo: String, autor: String = "", anio: String = "") -> CandidataPortada? {
        let t = clave(titulo)
        guard !t.isEmpty else { return nil }
        let palabrasAutor = clave(autor).split(separator: " ").filter { $0.count > 2 }
        let y = Int(anio.prefix(4))
        var elegida: (candidata: CandidataPortada, puntos: Int)?
        for (i, k) in r.enumerated() {
            let kt = clave(k.titulo)
            var p: Int
            if kt == t { p = 100 }
            else if kt.hasPrefix(t + " ") || t.hasPrefix(kt + " ") { p = 70 }
            else if t.count > 3, kt.contains(t) { p = 40 }
            else { continue }
            let ka = clave(k.autor)
            if !palabrasAutor.isEmpty, !ka.isEmpty { p += palabrasAutor.contains { ka.contains($0) } ? 30 : -25 }
            if let y, let ky = Int(k.anio.prefix(4)) { p += ky == y ? 25 : abs(ky - y) <= 1 ? 10 : -15 }
            p -= i
            if elegida.map({ p > $0.puntos }) ?? true { elegida = (k, p) }
        }
        return elegida?.candidata
    }

    static func clave(_ texto: String) -> String {
        LecturaOcio.normalizar(texto).lowercased().replacingOccurrences(of: #"[^a-z0-9]+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }
}

// La portada guardada o, sin ella, la inicial sobre gris. Con `ancho` nil ocupa el ancho que le den (rejilla), en
// proporción 2:3. 3.0: la que llega de la red entra fundida; la que ya estaba en la caché sale al momento, sin parpadeo.
// Usa la caché de `Imagenes` (Core) directamente porque `ImagenRemota` no avisa de cuándo llega la imagen.
struct PortadaOcio: View {
    let url: String
    let titulo: String
    var ancho: CGFloat? = 48
    var radio: CGFloat = 8
    // 3.2: las de 5 estrellas llevan `ChapaCincoOcio` arriba a la derecha (solo en portadas de 40 pt o más).
    var cinco = false

    static let proporcion: CGFloat = 1.45
    // El lado al que se decodifican las de la rejilla (ancho nil), para precargarlas con la misma clave.
    static let ladoRejilla: CGFloat = 124 * proporcion

    @State private var cargada: (url: URL, imagen: UIImage)? = nil
    @State private var visible = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    private var direccion: URL? { url.isEmpty ? nil : URL(string: url) }
    // Lado al que se decodifica: el alto de la portada (en la rejilla, unos 180 pt bastan para tres columnas).
    private var lado: CGFloat { ancho.map { $0 * Self.proporcion } ?? Self.ladoRejilla }

    var body: some View {
        Color.clear
            .aspectRatio(1 / Self.proporcion, contentMode: .fit)
            .frame(width: ancho, height: ancho.map { $0 * Self.proporcion })
            .frame(maxWidth: ancho == nil ? .infinity : nil)
            .background(inicial)
            .overlay { imagen }
            .clipShape(RoundedRectangle(cornerRadius: radio, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radio, style: .continuous).strokeBorder(Lienzo.filo))
            .overlay(alignment: .topTrailing) {
                if cinco, (ancho ?? 100) >= 40 {
                    ChapaCincoOcio(lado: (ancho ?? 100) >= 120 ? 24 : 18).padding((ancho ?? 100) >= 120 ? 8 : 5)
                }
            }
            .accessibilityHidden(true)
            .task(id: url) {
                guard let u = direccion, cargada?.url != u else { return }
                if let ya = Imagenes.guardada(Imagenes.clave(u, lado: lado)) { cargada = (u, ya); visible = true; return }
                visible = false
                guard let r = await Imagenes.cargarDetalle(u, lado: lado) else { return }
                cargada = (u, r.imagen)
                // 3.2: la que ya estaba en el iPhone sale al momento; solo la que llega de la red entra fundida.
                if r.deRed { withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento)) { visible = true } } else { visible = true }
            }
    }

    @ViewBuilder private var imagen: some View {
        if let u = direccion, let img = cargada.flatMap({ $0.url == u ? $0.imagen : nil }) {
            Image(uiImage: img).resizable().scaledToFill()
                .opacity(visible ? 1 : 0)
                .scaleEffect(visible || sinMovimiento ? 1 : 1.04)
        }
    }

    private var inicial: some View {
        Lienzo.sutil.overlay(
            Text(String(titulo.prefix(1)).lowercased())
                .font((ancho ?? 100) < 60 ? Letra.seccion : Letra.titulo)
                .foregroundStyle(Lienzo.tintaTerciaria))
    }
}

// Entrada escalonada solo para las primeras celdas de la primera carga: en una rejilla perezosa larga, cada celda que
// aparece al hacer scroll volvería a animarse.
struct AparicionOcio: ViewModifier {
    let indice: Int
    let activa: Bool

    @ViewBuilder func body(content: Content) -> some View {
        if activa { content.entradaEscalonada(indice) } else { content }
    }
}

// Raya fina naranja de «ahora mismo». No hay progreso guardado (ni páginas ni capítulos): mide los días desde que
// empezó, sobre un mes, y se dice en texto al lado.
struct BarraCursoOcio: View {
    let fraccion: Double
    @State private var lleno = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Lienzo.filoOscuro)
                Capsule().fill(Lienzo.naranja)
                    .frame(width: max(4, g.size.width * (lleno ? min(1, max(0, fraccion)) : 0)))
            }
        }
        .frame(height: 3)
        .accessibilityHidden(true)
        .onAppear { withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento).delay(0.12)) { lleno = true } }
    }
}
