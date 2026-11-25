import SwiftUI
import QuickLook
import UniformTypeIdentifiers

// Documentos, en lectura (js/documentos.js): las fichas (`entries` type document, con caducidad en `date`) ordenadas como
// renderFichasDocumentos, y los archivos de Storage (bucket `documents`, carpeta del usuario, sin backups ni viewer), que
// se abren con Vista Rápida. Desde la 0.21 las fichas se crean, editan y borran aquí (`FichaDocumentoOp`); desde la 0.27,
// los PDF también se suben, renombran y borran aquí (handleDocUpload, renameDocument y deleteDocument en js/documentos.js).
// Los HTML del visor y las copias siguen en la web («html y copias, en la web.»).

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
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var fichas: [FichaDocumento]?
    @State private var archivos: [ArchivoDocumento]?
    @State private var errorArchivos: String?
    @State private var bajando: String?
    @State private var vista: URL?
    @State private var editando: FichaEditando?
    @State private var importando = false
    @State private var subiendo = false
    @State private var renombrando: ArchivoDocumento?
    @State private var nuevoNombre = ""
    @State private var borrando: ArchivoDocumento?
    @State private var buscar = ""

    private var hoy: LocalDay { CalendarioBitacora.madrid.dia(de: Date()) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "documentos.", subtitulo: subtitulo) {
                    BotonRedondo(sistema: "plus", tono: .oscuro, etiqueta: "nueva ficha") { nuevaFicha() }
                }
                .padding(.bottom, Medida.xxs)
                BuscadorCapsula(texto: $buscar, placeholder: "buscar en tus papeles")
                    .padding(.bottom, Medida.xs)
                seccionFichas
                seccionArchivos
                Button("html y copias, en la web.") { c.web = Apartados.webURL("documents") }
                    .buttonStyle(.capsula(.claro))
                    .frame(maxWidth: .infinity)
                    .padding(.top, Medida.s)
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: buscar)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
        .refreshable { await c.sincronizar(); await cargarArchivos() }
        .tareaVisible(id: c.revision) { await cargar() }
        .task { await cargarArchivos() }
        .quickLookPreview($vista)
        .onChange(of: vista) { antes, ahora in if ahora == nil { ArchivosTemporales.borrar(antes) } }
        .hoja(item: $editando) { e in EditorFichaDocumento(editando: e) }
        .fileImporter(isPresented: $importando, allowedContentTypes: [.pdf]) { r in
            if case let .success(url) = r { Task { await subir(url) } }
        }
        .alert("renombrar.", isPresented: Binding(get: { renombrando != nil }, set: { if !$0 { renombrando = nil } })) {
            TextField("nombre.", text: $nuevoNombre)
            Button("cancelar.", role: .cancel) { renombrando = nil }
            Button("guardar.") { if let a = renombrando { Task { await renombrar(a, nuevoNombre) } } }
        } message: { Text("La extensión se conserva.") }
        .confirmarBorrado($borrando, titulo: Self.preguntaBorrar) { a in Task { await borrar(a) } }
    }

    static func preguntaBorrar(_ a: ArchivoDocumento) -> String { "¿borrar «\(a.nombre)»? no se puede deshacer." }

    // MARK: - Cabecera y búsqueda

    private var subtitulo: String? {
        guard let fichas else { return nil }
        let pronto = fichas.filter { LecturaDocumentos.estado($0, hoy: hoy).1 }.count
        let base = fichas.count == 1 ? "1 ficha" : "\(fichas.count) fichas"
        return pronto == 0 ? base + "." : base + ", \(pronto) por revisar."
    }

    private var consulta: String { Self.normal(buscar.trimmingCharacters(in: .whitespaces)) }

    private static func normal(_ t: String) -> String {
        t.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES"))
    }

    private var fichasVisibles: [FichaDocumento] {
        let q = consulta
        guard !q.isEmpty else { return fichas ?? [] }
        return (fichas ?? []).filter { Self.normal($0.titulo + " " + $0.tipo + " " + $0.notas).contains(q) }
    }

    private var archivosVisibles: [ArchivoDocumento] {
        let q = consulta
        guard !q.isEmpty else { return archivos ?? [] }
        return (archivos ?? []).filter { Self.normal($0.nombre).contains(q) }
    }

    private func nuevaFicha() {
        Haptica.ligera()
        editando = FichaEditando(id: OperacionBitacora.nuevoIdEntrada(), ficha: nil)
    }

    // MARK: - Fichas

    @ViewBuilder private var seccionFichas: some View {
        EtiquetaSeccion(texto: "fichas")
        if let fichas {
            let visibles = fichasVisibles
            if fichas.isEmpty {
                TarjetaInvitacion(frase: "garantías, contratos, seguros, el dni...", destacado: "con su caducidad.", boton: "+ ficha.") { nuevaFicha() }
                    .transition(.opacity)
            } else if visibles.isEmpty {
                TarjetaInvitacion(frase: "ninguna ficha dice", destacado: "«\(buscar.trimmingCharacters(in: .whitespaces))».", boton: "borrar búsqueda.") {
                    Haptica.ligera()
                    buscar = ""
                }
                .transition(.opacity.combined(with: .scale(scale: 0.98)))
            } else {
                ForEach(Array(visibles.enumerated()), id: \.element.id) { i, f in
                    tarjetaFicha(f)
                        .entradaEscalonada(i)
                        .transition(.opacity.combined(with: .scale(scale: 0.97)))
                }
            }
        } else {
            ProgressView().tint(Lienzo.tintaTerciaria).frame(maxWidth: .infinity).padding(.vertical, Medida.xl)
        }
    }

    // La caducidad en corto para el chip; la frase entera (LecturaDocumentos.estado) va en la accesibilidad.
    private func caducidadCorta(_ f: FichaDocumento) -> String {
        guard let d = LocalDay(iso: f.caduca) else { return "sin caducidad." }
        let n = LecturaEnvios.dias(desde: hoy, hasta: d)
        if n < 0 { return "caducada." }
        if n == 0 { return "caduca hoy." }
        if n == 1 { return "caduca mañana." }
        return n <= 60 ? "en \(n) días." : LecturaEnvios.corta(f.caduca) + "."
    }

    private func tarjetaFicha(_ f: FichaDocumento) -> some View {
        let (texto, aviso) = LecturaDocumentos.estado(f, hoy: hoy)
        let tipo = (f.tipo.isEmpty ? "documento" : f.tipo).lowercased() + "."
        return HStack(alignment: .top, spacing: Medida.s) {
            Button { editando = FichaEditando(id: f.id, ficha: f) } label: {
                HStack(alignment: .top, spacing: Medida.s) {
                    IconoCuadrado(id: "documentos", tono: aviso ? .suave : .claro)
                    VStack(alignment: .leading, spacing: Medida.xs) {
                        Text(f.titulo).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta)
                            .lineLimit(2).multilineTextAlignment(.leading)
                        HStack(spacing: 6) {
                            Chip(texto: tipo)
                            Chip(texto: caducidadCorta(f), tono: aviso ? .naranja : .sutil)
                        }
                        if !f.notas.isEmpty {
                            Text(f.notas).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                                .lineLimit(2).multilineTextAlignment(.leading)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.pulsable(0.98))
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(f.titulo), \(tipo) \(texto)")
            .accessibilityHint("editar la ficha")
            if let u = URL(string: f.url), !f.url.isEmpty {
                BotonRedondo(sistema: "arrow.up.right", tono: .sutil, tamano: 32, etiqueta: "abrir el enlace de la ficha") { abrir(u) }
                    .padding(.top, -6).padding(.trailing, -6)
            }
        }
        .tarjeta()
    }

    // MARK: - Archivos

    @ViewBuilder private var seccionArchivos: some View {
        HStack {
            EtiquetaSeccion(texto: "archivos")
            if subiendo {
                ProgressView().tint(Lienzo.tintaTerciaria)
            } else {
                Button("+ pdf.") { Haptica.ligera(); importando = true }
                    .font(Letra.pieFuerte).estiloEnlace()
                    .buttonStyle(.pulsable(0.94))
                    .frame(minHeight: Medida.toque)
                    .accessibilityLabel("subir un pdf")
            }
        }
        .padding(.top, Medida.s)
        if let errorArchivos {
            Text(errorArchivos).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                .padding(.horizontal, Medida.xxs)
                .transition(.opacity)
        }
        if let archivos {
            let visibles = archivosVisibles
            if archivos.isEmpty && errorArchivos == nil {
                TarjetaInvitacion(frase: "no hay archivos subidos.", destacado: "el pdf del seguro, la garantía...", boton: "subir un pdf.") { importando = true }
                    .transition(.opacity)
            } else if !visibles.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(visibles.enumerated()), id: \.element.id) { i, a in
                        if i > 0 { SeparadorFila() }
                        filaArchivo(a)
                    }
                }
                .tarjeta(relleno: Medida.s)
                .entradaEscalonada(fichasVisibles.count)
            } else if !consulta.isEmpty {
                Text("ningún archivo coincide.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    .padding(.horizontal, Medida.xxs)
            }
        } else if errorArchivos == nil {
            ProgressView().tint(Lienzo.tintaTerciaria).frame(maxWidth: .infinity).padding(.vertical, Medida.xl)
        }
    }

    // La vista previa: Vista Rápida a pantalla completa; aquí, la miniatura es el icono cuadrado.
    private func filaArchivo(_ a: ArchivoDocumento) -> some View {
        let peso = a.bytes.map { ByteCountFormatter.string(fromByteCount: Int64($0), countStyle: .file) }
        return HStack(spacing: 0) {
            Button { Task { await ver(a) } } label: {
                FilaTarjeta(icono: "documentos", titulo: a.nombre, detalle: peso) {
                    if bajando == a.nombre { ProgressView().tint(Lienzo.tintaTerciaria) }
                }
            }
            .buttonStyle(.pulsable(0.98))
            .accessibilityHint("abre el archivo")
            Menu { menuArchivo(a) } label: {
                Image(systemName: "ellipsis").font(.system(size: 14, weight: .bold)).foregroundStyle(Lienzo.tintaSecundaria)
                    .frame(width: Medida.toque, height: Medida.toque).contentShape(Rectangle())
            }
            .accessibilityLabel("opciones de «\(a.nombre)»")
        }
        .contextMenu { menuArchivo(a) }
    }

    @ViewBuilder private func menuArchivo(_ a: ArchivoDocumento) -> some View {
        Button("renombrar.") {
            nuevoNombre = Self.partes(a.nombre).0
            renombrando = a
        }
        Button("borrar.", role: .destructive) { borrando = a }
    }

    // sanitizeStorageFilename: sin tildes, lo raro a «_» y la extensión en minúscula.
    static func nombreLimpio(_ nombre: String) -> String {
        let (base, ext) = partes(nombre)
        let limpio = base.folding(options: .diacriticInsensitive, locale: nil)
            .replacingOccurrences(of: "[^a-zA-Z0-9._-]+", with: "_", options: .regularExpression)
            .replacingOccurrences(of: "_+", with: "_", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "_"))
        return (limpio.isEmpty ? "archivo" : limpio) + ext.lowercased()
    }

    static func partes(_ nombre: String) -> (String, String) {
        guard let punto = nombre.lastIndex(of: "."), punto > nombre.startIndex else { return (nombre, "") }
        return (String(nombre[..<punto]), String(nombre[punto...]))
    }

    private func subir(_ url: URL) async {
        let acceso = url.startAccessingSecurityScopedResource()
        defer { if acceso { url.stopAccessingSecurityScopedResource() } }
        let nombreOriginal = url.lastPathComponent
        guard let datos = try? Data(contentsOf: url) else { errorArchivos = "no se pudo leer «\(nombreOriginal)»."; return }
        guard datos.count <= Self.maxBytes else { errorArchivos = "«\(nombreOriginal)» pesa demasiado (máximo 50 MB)."; return }
        subiendo = true
        defer { subiendo = false }
        do {
            let s = try await c.entorno.auth.sesionValida()
            let cliente = c.entorno.cliente
            let nombre = String(Int64(Date().timeIntervalSince1970 * 1000)) + "_" + Self.nombreLimpio(nombreOriginal)
            var r = cliente.peticion("storage/v1/object/documents/\(s.userId)/\(nombre)", metodo: "POST", token: s.accessToken, cuerpo: datos, tiempo: 120)
            r.setValue("application/pdf", forHTTPHeaderField: "Content-Type")
            r.setValue("false", forHTTPHeaderField: "x-upsert")
            let (_, codigo) = try await cliente.enviar(r)
            guard codigo == 200 else { errorArchivos = "no se pudo subir «\(nombreOriginal)»."; return }
            c.avisar("documento subido.")
            await cargarArchivos()
        } catch {
            errorArchivos = "sin conexión: no se pudo subir."
        }
    }

    private func renombrar(_ a: ArchivoDocumento, _ texto: String) async {
        renombrando = nil
        let base = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !base.isEmpty else { return }
        let nuevo = Self.nombreLimpio(base + Self.partes(a.nombre).1)
        guard nuevo != a.nombre else { return }
        let viejo = a.nombre
        await storage("storage/v1/object/move", metodo: "POST", hecho: "nombre cambiado.", fallo: "no se pudo renombrar: ¿ya hay un archivo con ese nombre?") { uid in
            ["bucketId": "documents", "sourceKey": uid + "/" + viejo, "destinationKey": uid + "/" + nuevo]
        }
    }

    private func borrar(_ a: ArchivoDocumento) async {
        let nombre = a.nombre
        await storage("storage/v1/object/documents", metodo: "DELETE", hecho: "documento borrado.", fallo: "no se pudo borrar «\(nombre)».") { uid in
            ["prefixes": [uid + "/" + nombre]]
        }
    }

    private func storage(_ ruta: String, metodo: String, hecho: String, fallo: String, cuerpo: (String) -> [String: Any]) async {
        do {
            let s = try await c.entorno.auth.sesionValida()
            let cliente = c.entorno.cliente
            let datos = try JSONSerialization.data(withJSONObject: cuerpo(s.userId))
            let (_, codigo) = try await cliente.enviar(cliente.peticion(ruta, metodo: metodo, token: s.accessToken, cuerpo: datos, tiempo: 20))
            guard codigo == 200 else { errorArchivos = fallo; return }
            errorArchivos = nil
            c.avisar(hecho)
            await cargarArchivos()
        } catch {
            errorArchivos = "sin conexión: inténtalo cuando vuelva la red."
        }
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        guard let nuevo = await ultimaGana({ doc.map { LecturaDocumentos.fichas($0) } ?? [] }) else { return }
        fichas = nuevo
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

    // 0.23 (auditoría): un documento enorme no se baja entero a memoria.
    static let maxBytes = 50 << 20

    private func ver(_ a: ArchivoDocumento) async {
        guard bajando == nil else { return }
        if let b = a.bytes, b > Self.maxBytes { errorArchivos = "«\(a.nombre)» pesa demasiado para abrirlo aquí (máximo 50 MB)."; return }
        bajando = a.nombre
        defer { bajando = nil }
        do {
            let s = try await c.entorno.auth.sesionValida()
            let cliente = c.entorno.cliente
            let (d, codigo) = try await cliente.enviar(cliente.peticion(LecturaDocumentos.ruta(s.userId, a.nombre), token: s.accessToken, tiempo: 60))
            guard codigo == 200, d.count <= Self.maxBytes else { errorArchivos = "no se pudo abrir «\(a.nombre)»."; return }
            ArchivosTemporales.borrar(vista)
            vista = try ArchivosTemporales.escribir(d, como: a.nombre)
        } catch {
            errorArchivos = "no se pudo abrir «\(a.nombre)»."
        }
    }
}

