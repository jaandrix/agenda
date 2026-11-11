import SwiftUI
import UniformTypeIdentifiers

// Las hojas de Finanzas: importar un extracto, buscar un movimiento, los que esperan categoría, el gestor de
// suscripciones con su formulario y «¿me lo puedo permitir?». Todo lo calcula MotorFinanzas con el código de la web.

@MainActor
func motorListo(_ c: AppCoordinator) async throws -> MotorFinanzas {
    let m = MotorFinanzas.compartido
    if let doc = await c.documentoVisible() { try await m.cargar(doc, revision: String(c.informe.revision)) }
    return m
}

// MARK: - logos

// Los logos de las suscripciones y gastos fijos, como en la web (suscripcionesBuscarLogos): la función `portadas` con
// `tipo: 'logo'` da la imagen, que se guarda en la propia entrada como data URL (viaja con los datos y no se vuelve a
// descargar). `logo: false` es «no se encontró», y se reintenta pasado un mes. Las imágenes se decodifican una vez.
@MainActor @Observable
final class LogosFinanzas {
    static let compartido = LogosFinanzas()
    private(set) var imagenes: [String: UIImage] = [:]
    @ObservationIgnored private var firmas: [String: Int] = [:]
    @ObservationIgnored private var buscando = false
    @ObservationIgnored private var intentados = Set<String>()

    func cargar(motor: MotorFinanzas, coordinador c: AppCoordinator) async {
        if let d = try? await motor.crudo("logos"), let mapa = try? JSONDecoder().decode([String: String].self, from: d) {
            let nuevos = mapa.filter { firmas[$0.key] != $0.value.hashValue }
            if !nuevos.isEmpty || mapa.count != imagenes.count {
                let decodificadas = await Task.detached(priority: .utility) { () -> [String: UIImage] in
                    var r: [String: UIImage] = [:]
                    for (id, url) in nuevos {
                        guard let coma = url.firstIndex(of: ","), let datos = Data(base64Encoded: String(url[url.index(after: coma)...])),
                              let img = UIImage(data: datos) else { continue }
                        r[id] = img.preparingForDisplay() ?? img
                    }
                    return r
                }.value
                var todas = imagenes.filter { mapa[$0.key] != nil }
                for (k, v) in decodificadas { todas[k] = v }
                for (k, v) in nuevos { firmas[k] = v.hashValue }
                imagenes = todas
            }
        }
        await buscar(motor: motor, c: c)
    }

    private struct Pendiente: Decodable { let id, q, dominio: String; let adivinar: Bool }

    private func buscar(motor: MotorFinanzas, c: AppCoordinator) async {
        guard !buscando, let d = try? await motor.crudo("logoPendientes"),
              let pendientes = try? JSONDecoder().decode([Pendiente].self, from: d) else { return }
        let lista = pendientes.filter { !intentados.contains($0.id) }
        guard !lista.isEmpty else { return }
        buscando = true
        defer { buscando = false }
        guard let s = try? await c.entorno.auth.sesionValida() else { return }
        let cliente = c.entorno.cliente
        let hoy = CalendarioBitacora.madrid.dia(de: Date()).iso
        var cambios: [JSONValue] = []
        for p in lista {
            intentados.insert(p.id)
            var cuerpo: [String: Any] = ["tipo": "logo", "q": p.q, "adivinar": p.adivinar]
            if !p.dominio.isEmpty { cuerpo["dominio"] = p.dominio }
            guard let datos = try? JSONSerialization.data(withJSONObject: cuerpo),
                  let res = try? await cliente.enviar(cliente.peticion("functions/v1/portadas", metodo: "POST", token: s.accessToken, cuerpo: datos, tiempo: 15)),
                  res.1 == 200, let j = try? LectorJSON.valor(res.0), let o = j.objeto, o.keys.contains("imagen") else { break }
            var poner: [String: JSONValue] = ["logoIntento": .string(hoy)]
            if let img = o["imagen"]?.texto, img.hasPrefix("data:image/") { poner["logo"] = .string(img) } else { poner["logo"] = .bool(false) }
            if let dom = o["dominio"]?.texto, !dom.isEmpty { poner["logoDominio"] = .string(dom) }
            cambios.append(.object(["id": .string(p.id), "poner": .object(poner), "quitar": .array([])]))
        }
        guard !cambios.isEmpty else { return }
        let todo: JSONValue = .object(["entradas": .object(["anadir": .array([]), "cambiar": .array(cambios), "quitar": .array([])])])
        if let op = CambioFinanzas.operacion(todo, sobre: nil) { try? await c.encolar(op) }
    }
}

