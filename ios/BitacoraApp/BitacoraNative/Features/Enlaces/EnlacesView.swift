import SwiftUI
import UIKit

// Enlaces (renderLinks y compañía en js/enlaces-proyectos.js): `links` por categorías de `linkCategories`, favoritos (5 como
// mucho), buscar, crear, editar, duplicar, copiar y eliminar. Se abren en Safari. Guardar desde la hoja de compartir del
// sistema necesita una extensión, que de momento no se usa (PLAN-0.17.md): aquí se pega la dirección del portapapeles.

struct Enlace: Sendable, Identifiable, Equatable { let id, titulo, url, descripcion: String; let categoriaId: String?; let favorito: Bool }
struct CategoriaEnlace: Sendable, Identifiable, Equatable { let id, nombre, color: String }

enum LecturaEnlaces {
    static let colores = ["#FFADAD", "#FFD6A5", "#FDFFB6", "#CAFFBF", "#9BF6FF", "#BDB2FF"]

    static func leer(_ doc: DocumentoBitacora) -> ([Enlace], [CategoriaEnlace]) {
        let enlaces = (((try? doc.valor(de: "links")) ?? nil)?.lista ?? []).compactMap { x -> Enlace? in
            guard let o = x.objeto, let id = o["id"]?.comoId else { return nil }
            return Enlace(id: id, titulo: o["title"]?.texto ?? "", url: o["url"]?.texto ?? "", descripcion: o["descripcion"]?.texto ?? "",
                          categoriaId: o["categoryId"]?.comoId, favorito: o["favorito"]?.booleano == true)
        }
        let cats = (((try? doc.valor(de: "linkCategories")) ?? nil)?.lista ?? []).compactMap { x -> CategoriaEnlace? in
            guard let o = x.objeto, let id = o["id"]?.comoId else { return nil }
            return CategoriaEnlace(id: id, nombre: o["name"]?.texto ?? "", color: o["color"]?.texto ?? "")
        }
        return (enlaces, cats)
    }

    // filtrarEnlaces: título, dirección y descripción, sin tildes ni mayúsculas.
    static func coincide(_ e: Enlace, _ q: String) -> Bool {
        let n = { (t: String) in t.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES")) }
        let b = n(q.trimmingCharacters(in: .whitespaces))
        return b.isEmpty || n(e.titulo + " " + e.url + " " + e.descripcion).contains(b)
    }

    static func dominio(_ url: String) -> String {
        (URL(string: url)?.host ?? url.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: ""))
            .replacingOccurrences(of: "www.", with: "")
    }

    static func nuevoId(_ prefijo: String) -> String {
        let letras = "abcdefghijklmnopqrstuvwxyz0123456789"
        return prefijo + "_\(Int64(Date().timeIntervalSince1970 * 1000))_" + String((0..<4).map { _ in letras.randomElement()! })
    }
}

private enum ModalEnlace: Identifiable {
    case enlace(Enlace?, String?)
    case categoria(CategoriaEnlace?)
    var id: String {
        switch self { case .enlace(let e, _): return "e-" + (e?.id ?? "nuevo"); case .categoria(let c): return "c-" + (c?.id ?? "nueva") }
    }
}

