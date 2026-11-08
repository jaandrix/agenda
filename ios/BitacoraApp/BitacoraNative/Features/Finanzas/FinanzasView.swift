import SwiftUI

struct FinanzasView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaFinanzas?
    @State private var ver = false

    var body: some View {
        List {
            if let v = vista {
                let oculto = v.ocultar && !ver
                Section {
                    cifra("saldo líquido.", v.saldoLiquido, oculto, grande: true)
                    cifra("patrimonio.", v.patrimonioOperativo, oculto)
                    cifra("activos totales.", v.activosTotales, oculto)
                } footer: {
                    if v.ocultar { Button(ver ? "ocultar cifras." : "ver cifras.") { ver.toggle() }.font(Tipo.pie) }
                }
                Section("este mes.") {
                    cifra("entra.", v.ingresosMes, oculto)
                    cifra("sale.", v.gastosMes, oculto)
                }
                Section("cuentas.") {
                    ForEach(v.cuentas) { cifra($0.nombre.lowercased() + ".", $0.saldo, oculto) }
                }
                Section {
                    Button {
                        c.modal = .movimiento(OperacionBitacora.nuevoIdMovimiento())
                    } label: {
                        Text("+ movimiento.").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.acento).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .listRowBackground(Paleta.superficie)
                    ForEach(v.movimientos) { m in
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(m.concepto.isEmpty ? (m.categoria.isEmpty ? "sin concepto" : m.categoria) : m.concepto)
                                    .font(Tipo.cuerpo).foregroundStyle(m.futuro ? Paleta.textoSecundario : Paleta.texto).lineLimit(1)
                                Text([m.fecha, m.categoria].filter { !$0.isEmpty }.joined(separator: ", ")).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                            }
                            Spacer()
                            Text(oculto ? "•••" : (m.tipo == "income" ? "+" : m.tipo == "transfer" ? "" : "-") + Dinero.formato(m.importe))
                                .font(Tipo.mono)
                                .foregroundStyle(m.tipo == "income" ? Paleta.acento : Paleta.texto)
                        }
                        .listRowBackground(Paleta.superficie)
                        .accessibilityElement(children: .combine)
                    }
                } header: { Text("movimientos.") } footer: {
                    Text("importar extractos, presupuestos y lo demás, en la web.")
                }
            } else {
                Section { ProgressView().frame(maxWidth: .infinity) }.listRowBackground(Color.clear)
            }
        }
        .font(Tipo.cuerpo)
        .scrollContentBackground(.hidden)
        .background(Paleta.fondo)
        .navigationTitle("finanzas.")
        .refreshable { await c.sincronizar() }
        .task(id: c.informe.revision) {
            let doc = await c.documentoVisible()
            vista = await Task.detached(priority: .userInitiated) { doc.map { LecturaFinanzas.vista($0) } }.value
        }
    }

    private func cifra(_ etiqueta: String, _ d: Decimal, _ oculto: Bool, grande: Bool = false) -> some View {
        LabeledContent {
            Text(oculto ? "•••" : Dinero.formato(d)).font(grande ? Tipo.subtitulo : Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto)
        } label: {
            Text(etiqueta).foregroundStyle(Paleta.textoSecundario)
        }
        .listRowBackground(Paleta.superficie)
    }
}

struct EditorMovimientoView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let id: String

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
            .onAppear { enfocado = true }
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
