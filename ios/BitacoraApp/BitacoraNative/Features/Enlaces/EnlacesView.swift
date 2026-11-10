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
    @State private var datos: ([Enlace], [CategoriaEnlace])?
    @State private var busqueda = ""
    @State private var modal: ModalEnlace?
    @State private var aviso: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                CabeceraContexto(titulo: "enlaces", detalle: datos.map { "\($0.0.count) enlaces." }) {
                    Text("tus enlaces.").font(Tipo.poppins(24, .bold, estilo: .title3)).foregroundStyle(Paleta.sobreContexto)
                    Text("lo que guardas para volver.").font(Tipo.pie).foregroundStyle(Paleta.sobreContextoSuave)
                }
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: Espacio.s) {
                        TextField("buscar.", text: $busqueda).font(Tipo.cuerpo)
                        AccionTexto(texto: "pegar.") { pegar() }
                        AccionTexto(texto: "+ enlace.") { modal = .enlace(nil, nil) }
                    }.padding(.vertical, Espacio.s)
                    if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
                    if let d = datos { contenido(d.0, d.1) } else { ProgressView().frame(maxWidth: .infinity).padding(.top, Espacio.xl) }
                }.modifier(HojaContenido())
            }
        }
        .background(Paleta.fondo.ignoresSafeArea()).scrollIndicators(.hidden)
        .refreshable { await c.sincronizar() }.task(id: c.informe.revision) { await cargar() }
        .sheet(item: $modal) { m in
            switch m {
            case .enlace(let e, let url): EditorEnlace(enlace: e, urlInicial: url, categorias: datos?.1 ?? []).environment(c)
            case .categoria(let cat): EditorCategoriaEnlace(categoria: cat, categorias: datos?.1 ?? []).environment(c)
            }
        }
    }

    @ViewBuilder private func contenido(_ enlaces: [Enlace], _ cats: [CategoriaEnlace]) -> some View {
        let visibles = enlaces.filter { LecturaEnlaces.coincide($0, busqueda) }
        let favoritos = visibles.filter(\.favorito)
        if enlaces.isEmpty { Text("todavía no has guardado ningún enlace.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.l) }
        else if visibles.isEmpty { Text("no hay resultados.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.l) }
        if !favoritos.isEmpty {
            CabeceraSeccion(titulo: "favoritos.", detalle: "\(favoritos.count)")
            ForEach(favoritos) { fila($0, cats) }
        }
        ForEach(cats) { cat in
            let grupo = visibles.filter { $0.categoriaId == cat.id }
            if !grupo.isEmpty || busqueda.isEmpty {
                HStack {
                    Circle().fill(colorHex(cat.color) ?? Paleta.acento).frame(width: 10, height: 10).accessibilityHidden(true)
                    CabeceraSeccion(titulo: cat.nombre.lowercased() + ".", detalle: "\(grupo.count)")
                    Spacer()
                    Menu {
                        Button("editar categoría.") { modal = .categoria(cat) }
                        Button("+ enlace aquí.") { modal = .enlace(nil, nil) }
                    } label: { Image(systemName: "ellipsis").foregroundStyle(Paleta.textoSecundario).frame(width: 32, height: 40) }
                        .accessibilityLabel("opciones de " + cat.nombre)
                }
                ForEach(grupo) { fila($0, cats) }
            }
        }
        let sueltos = visibles.filter { e in e.categoriaId == nil || !cats.contains { $0.id == e.categoriaId } }
        if !sueltos.isEmpty {
            CabeceraSeccion(titulo: "sin categoría.", detalle: "\(sueltos.count)")
            ForEach(sueltos) { fila($0, cats) }
        }
        AccionTexto(texto: "+ categoría.") { modal = .categoria(nil) }.padding(.top, Espacio.l)
    }

    private func fila(_ e: Enlace, _ cats: [CategoriaEnlace]) -> some View {
        HStack(spacing: Espacio.s) {
            Button { if let u = URL(string: e.url) { abrir(u) } } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(e.titulo.lowercased() + ".").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto).lineLimit(2)
                    Text(e.descripcion.isEmpty ? LecturaEnlaces.dominio(e.url) : e.descripcion).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).lineLimit(2)
                }.frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
            }.buttonStyle(.plain).accessibilityHint("abre " + LecturaEnlaces.dominio(e.url))
            Button { favorito(e) } label: {
                Image(systemName: e.favorito ? "star.fill" : "star").font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(e.favorito ? Paleta.acento : Paleta.textoSecundario).frame(width: 36, height: 44)
            }.buttonStyle(.plain).accessibilityLabel(e.favorito ? "quitar de favoritos" : "marcar como favorito")
            Menu {
                Button("editar.") { modal = .enlace(e, nil) }
                Button("duplicar.") {
                    Task { try? await c.encolar(.guardarEnlace(id: LecturaEnlaces.nuevoId("link"), titulo: e.titulo + " (copia)", url: e.url, categoriaId: e.categoriaId,
                                                                descripcion: e.descripcion, creado: ISO8601DateFormatter().string(from: Date()))) }
                }
                Button("copiar la dirección.") { UIPasteboard.general.string = e.url; aviso = "dirección copiada." }
                Button("eliminar.", role: .destructive) { Task { try? await c.encolar(.borrarEnlace(id: e.id)) } }
            } label: { Image(systemName: "ellipsis").foregroundStyle(Paleta.textoSecundario).frame(width: 32, height: 44) }
                .accessibilityLabel("opciones de " + e.titulo)
        }.overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
    }

    private func favorito(_ e: Enlace) {
        if !e.favorito, (datos?.0.filter(\.favorito).count ?? 0) >= 5 { aviso = "como mucho 5 favoritos: quita uno antes."; return }
        aviso = nil
        Task { try? await c.encolar(.favoritoEnlace(id: e.id, favorito: !e.favorito)) }
    }

    private func pegar() {
        guard let t = UIPasteboard.general.string?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { aviso = "no hay nada copiado."; return }
        aviso = nil
        modal = .enlace(nil, t)
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        let r = await Task.detached(priority: .userInitiated) { doc.map { LecturaEnlaces.leer($0) } }.value
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
            Form {
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
                        Task { try? await c.encolar(.guardarEnlace(id: id, titulo: titulo, url: url, categoriaId: categoria.isEmpty ? nil : categoria,
                                                                    descripcion: descripcion, creado: creado)) }
                        cerrar()
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
            Form {
                TextField("nombre.", text: $nombre)
                Picker("color.", selection: $color) {
                    ForEach(LecturaEnlaces.colores, id: \.self) { h in
                        Label { Text(h) } icon: { Circle().fill(colorHex(h) ?? .gray) }.tag(h)
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
                    Button("guardar.") { Task { try? await c.encolar(.guardarCategoriaEnlace(id: id, nombre: nombre, color: color)) }; cerrar() }
                        .disabled(nombre.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .confirmationDialog("¿eliminar esta categoría?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("eliminar.", role: .destructive) { Task { try? await c.encolar(.borrarCategoriaEnlace(id: id, destino: destino.isEmpty ? nil : destino)) }; cerrar() }
                Button("cancelar.", role: .cancel) {}
            }
        }
    }
}

// El color de una categoría («#FFADAD», como LINK_CATEGORY_COLORS).
private func colorHex(_ h: String) -> Color? {
    let t = h.trimmingCharacters(in: CharacterSet(charactersIn: "# "))
    guard t.count == 6, let v = UInt32(t, radix: 16) else { return nil }
    return Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
}
