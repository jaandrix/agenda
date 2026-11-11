import SwiftUI
import UniformTypeIdentifiers

// Finanzas como la PWA del móvil (renderMobileFinances en js/nucleo.js): las mismas cuatro pestañas, en el mismo orden,
// con los mismos bloques y las cifras del mismo código (MotorFinanzas). Solo se calcula la pestaña que se ve; las otras
// se preparan después, en segundo plano, para que cambiar de pestaña no espere.

enum HojaFinanzas: Identifiable {
    case importar, buscar, gestor, editarSuscripcion(String?), permitir, revisar, opcion(OpcionFinanzas)
    var id: String {
        switch self {
        case .importar: return "importar"
        case .buscar: return "buscar"
        case .gestor: return "gestor"
        case .editarSuscripcion(let id): return "sub:" + (id ?? "nueva")
        case .permitir: return "permitir"
        case .revisar: return "revisar"
        case .opcion(let o): return "opcion:" + o.rawValue
        }
    }
}

struct FinanzasView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.openURL) private var abrirURL
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
    @State private var preparadoEn: Int = -1

    private var pestana: PestanaFinanzas { PestanaFinanzas(rawValue: pestanaGuardada) ?? .cuentas }
    private var mesNombre: String {
        let n = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        return n[Calendar.current.component(.month, from: Date()) - 1]
    }
    private var escondido: Bool { oculto && !ver }

    var body: some View {
        ScrollViewReader { scroll in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    CabeceraApartado(titulo: "finanzas", contexto: mesNombre + ".") {
                        if oculto {
                            Button { ver.toggle() } label: {
                                Image(systemName: ver ? "eye.slash" : "eye").font(.system(size: 17, weight: .semibold)).foregroundStyle(Paleta.textoSecundario)
                                    .frame(width: 44, height: 44)
                            }
                            .buttonStyle(.plain).accessibilityLabel(ver ? "ocultar cifras" : "ver cifras")
                        }
                    }
                    .id("arriba")
                    // Mantener pulsado el título: lo que tarda el motor (arranque, carga del documento y cada pestaña, en ms).
                    .onLongPressGesture {
                        Task {
                            let m = await MotorFinanzas.compartido.ultimaMedida
                            aviso = m.sorted { $0.key < $1.key }.map { "\($0.key): \(Int($0.value.rounded())) ms" }.joined(separator: ", ")
                        }
                    }
                    selector(scroll)
                    contenido
                }
                .padding(.horizontal, 20)
                .padding(.bottom, Espacio.xl)
            }
        }
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar() }
        .task(id: "\(c.informe.revision)|\(pestanaGuardada)|\(rango)|\(extras)|\(nMov)") { await cargar() }
        .sheet(item: $hoja) { h in hojaVista(h) }
        .alert("finanzas.", isPresented: Binding(get: { aviso != nil }, set: { if !$0 { aviso = nil } })) {
            Button("aceptar.", role: .cancel) { aviso = nil }
        } message: { Text(aviso ?? "") }
    }

    private func selector(_ scroll: ScrollViewProxy) -> some View {
        HStack(spacing: 4) {
            ForEach(PestanaFinanzas.allCases) { p in
                let on = p == pestana
                Button {
                    guard p != pestana else { return }
                    pestanaGuardada = p.rawValue
                    nMov = 30
                    scroll.scrollTo("arriba", anchor: .top)
                } label: {
                    Text(p.titulo)
                        .font(Tipo.poppins(14, on ? .semibold : .medium, estilo: .footnote))
                        .foregroundStyle(on ? Paleta.texto : Paleta.textoSecundario)
                        .lineLimit(1).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background(on ? Paleta.superficie : Color.clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(4)
        .background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.top, Espacio.m)
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
        ProgressView().frame(maxWidth: .infinity).padding(.top, Espacio.xl)
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
        }
    }

    private func abrirMovimiento(_ f: FilaMov) { c.modal = .editarMovimiento(f.movimiento) }
    // El editor es una hoja del coordinador: se abre cuando la de Finanzas ya se ha ido.
    private func abrirTrasCerrar(_ f: FilaMov) {
        Task { try? await Task.sleep(nanoseconds: 450_000_000); abrirMovimiento(f) }
    }
    private func nuevoMovimiento() { c.modal = .movimiento(OperacionBitacora.nuevoIdMovimiento(), tipo: "expense") }

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
        guard let doc = await c.documentoVisible() else { return }
        let revision = c.informe.revision
        let motor = MotorFinanzas.compartido
        let tab = pestana
        let opciones = Opciones(rango: rango, extras: extras, n: nMov)
        do {
            try await motor.cargar(doc, revision: String(revision))
            oculto = ((try? doc.valor(de: "blurFinances")) ?? nil)?.booleano == true
            try await pintar(tab, motor, opciones)
        } catch {
            aviso = (error as? LocalizedError)?.errorDescription ?? "no se pudo calcular finanzas."
            return
        }
        // prepararFinanzas, como la web al abrir Finanzas: cargos de suscripciones, programados, historial... Si cambia
        // algo, va a la cola y la nueva revisión vuelve a pintar. Una vez por revisión.
        if preparadoEn != revision {
            preparadoEn = revision
            if let d = try? await motor.crudo("preparar") { await guardar(d) }
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

struct EtiquetaFin: View {
    let texto: String
    var detalle: String?
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(texto).font(Tipo.poppins(13, .semibold, estilo: .footnote)).foregroundStyle(Paleta.textoSecundario).accessibilityAddTraits(.isHeader)
            Spacer()
            if let detalle { Text(detalle).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
        }
        .padding(.top, Espacio.l).padding(.bottom, Espacio.xs)
    }
}

struct BotonFin: View {
    let texto: String
    var acento = false
    let accion: () -> Void
    var body: some View {
        Button(action: accion) {
            Text(texto).font(Tipo.poppins(15, .semibold, estilo: .body))
                .foregroundStyle(acento ? Paleta.sobreAcento : Paleta.texto)
                .frame(maxWidth: .infinity, minHeight: 46)
                .background(acento ? Paleta.acento : Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct EnlaceFin: View {
    let texto: String
    let accion: () -> Void
    var body: some View {
        Button(action: accion) { Text(texto).font(Tipo.poppins(14, .medium, estilo: .footnote)).foregroundStyle(Paleta.acento).frame(minHeight: 44) }
            .buttonStyle(.plain)
    }
}

// .m-fila de un movimiento (mobileFinFilaMov): fecha corta, concepto y «categoría, cuenta», y la cifra con su signo.
struct FilaMovView: View {
    let f: FilaMov
    let oculto: Bool
    let abrir: (FilaMov) -> Void

    var body: some View {
        Button { abrir(f) } label: {
            HStack(alignment: .firstTextBaseline, spacing: Espacio.s) {
                Text(f.dia).font(Tipo.poppins(13, .medium, estilo: .footnote)).monospacedDigit().foregroundStyle(Paleta.textoSecundario)
                    .frame(width: 50, alignment: .leading)
                VStack(alignment: .leading, spacing: 2) {
                    (Text(f.titulo) + (f.pendiente ? Text(" pendiente.").font(Tipo.pie).foregroundColor(Paleta.textoSecundario) : Text("")))
                        .font(Tipo.cuerpo).foregroundStyle(f.futuro ? Paleta.textoSecundario : Paleta.texto).lineLimit(1)
                    if !f.meta.isEmpty { Text(f.meta).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).lineLimit(1) }
                }
                Spacer(minLength: Espacio.s)
                HStack(spacing: 2) {
                    if f.tipo == "transfer" { Image(systemName: "arrow.left.arrow.right").font(.system(size: 11, weight: .semibold)) }
                    Text(oculto ? "•••" : (f.tipo == "income" ? "+" : f.tipo == "expense" ? "−" : "") + FormatoFin.dinero(f.importe))
                        .font(Tipo.poppins(15, .semibold, estilo: .body)).monospacedDigit()
                }
                .foregroundStyle(f.tipo == "income" ? Paleta.progreso : Paleta.texto)
            }
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
        .accessibilityElement(children: .combine)
        .accessibilityHint("abrir el movimiento.")
    }
}

// mobileFinPorAjustar: las incidencias (fecha o importe mal) y el aviso de los que esperan categoría.
struct AvisoPorAjustar: View {
    let p: PorAjustar
    let abrir: () -> Void
    @State private var abierto = false

    var body: some View {
        VStack(alignment: .leading, spacing: Espacio.s) {
            if !p.incidencias.isEmpty {
                DisclosureGroup(isExpanded: $abierto) {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(p.incidencias.enumerated()), id: \.offset) { _, i in
                            Text("\(i.nota): \(i.motivo).").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        }
                    }.padding(.top, 4)
                } label: {
                    Text("\(p.incidencias.count) \(p.incidencias.count == 1 ? "movimiento tiene" : "movimientos tienen") la fecha o el importe mal y no cuentan en los saldos.")
                        .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                }
                .tint(Paleta.textoSecundario)
            }
            if p.n > 0 {
                Button(action: abrir) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(p.n) \(p.n == 1 ? "movimiento" : "movimientos") por ajustar.").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto)
                        Text("ponles categoría y revisa la cuenta.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(Paleta.tinteAcento, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, Espacio.m)
    }
}

// MARK: - cuentas.

private struct PestanaCuentas: View {
    let m: ModeloCuentas
    let oculto: Bool
    @Binding var rango: String
    @Binding var extras: Bool
    @Binding var hoja: HojaFinanzas?
    let logos: LogosFinanzas
    let abrir: (FilaMov) -> Void
    let nuevo: () -> Void
    let verTodos: () -> Void
    let detectada: (String, String) -> Void
    let cobroVisto: (String) -> Void
    let alta: (String) -> Void

    var body: some View {
        GraficaPatrimonio(g: m.grafica, oculto: oculto, rango: $rango, extras: $extras)
        BotonFin(texto: "+ movimiento.", acento: true, accion: nuevo).padding(.top, Espacio.m)
        if m.porAjustar.n > 0 || !m.porAjustar.incidencias.isEmpty { AvisoPorAjustar(p: m.porAjustar) { hoja = .revisar } }
        // renderAvisoPresupuestos
        if !m.avisosPresupuesto.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(m.avisosPresupuesto.enumerated()), id: \.offset) { _, a in
                    Group {
                        if a.queda >= 0 {
                            Text("vas al ") + Text("\(a.pct) %").bold() + Text(" en \(a.nombre): quedan \(oculto ? "•••" : FormatoFin.dinero(a.queda)) para \(a.dias) \(a.dias == 1 ? "día" : "días").")
                        } else {
                            Text("\(a.nombre) se ha pasado ") + Text(oculto ? "•••" : FormatoFin.dinero(-a.queda)).bold() + Text(" del presupuesto este mes.")
                        }
                    }
                    .font(Tipo.pie).foregroundStyle(Paleta.texto)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14).background(Paleta.superficie, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
            .padding(.top, Espacio.m)
        }
        // renderSuscripcionesDetectadas (con los que siguen cobrando tras la baja)
        ForEach(m.detectadas.siguenCobrando) { s in
            tarjetaSugerencia(titulo: "\(s.titulo) sigue cobrando.",
                              texto: "La diste de baja el \(s.desde) y hay \(s.n == 1 ? "un cargo" : "\(s.n) cargos"): \(oculto ? "•••" : FormatoFin.dinero(s.importe)) el \(s.fecha).",
                              botones: [("dar de alta.", { alta(s.id) }), ("ya lo sé.", { cobroVisto(s.id) })])
        }
        ForEach(m.detectadas.propuestas) { s in
            tarjetaSugerencia(titulo: "¿\(s.nombre) es una suscripción?",
                              texto: "unos \(oculto ? "•••" : FormatoFin.dinero(s.importe)) cada mes, hacia el día \(s.dia) (\(s.meses) meses seguidos).",
                              botones: [("añadir.", { detectada(s.clave, "anadir") }), ("no es.", { detectada(s.clave, "ignorar") })])
        }
        EtiquetaFin(texto: "este mes.")
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("entra.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                Text(oculto ? "•••" : FormatoFin.dinero(m.ingresos)).font(Tipo.poppins(24, .bold, estilo: .title2)).monospacedDigit().foregroundStyle(Paleta.texto)
            }.frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text("sale.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                Text(oculto ? "•••" : FormatoFin.dinero(m.gastos)).font(Tipo.poppins(24, .bold, estilo: .title2)).monospacedDigit().foregroundStyle(Paleta.texto)
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
        if m.ingresos != 0 || m.gastos != 0 {
            VStack(alignment: .leading, spacing: 6) {
                BarraAvance(valor: min(1, m.ratio), fondo: Paleta.borde, color: m.ratio > 1 ? Paleta.atencion : Paleta.acento, alto: 6)
                Text(m.ingresos > 0 ? "\(Int((m.ratio * 100).rounded())) % de lo que ha entrado, ya gastado." : "Este mes todavía no ha entrado nada.")
                    .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            }
            .padding(.top, Espacio.s)
        }
        if let r = m.ritmo {
            EtiquetaFin(texto: "ritmo.")
            VStack(alignment: .leading, spacing: 4) {
                textoRitmo(r).font(Tipo.cuerpo).foregroundStyle(Paleta.texto)
                if let p = r.previsto, p != 0 {
                    Text("A este ritmo, unos \(oculto ? "•••" : FormatoFin.dinero(p)) a final de mes.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14).background(Paleta.superficie, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
        }
        EtiquetaFin(texto: "cuentas.")
        ForEach(m.cuentas) { cta in
            FilaLibro(etiqueta: cta.nombre + ".", valor: oculto ? "•••" : FormatoFin.dinero(cta.saldo))
        }
        if !m.cargos.lista.isEmpty {
            EtiquetaFin(texto: "próximos cargos.")
            ForEach(m.cargos.lista) { x in
                HStack(alignment: .firstTextBaseline, spacing: Espacio.s) {
                    Text(x.cuando).font(Tipo.poppins(13, .medium, estilo: .footnote)).foregroundStyle(Paleta.textoSecundario).frame(width: 64, alignment: .leading)
                    LogoSuscripcion(id: x.id, titulo: x.titulo, logos: logos, lado: 22)
                    Text(x.titulo).font(Tipo.cuerpo).foregroundStyle(Paleta.texto).lineLimit(1)
                    Spacer()
                    Text(oculto ? "•••" : FormatoFin.dinero(x.importe)).font(Tipo.poppins(15, .semibold, estilo: .body)).monospacedDigit().foregroundStyle(Paleta.texto)
                }
                .padding(.vertical, 10)
                .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                .accessibilityElement(children: .combine)
            }
        }
        EtiquetaFin(texto: "últimos movimientos.")
        if m.ultimos.isEmpty {
            Text("todavía no hay movimientos. Añade uno o importa un extracto.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s)
        } else {
            ForEach(m.ultimos) { f in FilaMovView(f: f, oculto: oculto, abrir: abrir) }
            EnlaceFin(texto: "ver todos.", accion: verTodos)
        }
    }

    private func textoRitmo(_ r: ModeloCuentas.Ritmo) -> Text {
        var t = Text(oculto ? "•••" : FormatoFin.dinero(r.gasto)).bold() + Text(" gastados hasta hoy")
        if r.antes != 0 {
            let dif = (oculto ? "•••" : FormatoFin.dinero(abs(r.dif))) + (r.dif > 0 ? " más" : " menos")
            t = t + Text(", ") + Text(dif).foregroundColor(r.dif > 0 ? Paleta.atencion : Paleta.progreso) + Text(" que a día \(r.dia) de \(r.mesPasado)")
        }
        return t + Text(".")
    }

    private func tarjetaSugerencia(titulo: String, texto: String, botones: [(String, () -> Void)]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(titulo).font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto)
            Text(texto).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            HStack(spacing: Espacio.s) {
                ForEach(Array(botones.enumerated()), id: \.offset) { _, b in
                    Button(action: b.1) {
                        Text(b.0).font(Tipo.poppins(14, .medium, estilo: .footnote)).foregroundStyle(Paleta.texto)
                            .padding(.horizontal, 12).frame(minHeight: 36)
                            .background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
                    }.buttonStyle(.plain)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14).background(Paleta.superficie, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
        .padding(.top, Espacio.s)
    }
}

// MARK: - movimientos.

private struct PestanaMovimientos: View {
    let m: ModeloMovimientos
    let oculto: Bool
    @Binding var hoja: HojaFinanzas?
    let abrir: (FilaMov) -> Void
    let nuevo: () -> Void
    let mas: () -> Void
    let web: () -> Void

    private static let meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

    private var grupos: [(String, [FilaMov])] {
        var r: [(String, [FilaMov])] = []
        for f in m.filas {
            let mes = String(f.fecha.prefix(7))
            if r.last?.0 == mes { r[r.count - 1].1.append(f) } else { r.append((mes, [f])) }
        }
        return r
    }

    private func titulo(_ mes: String) -> String {
        guard mes.count == 7, let n = Int(mes.suffix(2)), (1...12).contains(n) else { return "sin fecha." }
        let anio = String(mes.prefix(4))
        return Self.meses[n - 1] + (anio != String(m.anioActual) ? " " + anio : "") + "."
    }

    var body: some View {
        HStack(spacing: Espacio.s) {
            BotonFin(texto: "importar extracto.") { hoja = .importar }
            BotonFin(texto: "+ movimiento.", acento: true, accion: nuevo)
        }
        .padding(.top, Espacio.m)
        if m.total > 0 {
            Button { hoja = .buscar } label: {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .semibold))
                    Text("buscar un movimiento.").font(Tipo.cuerpo)
                    Spacer()
                }
                .foregroundStyle(Paleta.textoSecundario)
                .padding(.horizontal, 14).frame(minHeight: 46)
                .background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, Espacio.s)
        }
        if m.porAjustar.n > 0 || !m.porAjustar.incidencias.isEmpty { AvisoPorAjustar(p: m.porAjustar) { hoja = .revisar } }
        if m.filas.isEmpty {
            Text("todavía no hay movimientos. Añade uno o importa un extracto para empezar a ver tus cuentas.")
                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.m)
        } else {
            ForEach(grupos, id: \.0) { g in
                EtiquetaFin(texto: titulo(g.0))
                ForEach(g.1) { f in FilaMovView(f: f, oculto: oculto, abrir: abrir) }
            }
        }
        HStack(spacing: Espacio.l) {
            if m.total > m.filas.count { EnlaceFin(texto: "ver \(min(30, m.total - m.filas.count)) más.", accion: mas) }
            // mobileFinMenu.
            Menu {
                ForEach(OpcionFinanzas.allCases) { o in Button(o.titulo) { hoja = .opcion(o) } }
            } label: {
                Text("más opciones.").font(Tipo.poppins(14, .medium, estilo: .footnote)).foregroundStyle(Paleta.acento).frame(minHeight: 44)
            }
        }
        .padding(.top, Espacio.s)
    }
}

// MARK: - planificación.

private struct PestanaPlanificacion: View {
    let m: ModeloPlanificacion
    let oculto: Bool
    @Binding var hoja: HojaFinanzas?

    private func color(_ s: String) -> Color { s == "superado" ? Paleta.atencion : s == "aviso" ? Paleta.acento : Paleta.progreso }
    private func din(_ v: Double) -> String { oculto ? "•••" : FormatoFin.dinero(v) }

    var body: some View {
        if m.categorias.isEmpty && m.otros.isEmpty {
            Text(m.ingresos != 0 ? "Todo está sin asignar: todavía no has puesto presupuestos." : "este mes no tienes presupuestos. Se reparten desde el ordenador, en Finanzas, planificación.")
                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.m)
        } else {
            EtiquetaFin(texto: "presupuestos.")
            ForEach(m.categorias) { cat in
                let sub = [cat.refunded > 0 ? "\(din(cat.refunded)) devueltos" : nil, "el mes pasado gastaste \(din(cat.lastMonth))", cat.casillas > 1 ? "\(cat.casillas) casillas" : nil]
                    .compactMap { $0 }.joined(separator: ", ")
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Circle().fill(cat.color.isEmpty ? Paleta.textoSecundario : Color(hexWeb: cat.color)).frame(width: 8, height: 8)
                        Text(cat.nombre).font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto).lineLimit(1)
                        Spacer()
                        Text(din(cat.spent)).font(Tipo.poppins(15, .semibold, estilo: .body)).monospacedDigit().foregroundStyle(Paleta.texto)
                        Text("de \(din(cat.available))").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    }
                    BarraAvance(valor: min(100, max(2, cat.percentage)) / 100, fondo: Paleta.borde, color: color(cat.status), alto: 6)
                    HStack(alignment: .firstTextBaseline) {
                        Text(sub + ".").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).lineLimit(2)
                        Spacer(minLength: Espacio.s)
                        Text(oculto ? "•••" : cat.estado).font(Tipo.poppins(13, .semibold, estilo: .footnote)).foregroundStyle(color(cat.status))
                    }
                    Text("plan. \(din(cat.planned))").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                }
                .padding(.vertical, 12)
                .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                .accessibilityElement(children: .combine)
                .accessibilityValue("\(Int(cat.percentage.rounded())) por ciento gastado.")
            }
            if !m.otros.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("otros destinos.").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto)
                    ForEach(Array(m.otros.enumerated()), id: \.offset) { _, a in
                        Text("\(a.label) \(din(a.amount))").font(Tipo.pie).foregroundStyle(Paleta.texto)
                    }
                    Text("Cuentan como repartido; sin categoría no se puede seguir su gasto.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                }
                .padding(.top, Espacio.m)
            }
        }
        EnlaceFin(texto: "¿me lo puedo permitir?") { hoja = .permitir }.padding(.top, Espacio.s)
    }
}

// MARK: - resumen.

private struct PestanaResumen: View {
    let m: ModeloResumen
    let oculto: Bool
    @Binding var hoja: HojaFinanzas?
    let logos: LogosFinanzas
    let web: () -> Void

    private func din(_ v: Double) -> String { oculto ? "•••" : FormatoFin.dinero(v) }
    private func pctSinMas(_ v: Double) -> String { FormatoFin.pct(v).replacingOccurrences(of: "+", with: "") }

    var body: some View {
        panelMes("este mes.", m.esteMes, conSueldo: true)
        panelMes("mes anterior.", m.mesAnterior, conSueldo: false)
        panelAhorro
        panelObjetivo
        panelActivos
        panelSuscripciones
        panelPrevision
    }

    private func panel<C: View>(_ titulo: String, _ sub: String?, @ViewBuilder _ c: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(titulo).font(Tipo.poppins(17, .semibold, estilo: .headline)).foregroundStyle(Paleta.texto).accessibilityAddTraits(.isHeader)
                Spacer()
                if let sub { Text(sub).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
            }
            c()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.top, Espacio.m)
    }

    private func cifra(_ t: String, negativa: Bool = false) -> some View {
        Text(t).font(Tipo.poppins(28, .bold, estilo: .title)).monospacedDigit().foregroundStyle(negativa ? Paleta.atencion : Paleta.texto)
    }

    private func barra(_ nombre: String, _ v: Double, _ falta: Double, _ max: Double, color: Color) -> some View {
        HStack(spacing: 8) {
            Text(nombre).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).frame(width: 44, alignment: .leading)
            GeometryReader { g in
                HStack(spacing: 0) {
                    Rectangle().fill(color).frame(width: g.size.width * v / max)
                    if falta > 0 { Rectangle().fill(color.opacity(0.3)).frame(width: g.size.width * falta / max) }
                    Spacer(minLength: 0)
                }
                .clipShape(RoundedRectangle(cornerRadius: 3))
                .background(Paleta.borde, in: RoundedRectangle(cornerRadius: 3))
            }
            .frame(height: 8)
            Text(din(v)).font(Tipo.poppins(13, .semibold, estilo: .footnote)).monospacedDigit().foregroundStyle(Paleta.texto)
        }
    }

    private func panelMes(_ titulo: String, _ mes: ModeloResumen.Mes, conSueldo: Bool) -> some View {
        let neto = mes.entra - mes.sale
        let max = Swift.max(mes.entra + mes.falta, mes.sale, mes.sueldo, 1)
        return panel(titulo, mes.nombre + ".") {
            cifra(oculto ? "•••" : (neto >= 0 ? "+" : "−") + FormatoFin.dinero(abs(neto)), negativa: neto < 0)
            Text((neto >= 0 ? "te queda" : "has gastado más de lo que ha entrado") + (mes.falta > 0 ? ", y aún falta por entrar \(din(mes.falta)) del sueldo previsto" : "") + ".")
                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            barra("entra.", mes.entra, mes.falta, max, color: Paleta.progreso)
            barra("sale.", mes.sale, 0, max, color: Paleta.acento)
            if conSueldo && mes.sueldo != 0 { FilaLibro(etiqueta: "sueldo previsto.", valor: din(mes.sueldo)) }
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
        return panel("tasa de ahorro.", anterior.map { $0.nombre + "." } ?? "de lo que entra.") {
            cifra(anterior == nil ? "sin datos" : anterior!.tasa == nil ? "sin ingresos" : pctSinMas(anterior!.tasa!), negativa: (anterior?.tasa ?? 0) < 0)
            Text(nota).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            VStack(spacing: 6) {
                ForEach(Array(a.meses.reversed().enumerated()), id: \.offset) { _, x in filaAhorro(x, conAnio: conAnio, enCurso: false) }
                filaAhorro(a.enCurso, conAnio: conAnio, enCurso: true)
            }
            .padding(.top, 4)
        }
    }

    private func filaAhorro(_ x: ModeloResumen.MesAhorro, conAnio: Bool, enCurso: Bool) -> some View {
        let ancho = x.tasa.map { Swift.max(2, Swift.min(100, abs($0))) } ?? 0
        let neg = (x.tasa ?? 0) < 0
        return HStack(spacing: 8) {
            Text(x.nombre + (conAnio ? " \(x.anio)" : "") + (enCurso ? ", en curso" : "") + ".")
                .font(Tipo.pie).foregroundStyle(enCurso ? Paleta.textoSecundario : Paleta.texto).frame(width: 120, alignment: .leading).lineLimit(1).minimumScaleFactor(0.8)
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3).fill(Paleta.borde)
                    RoundedRectangle(cornerRadius: 3).fill(neg ? Paleta.atencion : Paleta.progreso).frame(width: g.size.width * ancho / 100)
                }
            }
            .frame(height: 8)
            Text(x.tasa == nil ? "sin ingresos" : pctSinMas(x.tasa!)).font(Tipo.poppins(13, .semibold, estilo: .footnote)).monospacedDigit()
                .foregroundStyle(neg ? Paleta.atencion : Paleta.texto).frame(width: 82, alignment: .trailing)
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
        return panel("camino al objetivo.", nil) {
            Text(frase).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            if o.puntos.count < 2 {
                Text("La previsión aparece en cuanto haya un par de meses de movimientos.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            } else if !oculto {
                GraficaObjetivo(o: o).frame(height: 150)
            }
            EnlaceFin(texto: o.objetivo != 0 ? "cambiar objetivo." : "poner objetivo.", accion: web)
        }
    }

    private var panelActivos: some View {
        let total = m.activos.reduce(0) { $0 + $1.valor }
        return panel("tus activos.", "en directo.") {
            ForEach(Array(m.activos.enumerated()), id: \.offset) { _, f in
                HStack(alignment: .firstTextBaseline) {
                    Text(f.nombre + ".").font(Tipo.cuerpo).foregroundStyle(Paleta.texto).lineLimit(1)
                    Spacer()
                    Text(din(f.valor)).font(Tipo.poppins(15, .semibold, estilo: .body)).monospacedDigit().foregroundStyle(Paleta.texto)
                    variacion(f).frame(minWidth: 70, alignment: .trailing)
                }
                .accessibilityElement(children: .combine)
            }
            FilaLibro(etiqueta: "total.", valor: din(total))
        }
    }

    @ViewBuilder private func variacion(_ f: ModeloResumen.Activo) -> some View {
        if oculto {
            Text("")
        } else if f.pct == nil, let c = f.cambio, abs(c) >= 0.5 {
            Text((c >= 0 ? "+" : "−") + FormatoFin.dinero(abs(c))).font(Tipo.pie).foregroundStyle(c < 0 ? Paleta.atencion : Paleta.progreso)
        } else if let p = f.pct {
            let clase = abs(p) < 0.05 ? 0 : p > 0 ? 1 : -1
            HStack(spacing: 2) {
                if clase != 0 { Image(systemName: clase > 0 ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill").font(.system(size: 8)) }
                Text(FormatoFin.pct(p))
            }
            .font(Tipo.pie).foregroundStyle(clase > 0 ? Paleta.progreso : clase < 0 ? Paleta.atencion : Paleta.textoSecundario)
        } else {
            Text("sin datos").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
        }
    }

    private var panelSuscripciones: some View {
        let mes = m.suscripciones.reduce(0) { $0 + $1.importe }
        return panel("suscripciones y fijos.", "\(din(mes)) al mes, \(din(mes * 12)) al año.") {
            if m.suscripciones.isEmpty {
                Text("No tienes suscripciones ni gastos fijos activos.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            } else {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(m.suscripciones) { x in
                        Button { hoja = .gestor } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                LogoSuscripcion(id: x.id, titulo: x.titulo, logos: logos, lado: 30)
                                Text(x.titulo).font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto).lineLimit(1)
                                Text(din(x.importe)).font(Tipo.poppins(15, .semibold, estilo: .body)).monospacedDigit().foregroundStyle(Paleta.texto)
                                Text(x.faltan == 0 ? "hoy." : x.faltan == 1 ? "mañana." : "día \(x.dia), en \(x.faltan) días.")
                                    .font(Tipo.pie).foregroundStyle(x.faltan <= 3 ? Paleta.acento : Paleta.textoSecundario)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10)
                            .background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("gestionar suscripciones.")
                    }
                }
            }
            EnlaceFin(texto: "gestionar suscripciones.") { hoja = .gestor }
        }
    }

    private var panelPrevision: some View {
        let p = m.prevision
        return panel("fin de mes.", "previsión.") {
            cifra(din(p.fin), negativa: p.fin < 0)
            Text("en tus cuentas el día \(p.ultimoDia), contando fijos\(p.variable != 0 ? ", tu gasto normal" : "")\(p.porEntrar != 0 ? " y el sueldo por entrar" : "").")
                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            FilaLibro(etiqueta: "fijos que quedan.", valor: din(p.fijos))
            if p.variable != 0 { FilaLibro(etiqueta: "gasto normal hasta fin de mes.", valor: din(p.variable)) }
            if p.porEntrar != 0 { FilaLibro(etiqueta: "sueldo por entrar.", valor: din(p.porEntrar)) }
            if let col = p.colchon { FilaLibro(etiqueta: "colchón.", valor: String(format: "%.1f", col).replacingOccurrences(of: ".", with: ",") + " meses") }
            if !p.top.isEmpty { FilaLibro(etiqueta: "donde más gastas.", valor: p.top) }
        }
    }
}

