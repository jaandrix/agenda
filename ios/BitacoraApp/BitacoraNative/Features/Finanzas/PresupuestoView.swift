import SwiftUI

// Editar los presupuestos del mes en el iPhone, como «planificación.» de la web (js/presupuesto.js): un borrador que no
// cambia nada hasta «guardar planificación.» (saveFinanceBudgetDraft, una sola escritura de budgetPlans[mes]), las
// cifras de arriba con financeBudgetUnifiedModel y, en cada casilla, cómo va su categoría. El motor rehace el plan sobre
// el de la web y conserva lo que la app no conoce de cada casilla.

struct BorradorPresupuesto: Codable, Equatable {
    struct Casilla: Codable, Equatable, Identifiable {
        var id: String
        var label: String
        var amount: Double
        var categoryId: String
        var auto: String?
        var limiteManual: Bool?
    }
    var salary: Double
    var contributions: Double
    var heredado: Bool
    var autoQuitadas: [String: Bool]
    var allocations: [Casilla]
}

struct VistaPresupuesto: Decodable, Equatable {
    struct Cat: Decodable, Equatable { let nombre, estado, status: String; let gastado, devuelto, disponible, mesPasado: Double }
    struct Comp: Decodable, Equatable { let nombre: String; let n: Int; let alMes, cargado: Double }
    struct Opcion: Decodable, Equatable, Identifiable { let id, nombre, icono, color: String }
    let mes, titulo: String
    let cerrado: Bool
    let ingresos, aportacionesReales, presupuestos, compromisos, sinAsignar: Double
    let categorias: [String: Cat]
    let comprometido: [String: Comp]
    let opciones: [Opcion]
}

private struct DatosPresupuesto: Decodable {
    let borrador: BorradorPresupuesto
    let vista: VistaPresupuesto
    let mesAnterior, mesSiguiente: String
}