struct EnlacesView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.openURL) private var abrir
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var datos: ([Enlace], [CategoriaEnlace])?
    @State private var busqueda = ""
    @State private var modal: ModalEnlace?
    @State private var aviso: String?
    @State private var enlaceABorrar: Enlace?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "enlaces.", subtitulo: datos.map { $0.0.count == 1 ? "1 enlace." : "\($0.0.count) enlaces." }) {
                    HStack(spacing: Medida.xs) {
                        BotonRedondo(sistema: "doc.on.clipboard", tono: .blanco, etiqueta: "pegar un enlace copiado") { pegar() }
                        BotonRedondo(sistema: "plus", tono: .oscuro, etiqueta: "nuevo enlace") { Haptica.ligera(); modal = .enlace(nil, nil) }
                    }
                }
                .padding(.bottom, Medida.xxs)
                BuscadorCapsula(texto: $busqueda, placeholder: "buscar en tus enlaces")
                if let aviso {
                    Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        .padding(.horizontal, Medida.xxs)
                        .transition(.opacity.combined(with: .offset(y: -4)))
                }
                if let d = datos { contenido(d.0, d.1) }
                else { ProgressView().tint(Lienzo.tintaTerciaria).frame(maxWidth: .infinity).padding(.top, Medida.xl) }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: busqueda)
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: aviso)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
        .refreshable { await c.sincronizar() }.task(id: c.revision) { await cargar() }
        .confirmarBorrado($enlaceABorrar, titulo: { "¿eliminar «\($0.titulo)»?" }, boton: "eliminar.") { e in Task { await c.guardar(.borrarEnlace(id: e.id)) } }
        .hoja(item: $modal) { m in
            switch m {
            case .enlace(let e, let url): EditorEnlace(enlace: e, urlInicial: url, categorias: datos?.1 ?? []).environment(c)
            case .categoria(let cat): EditorCategoriaEnlace(categoria: cat, categorias: datos?.1 ?? []).environment(c)
            }
        }
    }

    @ViewBuilder private func contenido(_ enlaces: [Enlace], _ cats: [CategoriaEnlace]) -> some View {
        let visibles = enlaces.filter { LecturaEnlaces.coincide($0, busqueda) }
        let favoritos = visibles.filter(\.favorito)
        if enlaces.isEmpty {
            TarjetaInvitacion(frase: "todavía no has guardado", destacado: "ningún enlace.", boton: "+ enlace.") { modal = .enlace(nil, nil) }
                .transition(.opacity)
        } else if visibles.isEmpty {
            TarjetaInvitacion(frase: "ningún enlace dice", destacado: "«\(busqueda.trimmingCharacters(in: .whitespaces))».", boton: "borrar búsqueda.") {
                Haptica.ligera()
                busqueda = ""
            }
            .transition(.opacity.combined(with: .scale(scale: 0.98)))
        }
        if !favoritos.isEmpty {
            RotuloPanorama(texto: "favoritos")
                .padding(.top, Medida.xs)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Medida.s) {
                    ForEach(Array(favoritos.enumerated()), id: \.element.id) { i, e in
                        tarjetaFavorito(e, cats).entradaEscalonada(i)
                    }
                }
                .padding(.horizontal, Medida.margen)
                .padding(.vertical, Medida.xs)
            }
            .padding(.horizontal, -Medida.margen)
            .padding(.vertical, -Medida.xs)
        }
        ForEach(Array(cats.enumerated()), id: \.element.id) { n, cat in
            let grupo = visibles.filter { $0.categoriaId == cat.id }
            if !grupo.isEmpty || busqueda.isEmpty {
                cabeceraCategoria(cat, cuantos: grupo.count)
                if grupo.isEmpty {
                    Text("sin enlaces todavía.").font(Letra.pie).foregroundStyle(Lienzo.tintaTerciaria).padding(.horizontal, Medida.xxs)
                } else {
                    grupoTarjeta(grupo, cats).entradaEscalonada(n + 1)
                }
            }
        }
        let sueltos = visibles.filter { e in e.categoriaId == nil || !cats.contains { $0.id == e.categoriaId } }
        if !sueltos.isEmpty {
            RotuloPanorama(texto: "sin categoría")
                .padding(.top, Medida.xs)
            grupoTarjeta(sueltos, cats).entradaEscalonada(cats.count + 1)
        }
        if !enlaces.isEmpty {
            Button("+ categoría.") { Haptica.ligera(); modal = .categoria(nil) }
                .buttonStyle(.capsula(.claro))
                .frame(maxWidth: .infinity)
                .padding(.top, Medida.s)
        }
    }

    private func cabeceraCategoria(_ cat: CategoriaEnlace, cuantos: Int) -> some View {
        HStack(spacing: Medida.xs) {
            Puntito(color: colorHex(cat.color) ?? Lienzo.tintaTerciaria, tamano: 7)
            Text(RotuloPanorama.frase(cat.nombre)).font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)
            Text("\(cuantos)").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit()
                .accessibilityLabel(cuantos == 1 ? "1 enlace" : "\(cuantos) enlaces")
            Spacer()
            Menu {
                Button("editar categoría.") { modal = .categoria(cat) }
                Button("+ enlace aquí.") { modal = .enlace(nil, nil) }
            } label: {
                Image(systemName: "ellipsis").font(.system(size: 14, weight: .bold)).foregroundStyle(Lienzo.tintaSecundaria)
                    .frame(width: Medida.toque, height: Medida.toque).contentShape(Rectangle())
            }
            .accessibilityLabel("opciones de " + cat.nombre)
        }
        .padding(.leading, Medida.xxs)
        .padding(.top, Medida.xs)
    }

    // MARK: - Favoritos: tarjetas en fila horizontal

    private func tarjetaFavorito(_ e: Enlace, _ cats: [CategoriaEnlace]) -> some View {
        Button { abrirEnlace(e) } label: {
            VStack(alignment: .leading, spacing: Medida.s) {
                HStack(alignment: .top) {
                    InicialEnlace(titulo: e.titulo, url: e.url, oscuro: true)
                    Spacer(minLength: 0)
                    Image(systemName: "star.fill").font(.system(size: 11, weight: .bold)).foregroundStyle(Lienzo.naranja)
                        .accessibilityHidden(true)
                }
                Spacer(minLength: 0)
                VStack(alignment: .leading, spacing: 2) {
                    Text(e.titulo.lowercased() + ".").font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    Text(LecturaEnlaces.dominio(e.url)).font(Letra.pie).foregroundStyle(Lienzo.tintaTerciaria).lineLimit(1)
                }
            }
            .frame(width: 132, height: 124, alignment: .topLeading)
            .tarjeta(relleno: 14)
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        }
        .buttonStyle(.pulsable(0.96))
        .accessibilityLabel(e.titulo)
        .accessibilityHint("abre " + LecturaEnlaces.dominio(e.url))
        .contextMenu { menuEnlace(e) }
    }

    // MARK: - Resto: filas en una tarjeta

    private func grupoTarjeta(_ grupo: [Enlace], _ cats: [CategoriaEnlace]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(grupo.enumerated()), id: \.element.id) { i, e in
                if i > 0 { SeparadorFila() }
                fila(e)
            }
        }
        .tarjeta(relleno: Medida.s)
    }

    private func fila(_ e: Enlace) -> some View {
        HStack(spacing: 0) {
            Button { abrirEnlace(e) } label: {
                HStack(spacing: Medida.s) {
                    InicialEnlace(titulo: e.titulo, url: e.url, oscuro: false)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(e.titulo.lowercased() + ".").font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                            .lineLimit(2).multilineTextAlignment(.leading)
                        Text(e.descripcion.isEmpty ? LecturaEnlaces.dominio(e.url) : LecturaEnlaces.dominio(e.url) + ", " + e.descripcion)
                            .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                    }
                    Spacer(minLength: Medida.xs)
                }
                .frame(minHeight: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pulsable(0.98))
            .accessibilityElement(children: .combine)
            .accessibilityHint("abre " + LecturaEnlaces.dominio(e.url))
            Button { favorito(e) } label: {
                Image(systemName: e.favorito ? "star.fill" : "star").font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(e.favorito ? Lienzo.naranja : Lienzo.tintaTerciaria)
                    .frame(width: Medida.toque, height: Medida.toque).contentShape(Rectangle())
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.pulsable(0.85))
            .accessibilityLabel(e.favorito ? "quitar de favoritos" : "marcar como favorito")
            Menu { menuEnlace(e) } label: {
                Image(systemName: "ellipsis").font(.system(size: 14, weight: .bold)).foregroundStyle(Lienzo.tintaSecundaria)
                    .frame(width: Medida.toque, height: Medida.toque).contentShape(Rectangle())
            }
            .accessibilityLabel("opciones de " + e.titulo)
        }
    }

    @ViewBuilder private func menuEnlace(_ e: Enlace) -> some View {
        Button("editar.") { modal = .enlace(e, nil) }
        Button(e.favorito ? "quitar de favoritos." : "a favoritos.") { favorito(e) }
        Button("abrir en safari.") { if let u = URL(string: e.url) { abrir(u) } }
        Button("duplicar.") {
            Task { await c.guardar(.guardarEnlace(id: LecturaEnlaces.nuevoId("link"), titulo: e.titulo + " (copia)", url: e.url, categoriaId: e.categoriaId,
                                                        descripcion: e.descripcion, creado: ISO8601DateFormatter().string(from: Date()))) }
        }
        Button("copiar la dirección.") { UIPasteboard.general.string = e.url; Haptica.ligera(); aviso = "dirección copiada." }
        Button("eliminar.", role: .destructive) { enlaceABorrar = e }
    }

    // Dentro de la app (SFSafariViewController, el mismo navegador que lo no migrado); «abrir en safari.» en el menú.
    private func abrirEnlace(_ e: Enlace) {
        guard let u = URL(string: e.url) else { return }
        if ["http", "https"].contains(u.scheme?.lowercased() ?? "") { c.web = u } else { abrir(u) }
    }

    private func favorito(_ e: Enlace) {
        if !e.favorito, (datos?.0.filter(\.favorito).count ?? 0) >= 5 { Haptica.error(); aviso = "como mucho 5 favoritos: quita uno antes."; return }
        aviso = nil
        Haptica.ligera()
        Task { await c.guardar(.favoritoEnlace(id: e.id, favorito: !e.favorito)) }
    }
    private func pegar() {
        guard let t = UIPasteboard.general.string?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { aviso = "no hay nada copiado."; return }
        aviso = nil
        modal = .enlace(nil, t)
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        guard let r = await ultimaGana({ doc.map { LecturaEnlaces.leer($0) } }) else { return }
        datos = r
    }
}

