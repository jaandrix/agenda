import SwiftUI
import UniformTypeIdentifiers

// Finanzas como la PWA del móvil (renderMobileFinances en js/nucleo.js): las mismas cuatro pestañas, en el mismo orden,
// con los mismos bloques y las cifras del mismo código (MotorFinanzas). Solo se calcula la pestaña que se ve; las otras
// se preparan después, en segundo plano, para que cambiar de pestaña no espere.
// Bitácora 2.0 (24-11): el patrimonio en una tarjeta negra, accesos rápidos en iconos cuadrados y los movimientos por
// día en tarjetas blancas. Los datos y las escrituras no cambian.

enum HojaFinanzas: Identifiable {
    case importar, buscar, gestor, editarSuscripcion(String?), permitir, revisar, opcion(OpcionFinanzas), presupuesto, objetivo, inversion(String), salud
    var id: String {
        switch self {
        case .importar: return "importar"
        case .buscar: return "buscar"
        case .gestor: return "gestor"
        case .editarSuscripcion(let id): return "sub:" + (id ?? "nueva")
        case .permitir: return "permitir"
        case .revisar: return "revisar"
        case .presupuesto: return "presupuesto"
        case .objetivo: return "objetivo"
        case .inversion(let id): return "inversion:" + id
        case .opcion(let o): return "opcion:" + o.rawValue
        case .salud: return "salud"
        }
    }
}

