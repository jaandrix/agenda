import SwiftUI

// Lo que en la 0.19 abría la web: el objetivo de patrimonio (openFinanceTargetEditor), «inversión desde.» de la gráfica
// (ponerInversionDesde) y la ficha de una cuenta de inversión (openFichaInversion, js/inversion.js). Las cifras y lo que
// se guarda salen del motor, con las mismas funciones de la web.

private func escribirFinanzas(_ c: AppCoordinator, _ funcion: String, _ args: [String]) async throws -> String? {
    let m = try await motorListo(c)
    let r = try await m.crudo(funcion, args)
    guard await encolarCambiosFinanzas(r, c) else { throw ErrorMotorFinanzas.js("no se pudo guardar en este iPhone.") }
    return (try? LectorJSON.valor(r))?["resultado"]?.texto
}

private func numero(_ t: String) -> Double? {
    let s = t.trimmingCharacters(in: .whitespaces)
    return Double(s.contains(",") ? s.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".") : s)
}
private func texto(_ v: Double?) -> String {
    guard let v else { return "" }
    return v == v.rounded() ? String(Int(v)) : String(format: "%.2f", v).replacingOccurrences(of: ".", with: ",")
}

// MARK: - objetivo

struct ObjetivoPatrimonioView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    private struct Datos: Decodable { let cuentas, emergencia, inversion: Double }
    @State private var cuentas = ""
    @State private var emergencia = ""
    @State private var inversion = ""
    @State private var error: String?
    @State private var guardando = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    fila("tus cuentas.", $cuentas)
                    fila("fondo de emergencia.", $emergencia)
                    fila("inversión.", $inversion)
                } footer: {
                    Text("El objetivo es la suma de los tres: «camino al objetivo.» calcula cuándo llegas al ritmo de los últimos meses.")
                }
                if let error { Section { Text(error).foregroundStyle(Paleta.error) } }
            }
            .font(Tipo.cuerpo)
            .scrollContentBackground(.hidden)
            .background(Paleta.fondo)
            .navigationTitle("objetivo.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } } }
            .safeAreaInset(edge: .bottom) {
                BotonFin(texto: guardando ? "guardando." : "guardar objetivo.", acento: true) { Task { await guardar() } }
                    .disabled(guardando)
                    .padding(.horizontal, 20).padding(.top, 10).padding(.bottom, 8)
                    .background(Paleta.fondo.ignoresSafeArea(edges: .bottom))
            }
            .task {
                if let m = try? await motorListo(c), let d = try? await m.llamar("objetivoDatos", como: Datos.self) {
                    cuentas = texto(d.cuentas == 0 ? nil : d.cuentas); emergencia = texto(d.emergencia == 0 ? nil : d.emergencia); inversion = texto(d.inversion == 0 ? nil : d.inversion)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func fila(_ t: String, _ v: Binding<String>) -> some View {
        HStack {
            Text(t)
            Spacer()
            TextField("0", text: v).keyboardType(.decimalPad).multilineTextAlignment(.trailing).monospacedDigit().frame(maxWidth: 140)
            Text("€").foregroundStyle(Paleta.textoSecundario)
        }
    }

    private func guardar() async {
        guardando = true; defer { guardando = false }
        let datos: [String: Double] = ["cuentas": numero(cuentas) ?? 0, "emergencia": numero(emergencia) ?? 0, "inversion": numero(inversion) ?? 0]
        do {
            let json = String(data: try JSONSerialization.data(withJSONObject: datos), encoding: .utf8) ?? "{}"
            _ = try await escribirFinanzas(c, "guardarObjetivo", [json])
            cerrar()
        } catch { self.error = mensajeMotor(error, "no se pudo guardar el objetivo.") }
    }
}

// MARK: - inversión desde

// En la gráfica «con inversión y emergencia.»: desde qué día cuenta la inversión (ponerInversionDesde).
struct InversionDesdeView: View {
    @Environment(AppCoordinator.self) private var c
    let actual: String
    @State private var fecha = Date()
    @State private var abierto = false
    @State private var aviso: String?

    private static let iso: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; f.timeZone = .current; return f
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("inversión desde.").font(Tipo.poppins(14, .medium, estilo: .footnote)).foregroundStyle(Paleta.textoSecundario)
                Spacer()
                if abierto || !actual.isEmpty {
                    DatePicker("", selection: $fecha, displayedComponents: .date).labelsHidden()
                        .environment(\.locale, Locale(identifier: "es_ES"))
                        .onChange(of: fecha) { _, f in Task { await poner(Self.iso.string(from: f)) } }
                    if !actual.isEmpty {
                        Button { Task { await poner("") } } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Paleta.textoSecundario) }
                            .buttonStyle(.plain).accessibilityLabel("quitar la fecha")
                    }
                } else {
                    Button("elegir fecha.") { abierto = true }.font(Tipo.poppins(14, .medium, estilo: .footnote)).foregroundStyle(Paleta.acento).buttonStyle(.plain)
                }
            }
            if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.error) }
        }
        .onAppear { if let d = Self.iso.date(from: actual) { fecha = d } }
    }

    private func poner(_ f: String) async {
        guard f != actual else { return }
        do { _ = try await escribirFinanzas(c, "inversionDesde", [f]); aviso = nil; if f.isEmpty { abierto = false } }
        catch { aviso = mensajeMotor(error, "no se pudo guardar.") }
    }
}

