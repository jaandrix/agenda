import SwiftUI

struct FinanzasView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaFinanzas?
    @State private var ver = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                CabeceraApartado(titulo: "finanzas", contexto: nil) {
                    if vista?.ocultar == true {
                        Button { ver.toggle() } label: {
                            Image(systemName: ver ? "eye.slash" : "eye").font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(Paleta.textoSecundario).frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(ver ? "ocultar cifras" : "ver cifras")
                    }
                }
                if let v = vista {
                    let oculto = v.ocultar && !ver
                    VStack(alignment: .leading, spacing: 2) {
                        Text("saldo líquido.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        Text(cifra(v.saldoLiquido, oculto)).font(Tipo.poppins(40, .bold, estilo: .largeTitle)).monospacedDigit()
                            .foregroundStyle(Paleta.texto).lineLimit(1).minimumScaleFactor(0.6)
                    }
                    .padding(.top, Espacio.l)
                    .accessibilityElement(children: .combine)
                    FilaLibro(etiqueta: "patrimonio.", valor: cifra(v.patrimonioOperativo, oculto))
                    FilaLibro(etiqueta: "activos totales.", valor: cifra(v.activosTotales, oculto))
                    CabeceraSeccion(titulo: "este mes.", raya: true)
                    FilaLibro(etiqueta: "entra.", valor: cifra(v.ingresosMes, oculto), acento: true)
                    FilaLibro(etiqueta: "sale.", valor: cifra(v.gastosMes, oculto))
                    CabeceraSeccion(titulo: "cuentas.")
                    ForEach(v.cuentas) { FilaLibro(etiqueta: $0.nombre.lowercased() + ".", valor: cifra($0.saldo, oculto)) }
                    CabeceraSeccion(titulo: "movimientos.", detalle: "importar y presupuestos, en la web")
                    AccionTexto(texto: "+ movimiento.") { c.modal = .movimiento(OperacionBitacora.nuevoIdMovimiento(), tipo: "expense") }
                    ForEach(v.movimientos) { m in
                        HStack(alignment: .firstTextBaseline, spacing: Espacio.s) {
                            Text(String(m.fecha.suffix(5))).font(Tipo.mono).foregroundStyle(Paleta.textoSecundario).frame(width: 46, alignment: .leading)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(m.concepto.isEmpty ? (m.categoria.isEmpty ? "sin concepto" : m.categoria) : m.concepto)
                                    .font(Tipo.cuerpo).foregroundStyle(m.futuro ? Paleta.textoSecundario : Paleta.texto).lineLimit(1)
                                if !m.categoria.isEmpty && !m.concepto.isEmpty { Text(m.categoria).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
                            }
                            Spacer(minLength: Espacio.s)
                            Text(oculto ? "•••" : (m.tipo == "income" ? "+" : m.tipo == "transfer" ? "" : "-") + Dinero.formato(m.importe))
                                .font(Tipo.poppins(15, .semibold, estilo: .body)).monospacedDigit()
                                .foregroundStyle(m.tipo == "income" ? Paleta.acento : Paleta.texto)
                        }
                        .padding(.vertical, 10)
                        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                        .accessibilityElement(children: .combine)
                    }
                } else {
                    ProgressView().tint(Paleta.textoSecundario).frame(maxWidth: .infinity).padding(.top, Espacio.xl)
                }
            }
            .padding(.horizontal, Espacio.l - 4)
            .padding(.bottom, Espacio.xl)
        }
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar() }
        .task(id: c.informe.revision) {
            let doc = await c.documentoVisible()
            vista = await Task.detached(priority: .userInitiated) { doc.map { LecturaFinanzas.vista($0) } }.value
        }
    }

    private func cifra(_ d: Decimal, _ oculto: Bool) -> String { oculto ? "•••••" : Dinero.formato(d) }
}

struct EditorMovimientoView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let id: String
    let tipoInicial: String

    @State private var tipo = "expense"
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
                    }
                    .pickerStyle(.segmented)
                    TextField("importe.", text: $importe).keyboardType(.decimalPad).focused($enfocado)
                    TextField("concepto.", text: $concepto)
                }
                .listRowBackground(Paleta.superficie)
                Section {
                    Picker("cuenta.", selection: $cuenta) {
                        ForEach(vista?.cuentas ?? []) { Text($0.nombre.lowercased() + ".").tag($0.id) }
                    }
                    Picker("categoría.", selection: $categoria) {
                        Text("sin categoría.").tag(String?.none)
                        ForEach((vista?.categorias ?? []).filter { $0.tipo == nil || $0.tipo == tipo }) { Text($0.nombre.lowercased()).tag(Optional($0.id)) }
                    }
                    DatePicker("día.", selection: $fecha, in: ...Date(), displayedComponents: .date).environment(\.locale, Locale(identifier: "es_ES"))
                } footer: {
                    if let error { Text(error).foregroundStyle(Paleta.error) }
                }
                .listRowBackground(Paleta.superficie)
            }
            .font(Tipo.cuerpo)
            .scrollContentBackground(.hidden)
            .background(Paleta.fondo)
            .navigationTitle("nuevo movimiento.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") { Task { await guardar() } }.disabled(guardando || valor == nil)
                }
            }
            .onAppear { tipo = tipoInicial == "income" ? "income" : "expense"; enfocado = true }
            .task {
                let doc = await c.documentoVisible()
                vista = await Task.detached { doc.map { LecturaFinanzas.vista($0) } }.value
            }
        }
        .presentationDetents([.large])
    }

    private var valor: Decimal? { Dinero.decimal(texto: importe).flatMap { $0 > 0 ? $0 : nil } }

    // El id viene decidido al abrir la hoja: dos toques en «guardar.» apuntan un solo movimiento.
    private func guardar() async {
        guard !guardando, let v = valor else { return }
        guardando = true
        defer { guardando = false }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let d = cal.dateComponents([.year, .month, .day], from: fecha)
        let ahora = cal.dateComponents([.hour, .minute], from: Date())
        let dia = LocalDay(year: d.year!, month: d.month!, day: d.day!)!
        do {
            try await c.encolar(.crearMovimiento(id: id, tipo: tipo, importe: NSDecimalNumber(decimal: v).stringValue, cuenta: cuenta,
                                                 categoria: categoria, fecha: dia.iso, hora: String(format: "%02d:%02d", ahora.hour ?? 0, ahora.minute ?? 0),
                                                 concepto: String(concepto.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))))
            cerrar()
        } catch {
            self.error = "no se pudo guardar en este iPhone."
        }
    }
}