struct FinanzasView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.openURL) private var abrirURL
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    // La pestaña se recuerda mientras la app está abierta, como financeTab en la web.
    @AppStorage("finanzas.pestana") private var pestanaGuardada = PestanaFinanzas.cuentas.rawValue
    @AppStorage("bitacora-fin-extras") private var extras = false
    @State private var rango = "6m"
    @State private var nMov = 30
    @State private var cuentas: ModeloCuentas?
    @State private var movs: ModeloMovimientos?
    @State private var plan: ModeloPlanificacion?
    @State private var resumen: ModeloResumen?
    @State private var oculto = false
    @State private var ver = false
    @State private var hoja: HojaFinanzas?
    @State private var aviso: String?
    @State private var logos = LogosFinanzas.compartido

    private var pestana: PestanaFinanzas { PestanaFinanzas(rawValue: pestanaGuardada) ?? .cuentas }
    private var mesNombre: String {
        let n = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        return n[Calendar.current.component(.month, from: Date()) - 1]
    }
    private var escondido: Bool { oculto && !ver }

    // En el segmento caben cuatro si «planificación.» se queda en «plan.».
    private static let titulosSegmento: [PestanaFinanzas: String] = [.cuentas: "cuentas.", .planificacion: "plan.", .movimientos: "movimientos.", .resumen: "resumen."]

    var body: some View {
        ScrollViewReader { scroll in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    cabecera
                        .id("arriba")
                    SegmentoCapsula(opciones: PestanaFinanzas.allCases.map { SegmentoCapsula<PestanaFinanzas>.Opcion(valor: $0, titulo: Self.titulosSegmento[$0] ?? $0.titulo) },
                                    elegido: Binding(get: { pestana }, set: { p in
                                        guard p != pestana else { return }
                                        pestanaGuardada = p.rawValue
                                        nMov = 30
                                        scroll.scrollTo("arriba", anchor: .top)
                                    }),
                                    sobreBlanco: false)
                        .padding(.top, Medida.m)
                    // Un VStack por pestaña: así entra y sale entera, y los ids de sus filas no se cruzan con los de otra.
                    VStack(alignment: .leading, spacing: 0) { contenido }
                        .id(pestana)
                        .transition(.opacity.combined(with: .offset(y: 6)))
                }
                .padding(.horizontal, Medida.margen)
                .padding(.bottom, Medida.l)
                .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: pestana)
            }
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar() }
        .task(id: "\(c.revision)|\(pestanaGuardada)|\(rango)|\(extras)|\(nMov)") { await cargar() }
        .hoja(item: $hoja) { h in hojaVista(h) }
        .alert("finanzas.", isPresented: Binding(get: { aviso != nil }, set: { if !$0 { aviso = nil } })) {
            Button("aceptar.", role: .cancel) { aviso = nil }
        } message: { Text(aviso ?? "") }
    }

    private var cabecera: some View {
        CabeceraPagina(titulo: "finanzas.", subtitulo: mesNombre + ".") {
            HStack(spacing: Medida.xxs) {
                if oculto {
                    BotonRedondo(sistema: ver ? "eye.slash" : "eye", tono: .blanco, etiqueta: ver ? "ocultar cifras" : "ver cifras") {
                        Haptica.ligera()
                        withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { ver.toggle() }
                    }
                }
                MenuRedondo(etiqueta: "más opciones") {
                    Button("importar extracto.") { hoja = .importar }
                    Button("buscar un movimiento.") { hoja = .buscar }
                    Button("suscripciones.") { hoja = .gestor }
                    Button("¿me lo puedo permitir?") { hoja = .permitir }
                    Divider()
                    ForEach(OpcionFinanzas.allCases) { o in Button(o.titulo) { hoja = .opcion(o) } }
                }
            }
        }
        .padding(.top, Medida.xs)
        // Mantener pulsado el título: lo que tarda el motor (arranque, carga del documento y cada pestaña, en ms).
        .onLongPressGesture {
            Task {
                let m = await MotorFinanzas.compartido.ultimaMedida
                aviso = m.sorted { $0.key < $1.key }.map { "\($0.key): \(Int($0.value.rounded())) ms" }.joined(separator: ", ")
            }
        }
    }

    @ViewBuilder private var contenido: some View {
        switch pestana {
        case .cuentas:
            if let m = cuentas { PestanaCuentas(m: m, oculto: escondido, rango: $rango, extras: $extras, hoja: $hoja, logos: logos,
                                                 abrir: abrirMovimiento, nuevo: nuevoMovimiento, verTodos: { pestanaGuardada = PestanaFinanzas.movimientos.rawValue },
                                                 detectada: detectada, cobroVisto: { id in suscripcion(id, "visto") }, alta: { id in suscripcion(id, "alta") }) } else { cargando }
        case .movimientos:
            if let m = movs { PestanaMovimientos(m: m, oculto: escondido, hoja: $hoja, abrir: abrirMovimiento, nuevo: nuevoMovimiento,
                                                  mas: { nMov += 30 }, web: { abrirURL(Apartados.webURL("finances")) }) } else { cargando }
        case .planificacion:
            if let m = plan { PestanaPlanificacion(m: m, oculto: escondido, hoja: $hoja) } else { cargando }
        case .resumen:
            if let m = resumen { PestanaResumen(m: m, oculto: escondido, hoja: $hoja, logos: logos, web: { abrirURL(Apartados.webURL("finances")) }) } else { cargando }
        }
    }

    private var cargando: some View {
        ProgressView().tint(Lienzo.tintaTerciaria).frame(maxWidth: .infinity).padding(.top, Medida.xxl)
    }

    @ViewBuilder private func hojaVista(_ h: HojaFinanzas) -> some View {
        switch h {
        case .importar: ImportarExtractoView { datos in await guardar(datos) }
        case .buscar: BusquedaMovimientosView(oculto: escondido) { f in hoja = nil; abrirTrasCerrar(f) }
        case .gestor: GestorSuscripcionesView(logos: logos, oculto: escondido, editar: { id in hoja = .editarSuscripcion(id) }, accion: { id, a in await suscripcionAsync(id, a) })
        case .editarSuscripcion(let id): EditorSuscripcionView(id: id) { datos in await guardar(datos) }
        case .permitir: PermitirView()
        case .revisar: RevisarMovimientosView(oculto: escondido) { f in hoja = nil; abrirTrasCerrar(f) }
        case .opcion(let o): MasOpcionesView(opcion: o, oculto: escondido)
        case .presupuesto: EditorPresupuestoView()
        case .objetivo: ObjetivoPatrimonioView()
        case .inversion(let id): FichaInversionView(id: id, oculto: escondido)
        case .salud: SaludFinanzasView(oculto: escondido)
        }
    }

    private func abrirMovimiento(_ f: FilaMov) { c.modal = .editarMovimiento(f.movimiento) }
    // El editor es una hoja del coordinador: se abre cuando la de Finanzas ya se ha ido.
    private func abrirTrasCerrar(_ f: FilaMov) {
        Task { try? await Task.sleep(nanoseconds: 450_000_000); abrirMovimiento(f) }
    }
    private func nuevoMovimiento(_ tipo: String) { c.modal = .movimiento(OperacionBitacora.nuevoIdMovimiento(), tipo: tipo) }

    private func detectada(_ clave: String, _ accion: String) {
        let id = "sub_\(Int64(Date().timeIntervalSince1970 * 1000))_" + String(UUID().uuidString.prefix(4)).lowercased()
        Task {
            do { await guardar(try await MotorFinanzas.compartido.crudo("detectada", [clave, accion, id])) }
            catch { aviso = "no se pudo guardar en este iPhone." }
        }
    }
    private func suscripcion(_ id: String, _ accion: String) { Task { await suscripcionAsync(id, accion) } }
    private func suscripcionAsync(_ id: String, _ accion: String) async {
        do { await guardar(try await MotorFinanzas.compartido.crudo("suscripcion", [id, accion])) }
        catch { aviso = "no se pudo guardar en este iPhone." }
    }

    // La respuesta del motor ({resultado, cambios}) a la cola: una operación con todo, como commitFinanceChange.
    @discardableResult
    private func guardar(_ datos: Data) async -> Bool {
        do {
            guard let r = try? LectorJSON.valor(datos), let cambios = r["cambios"], cambios != .null else { return true }
            let doc = await c.documentoVisible()
            guard let op = CambioFinanzas.operacion(cambios, sobre: doc) else { return true }
            try await c.encolar(op)
            return true
        } catch {
            aviso = "no se pudo guardar en este iPhone."
            return false
        }
    }

    private func cargar() async {
        let t0 = Medidas.ahora
        guard let doc = await c.documentoVisible() else { return }
        let motor = MotorFinanzas.compartido
        let tab = pestana
        let opciones = Opciones(rango: rango, extras: extras, n: nMov)
        do {
            try await motor.cargar(doc)
            oculto = ((try? doc.valor(de: "blurFinances")) ?? nil)?.booleano == true
            try await pintar(tab, motor, opciones)
            if !Task.isCancelled { Medidas.anotar("pestaña finanzas (cargar)", desde: t0) }
        } catch {
            aviso = (error as? LocalizedError)?.errorDescription ?? "no se pudo calcular finanzas."
            return
        }
        // prepararFinanzas, como la web al abrir Finanzas: cargos de suscripciones, programados, historial... Si cambia
        // algo, va a la cola y se vuelve a pintar lo que se ve. Una vez por estado (el motor lo lleva).
        if let d = try? await motor.preparar(), (try? LectorJSON.valor(d))?["cambios"].map({ $0 != .null }) == true {
            await guardar(d)
            try? await pintar(tab, motor, opciones)
        }
        await logos.cargar(motor: motor, coordinador: c)
        // Las otras pestañas, ya calculadas para cuando se toquen.
        for otra in PestanaFinanzas.allCases where otra != tab {
            guard !Task.isCancelled else { return }
            try? await pintar(otra, motor, opciones)
        }
    }

    struct Opciones { let rango: String; let extras: Bool; let n: Int }

    private func pintar(_ tab: PestanaFinanzas, _ motor: MotorFinanzas, _ o: Opciones) async throws {
        switch tab {
        case .cuentas:
            let m = try await motor.pestana("cuentas", opciones: "{\"rango\":\"\(o.rango)\",\"extras\":\(o.extras)}", como: ModeloCuentas.self)
            if cuentas != m { cuentas = m }
        case .movimientos:
            let m = try await motor.pestana("movimientos", opciones: "{\"n\":\(o.n)}", como: ModeloMovimientos.self)
            if movs != m { movs = m }
        case .planificacion:
            let m = try await motor.pestana("planificacion", como: ModeloPlanificacion.self)
            if plan != m { plan = m }
        case .resumen:
            let m = try await motor.pestana("resumen", como: ModeloResumen.self)
            if resumen != m { resumen = m }
        }
    }
}

// MARK: - piezas comunes

// Título de sección de las hojas de Finanzas (antes en Poppins 13): ahora la etiqueta pequeña de V2.
struct EtiquetaFin: View {
    let texto: String
    var detalle: String?
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            EtiquetaSeccion(texto: texto)
            if let detalle { Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit().padding(.trailing, Medida.xxs) }
        }
        .padding(.top, Medida.l).padding(.bottom, Medida.xs)
    }
}

// Botón de acción de Finanzas: cápsula negra (la principal) o gris, a todo el ancho.
struct BotonFin: View {
    let texto: String
    var acento = false
    let accion: () -> Void
    var body: some View {
        Button(texto, action: accion).buttonStyle(.capsula(acento ? .oscuro : .claro, ancho: true))
    }
}