private struct EditorEnlace: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let enlace: Enlace?
    let categorias: [CategoriaEnlace]
    @State private var titulo: String
    @State private var url: String
    @State private var descripcion: String
    @State private var categoria: String
    @State private var id: String
    @State private var creado: String

    init(enlace: Enlace?, urlInicial: String?, categorias: [CategoriaEnlace]) {
        self.enlace = enlace; self.categorias = categorias
        let u = enlace?.url ?? urlInicial ?? ""
        _titulo = State(initialValue: enlace?.titulo ?? (urlInicial.map { LecturaEnlaces.dominio($0) } ?? ""))
        _url = State(initialValue: u); _descripcion = State(initialValue: enlace?.descripcion ?? "")
        _categoria = State(initialValue: enlace?.categoriaId ?? "")
        _id = State(initialValue: enlace?.id ?? LecturaEnlaces.nuevoId("link"))
        _creado = State(initialValue: ISO8601DateFormatter().string(from: Date()))
    }

    var body: some View {
        NavigationStack {
            FormCasa {
                TextField("título.", text: $titulo)
                TextField("dirección.", text: $url).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                TextField("descripción (opcional).", text: $descripcion)
                Picker("categoría.", selection: $categoria) {
                    Text("sin categoría.").tag("")
                    ForEach(categorias) { cat in Text(cat.nombre.lowercased() + ".").tag(cat.id) }
                }
            }
            .navigationTitle(enlace == nil ? "nuevo enlace." : "editar enlace.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        Task { if await c.guardar(.guardarEnlace(id: id, titulo: titulo, url: url, categoriaId: categoria.isEmpty ? nil : categoria,
                                                                    descripcion: descripcion, creado: creado)) { cerrar() } }
                    }.disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty || url.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

