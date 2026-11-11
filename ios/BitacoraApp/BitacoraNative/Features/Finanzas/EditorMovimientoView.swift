import SwiftUI

// Crear, editar, borrar y traspasar un movimiento (modales del coordinador: .movimiento y .editarMovimiento).
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
    @State private var cuentasEd: [CuentaSaldo] = []
    @State private var categoriasEd: [CategoriaFin] = []
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
                        ForEach(cuentasEd) { Text($0.nombre.lowercased() + ".").tag($0.id) }
                    }
                    if tipo == "transfer" {
                        Picker("hacia.", selection: $destino) {
                            ForEach(cuentasEd) { Text($0.nombre.lowercased() + ".").tag($0.id) }
                        }
                    } else {
                        Picker("categoría.", selection: $categoria) {
                            Text("sin categoría.").tag(String?.none)
                            ForEach((categoriasEd).filter { $0.tipo == nil || $0.tipo == tipo }) { Text($0.nombre.lowercased()).tag(Optional($0.id)) }
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
                // Solo las cuentas y las categorías: leer Finanzas entera aquí tardaba con miles de movimientos.
                let (cs, cats) = await Task.detached { () -> ([CuentaSaldo], [CategoriaFin]) in
                    let pro = ((try? doc?.valor(de: "financePro")) ?? nil)?.objeto ?? [:]
                    let js = pro["accounts"]?.objeto ?? [:]
                    var claves = LecturaFinanzas.cuentasFijas
                    for k in js.keys.sorted() where !claves.contains(k) { claves.append(k) }
                    let cs = claves.map { k in CuentaSaldo(id: k, nombre: js[k]?["name"]?.texto ?? (k.prefix(1).uppercased() + String(k.dropFirst())), saldo: 0, enSaldo: true) }
                    return (cs, LecturaFinanzas.leerCategorias(pro))
                }.value
                cuentasEd = cs; categoriasEd = cats
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
