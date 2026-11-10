import SwiftUI
import QuickLook

// Documentos, en lectura (js/documentos.js): las fichas (`entries` type document, con caducidad en `date`) ordenadas como
// renderFichasDocumentos, y los archivos de Storage (bucket `documents`, carpeta del usuario, sin backups ni viewer), que
// se abren con Vista Rápida. Subir, renombrar, borrar y editar fichas sigue en la web («gestionar en la web.»).

struct FichaDocumento: Sendable, Identifiable, Equatable { let id, titulo, tipo, caduca, url, notas: String }
struct ArchivoDocumento: Sendable, Identifiable, Equatable { let nombre: String; let bytes: Int?; var id: String { nombre } }

enum LecturaDocumentos {
    static func fichas(_ doc: DocumentoBitacora) -> [FichaDocumento] {
        (((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []).compactMap { x -> FichaDocumento? in
            guard let o = x.objeto, o["type"]?.texto == "document", let id = o["id"]?.comoId else { return nil }
            let s = { (k: String) in o[k]?.texto ?? "" }
            return FichaDocumento(id: id, titulo: s("title"), tipo: s("docTipo"), caduca: s("date"), url: s("url"), notas: s("notes"))
        }.sorted { ($0.caduca.isEmpty ? "9999" : $0.caduca) < ($1.caduca.isEmpty ? "9999" : $1.caduca) }
    }

    // El estado de renderFichasDocumentos: caducada, hoy, pronto (30 días) o lejos.
    static func estado(_ f: FichaDocumento, hoy: LocalDay) -> (String, Bool) {
        guard let d = LocalDay(iso: f.caduca) else { return ("sin caducidad.", false) }
        let n = LecturaEnvios.dias(desde: hoy, hasta: d)
        if n < 0 { return ("caducada hace \(-n) \(n == -1 ? "día" : "días"), \(LecturaEnvios.corta(f.caduca)).", true) }
        if n == 0 { return ("caduca hoy.", true) }
        return ("caduca en \(n) \(n == 1 ? "día" : "días"), \(LecturaEnvios.corta(f.caduca)).", n <= 30)
    }

    static func ruta(_ uid: String, _ nombre: String) -> String {
        // peticion usa appendingPathComponent, que ya codifica espacios y tildes.
        "storage/v1/object/authenticated/documents/\(uid)/\(nombre)"
    }
}

struct DocumentosView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.openURL) private var abrir
    @State private var fichas: [FichaDocumento]?
    @State private var archivos: [ArchivoDocumento]?
    @State private var errorArchivos: String?
    @State private var bajando: String?
    @State private var vista: URL?

    private var hoy: LocalDay { CalendarioBitacora.madrid.dia(de: Date()) }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                CabeceraContexto(titulo: "documentos", detalle: fichas.map { "\($0.count) fichas." }) {
                    Text("tus papeles.").font(Tipo.poppins(24, .bold, estilo: .title3)).foregroundStyle(Paleta.sobreContexto)
                    Text("caducidades y archivos.").font(Tipo.pie).foregroundStyle(Paleta.sobreContextoSuave)
                }
                VStack(alignment: .leading, spacing: 0) {
                    CabeceraSeccion(titulo: "fichas.", detalle: fichas.map { "\($0.count)" })
                    if let fichas {
                        if fichas.isEmpty { Text("garantías, contratos, seguros, el dni... con su caducidad. se crean en la web.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s) }
                        ForEach(fichas) { fila($0) }
                    } else { ProgressView().frame(maxWidth: .infinity).padding(.vertical, Espacio.l) }
                    CabeceraSeccion(titulo: "archivos.", detalle: archivos.map { "\($0.count)" }).padding(.top, Espacio.l)
                    if let errorArchivos { Text(errorArchivos).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s) }
                    if let archivos {
                        if archivos.isEmpty && errorArchivos == nil { Text("no hay archivos subidos.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s) }
                        ForEach(archivos) { a in
                            Button { Task { await ver(a) } } label: {
                                HStack {
                                    Text(a.nombre).font(Tipo.cuerpo).foregroundStyle(Paleta.texto).lineLimit(2)
                                    Spacer()
                                    if bajando == a.nombre { ProgressView() }
                                    else if let b = a.bytes { Text(ByteCountFormatter.string(fromByteCount: Int64(b), countStyle: .file)).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
                                }.frame(minHeight: 48).overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                            }.buttonStyle(.plain).accessibilityHint("abre el archivo")
                        }
                    } else if errorArchivos == nil { ProgressView().frame(maxWidth: .infinity).padding(.vertical, Espacio.l) }
                    AccionTexto(texto: "gestionar en la web.") { c.web = Apartados.webURL("documents") }.padding(.top, Espacio.l)
                }.modifier(HojaContenido())
            }
        }
        .background(Paleta.fondo.ignoresSafeArea()).scrollIndicators(.hidden).toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar(); await cargarArchivos() }
        .task(id: c.informe.revision) { await cargar() }
        .task { await cargarArchivos() }
        .quickLookPreview($vista)
    }