struct EnlaceFin: View {
    let texto: String
    let accion: () -> Void
    var body: some View {
        Button(action: accion) {
            Text(texto).font(Letra.pieFuerte).foregroundStyle(Lienzo.naranjaProfundo).frame(minHeight: Medida.toque).contentShape(Rectangle())
        }
        .buttonStyle(.pulsable(0.94))
    }
}

// .m-fila de un movimiento (mobileFinFilaMov): icono de la categoría, concepto y «categoría, cuenta», y la cifra con su
// signo alineada a la derecha. Sin raya propia: la pone la lista que la contiene (TarjetaLista).
struct FilaMovView: View {
    let f: FilaMov
    let oculto: Bool
    var conDia = true
    let abrir: (FilaMov) -> Void

    private var cifra: String {
        oculto ? "•••" : (f.tipo == "income" ? "+" : f.tipo == "expense" ? "−" : "") + FormatoFin.dinero(f.importe)
    }
    private var tinta: Color {
        if f.futuro { return Lienzo.tintaTerciaria }
        if f.tipo == "income" { return Lienzo.positivo }
        if f.tipo == "transfer" || f.neutro { return Lienzo.tintaSecundaria }
        return Lienzo.tinta
    }

    var body: some View {
        Button { abrir(f) } label: {
            FilaImporte(titulo: f.titulo,
                        detalle: ([conDia ? f.dia : "", f.meta].filter { !$0.isEmpty }.joined(separator: ", ")) + (f.pendiente ? ", pendiente." : ""),
                        cifra: cifra, tono: tinta, apagado: f.futuro, aviso: f.revisar) {
                if f.tipo == "transfer" || f.icono.isEmpty {
                    IconoFinanzas(clave: f.tipo == "transfer" ? "repeat" : "other")
                } else {
                    IconoCategoria(icono: f.icono, color: f.color, tam: Medida.icono)
                }
            }
        }
        .buttonStyle(.pulsable(0.98))
        .accessibilityElement(children: .combine)
        .accessibilityHint("abrir el movimiento.")
    }
}

// Una lista de movimientos en su tarjeta blanca.
struct ListaMovs: View {
    let filas: [FilaMov]
    let oculto: Bool
    var conDia = true
    let abrir: (FilaMov) -> Void

    var body: some View {
        TarjetaLista(elementos: filas) { f in FilaMovView(f: f, oculto: oculto, conDia: conDia, abrir: abrir) }
    }
}

// mobileFinPorAjustar: las incidencias (fecha o importe mal) y el aviso de los que esperan categoría.
struct AvisoPorAjustar: View {
    let p: PorAjustar
    let abrir: () -> Void
    @State private var abierto = false

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            if p.n > 0 {
                Button(action: abrir) {
                    HStack(spacing: Medida.s) {
                        IconoFinanzas(clave: "other", tono: .naranja)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(p.n) \(p.n == 1 ? "movimiento" : "movimientos") por ajustar.").font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                            Text("ponles categoría y revisa la cuenta.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        }
                        Spacer(minLength: Medida.xs)
                        FlechaFila()
                    }
                    .tarjeta(relleno: Medida.s)
                    .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
                }
                .buttonStyle(.pulsable(0.97))
            }
            if !p.incidencias.isEmpty {
                SeccionPlegable(titulo: "\(p.incidencias.count) con la fecha o el importe mal.", abierta: $abierto) {
                    VStack(alignment: .leading, spacing: Medida.xxs) {
                        Text("No cuentan en los saldos hasta que se arreglen.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        ForEach(Array(p.incidencias.enumerated()), id: \.offset) { _, i in
                            Text("\(i.nota): \(i.motivo).").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        }
                    }
                    .padding(.bottom, Medida.xs)
                }
                .padding(.horizontal, Medida.xxs)
            }
        }
        .padding(.top, Medida.m)
    }
}

// MARK: - cuentas.

// La entrada a «salud.» (0.25): una línea con lo que espera, o solo el enlace si no hay nada.
private struct AvisoSalud: View {
    let s: ResumenSalud
    let abrir: () -> Void

    private var texto: String {
        let n = s.propuestas + s.porRevisar
        var partes: [String] = []
        if n > 0 { partes.append("\(n) por clasificar") }
        if s.avisos > 0 { partes.append("\(s.avisos) " + (s.avisos == 1 ? "aviso" : "avisos")) }
        if partes.isEmpty { return "todo en orden." }
        return partes.joined(separator: ", ") + "."
    }

    var body: some View {
        let hay = s.propuestas + s.porRevisar + s.avisos > 0
        Button(action: abrir) {
            FilaTarjeta(icono: "objetivos", tonoIcono: hay ? .suave : .claro, titulo: "salud de tus finanzas.", detalle: texto) {
                FlechaFila()
            }
            .padding(.horizontal, Medida.rellenoTarjeta).padding(.vertical, Medida.xxs)
            .tarjeta(relleno: 0)
        }
        .buttonStyle(.pulsable(0.97))
        .padding(.top, Medida.s)
    }
}

// El patrimonio protagonista: la tarjeta negra con la cifra y la gráfica, y debajo los accesos rápidos.
private struct PestanaCuentas: View {
    let m: ModeloCuentas
    let oculto: Bool
    @Binding var rango: String
    @Binding var extras: Bool
    @Binding var hoja: HojaFinanzas?
    let logos: LogosFinanzas
    let abrir: (FilaMov) -> Void
    let nuevo: (String) -> Void
    let verTodos: () -> Void
    let detectada: (String, String) -> Void
    let cobroVisto: (String) -> Void
    let alta: (String) -> Void

    private func din(_ v: Double) -> String { CifraFin.texto(v, oculto: oculto) }

