import SwiftUI

// «salud.» de Finanzas (0.25): lo que GPT encontró al leer unas finanzas reales, con el motor de la web
// (js/finanzas-salud.js por finanzas-puente.js). Aquí solo se pinta: las cifras y las propuestas salen del motor, y
// toda escritura es una operación de CambioFinanzas. Nada se reclasifica sin que se acepte.

// MARK: - modelos

struct ResumenSalud: Decodable, Equatable {
    let propuestas, porRevisar, avisos: Int
}

struct FilaSalud: Decodable, Identifiable, Equatable {
    let f: FilaMov
    let propuesta: String?
    let motivo: String
    let bizum: Bool
    let con: FilaMov?
    var id: String { f.id }

    private enum Claves: String, CodingKey { case propuesta, motivo, bizum, con }
    init(from decoder: Decoder) throws {
        f = try FilaMov(from: decoder)
        let c = try decoder.container(keyedBy: Claves.self)
        propuesta = try c.decodeIfPresent(String.self, forKey: .propuesta)
        motivo = (try c.decodeIfPresent(String.self, forKey: .motivo)) ?? ""
        bizum = (try c.decodeIfPresent(Bool.self, forKey: .bizum)) ?? false
        con = try c.decodeIfPresent(FilaMov.self, forKey: .con)
    }
}

struct ModeloSalud: Decodable, Equatable {
    struct Aviso: Decodable, Equatable, Identifiable { let clave, texto: String; var id: String { clave } }
    struct Casilla: Decodable, Equatable, Identifiable { let id, label: String; let amount: Double }
    struct Presupuesto: Decodable, Equatable {
        let mes: String
        let cerrado: Bool
        let duplicados: [Casilla]
        let suscripcionesFuera, fijosFuera, ingresos, asignado, exceso: Double
    }
    struct Futuro: Decodable, Equatable, Identifiable {
        let mes, titulo: String
        let duplicados: Int
        let suscripcionesFuera, fijosFuera, exceso, ingresos, asignado: Double
        var id: String { mes }
    }
    struct MesImporte: Decodable, Equatable, Identifiable { let mes: String; let importe: Double; var id: String { mes } }
    struct CatEsencial: Decodable, Equatable, Identifiable { let id, nombre: String; let esencial: Bool }
    struct Estabilizacion: Decodable, Equatable {
        let saldo, objetivo, objetivoPropuesto, base, minimo, maximo: Double
        let baseManual: Bool
        let meses: Int
    }
    struct Colchones: Decodable, Equatable {
        let esencialesMes: Double
        let meses: [MesImporte]
        let categorias: [CatEsencial]
        let elegidasAMano: Bool
        let fondo: Double
        let cubre: Double?
        let mesesObjetivo, objetivoFondo: Double
        let estabilizacion: Estabilizacion
    }
    struct Neto: Decodable, Equatable, Identifiable { let id, nombre: String; let bruto, devuelto, neto: Double; let destacada: Bool }
    struct Cargo: Decodable, Equatable, Identifiable { let id, titulo, fecha: String; let importe: Double }
    struct Semanal: Decodable, Equatable {
        let porRevisar, propuestas: Int
        let queda: Double
        let presupuestosPasados: [String]
        let cargos: [Cargo]
        let ultima: String?
    }
    struct Cifras: Decodable, Equatable {
        let ingresos, gastos, ahorro, invertido, fondo: Double
        let tasa, cubre: Double?
    }
    struct Cierre: Decodable, Equatable {
        let mes, titulo: String
        let cifras: Cifras
        let preguntas, respuestas: [String]
        let cerrado: Bool
    }
    struct Paso: Decodable, Equatable, Identifiable { let clave, nombre, nota: String; let importe: Double; var id: String { clave } }
    struct Reparto: Decodable, Equatable {
        let ingreso, ordinarioBase, falta: Double
        let sinMargen: Bool?
        let pasos: [Paso]
    }
    struct Suscripcion: Decodable, Equatable, Identifiable {
        let id, titulo: String
        let importe: Double
        let ultimoUso, revisadaEn: String?
        let diasSinUso: Double?
        let toca: Bool
    }
    struct Deseo: Decodable, Equatable, Identifiable {
        let id, titulo: String
        let precio: Double
        let esperaHasta: String?
        let horasQuedan, diasSugeridos: Int
        let listo: Bool
    }
    struct Tramo: Decodable, Equatable { let hasta: Double?; let importe: Double }
    struct Avisos: Decodable, Equatable { let semanal, cierre, trimestral: Bool }
    struct Ajustes: Decodable, Equatable {
        let mesesObjetivo, umbralFondo, extraEmergencia: Double
        let ordinario: Double?
        let tramos: [Tramo]
        let avisos: Avisos
    }
    struct Opcion: Decodable, Equatable, Identifiable { let id, nombre: String; let tipo: String? }