struct FichaEditando: Identifiable, Equatable {
    let id: String
    let ficha: FichaDocumento?
}

// saveEntry type document (js/entradas.js): título, fecha (la caducidad) y notas; `docTipo` como la op del conector.
// Lo demás de la ficha (url, etiquetas, lo que añada la web) se conserva.
enum FichaDocumentoOp {
    static let tipo = "fichaDocumento"

    static func op(id: String, titulo: String, tipoDoc: String, caduca: String, notas: String) -> OperacionBitacora {
        OperacionesExtra.op(tipo, ["id": .string(id), "titulo": .string(titulo), "docTipo": .string(tipoDoc), "caduca": .string(caduca), "notas": .string(notas)])
    }

    static func aplicar(_ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        guard let id = d["id"]?.texto, let titulo = d["titulo"]?.texto?.trimmingCharacters(in: .whitespacesAndNewlines), !titulo.isEmpty else { return valores }
        var lista = (valores["entries"] ?? nil)?.lista ?? []
        let campos: [String: JSONValue] = ["title": .string(String(titulo.prefix(200))), "date": .string(d["caduca"]?.texto ?? ""),
                                           "notes": .string(String((d["notas"]?.texto ?? "").prefix(2000))), "docTipo": .string(d["docTipo"]?.texto ?? "")]
        if let n = lista.firstIndex(where: { $0["id"]?.comoId == id }) {
            guard var e = lista[n].objeto, e["type"]?.texto == "document" else { return valores }
            let antes = e
            campos.forEach { e[$0.key] = $0.value }
            if (d["docTipo"]?.texto ?? "").isEmpty, antes["docTipo"] == nil { e.removeValue(forKey: "docTipo") }
            guard e != antes else { return valores }
            lista[n] = .object(e)
        } else {
            var e = campos
            e["id"] = .string(id); e["type"] = .string("document"); e["categoryId"] = .string("cat_general"); e["tags"] = .array([])
            if (d["docTipo"]?.texto ?? "").isEmpty { e.removeValue(forKey: "docTipo") }
            lista.append(.object(e))
        }
        var r = valores
        r["entries"] = .some(.array(lista))
        return r
    }
}

