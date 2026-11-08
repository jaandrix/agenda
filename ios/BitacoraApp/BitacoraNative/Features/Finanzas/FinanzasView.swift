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
                    CabeceraSeccion(titulo: "movimientos.", detalle: "importar, en la web")
                    AccionTexto(texto: "+ movimiento.") { c.modal = .movimiento(OperacionBitacora.nuevoIdMovimiento(), tipo: "expense") }
                    ForEach(v.movimientos) { m in
                        Button { c.modal = .editarMovimiento(m) } label: {
                        HStack(alignment: .firstTextBaseline, spacing: Espacio.s) {
                            Text(String(m.fecha.suffix(5))).font(Tipo.mono).foregroundStyle(Paleta.textoSecundario).frame(width: 46, alignment: .leading)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(m.concepto.isEmpty ? (m.categoria.isEmpty ? "sin concepto" : m.categoria) : m.concepto)
                                    .font(Tipo.cuerpo).foregroundStyle(m.futuro ? Paleta.textoSecundario : Paleta.texto).lineLimit(1)
                                let sub = m.tipo == "transfer" ? "traspaso a \(nombreCuenta(m.destino, v))" : (m.concepto.isEmpty ? "" : m.categoria)
                                if !sub.isEmpty { Text(sub).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
                            }
                            Spacer(minLength: Espacio.s)
                            Text(oculto ? "•••" : (m.tipo == "income" ? "+" : m.tipo == "transfer" ? "" : "-") + Dinero.formato(m.importe))
                                .font(Tipo.poppins(15, .semibold, estilo: .body)).monospacedDigit()
                                .foregroundStyle(m.tipo == "income" ? Paleta.acento : Paleta.texto)
                        }
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
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
    private func nombreCuenta(_ id: String, _ v: VistaFinanzas) -> String { (v.cuentas.first { $0.id == id }?.nombre ?? id).lowercased() }
}

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
        let texto = String(concepto.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))
        let cifra = NSDecimalNumber(decimal: v).stringValue
        let horaTexto = String(format: "%02d:%02d", ahora.hour ?? 0, ahora.minute ?? 0)
        do {
            if existente != nil {
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
                                                 categoria: categoria, fecha: dia.iso, hora: String(format: "%02d:%02d", ahora.hour ?? 0, ahora.minute ?? 0),
                                                 concepto: String(concepto.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))))
            cerrar()
        } catch {
            self.error = "no se pudo guardar en este iPhone."
        }
    }
}