    let avisos: [Aviso]
    let propuestas: [FilaSalud]
    let porRevisar: [FilaSalud]
    let bizumsRecibidos: Int?
    let presupuesto: Presupuesto
    let futuros: [Futuro]
    let colchones: Colchones
    let costeNeto: [Neto]
    let semanal: Semanal
    let cierre: Cierre
    let reparto: Reparto
    let suscripciones: [Suscripcion]
    let deseos: [Deseo]
    let ajustes: Ajustes
    let cuentas: [Opcion]
    let categorias: [Opcion]
}

// MARK: - estado

@MainActor @Observable
final class EstadoSalud {
    var m: ModeloSalud?
    var aviso: String?
    var trabajando = false
    var ingresoCobro = ""

    func recargar(_ c: AppCoordinator) async {
        let ingreso = numeroSalud(ingresoCobro).map { String($0) } ?? ""
        let op = "{\"ingreso\":\"" + ingreso + "\"}"
        do {
            let motor = try await motorListo(c)
            let r = try await motor.llamar("salud", [op], como: ModeloSalud.self)
            if r != m { m = r }
        } catch {
            aviso = mensajeMotor(error, "no se pudo calcular.")
        }
    }

    // saludAccion: lo que cambió va a la cola como una operación; el texto de vuelta se enseña.
    func accion(_ c: AppCoordinator, _ nombre: String, _ datos: [String: Any], callado: Bool = false) async {
        trabajando = true
        defer { trabajando = false }
        do {
            let json = String(data: try JSONSerialization.data(withJSONObject: datos), encoding: .utf8) ?? "{}"
            let motor = try await motorListo(c)
            let r = try await motor.crudo("saludAccion", [nombre, json])
            let guardado = await encolarCambiosFinanzas(r, c)
            if !guardado {
                aviso = "no se pudo guardar en este iPhone."
                return
            }
            let texto = (try? LectorJSON.valor(r))?["resultado"]?.texto
            if !callado, let texto { aviso = texto }
            await recargar(c)
        } catch {
            aviso = mensajeMotor(error, "no se pudo guardar.")
        }
    }
}

func numeroSalud(_ t: String) -> Double? {
    let s = t.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "€", with: "")
    if s.isEmpty { return nil }
    let limpio = s.contains(",") ? s.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".") : s
    return Double(limpio)
}

private func textoSalud(_ v: Double?) -> String {
    guard let v else { return "" }
    if v == v.rounded() { return String(Int(v)) }
    return String(format: "%.2f", v).replacingOccurrences(of: ".", with: ",")
}

private func mesesTexto(_ v: Double) -> String {
    let t = String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",").replacingOccurrences(of: ",0", with: "")
    return t + (v == 1 ? " mes" : " meses")
}

// MARK: - hoja principal