    var body: some View {
        GraficaPatrimonio(g: m.grafica, oculto: oculto, rango: $rango, extras: $extras)
            .padding(.top, Medida.m)
        HStack(spacing: Medida.xs) {
            BotonAcceso(titulo: "gasto.", icono: "bag", destacado: true) { nuevo("expense") }
            BotonAcceso(titulo: "ingreso.", icono: "coin") { nuevo("income") }
            BotonAcceso(titulo: "traspaso.", icono: "repeat") { nuevo("transfer") }
            BotonAcceso(titulo: "importar.", icono: "bank") { hoja = .importar }
        }
        .padding(.top, Medida.m)
        if m.porAjustar.n > 0 || !m.porAjustar.incidencias.isEmpty { AvisoPorAjustar(p: m.porAjustar) { hoja = .revisar } }
        if let s = m.salud { AvisoSalud(s: s) { hoja = .salud } }
        // renderAvisoPresupuestos
        if !m.avisosPresupuesto.isEmpty {
            VStack(alignment: .leading, spacing: Medida.xs) {
                ForEach(Array(m.avisosPresupuesto.enumerated()), id: \.offset) { _, a in
                    HStack(alignment: .firstTextBaseline, spacing: Medida.xs) {
                        Puntito(color: a.queda >= 0 ? Lienzo.aviso : Lienzo.negativo, tamano: 6)
                        Group {
                            if a.queda >= 0 {
                                Text("vas al ") + Text("\(a.pct) %").fontWeight(.semibold) + Text(" en \(a.nombre): quedan \(din(a.queda)) para \(a.dias) \(a.dias == 1 ? "día" : "días").")
                            } else {
                                Text("\(a.nombre) se ha pasado ") + Text(din(-a.queda)).fontWeight(.semibold) + Text(" del presupuesto este mes.")
                            }
                        }
                        .font(Letra.detalle).foregroundStyle(Lienzo.tinta)
                    }
                }
            }
            .tarjeta(relleno: Medida.s + 2)
            .padding(.top, Medida.s)
        }
        // renderSuscripcionesDetectadas (con los que siguen cobrando tras la baja)
        ForEach(m.detectadas.siguenCobrando) { s in
            tarjetaSugerencia(titulo: "\(s.titulo) sigue cobrando.",
                              texto: "La diste de baja el \(s.desde) y hay \(s.n == 1 ? "un cargo" : "\(s.n) cargos"): \(din(s.importe)) el \(s.fecha).",
                              botones: [("dar de alta.", { alta(s.id) }), ("ya lo sé.", { cobroVisto(s.id) })])
        }
        ForEach(m.detectadas.propuestas) { s in
            tarjetaSugerencia(titulo: "¿\(s.nombre) es una suscripción?",
                              texto: "unos \(din(s.importe)) cada mes, hacia el día \(s.dia) (\(s.meses) meses seguidos).",
                              botones: [("añadir.", { detectada(s.clave, "anadir") }), ("no es.", { detectada(s.clave, "ignorar") })])
        }
        TarjetaSeccion(titulo: "este mes.") {
            HStack(alignment: .top, spacing: Medida.s) {
                cifraMes("entra.", m.ingresos, color: Lienzo.positivo)
                Rectangle().fill(Lienzo.filo).frame(width: 1, height: 40)
                cifraMes("sale.", m.gastos, color: Lienzo.tinta)
            }
            .accessibilityElement(children: .combine)
            if m.ingresos != 0 || m.gastos != 0 {
                VStack(alignment: .leading, spacing: Medida.xs) {
                    BarraFina(valor: min(1, m.ratio), color: m.ratio > 1 ? Lienzo.negativo : Lienzo.naranja)
                    Text(m.ingresos > 0 ? "\(Int((m.ratio * 100).rounded())) % de lo que ha entrado, ya gastado." : "Este mes todavía no ha entrado nada.")
                        .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                }
                .padding(.top, Medida.m)
            }
            if let r = m.ritmo {
                VStack(alignment: .leading, spacing: Medida.xxs) {
                    textoRitmo(r).font(Letra.detalle).foregroundStyle(Lienzo.tinta)
                    if let p = r.previsto, p != 0 {
                        Text("A este ritmo, unos \(din(p)) a final de mes.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    }
                }
                .padding(.top, Medida.s)
                .overlay(alignment: .top) { Rectangle().fill(Lienzo.filo).frame(height: 1) }
                .padding(.top, Medida.s)
            }
        }
        if !m.cuentas.isEmpty {
            TarjetaSeccion(titulo: "cuentas.", enTarjeta: false) {
                TarjetaLista(elementos: m.cuentas) { cta in
                    FilaTarjeta(titulo: cta.nombre + ".") {
                        Text(din(cta.saldo)).font(Letra.numero).foregroundStyle(cta.saldo < 0 ? Lienzo.negativo : Lienzo.tinta)
                            .contentTransition(.numericText())
                    }
                }
            }
        }
        if !m.cargos.lista.isEmpty {
            TarjetaSeccion(titulo: "próximos cargos.", detalle: din(m.cargos.total), enTarjeta: false) {
                TarjetaLista(elementos: m.cargos.lista) { x in
                    HStack(spacing: Medida.s) {
                        LogoSuscripcion(id: x.id, titulo: x.titulo, logos: logos, lado: Medida.icono)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(x.titulo).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).lineLimit(1)
                            Text(x.cuando).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        }
                        Spacer(minLength: Medida.xs)
                        Text(din(x.importe)).font(Letra.numero).foregroundStyle(Lienzo.tinta)
                    }
                    .frame(minHeight: 54)
                    .accessibilityElement(children: .combine)
                }
            }
        }
        if m.ultimos.isEmpty {
            TarjetaSeccion(titulo: "últimos movimientos.") {
                EstadoVacio(texto: "todavía no hay movimientos. Añade uno o importa un extracto.", icono: "finanzas")
            }
        } else {
            VStack(alignment: .leading, spacing: Medida.xs) {
                EtiquetaSeccion(texto: "últimos movimientos.", accion: ("ver todos.", verTodos))
                ListaMovs(filas: m.ultimos, oculto: oculto, abrir: abrir)
            }
            .padding(.top, Medida.entreSecciones)
        }
    }

    private func cifraMes(_ nombre: String, _ v: Double, color: Color) -> some View {
        CifraGrande(texto: din(v), etiqueta: nombre, punto: color)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func textoRitmo(_ r: ModeloCuentas.Ritmo) -> Text {
        var t = Text(din(r.gasto)).fontWeight(.semibold) + Text(" gastados hasta hoy")
        if r.antes != 0 {
            let dif = (oculto ? "•••" : FormatoFin.dinero(abs(r.dif))) + (r.dif > 0 ? " más" : " menos")
            t = t + Text(", ") + Text(dif).foregroundColor(r.dif > 0 ? Lienzo.negativo : Lienzo.positivo) + Text(" que a día \(r.dia) de \(r.mesPasado)")
        }
        return t + Text(".")
    }

    private func tarjetaSugerencia(titulo: String, texto: String, botones: [(String, () -> Void)]) -> some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            Text(titulo).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta)
            Text(texto).font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
            HStack(spacing: Medida.xs) {
                ForEach(Array(botones.enumerated()), id: \.offset) { i, b in
                    Button(b.0, action: b.1).buttonStyle(.capsula(i == 0 ? .oscuro : .claro))
                }
            }
            .padding(.top, Medida.xxs)
        }
        .tarjeta()
        .padding(.top, Medida.s)
    }
}