struct EditorFichaDocumento: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let editando: FichaEditando
    @State private var titulo: String
    @State private var tipoDoc: String
    @State private var conFecha: Bool
    @State private var caduca: Date
    @State private var notas: String
    @State private var borrar = false
    @State private var error: String?
    @State private var descartar = false
    @State private var original: [String]?
    static let tipos = ["DNI", "pasaporte", "carné de conducir", "seguro", "garantía", "contrato", "ITV", "tarjeta sanitaria"]

    init(editando: FichaEditando) {
        self.editando = editando
        let f = editando.ficha
        _titulo = State(initialValue: f?.titulo ?? "")
        _tipoDoc = State(initialValue: f?.tipo ?? "")
        _notas = State(initialValue: f?.notas ?? "")
        let dia = f.flatMap { LocalDay(iso: $0.caduca) }
        _conFecha = State(initialValue: dia != nil)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        _caduca = State(initialValue: dia.flatMap { cal.date(from: DateComponents(year: $0.year, month: $0.month, day: $0.day, hour: 12)) } ?? Date())
    }

    var body: some View {
        NavigationStack {
            FormCasa {
                Section {
                    TextField("qué es (dni, seguro del coche…).", text: $titulo)
                    TextField("tipo.", text: $tipoDoc)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Medida.xs) {
                            ForEach(Self.tipos, id: \.self) { t in
                                let on = tipoDoc == t
                                Button {
                                    Haptica.seleccion()
                                    withAnimation(Muelle.rapido) { tipoDoc = t }
                                } label: {
                                    Text(t.lowercased() + ".")
                                        .font(Letra.pieFuerte).padding(.horizontal, Medida.s).frame(minHeight: Medida.toque)
                                        .foregroundStyle(on ? Lienzo.sobreOscuro : Lienzo.tinta)
                                        .background(on ? Lienzo.oscuro : Lienzo.sutil, in: Capsule())
                                        .contentShape(Capsule())
                                }
                                .buttonStyle(.pulsable(0.94))
                                .accessibilityAddTraits(on ? .isSelected : [])
                            }
                        }
                    }
                }.listRowBackground(Paleta.superficie)
                Section {
                    Toggle("caduca.", isOn: $conFecha.animation(Muelle.rapido))
                    if conFecha { DatePicker("el día.", selection: $caduca, displayedComponents: .date).environment(\.locale, Locale(identifier: "es_ES")) }
                    TextField("notas.", text: $notas, axis: .vertical).lineLimit(1...5)
                } footer: {
                    if let error { Text(error).foregroundStyle(Paleta.error) }
                }.listRowBackground(Paleta.superficie)
                if editando.ficha != nil {
                    Section { Button("borrar la ficha.", role: .destructive) { borrar = true } }.listRowBackground(Paleta.superficie)
                }
            }
            .font(Tipo.cuerpo).scrollContentBackground(.hidden).background(Paleta.fondo)
            .navigationTitle(editando.ficha == nil ? "nueva ficha." : "ficha.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { if cambiado { descartar = true } else { cerrar() } } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") { Task { await enviar(FichaDocumentoOp.op(id: editando.id, titulo: titulo, tipoDoc: tipoDoc.trimmingCharacters(in: .whitespaces), caduca: fechaTexto, notas: notas)) } }
                        .disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .confirmationDialog("¿borrar esta ficha?", isPresented: $borrar, titleVisibility: .visible) {
                Button("borrar.", role: .destructive) { Task { await enviar(.borrarEntrada(id: editando.id)) } }
                Button("cancelar.", role: .cancel) {}
            }
            .onAppear { if original == nil { original = clave } }
            .preguntarAlDescartar(cambiado, preguntar: $descartar) { cerrar() }
        }
        .presentationDetents([.large])
    }

    // B10: el borrador frente a lo que había al abrir.
    private var clave: [String] { [titulo, tipoDoc, fechaTexto, notas].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) } }
    private var cambiado: Bool { original.map { $0 != clave } ?? false }

    private var fechaTexto: String {
        guard conFecha else { return "" }
        return CalendarioBitacora.madrid.dia(de: caduca).iso
    }

    private func enviar(_ op: OperacionBitacora) async {
        do { try await c.encolar(op); cerrar() } catch { self.error = "no se pudo guardar en este iPhone." }
    }
}
