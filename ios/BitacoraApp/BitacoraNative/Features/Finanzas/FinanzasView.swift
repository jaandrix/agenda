import SwiftUI
import UniformTypeIdentifiers

private enum SubseccionFinanzas: String, CaseIterable, Identifiable {
    case resumen, movimientos, presupuestos, suscripciones, patrimonio
    var id: String { rawValue }
    var titulo: String {
        switch self {
        case .resumen: return "resumen"
        case .movimientos: return "movimientos"
        case .presupuestos: return "presupuestos"
        case .suscripciones: return "suscripciones"
        case .patrimonio: return "patrimonio"
        }
    }
}

struct FinanzasView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaFinanzas?
    @State private var ver = false
    @State private var sub: SubseccionFinanzas = .resumen
    @State private var rango: RangoGrafica = .tresMeses
    @State private var serie: [PuntoDia] = []
    @State private var filtros = FiltrosMovimientos()
    @State private var mostrarImportador = false
    @State private var extracto: ExtractoAnalizado?
    @State private var avisoImportacion: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                CabeceraContexto(titulo: "finanzas", detalle: vista.map { LecturaFinanzas.etiquetaMes($0.mesActual) }) {
                    if let v = vista {
                        let oculto = v.ocultar && !ver
                        Text(cifra(v.saldoLiquido, oculto))
                            .font(Tipo.poppins(44, .bold, estilo: .largeTitle)).monospacedDigit()
                            .foregroundStyle(Paleta.sobreContexto).lineLimit(1).minimumScaleFactor(0.55)
                            .padding(.top, Espacio.m)
                        Text("saldo líquido.")
                            .font(Tipo.pie).foregroundStyle(Paleta.sobreContextoSuave)
                        HStack(spacing: Espacio.l) {
                            datoCab("patrimonio", cifra(v.patrimonioOperativo, oculto))
                            datoCab("activos", cifra(v.activosTotales, oculto))
                        }
                        .padding(.top, Espacio.s)
                        if v.ocultar {
                            Button { ver.toggle() } label: {
                                Label(ver ? "ocultar cifras" : "ver cifras", systemImage: ver ? "eye.slash" : "eye")
                                    .font(Tipo.pie).foregroundStyle(Paleta.sobreContextoSuave)
                            }
                            .buttonStyle(.plain)
                            .padding(.top, Espacio.s)
                            .accessibilityLabel(ver ? "ocultar cifras" : "ver cifras")
                        }
                    } else {
                        ProgressView().tint(Paleta.sobreContextoSuave).padding(.top, Espacio.l)
                    }
                }
                VStack(alignment: .leading, spacing: 0) {
                    if let v = vista {
                        let oculto = v.ocultar && !ver
                        selectorSubseccion
                        switch sub {
                        case .resumen: resumen(v, oculto: oculto)
                        case .movimientos: movimientos(v, oculto: oculto)
                        case .presupuestos: presupuestos(v, oculto: oculto)
                        case .suscripciones: suscripciones(v, oculto: oculto)
                        case .patrimonio: patrimonio(v, oculto: oculto)
                        }
                    }
                }
                .modifier(HojaContenido())
            }
        }
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar() }
        .task(id: c.informe.revision) { await cargarVista() }
        .task(id: "\(rango.rawValue)-\(c.informe.revision)") { await cargarSerie() }
        .fileImporter(isPresented: $mostrarImportador,
                      allowedContentTypes: [.commaSeparatedText, .tabSeparatedText, .plainText, .data]) { resultado in
            Task { await leerExtracto(resultado) }
        }
        .sheet(item: $extracto) { e in
            RevisionExtractoView(extracto: e, cuentas: vista?.cuentas ?? []) { cuenta in
                Task { await importar(e, cuenta: cuenta) }
            }
        }
        .alert("importar extracto.", isPresented: Binding(get: { avisoImportacion != nil }, set: { if !$0 { avisoImportacion = nil } })) {
            Button("aceptar.", role: .cancel) { avisoImportacion = nil }
        } message: { Text(avisoImportacion ?? "") }
    }

    private func datoCab(_ etiqueta: String, _ valor: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(etiqueta + ".").font(Tipo.pie).foregroundStyle(Paleta.sobreContextoSuave)
            Text(valor).font(Tipo.poppins(15, .semibold, estilo: .subheadline)).monospacedDigit().foregroundStyle(Paleta.sobreContexto)
        }
        .accessibilityElement(children: .combine)
    }

    private var selectorSubseccion: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Espacio.xs) {
                ForEach(SubseccionFinanzas.allCases) { s in
                    let on = sub == s
                    Button { sub = s } label: {
                        Text(s.titulo + ".")
                            .font(Tipo.poppins(14, on ? .semibold : .medium, estilo: .footnote))
                            .foregroundStyle(on ? Paleta.sobreAcento : Paleta.textoSecundario)
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(on ? Paleta.acento : Paleta.tinteTexto, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .padding(.vertical, Espacio.xs)
        }
    }

    // MARK: resumen
    private func resumen(_ v: VistaFinanzas, oculto: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            CabeceraSeccion(titulo: "este mes.")
            FilaLibro(etiqueta: "entra.", valor: cifra(v.ingresosMes, oculto), acento: true)
            FilaLibro(etiqueta: "sale.", valor: cifra(v.gastosMes, oculto))
            FilaLibro(etiqueta: "balance.", valor: cifra(v.ingresosMes - v.gastosMes, oculto))
            estadoEnDirecto(v, oculto: oculto)
            if v.diferenciaFuturoPendiente != 0 {
                Text("pendiente o futuro: \(cifra(v.diferenciaFuturoPendiente, oculto)). dato informativo.")
                    .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.top, Espacio.xs)
            }
            CabeceraSeccion(titulo: "mes anterior.")
            FilaLibro(etiqueta: "entra.", valor: cifra(v.mesAnterior.ingresos, oculto))
            FilaLibro(etiqueta: "sale.", valor: cifra(v.mesAnterior.gastos, oculto))
            FilaLibro(etiqueta: "ahorro.", valor: cifra(v.mesAnterior.ahorro, oculto))
            if !v.historialAhorro.isEmpty {
                CabeceraSeccion(titulo: "histórico.", detalle: "meses cerrados")
                ForEach(v.historialAhorro.suffix(6).reversed(), id: \.mes) { m in
                    FilaLibro(etiqueta: LecturaFinanzas.etiquetaMes(m.mes).lowercased() + ".", valor: cifra(m.ahorro, oculto))
                }
            }
            CabeceraSeccion(titulo: "patrimonio.", raya: true)
            HStack(spacing: Espacio.xs) {
                ForEach(RangoGrafica.allCases) { r in
                    let on = rango == r
                    Button { rango = r } label: {
                        Text(r.etiqueta)
                            .font(Tipo.poppins(13, on ? .semibold : .regular, estilo: .caption))
                            .foregroundStyle(on ? Paleta.texto : Paleta.textoSecundario)
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(on ? Paleta.tinteTexto : Color.clear, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.bottom, Espacio.s)
            GraficaSaldo(puntos: serie, oculto: oculto)
                .frame(height: 140)
                .padding(.bottom, Espacio.s)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(oculto ? "gráfica de patrimonio oculta." : "gráfica de patrimonio, \(rango.etiqueta).")
            if !oculto, let ultimo = serie.last, let primero = serie.first {
                let delta = ultimo.valor - primero.valor
                Text("cambio del periodo: \(delta >= 0 ? "+" : "")\(Dinero.formato(delta)).")
                    .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            }
        }
    }

    // MARK: movimientos
    private func movimientos(_ v: VistaFinanzas, oculto: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            CabeceraSeccion(titulo: "movimientos.")
            HStack(spacing: Espacio.s) {
                AccionTexto(texto: "+ movimiento.") { c.modal = .movimiento(OperacionBitacora.nuevoIdMovimiento(), tipo: "expense") }
                Spacer()
                Button { mostrarImportador = true } label: {
                    Text("importar extracto.").font(Tipo.pie).foregroundStyle(Paleta.acento)
                }
                .buttonStyle(.plain)
                .accessibilityHint("elige un CSV o TSV del banco.")
            }
            Text("lee CSV y TSV en el iPhone, muestra una revisión y evita duplicar el mismo archivo.")
                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.bottom, Espacio.s)
            filtrosUI(v)
            let lista = LecturaFinanzas.filtrar(v.movimientos, con: filtros)
            if lista.isEmpty {
                Text("no hay movimientos con estos filtros.")
                    .font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.m)
            } else {
                ForEach(LecturaFinanzas.agruparPorDia(lista)) { g in
                    Text(etiquetaDia(g.fecha))
                        .font(Tipo.poppins(13, .semibold, estilo: .caption)).foregroundStyle(Paleta.textoSecundario)
                        .padding(.top, Espacio.s).padding(.bottom, 2)
                    ForEach(g.movimientos) { m in filaMovimiento(m, cuentas: v.cuentas, oculto: oculto) }
                }
            }
        }
    }

    private func filtrosUI(_ v: VistaFinanzas) -> some View {
        VStack(alignment: .leading, spacing: Espacio.xs) {
            TextField("buscar concepto o categoría.", text: $filtros.busqueda)
                .font(Tipo.cuerpo).textFieldStyle(.plain)
                .padding(.horizontal, 12).padding(.vertical, 10)
                .background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Espacio.xs) {
                    Menu {
                        Button("todos los meses.") { filtros.mes = "" }
                        ForEach(v.mesesDisponibles, id: \.self) { m in
                            Button(LecturaFinanzas.etiquetaMes(m) + ".") { filtros.mes = m }
                        }
                    } label: { chip(filtros.mes.isEmpty ? "mes" : LecturaFinanzas.etiquetaMes(filtros.mes), activo: !filtros.mes.isEmpty) }
                    Menu {
                        Button("todas las cuentas.") { filtros.cuenta = "" }
                        ForEach(v.cuentas) { cta in Button(cta.nombre.lowercased() + ".") { filtros.cuenta = cta.id } }
                    } label: { chip(filtros.cuenta.isEmpty ? "cuenta" : nombreCuenta(filtros.cuenta, v), activo: !filtros.cuenta.isEmpty) }
                    Menu {
                        Button("todas las categorías.") { filtros.categoria = "" }
                        ForEach(v.categorias) { cat in Button(cat.nombre.lowercased() + ".") { filtros.categoria = cat.id } }
                    } label: { chip(filtros.categoria.isEmpty ? "categoría" : nombreCat(filtros.categoria, v), activo: !filtros.categoria.isEmpty) }
                    Menu {
                        Button("todos los tipos.") { filtros.tipo = "" }
                        Button("gastos.") { filtros.tipo = "expense" }
                        Button("ingresos.") { filtros.tipo = "income" }
                        Button("traspasos.") { filtros.tipo = "transfer" }
                    } label: { chip(filtros.tipo.isEmpty ? "tipo" : etiquetaTipo(filtros.tipo), activo: !filtros.tipo.isEmpty) }
                    if filtros != FiltrosMovimientos() {
                        Button("limpiar.") { filtros = FiltrosMovimientos() }
                            .font(Tipo.pie).foregroundStyle(Paleta.acento).buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(.bottom, Espacio.s)
    }

    private func chip(_ texto: String, activo: Bool) -> some View {
        Text(texto.lowercased() + (texto.hasSuffix(".") ? "" : "."))
            .font(Tipo.poppins(13, activo ? .semibold : .regular, estilo: .caption))
            .foregroundStyle(activo ? Paleta.texto : Paleta.textoSecundario)
            .padding(.horizontal, 10).padding(.vertical, 7)
            .background(activo ? Paleta.tinteTexto : Color.clear, in: Capsule())
            .overlay(Capsule().stroke(Paleta.borde))
    }

    private func filaMovimiento(_ m: Movimiento, cuentas: [CuentaSaldo], oculto: Bool) -> some View {
        Button { c.modal = .editarMovimiento(m) } label: {
            HStack(alignment: .firstTextBaseline, spacing: Espacio.s) {
                Text(m.hora.isEmpty ? String(m.fecha.suffix(2)) : m.hora)
                    .font(Tipo.mono).foregroundStyle(Paleta.textoSecundario).frame(width: 42, alignment: .leading)
                VStack(alignment: .leading, spacing: 2) {
                    Text(m.concepto.isEmpty ? (m.categoria.isEmpty ? "sin concepto" : m.categoria) : m.concepto)
                        .font(Tipo.cuerpo).foregroundStyle(m.futuro ? Paleta.textoSecundario : Paleta.texto).lineLimit(1)
                    let sub = m.tipo == "transfer" ? "traspaso a \(m.destinoNombre.isEmpty ? m.destino : m.destinoNombre.lowercased())" : (m.concepto.isEmpty ? "" : m.categoria)
                    if !sub.isEmpty || m.neutro { Text(sub + (m.neutro ? (sub.isEmpty ? "neutro" : ". neutro") : "")).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).lineLimit(1) }
                }
                Spacer(minLength: Espacio.s)
                Text(oculto ? "•••" : (m.tipo == "income" ? "+" : m.tipo == "transfer" ? "" : "−") + Dinero.formato(m.importe))
                    .font(Tipo.poppins(15, .semibold, estilo: .body)).monospacedDigit()
                    .foregroundStyle(m.tipo == "income" ? Paleta.acento : Paleta.texto)
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
        .accessibilityElement(children: .combine)
        .accessibilityHint("editar movimiento.")
    }

    // MARK: presupuestos
    private func presupuestos(_ v: VistaFinanzas, oculto: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            CabeceraSeccion(titulo: "presupuestos.", detalle: LecturaFinanzas.etiquetaMes(v.presupuestosActual.mes))
            avisoSoloLectura("presupuestos de solo lectura. cámbialos en la web.")
            let p = v.presupuestosActual
            FilaLibro(etiqueta: "ingresos.", valor: cifra(p.income, oculto), acento: true)
            FilaLibro(etiqueta: "asignado.", valor: cifra(p.totalAssigned, oculto))
            FilaLibro(etiqueta: "sin asignar.", valor: cifra(p.remaining, oculto))
            if p.manualAssigned > 0 || p.commitmentsAssigned > 0 {
                CabeceraSeccion(titulo: "reparto.")
                if p.manualAssigned > 0 { FilaLibro(etiqueta: "presupuestos.", valor: cifra(p.manualAssigned, oculto)) }
                if p.commitmentsAssigned > 0 { FilaLibro(etiqueta: "compromisos.", valor: cifra(p.commitmentsAssigned, oculto)) }
            }
            if !p.commitments.isEmpty {
                CabeceraSeccion(titulo: "compromisos.")
                ForEach(p.commitments) { c in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(c.nombre.lowercased() + ".").font(Tipo.cuerpo).foregroundStyle(Paleta.texto)
                            Spacer()
                            Text(cifra(c.charged, oculto) + " / " + cifra(c.planned, oculto))
                                .font(Tipo.poppins(14, .semibold, estilo: .footnote)).monospacedDigit().foregroundStyle(Paleta.texto)
                        }
                        Text("\(c.confirmados) de \(c.n) confirmados.")
                            .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    }
                    .padding(.vertical, 8)
                    .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                    .accessibilityElement(children: .combine)
                }
            }
            CabeceraSeccion(titulo: "por categoría.")
            if p.categories.isEmpty {
                Text("sin categorías con presupuesto.")
                    .font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s)
            } else {
                ForEach(p.categories) { cat in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(cat.nombre.lowercased() + ".").font(Tipo.cuerpo).foregroundStyle(Paleta.texto)
                            Spacer()
                            Text(cifra(cat.spent, oculto) + " / " + cifra(cat.available, oculto))
                                .font(Tipo.poppins(14, .semibold, estilo: .footnote)).monospacedDigit().foregroundStyle(colorEstado(cat.estado))
                        }
                        BarraAvance(valor: min(cat.percentage / 100, 1.5), fondo: Paleta.borde, color: colorEstado(cat.estado), alto: 4)
                        HStack {
                            Text("queda \(cifra(cat.remaining, oculto)).")
                            Spacer()
                            if cat.lastMonth > 0 { Text("mes pasado \(cifra(cat.lastMonth, oculto)).") }
                        }
                        .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    }
                    .padding(.vertical, 8)
                    .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                    .accessibilityElement(children: .combine)
                    .accessibilityValue("\(Int(cat.percentage.rounded())) por ciento, \(cat.estado).")
                }
            }
            if v.presupuestosAnterior.categories.contains(where: { $0.spent > 0 || $0.planned > 0 }) || v.presupuestosAnterior.income > 0 {
                CabeceraSeccion(titulo: "mes anterior.", detalle: LecturaFinanzas.etiquetaMes(v.presupuestosAnterior.mes))
                FilaLibro(etiqueta: "asignado.", valor: cifra(v.presupuestosAnterior.totalAssigned, oculto))
                FilaLibro(etiqueta: "sin asignar.", valor: cifra(v.presupuestosAnterior.remaining, oculto))
            }
        }
    }

    // MARK: suscripciones
    private func suscripciones(_ v: VistaFinanzas, oculto: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            CabeceraSeccion(titulo: "suscripciones.")
            avisoSoloLectura("suscripciones de solo lectura. gestiónalas en la web.")
            if v.suscripciones.isEmpty {
                Text("no hay suscripciones.")
                    .font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s)
            } else {
                let activas = v.suscripciones.filter(\.activa)
                let total = activas.reduce(Decimal(0)) { $0 + $1.equivalenteMensual }
                FilaLibro(etiqueta: "activas.", valor: "\(activas.count)")
                FilaLibro(etiqueta: "equivalente mensual.", valor: cifra(total, oculto), acento: true)
                CabeceraSeccion(titulo: "lista.")
                ForEach(v.suscripciones) { s in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(s.titulo.isEmpty ? "suscripción" : s.titulo.lowercased() + (s.titulo.hasSuffix(".") ? "" : "."))
                                .font(Tipo.cuerpo).foregroundStyle(s.activa ? Paleta.texto : Paleta.textoSecundario)
                            Spacer()
                            Text(cifra(s.importe, oculto))
                                .font(Tipo.poppins(15, .semibold, estilo: .body)).monospacedDigit()
                                .foregroundStyle(s.activa ? Paleta.texto : Paleta.textoSecundario)
                        }
                        let detalle = [
                            s.activa ? "activa" : "inactiva",
                            s.frecuencia,
                            s.proximaFecha.map { "próximo \(etiquetaDia($0))" },
                            s.cobrosTrasBaja > 0 ? "\(s.cobrosTrasBaja) cobro(s) tras baja" : nil
                        ].compactMap { $0 }.joined(separator: ". ")
                        Text(detalle + ".").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    }
                    .padding(.vertical, 8)
                    .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    // MARK: patrimonio
    private func patrimonio(_ v: VistaFinanzas, oculto: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            CabeceraSeccion(titulo: "patrimonio.", detalle: "completo")
            avisoSoloLectura("patrimonio de solo lectura. base comparable en texto cuando no hay histórico suficiente.")
            let p = v.patrimonio
            FilaLibro(etiqueta: "total activos.", valor: cifra(p.totalActivos, oculto), acento: true)
            FilaLibro(etiqueta: "saldo líquido.", valor: cifra(v.saldoLiquido, oculto))
            if p.invertido > 0 { FilaLibro(etiqueta: "invertido.", valor: cifra(p.invertido, oculto)) }
            if p.emergencia > 0 { FilaLibro(etiqueta: "emergencia.", valor: cifra(p.emergencia, oculto)) }
            if p.vacaciones > 0 { FilaLibro(etiqueta: "vacaciones.", valor: cifra(p.vacaciones, oculto)) }
            if p.aMano > 0 { FilaLibro(etiqueta: "a mano.", valor: cifra(p.aMano, oculto)) }
            CabeceraSeccion(titulo: "activos.")
            ForEach(p.activos) { a in
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(a.nombre.hasSuffix(".") ? a.nombre : a.nombre + ".").font(Tipo.cuerpo).foregroundStyle(Paleta.texto)
                        Spacer()
                        Text(cifra(a.valor, oculto)).font(Tipo.poppins(15, .semibold, estilo: .body)).monospacedDigit().foregroundStyle(Paleta.texto)
                    }
                    let base = a.porcentajeTexto.isEmpty ? (a.nota.isEmpty ? "" : a.nota) : (a.nota.isEmpty ? a.porcentajeTexto : a.nota + " " + a.porcentajeTexto)
                    if !base.isEmpty {
                        Text(base.hasSuffix(".") ? base : base + ".")
                            .font(Tipo.pie).foregroundStyle(colorClase(a.clase, texto: a.porcentajeTexto))
                    }
                }
                .padding(.vertical, 8)
                .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func avisoSoloLectura(_ texto: String) -> some View {
        Text(texto)
            .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            .padding(.vertical, Espacio.xs)
            .accessibilityLabel(texto)
    }

    private func colorEstado(_ e: String) -> Color {
        switch e {
        case "superado": return Paleta.atencion
        case "aviso": return Paleta.acento
        default: return Paleta.progreso
        }
    }
    private func colorClase(_ clase: String, texto: String) -> Color {
        if texto.contains("sin base comparable") { return Paleta.textoSecundario }
        switch clase {
        case "sube": return Paleta.progreso
        case "baja": return Paleta.atencion
        default: return Paleta.textoSecundario
        }
    }

    private func cargarVista() async {
        let doc = await c.documentoVisible()
        let v = await Task.detached(priority: .userInitiated) { doc.map { LecturaFinanzas.vista($0) } }.value
        vista = v
        if filtros.mes.isEmpty, let mes = v?.mesActual { _ = mes /* keep all months by default */ }
    }
    private func cargarSerie() async {
        let doc = await c.documentoVisible()
        let r = rango
        // La sección se llama patrimonio: incluye inversión, emergencia y demás extras, no solo saldo líquido.
        serie = await Task.detached(priority: .userInitiated) { doc.map { LecturaFinanzas.serieDiaria(doc: $0, meses: r.meses, conExtras: true) } ?? [] }.value
    }

    private func estadoEnDirecto(_ v: VistaFinanzas, oculto: Bool) -> some View {
        let gastado = v.presupuestosActual.categories.reduce(Decimal(0)) { $0 + $1.spent }
        let activas = v.suscripciones.filter(\.activa)
        let mensual = activas.reduce(Decimal(0)) { $0 + $1.equivalenteMensual }
        return VStack(alignment: .leading, spacing: 5) {
            HStack { Text("presupuestos."); Spacer(); Text("\(cifra(gastado, oculto)) de \(cifra(v.presupuestosActual.totalAssigned, oculto))") }
            HStack { Text("suscripciones."); Spacer(); Text("\(activas.count) activas · \(cifra(mensual, oculto))/mes") }
            HStack { Text("patrimonio."); Spacer(); Text(cifra(v.patrimonioOperativo, oculto)) }
        }
        .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
        .padding(12).background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
        .padding(.top, Espacio.s)
        .accessibilityElement(children: .combine)
    }

    private func leerExtracto(_ resultado: Result<URL, Error>) async {
        do {
            let url = try resultado.get()
            let acceso = url.startAccessingSecurityScopedResource(); defer { if acceso { url.stopAccessingSecurityScopedResource() } }
            let datos = try Data(contentsOf: url)
            guard let texto = String(data: datos, encoding: .utf8) ?? String(data: datos, encoding: .isoLatin1) else {
                avisoImportacion = "no se pudo leer el texto del archivo."; return
            }
            extracto = try await Task.detached { try ImportadorFinanzas.analizar(texto, nombre: url.lastPathComponent) }.value
        } catch { avisoImportacion = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription }
    }

    private func importar(_ e: ExtractoAnalizado, cuenta: String) async {
        do {
            try await c.encolar(ImportadorFinanzas.operaciones(e, cuenta: cuenta))
            extracto = nil
            avisoImportacion = "\(e.filas.count) movimientos preparados. \(e.omitidas) filas omitidas."
        } catch { avisoImportacion = "no se pudo guardar el extracto en este iPhone." }
    }

    private func cifra(_ d: Decimal, _ oculto: Bool) -> String { oculto ? "•••••" : Dinero.formato(d) }
    private func nombreCuenta(_ id: String, _ v: VistaFinanzas) -> String { (v.cuentas.first { $0.id == id }?.nombre ?? id).lowercased() }
    private func nombreCat(_ id: String, _ v: VistaFinanzas) -> String { (v.categorias.first { $0.id == id }?.nombre ?? id).lowercased() }
    private func etiquetaTipo(_ t: String) -> String {
        switch t { case "income": return "ingresos"; case "expense": return "gastos"; case "transfer": return "traspasos"; default: return t }
    }
    private func etiquetaDia(_ iso: String) -> String {
        if iso == "sin fecha" { return "sin fecha." }
        guard let d = LocalDay(iso: iso) else { return iso + "." }
        let hoy = CalendarioBitacora.madrid.dia(de: Date())
        if d == hoy { return "hoy." }
        if d == hoy.sumando(dias: -1) { return "ayer." }
        let meses = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
        let m = d.month >= 1 && d.month <= 12 ? meses[d.month] : ""
        return "\(d.day) \(m)."
    }
}