struct SaludFinanzasView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let oculto: Bool
    @State private var e = EstadoSalud()

    private func din(_ v: Double) -> String { oculto ? "•••" : FormatoFin.dinero(v) }

    var body: some View {
        NavigationStack {
            Group {
                if let m = e.m { contenido(m) } else { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            }
            .background(Paleta.fondo)
            .navigationTitle("salud.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } } }
            .alert("finanzas.", isPresented: Binding(get: { e.aviso != nil }, set: { if !$0 { e.aviso = nil } })) {
                Button("aceptar.", role: .cancel) { e.aviso = nil }
            } message: { Text(e.aviso ?? "") }
            .task(id: c.revision) { await e.recargar(c) }
        }
    }

    @ViewBuilder
    private func contenido(_ m: ModeloSalud) -> some View {
        FormCasa {
            if !m.avisos.isEmpty {
                Section {
                    ForEach(m.avisos) { a in Text(a.texto).foregroundStyle(Paleta.atencion) }
                }
            }
            seccionClasificacion(m)
            seccionPresupuestos(m)
            seccionColchones(m)
            seccionNeto(m)
            Section {
                NavigationLink("revisión de la semana.") { SemanaSaludView(e: e, oculto: oculto) }
                NavigationLink("día de cobro.") { CobroSaludView(e: e, oculto: oculto) }
                NavigationLink(m.cierre.cerrado ? "cierre de \(m.cierre.titulo.lowercased()), hecho." : "cerrar \(m.cierre.titulo.lowercased()).") { CierreSaludView(e: e, oculto: oculto) }
                NavigationLink("ajustes y avisos.") { AjustesSaludView(e: e) }
            } header: { Text("rutinas.") }
            seccionSuscripciones(m)
            Section {
                NavigationLink("compras grandes.") { DeseosSaludView(e: e, oculto: oculto) }
            } footer: { Text("Antes de una compra grande, espera 48 horas, o una semana si pasa de 150 €, y vuelve a decidir.") }
        }
    }

    private func seccionClasificacion(_ m: ModeloSalud) -> some View {
        Section {
            NavigationLink { PropuestasSaludView(e: e, oculto: oculto) } label: {
                FilaLibro(etiqueta: "propuestas", valor: String(m.propuestas.count))
            }
            NavigationLink { PorRevisarSaludView(e: e, oculto: oculto) } label: {
                FilaLibro(etiqueta: "por revisar", valor: String(m.porRevisar.count))
            }
        } header: { Text("clasificación.") } footer: {
            Text("Ahorro, traspasos, inversión y devoluciones no son ingreso ni gasto. Bitácora propone; nada cambia hasta que lo aceptas.")
        }
    }

    @ViewBuilder
    private func seccionPresupuestos(_ m: ModeloSalud) -> some View {
        let p = m.presupuesto
        let duplicadosFuturos = m.futuros.reduce(0) { $0 + $1.duplicados }
        Section {
            FilaLibro(etiqueta: "ingresos previstos", valor: din(p.ingresos))
            FilaLibro(etiqueta: "planificado", valor: din(p.asignado), acento: p.exceso > 0)
            if p.exceso > 0 {
                Text("Planificas \(din(p.exceso)) más de lo que esperas ingresar.").font(Tipo.pie).foregroundStyle(Paleta.atencion)
            }
            if p.suscripcionesFuera > 0 || p.fijosFuera > 0 {
                Text("Este mes faltan \(din(p.suscripcionesFuera + p.fijosFuera)) de suscripciones y gastos fijos.").font(Tipo.pie).foregroundStyle(Paleta.atencion)
                Button("volver a ponerlos.") { Task { await e.accion(c, "reponerCompromisos", ["mes": p.mes]) } }
            }
            ForEach(m.futuros) { f in
                Text(textoFuturo(f)).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            }
            if !p.duplicados.isEmpty || duplicadosFuturos > 0 {
                Button("quitar las casillas repetidas.") { Task { await e.accion(c, "quitarDuplicados", [:]) } }.disabled(e.trabajando)
            }
        } header: { Text("presupuestos.") } footer: {
            Text("Una casilla repetida tiene el mismo nombre e importe que otra en el mismo mes.")
        }
    }

    private func textoFuturo(_ f: ModeloSalud.Futuro) -> String {
        var partes: [String] = []
        if f.duplicados > 0 { partes.append("\(f.duplicados) \(f.duplicados == 1 ? "casilla repetida" : "casillas repetidas")") }
        if f.suscripcionesFuera + f.fijosFuera > 0 { partes.append("sin suscripciones ni gastos fijos") }
        if f.exceso > 0 { partes.append("\(din(f.exceso)) por encima de lo previsto") }
        return f.titulo.lowercased() + ": " + partes.joined(separator: ", ") + "."
    }

    @ViewBuilder
    private func seccionColchones(_ m: ModeloSalud) -> some View {
        let k = m.colchones
        let s = k.estabilizacion
        Section {
            FilaLibro(etiqueta: "gastos esenciales al mes", valor: k.esencialesMes > 0 ? din(k.esencialesMes) : "sin datos")
            FilaLibro(etiqueta: "tu fondo cubre", valor: k.cubre.map { mesesTexto($0) } ?? "sin datos", acento: (k.cubre ?? 0) < 1)
            if k.objetivoFondo > 0 {
                Text("Para \(mesesTexto(k.mesesObjetivo)) harían falta \(din(k.objetivoFondo)); tienes \(din(k.fondo)).").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            }
            NavigationLink("qué gastos son esenciales.") { EsencialesSaludView(e: e) }
        } header: { Text("fondo de emergencia.") } footer: {
            if !k.elegidasAMano { Text("Con las esenciales por defecto (vivienda, comida, transporte, salud...). Elige las tuyas para que la cifra sea la de verdad.") }
        }
        Section {
            FilaLibro(etiqueta: "tienes", valor: din(s.saldo))
            FilaLibro(etiqueta: "objetivo", valor: s.objetivo > 0 ? din(s.objetivo) : "sin datos")
            FilaLibro(etiqueta: "ingreso de referencia", valor: s.base > 0 ? din(s.base) : "sin datos")
            NavigationLink("cambiar.") { EstabilizacionSaludView(e: e) }
        } header: { Text("reserva de estabilización.") } footer: {
            Text(textoEstabilizacion(s))
        }
    }

    private func textoEstabilizacion(_ s: ModeloSalud.Estabilizacion) -> String {
        if s.meses < 2 { return "Aparte del fondo de emergencia: cubre los meses en que entra menos de lo normal. Con dos meses de ingresos se puede proponer un objetivo." }
        return "Aparte del fondo de emergencia. En los últimos \(s.meses) meses entró entre \(din(s.minimo)) y \(din(s.maximo)). En un mes flojo se usa para llegar a \(din(s.base)); en uno bueno, lo que pasa de ahí la repone."
    }

    @ViewBuilder
    private func seccionNeto(_ m: ModeloSalud) -> some View {
        let lista = m.costeNeto.filter { $0.destacada || $0.devuelto > 0 }
        if !lista.isEmpty {
            Section {
                ForEach(lista) { n in
                    VStack(alignment: .leading, spacing: 2) {
                        FilaLibro(etiqueta: n.nombre.lowercased(), valor: din(n.neto))
                        if n.devuelto > 0 {
                            Text("\(din(n.bruto)) gastados, \(din(n.devuelto)) devueltos o vendidos.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        }
                    }
                }
            } header: { Text("coste neto este mes.") }
        }
    }

    @ViewBuilder
    private func seccionSuscripciones(_ m: ModeloSalud) -> some View {
        if !m.suscripciones.isEmpty {
            Section {
                ForEach(m.suscripciones) { s in FilaSuscripcionSalud(s: s, e: e, oculto: oculto) }
            } header: { Text("suscripciones.") } footer: {
                Text("Cada tres meses, o si llevas un mes sin usarla, pregúntate si la sigues queriendo.")
            }
        }
    }
}

private struct FilaSuscripcionSalud: View {
    @Environment(AppCoordinator.self) private var c
    let s: ModeloSalud.Suscripcion
    let e: EstadoSalud
    let oculto: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(s.titulo).font(Tipo.cuerpoFuerte).foregroundStyle(s.toca ? Paleta.atencion : Paleta.texto)
                Spacer()
                Text(oculto ? "•••" : FormatoFin.dinero(s.importe)).monospacedDigit()
            }
            Text(uso).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            HStack(spacing: Espacio.m) {
                Button("la usé hoy.") { Task { await e.accion(c, "suscripcionUso", ["id": s.id]) } }
                Button("revisada.") { Task { await e.accion(c, "suscripcionRevisada", ["id": s.id]) } }
            }
            .buttonStyle(.borderless).font(Tipo.pie)
        }
    }

    private var uso: String {
        var t = s.ultimoUso.map { "usada por última vez el \($0)" } ?? "sin apuntar cuándo la usaste"
        if let r = s.revisadaEn { t += ", revisada el \(r)" }
        return t + "."
    }
}