// MARK: - ficha de inversión

struct DatosInversion: Decodable, Equatable {
    struct Mes: Decodable, Equatable, Identifiable { let id, titulo: String }
    struct Mov: Decodable, Equatable { let dia: String; let importe: Double }
    struct Ref: Decodable, Equatable { let valor: Double; let texto: String }
    struct Proy: Decodable, Equatable { let anios: Int; let puesto, base, mas: Double }
    struct Hist: Decodable, Equatable, Identifiable { let mes, titulo, origen: String; let aportacion, aportado: Double; let valor, ganancia, rent: Double?; var id: String { mes } }
    let nombre, mes, mesTitulo, estado: String
    let valor, aportado, ganancia: Double
    let acumulada, media, anual: Double?
    let meses: [Mes]
    let aportacion: Double?
    let deMovimientos, distinto: Bool
    let movimientos: [Mov]
    let guardadoAportacion, sumaMovimientos: Double
    let valorMes: Double?
    let referencia: Ref?
    let correo: Double?
    let tasa, extra, ultimaAportacion: Double
    let proyeccion: [Proy]
    let historico: [Hist]
}

struct FichaInversionView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let id: String
    let oculto: Bool

    @State private var d: DatosInversion?
    @State private var mes = ""
    @State private var aportacion = ""
    @State private var valor = ""
    @State private var tasa = ""
    @State private var error: String?
    @State private var aviso: String?
    @State private var confirmar: String?
    @State private var guardando = false

    private func din(_ v: Double) -> String { oculto ? "•••" : FormatoFin.dinero(v) }
    private func pct(_ v: Double?, _ dec: Int = 1) -> String {
        guard let v, v.isFinite else { return "sin datos" }
        return (v > 0 ? "+" : v < 0 ? "−" : "") + String(format: "%.\(dec)f", abs(v)).replacingOccurrences(of: ".", with: ",") + " %"
    }

    var body: some View {
        NavigationStack {
            Group {
                if let d { ficha(d) } else if let error { Text(error).foregroundStyle(Paleta.error).padding() } else { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            }
            .background(Paleta.fondo)
            .navigationTitle((d?.nombre.lowercased() ?? "inversión") + ".")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } } }
            .alert("finanzas.", isPresented: Binding(get: { aviso != nil }, set: { if !$0 { aviso = nil } })) {
                Button("aceptar.", role: .cancel) { aviso = nil }
            } message: { Text(aviso ?? "") }
            .confirmationDialog(confirmar ?? "", isPresented: Binding(get: { confirmar != nil }, set: { if !$0 { confirmar = nil } }), titleVisibility: .visible) {
                Button("guardar así.") { Task { await guardarMes(confirmado: true) } }
                Button("revisar.", role: .cancel) {}
            }
            .task {
                // openFichaInversion: las aportaciones de los movimientos, al día antes de enseñar nada.
                _ = try? await escribirFinanzas(c, "inversionAbrir", [id])
                await cargar("")
            }
        }
    }

    private func ficha(_ d: DatosInversion) -> some View {
        Form {
            Section {
                FilaLibro(etiqueta: "vale hoy", valor: din(d.valor))
                FilaLibro(etiqueta: "has aportado", valor: din(d.aportado))
                FilaLibro(etiqueta: "ganancia acumulada", valor: oculto ? "•••" : (d.ganancia >= 0 ? "+" : "−") + FormatoFin.dinero(abs(d.ganancia)), acento: d.ganancia < 0)
                FilaLibro(etiqueta: "rentabilidad acumulada", valor: pct(d.acumulada, 2))
                FilaLibro(etiqueta: "media al mes", valor: pct(d.media, 2) + (d.anual.map { ", \(pct($0)) al año" } ?? ""))
            } footer: { Text("La ganancia es lo que ha puesto el fondo, no tú.") }

            Section {
                Picker("mes.", selection: Binding(get: { mes }, set: { m in Task { await cargar(m) } })) {
                    ForEach(d.meses) { Text($0.titulo).tag($0.id) }
                }
                HStack {
                    Text("aportación del mes.")
                    Spacer()
                    TextField("0,00", text: $aportacion).keyboardType(.decimalPad).multilineTextAlignment(.trailing).monospacedDigit().frame(maxWidth: 130)
                        .disabled(d.deMovimientos).foregroundStyle(d.deMovimientos ? Paleta.textoSecundario : Paleta.texto)
                }
                if d.deMovimientos {
                    Text("de tus movimientos: " + d.movimientos.map { "\($0.dia) \($0.importe < 0 ? "−" : "")\(FormatoFin.dinero(abs($0.importe)))" }.joined(separator: ", ") + ".")
                        .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                }
                HStack {
                    Text("valor de la cuenta.")
                    Spacer()
                    TextField("tu saldo total hoy", text: $valor).keyboardType(.decimalPad).multilineTextAlignment(.trailing).monospacedDigit().frame(maxWidth: 150)
                }
                if d.distinto {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Guardaste \(FormatoFin.dinero(d.guardadoAportacion)) de aportación, pero tus movimientos de este mes suman \(FormatoFin.dinero(d.sumaMovimientos)).")
                            .font(Tipo.pie).foregroundStyle(Paleta.atencion)
                        Button("usar lo de los movimientos.") { Task { await usarMovimientos() } }.font(Tipo.pie)
                    }
                }
                if let r = d.referencia {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(r.texto).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        if abs(r.valor - (numero(valor) ?? 0)) > 0.5 {
                            Button("usar \(FormatoFin.dinero(r.valor)).") { valor = texto(r.valor) }.font(Tipo.pie)
                        }
                    }
                }
                Text(d.estado + (d.correo.map { " Según el correo, la cartera valía \(FormatoFin.dinero($0))." } ?? ""))
                    .font(Tipo.pie).foregroundStyle(d.estado.hasPrefix("guardado") && !d.distinto ? Paleta.progreso : Paleta.textoSecundario)
                BotonFin(texto: guardando ? "guardando." : "guardar \(d.mesTitulo).", acento: true) { Task { await guardarMes(confirmado: false) } }
                    .disabled(guardando)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            } header: { Text("el mes.") }

            Section {
                HStack {
                    Text("rentabilidad anual supuesta.")
                    Spacer()
                    TextField("6", text: $tasa).keyboardType(.numbersAndPunctuation).multilineTextAlignment(.trailing).monospacedDigit().frame(maxWidth: 60)
                        .onSubmit { Task { await cambiarTasa() } }
                    Text("%").foregroundStyle(Paleta.textoSecundario)
                }
                Text("Aportando \(din(d.ultimaAportacion)) al mes desde los \(din(d.valor)) de hoy.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                ForEach(d.proyeccion, id: \.anios) { p in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text("dentro de \(p.anios) años.").font(Tipo.cuerpoFuerte)
                            Spacer()
                            Text(din(p.base)).font(Tipo.poppins(15, .semibold, estilo: .body)).monospacedDigit()
                        }
                        Text("pones tú \(din(p.puesto)); con \(Int(d.extra)) € más al mes, \(din(p.mas)) (+\(din(p.mas - p.base))).")
                            .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    }
                }
            } header: { Text("si mantienes el ritmo.") }

            Section {
                if d.historico.isEmpty {
                    Text("Todavía no hay meses. Apunta el primero arriba.").foregroundStyle(Paleta.textoSecundario)
                }
                ForEach(d.historico) { h in
                    Button { Task { await cargar(h.mes) } } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text(h.titulo + ".").font(Tipo.cuerpoFuerte).foregroundStyle(h.mes == d.mes ? Paleta.acento : Paleta.texto)
                                Spacer()
                                Text(h.valor.map { din($0) } ?? "sin valor").monospacedDigit().foregroundStyle(Paleta.texto)
                            }
                            Text("aportación \(din(h.aportacion)), aportado \(din(h.aportado))"
                                 + (h.ganancia.map { oculto ? "" : ", ganancia \($0 >= 0 ? "+" : "−")\(FormatoFin.dinero(abs($0)))" } ?? "")
                                 + (h.rent.map { ", \(pct($0, 2))" } ?? "") + ", \(h.origen)")
                                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        }
                    }
                    .buttonStyle(.plain)
                }
            } header: { Text("histórico.") }
        }
        .font(Tipo.cuerpo)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
    }

    private func cargar(_ m: String) async {
        do {
            let motor = try await motorListo(c)
            let r = try await motor.llamar("inversionDatos", [id, m], como: DatosInversion.self)
            d = r; mes = r.mes
            aportacion = texto(r.aportacion); valor = texto(r.valorMes); tasa = texto(r.tasa)
            error = nil
        } catch { error = mensajeMotor(error, "no se pudo abrir la inversión.") }
    }

    // invGuardarMes: un valor muy lejos de lo esperable suele ser un error al teclear; se pregunta antes.
    private func guardarMes(confirmado: Bool) async {
        guard let d else { return }
        if !confirmado, let r = d.referencia, r.valor > 0, let v = numero(valor), abs(v - r.valor) / r.valor > 0.1 {
            confirmar = "Lo esperable este mes es unos \(FormatoFin.dinero(r.valor)) y has puesto \(FormatoFin.dinero(v)) (\(v < r.valor ? "una pérdida" : "una subida") de más del 10 %). ¿Lo guardo así?"
            return
        }
        guardando = true; defer { guardando = false }
        do {
            let t = try await escribirFinanzas(c, "inversionGuardarMes", [id, mes, aportacion, valor])
            await cargar(mes)
            aviso = t
        } catch { aviso = mensajeMotor(error, "no se pudo guardar.") }
    }

    private func usarMovimientos() async {
        do { _ = try await escribirFinanzas(c, "inversionUsarMovimientos", [id, mes]); await cargar(mes) }
        catch { aviso = mensajeMotor(error, "no se pudo guardar.") }
    }

    private func cambiarTasa() async {
        do { _ = try await escribirFinanzas(c, "inversionTasa", [tasa]); await cargar(mes) }
        catch { aviso = mensajeMotor(error, "no se pudo guardar.") }
    }
}