// MARK: - movimientos.

private struct PestanaMovimientos: View {
    let m: ModeloMovimientos
    let oculto: Bool
    @Binding var hoja: HojaFinanzas?
    let abrir: (FilaMov) -> Void
    let nuevo: (String) -> Void
    let mas: () -> Void
    let web: () -> Void

    enum Filtro: Hashable { case todo, gastos, ingresos }
    @State private var filtro = Filtro.todo
    @State private var texto = ""

    private static let meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    private static let iso: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; f.timeZone = .current; return f
    }()
    private static let largo: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "es_ES"); f.dateFormat = "EEEE d"; f.timeZone = .current; return f
    }()

    private static func plano(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES"))
    }

    private var filtradas: [FilaMov] {
        let q = Self.plano(texto.trimmingCharacters(in: .whitespaces))
        return m.filas.filter { f in
            switch filtro {
            case .todo: break
            case .gastos: guard f.tipo == "expense" else { return false }
            case .ingresos: guard f.tipo == "income" else { return false }
            }
            guard !q.isEmpty else { return true }
            return Self.plano([f.titulo, f.meta, f.categoriaNombre, f.nota, f.cifra].joined(separator: " ")).contains(q)
        }
    }

    // Por día, en el orden en que llegan (del motor, de más nuevo a más viejo).
    private func grupos(_ filas: [FilaMov]) -> [(String, [FilaMov])] {
        var r: [(String, [FilaMov])] = []
        for f in filas {
            if r.last?.0 == f.fecha { r[r.count - 1].1.append(f) } else { r.append((f.fecha, [f])) }
        }
        return r
    }

    private func tituloMes(_ mes: String) -> String {
        guard mes.count == 7, let n = Int(mes.suffix(2)), (1...12).contains(n) else { return "sin fecha." }
        let anio = String(mes.prefix(4))
        return Self.meses[n - 1] + (anio != String(m.anioActual) ? " " + anio : "") + "."
    }

    private func tituloDia(_ fecha: String, _ filas: [FilaMov]) -> String {
        guard let d = Self.iso.date(from: fecha) else { return filas.first?.dia ?? "sin fecha." }
        if Calendar.current.isDateInToday(d) { return "hoy." }
        if Calendar.current.isDateInYesterday(d) { return "ayer." }
        if Calendar.current.isDateInTomorrow(d) { return "mañana." }
        return Self.largo.string(from: d).lowercased() + "."
    }

    private func netoDia(_ filas: [FilaMov]) -> String? {
        guard !oculto else { return nil }
        let n = filas.reduce(0.0) { s, f in
            guard !f.neutro else { return s }
            return s + (f.tipo == "income" ? f.importe : f.tipo == "expense" ? -f.importe : 0)
        }
        return abs(n) < 0.005 ? nil : CifraFin.texto(n, oculto: false, signo: true)
    }

    private var mesActual: String { String(Self.iso.string(from: Date()).prefix(7)) }

    var body: some View {
        let lista = filtradas
        let gs = grupos(lista)
        HStack(spacing: Medida.xs) {
            Button("+ movimiento.") { nuevo("expense") }.buttonStyle(.capsula(.oscuro, ancho: true))
            Button("importar.") { hoja = .importar }.buttonStyle(.capsula(.blanco, ancho: true))
        }
        .padding(.top, Medida.m)
        if m.total > 0 {
            VStack(spacing: Medida.xs) {
                SegmentoCapsula(opciones: [SegmentoCapsula<Filtro>.Opcion(valor: .todo, titulo: "todo."),
                                           SegmentoCapsula<Filtro>.Opcion(valor: .gastos, titulo: "gastos."),
                                           SegmentoCapsula<Filtro>.Opcion(valor: .ingresos, titulo: "ingresos.")],
                                elegido: $filtro, sobreBlanco: false)
                BuscadorCapsula(texto: $texto, placeholder: "buscar en estos movimientos")
            }
            .padding(.top, Medida.m)
        }
        if m.porAjustar.n > 0 || !m.porAjustar.incidencias.isEmpty { AvisoPorAjustar(p: m.porAjustar) { hoja = .revisar } }
        if m.filas.isEmpty {
            TarjetaInvitacion(frase: "todavía no hay movimientos.", destacado: "añade uno o importa un extracto.", boton: "importar extracto.") { hoja = .importar }
                .padding(.top, Medida.m)
        } else if lista.isEmpty {
            EstadoVacio(texto: "nada coincide con lo que buscas entre los últimos \(m.filas.count).", icono: "buscar")
                .padding(.top, Medida.s)
        } else {
            ForEach(Array(gs.enumerated()), id: \.element.0) { i, g in
                let mes = String(g.0.prefix(7))
                let mesAntes = i > 0 ? String(gs[i - 1].0.prefix(7)) : mesActual
                if mes != mesAntes {
                    Text(tituloMes(mes)).font(Letra.seccion).foregroundStyle(Lienzo.tinta)
                        .accessibilityAddTraits(.isHeader)
                        .padding(.top, Medida.entreSecciones).padding(.horizontal, Medida.xxs)
                }
                VStack(alignment: .leading, spacing: Medida.xs) {
                    HStack(alignment: .firstTextBaseline) {
                        EtiquetaSeccion(texto: tituloDia(g.0, g.1))
                        if let n = netoDia(g.1) {
                            Text(n).font(Letra.pie).monospacedDigit().foregroundStyle(Lienzo.tintaSecundaria).padding(.trailing, Medida.xxs)
                        }
                    }
                    ListaMovs(filas: g.1, oculto: oculto, conDia: false, abrir: abrir)
                }
                .padding(.top, mes != mesAntes ? Medida.xs : Medida.l)
                .entradaEscalonada(i)
            }
        }
        if !texto.isEmpty || filtro != .todo {
            Button("buscar en todos tus movimientos.") { hoja = .buscar }.buttonStyle(.capsula(.blanco, ancho: true))
                .padding(.top, Medida.m)
        }
        HStack(spacing: Medida.xs) {
            if m.total > m.filas.count {
                Button("ver \(min(30, m.total - m.filas.count)) más.", action: mas).buttonStyle(.capsula(.claro))
            }
            Spacer()
            // mobileFinMenu.
            Menu {
                ForEach(OpcionFinanzas.allCases) { o in Button(o.titulo) { hoja = .opcion(o) } }
            } label: {
                Text("más opciones.").font(Letra.pieFuerte).foregroundStyle(Lienzo.naranjaProfundo).frame(minHeight: Medida.toque)
            }
        }
        .padding(.top, Medida.m)
    }
}