struct EditorPresupuestoView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar

    @State private var mes = ""
    @State private var anterior = ""
    @State private var siguiente = ""
    @State private var b: BorradorPresupuesto?
    @State private var original: BorradorPresupuesto?
    @State private var v: VistaPresupuesto?
    @State private var error: String?
    @State private var guardando = false
    @State private var descartar = false

    private var cambiado: Bool { b != nil && b != original }

    var body: some View {
        NavigationStack {
            Group {
                if let v, b != nil { formulario(v) } else { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            }
            .background(Paleta.fondo)
            .navigationTitle("presupuestos.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { if cambiado { descartar = true } else { cerrar() } } }
            }
            .confirmationDialog("¿Descartar los cambios?", isPresented: $descartar, titleVisibility: .visible) {
                Button("descartar.", role: .destructive) { cerrar() }
                Button("seguir editando.", role: .cancel) {}
            }
            .safeAreaInset(edge: .bottom) {
                if let v, !v.cerrado {
                    BotonFin(texto: guardando ? "guardando." : "guardar planificación.", acento: cambiado) { Task { await guardar() } }
                        .disabled(!cambiado || guardando)
                        .padding(.horizontal, 20).padding(.top, 10).padding(.bottom, 8)
                        .background(Paleta.fondo.ignoresSafeArea(edges: .bottom))
                        .overlay(alignment: .top) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                }
            }
            .task { if b == nil { await abrir("") } }
            .onChange(of: b) { _, nuevo in
                guard let nuevo else { return }
                Task { await recalcular(nuevo) }
            }
        }
        .interactiveDismissDisabled(cambiado)
    }

    private func formulario(_ v: VistaPresupuesto) -> some View {
        Form {
            Section {
                HStack {
                    Button { Task { await cambiarMes(anterior) } } label: { Image(systemName: "chevron.left").frame(width: 44, height: 36) }
                        .buttonStyle(.plain).accessibilityLabel("mes anterior")
                    Spacer()
                    Text(v.titulo.lowercased() + ".").font(Tipo.cuerpoFuerte)
                    Spacer()
                    Button { Task { await cambiarMes(siguiente) } } label: { Image(systemName: "chevron.right").frame(width: 44, height: 36) }
                        .buttonStyle(.plain).accessibilityLabel("mes siguiente")
                }
                .foregroundStyle(Paleta.texto)
                if v.cerrado {
                    Text("Este mes ya está cerrado en el historial. Se reabre desde el ordenador, en Finanzas, planificación.")
                        .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                }
            }
            Section {
                FilaLibro(etiqueta: "ingresos", valor: FormatoFin.dinero(v.ingresos))
                FilaLibro(etiqueta: "presupuestos", valor: FormatoFin.dinero(v.presupuestos))
                FilaLibro(etiqueta: "compromisos", valor: FormatoFin.dinero(v.compromisos))
                FilaLibro(etiqueta: "sin asignar", valor: FormatoFin.dinero(v.sinAsignar), acento: v.sinAsignar < 0)
                reparto(v)
            }
            if !v.cerrado {
                Section("ingresos.") {
                    campo("sueldo.", Binding(get: { b!.salary }, set: { b!.salary = $0 }))
                    campo("aportaciones.", Binding(get: { b!.contributions }, set: { b!.contributions = $0 }))
                    if v.aportacionesReales > (b?.contributions ?? 0) {
                        Text("Este mes ya han entrado \(FormatoFin.dinero(v.aportacionesReales)) en aportaciones: cuenta eso.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    }
                }
                Section {
                    ForEach(b!.allocations.filter { $0.auto == nil }) { a in casilla(a, v) }
                    Button("+ casilla.") {
                        b!.allocations.append(.init(id: "ba_\(Int64(Date().timeIntervalSince1970 * 1000))_" + String(UUID().uuidString.prefix(4)).lowercased(), label: "", amount: 0, categoryId: ""))
                    }
                } header: { Text("presupuestos.") }
                let autos = b!.allocations.filter { $0.auto != nil }
                if !autos.isEmpty {
                    Section("compromisos.") {
                        ForEach(autos) { a in compromiso(a, v) }
                    }
                }
                Section {
                    Button("copiar el mes anterior.") { Task { await heredar() } }
                }
            }
            if let error { Section { Text(error).foregroundStyle(Paleta.error) } }
        }
        .font(Tipo.cuerpo)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
    }

    private func reparto(_ v: VistaPresupuesto) -> some View {
        GeometryReader { g in
            let pct = { (x: Double) -> CGFloat in v.ingresos > 0 ? CGFloat(max(0, min(1, x / v.ingresos))) : 0 }
            HStack(spacing: 0) {
                Rectangle().fill(Paleta.acento).frame(width: g.size.width * pct(v.presupuestos))
                Rectangle().fill(Paleta.textoSecundario.opacity(0.6)).frame(width: g.size.width * pct(v.compromisos))
                Spacer(minLength: 0)
            }
            .background(Paleta.borde)
            .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }

    private func campo(_ titulo: String, _ valor: Binding<Double>) -> some View {
        HStack {
            Text(titulo)
            Spacer()
            TextField("0,00", value: valor, format: .number.precision(.fractionLength(0...2)))
                .keyboardType(.decimalPad).multilineTextAlignment(.trailing).monospacedDigit()
                .environment(\.locale, Locale(identifier: "es_ES"))
                .frame(maxWidth: 140)
        }
    }

    // Por id y no por posición: al quitar una casilla, una posición guardada apuntaría a otra (o fuera de la lista).
    private func ref<T>(_ id: String, _ kp: WritableKeyPath<BorradorPresupuesto.Casilla, T>, _ otro: T, alCambiar: ((inout BorradorPresupuesto.Casilla) -> Void)? = nil) -> Binding<T> {
        Binding(get: { b?.allocations.first { $0.id == id }?[keyPath: kp] ?? otro },
                set: { nuevo in
                    guard let i = b?.allocations.firstIndex(where: { $0.id == id }) else { return }
                    b!.allocations[i][keyPath: kp] = nuevo
                    alCambiar?(&b!.allocations[i])
                })
    }

    @ViewBuilder private func casilla(_ a: BorradorPresupuesto.Casilla, _ v: VistaPresupuesto) -> some View {
        Group {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    TextField("casilla. alquiler, ahorro, ocio...", text: ref(a.id, \.label, ""))
                    Button { b!.allocations.removeAll { $0.id == a.id } } label: { Image(systemName: "xmark").foregroundStyle(Paleta.textoSecundario) }
                        .buttonStyle(.plain).accessibilityLabel("quitar \(a.label.isEmpty ? "casilla" : a.label)")
                }
                campo("importe.", ref(a.id, \.amount, 0, alCambiar: { $0.amount = max(0, $0.amount) }))
                Menu {
                    Button("otros destinos.") { ref(a.id, \.categoryId, "").wrappedValue = "" }
                    ForEach(v.opciones) { o in Button(o.nombre) { ref(a.id, \.categoryId, "").wrappedValue = o.id } }
                } label: {
                    HStack(spacing: 8) {
                        if let o = v.opciones.first(where: { $0.id == a.categoryId }) {
                            IconoCategoria(icono: o.icono, color: o.color, tam: 24)
                            Text(o.nombre.lowercased()).foregroundStyle(Paleta.texto)
                        } else {
                            Text("otros destinos.").foregroundStyle(Paleta.textoSecundario)
                        }
                        Spacer()
                        Image(systemName: "chevron.up.chevron.down").font(.system(size: 12)).foregroundStyle(Paleta.textoSecundario)
                    }
                }
                Text(comoVa(a, v)).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            }
            .padding(.vertical, 4)
        }
    }

    // comoVa de renderFinanceBudgetEditor.
    private func comoVa(_ a: BorradorPresupuesto.Casilla, _ v: VistaPresupuesto) -> String {
        guard let c = v.categorias[a.categoryId] else { return "sin categoría: cuenta como repartido." }
        return "\(c.nombre): \(FormatoFin.dinero(c.gastado)) gastados" + (c.devuelto > 0 ? ", +\(FormatoFin.dinero(c.devuelto)) devueltos" : "")
            + ", \(c.estado); el mes pasado gastaste \(FormatoFin.dinero(c.mesPasado))."
    }

    @ViewBuilder private func compromiso(_ a: BorradorPresupuesto.Casilla, _ v: VistaPresupuesto) -> some View {
        Group {
            let info = v.comprometido[a.id]
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text((info?.nombre ?? a.label) + ".").font(Tipo.cuerpoFuerte)
                    Spacer()
                    Button { b!.allocations.removeAll { $0.id == a.id } } label: { Image(systemName: "xmark").foregroundStyle(Paleta.textoSecundario) }
                        .buttonStyle(.plain).accessibilityLabel("quitar \(info?.nombre ?? a.label) de este mes")
                }
                if let info {
                    Text("\(info.n) activos, \(FormatoFin.dinero(info.alMes)) al mes, \(FormatoFin.dinero(info.cargado)) cargados.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                }
                campo("límite.", ref(a.id, \.amount, 0, alCambiar: { $0.amount = max(0, $0.amount); $0.limiteManual = true }))
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: motor

    private func abrir(_ m: String) async {
        do {
            let motor = try await motorListo(c)
            let d = try await motor.llamar("presupuestoDatos", [m], como: DatosPresupuesto.self)
            mes = d.vista.mes; anterior = d.mesAnterior; siguiente = d.mesSiguiente
            original = d.borrador; b = d.borrador; v = d.vista
            error = nil
        } catch { self.error = mensajeMotor(error, "no se pudo abrir la planificación.") }
    }

    private func cambiarMes(_ m: String) async {
        if cambiado { error = "guarda o cancela los cambios de este mes antes de cambiar."; return }
        await abrir(m)
    }

    private func recalcular(_ nuevo: BorradorPresupuesto) async {
        guard nuevo != original || v == nil, let json = try? String(data: JSONEncoder().encode(nuevo), encoding: .utf8) else { return }
        try? await Task.sleep(nanoseconds: 150_000_000)
        guard b == nuevo else { return }
        if let r = try? await MotorFinanzas.compartido.llamar("presupuestoModelo", [mes, json], como: VistaPresupuesto.self), b == nuevo { v = r }
    }

    private func heredar() async {
        do {
            let r = try await MotorFinanzas.compartido.llamar("presupuestoHeredar", [mes], como: BorradorPresupuesto.self)
            b = r
            error = nil
        } catch { self.error = mensajeMotor(error, "no se pudo copiar el mes anterior.") }
    }

    private func guardar() async {
        guard let b, !guardando else { return }
        guardando = true; defer { guardando = false }
        do {
            let json = String(data: try JSONEncoder().encode(b), encoding: .utf8) ?? "{}"
            let r = try await MotorFinanzas.compartido.crudo("guardarPresupuesto", [mes, json])
            if await encolarCambiosFinanzas(r, c) { cerrar() } else { error = "no se pudo guardar en este iPhone. Sigue aquí para reintentar." }
        } catch { self.error = mensajeMotor(error, "no se pudo guardar la planificación.") }
    }
}