// logoSuscripcionHtml: la imagen, o la inicial si no hay.
struct LogoSuscripcion: View {
    let id: String
    let titulo: String
    let logos: LogosFinanzas
    var lado: CGFloat = 28

    var body: some View {
        Group {
            if let img = logos.imagenes[id] {
                Image(uiImage: img).resizable().scaledToFit()
            } else {
                Text(String(titulo.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased())
                    .font(Tipo.poppins(lado * 0.5, .bold, estilo: .footnote)).foregroundStyle(Paleta.textoSecundario)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Paleta.tinteTexto)
            }
        }
        .frame(width: lado, height: lado)
        .clipShape(RoundedRectangle(cornerRadius: lado * 0.28, style: .continuous))
        .accessibilityHidden(true)
    }
}

// MARK: - importar

// El importador de la web (financeProPrepararImport → renderFinanceProImportFilas → financeProEjecutarImport, y después
// el cuadre con el saldo y los duplicados claros): pegar del portapapeles (pegarExtractoBancario) o elegir el archivo.
struct ImportarExtractoView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let guardar: (Data) async -> Bool

    @State private var vista: VistaImportacion?
    @State private var elegir = false
    @State private var pegado = ""
    @State private var resultado: ResultadoImportacion?
    @State private var error: String?
    @State private var trabajando = false

    var body: some View {
        NavigationStack {
            Form {
                if let r = resultado {
                    Section {
                        Text(r.texto + (r.quitados > 0 ? ", \(r.quitados) \(r.quitados == 1 ? "duplicado quitado" : "duplicados quitados")" : "") + ".")
                        if let q = r.cuadre {
                            if q.cuadra {
                                Text("saldo cuadrado con el extracto: " + (q.retenido > 0 ? "\(FormatoFin.dinero(q.saldoBanco ?? q.esperado)) en el banco menos \(FormatoFin.dinero(q.retenido)) retenidos que aún no enseña, \(FormatoFin.dinero(q.esperado))" : FormatoFin.dinero(q.esperado)) + ".")
                                    .foregroundStyle(Paleta.progreso)
                            } else {
                                Text("el saldo de \(q.cuenta.lowercased()) no cuadra con el extracto: el banco dice \(FormatoFin.dinero(q.esperado)) y Bitácora \(FormatoFin.dinero(q.actual)) (\(FormatoFin.dinero(q.diff)) de diferencia). Revísalo en la web, en Finanzas, para ver qué sobra o falta.")
                                    .foregroundStyle(Paleta.atencion)
                            }
                        }
                    }
                } else if let v = vista {
                    vistaPrevia(v)
                } else {
                    Section {
                        Button("pegar del portapapeles.") { Task { await preparar(UIPasteboard.general.string ?? "") } }
                        Button("elegir el archivo del banco.") { elegir = true }
                    } footer: {
                        Text("CSV, TSV, TXT o Excel (.xlsx) de cualquier banco: Revolut, Ibercaja, N26, ING, Sabadell, BBVA, Santander, PayPal...")
                    }
                    Section("o pega aquí el extracto.") {
                        TextEditor(text: $pegado).frame(minHeight: 120).font(.system(.footnote, design: .monospaced))
                            .onChange(of: pegado) { _, t in if !t.isEmpty { Task { await preparar(t, silencioso: true) } } }
                    }
                }
                if let error { Section { Text(error).foregroundStyle(Paleta.error) } }
            }
            .font(Tipo.cuerpo)
            .scrollContentBackground(.hidden)
            .background(Paleta.fondo)
            .navigationTitle("importar extracto.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(resultado == nil ? "cancelar." : "hecho.") { cerrar() } }
            }
            .fileImporter(isPresented: $elegir, allowedContentTypes: [.commaSeparatedText, .tabSeparatedText, .plainText, .spreadsheet, .data]) { r in
                Task { await leerArchivo(r) }
            }
            .disabled(trabajando)
        }
    }

    @ViewBuilder private func vistaPrevia(_ v: VistaImportacion) -> some View {
        Section {
            Picker("cuenta.", selection: Binding(get: { v.cuenta }, set: { k in Task { await paso("importarCuenta", [k]) } })) {
                ForEach(v.cuentas) { Text($0.nombre).tag($0.id) }
            }
            if v.cuentaDetectada { Text("la he sacado del archivo.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
            else if !v.confirmada {
                Text("no la he podido sacar del archivo: elígela o confírmala.").font(Tipo.pie).foregroundStyle(Paleta.atencion)
                Button("es \(v.cuentas.first { $0.id == v.cuenta }?.nombre ?? v.cuenta).") { Task { await paso("importarConfirmar", []) } }
            }
        }
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text(v.nuevas > 0 ? "\(v.nuevas) \(v.nuevas == 1 ? "nueva" : "nuevas")" : "nada nuevo").font(Tipo.cuerpoFuerte)
                Text((v.ya > 0 ? "\(v.ya) ya \(v.ya == 1 ? "estaba" : "estaban") en \(v.cuentas.first { $0.id == v.cuenta }?.nombre ?? v.cuenta)" : "ninguna estaba ya")
                     + (v.fuera > 0 ? ", \(v.fuera) \(v.fuera == 1 ? "no cuenta" : "no cuentan") (anuladas o de una hucha)" : "") + ", de \(v.total) filas.")
                    .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            }
            Button(v.confirmada ? v.boton : "elige la cuenta primero.") { Task { await ejecutar() } }
                .font(Tipo.cuerpoFuerte).disabled(!v.confirmada)
        }
        Section {
            ForEach(v.filas) { f in
                Toggle(isOn: Binding(get: { f.marcada }, set: { on in Task { await paso("importarFila", [String(f.fila), on ? "true" : "false"]) } })) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(f.dia).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).frame(width: 52, alignment: .leading)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(f.concepto.isEmpty ? "sin concepto" : f.concepto).lineLimit(1)
                            if !f.fuera.isEmpty { Text(f.fuera).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
                            else if f.ya { Text("parece que ya está.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
                        }
                        Spacer()
                        if let i = f.importe {
                            Text((i > 0 ? "+" : "") + FormatoFin.dinero(i)).monospacedDigit().foregroundStyle(i > 0 ? Paleta.progreso : Paleta.texto)
                        }
                    }
                }
            }
        } header: {
            Text("las filas.")
        } footer: {
            Text("Las que parecen ya apuntadas (mismo importe en 4 días, o dos que suman uno) salen desmarcadas. Puedes cambiar cualquiera.")
        }
    }

    private func leerArchivo(_ r: Result<URL, Error>) async {
        do {
            let url = try r.get()
            let acceso = url.startAccessingSecurityScopedResource(); defer { if acceso { url.stopAccessingSecurityScopedResource() } }
            let datos = try Data(contentsOf: url)
            let texto = try await Task.detached { try LectorExtracto.leer(datos, nombre: url.lastPathComponent) }.value
            await preparar(texto)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "no se pudo leer el archivo."
        }
    }

    private func preparar(_ texto: String, silencioso: Bool = false) async {
        guard !texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            if !silencioso { error = "el portapapeles está vacío: copia el extracto o elige el archivo." }
            return
        }
        trabajando = true; defer { trabajando = false }
        do {
            let m = try await motorListo(c)
            let d = try await m.crudo("importarPreparar", [texto, ""])
            if let v = try? JSONDecoder().decode(VistaImportacion.self, from: d) { vista = v; error = nil }
            else if !silencioso { error = "El archivo no tiene filas suficientes." }
        } catch { if !silencioso { self.error = (error as? LocalizedError)?.errorDescription ?? "no se pudo leer el extracto." } }
    }

    private func paso(_ f: String, _ args: [String]) async {
        do {
            let d = try await MotorFinanzas.compartido.crudo(f, args)
            vista = try JSONDecoder().decode(VistaImportacion.self, from: d)
        } catch { self.error = "no se pudo cambiar." }
    }

    private struct Respuesta: Decodable { let resultado: ResultadoImportacion }

    private func ejecutar() async {
        trabajando = true; defer { trabajando = false }
        do {
            let d = try await MotorFinanzas.compartido.crudo("importarEjecutar")
            guard await guardar(d) else { error = "no se pudo guardar en este iPhone. Todo sigue como estaba."; return }
            resultado = try JSONDecoder().decode(Respuesta.self, from: d).resultado
        } catch { self.error = (error as? LocalizedError)?.errorDescription ?? "no se pudo importar." }
    }
}

