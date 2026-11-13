import SwiftUI

// «más opciones.» de Finanzas (mobileFinMenu en la web): cuentas y saldos iniciales, ajustar el saldo de una cuenta,
// categorías (y dividir una), reglas de importación, posibles duplicados y deshacer una importación. Lo que se ve y lo
// que se guarda sale de los mismos modales de la web, en el motor (finanzas-puente.js: gestion y accion).

enum OpcionFinanzas: String, Identifiable, CaseIterable {
    case cuentas, ajustar, categorias, reglas, duplicados, deshacer
    var id: String { rawValue }
    var titulo: String {
        switch self {
        case .cuentas: return "cuentas y saldos iniciales."
        case .ajustar: return "ajustar el saldo de una cuenta."
        case .categorias: return "categorías."
        case .reglas: return "reglas de importación."
        case .duplicados: return "posibles duplicados."
        case .deshacer: return "deshacer importación."
        }
    }
}

struct ModeloGestion: Decodable, Equatable {
    struct Cuenta: Decodable, Equatable, Identifiable { let id, nombre: String; let saldo0, saldo: Double }
    struct Categoria: Decodable, Equatable, Identifiable { let id, nombre, tipo, color: String }
    struct Regla: Decodable, Equatable, Identifiable { let id, texto, cuenta: String; let activa: Bool }
    struct Item: Decodable, Equatable, Identifiable { let id, texto, nota, tipo: String; let importe: Double }
    let cuentas: [Cuenta]
    let categorias: [Categoria]
    let paleta: [String]
    let reglas: [Regla]
    let duplicados: [[Item]]
    let posibles: [[Item]]
}

// financeImportGuardarAntes: una foto de Finanzas antes de cada importación, en este iPhone (las 8 últimas).
enum FotosImportacion {
    struct Foto: Codable, Identifiable { let id: String; let cuando: Date; let texto: String; let movimientos: Int; let foto: String }

    private static func archivo(_ uid: String) -> URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("finanzas-importaciones-\(uid).json")
    }

    static func leer(_ uid: String) -> [Foto] {
        guard let d = try? Data(contentsOf: archivo(uid)) else { return [] }
        return (try? JSONDecoder().decode([Foto].self, from: d)) ?? []
    }

    static func guardar(_ uid: String, texto: String, movimientos: Int, foto: String) {
        let nueva = Foto(id: "imp_\(Int64(Date().timeIntervalSince1970 * 1000))", cuando: Date(), texto: texto, movimientos: movimientos, foto: foto)
        let lista = Array(([nueva] + leer(uid)).prefix(8))
        if let d = try? JSONEncoder().encode(lista) { try? d.write(to: archivo(uid), options: .atomic) }
    }
}

