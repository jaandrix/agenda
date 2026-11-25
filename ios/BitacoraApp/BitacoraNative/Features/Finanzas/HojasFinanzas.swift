import SwiftUI
import UniformTypeIdentifiers

// Las hojas de Finanzas: importar un extracto, buscar un movimiento, los que esperan categoría, el gestor de
// suscripciones con su formulario y «¿me lo puedo permitir?». Todo lo calcula MotorFinanzas con el código de la web.

@MainActor
func motorListo(_ c: AppCoordinator) async throws -> MotorFinanzas {
    let m = MotorFinanzas.compartido
    if let doc = await c.documentoVisible() { try await m.cargar(doc) }
    return m
}

// La respuesta del motor ({resultado, cambios}) a la cola, como una operación (commitFinanceChange). false si no se guardó.
@MainActor
func encolarCambiosFinanzas(_ datos: Data, _ c: AppCoordinator) async -> Bool {
    guard let r = try? LectorJSON.valor(datos), let cambios = r["cambios"], cambios != .null else { return true }
    let doc = await c.documentoVisible()
    guard let op = CambioFinanzas.operacion(cambios, sobre: doc) else { return true }
    do { try await c.encolar(op); return true } catch { return false }
}

// Los errores que lanza la web (`throw new Error('Introduce un importe válido')`), sin el «Error:» delante.
func mensajeMotor(_ e: Error, _ otro: String) -> String {
    if case let ErrorMotorFinanzas.js(m) = e { return m.replacingOccurrences(of: "Error: ", with: "") }
    return (e as? LocalizedError)?.errorDescription ?? otro
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
        if let op = CambioFinanzas.operacion(todo, sobre: nil) { await c.guardar(op) }
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
                Image(uiImage: img).resizable().scaledToFit().enGrises()
            } else {
                Text(String(titulo.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased())
                    .font(Tipo.poppins(lado * 0.5, .bold, estilo: .footnote)).foregroundStyle(Lienzo.tintaSecundaria)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Lienzo.sutil)
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
    @State private var sobranMarcados = Set<String>()
    @State private var arreglado: String?
    // 0.23: la lectura del archivo va fuera del hilo principal y se puede cancelar; lo pegado, la última petición gana.
    @State private var lectura: Task<Void, Never>?
    @State private var generacion = 0

    var body: some View {
        NavigationStack {
            FormCasa {
                if lectura != nil {
                    Section {
                        HStack { ProgressView(); Text("leyendo el archivo…").foregroundStyle(Lienzo.tintaSecundaria) }
                        Button("cancelar la lectura.") { lectura?.cancel(); lectura = nil }
                    }
                } else if let r = resultado {
                    Section {
                        Text(r.texto + (r.quitados > 0 ? ", \(r.quitados) \(r.quitados == 1 ? "duplicado quitado" : "duplicados quitados")" : "") + ".")
                        if let q = r.cuadre {
                            if q.cuadra {
                                Text("saldo cuadrado con el extracto: " + (q.retenido > 0 ? "\(FormatoFin.dinero(q.saldoBanco ?? q.esperado)) en el banco menos \(FormatoFin.dinero(q.retenido)) retenidos que aún no enseña, \(FormatoFin.dinero(q.esperado))" : FormatoFin.dinero(q.esperado)) + ".")
                                    .foregroundStyle(Lienzo.positivo)
                            }
                        }
                    }
                    if let q = r.cuadre, !q.cuadra { cuadreView(q) }
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
                            .task(id: pegado) {
                                guard !pegado.isEmpty else { return }
                                try? await Task.sleep(for: .milliseconds(300))
                                guard !Task.isCancelled else { return }
                                await preparar(pegado, silencioso: true)
                            }
                    }
                }
                if let error { Section { Text(error).foregroundStyle(Lienzo.negativo) } }
            }
            .font(Letra.cuerpo)
            .scrollContentBackground(.hidden)
            .background(Lienzo.fondo)
            .navigationTitle("importar extracto.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if resultado == nil { ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } } }
            }
            // La acción que cierra el paso, abajo y a todo el ancho: importar (con cuántos) y, al acabar, «hecho.».
            .safeAreaInset(edge: .bottom) {
                if resultado != nil || vista != nil {
                    VStack(spacing: 0) {
                        if resultado != nil {
                            BotonFin(texto: "hecho.", acento: true) { cerrar() }
                        } else if let v = vista {
                            BotonFin(texto: trabajando ? "importando…" : textoImportar(v), acento: v.confirmada && v.formatoListo) { Task { await ejecutar() } }
                                .disabled(!v.confirmada || !v.formatoListo || trabajando)
                        }
                    }
                    .padding(.horizontal, Medida.margen).padding(.top, 10).padding(.bottom, 8)
                    .background(Lienzo.fondo.ignoresSafeArea(edges: .bottom))
                    .overlay(alignment: .top) { Rectangle().fill(Lienzo.filo).frame(height: 1) }
                }
            }
            .fileImporter(isPresented: $elegir, allowedContentTypes: Self.tiposArchivo) { r in
                lectura?.cancel()
                lectura = Task { await leerArchivo(r) }
            }
            .onDisappear { lectura?.cancel() }
            .disabled(trabajando)
        }
    }

    // Sin `.data` (auditoría P0): solo texto y hojas de cálculo que se puedan identificar.
    static let tiposArchivo: [UTType] = [.commaSeparatedText, .tabSeparatedText, .plainText, .spreadsheet]
        + [UTType(filenameExtension: "xlsx"), UTType(filenameExtension: "csv")].compactMap { $0 }

    private func textoImportar(_ v: VistaImportacion) -> String {
        guard v.confirmada else { return "elige la cuenta primero." }
        guard v.formatoListo else { return "elige el formato primero." }
        let n = v.nuevas
        return n == 0 ? "comprobar el saldo con el extracto." : "importar \(n) \(n == 1 ? "movimiento" : "movimientos")."
    }

    @ViewBuilder private func vistaPrevia(_ v: VistaImportacion) -> some View {
        Section {
            Picker("cuenta.", selection: Binding(get: { v.cuenta }, set: { k in Task { await paso("importarCuenta", [k]) } })) {
                ForEach(v.cuentas) { Text($0.nombre).tag($0.id) }
            }
            if v.cuentaDetectada { Text("la he sacado del archivo.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) }
            else if !v.confirmada {
                Text("no la he podido sacar del archivo: elígela o confírmala.").font(Letra.pie).foregroundStyle(Lienzo.negativo)
                Button("es \(v.cuentas.first { $0.id == v.cuenta }?.nombre ?? v.cuenta).") { Task { await paso("importarConfirmar", []) } }
            }
        }
        if let f = v.formato, f.preguntaFechas || f.preguntaDecimal { formatoView(f) }
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text(v.nuevas > 0 ? "\(v.nuevas) \(v.nuevas == 1 ? "nueva" : "nuevas")" : "nada nuevo").font(Letra.cuerpoFuerte)
                Text((v.ya > 0 ? "\(v.ya) ya \(v.ya == 1 ? "estaba" : "estaban") en \(v.cuentas.first { $0.id == v.cuenta }?.nombre ?? v.cuenta)" : "ninguna estaba ya")
                     + (v.fuera > 0 ? ", \(v.fuera) \(v.fuera == 1 ? "no cuenta" : "no cuentan") (anuladas, de una hucha o con un estado que no conozco)" : "") + ", de \(v.total) filas.")
                    .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                if let r = v.repetido, !r.isEmpty {
                    Text("Este mismo archivo ya lo importaste el \(r): lo que ya está no entra otra vez.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                }
                if !v.conSaldo {
                    Text("Este extracto no trae la columna de saldo: no podré comprobar que cuadra con el banco.").font(Letra.pie).foregroundStyle(Lienzo.negativo)
                }
            }
        }
        Section {
            ForEach(v.filas) { f in
                Toggle(isOn: Binding(get: { f.marcada }, set: { on in Task { await paso("importarFila", [String(f.fila), on ? "true" : "false"]) } })) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(f.dia).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).frame(width: 52, alignment: .leading)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(f.concepto.isEmpty ? "sin concepto" : f.concepto).lineLimit(1)
                            if !f.fuera.isEmpty { Text(f.fuera).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) }
                            else if f.ya { Text("parece que ya está.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) }
                            else if let p = f.posible, !p.isEmpty { Text(p).font(Letra.pie).foregroundStyle(Lienzo.negativo) }
                        }
                        Spacer()
                        if let i = f.importe {
                            Text((i > 0 ? "+" : "") + FormatoFin.dinero(i)).monospacedDigit().foregroundStyle(i > 0 ? Lienzo.positivo : Lienzo.tinta)
                        }
                    }
                }
                .disabled(f.bloqueada ?? false)
            }
        } header: {
            Text("las filas.")
        } footer: {
            Text("Salen desmarcadas las que ya están (mismo importe y concepto, o dos que suman un traspaso ya apuntado). Las que solo se parecen por el importe siguen marcadas, con un aviso: míralas. Las anuladas y las de una hucha no cuentan nunca.")
        }
    }

    // 0.26 (F-08): si las filas no dicen si 04/05 es 4 de mayo o 5 de abril, o si 1,234 son mil o uno, se pregunta.
    @ViewBuilder private func formatoView(_ f: VistaImportacion.Formato) -> some View {
        Section {
            if f.preguntaFechas {
                Picker("las fechas.", selection: Binding(get: { f.dudaFechas ? "" : f.fechas }, set: { k in Task { await paso("importarFormato", ["fechas", k]) } })) {
                    if f.dudaFechas { Text("elige.").tag("") }
                    Text("día/mes/año").tag("dmy")
                    Text("mes/día/año").tag("mdy")
                }
            }
            if f.preguntaDecimal {
                Picker("los importes.", selection: Binding(get: { f.dudaDecimal ? "" : f.decimal }, set: { k in Task { await paso("importarFormato", ["decimal", k]) } })) {
                    if f.dudaDecimal { Text("elige.").tag("") }
                    Text("1,234 son 1,23 €").tag(",")
                    Text("1,234 son 1.234 €").tag(".")
                }
            }
        } header: {
            Text("el formato del archivo.")
        } footer: {
            Text("No lo puedo saber por las filas: 04/05 puede ser 4 de mayo o 5 de abril, y 1,234 puede ser 1,23 € o 1.234 €.")
        }
    }

    // openFinanceProCuadre: el saldo no cuadra. Lo que sobra o falta entre las fechas del extracto y los tres arreglos.
    @ViewBuilder private func cuadreView(_ q: ResultadoImportacion.Cuadre) -> some View {
        Section("el saldo no cuadra.") {
            FilaDato(etiqueta: "el extracto dice", valor: FormatoFin.dinero(q.esperado))
            FilaDato(etiqueta: "bitácora dice", valor: FormatoFin.dinero(q.actual))
            FilaDato(etiqueta: "diferencia", valor: (q.diff > 0 ? "+" : "") + FormatoFin.dinero(q.diff), tono: q.diff != 0 ? Lienzo.negativo : Lienzo.tinta)
            if let d = q.detalle {
                Text("Saldo de \(q.cuenta) a \(d.hasta), ya descontados los cargos pendientes. He cruzado uno a uno los movimientos del \(d.desde) al \(d.hasta) con el extracto.")
                    .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
            }
        }
        if let arreglado {
            Section { Text(arreglado).foregroundStyle(Lienzo.positivo) }
        } else if let d = q.detalle {
            if !d.sobran.isEmpty {
                Section {
                    Text(d.sobran.contains { $0.marcado == true }
                         ? "marcado = se borra de bitácora. Ya he marcado lo justo para que cuadre: pulsa «borrar los marcados.» y listo."
                         : "marcado = se borra de bitácora. Ninguna combinación cuadra sola: marca solo lo que sepas que no pasó.")
                        .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    ForEach(d.sobran) { t in
                        Toggle(isOn: Binding(get: { sobranMarcados.contains(t.id) }, set: { if $0 { sobranMarcados.insert(t.id) } else { sobranMarcados.remove(t.id) } })) {
                            HStack { Text(t.dia).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).frame(width: 52, alignment: .leading); VStack(alignment: .leading, spacing: 1) { Text(t.concepto).lineLimit(1); if let m = t.motivo, !m.isEmpty { Text(m).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) } }; Spacer(); Text((t.tipo == "income" ? "+" : "-") + FormatoFin.dinero(t.importe)).monospacedDigit() }
                        }
                    }
                    Button("borrar los marcados.") { Task { await arreglar("cuadreQuitar", ["ids": Array(sobranMarcados)]) } }.disabled(sobranMarcados.isEmpty)
                } header: { Text("sobran en bitácora (no están en el extracto).") }
                .onAppear { if sobranMarcados.isEmpty { sobranMarcados = Set(d.sobran.filter { $0.marcado == true }.map(\.id)) } }
            }
            if !d.faltan.isEmpty {
                Section("faltan en bitácora (están en el extracto).") {
                    ForEach(Array(d.faltan.enumerated()), id: \.offset) { _, f in
                        HStack { Text(f.dia).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).frame(width: 52, alignment: .leading); Text(f.concepto).lineLimit(1); Spacer(); Text((f.importe > 0 ? "+" : "") + FormatoFin.dinero(f.importe)).monospacedDigit() }
                    }
                }
            }
            Section {
                Button("ajustar el saldo a \(FormatoFin.dinero(q.esperado)).") { Task { await arreglar("cuadreAjustar", [:]) } }
                Button("fijar el saldo de partida.") { Task { await arreglar("cuadreFijar", [:], foto: "saldo de partida de \(q.cuenta)") } }
            } footer: {
                let suma = d.sobran.reduce(0) { $0 + abs($1.importe) }
                Text("Fijar el saldo de partida no añade ningún movimiento: cambia con cuánto empezaba la cuenta para que coincida con el extracto. Es lo que toca al importar el historial de meses atrás. Antes, quita lo que sobra si son ajustes de saldo antiguos. "
                     + (!d.sobran.isEmpty && abs(suma - abs(q.diff)) < 0.005 ? "Lo que sobra explica justo la diferencia: quitándolo, cuadra." : !d.sobran.isEmpty || !d.faltan.isEmpty ? "Revisa la lista: si la diferencia viene de antes de estas fechas, el ajuste la deja a cero sin tocar nada más." : "Los movimientos de estas fechas coinciden: la diferencia viene de antes. El ajuste la deja a cero sin tocar tu histórico."))
            }
        }
    }

    private func arreglar(_ accion: String, _ datos: [String: Any], foto: String? = nil) async {
        trabajando = true; defer { trabajando = false }
        do {
            let m = try await motorListo(c)
            if let foto, let uid = c.sesion?.userId, let f = try? await m.crudo("foto"), let s = String(data: f, encoding: .utf8) {
                FotosImportacion.guardar(uid, texto: foto, movimientos: (try? LectorJSON.valor(f))?["financePro"]?["transactions"]?.lista?.count ?? 0, foto: s)
            }
            let json = String(data: try JSONSerialization.data(withJSONObject: datos), encoding: .utf8) ?? "{}"
            let r = try await m.crudo("accion", [accion, json])
            guard await encolarCambiosFinanzas(r, c) else { error = "no se pudo guardar en este iPhone."; return }
            arreglado = (try? LectorJSON.valor(r))?["resultado"]?.texto ?? "hecho."
        } catch { self.error = mensajeMotor(error, "no se pudo arreglar.") }
    }

    private func leerArchivo(_ r: Result<URL, Error>) async {
        do {
            let url = try r.get()
            let acceso = url.startAccessingSecurityScopedResource(); defer { if acceso { url.stopAccessingSecurityScopedResource() } }
            let trabajo = Task.detached(priority: .userInitiated) { try LectorExtracto.leer(url: url) }
            let texto = try await withTaskCancellationHandler { try await trabajo.value } onCancel: { trabajo.cancel() }
            try Task.checkCancellation()
            lectura = nil
            await preparar(texto)
        } catch is CancellationError {
            self.error = nil
        } catch {
            lectura = nil
            self.error = (error as? LocalizedError)?.errorDescription ?? "no se pudo leer el archivo."
        }
    }

    private func preparar(_ texto: String, silencioso: Bool = false) async {
        guard !texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            if !silencioso { error = "el portapapeles está vacío: copia el extracto o elige el archivo." }
            return
        }
        generacion += 1
        let gen = generacion
        trabajando = true; defer { if gen == generacion { trabajando = false } }
        do {
            let m = try await motorListo(c)
            let d = try await m.crudo("importarPreparar", [texto, ""])
            guard gen == generacion else { return }
            if let v = try? JSONDecoder().decode(VistaImportacion.self, from: d) { vista = v; error = nil }
            else if !silencioso { error = "El archivo no tiene filas suficientes." }
        } catch { if !silencioso && gen == generacion { self.error = (error as? LocalizedError)?.errorDescription ?? "no se pudo leer el extracto." } }
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
            // financeImportGuardarAntes: la foto de antes, para «deshacer importación.».
            if let uid = c.sesion?.userId, let foto = try? await MotorFinanzas.compartido.crudo("foto"), let s = String(data: foto, encoding: .utf8) {
                let n = (try? LectorJSON.valor(foto))?["financePro"]?["transactions"]?.lista?.count ?? 0
                let cuenta = vista.flatMap { v in v.cuentas.first { $0.id == v.cuenta }?.nombre } ?? ""
                FotosImportacion.guardar(uid, texto: "importación de \(cuenta)", movimientos: n, foto: s)
            }
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
                            Text(m.vacio).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).padding(.vertical, Medida.m)
                        }
                        ForEach(m.grupos) { g in
                            EtiquetaFin(texto: g.titulo.lowercased() + ".", detalle: oculto ? nil : (g.neto >= 0 ? "+" : "") + FormatoFin.dinero(g.neto))
                            ListaMovs(filas: g.filas, oculto: oculto, abrir: abrir)
                            if g.mas > 0 { Text("y \(g.mas) más: afina la búsqueda.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).padding(.vertical, 6) }
                        }
                    } else {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, Medida.xl)
                    }
                }
                .padding(.horizontal, Medida.margen).padding(.bottom, Medida.xxl)
            }
            .background(Lienzo.fondo)
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
        VStack(alignment: .leading, spacing: Medida.xs) {
            BuscadorCapsula(texto: $f.search, placeholder: "buscar por categoría, nota o cuenta")
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
        .padding(.top, Medida.xs)
    }

    private func chip(_ t: String, _ on: Bool) -> some View {
        Text(t.lowercased() + ".").font(on ? Letra.pieFuerte : Letra.detalle)
            .foregroundStyle(on ? Lienzo.tinta : Lienzo.tintaSecundaria)
            .padding(.horizontal, 10).frame(minHeight: 34)
            .background(on ? Lienzo.sutil : Color.clear, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous).stroke(Lienzo.filo))
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
                        .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).padding(.vertical, Medida.xs)
                    if let filas {
                        if filas.isEmpty { Text("nada por ajustar.").font(Letra.cuerpo).foregroundStyle(Lienzo.tintaSecundaria) }
                        ListaMovs(filas: filas, oculto: oculto, abrir: abrir)
                    } else { ProgressView().frame(maxWidth: .infinity) }
                }
                .padding(.horizontal, Medida.margen)
            }
            .background(Lienzo.fondo)
            .navigationTitle("por ajustar.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } } }
            .tareaVisible(id: c.revision) {
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
                            .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).padding(.vertical, Medida.xs)
                        ForEach(m.activas) { s in
                            fila(id: s.id, titulo: s.titulo, texto: "día \(s.dia), \(s.faltan == 0 ? "hoy" : s.faltan == 1 ? "mañana" : "en \(s.faltan) días")", importe: s.importe, aviso: false) {
                                boton("dar de baja.") { Task { await accion(s.id, "baja"); await recargar() } }
                            }
                        }
                        Button { editar(nil) } label: {
                            Text("+ añadir.").font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.naranjaProfundo).frame(minHeight: 48)
                        }.buttonStyle(.pulsable)
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
                    } else { ProgressView().frame(maxWidth: .infinity).padding(.top, Medida.xl) }
                }
                .padding(.horizontal, Medida.margen).padding(.bottom, Medida.xxl)
            }
            .background(Lienzo.fondo)
            .navigationTitle("suscripciones.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } } }
            .tareaVisible(id: c.revision) { await recargar() }
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
            HStack(alignment: .center, spacing: Medida.xs) {
                LogoSuscripcion(id: id, titulo: titulo, logos: logos, lado: 34)
                Button { editar(id) } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(titulo).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).lineLimit(1)
                        Text(texto).font(Letra.pie).foregroundStyle(aviso ? Lienzo.negativo : Lienzo.tintaSecundaria).lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                }.buttonStyle(.pulsable)
                Text(din(importe)).font(Letra.numero).monospacedDigit().foregroundStyle(Lienzo.tinta)
            }
            HStack(spacing: 6) { botones() }.padding(.leading, 34 + Medida.xs)
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) { Rectangle().fill(Lienzo.filo).frame(height: 1) }
    }

    private func boton(_ t: String, rojo: Bool = false, _ a: @escaping () -> Void) -> some View {
        Button(action: a) {
            Text(t).font(Letra.pieFuerte).foregroundStyle(rojo ? Lienzo.negativo : Lienzo.tinta)
                .padding(.horizontal, 10).frame(minHeight: 32)
                .background(Lienzo.sutil, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
                .frame(minHeight: 44).contentShape(Rectangle())
        }.buttonStyle(.pulsable)
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
            FormCasa {
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
                if let error { Section { Text(error).foregroundStyle(Lienzo.negativo) } }
            }
            .font(Letra.cuerpo)
            .scrollContentBackground(.hidden)
            .background(Lienzo.fondo)
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
                VStack(alignment: .leading, spacing: Medida.xs) {
                    TextField("¿cuánto cuesta? 0,00 €", text: $texto).keyboardType(.decimalPad).focused($foco)
                        .font(Letra.numeroGrande).padding(.horizontal, 12).frame(minHeight: 52)
                        .background(Lienzo.sutil, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
                    if let p, let precio {
                        let titulo = ["si": "sí, sin problema.", "justo": "sí, pero justo.", "no": "este mes, mejor no."][p.veredicto] ?? ""
                        VStack(alignment: .leading, spacing: 4) {
                            Text(titulo).font(Letra.titulo).foregroundStyle(p.veredicto == "no" ? Lienzo.negativo : p.veredicto == "justo" ? Lienzo.naranjaProfundo : Lienzo.positivo)
                            Text(p.tras >= 0 ? "Te quedarían unos \(FormatoFin.dinero(p.tras)) hasta fin de mes (\(p.quedanDias) \(p.quedanDias == 1 ? "día" : "días"))." : "Te faltarían unos \(FormatoFin.dinero(-p.tras)) para llegar a fin de mes.")
                                .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        }
                        .padding(.vertical, Medida.xs)
                        FilaDato(etiqueta: "tienes en tus cuentas", valor: FormatoFin.dinero(p.saldo))
                        FilaDato(etiqueta: p.suficiente ? "lo que sueles gastar de aquí a fin de mes" : "a tu ritmo de este mes, hasta fin de mes", valor: "−" + FormatoFin.dinero(p.resto))
                        if p.cargos != 0 { FilaDato(etiqueta: "suscripciones y gastos fijos que faltan", valor: "−" + FormatoFin.dinero(p.cargos)) }
                        if p.programado != 0 { FilaDato(etiqueta: "gastos programados", valor: "−" + FormatoFin.dinero(p.programado)) }
                        FilaDato(etiqueta: "esto", valor: "−" + FormatoFin.dinero(precio))
                        if p.veredicto == "no" && p.colchon >= precio {
                            Text("Tu sueldo sin asignar de otros meses (\(FormatoFin.dinero(p.colchon))) sí lo cubriría.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        }
                        if !p.suficiente {
                            Text("Con un par de meses de movimientos, el cálculo usa lo que es normal en ti y no solo este mes.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        }
                    } else {
                        Text("Escribe el precio y te digo cómo quedaría tu mes con tu ritmo de gasto, los cargos que faltan y lo que tienes programado.")
                            .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    }
                }
                .padding(20)
            }
            .background(Lienzo.fondo)
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