// finResGraficaObjetivo: lo real, la previsión a este ritmo y la raya del objetivo.
private struct GraficaObjetivo: View {
    let o: ModeloResumen.Objetivo

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
            ctx.fill(area, with: .color(Paleta.tinteAcento))
            if o.objetivo > 0 {
                var l = Path(); l.move(to: CGPoint(x: 0, y: y(o.objetivo))); l.addLine(to: CGPoint(x: size.width, y: y(o.objetivo)))
                ctx.stroke(l, with: .color(Paleta.textoSecundario), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
            }
            var hoy = Path(); hoy.move(to: CGPoint(x: x(i0), y: 0)); hoy.addLine(to: CGPoint(x: x(i0), y: size.height))
            ctx.stroke(hoy, with: .color(Paleta.borde), lineWidth: 1)
            ctx.stroke(real, with: .color(Paleta.acento), style: StrokeStyle(lineWidth: 2, lineJoin: .round))
            var prev = Path(); prev.move(to: CGPoint(x: x(i0), y: y(o.actual)))
            for (k, v) in proy.enumerated() { prev.addLine(to: CGPoint(x: x(i0 + Double(k + 1)), y: y(v))) }
            ctx.stroke(prev, with: .color(Paleta.acento.opacity(0.6)), style: StrokeStyle(lineWidth: 2, dash: [5, 4]))
        }
        .accessibilityLabel("Patrimonio de los últimos meses y su previsión" + (o.fecha.isEmpty ? "." : ", llegarías al objetivo en \(o.fecha)."))
    }
}

extension Color {
    // Colores de categoría guardados como «#rrggbb» (financeProCategoryColor).
    init(hexWeb: String) {
        let h = hexWeb.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let v = UInt32(h, radix: 16) ?? 0x78716c
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
}