// MARK: - propuestas

struct PropuestasSaludView: View {
    @Environment(AppCoordinator.self) private var c
    let e: EstadoSalud
    let oculto: Bool

    private struct Grupo: Identifiable { let id, titulo: String }
    private static let tipos: [Grupo] = [Grupo(id: "apunte", titulo: "apuntes a mano que ya trajo el banco."), Grupo(id: "traspaso", titulo: "traspasos entre tus cuentas."), Grupo(id: "ahorro", titulo: "a o de tus ahorros."),
                                        Grupo(id: "inversion", titulo: "inversión."), Grupo(id: "reembolso", titulo: "devoluciones.")]

    var body: some View {
        let lista = e.m?.propuestas ?? []
        FormCasa {
            if lista.isEmpty {
                Text("nada que proponer.").foregroundStyle(Paleta.textoSecundario)
            }
            ForEach(Self.tipos) { tipo in
                let filas = lista.filter { $0.propuesta == tipo.id }
                if !filas.isEmpty {
                    Section {
                        ForEach(filas) { p in FilaPropuestaSalud(p: p, e: e, oculto: oculto) }
                        Button("aceptar \(filas.count == 1 ? "esta" : "las \(filas.count)").") {
                            Task { await e.accion(c, "propuestas", ["tipo": tipo.id]) }
                        }
                        .disabled(e.trabajando)
                    } header: { Text(tipo.titulo) }
                }
            }
        }
        .navigationTitle("propuestas.")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct FilaPropuestaSalud: View {
    @Environment(AppCoordinator.self) private var c
    let p: FilaSalud
    let e: EstadoSalud
    let oculto: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            FilaMovSalud(f: p.f, oculto: oculto)
            Text(p.motivo).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            HStack(spacing: Espacio.m) {
                Button("sí.") { Task { await e.accion(c, "propuestas", ["ids": [p.f.id]], callado: true) } }
                Button("no, está bien así.") { Task { await e.accion(c, "resolver", ["id": p.f.id, "como": "bien"], callado: true) } }
            }
            .buttonStyle(.borderless).font(Tipo.pie).disabled(e.trabajando)
        }
    }
}

private struct FilaMovSalud: View {
    let f: FilaMov
    let oculto: Bool

    var body: some View {
        let signo = f.tipo == "income" ? "+" : (f.tipo == "expense" ? "−" : "")
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(f.titulo).font(Tipo.cuerpo).lineLimit(1)
                Text([f.dia, f.meta].filter { !$0.isEmpty }.joined(separator: ", ")).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).lineLimit(1)
            }
            Spacer()
            Text(oculto ? "•••" : signo + FormatoFin.dinero(f.importe)).monospacedDigit()
        }
    }
}