private struct EditorCategoriaEnlace: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let categoria: CategoriaEnlace?
    let categorias: [CategoriaEnlace]
    @State private var nombre: String
    @State private var color: String
    @State private var destino = ""
    @State private var id: String
    @State private var confirmarBorrado = false

    init(categoria: CategoriaEnlace?, categorias: [CategoriaEnlace]) {
        self.categoria = categoria; self.categorias = categorias
        _nombre = State(initialValue: categoria?.nombre ?? ""); _color = State(initialValue: categoria?.color ?? LecturaEnlaces.colores[0])
        _id = State(initialValue: categoria?.id ?? LecturaEnlaces.nuevoId("lcat"))
    }

    var body: some View {
        NavigationStack {
            FormCasa {
                TextField("nombre.", text: $nombre)
                Picker("color.", selection: $color) {
                    ForEach(LecturaEnlaces.colores, id: \.self) { h in
                        Label { Text(h) } icon: { Circle().fill(colorHex(h) ?? Paleta.textoSecundario) }.tag(h)
                    }
                }
                if categoria != nil {
                    Section {
                        Picker("sus enlaces pasan a.", selection: $destino) {
                            Text("sin categoría.").tag("")
                            ForEach(categorias.filter { $0.id != id }) { cat in Text(cat.nombre.lowercased() + ".").tag(cat.id) }
                        }
                        Button("eliminar categoría.", role: .destructive) { confirmarBorrado = true }
                    }
                }
            }
            .navigationTitle(categoria == nil ? "nueva categoría." : "categoría.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") { Task { if await c.guardar(.guardarCategoriaEnlace(id: id, nombre: nombre, color: color)) { cerrar() } } }
                        .disabled(nombre.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .confirmationDialog("¿eliminar esta categoría?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("eliminar.", role: .destructive) { Task { if await c.guardar(.borrarCategoriaEnlace(id: id, destino: destino.isEmpty ? nil : destino)) { cerrar() } } }
                Button("cancelar.", role: .cancel) {}
            }
        }
    }
}