// MARK: - planificación.

private struct PestanaPlanificacion: View {
    let m: ModeloPlanificacion
    let oculto: Bool
    @Binding var hoja: HojaFinanzas?

    private func color(_ s: String) -> Color { s == "superado" ? Lienzo.negativo : s == "aviso" ? Lienzo.aviso : Lienzo.naranja }
    private func din(_ v: Double) -> String { CifraFin.texto(v, oculto: oculto) }

    var body: some View {
        if m.categorias.isEmpty && m.otros.isEmpty {
            TarjetaInvitacion(frase: m.ingresos != 0 ? "todo está sin asignar." : "este mes no tienes presupuestos.",
                              destacado: "reparte el mes en casillas.", boton: "repartir el mes.") { hoja = .presupuesto }
                .padding(.top, Medida.m)
        } else {
            if !m.categorias.isEmpty {
                TarjetaSeccion(titulo: "presupuestos.", enTarjeta: false) {
                    TarjetaLista(elementos: m.categorias) { cat in filaCategoria(cat) }
                }
            }
            if !m.otros.isEmpty {
                TarjetaSeccion(titulo: "otros destinos.") {
                    ForEach(Array(m.otros.enumerated()), id: \.offset) { i, a in
                        FilaDato(etiqueta: a.label, valor: din(a.amount), separador: i < m.otros.count - 1)
                    }
                    Text("Cuentan como repartido; sin categoría no se puede seguir su gasto.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        .padding(.top, Medida.xs)
                }
            }
            BotonFin(texto: "editar presupuestos.", acento: true) { hoja = .presupuesto }.padding(.top, Medida.l)
        }
        Button("¿me lo puedo permitir?") { hoja = .permitir }.buttonStyle(.capsula(.blanco, ancho: true)).padding(.top, Medida.xs)
    }

    private func filaCategoria(_ cat: ModeloPlanificacion.Categoria) -> some View {
        let sub = [cat.refunded > 0 ? "\(din(cat.refunded)) devueltos" : nil, "el mes pasado \(din(cat.lastMonth))", cat.casillas > 1 ? "\(cat.casillas) casillas" : nil]
            .compactMap { $0 }.joined(separator: ", ")
        return VStack(alignment: .leading, spacing: Medida.xs) {
            HStack(alignment: .center, spacing: Medida.s) {
                IconoCategoria(icono: cat.icono, color: cat.color, tam: Medida.icono)
                VStack(alignment: .leading, spacing: 1) {
                    Text(cat.nombre).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).lineLimit(1)
                    Text("plan. \(din(cat.planned))").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                }
                Spacer(minLength: Medida.xs)
                VStack(alignment: .trailing, spacing: 1) {
                    Text(din(cat.spent)).font(Letra.numero).foregroundStyle(Lienzo.tinta)
                    Text("de \(din(cat.available))").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                }
            }
            BarraFina(valor: min(100, max(2, cat.percentage)) / 100, color: color(cat.status))
            HStack(alignment: .firstTextBaseline) {
                Text(sub + ".").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(2)
                Spacer(minLength: Medida.xs)
                Text(oculto ? "•••" : cat.estado).font(Letra.pieFuerte).foregroundStyle(cat.status == "superado" ? Lienzo.negativo : Lienzo.tinta)
            }
        }
        .padding(.vertical, Medida.s)
        .accessibilityElement(children: .combine)
        .accessibilityValue("\(Int(cat.percentage.rounded())) por ciento gastado.")
    }
}

// MARK: - resumen.

private struct PestanaResumen: View {
    let m: ModeloResumen
    let oculto: Bool
    @Binding var hoja: HojaFinanzas?
    let logos: LogosFinanzas
    let web: () -> Void

    private func din(_ v: Double) -> String { CifraFin.texto(v, oculto: oculto) }
    private func pctSinMas(_ v: Double) -> String { FormatoFin.pct(v).replacingOccurrences(of: "+", with: "") }

    var body: some View {
        panelMes("este mes.", m.esteMes, conSueldo: true)
        panelMes("mes anterior.", m.mesAnterior, conSueldo: false)
        GastosPorCategoriaView(oculto: oculto)
        panelAhorro
        panelObjetivo
        panelActivos
        panelSuscripciones
        panelPrevision
    }

    private func cifra(_ t: String, negativa: Bool = false) -> some View {
        CifraGrande(texto: t, tono: negativa ? Lienzo.negativo : nil)
    }