// Gráfica editorial compacta: área y línea, sin dependencias externas.
private struct GraficaSaldo: View {
    let puntos: [PuntoDia]
    let oculto: Bool

    var body: some View {
        GeometryReader { g in
            if oculto || puntos.count < 2 {
                RoundedRectangle(cornerRadius: Radio.control, style: .continuous).fill(Paleta.tinteTexto)
                    .overlay(Text(oculto ? "cifras ocultas." : "sin datos suficientes.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario))
            } else {
                let vals = puntos.map { NSDecimalNumber(decimal: $0.valor).doubleValue }
                let minV = vals.min() ?? 0, maxV = vals.max() ?? 1
                let margen = max((maxV - minV) * 0.12, max(abs(maxV), 1) * 0.01)
                let bajo = minV - margen, alto = maxV + margen
                let rango = max(alto - bajo, 1)
                let insetX: CGFloat = 8, insetY: CGFloat = 18
                let w = max(g.size.width - insetX * 2, 1), h = max(g.size.height - insetY * 2, 1)
                let step = w / CGFloat(max(puntos.count - 1, 1))
                let pt: (Int) -> CGPoint = { i in
                    CGPoint(x: insetX + CGFloat(i) * step, y: insetY + h - CGFloat((vals[i] - bajo) / rango) * h)
                }
                let linea = Path { p in
                    p.move(to: pt(0))
                    for i in 1..<puntos.count { p.addLine(to: pt(i)) }
                }
                let area = Path { p in
                    p.move(to: CGPoint(x: insetX, y: insetY + h)); p.addLine(to: pt(0))
                    for i in 1..<puntos.count { p.addLine(to: pt(i)) }
                    p.addLine(to: CGPoint(x: insetX + CGFloat(puntos.count - 1) * step, y: insetY + h)); p.closeSubpath()
                }
                ZStack(alignment: .bottomLeading) {
                    VStack(spacing: 0) {
                        Rectangle().fill(Paleta.borde).frame(height: 1); Spacer()
                        Rectangle().fill(Paleta.borde.opacity(0.65)).frame(height: 1); Spacer()
                        Rectangle().fill(Paleta.borde).frame(height: 1)
                    }.padding(.vertical, insetY)
                    area.fill(Paleta.tinteAcento)
                    linea.stroke(Paleta.acento, style: StrokeStyle(lineWidth: 2, lineJoin: .round))
                    if !puntos.isEmpty {
                        let p = pt(puntos.count - 1)
                        Circle().fill(Paleta.acento).frame(width: 6, height: 6).position(p)
                    }
                    Text(Dinero.formato(puntos.last?.valor ?? 0))
                        .font(Tipo.poppins(11, .medium, estilo: .caption2)).foregroundStyle(Paleta.textoSecundario)
                        .padding(4)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                }
                .clipShape(RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
                .background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
            }
        }
    }
}

private struct RevisionExtractoView: View {
    @Environment(\.dismiss) private var cerrar
    let extracto: ExtractoAnalizado
    let cuentas: [CuentaSaldo]
    let importar: (String) -> Void
    @State private var cuenta = "bancos"

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("cuenta.", selection: $cuenta) {
                        ForEach(cuentas) { c in Text(c.nombre.lowercased() + ".").tag(c.id) }
                    }
                    LabeledContent("movimientos.", value: "\(extracto.filas.count)")
                    if extracto.omitidas > 0 { LabeledContent("omitidos.", value: "\(extracto.omitidas)") }
                } footer: {
                    Text("volver a importar el mismo archivo en la misma cuenta no crea duplicados.")
                }
                Section("revisión.") {
                    ForEach(extracto.filas.prefix(100)) { f in
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(f.concepto.isEmpty ? "sin concepto" : f.concepto).lineLimit(1)
                                Text(f.fecha).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                            }
                            Spacer()
                            Text((f.tipo == "income" ? "+" : "−") + Dinero.formato(f.importe)).monospacedDigit()
                        }
                    }
                    if extracto.filas.count > 100 { Text("y \(extracto.filas.count - 100) más.").foregroundStyle(Paleta.textoSecundario) }
                }
            }
            .navigationTitle("importar extracto.")
            .onAppear { if !cuentas.contains(where: { $0.id == cuenta }) { cuenta = cuentas.first?.id ?? "bancos" } }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("importar.") { importar(cuenta); cerrar() }.disabled(cuenta.isEmpty || extracto.filas.isEmpty)
                }
            }
        }
    }
}