// MARK: - por revisar

struct PorRevisarSaludView: View {
    @Environment(AppCoordinator.self) private var c
    let e: EstadoSalud
    let oculto: Bool
    @State private var devolucion: FilaSalud?

    var body: some View {
        let lista = e.m?.porRevisar ?? []
        let bizums = e.m?.bizumsRecibidos ?? 0
        FormCasa {
            if bizums > 0 {
                Section {
                    Menu {
                        ForEach((e.m?.categorias ?? []).filter { $0.tipo == "income" }) { cat in
                            Button(cat.nombre) { Task { await e.accion(c, "bizums", ["categoria": cat.id]) } }
                        }
                    } label: {
                        Text("pasar los \(bizums) Bizums recibidos a...").foregroundStyle(Paleta.acento)
                    }
                    .disabled(e.trabajando)
                } footer: {
                    Text("Casi siempre son amigos pagando su parte. En «Comida y bebida» (la de ingreso) restan de lo que gastas en comida y bebida y dejan de contar como ingreso.")
                }
            }
            if lista.isEmpty { Text("nada por revisar.").foregroundStyle(Paleta.textoSecundario) }
            ForEach(lista) { p in
                VStack(alignment: .leading, spacing: 4) {
                    FilaMovSalud(f: p.f, oculto: oculto)
                    Text(p.motivo).font(Tipo.pie).foregroundStyle(Paleta.atencion)
                    menu(p)
                }
            }
        }
        .navigationTitle("por revisar.")
        .navigationBarTitleDisplayMode(.inline)
        .hoja(item: $devolucion) { p in CompraDevueltaSaludView(p: p, e: e, oculto: oculto) }
    }

    private func menu(_ p: FilaSalud) -> some View {
        let tipo = p.f.tipo
        let categorias = (e.m?.categorias ?? []).filter { ($0.tipo ?? "") == tipo }
        let cuentas = (e.m?.cuentas ?? []).filter { $0.id != p.f.cuenta }
        return Menu {
            Menu("categoría.") {
                ForEach(categorias) { cat in
                    Button(cat.nombre) { Task { await e.accion(c, "resolver", ["id": p.f.id, "como": "categoria", "categoria": cat.id], callado: true) } }
                }
            }
            Button(tipo == "income" ? "sale de mis ahorros." : "va a mis ahorros.") { Task { await e.accion(c, "resolver", ["id": p.f.id, "como": "ahorro"], callado: true) } }
            Button("inversión.") { Task { await e.accion(c, "resolver", ["id": p.f.id, "como": "inversion"], callado: true) } }
            Menu("traspaso con...") {
                ForEach(cuentas) { cu in
                    Button(cu.nombre) { Task { await e.accion(c, "resolver", ["id": p.f.id, "como": "traspaso", "cuenta": cu.id], callado: true) } }
                }
            }
            if tipo == "income" { Button("devolución de una compra...") { devolucion = p } }
            Button("está bien así.") { Task { await e.accion(c, "resolver", ["id": p.f.id, "como": "bien"], callado: true) } }
        } label: {
            Text("resolver.").font(Tipo.pie).foregroundStyle(Paleta.acento)
        }
        .disabled(e.trabajando)
    }
}

private struct CompraDevueltaSaludView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let p: FilaSalud
    let e: EstadoSalud
    let oculto: Bool
    @State private var compras: [FilaMov]?

    var body: some View {
        NavigationStack {
            FormCasa {
                Section {
                    if let compras {
                        if compras.isEmpty { Text("no hay compras anteriores por ese importe o más.").foregroundStyle(Paleta.textoSecundario) }
                        ForEach(compras) { f in
                            Button {
                                Task {
                                    await e.accion(c, "resolver", ["id": p.f.id, "como": "reembolso", "compra": f.id])
                                    cerrar()
                                }
                            } label: { FilaMovSalud(f: f, oculto: oculto) }
                            .buttonStyle(.plain)
                        }
                    } else { ProgressView() }
                } footer: { Text("Restará del gasto de su categoría y no contará como ingreso.") }
            }
            .navigationTitle("¿qué compra devuelve?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } } }
            .task {
                if let m = try? await motorListo(c), let r = try? await m.llamar("saludCompras", [p.f.id], como: [FilaMov].self) { compras = r } else { compras = [] }
            }
        }
    }
}

// MARK: - colchones

struct EsencialesSaludView: View {
    @Environment(AppCoordinator.self) private var c
    let e: EstadoSalud

