import SwiftUI

// El editor de movimientos de la web (openFinanceProTransactionModal / saveFinanceProTransaction), con su mismo
// guardado en el motor: tipo, fecha, importe, cuentas, categoría (y a qué inversión), las marcas de viaje y de
// ahorro, y la nota. Al editar conserva de dónde vino (banco, cargo automático, pendiente...) y guarda aparte el
// concepto del banco, para que la próxima importación lo reconozca. Guardar una categoría pone la misma a los
// parecidos (financeProAutoCategorizar). Lo abren el coordinador (.movimiento / .editarMovimiento) y Apuntar.
// Bitácora 2.0: el importe grande en el centro, el tipo en un segmento, filas en tarjetas blancas y «guardar.» en la
// cápsula negra de abajo.
struct EditorMovimientoView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    let id: String
    let tipoInicial: String
    var existente: Movimiento?

    struct Opcion: Codable, Identifiable, Equatable { let id, nombre: String; var tipo: String?; var icono: String?; var color: String? }
    struct Borrador: Codable, Equatable {
        var id: String?
        var existe: Bool
        var tipo, fecha, importe, cuenta, destino, categoria, nota, viajeId, inversion, hora, banco: String
        var viaje, ahorro, ajuste, categoriaAuto, pendiente: Bool
        var cuentas, categorias, viajes, inversiones: [Opcion]
    }

    @State private var d: Borrador?
    @State private var original: Borrador?
    @State private var descartar = false
    @State private var fecha = Date()
    @State private var error: String?
    @State private var guardando = false
    @State private var confirmarBorrado = false
    // 3.4 (petición de Alejandro): con los años la lista de viajes no acaba; se ven los cinco más recientes y el elegido.
    @State private var todosLosViajes = false
    @FocusState private var enfocado: Bool

    private static let iso: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; f.timeZone = .current; return f
    }()

    var body: some View {
        VStack(spacing: 0) {
            barra
            if d != nil {
                ScrollView { formulario }
                    .scrollIndicators(.hidden)
                    .scrollDismissesKeyboard(.interactively)
            } else {
                ProgressView().tint(Lienzo.tintaTerciaria).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .fondoLienzo()
        // La acción principal, abajo y a todo el ancho, en la cápsula negra.
        .safeAreaInset(edge: .bottom) {
            if d != nil {
                Button(guardando ? "guardando…" : "guardar.") { Task { await guardar() } }
                    .buttonStyle(.capsula(.oscuro, ancho: true))
                    .disabled(guardando)
                    .padding(.horizontal, Medida.margen).padding(.vertical, Medida.xs)
                    .background(Lienzo.fondo.ignoresSafeArea(edges: .bottom))
            }
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
            original = b
            fecha = Self.iso.date(from: b.fecha).map { Calendar.current.date(bySettingHour: 12, minute: 0, second: 0, of: $0) ?? $0 } ?? Date()
            if existente == nil { enfocado = true }
        }
        .preguntarAlDescartar(cambiado, preguntar: $descartar) { cerrar() }
        .presentationDetents([.large])
    }

    // Cerrar a la izquierda, el título en el centro y, si ya existe, eliminar a la derecha.
    private var barra: some View {
        HStack {
            BotonRedondo(sistema: "xmark", tono: .blanco, etiqueta: "cancelar") { if cambiado { descartar = true } else { cerrar() } }
            Spacer()
            Text(existente == nil ? "nuevo movimiento." : "editar movimiento.").font(Letra.seccion).foregroundStyle(Lienzo.tinta)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            if d?.existe == true {
                BotonRedondo(sistema: "trash", tono: .blanco, etiqueta: "eliminar movimiento") { confirmarBorrado = true }
            } else {
                Color.clear.frame(width: Medida.toque, height: Medida.toque)
            }
        }
        .padding(.horizontal, Medida.margen - 2)
        .padding(.top, Medida.s)
    }

    // B10: el borrador del motor frente al que llegó al abrir (la fecha va aparte hasta guardar).
    private var cambiado: Bool {
        guard let d, let original else { return false }
        return d != original || Self.iso.string(from: fecha) != original.fecha
    }

    private var b: Binding<Borrador> { Binding(get: { d! }, set: { d = $0 }) }

    // financeProEsInversion: la categoría de inversión de gasto o de ingreso, o una que se llame «Inversiones».
    private func esInversion(_ x: Borrador) -> Bool {
        guard x.tipo == "expense" || x.tipo == "income" else { return false }
        if x.categoria == "cat_inversion_gasto" || x.categoria == "cat_inversion_ing" { return true }
        let n = x.categorias.first { $0.id == x.categoria }?.nombre ?? ""
        return n.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES")).trimmingCharacters(in: .whitespaces) == "inversiones"
    }

    private var tintaImporte: Color { d?.tipo == "income" ? Lienzo.positivo : Lienzo.tinta }

    private var formulario: some View {
        let x = d!
        return VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
            SegmentoCapsula(opciones: [SegmentoCapsula<String>.Opcion(valor: "expense", titulo: "gasto."),
                                       SegmentoCapsula<String>.Opcion(valor: "income", titulo: "ingreso."),
                                       SegmentoCapsula<String>.Opcion(valor: "transfer", titulo: "traspaso.")],
                            elegido: b.tipo, sobreBlanco: false)
            // El importe, grande y en el centro: es lo que se viene a escribir.
            VStack(spacing: Medida.xxs) {
                HStack(alignment: .firstTextBaseline, spacing: Medida.xxs) {
                    TextField("", text: b.importe, prompt: Text("0,00").foregroundColor(Lienzo.tintaTerciaria))
                        .keyboardType(.decimalPad)
                        .focused($enfocado)
                        .font(Letra.numeroGrande)
                        .foregroundStyle(tintaImporte)
                        .multilineTextAlignment(.center)
                        .fixedSize()
                    Text("€").font(Letra.numeroGrande).foregroundStyle(Lienzo.tintaTerciaria)
                }
                .frame(maxWidth: .infinity)
                .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: x.tipo)
                Text("importe en euros.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
            }
            .padding(.vertical, Medida.l)
            .tarjeta()
            .contentShape(Rectangle())
            .onTapGesture { enfocado = true }

            VStack(spacing: 0) {
                fila("fecha.") {
                    DatePicker("fecha.", selection: $fecha, displayedComponents: .date)
                        .labelsHidden().environment(\.locale, Locale(identifier: "es_ES"))
                }
                SeparadorFila(sangria: 0)
                fila(x.tipo == "transfer" ? "de qué cuenta." : "cuenta.") {
                    Picker("cuenta.", selection: b.cuenta) { ForEach(x.cuentas) { Text($0.nombre).tag($0.id) } }
                }
                if x.tipo == "transfer" {
                    SeparadorFila(sangria: 0)
                    fila("a qué cuenta.") {
                        Picker("a qué cuenta.", selection: b.destino) {
                            Text("elige una cuenta.").tag("")
                            ForEach(x.cuentas.filter { $0.id != x.cuenta }) { Text($0.nombre).tag($0.id) }
                        }
                    }
                } else if !x.ahorro && !x.ajuste && esInversion(x) && x.inversiones.count > 1 {
                    SeparadorFila(sangria: 0)
                    fila("a qué inversión.") {
                        Picker("a qué inversión.", selection: b.inversion) {
                            Text("sin elegir.").tag("")
                            ForEach(x.inversiones) { Text($0.nombre).tag($0.id) }
                        }
                    }
                }
            }
            .padding(.horizontal, Medida.rellenoTarjeta).padding(.vertical, Medida.xxs)
            .tarjeta(relleno: 0)

            if x.tipo != "transfer" && !x.ahorro && !x.ajuste {
                VStack(alignment: .leading, spacing: Medida.xs) {
                    EtiquetaSeccion(texto: "categoría.")
                    SelectorCategoria(opciones: x.categorias.filter { $0.tipo == x.tipo }, seleccion: b.categoria)
                    if x.categoriaAuto && !x.categoria.isEmpty {
                        Text("Categoría puesta por bitácora: el 90 % o más de tus movimientos parecidos la llevan. Al guardar queda confirmada.")
                            .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).padding(.horizontal, Medida.xxs)
                    }
                }
                .padding(.top, Medida.xs)
            }

            if x.tipo != "transfer" {
                VStack(spacing: 0) {
                    if x.tipo == "expense" {
                        interruptor(b.viaje, "gasto de viaje.", "Cuenta como gasto, pero no entra en los presupuestos ni en el ritmo del mes.")
                        if x.viaje && !x.viajes.isEmpty {
                            SeparadorFila(sangria: 0)
                            fila("viaje.") {
                                Picker("viaje.", selection: b.viajeId) {
                                    Text("sin un viaje concreto").tag("")
                                    ForEach(viajesVisibles(x)) { Text($0.nombre).tag($0.id) }
                                }
                            }
                            if x.viajes.count > 5 && !todosLosViajes {
                                Button("mostrar todos los viajes.") { todosLosViajes = true }
                                    .font(Letra.pieFuerte).estiloEnlace()
                                    .frame(maxWidth: .infinity, minHeight: Medida.toque, alignment: .leading)
                            }
                        }
                        SeparadorFila(sangria: 0)
                    }
                    interruptor(b.ahorro, x.tipo == "income" ? "viene de mis ahorros." : "va a mis ahorros.",
                                x.tipo == "income" ? "Sube el saldo, pero no cuenta como ingreso (lo que sacas de una hucha o un bolsillo)." : "Baja el saldo, pero no cuenta como gasto (lo que apartas a una hucha o un bolsillo).")
                }
                .padding(.horizontal, Medida.rellenoTarjeta).padding(.vertical, Medida.xxs)
                .tarjeta(relleno: 0)
            }

            VStack(alignment: .leading, spacing: Medida.xs) {
                TextField("", text: b.nota, prompt: Text("nota, si quieres. Cena con amigos").foregroundColor(Lienzo.tintaTerciaria), axis: .vertical)
                    .font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                    .lineLimit(1...4)
                    .padding(.horizontal, Medida.rellenoTarjeta).padding(.vertical, Medida.s)
                    .frame(minHeight: Medida.alturaControl + 8)
                    .tarjeta(relleno: 0)
                VStack(alignment: .leading, spacing: Medida.xxs) {
                    if !x.banco.isEmpty && x.banco != x.nota { Text("en el banco: \(x.banco).") }
                    if x.pendiente { Text("pendiente: el banco todavía no lo ha completado.") }
                    if let error { Text(error).foregroundStyle(Lienzo.negativo) }
                }
                .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                .padding(.horizontal, Medida.xxs)
            }
        }
        .padding(.horizontal, Medida.margen)
        .padding(.top, Medida.s)
        .padding(.bottom, Medida.l)
    }

    // Una fila «etiqueta ……… control» dentro de una tarjeta.
    private func fila<C: View>(_ etiqueta: String, @ViewBuilder _ control: () -> C) -> some View {
        HStack(spacing: Medida.xs) {
            Text(etiqueta).font(Letra.cuerpo).foregroundStyle(Lienzo.tintaSecundaria)
            Spacer(minLength: Medida.xs)
            control().pickerStyle(.menu).tint(Lienzo.tinta)
        }
        .frame(minHeight: 52)
    }

    private func interruptor(_ valor: Binding<Bool>, _ titulo: String, _ texto: String) -> some View {
        Toggle(isOn: valor) {
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                Text(texto).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
            }
        }
        .tint(Lienzo.naranja)
        .padding(.vertical, Medida.s)
    }

    private func guardar() async {
        guard var x = d, !guardando else { return }
        guardando = true; defer { guardando = false }
        x.fecha = Self.iso.string(from: fecha)
        let t0 = Date()
        defer { let ms = Date().timeIntervalSince(t0) * 1000; Task { await MotorFinanzas.compartido.anotar("guardar movimiento (total)", ms: ms) } }
        do {
            let json = String(data: try JSONEncoder().encode(x), encoding: .utf8) ?? "{}"
            let r = try await MotorFinanzas.compartido.crudo("guardarMovimiento", [json])
            if await encolarCambiosFinanzas(r, c) { Haptica.exito(); cerrar() } else { error = "no se pudo guardar en este iPhone." }
        } catch { self.error = mensajeMotor(error, "no se pudo guardar.") }
    }

    private func borrar() async {
        do {
            let r = try await MotorFinanzas.compartido.crudo("borrarMovimiento", [id])
            if await encolarCambiosFinanzas(r, c) { cerrar() } else { error = "no se pudo borrar en este iPhone." }
        } catch { self.error = mensajeMotor(error, "no se pudo borrar.") }
    }
}

extension EditorMovimientoView {
    // Los viajes llegan del más reciente al más antiguo (financeProViajesConFecha).
    func viajesVisibles(_ x: Borrador) -> [Opcion] {
        guard !todosLosViajes, x.viajes.count > 5 else { return x.viajes }
        let primeros = Array(x.viajes.prefix(5))
        guard !x.viajeId.isEmpty, !primeros.contains(where: { $0.id == x.viajeId }) else { return primeros }
        return primeros + x.viajes.filter { $0.id == x.viajeId }
    }
}
