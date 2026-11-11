import SwiftUI

// El editor de movimientos de la web (openFinanceProTransactionModal / saveFinanceProTransaction), con su mismo
// guardado en el motor: tipo, fecha, importe, cuentas, categoría (y a qué inversión), las marcas de viaje y de
// ahorro, y la nota. Al editar conserva de dónde vino (banco, cargo automático, pendiente...) y guarda aparte el
// concepto del banco, para que la próxima importación lo reconozca. Guardar una categoría pone la misma a los
// parecidos (financeProAutoCategorizar). Lo abren el coordinador (.movimiento / .editarMovimiento) y Apuntar.
struct EditorMovimientoView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let id: String
    let tipoInicial: String
    var existente: Movimiento?

    struct Opcion: Codable, Identifiable, Equatable { let id, nombre: String; var tipo: String? }
    struct Borrador: Codable, Equatable {
        var id: String?
        var existe: Bool
        var tipo, fecha, importe, cuenta, destino, categoria, nota, viajeId, inversion, hora, banco: String
        var viaje, ahorro, ajuste, categoriaAuto, pendiente: Bool
        var cuentas, categorias, viajes, inversiones: [Opcion]
    }

    @State private var d: Borrador?
    @State private var fecha = Date()
    @State private var error: String?
    @State private var guardando = false
    @State private var confirmarBorrado = false
    @FocusState private var enfocado: Bool

    private static let iso: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; f.timeZone = .current; return f
    }()

    var body: some View {
        NavigationStack {
            Group {
                if d != nil { formulario } else { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            }
            .background(Paleta.fondo)
            .navigationTitle(existente == nil ? "nuevo movimiento." : "editar movimiento.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) { Button("guardar.") { Task { await guardar() } }.disabled(guardando || d == nil) }
            }
            .confirmationDialog("¿Eliminar este movimiento?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("eliminar.", role: .destructive) { Task { await borrar() } }
                Button("cancelar.", role: .cancel) {}
            }
            .task {
                guard d == nil, let m = try? await motorListo(c),
                      var b = try? await m.llamar("movimientoDatos", [existente == nil ? "" : id, tipoInicial], como: Borrador.self) else { return }
                b.id = id
                d = b
                fecha = Self.iso.date(from: b.fecha).map { Calendar.current.date(bySettingHour: 12, minute: 0, second: 0, of: $0) ?? $0 } ?? Date()
                if existente == nil { enfocado = true }
            }
        }
        .presentationDetents([.large])
    }

    private var b: Binding<Borrador> { Binding(get: { d! }, set: { d = $0 }) }

    // financeProEsInversion: la categoría de inversión de gasto o de ingreso, o una que se llame «Inversiones».
    private func esInversion(_ x: Borrador) -> Bool {
        guard x.tipo == "expense" || x.tipo == "income" else { return false }
        if x.categoria == "cat_inversion_gasto" || x.categoria == "cat_inversion_ing" { return true }
        let n = x.categorias.first { $0.id == x.categoria }?.nombre ?? ""
        return n.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES")).trimmingCharacters(in: .whitespaces) == "inversiones"
    }

    private var formulario: some View {
        let x = d!
        return Form {
            Section {
                Picker("tipo.", selection: b.tipo) {
                    Text("gasto.").tag("expense"); Text("ingreso.").tag("income"); Text("transferencia.").tag("transfer")
                }
                .pickerStyle(.segmented)
                DatePicker("fecha.", selection: $fecha, displayedComponents: .date).environment(\.locale, Locale(identifier: "es_ES"))
                TextField("importe en euros. 0,00", text: b.importe).keyboardType(.decimalPad).focused($enfocado)
            }
            Section {
                Picker(x.tipo == "transfer" ? "de qué cuenta." : "cuenta.", selection: b.cuenta) {
                    ForEach(x.cuentas) { Text($0.nombre).tag($0.id) }
                }
                if x.tipo == "transfer" {
                    Picker("a qué cuenta.", selection: b.destino) {
                        Text("elige una cuenta.").tag("")
                        ForEach(x.cuentas.filter { $0.id != x.cuenta }) { Text($0.nombre).tag($0.id) }
                    }
                } else if !x.ahorro && !x.ajuste {
                    Picker("categoría.", selection: b.categoria) {
                        Text("sin categoría.").tag("")
                        ForEach(x.categorias.filter { $0.tipo == x.tipo }) { Text($0.nombre).tag($0.id) }
                    }
                    if x.categoriaAuto && !x.categoria.isEmpty {
                        Text("Categoría puesta por bitácora: el 90 % o más de tus movimientos parecidos la llevan. Al guardar queda confirmada.")
                            .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    }
                    if esInversion(x) && x.inversiones.count > 1 {
                        Picker("a qué inversión.", selection: b.inversion) {
                            Text("sin elegir.").tag("")
                            ForEach(x.inversiones) { Text($0.nombre).tag($0.id) }
                        }
                    }
                }
            }
            if x.tipo != "transfer" {
                Section {
                    if x.tipo == "expense" {
                        Toggle(isOn: b.viaje) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("gasto de viaje.")
                                Text("Cuenta como gasto, pero no entra en los presupuestos ni en el ritmo del mes.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                            }
                        }
                        if x.viaje && !x.viajes.isEmpty {
                            Picker("viaje.", selection: b.viajeId) {
                                Text("sin un viaje concreto").tag("")
                                ForEach(x.viajes) { Text($0.nombre).tag($0.id) }
                            }
                        }
                    }
                    Toggle(isOn: b.ahorro) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(x.tipo == "income" ? "viene de mis ahorros." : "va a mis ahorros.")
                            Text(x.tipo == "income" ? "Sube el saldo, pero no cuenta como ingreso (lo que sacas de una hucha o un bolsillo)." : "Baja el saldo, pero no cuenta como gasto (lo que apartas a una hucha o un bolsillo).")
                                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        }
                    }
                }
            }
            Section {
                TextField("nota, si quieres. Cena con amigos", text: b.nota)
            } footer: {
                VStack(alignment: .leading, spacing: 4) {
                    if !x.banco.isEmpty && x.banco != x.nota { Text("en el banco: \(x.banco).") }
                    if x.pendiente { Text("pendiente: el banco todavía no lo ha completado.") }
                    if let error { Text(error).foregroundStyle(Paleta.error) }
                }
            }
            if x.existe {
                Section { Button("eliminar movimiento.", role: .destructive) { confirmarBorrado = true } }
            }
        }
        .font(Tipo.cuerpo)
        .scrollContentBackground(.hidden)
    }

    private func guardar() async {
        guard var x = d, !guardando else { return }
        guardando = true; defer { guardando = false }
        x.fecha = Self.iso.string(from: fecha)
        do {
            let json = String(data: try JSONEncoder().encode(x), encoding: .utf8) ?? "{}"
            let r = try await MotorFinanzas.compartido.crudo("guardarMovimiento", [json])
            if await encolarCambiosFinanzas(r, c) { cerrar() } else { error = "no se pudo guardar en este iPhone." }
        } catch { self.error = mensajeMotor(error, "no se pudo guardar.") }
    }

    private func borrar() async {
        do {
            let r = try await MotorFinanzas.compartido.crudo("borrarMovimiento", [id])
            if await encolarCambiosFinanzas(r, c) { cerrar() } else { error = "no se pudo borrar en este iPhone." }
        } catch { self.error = mensajeMotor(error, "no se pudo borrar.") }
    }
}