    var body: some View {
        let cats = e.m?.colchones.categorias ?? []
        FormCasa {
            Section {
                ForEach(cats) { cat in
                    Toggle(cat.nombre, isOn: Binding(get: { cat.esencial }, set: { nuevo in cambiar(cat.id, nuevo, cats) }))
                }
            } footer: { Text("La media de los últimos meses de estas categorías, más los gastos fijos, son tus gastos esenciales.") }
            if e.m?.colchones.elegidasAMano == true {
                Button("volver a las de siempre.") { Task { await e.accion(c, "esenciales", ["ids": NSNull()], callado: true) } }
            }
        }
        .navigationTitle("esenciales.")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func cambiar(_ id: String, _ si: Bool, _ cats: [ModeloSalud.CatEsencial]) {
        var ids = cats.filter { $0.esencial }.map { $0.id }
        if si { ids.append(id) } else { ids.removeAll { $0 == id } }
        Task { await e.accion(c, "esenciales", ["ids": ids], callado: true) }
    }
}

struct EstabilizacionSaludView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var volver
    let e: EstadoSalud
    @State private var saldo = ""
    @State private var objetivo = ""
    @State private var base = ""

    var body: some View {
        let s = e.m?.colchones.estabilizacion
        FormCasa {
            Section {
                campo("tienes.", $saldo, "0")
                campo("objetivo.", $objetivo, s.map { textoSalud($0.objetivoPropuesto) } ?? "")
                campo("ingreso de referencia.", $base, s.map { textoSalud($0.base) } ?? "")
            } footer: {
                Text("Vacío, el objetivo es tres veces lo que faltó en el peor mes y la referencia, la mediana de lo que ha entrado.")
            }
            Button("guardar.") {
                Task {
                    await e.accion(c, "estabilizacion", ["saldo": saldo, "objetivo": objetivo, "base": base])
                    volver()
                }
            }
            .disabled(e.trabajando)
        }
        .navigationTitle("estabilización.")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            guard let s else { return }
            saldo = s.saldo > 0 ? textoSalud(s.saldo) : ""
            objetivo = s.objetivo != s.objetivoPropuesto ? textoSalud(s.objetivo) : ""
            base = s.baseManual ? textoSalud(s.base) : ""
        }
    }

    private func campo(_ t: String, _ v: Binding<String>, _ ph: String) -> some View {
        HStack {
            Text(t)
            Spacer()
            TextField(ph, text: v).keyboardType(.decimalPad).multilineTextAlignment(.trailing).monospacedDigit().frame(maxWidth: 140)
        }
    }
}

// MARK: - rutinas

struct SemanaSaludView: View {
    @Environment(AppCoordinator.self) private var c
    let e: EstadoSalud
    let oculto: Bool