    private func barra(_ nombre: String, _ v: Double, _ falta: Double, _ max: Double, color: Color) -> some View {
        HStack(spacing: Medida.xs) {
            Text(nombre).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).frame(width: 44, alignment: .leading)
            BarraFina(valor: v / max, color: color, falta: falta / max)
            Text(din(v)).font(Letra.pieFuerte).monospacedDigit().foregroundStyle(Lienzo.tinta)
        }
        .accessibilityElement(children: .combine)
    }

    private func panelMes(_ titulo: String, _ mes: ModeloResumen.Mes, conSueldo: Bool) -> some View {
        let neto = mes.entra - mes.sale
        let max = Swift.max(mes.entra + mes.falta, mes.sale, mes.sueldo, 1)
        return TarjetaSeccion(titulo: titulo, detalle: mes.nombre + ".", arriba: titulo == "este mes." ? Medida.m : Medida.entreSecciones) {
            VStack(alignment: .leading, spacing: Medida.xs) {
                cifra(oculto ? "•••" : (neto >= 0 ? "+" : "−") + FormatoFin.dinero(abs(neto)), negativa: neto < 0)
                Text((neto >= 0 ? "te queda" : "has gastado más de lo que ha entrado") + (mes.falta > 0 ? ", y aún falta por entrar \(din(mes.falta)) del sueldo previsto" : "") + ".")
                    .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                VStack(spacing: Medida.xs) {
                    barra("entra.", mes.entra, mes.falta, max, color: Lienzo.positivo)
                    barra("sale.", mes.sale, 0, max, color: Lienzo.naranja)
                }
                .padding(.top, Medida.xxs)
                if conSueldo && mes.sueldo != 0 { FilaDato(etiqueta: "sueldo previsto.", valor: din(mes.sueldo), separador: false) }
            }
        }
    }

    private var panelAhorro: some View {
        let a = m.ahorro
        let anterior = a.meses.last
        let conAnio = (a.meses.first?.anio).map { $0 != a.anioActual } ?? false
        let desde = a.meses.first.map { $0.nombre + (conAnio ? " de \($0.anio)" : "") } ?? ""
        let nota: String = {
            guard let anterior else { return "Aparece al cerrar el primer mes con movimientos." }
            return "de lo que entró en \(anterior.nombre), el último mes cerrado" + (a.media.map { ", frente a un \(pctSinMas($0)) de media desde \(desde)" } ?? "") + "."
        }()
        return TarjetaSeccion(titulo: "tasa de ahorro.", detalle: anterior.map { $0.nombre + "." } ?? "de lo que entra.") {
            VStack(alignment: .leading, spacing: Medida.xs) {
                cifra(anterior == nil ? "sin datos" : anterior!.tasa == nil ? "sin ingresos" : pctSinMas(anterior!.tasa!), negativa: (anterior?.tasa ?? 0) < 0)
                Text(nota).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                VStack(spacing: Medida.xs) {
                    ForEach(Array(a.meses.reversed().enumerated()), id: \.offset) { _, x in filaAhorro(x, conAnio: conAnio, enCurso: false) }
                    filaAhorro(a.enCurso, conAnio: conAnio, enCurso: true)
                }
                .padding(.top, Medida.xxs)
            }
        }
    }

    private func filaAhorro(_ x: ModeloResumen.MesAhorro, conAnio: Bool, enCurso: Bool) -> some View {
        let ancho = x.tasa.map { Swift.max(2, Swift.min(100, abs($0))) } ?? 0
        let neg = (x.tasa ?? 0) < 0
        return HStack(spacing: Medida.xs) {
            Text(x.nombre + (conAnio ? " \(x.anio)" : "") + (enCurso ? ", en curso" : "") + ".")
                .font(Letra.pie).foregroundStyle(enCurso ? Lienzo.tintaSecundaria : Lienzo.tinta).frame(width: 116, alignment: .leading).lineLimit(1).minimumScaleFactor(0.8)
            BarraFina(valor: ancho / 100, color: neg ? Lienzo.negativo : (enCurso ? Lienzo.tintaTerciaria : Lienzo.positivo))
            Text(x.tasa == nil ? "sin ingresos" : pctSinMas(x.tasa!)).font(Letra.pieFuerte).monospacedDigit()
                .foregroundStyle(neg ? Lienzo.negativo : Lienzo.tinta).frame(width: 78, alignment: .trailing)
        }
        .accessibilityElement(children: .combine)
    }

    private var panelObjetivo: some View {
        let o = m.objetivo
        let frase: String = {
            if o.objetivo == 0 { return "Tu patrimonio es de \(din(o.actual)). Ponte un objetivo para ver cuándo llegas." }
            if o.conseguido { return "Objetivo conseguido: tienes \(din(o.actual)) de \(din(o.objetivo))." }
            if o.ritmo <= 0 { return "A este ritmo no llegas: en los últimos meses tu patrimonio \(o.ritmo < 0 ? "baja" : "no crece"). Te faltan \(din(o.objetivo - o.actual))." }
            let n = o.mesesHasta ?? 0
            return "Al ritmo de los últimos meses (\(din(o.ritmo)) al mes) llegarías en \(n) \(n == 1 ? "mes" : "meses"). Te faltan \(din(o.objetivo - o.actual))."
        }()
        return TarjetaSeccion(titulo: "camino al objetivo.", accion: (o.objetivo != 0 ? "cambiar." : "poner objetivo.", { hoja = .objetivo })) {
            VStack(alignment: .leading, spacing: Medida.xs) {
                Text(frase).font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                if o.puntos.count < 2 {
                    Text("La previsión aparece en cuanto haya un par de meses de movimientos.").font(Letra.pie).foregroundStyle(Lienzo.tintaTerciaria)
                } else if !oculto {
                    GraficaObjetivo(o: o).frame(height: 140).padding(.top, Medida.xs)
                }
            }
        }
    }

    private var panelActivos: some View {
        let total = m.activos.reduce(0) { $0 + $1.valor }
        return TarjetaSeccion(titulo: "tus activos.", detalle: "en directo.") {
            ForEach(Array(m.activos.enumerated()), id: \.offset) { _, f in
                // Las cuentas de inversión abren su ficha (openFichaInversion).
                Button { if !f.ficha.isEmpty { hoja = .inversion(f.ficha) } } label: {
                    HStack(alignment: .center, spacing: Medida.xs) {
                        Text(f.nombre + ".").font(Letra.cuerpo).foregroundStyle(Lienzo.tinta).lineLimit(1)
                        if !f.ficha.isEmpty { FlechaFila() }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 1) {
                            Text(din(f.valor)).font(Letra.numero).foregroundStyle(Lienzo.tinta)
                            variacion(f)
                        }
                    }
                    .frame(minHeight: 48)
                    .overlay(alignment: .bottom) { Rectangle().fill(Lienzo.filo).frame(height: 1) }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.pulsable(0.98))
                .disabled(f.ficha.isEmpty)
                .accessibilityElement(children: .combine)
                .accessibilityHint(f.ficha.isEmpty ? "" : "abrir la ficha de la inversión.")
            }
            FilaDato(etiqueta: "total.", valor: din(total), separador: false)
        }
    }

    @ViewBuilder private func variacion(_ f: ModeloResumen.Activo) -> some View {
        if oculto {
            EmptyView()
        } else if f.pct == nil, let c = f.cambio, abs(c) >= 0.5 {
            Text((c >= 0 ? "+" : "−") + FormatoFin.dinero(abs(c))).font(Letra.pie).monospacedDigit().foregroundStyle(c < 0 ? Lienzo.negativo : Lienzo.positivo)
        } else if let p = f.pct {
            let clase = abs(p) < 0.05 ? 0 : p > 0 ? 1 : -1
            Text(FormatoFin.pct(p)).font(Letra.pie).monospacedDigit()
                .foregroundStyle(clase > 0 ? Lienzo.positivo : clase < 0 ? Lienzo.negativo : Lienzo.tintaSecundaria)
        } else {
            Text("sin datos").font(Letra.pie).foregroundStyle(Lienzo.tintaTerciaria)
        }
    }

    private var panelSuscripciones: some View {
        let mes = m.suscripciones.reduce(0) { $0 + $1.importe }
        return TarjetaSeccion(titulo: "suscripciones y fijos.", accion: ("gestionar.", { hoja = .gestor })) {
            VStack(alignment: .leading, spacing: Medida.s) {
                Text("\(din(mes)) al mes, \(din(mes * 12)) al año.").font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                if m.suscripciones.isEmpty {
                    Text("No tienes suscripciones ni gastos fijos activos.").font(Letra.pie).foregroundStyle(Lienzo.tintaTerciaria)
                } else {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: Medida.xs), GridItem(.flexible(), spacing: Medida.xs)], spacing: Medida.xs) {
                        ForEach(m.suscripciones) { x in
                            Button { hoja = .gestor } label: {
                                VStack(alignment: .leading, spacing: Medida.xxs) {
                                    LogoSuscripcion(id: x.id, titulo: x.titulo, logos: logos, lado: 28)
                                    Text(x.titulo).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).lineLimit(1)
                                    Text(din(x.importe)).font(Letra.numero).foregroundStyle(Lienzo.tinta)
                                    Text(x.faltan == 0 ? "hoy." : x.faltan == 1 ? "mañana." : "día \(x.dia), en \(x.faltan) días.")
                                        .font(Letra.pie).foregroundStyle(x.faltan <= 3 ? Lienzo.naranjaProfundo : Lienzo.tintaSecundaria)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(Medida.s)
                                .background(Lienzo.fondo, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
                                .contentShape(RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
                            }
                            .buttonStyle(.pulsable)
                            .accessibilityHint("gestionar suscripciones.")
                        }
                    }
                }
            }
        }
    }

    private var panelPrevision: some View {
        let p = m.prevision
        var filas: [(String, String)] = [("fijos que quedan.", din(p.fijos))]
        if p.variable != 0 { filas.append(("gasto normal hasta fin de mes.", din(p.variable))) }
        if p.porEntrar != 0 { filas.append(("sueldo por entrar.", din(p.porEntrar))) }
        if let col = p.colchon { filas.append(("colchón.", String(format: "%.1f", col).replacingOccurrences(of: ".", with: ",") + " meses")) }
        if !p.top.isEmpty { filas.append(("donde más gastas.", p.top)) }
        return TarjetaSeccion(titulo: "fin de mes.", detalle: "previsión.") {
            VStack(alignment: .leading, spacing: Medida.xs) {
                cifra(din(p.fin), negativa: p.fin < 0)
                Text("en tus cuentas el día \(p.ultimoDia), contando fijos\(p.variable != 0 ? ", tu gasto normal" : "")\(p.porEntrar != 0 ? " y el sueldo por entrar" : "").")
                    .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                VStack(spacing: 0) {
                    ForEach(Array(filas.enumerated()), id: \.offset) { i, f in FilaDato(etiqueta: f.0, valor: f.1, separador: i < filas.count - 1) }
                }
            }
        }
        .padding(.bottom, Medida.xs)
    }
}