// MARK: - buscar

// openFinanceProAllTxModal: buscar por categoría, nota o cuenta, con cuenta, mes, año y categoría.
struct BusquedaMovimientosView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let oculto: Bool
    let abrir: (FilaMov) -> Void
    @State private var f = FiltroBusqueda()
    @State private var m: ModeloBusqueda?

    private static let meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    filtros
                    if let m {
                        if m.grupos.isEmpty {
                            Text(m.vacio).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.m)
                        }
                        ForEach(m.grupos) { g in
                            EtiquetaFin(texto: g.titulo.lowercased() + ".", detalle: oculto ? nil : (g.neto >= 0 ? "+" : "") + FormatoFin.dinero(g.neto))
                            ForEach(g.filas) { x in FilaMovView(f: x, oculto: oculto, abrir: abrir) }
                            if g.mas > 0 { Text("y \(g.mas) más: afina la búsqueda.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, 6) }
                        }
                    } else {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, Espacio.l)
                    }
                }
                .padding(.horizontal, 20).padding(.bottom, Espacio.xl)
            }
            .background(Paleta.fondo)
            .navigationTitle("movimientos.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } } }
            .task(id: f) {
                if !f.search.isEmpty { try? await Task.sleep(nanoseconds: 180_000_000) }
                guard !Task.isCancelled, let motor = try? await motorListo(c),
                      let r = try? await motor.llamar("buscar", [f.json], como: ModeloBusqueda.self) else { return }
                m = r
            }
        }
    }

    private var filtros: some View {
        VStack(alignment: .leading, spacing: Espacio.s) {
            TextField("Buscar por categoría, nota o cuenta...", text: $f.search)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .font(Tipo.cuerpo).padding(.horizontal, 12).frame(minHeight: 44)
                .background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    Menu {
                        Button("Todas las cuentas") { f.account = "" }
                        ForEach(m?.cuentas ?? []) { o in Button(o.nombre) { f.account = o.id } }
                    } label: { chip(f.account.isEmpty ? "cuenta" : (m?.cuentas.first { $0.id == f.account }?.nombre ?? f.account), !f.account.isEmpty) }
                    Menu {
                        Button("Todos los meses") { f.month = "" }
                        ForEach(1...12, id: \.self) { n in Button(Self.meses[n - 1]) { f.month = String(format: "%02d", n) } }
                    } label: { chip(f.month.isEmpty ? "mes" : Self.meses[(Int(f.month) ?? 1) - 1], !f.month.isEmpty) }
                    Menu {
                        Button("Todos los años") { f.year = "" }
                        ForEach(m?.anios ?? [], id: \.self) { y in Button(y) { f.year = y } }
                    } label: { chip(f.year.isEmpty ? "año" : f.year, !f.year.isEmpty) }
                    Menu {
                        Button("Todas las categorías") { f.category = "" }
                        Button("Sin categoría") { f.category = "__none__" }
                        ForEach(m?.categorias ?? []) { o in Button(o.nombre) { f.category = o.id } }
                    } label: { chip(f.category.isEmpty ? "categoría" : f.category == "__none__" ? "sin categoría" : (m?.categorias.first { $0.id == f.category }?.nombre ?? "categoría"), !f.category.isEmpty) }
                }
            }
        }
        .padding(.top, Espacio.s)
    }

    private func chip(_ t: String, _ on: Bool) -> some View {
        Text(t.lowercased() + ".").font(Tipo.poppins(13, on ? .semibold : .regular, estilo: .caption))
            .foregroundStyle(on ? Paleta.texto : Paleta.textoSecundario)
            .padding(.horizontal, 10).frame(minHeight: 34)
            .background(on ? Paleta.tinteTexto : Color.clear, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radio.control, style: .continuous).stroke(Paleta.borde))
    }
}