// El color de una categoría («#FFADAD», como LINK_CATEGORY_COLORS).
private func colorHex(_ h: String) -> Color? {
    let t = h.trimmingCharacters(in: CharacterSet(charactersIn: "# "))
    guard t.count == 6, let v = UInt32(t, radix: 16) else { return nil }
    return Color.deUsuario(v)
}

// El logo de la web (FaviconEnlaces) en un squircle blanco; mientras carga, o si la web no tiene, la inicial en un
// cuadrado de esquinas continuas, como IconoCuadrado.
struct InicialEnlace: View {
    let titulo: String
    let url: String
    var oscuro = false
    var tamano: CGFloat = Medida.icono
    @State private var logo: (url: String, imagen: UIImage)?
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    private var inicial: String {
        let base = titulo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? LecturaEnlaces.dominio(url) : titulo
        return base.first { $0.isLetter || $0.isNumber }.map { String($0).uppercased() } ?? "#"
    }

    var body: some View {
        let imagen = logo.flatMap { $0.url == url ? $0.imagen : nil } ?? FaviconEnlaces.enMemoria(url)
        let forma = RoundedRectangle(cornerRadius: tamano * 0.3, style: .continuous)
        ZStack {
            forma.fill(imagen != nil ? Lienzo.tarjeta : oscuro ? Lienzo.oscuro : Lienzo.sutil)
            if let imagen {
                Image(uiImage: imagen).resizable().interpolation(.high).scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: tamano * 0.18, style: .continuous))
                    .padding(tamano * 0.14)
                    .transition(.opacity)
            } else {
                Text(inicial).font(Letra.tituloTarjeta).foregroundStyle(oscuro ? Lienzo.sobreOscuro : Lienzo.tinta)
                    .minimumScaleFactor(0.6).lineLimit(1)
            }
        }
        .frame(width: tamano, height: tamano)
        .overlay { if imagen != nil { forma.strokeBorder(Lienzo.filo) } }
        .task(id: url) {
            guard imagen == nil, let img = await FaviconEnlaces.imagen(url: url, lado: tamano) else { return }
            withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento)) { logo = (url, img) }
        }
        .accessibilityHidden(true)
    }
}