// finResGraficaObjetivo: lo real en naranja, la previsión a este ritmo en naranja discontinuo, la raya del objetivo en
// gris. Se dibuja de izquierda a derecha al aparecer.
private struct GraficaObjetivo: View {
    let o: ModeloResumen.Objetivo
    @State private var visto: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        Canvas { ctx, size in
            let reales = o.puntos.map(\.valor)
            let horizonte = o.mesesHasta.map { min($0, 36) } ?? 12
            let proy = (1...max(horizonte, 1)).map { o.actual + o.ritmo * Double($0) }
            var todos = reales + proy
            if o.objetivo > 0 { todos.append(o.objetivo) }
            var lo = todos.min() ?? 0, hi = todos.max() ?? 1
            let hueco = (hi - lo) * 0.12 != 0 ? (hi - lo) * 0.12 : (abs(hi) * 0.1 != 0 ? abs(hi) * 0.1 : 100)
            lo -= hueco; hi += hueco
            let total = Double(reales.count - 1 + proy.count)
            let x = { (i: Double) in CGFloat(i / total) * size.width }
            let y = { (v: Double) in size.height - CGFloat((v - lo) / (hi - lo)) * size.height }
            var real = Path()
            for (i, v) in reales.enumerated() {
                let p = CGPoint(x: x(Double(i)), y: y(v))
                if i == 0 { real.move(to: p) } else { real.addLine(to: p) }
            }
            let i0 = Double(reales.count - 1)
            var area = real
            area.addLine(to: CGPoint(x: x(i0), y: size.height)); area.addLine(to: CGPoint(x: 0, y: size.height)); area.closeSubpath()
            ctx.fill(area, with: .color(Lienzo.naranjaSuave))
            if o.objetivo > 0 {
                var l = Path(); l.move(to: CGPoint(x: 0, y: y(o.objetivo))); l.addLine(to: CGPoint(x: size.width, y: y(o.objetivo)))
                ctx.stroke(l, with: .color(Lienzo.tintaTerciaria), style: StrokeStyle(lineWidth: 1, dash: [3, 4]))
            }
            var hoy = Path(); hoy.move(to: CGPoint(x: x(i0), y: 0)); hoy.addLine(to: CGPoint(x: x(i0), y: size.height))
            ctx.stroke(hoy, with: .color(Lienzo.filoFuerte), lineWidth: 1)
            ctx.stroke(real, with: .color(Lienzo.naranja), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            var prev = Path(); prev.move(to: CGPoint(x: x(i0), y: y(o.actual)))
            for (k, v) in proy.enumerated() { prev.addLine(to: CGPoint(x: x(i0 + Double(k + 1)), y: y(v))) }
            ctx.stroke(prev, with: .color(Lienzo.naranja.opacity(0.5)), style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [4, 5]))
            ctx.fill(Path(ellipseIn: CGRect(x: x(i0) - 3.5, y: y(o.actual) - 3.5, width: 7, height: 7)), with: .color(Lienzo.naranja))
        }
        .mask(alignment: .leading) {
            GeometryReader { g in Rectangle().frame(width: g.size.width * visto) }
        }
        .onAppear { withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento).delay(0.1)) { visto = 1 } }
        .accessibilityLabel("Patrimonio de los últimos meses y su previsión" + (o.fecha.isEmpty ? "." : ", llegarías al objetivo en \(o.fecha)."))
    }
}

extension Color {
    // Colores de categoría guardados como «#rrggbb» (financeProCategoryColor). En tinta, su gris (Grises.deColor).
    init(hexWeb: String) {
        let h = hexWeb.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        self = Color.deUsuario(UInt32(h, radix: 16) ?? 0x78716c)
    }
}