// MARK: - por ajustar

struct RevisarMovimientosView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let oculto: Bool
    let abrir: (FilaMov) -> Void
    @State private var filas: [FilaMov]?

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    Text("ponles categoría y revisa la cuenta: al guardar con categoría dejan de estar por ajustar.")
                        .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s)
                    if let filas {
                        if filas.isEmpty { Text("nada por ajustar.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario) }
                        ForEach(filas) { f in FilaMovView(f: f, oculto: oculto, abrir: abrir) }
                    } else { ProgressView().frame(maxWidth: .infinity) }
                }
                .padding(.horizontal, 20)
            }
            .background(Paleta.fondo)
            .navigationTitle("por ajustar.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } } }
            .task(id: c.informe.revision) {
                if let m = try? await motorListo(c), let r = try? await m.llamar("revisar", como: [FilaMov].self) { filas = r }
            }
        }
    }
}

// MARK: - suscripciones

// renderGestorSuscripciones: activas por el día de cobro con «dar de baja.», «+ añadir.» y las dadas de baja con «dar
// de alta.» y «borrar.» (y el aviso si el banco sigue cobrando).
struct GestorSuscripcionesView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let logos: LogosFinanzas
    let oculto: Bool
    let editar: (String?) -> Void
    let accion: (String, String) async -> Void
    @State private var m: ModeloGestor?
    @State private var borrar: ModeloGestor.Baja?

    private func din(_ v: Double) -> String { oculto ? "•••" : FormatoFin.dinero(v) }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if let m {
                        let total = m.activas.reduce(0) { $0 + $1.importe }
                        Text(m.activas.isEmpty ? "Ninguna activa." : "\(m.activas.count) \(m.activas.count == 1 ? "activa" : "activas"), \(din(total)) al mes, \(din(total * 12)) al año.")
                            .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s)
                        ForEach(m.activas) { s in
                            fila(id: s.id, titulo: s.titulo, texto: "día \(s.dia), \(s.faltan == 0 ? "hoy" : s.faltan == 1 ? "mañana" : "en \(s.faltan) días")", importe: s.importe, aviso: false) {
                                boton("dar de baja.") { Task { await accion(s.id, "baja"); await recargar() } }
                            }
                        }
                        Button { editar(nil) } label: {
                            Text("+ añadir.").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.acento).frame(minHeight: 48)
                        }.buttonStyle(.plain)
                        if !m.deBaja.isEmpty {
                            EtiquetaFin(texto: "dadas de baja.")
                            ForEach(m.deBaja) { s in
                                let texto = (s.desde.isEmpty ? "de baja" : "desde el \(s.desde)") + (s.cobro.map { ", sigue cobrando: \(din($0.importe)) el \($0.fecha)" } ?? "")
                                fila(id: s.id, titulo: s.titulo, texto: texto, importe: s.importe, aviso: s.cobro != nil) {
                                    boton("dar de alta.") { Task { await accion(s.id, "alta"); await recargar() } }
                                    boton("borrar.", rojo: true) { borrar = s }
                                }
                            }
                        }
                    } else { ProgressView().frame(maxWidth: .infinity).padding(.top, Espacio.l) }
                }
                .padding(.horizontal, 20).padding(.bottom, Espacio.xl)
            }
            .background(Paleta.fondo)
            .navigationTitle("suscripciones.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } } }
            .task(id: c.informe.revision) { await recargar() }
            .confirmationDialog(borrar.map { "¿Borrar \($0.titulo) de la lista? Los gastos ya apuntados se quedan." } ?? "", isPresented: Binding(get: { borrar != nil }, set: { if !$0 { borrar = nil } }), titleVisibility: .visible) {
                Button("borrar.", role: .destructive) { if let s = borrar { Task { await accion(s.id, "borrar"); await recargar() } }; borrar = nil }
                Button("cancelar.", role: .cancel) { borrar = nil }
            }
        }
    }

    private func recargar() async {
        if let motor = try? await motorListo(c), let r = try? await motor.llamar("gestor", como: ModeloGestor.self) { m = r }
    }

    private func fila<B: View>(id: String, titulo: String, texto: String, importe: Double, aviso: Bool, @ViewBuilder botones: () -> B) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: Espacio.s) {
                LogoSuscripcion(id: id, titulo: titulo, logos: logos, lado: 34)
                Button { editar(id) } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(titulo).font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto).lineLimit(1)
                        Text(texto).font(Tipo.pie).foregroundStyle(aviso ? Paleta.atencion : Paleta.textoSecundario).lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                }.buttonStyle(.plain)
                Text(din(importe)).font(Tipo.poppins(15, .semibold, estilo: .body)).monospacedDigit().foregroundStyle(Paleta.texto)
            }
            HStack(spacing: 6) { botones() }.padding(.leading, 34 + Espacio.s)
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
    }

    private func boton(_ t: String, rojo: Bool = false, _ a: @escaping () -> Void) -> some View {
        Button(action: a) {
            Text(t).font(Tipo.poppins(13, .medium, estilo: .footnote)).foregroundStyle(rojo ? Paleta.error : Paleta.texto)
                .padding(.horizontal, 10).frame(minHeight: 32)
                .background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
        }.buttonStyle(.plain)
    }
}