    var body: some View {
        FormCasa {
            if let s = e.m?.semanal {
                Section {
                    FilaLibro(etiqueta: "1. por revisar", valor: String(s.porRevisar))
                    FilaLibro(etiqueta: "2. propuestas", valor: String(s.propuestas))
                    FilaLibro(etiqueta: "3. queda en presupuestos", valor: oculto ? "•••" : FormatoFin.dinero(s.queda))
                    if !s.presupuestosPasados.isEmpty {
                        Text("Pasados: " + s.presupuestosPasados.joined(separator: ", ") + ".").font(Tipo.pie).foregroundStyle(Paleta.atencion)
                    }
                } footer: { Text("Clasifica lo pendiente, corrige traspasos y devoluciones y mira lo que queda.") }
                Section {
                    if s.cargos.isEmpty { Text("ningún cargo en 7 días.").foregroundStyle(Paleta.textoSecundario) }
                    ForEach(s.cargos) { cg in FilaLibro(etiqueta: "\(cg.fecha.suffix(2)), \(cg.titulo.lowercased())", valor: oculto ? "•••" : FormatoFin.dinero(cg.importe)) }
                } header: { Text("4. cargos de los próximos 7 días.") }
                Section {
                    Button(s.ultima.map { "hecha. (la última, el \($0))" } ?? "hecha.") { Task { await e.accion(c, "semanalHecha", [:]) } }
                }
            }
        }
        .navigationTitle("la semana.")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct CobroSaludView: View {
    @Environment(AppCoordinator.self) private var c
    let e: EstadoSalud
    let oculto: Bool
    @State private var ingreso = ""

    var body: some View {
        FormCasa {
            Section {
                HStack {
                    Text("lo que ha entrado.")
                    Spacer()
                    TextField(e.m.map { textoSalud($0.reparto.ingreso) } ?? "", text: $ingreso)
                        .keyboardType(.decimalPad).multilineTextAlignment(.trailing).monospacedDigit().frame(maxWidth: 140)
                        .onSubmit { calcular() }
                }
                Button("repartir.") { calcular() }
            }
            if let r = e.m?.reparto, r.sinMargen == true {
                Section {
                    Text("Lo que gastas de media al mes (\(oculto ? "•••" : FormatoFin.dinero(r.ordinarioBase))) pasa de lo que ha entrado: no queda nada que repartir.")
                    Text("Si tu gasto normal es menor, ponlo en ajustes, «gastos del mes.».").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                }
            } else if let r = e.m?.reparto {
                Section {
                    ForEach(r.pasos) { p in
                        VStack(alignment: .leading, spacing: 2) {
                            FilaLibro(etiqueta: p.nombre, valor: oculto ? "•••" : FormatoFin.dinero(p.importe))
                            if !p.nota.isEmpty { Text(p.nota).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
                        }
                    }
                    if r.falta > 0 {
                        Text("Faltan \(FormatoFin.dinero(r.falta)) para los gastos del mes.").font(Tipo.pie).foregroundStyle(Paleta.atencion)
                    }
                } header: { Text("en este orden.") } footer: {
                    Text("Los gastos del mes son la media de los últimos tres (o lo que pongas en ajustes). La inversión va por tramos de ingreso.")
                }
            }
        }
        .navigationTitle("día de cobro.")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func calcular() {
        e.ingresoCobro = ingreso
        Task { await e.recargar(c) }
    }
}

struct CierreSaludView: View {
    @Environment(AppCoordinator.self) private var c
    let e: EstadoSalud
    let oculto: Bool
    @State private var r1 = ""
    @State private var r2 = ""

    private func din(_ v: Double) -> String { oculto ? "•••" : FormatoFin.dinero(v) }

    private func lineaAhorro(_ x: ModeloSalud.Cifras) -> String {
        guard let t = x.tasa else { return din(x.ahorro) }
        let pct = FormatoFin.pct(t).replacingOccurrences(of: "+", with: "")
        return din(x.ahorro) + ", " + pct
    }

    private func lineaFondo(_ x: ModeloSalud.Cifras) -> String {
        guard let m = x.cubre else { return din(x.fondo) }
        return din(x.fondo) + ", " + mesesTexto(m)
    }

    var body: some View {
        FormCasa {
            if let k = e.m?.cierre {
                Section {
                    FilaLibro(etiqueta: "ingresos", valor: din(k.cifras.ingresos))
                    FilaLibro(etiqueta: "gastos", valor: din(k.cifras.gastos))
                    FilaLibro(etiqueta: "ahorro", valor: lineaAhorro(k.cifras), acento: k.cifras.ahorro < 0)
                    FilaLibro(etiqueta: "a la inversión", valor: din(k.cifras.invertido))
                    FilaLibro(etiqueta: "fondo", valor: lineaFondo(k.cifras))
                } header: { Text(k.titulo.lowercased() + ".") }
                Section {
                    Text(k.preguntas.first ?? "").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    TextField("", text: $r1, axis: .vertical)
                    Text(k.preguntas.last ?? "").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    TextField("", text: $r2, axis: .vertical)
                }
                Section {
                    Button(k.cerrado ? "guardar de nuevo." : "cerrar el mes.") {
                        Task { await e.accion(c, "cerrarMes", ["mes": k.mes, "respuestas": [r1, r2]]) }
                    }
                    .disabled(e.trabajando)
                } footer: { Text("Se guarda en el historial con estas cifras.") }
            }
        }
        .navigationTitle("cierre de mes.")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            guard let k = e.m?.cierre else { return }
            r1 = k.respuestas.first ?? ""
            r2 = k.respuestas.count > 1 ? k.respuestas[1] : ""
        }
    }
}

struct AjustesSaludView: View {
    @Environment(AppCoordinator.self) private var c
    let e: EstadoSalud
    @State private var meses = ""
    @State private var umbral = ""
    @State private var extra = ""
    @State private var ordinario = ""
    @State private var t1 = ""
    @State private var t2 = ""
    @State private var i1 = ""
    @State private var i2 = ""
    @State private var i3 = ""

    var body: some View {
        FormCasa {
            Section {
                campo("meses de fondo.", $meses)
                campo("umbral del fondo.", $umbral)
                campo("% de lo que sobra al fondo.", $extra)
                campo("gastos del mes.", $ordinario, "la media")
            } header: { Text("colchones y reparto.") }
            Section {
                campo("hasta", $t1)
                campo("invierte", $i1)
                campo("hasta", $t2)
                campo("invierte", $i2)
                campo("más, invierte", $i3)
            } header: { Text("inversión por tramos de ingreso.") }
            Section {
                Button("guardar.") { Task { await guardar() } }.disabled(e.trabajando)
            }
            if let a = e.m?.ajustes.avisos {
                Section {
                    Toggle("revisión de la semana.", isOn: Binding(get: { a.semanal }, set: { avisos(semanal: $0, cierre: a.cierre, trimestral: a.trimestral) }))
                    Toggle("cierre de mes.", isOn: Binding(get: { a.cierre }, set: { avisos(semanal: a.semanal, cierre: $0, trimestral: a.trimestral) }))
                    Toggle("revisión de suscripciones.", isOn: Binding(get: { a.trimestral }, set: { avisos(semanal: a.semanal, cierre: a.cierre, trimestral: $0) }))
                } header: { Text("avisos.") } footer: { Text("Salen arriba de «salud.» cuando toca.") }
            }
        }
        .navigationTitle("ajustes.")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { rellenar() }
    }

    private func rellenar() {
        guard let a = e.m?.ajustes else { return }
        meses = textoSalud(a.mesesObjetivo); umbral = textoSalud(a.umbralFondo); extra = textoSalud(a.extraEmergencia)
        ordinario = textoSalud(a.ordinario)
        let t = a.tramos
        if t.count > 0 { t1 = textoSalud(t[0].hasta); i1 = textoSalud(t[0].importe) }
        if t.count > 1 { t2 = textoSalud(t[1].hasta); i2 = textoSalud(t[1].importe) }
        if t.count > 2 { i3 = textoSalud(t[2].importe) }
    }

    private func guardar() async {
        let tramos: [[String: Any]] = [
            ["hasta": numeroSalud(t1) ?? 700, "importe": numeroSalud(i1) ?? 0],
            ["hasta": numeroSalud(t2) ?? 900, "importe": numeroSalud(i2) ?? 0],
            ["hasta": NSNull(), "importe": numeroSalud(i3) ?? 0]
        ]
        let datos: [String: Any] = ["mesesObjetivo": meses, "umbralFondo": umbral, "extraEmergencia": extra, "ordinario": ordinario, "tramos": tramos]
        await e.accion(c, "ajustes", datos)
    }

    private func avisos(semanal: Bool, cierre: Bool, trimestral: Bool) {
        let a: [String: Any] = ["semanal": semanal, "cierre": cierre, "trimestral": trimestral]
        Task { await e.accion(c, "ajustes", ["avisos": a], callado: true) }
    }

    private func campo(_ t: String, _ v: Binding<String>, _ ph: String = "") -> some View {
        HStack {
            Text(t)
            Spacer()
            TextField(ph, text: v).keyboardType(.decimalPad).multilineTextAlignment(.trailing).monospacedDigit().frame(maxWidth: 120)
        }
    }
}

// MARK: - compras grandes

struct DeseosSaludView: View {
    @Environment(AppCoordinator.self) private var c
    let e: EstadoSalud
    let oculto: Bool
    @State private var titulo = ""
    @State private var precio = ""

    var body: some View {
        FormCasa {
            Section {
                TextField("qué quieres comprar", text: $titulo)
                TextField("precio", text: $precio).keyboardType(.decimalPad)
                HStack(spacing: Espacio.m) {
                    Button("esperar 48 h.") { nuevo(2) }
                    Button("esperar 7 días.") { nuevo(7) }
                }
                .buttonStyle(.borderless)
                .disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty || e.trabajando)
            } header: { Text("antes de comprar.") }
            if let deseos = e.m?.deseos, !deseos.isEmpty {
                Section {
                    ForEach(deseos) { d in fila(d) }
                } header: { Text("tu lista.") }
            }
        }
        .navigationTitle("compras grandes.")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func fila(_ d: ModeloSalud.Deseo) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            FilaLibro(etiqueta: d.titulo.isEmpty ? "sin nombre" : d.titulo, valor: oculto ? "•••" : FormatoFin.dinero(d.precio))
            Text(estado(d)).font(Tipo.pie).foregroundStyle(d.listo ? Paleta.acento : Paleta.textoSecundario)
            HStack(spacing: Espacio.m) {
                if d.esperaHasta == nil {
                    Button(d.diasSugeridos == 7 ? "esperar 7 días." : "esperar 48 h.") { Task { await e.accion(c, "esperar", ["id": d.id, "dias": d.diasSugeridos]) } }
                }
                Button("quitar.") { Task { await e.accion(c, "deseoFuera", ["id": d.id], callado: true) } }
            }
            .buttonStyle(.borderless).font(Tipo.pie)
        }
    }

    private func estado(_ d: ModeloSalud.Deseo) -> String {
        if d.listo { return "ya has esperado: ¿lo sigues queriendo?" }
        if d.esperaHasta != nil {
            return d.horasQuedan > 48 ? "quedan \(Int((Double(d.horasQuedan) / 24).rounded(.up))) días." : "quedan \(d.horasQuedan) horas."
        }
        return "sin espera."
    }

    private func nuevo(_ dias: Int) {
        let datos: [String: Any] = ["titulo": titulo, "precio": precio, "dias": dias]
        Task {
            await e.accion(c, "esperar", datos)
            titulo = ""; precio = ""
        }
    }
}