// Editor conservado: crear, editar, borrar y traspasar (compatible con los modales del coordinador).
struct EditorMovimientoView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let id: String
    let tipoInicial: String
    var existente: Movimiento?

    @State private var tipo = "expense"
    @State private var destino = "efectivo"
    @State private var confirmarBorrado = false
    @State private var importe = ""
    @State private var concepto = ""
    @State private var cuenta = "bancos"
    @State private var categoria: String?
    @State private var fecha = Date()
    @State private var vista: VistaFinanzas?
    @State private var guardando = false
    @State private var error: String?
    @FocusState private var enfocado: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("tipo.", selection: $tipo) {
                        Text("gasto.").tag("expense")
                        Text("ingreso.").tag("income")
                        Text("traspaso.").tag("transfer")
                    }
                    .pickerStyle(.segmented)
                    .disabled(existente != nil)
                    TextField("importe.", text: $importe).keyboardType(.decimalPad).focused($enfocado)
                    TextField("concepto.", text: $concepto)
                }
                .listRowBackground(Paleta.superficie)
                Section {
                    Picker(tipo == "transfer" ? "desde." : "cuenta.", selection: $cuenta) {
                        ForEach(vista?.cuentas ?? []) { Text($0.nombre.lowercased() + ".").tag($0.id) }
                    }
                    if tipo == "transfer" {
                        Picker("hacia.", selection: $destino) {
                            ForEach(vista?.cuentas ?? []) { Text($0.nombre.lowercased() + ".").tag($0.id) }
                        }
                    } else {
                        Picker("categoría.", selection: $categoria) {
                            Text("sin categoría.").tag(String?.none)
                            ForEach((vista?.categorias ?? []).filter { $0.tipo == nil || $0.tipo == tipo }) { Text($0.nombre.lowercased()).tag(Optional($0.id)) }
                        }
                    }
                    DatePicker("día.", selection: $fecha, displayedComponents: .date).environment(\.locale, Locale(identifier: "es_ES"))
                } footer: {
                    if let error { Text(error).foregroundStyle(Paleta.error) }
                }
                .listRowBackground(Paleta.superficie)
                if existente != nil {
                    Section {
                        Button("borrar movimiento.", role: .destructive) { confirmarBorrado = true }
                    }
                    .listRowBackground(Paleta.superficie)
                }
            }
            .confirmationDialog("¿borrar este movimiento?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("borrar.", role: .destructive) { Task { await borrar() } }
                Button("cancelar.", role: .cancel) {}
            }
            .font(Tipo.cuerpo)
            .scrollContentBackground(.hidden)
            .background(Paleta.fondo)
            .navigationTitle(existente == nil ? "nuevo movimiento." : "movimiento.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") { Task { await guardar() } }.disabled(guardando || valor == nil)
                }
            }
            .onAppear {
                if let m = existente {
                    tipo = m.tipo
                    importe = NSDecimalNumber(decimal: m.importe).stringValue.replacingOccurrences(of: ".", with: ",")
                    concepto = m.concepto
                    cuenta = m.cuenta
                    destino = m.destino.isEmpty ? destino : m.destino
                    categoria = m.categoriaId.isEmpty ? nil : m.categoriaId
                    if let d = LocalDay(iso: m.fecha) {
                        var cal = Calendar(identifier: .gregorian)
                        cal.timeZone = CalendarioBitacora.madrid.zona
                        fecha = cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12)) ?? fecha
                    }
                } else {
                    tipo = tipoInicial == "income" ? "income" : "expense"
                    enfocado = true
                }
            }
            .task {
                let doc = await c.documentoVisible()
                vista = await Task.detached { doc.map { LecturaFinanzas.vista($0) } }.value
            }
        }
        .presentationDetents([.large])
    }

    private func borrar() async {
        do { try await c.encolar(.borrarMovimiento(id: id)); cerrar() } catch { self.error = "no se pudo borrar en este iPhone." }
    }

    private var valor: Decimal? { Dinero.decimal(texto: importe).flatMap { $0 > 0 ? $0 : nil } }

    private func guardar() async {
        guard !guardando, let v = valor else { return }
        guardando = true
        defer { guardando = false }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let d = cal.dateComponents([.year, .month, .day], from: fecha)
        let ahora = cal.dateComponents([.hour, .minute], from: Date())
        let dia = LocalDay(year: d.year!, month: d.month!, day: d.day!)!
        let texto = String(concepto.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))
        let cifra = NSDecimalNumber(decimal: v).stringValue
        let horaTexto = String(format: "%02d:%02d", ahora.hour ?? 0, ahora.minute ?? 0)
        do {
            if existente != nil {
                if tipo == "transfer", destino == cuenta { error = "elige dos cuentas distintas."; return }
                try await c.encolar(.editarMovimiento(id: id, importe: cifra, concepto: texto, categoria: categoria, fecha: dia.iso, cuenta: cuenta,
                                                      destino: tipo == "transfer" ? destino : nil))
                cerrar()
                return
            }
            if tipo == "transfer" {
                guard destino != cuenta else { error = "elige dos cuentas distintas."; return }
                try await c.encolar(.crearTraspaso(id: id, importe: cifra, desde: cuenta, hacia: destino, fecha: dia.iso, hora: horaTexto, concepto: texto))
                cerrar()
                return
            }
            try await c.encolar(.crearMovimiento(id: id, tipo: tipo, importe: NSDecimalNumber(decimal: v).stringValue, cuenta: cuenta,
                                                 categoria: categoria, fecha: dia.iso, hora: horaTexto,
                                                 concepto: texto))
            cerrar()
        } catch {
            self.error = "no se pudo guardar en este iPhone."
        }
    }
}