// El formulario de suscripción o gasto fijo de la web (openNewEntry('subscription') / saveEntry).
struct EditorSuscripcionView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let id: String?
    let guardar: (Data) async -> Bool

    private struct Datos: Codable { var id: String; var tipo: String; var titulo: String; var importe: String; var dia: Int; var activa: Bool; var cuenta: String; var vigilar: Bool; var web: String }
    @State private var d = Datos(id: "", tipo: "subscription", titulo: "", importe: "", dia: 1, activa: true, cuenta: "bancos", vigilar: false, web: "")
    @State private var cuentas: [(String, String)] = []
    @State private var error: String?
    @State private var guardando = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if id == nil {
                        Picker("tipo.", selection: $d.tipo) { Text("suscripción.").tag("subscription"); Text("gasto fijo.").tag("fixed_expense") }.pickerStyle(.segmented)
                    }
                    TextField("nombre.", text: $d.titulo)
                    TextField("importe mensual.", text: $d.importe).keyboardType(.decimalPad)
                    TextField("web, para el logo (opcional).", text: $d.web).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Stepper("día de cargo: \(d.dia).", value: $d.dia, in: 1...31)
                    Toggle("activa.", isOn: $d.activa)
                }
                Section {
                    Picker("cuenta a la que se carga.", selection: $d.cuenta) {
                        if d.tipo != "subscription" { Text("no registrar como movimiento.").tag("") }
                        ForEach(cuentas, id: \.0) { Text($0.1).tag($0.0) }
                    }
                    Toggle("avisarme si no aparece en el banco.", isOn: $d.vigilar)
                } footer: {
                    Text(d.tipo == "subscription"
                         ? "Se registra sola como gasto el día de cargo de cada mes. Si luego importas el extracto del banco, el cargo real sustituye a este en vez de duplicarse."
                         : "Si eliges una cuenta, este cargo se registrará solo como movimiento el día indicado de cada mes.")
                }
                if let error { Section { Text(error).foregroundStyle(Paleta.error) } }
            }
            .font(Tipo.cuerpo)
            .scrollContentBackground(.hidden)
            .background(Paleta.fondo)
            .navigationTitle(id == nil ? "nueva suscripción." : "suscripción.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") { Task { await enviar() } }
                        .disabled(guardando || d.titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .task {
                guard let motor = try? await motorListo(c) else { return }
                if let b = try? await motor.llamar("buscar", ["{}"], como: ModeloBusqueda.self) { cuentas = b.cuentas.map { ($0.id, $0.nombre) } }
                if let id, let x = try? await motor.llamar("suscripcionDatos", [id], como: Datos?.self) { d = x }
                else if id == nil { d.id = "entry_\(Int64(Date().timeIntervalSince1970 * 1000))_" + String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(6)).lowercased() }
            }
        }
    }

    private func enviar() async {
        guardando = true; defer { guardando = false }
        var x = d
        x.importe = x.importe.replacingOccurrences(of: ",", with: ".")
        do {
            let json = String(data: try JSONEncoder().encode(x), encoding: .utf8) ?? "{}"
            let r = try await MotorFinanzas.compartido.crudo("guardarSuscripcion", [json])
            if await guardar(r) { cerrar() } else { error = "no se pudo guardar en este iPhone." }
        } catch { self.error = "no se pudo guardar en este iPhone." }
    }
}