    private func fila(_ f: FichaDocumento) -> some View {
        let (texto, aviso) = LecturaDocumentos.estado(f, hoy: hoy)
        return HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text((f.tipo.isEmpty ? "documento" : f.tipo).lowercased() + ".").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                Text(f.titulo).font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto)
                Text(texto).font(Tipo.pie).foregroundStyle(aviso ? Paleta.error : Paleta.textoSecundario)
            }.frame(maxWidth: .infinity, alignment: .leading)
            if let u = URL(string: f.url), !f.url.isEmpty { AccionTexto(texto: "abrir.") { abrir(u) } }
        }.padding(.vertical, 10).overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        fichas = await Task.detached(priority: .userInitiated) { doc.map { LecturaDocumentos.fichas($0) } ?? [] }.value
    }

    // loadDocuments: la carpeta del usuario, lo más nuevo primero, sin las carpetas backups y viewer.
    private func cargarArchivos() async {
        do {
            let s = try await c.entorno.auth.sesionValida()
            let cuerpo = try JSONSerialization.data(withJSONObject: ["prefix": s.userId, "limit": 200, "offset": 0,
                                                                      "sortBy": ["column": "created_at", "order": "desc"]])
            let cliente = c.entorno.cliente
            let (d, codigo) = try await cliente.enviar(cliente.peticion("storage/v1/object/list/documents", metodo: "POST", token: s.accessToken, cuerpo: cuerpo, tiempo: 15))
            guard codigo == 200, let lista = try JSONSerialization.jsonObject(with: d) as? [[String: Any]] else { errorArchivos = "no se pudieron cargar los archivos."; return }
            archivos = lista.compactMap { o -> ArchivoDocumento? in
                guard let n = o["name"] as? String, !(o["id"] is NSNull), o["id"] != nil, n != "backups", n != "viewer" else { return nil }
                return ArchivoDocumento(nombre: n, bytes: ((o["metadata"] as? [String: Any])?["size"] as? NSNumber)?.intValue)
            }
            errorArchivos = nil
        } catch {
            errorArchivos = "sin conexión: los archivos se ven cuando vuelva la red."
        }
    }

    private func ver(_ a: ArchivoDocumento) async {
        guard bajando == nil else { return }
        bajando = a.nombre
        defer { bajando = nil }
        do {
            let s = try await c.entorno.auth.sesionValida()
            let cliente = c.entorno.cliente
            let (d, codigo) = try await cliente.enviar(cliente.peticion(LecturaDocumentos.ruta(s.userId, a.nombre), token: s.accessToken, tiempo: 60))
            guard codigo == 200 else { errorArchivos = "no se pudo abrir «\(a.nombre)»."; return }
            let destino = FileManager.default.temporaryDirectory.appendingPathComponent(a.nombre)
            try d.write(to: destino, options: .atomic)
            vista = destino
        } catch {
            errorArchivos = "no se pudo abrir «\(a.nombre)»."
        }
    }
}