struct MasOpcionesView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let opcion: OpcionFinanzas
    let oculto: Bool

    @State private var m: ModeloGestion?
    @State private var aviso: String?
    @State private var trabajando = false
    // cuentas
    @State private var nombres: [String: String] = [:]
    @State private var saldos0: [String: String] = [:]
    @State private var restablecer = false
    // ajustar
    @State private var cuentaAjuste = "bancos"
    @State private var saldoReal = ""
    // categorías
    @State private var nuevaCat = ""
    @State private var tipoCat = "expense"
    @State private var colorCat = ""
    @State private var borrarCat: ModeloGestion.Categoria?
    @State private var dividir = false
    @State private var origen = ""
    @State private var destinoNombre = "Bar"
    @State private var palabras = "bar, bares, cafe*, cafeter*, menfis, estoril, tabern*, cervec*, pub, tasca, copas"
    @State private var candidatos: [Candidato] = []
    @State private var fuera = Set<String>()
    // reglas
    @State private var textoRegla = ""
    @State private var cuentaRegla = "efectivo"
    // deshacer
    @State private var locales: [FotosImportacion.Foto] = []
    @State private var nube: [CopiaNube] = []
    @State private var volverA: (String, String)?

    struct Candidato: Decodable, Identifiable, Equatable { let id, dia, concepto: String; let importe: Double }
    struct CopiaNube: Decodable, Identifiable { let id: String; let created_at: String; let week_key: String? }

    private func din(_ v: Double) -> String { oculto ? "•••" : FormatoFin.dinero(v) }

    var body: some View {
        NavigationStack {
            Form {
                if let m { contenido(m) } else { ProgressView() }
            }
            .font(Tipo.cuerpo)
            .scrollContentBackground(.hidden)
            .background(Paleta.fondo)
            .navigationTitle(opcion.titulo)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } } }
            .disabled(trabajando)
            .task(id: c.informe.revision) { await recargar() }
            .alert("finanzas.", isPresented: Binding(get: { aviso != nil }, set: { if !$0 { aviso = nil } })) {
                Button("aceptar.", role: .cancel) { aviso = nil }
            } message: { Text(aviso ?? "") }
        }
    }

    @ViewBuilder private func contenido(_ m: ModeloGestion) -> some View {
        switch opcion {
        case .cuentas: cuentas(m)
        case .ajustar: ajustar(m)
        case .categorias: categorias(m)
        case .reglas: reglas(m)
        case .duplicados: duplicados(m)
        case .deshacer: deshacer
        }
    }

    // MARK: cuentas

    @ViewBuilder private func cuentas(_ m: ModeloGestion) -> some View {
        Section {
            Text("El saldo inicial es el punto de partida de cada cuenta antes de tus movimientos registrados: útil si no vas a importar todo tu historial.")
                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
        }
        ForEach(m.cuentas) { cta in
            Section(cta.id) {
                TextField("nombre.", text: Binding(get: { nombres[cta.id] ?? cta.nombre }, set: { nombres[cta.id] = $0 }))
                TextField("saldo inicial (€).", text: Binding(get: { saldos0[cta.id] ?? numero(cta.saldo0) }, set: { saldos0[cta.id] = $0 }))
                    .keyboardType(.numbersAndPunctuation)
            }
        }
        Section {
            Button("guardar.") {
                let lista = m.cuentas.map { ["id": $0.id, "nombre": nombres[$0.id] ?? $0.nombre, "saldo0": saldos0[$0.id] ?? numero($0.saldo0)] }
                Task { await accion("cuentas", ["cuentas": lista], ok: "Cuentas actualizadas") }
            }
            Button("restablecer finanzas.", role: .destructive) { restablecer = true }
        }
        .confirmationDialog("restablecer finanzas. No se puede deshacer.", isPresented: $restablecer, titleVisibility: .visible) {
            Button("solo movimientos y cuentas.", role: .destructive) { Task { await accion("restablecer", ["alcance": "movimientos"], ok: "Movimientos y cuentas restablecidos") } }
            Button("todas las finanzas.", role: .destructive) { Task { await accion("restablecer", ["alcance": "todo"], ok: "Finanzas restablecidas") } }
            Button("cancelar.", role: .cancel) {}
        } message: {
            Text("«solo movimientos y cuentas» borra movimientos, saldos, categorías propias, reglas, programados y presupuestos por categoría. «todas» además la inversión, la emergencia, las cuentas a mano, la planificación, los objetivos y el histórico.")
        }
    }

    private func numero(_ v: Double) -> String { String(format: "%.2f", v).replacingOccurrences(of: ".", with: ",") }

    // MARK: ajustar

    @ViewBuilder private func ajustar(_ m: ModeloGestion) -> some View {
        let actual = m.cuentas.first { $0.id == cuentaAjuste }?.saldo ?? 0
        Section {
            Picker("cuenta.", selection: $cuentaAjuste) { ForEach(m.cuentas) { Text($0.nombre).tag($0.id) } }
            TextField("saldo real (€).", text: $saldoReal).keyboardType(.numbersAndPunctuation)
            Button("guardar.") { Task { await accion("ajustarSaldo", ["cuenta": cuentaAjuste, "saldo": saldoReal.isEmpty ? numero(actual) : saldoReal], ok: nil) } }
        } footer: {
            Text("Saldo actual: \(din(actual)). Escribe el saldo real y se creará un movimiento «Ajuste de saldo» con la diferencia para cuadrarlo, sin tocar tu histórico.")
        }
    }

    // MARK: categorías

    @ViewBuilder private func categorias(_ m: ModeloGestion) -> some View {
        Section {
            Text("Los límites de gasto se ponen en la planificación de largo plazo, vinculando una casilla a la categoría.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
        }
        ForEach(["expense", "income"], id: \.self) { tipo in
            Section(tipo == "expense" ? "gastos." : "ingresos.") {
                let lista = m.categorias.filter { $0.tipo == tipo }
                if lista.isEmpty { Text("ninguna.").foregroundStyle(Paleta.textoSecundario) }
                ForEach(lista) { cat in
                    HStack {
                        Circle().fill(cat.color.isEmpty ? Paleta.textoSecundario : Color(hexWeb: cat.color)).frame(width: 10, height: 10)
                        Text(cat.nombre)
                        Spacer()
                        Button { borrarCat = cat } label: { Image(systemName: "xmark").foregroundStyle(Paleta.error) }.buttonStyle(.plain)
                            .accessibilityLabel("eliminar \(cat.nombre)")
                    }
                }
            }
        }
        Section("nueva categoría.") {
            TextField("nombre.", text: $nuevaCat)
            Picker("tipo.", selection: $tipoCat) { Text("gasto.").tag("expense"); Text("ingreso.").tag("income") }.pickerStyle(.segmented)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(m.paleta, id: \.self) { col in
                        Circle().fill(Color(hexWeb: col)).frame(width: 28, height: 28)
                            .overlay(Circle().stroke(Paleta.texto, lineWidth: (colorCat.isEmpty ? m.paleta.first : colorCat) == col ? 2 : 0))
                            .onTapGesture { colorCat = col }
                    }
                }.padding(.vertical, 4)
            }
            Button("+ añadir categoría.") {
                Task { await accion("categoria", ["nombre": nuevaCat, "tipo": tipoCat, "color": colorCat.isEmpty ? (m.paleta.first ?? "") : colorCat], ok: nil); nuevaCat = "" }
            }
        }
        Section("dividir una categoría.") {
            Text("Saca de una categoría los movimientos cuyo concepto lleva alguna de estas palabras. Con «*» al final cuentan también las que empiezan así. Después Bitácora aprende y los nuevos caen solos.")
                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            Picker("de.", selection: $origen) { ForEach(m.categorias.filter { $0.tipo == "expense" }) { Text($0.nombre).tag($0.id) } }
            TextField("a. nombre de la categoría", text: $destinoNombre)
            TextField("palabras del concepto.", text: $palabras, axis: .vertical).textInputAutocapitalization(.never)
            let marcados = candidatos.filter { !fuera.contains($0.id) }
            Text("\(marcados.count) \(marcados.count == 1 ? "movimiento" : "movimientos") pasan a «\(destinoNombre.isEmpty ? "…" : destinoNombre)», \(din(marcados.reduce(0) { $0 + $1.importe })) en total.")
                .font(Tipo.pie)
            ForEach(candidatos) { t in
                Toggle(isOn: Binding(get: { !fuera.contains(t.id) }, set: { if $0 { fuera.remove(t.id) } else { fuera.insert(t.id) } })) {
                    HStack { Text(t.dia).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).frame(width: 52, alignment: .leading); Text(t.concepto).lineLimit(1); Spacer(); Text("−" + din(t.importe)).monospacedDigit() }
                }
            }
            Button("mover \(marcados.count) a «\(destinoNombre.isEmpty ? "…" : destinoNombre)».") {
                Task { await accion("dividir", ["origen": origen, "nombre": destinoNombre, "palabras": palabras, "fuera": Array(fuera)], ok: nil) }
            }
            .disabled(marcados.isEmpty || destinoNombre.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .task(id: "\(origen)|\(palabras)|\(c.informe.revision)") {
            if origen.isEmpty { origen = m.categorias.first { $0.tipo == "expense" && $0.nombre.lowercased().contains("comida") }?.id ?? m.categorias.first { $0.tipo == "expense" }?.id ?? "" }
            guard !origen.isEmpty else { return }
            fuera = []
            if let r = try? await MotorFinanzas.compartido.llamar("dividirCandidatos", [origen, palabras], como: [Candidato].self) { candidatos = r }
        }
        .confirmationDialog("¿Eliminar esta categoría? Los movimientos que la usaban quedarán sin categoría.", isPresented: Binding(get: { borrarCat != nil }, set: { if !$0 { borrarCat = nil } }), titleVisibility: .visible) {
            Button("eliminar.", role: .destructive) { if let b = borrarCat { Task { await accion("borrarCategoria", ["id": b.id], ok: nil) } }; borrarCat = nil }
            Button("cancelar.", role: .cancel) { borrarCat = nil }
        }
    }

    // MARK: reglas

    @ViewBuilder private func reglas(_ m: ModeloGestion) -> some View {
        Section {
            Text("Para movimientos recurrentes que en realidad son traspasos entre tus propias cuentas: al importar, si el concepto contiene el texto de una regla activa, se registra como traspaso en vez de como ingreso o gasto.")
                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
        }
        Section("reglas.") {
            if m.reglas.isEmpty { Text("Todavía no tienes reglas. Los movimientos importados se registran como ingreso o gasto normal.").foregroundStyle(Paleta.textoSecundario) }
            ForEach(m.reglas) { r in
                HStack {
                    Toggle(isOn: Binding(get: { r.activa }, set: { _ in Task { await accion("activarRegla", ["id": r.id], ok: nil) } })) {
                        VStack(alignment: .leading, spacing: 2) { Text("«\(r.texto)»"); Text("traspaso con \(r.cuenta).").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
                    }
                }
                .swipeActions { Button("eliminar.", role: .destructive) { Task { await accion("borrarRegla", ["id": r.id], ok: nil) } } }
            }
        }
        Section {
            TextField("el concepto contiene. p. ej. Top-up by *1185", text: $textoRegla).textInputAutocapitalization(.never)
            Picker("es un traspaso con.", selection: $cuentaRegla) { ForEach(m.cuentas) { Text($0.nombre).tag($0.id) } }
            Button("+ añadir regla.") { Task { await accion("regla", ["texto": textoRegla, "cuenta": cuentaRegla], ok: nil); textoRegla = "" } }
        } header: {
            Text("nueva regla.")
        } footer: {
            Text("Si el importe del movimiento importado es positivo, se suma aquí y se resta de esa otra cuenta; si es negativo, al revés.")
        }
    }

    // MARK: duplicados

    @ViewBuilder private func duplicados(_ m: ModeloGestion) -> some View {
        if m.duplicados.isEmpty && m.posibles.isEmpty {
            Section { Text("No se han encontrado duplicados probables.").foregroundStyle(Paleta.textoSecundario) }
        }
        if !m.duplicados.isEmpty {
            Section {
                ForEach(Array(m.duplicados.enumerated()), id: \.offset) { _, par in
                    ForEach(par) { t in
                        filaDup(t).swipeActions { Button("eliminar.", role: .destructive) { Task { await borrarMov(t.id) } } }
                    }
                }
            } header: { Text("mismo importe, cuenta y nota.") } footer: {
                Text("Típico de importar dos extractos con periodos solapados. Desliza la copia sobrante para eliminarla.")
            }
        }
        if !m.posibles.isEmpty {
            Section {
                ForEach(Array(m.posibles.enumerated()), id: \.offset) { _, par in
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(par) { filaDup($0) }
                        HStack {
                            Button("fusionar.") { Task { await accion("fusionar", ["a": par[0].id, "b": par[1].id], ok: "Movimientos fusionados") } }.buttonStyle(.bordered)
                            Button("no es duplicado.") { Task { await accion("noDuplicado", ["a": par[0].id, "b": par[1].id], ok: nil) } }.buttonStyle(.bordered)
                        }
                    }
                }
            } header: { Text("mismo importe, concepto distinto.") } footer: {
                Text("Suele ser un gasto que grabaste a mano y el mismo cargo importado del banco. «Fusionar» los deja en uno solo: conserva tu nota y tu categoría y recuerda el concepto del banco para que reimportar el extracto no lo vuelva a duplicar.")
            }
        }
    }

    private func filaDup(_ t: ModeloGestion.Item) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(t.texto).font(Tipo.pie)
                if !t.nota.isEmpty { Text(t.nota).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
            }
            Spacer()
            Text((t.tipo == "income" ? "+" : "-") + din(t.importe)).monospacedDigit().foregroundStyle(t.tipo == "income" ? Paleta.progreso : Paleta.texto)
        }
    }

    // MARK: deshacer

    @ViewBuilder private var deshacer: some View {
        Section {
            Text("Finanzas vuelve a como estaba en ese momento. Lo que cambiaste en Finanzas después también se pierde; el resto de Bitácora no se toca. Antes de deshacer se guarda cómo está ahora, por si quieres volver.")
                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
        }
        Section("en este iPhone.") {
            if locales.isEmpty { Text("Aún no hay ninguna: se guarda una cada vez que importas a partir de ahora.").foregroundStyle(Paleta.textoSecundario) }
            ForEach(locales) { f in
                filaVolver(fecha(f.cuando), "antes de la \(f.texto), \(f.movimientos) movimientos") { volverA = ("local", f.id) }
            }
        }
        Section {
            if nube.isEmpty { Text("No hay copias en la nube.").foregroundStyle(Paleta.textoSecundario) }
            ForEach(nube) { n in
                filaVolver(n.created_at.prefix(16).replacingOccurrences(of: "T", with: " "), "semana \(n.week_key ?? "")") { volverA = ("nube", n.id) }
            }
        } header: { Text("copias de la nube.") } footer: {
            Text("Una por semana, del primer guardado de cada semana. Sirve para lo que importaste antes o desde otro dispositivo.")
        }
        .task { await cargarCopias() }
        .confirmationDialog("¿volver a esa copia?", isPresented: Binding(get: { volverA != nil }, set: { if !$0 { volverA = nil } }), titleVisibility: .visible) {
            Button("volver a esa copia.", role: .destructive) { if let v = volverA { Task { await volver(v.0, v.1) } }; volverA = nil }
            Button("cancelar.", role: .cancel) { volverA = nil }
        } message: { Text("Lo que hiciste en Finanzas después se pierde, pero la situación de ahora se guarda aquí por si quieres volver.") }
    }

    private func filaVolver(_ titulo: String, _ detalle: String, _ a: @escaping () -> Void) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) { Text(titulo); Text(detalle).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
            Spacer()
            Button("volver aquí.", action: a).buttonStyle(.bordered)
        }
    }

    private func fecha(_ d: Date) -> String {
        d.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).hour().minute().locale(Locale(identifier: "es_ES")))
    }

    private func cargarCopias() async {
        if let uid = c.sesion?.userId { locales = FotosImportacion.leer(uid) }
        guard let s = try? await c.entorno.auth.sesionValida() else { return }
        let cl = c.entorno.cliente
        let q = [URLQueryItem(name: "select", value: "id,created_at,week_key"), URLQueryItem(name: "order", value: "created_at.desc"), URLQueryItem(name: "limit", value: "12")]
        if let r = try? await cl.enviar(cl.peticion("rest/v1/bitacora_snapshots", consulta: q, token: s.accessToken)), r.1 == 200,
           let l = try? JSONDecoder().decode([CopiaNube].self, from: r.0) { nube = l }
    }

    private func volver(_ origen: String, _ id: String) async {
        trabajando = true; defer { trabajando = false }
        var foto: String?
        var texto = ""
        if origen == "local", let uid = c.sesion?.userId, let f = FotosImportacion.leer(uid).first(where: { $0.id == id }) {
            foto = f.foto; texto = "antes de la \(f.texto)"
        } else if origen == "nube", let s = try? await c.entorno.auth.sesionValida() {
            let cl = c.entorno.cliente
            let q = [URLQueryItem(name: "select", value: "created_at,fp:data->financePro,ent:data->entries"), URLQueryItem(name: "id", value: "eq.\(id)")]
            if let r = try? await cl.enviar(cl.peticion("rest/v1/bitacora_snapshots", consulta: q, token: s.accessToken, tiempo: 30)), r.1 == 200,
               let l = try? LectorJSON.valor(r.0), let fila = l.lista?.first, let fp = fila["fp"], fp != .null {
                foto = EscritorJSON.texto(.object(["financePro": fp, "entradas": fila["ent"] ?? .array([])]))
                texto = "copia de la nube"
            }
        }
        guard let foto else { aviso = "No se pudo leer esa copia."; return }
        do {
            let m = try await motorListo(c)
            if let uid = c.sesion?.userId, let ahora = try? await m.crudo("foto"), let s = String(data: ahora, encoding: .utf8) {
                FotosImportacion.guardar(uid, texto: "vuelta atrás a como estaba \(texto)", movimientos: (try? LectorJSON.valor(ahora))?["financePro"]?["transactions"]?.lista?.count ?? 0, foto: s)
            }
            let r = try await m.crudo("accion", ["volver", "{\"foto\":" + foto + "}"])
            if await encolarCambiosFinanzas(r, c) { aviso = "Finanzas está como estaba \(texto)."; locales = FotosImportacion.leer(c.sesion?.userId ?? "") }
            else { aviso = "no se pudo guardar en este iPhone." }
        } catch { aviso = mensajeMotor(error, "no se pudo volver a esa copia.") }
    }

    // MARK: común

    private func recargar() async {
        guard let motor = try? await motorListo(c), let r = try? await motor.llamar("gestion", [opcion == .duplicados ? "1" : ""], como: ModeloGestion.self) else { return }
        m = r
    }

    private func borrarMov(_ id: String) async {
        do {
            let r = try await MotorFinanzas.compartido.crudo("borrarMovimiento", [id])
            if !(await encolarCambiosFinanzas(r, c)) { aviso = "no se pudo guardar en este iPhone." }
        } catch { aviso = mensajeMotor(error, "no se pudo borrar.") }
    }

    private func accion(_ nombre: String, _ datos: [String: Any], ok: String?) async {
        trabajando = true; defer { trabajando = false }
        do {
            let json = String(data: try JSONSerialization.data(withJSONObject: datos), encoding: .utf8) ?? "{}"
            _ = try await motorListo(c)
            let r = try await MotorFinanzas.compartido.crudo("accion", [nombre, json])
            guard await encolarCambiosFinanzas(r, c) else { aviso = "no se pudo guardar en este iPhone."; return }
            if let texto = (try? LectorJSON.valor(r))?["resultado"]?.texto { aviso = texto } else if let ok { aviso = ok }
        } catch { aviso = mensajeMotor(error, "no se pudo guardar.") }
    }
}