// MARK: - ¿me lo puedo permitir?

struct PermitirView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    @State private var texto = ""
    @State private var p: Permitir?
    @FocusState private var foco: Bool

    private var precio: Double? {
        let s = texto.replacingOccurrences(of: "€", with: "").replacingOccurrences(of: " ", with: "")
        return Dinero.decimal(texto: s).map { abs(NSDecimalNumber(decimal: $0).doubleValue) }.flatMap { $0 > 0 ? $0 : nil }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Espacio.s) {
                    TextField("¿cuánto cuesta? 0,00 €", text: $texto).keyboardType(.decimalPad).focused($foco)
                        .font(Tipo.poppins(22, .semibold, estilo: .title3)).padding(.horizontal, 12).frame(minHeight: 52)
                        .background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
                    if let p, let precio {
                        let titulo = ["si": "sí, sin problema.", "justo": "sí, pero justo.", "no": "este mes, mejor no."][p.veredicto] ?? ""
                        VStack(alignment: .leading, spacing: 4) {
                            Text(titulo).font(Tipo.poppins(20, .bold, estilo: .title3)).foregroundStyle(p.veredicto == "no" ? Paleta.atencion : p.veredicto == "justo" ? Paleta.acento : Paleta.progreso)
                            Text(p.tras >= 0 ? "Te quedarían unos \(FormatoFin.dinero(p.tras)) hasta fin de mes (\(p.quedanDias) \(p.quedanDias == 1 ? "día" : "días"))." : "Te faltarían unos \(FormatoFin.dinero(-p.tras)) para llegar a fin de mes.")
                                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        }
                        .padding(.vertical, Espacio.s)
                        FilaLibro(etiqueta: "tienes en tus cuentas", valor: FormatoFin.dinero(p.saldo))
                        FilaLibro(etiqueta: p.suficiente ? "lo que sueles gastar de aquí a fin de mes" : "a tu ritmo de este mes, hasta fin de mes", valor: "−" + FormatoFin.dinero(p.resto))
                        if p.cargos != 0 { FilaLibro(etiqueta: "suscripciones y gastos fijos que faltan", valor: "−" + FormatoFin.dinero(p.cargos)) }
                        if p.programado != 0 { FilaLibro(etiqueta: "gastos programados", valor: "−" + FormatoFin.dinero(p.programado)) }
                        FilaLibro(etiqueta: "esto", valor: "−" + FormatoFin.dinero(precio))
                        if p.veredicto == "no" && p.colchon >= precio {
                            Text("Tu sueldo sin asignar de otros meses (\(FormatoFin.dinero(p.colchon))) sí lo cubriría.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        }
                        if !p.suficiente {
                            Text("Con un par de meses de movimientos, el cálculo usa lo que es normal en ti y no solo este mes.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        }
                    } else {
                        Text("Escribe el precio y te digo cómo quedaría tu mes con tu ritmo de gasto, los cargos que faltan y lo que tienes programado.")
                            .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    }
                }
                .padding(20)
            }
            .background(Paleta.fondo)
            .navigationTitle("¿me lo puedo permitir?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } } }
            .onAppear { foco = true }
            .task(id: texto) {
                guard let precio else { p = nil; return }
                if let m = try? await motorListo(c), let r = try? await m.llamar("permitir", [String(precio)], como: Permitir.self) { p = r }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
