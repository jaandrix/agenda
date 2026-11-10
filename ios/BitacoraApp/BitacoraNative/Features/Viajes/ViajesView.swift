import SwiftUI

// Viajes (js/viajes.js): entradas `type: travel` en `entries`, con `itinerario` (por día) y `places`. Los gastos son los
// movimientos de Finanzas marcados `viaje` (financeProGastosDelViaje) más los apuntados a mano en el viaje (`expenses`).
// Reservas, listas, documentos, mapa y la pestaña Destino (tiempo y moneda) siguen en la web: PLAN-0.17.md.

struct ItemItinerario: Sendable, Identifiable, Equatable { let id, dia, hora, titulo, lugar, notas: String }
struct LugarViaje: Sendable, Identifiable, Equatable { let id, nombre: String; let visitado: Bool }
struct GastoViaje: Sendable, Identifiable, Equatable { let id, fecha, nota: String; let importe: Decimal }

struct Viaje: Sendable, Identifiable, Equatable {
    let id, titulo, destino, inicio, fin, companeros, notas: String
    let itinerario: [ItemItinerario]
    let lugares: [LugarViaje]
    let gastos: [GastoViaje]
    let aMano: Decimal

    // tripStatus (js/viajes.js).
    func estado(hoy: String) -> String {
        if inicio.isEmpty { return "sin fecha" }
        if inicio > hoy { return "próximo" }
        if fin.isEmpty || fin >= hoy { return "en curso" }
        return "completado"
    }
    var totalGastos: Decimal { gastos.reduce(0) { $0 + $1.importe } }
}

enum LecturaViajes {
    static func viajes(_ doc: DocumentoBitacora) -> [Viaje] {
        let txs = (((try? doc.valor(de: "financePro")) ?? nil)?["transactions"]?.lista ?? []).compactMap(\.objeto)
        return (((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []).compactMap { x -> Viaje? in
            guard let o = x.objeto, o["type"]?.texto == "travel", let id = o["id"]?.comoId else { return nil }
            let s = { (k: String) in o[k]?.texto ?? "" }
            let inicio = s("startDate"), fin = s("endDate")
            let itinerario = (o["itinerario"]?.lista ?? []).compactMap { i -> ItemItinerario? in
                guard let io = i.objeto, let iid = io["id"]?.comoId else { return nil }
                let t = { (k: String) in io[k]?.texto ?? "" }
                return ItemItinerario(id: iid, dia: t("dia"), hora: t("hora"), titulo: t("titulo"), lugar: t("lugar"), notas: t("notas"))
            }
            let lugares = (o["places"]?.lista ?? []).compactMap { p -> LugarViaje? in
                guard let po = p.objeto, let pid = po["id"]?.comoId else { return nil }
                return LugarViaje(id: pid, nombre: po["nombre"]?.texto ?? "", visitado: po["visitado"]?.booleano == true)
            }
            // financeProGastosDelViaje: gastos marcados `viaje` de este viaje, o sin viajeId y dentro de sus fechas.
            let hasta = fin.isEmpty ? inicio : fin
            let gastos = txs.filter { t in
                guard t["type"]?.texto == "expense", t["viaje"]?.booleano == true else { return false }
                if let v = t["viajeId"]?.comoId { return v == id }
                let f = t["date"]?.texto ?? ""
                return !inicio.isEmpty && f >= inicio && f <= hasta
            }.compactMap { t -> GastoViaje? in
                guard let tid = t["id"]?.comoId, let imp = Dinero.decimal(t["amount"]) else { return nil }
                return GastoViaje(id: tid, fecha: t["date"]?.texto ?? "", nota: t["note"]?.texto ?? "", importe: imp)
            }.sorted { $0.fecha < $1.fecha }
            let aMano = (o["expenses"]?.lista ?? []).reduce(Decimal(0)) { $0 + (Dinero.decimal($1["amount"]) ?? 0) }
            return Viaje(id: id, titulo: s("title"), destino: s("destination"), inicio: inicio, fin: fin, companeros: s("companions"),
                         notas: s("notes"), itinerario: itinerario, lugares: lugares, gastos: gastos, aMano: aMano)
        }
    }

    // Itinerario agrupado por día (los que no tienen día, al final), y dentro por hora.
    static func porDia(_ items: [ItemItinerario]) -> [(String, [ItemItinerario])] {
        let grupos = Dictionary(grouping: items, by: \.dia)
        return grupos.keys.sorted { a, b in a.isEmpty ? false : (b.isEmpty ? true : a < b) }
            .map { ($0, grupos[$0]!.sorted { $0.hora < $1.hora }) }
    }

    static func fechaLarga(_ iso: String) -> String {
        guard let d = LocalDay(iso: iso) else { return iso.isEmpty ? "sin día" : iso }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        guard let f = cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12)) else { return iso }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "es_ES"); fmt.timeZone = CalendarioBitacora.madrid.zona; fmt.dateFormat = "EEEE d 'de' MMMM"
        return fmt.string(from: f)
    }

    static func nuevoId(_ prefijo: String) -> String {
        let letras = "abcdefghijklmnopqrstuvwxyz0123456789"
        return prefijo + "_\(Int64(Date().timeIntervalSince1970 * 1000))_" + String((0..<4).map { _ in letras.randomElement()! })
    }
}

private struct ViajeAbierto: Identifiable { let id: String }
private enum EdicionViaje: Identifiable {
    case viaje(Viaje?)
    var id: String { if case .viaje(let v) = self { return v?.id ?? "nuevo" }; return "" }
}

struct ViajesView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var viajes: [Viaje]?
    @State private var completados = false
    @State private var abierto: ViajeAbierto?
    @State private var edicion: EdicionViaje?

    private var hoy: String { CalendarioBitacora.madrid.dia(de: Date()).iso }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                CabeceraContexto(titulo: "viajes", detalle: viajes.map { "\($0.count) viajes." }) {
                    Text("tus viajes.").font(Tipo.poppins(24, .bold, estilo: .title3)).foregroundStyle(Paleta.sobreContexto)
                    Text("itinerario, lugares y gastos.").font(Tipo.pie).foregroundStyle(Paleta.sobreContextoSuave)
                }
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: Espacio.xs) {
                        pestana("próximos.", !completados) { completados = false }
                        pestana("completados.", completados) { completados = true }
                        Spacer()
                        AccionTexto(texto: "+ viaje.") { edicion = .viaje(nil) }
                    }.padding(.vertical, Espacio.xs)
                    if let viajes {
                        let lista = filtrados(viajes)
                        if lista.isEmpty {
                            Text(completados ? "todavía no hay viajes terminados." : "ningún viaje a la vista.")
                                .font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.l)
                        }
                        ForEach(lista) { fila($0) }
                    } else { ProgressView().frame(maxWidth: .infinity).padding(.top, Espacio.xl) }
                }.modifier(HojaContenido())
            }
        }
        .background(Paleta.fondo.ignoresSafeArea()).scrollIndicators(.hidden)
        .refreshable { await c.sincronizar() }.task(id: c.informe.revision) { await cargar() }
        .sheet(item: $abierto) { a in FichaViaje(id: a.id).environment(c) }
        .sheet(item: $edicion) { e in
            if case .viaje(let v) = e { EditorViaje(viaje: v).environment(c) }
        }
    }

    private func pestana(_ texto: String, _ activa: Bool, _ accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            Text(texto).font(Tipo.poppins(14, activa ? .semibold : .medium, estilo: .footnote))
                .padding(.horizontal, 11).padding(.vertical, 8)
                .foregroundStyle(activa ? Paleta.sobreAcento : Paleta.textoSecundario)
                .background(activa ? Paleta.acento : Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }.buttonStyle(.plain).accessibilityAddTraits(activa ? .isSelected : [])
    }

    // renderTravels: próximos y en curso por fecha de inicio; completados, del más reciente al más antiguo.
    private func filtrados(_ v: [Viaje]) -> [Viaje] {
        if completados { return v.filter { $0.estado(hoy: hoy) == "completado" }.sorted { $0.inicio > $1.inicio } }
        return v.filter { $0.estado(hoy: hoy) != "completado" }.sorted { ($0.inicio.isEmpty ? "9" : $0.inicio) < ($1.inicio.isEmpty ? "9" : $1.inicio) }
    }

    private func fila(_ v: Viaje) -> some View {
        Button { abierto = ViajeAbierto(id: v.id) } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text((v.titulo.isEmpty ? v.destino : v.titulo).lowercased() + ".").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto)
                Text([v.estado(hoy: hoy), fechas(v), v.destino].filter { !$0.isEmpty }.joined(separator: ", ") + ".")
                    .font(Tipo.pie).foregroundStyle(v.estado(hoy: hoy) == "en curso" ? Paleta.acento : Paleta.textoSecundario)
            }.frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
        }.buttonStyle(.plain)
        .contextMenu {
            Button("editar.") { edicion = .viaje(v) }
            Button("eliminar.", role: .destructive) { Task { try? await c.encolar(.borrarEntrada(id: v.id)) } }
        }
    }

    private func fechas(_ v: Viaje) -> String {
        if v.inicio.isEmpty { return "" }
        return v.fin.isEmpty || v.fin == v.inicio ? v.inicio : "\(v.inicio) → \(v.fin)"
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        viajes = await Task.detached(priority: .userInitiated) { doc.map { LecturaViajes.viajes($0) } }.value
    }
}

private struct FichaViaje: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let id: String
    @State private var viaje: Viaje?
    @State private var editando = false
    @State private var itemEditado: ItemItinerario?
    @State private var nuevoItem = false
    @State private var nuevoLugar = ""
    @State private var confirmarBorrado = false

    var body: some View {
        NavigationStack {
            List {
                if let v = viaje {
                    Section {
                        if !v.destino.isEmpty { LabeledContent("destino.", value: v.destino) }
                        LabeledContent("fechas.", value: v.inicio.isEmpty ? "sin fecha" : (v.fin.isEmpty || v.fin == v.inicio ? v.inicio : "\(v.inicio) → \(v.fin)"))
                        if !v.companeros.isEmpty { LabeledContent("con.", value: v.companeros) }
                        if !v.notas.isEmpty { Text(v.notas).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
                    }
                    Section("itinerario.") {
                        ForEach(LecturaViajes.porDia(v.itinerario), id: \.0) { grupo in
                            Text(LecturaViajes.fechaLarga(grupo.0) + ".").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                            ForEach(grupo.1) { it in
                                Button { itemEditado = it } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text([it.hora, it.titulo].filter { !$0.isEmpty }.joined(separator: "  ")).foregroundStyle(Paleta.texto)
                                        if !it.lugar.isEmpty || !it.notas.isEmpty {
                                            Text([it.lugar, it.notas].filter { !$0.isEmpty }.joined(separator: ". ")).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                                        }
                                    }
                                }
                                .swipeActions { Button("borrar", role: .destructive) { enviar(.quitarItinerario(id: it.id)) } }
                            }
                        }
                        Button("+ al itinerario.") { nuevoItem = true }.foregroundStyle(Paleta.acento)
                    }
                    Section("lugares.") {
                        ForEach(v.lugares) { l in
                            Button { enviar(.lugarVisitado(id: l.id, visitado: !l.visitado)) } label: {
                                Label(l.nombre, systemImage: l.visitado ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(l.visitado ? Paleta.textoSecundario : Paleta.texto)
                            }
                            .accessibilityValue(l.visitado ? "visitado" : "por visitar")
                            .swipeActions { Button("borrar", role: .destructive) { enviar(.quitarLugar(id: l.id)) } }
                        }
                        HStack {
                            TextField("un sitio que ver.", text: $nuevoLugar).submitLabel(.done).onSubmit(anadirLugar)
                            Button("añadir.", action: anadirLugar).disabled(nuevoLugar.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                    }
                    Section {
                        if v.gastos.isEmpty && v.aMano == 0 {
                            Text("en finanzas, marca los gastos de estos días como «gasto de viaje.» y aparecerán aquí.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        }
                        if !v.gastos.isEmpty {
                            LabeledContent("gastado en el viaje.", value: Dinero.formato(v.totalGastos))
                            if let dias = dias(v), dias > 0 { LabeledContent("al día.", value: Dinero.formato(v.totalGastos / Decimal(dias))) }
                            ForEach(v.gastos) { g in LabeledContent(g.nota.isEmpty ? "gasto" : g.nota, value: Dinero.formato(g.importe)).font(Tipo.pie) }
                        }
                        if v.aMano > 0 { LabeledContent("apuntados a mano en el viaje.", value: Dinero.formato(v.aMano)) }
                    } header: { Text("gastos.") }
                    Section { Button("eliminar viaje.", role: .destructive) { confirmarBorrado = true } }
                } else { ProgressView() }
            }
            .font(Tipo.cuerpo)
            .navigationTitle(((viaje?.titulo).map { $0.isEmpty ? "viaje" : $0 } ?? "viaje").lowercased() + ".")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } }
                ToolbarItem(placement: .primaryAction) { Button("editar.") { editando = true }.disabled(viaje == nil) }
            }
            .confirmationDialog("¿eliminar este viaje?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("eliminar.", role: .destructive) { Task { try? await c.encolar(.borrarEntrada(id: id)); cerrar() } }
                Button("cancelar.", role: .cancel) {}
            }
            .sheet(isPresented: $editando) { EditorViaje(viaje: viaje).environment(c) }
            .sheet(isPresented: $nuevoItem) { EditorItinerario(viajeId: id, item: nil, diaInicial: viaje?.inicio ?? "").environment(c) }
            .sheet(item: $itemEditado) { it in EditorItinerario(viajeId: id, item: it, diaInicial: it.dia).environment(c) }
            .task(id: c.informe.revision) { await cargar() }
        }
    }

    private func dias(_ v: Viaje) -> Int? {
        guard let a = LocalDay(iso: v.inicio), let b = LocalDay(iso: v.fin.isEmpty ? v.inicio : v.fin) else { return nil }
        var n = 1, d = a
        while d < b && n < 400 { d = d.sumando(dias: 1); n += 1 }
        return n
    }

    private func anadirLugar() {
        let nombre = nuevoLugar.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !nombre.isEmpty else { return }
        enviar(.lugar(id: LecturaViajes.nuevoId("place"), nombre: nombre))
        nuevoLugar = ""
    }

    private func enviar(_ cambio: CambioViaje) { Task { try? await c.encolar(.cambiarViaje(viajeId: id, cambio: cambio)) } }

    private func cargar() async {
        let doc = await c.documentoVisible()
        let vid = id
        viaje = await Task.detached(priority: .userInitiated) { doc.flatMap { LecturaViajes.viajes($0).first { $0.id == vid } } }.value
    }
}

private struct EditorViaje: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let viaje: Viaje?
    @State private var titulo: String
    @State private var destino: String
    @State private var conFechas: Bool
    @State private var inicio: Date
    @State private var fin: Date
    @State private var companeros: String
    @State private var notas: String
    @State private var id: String

    init(viaje: Viaje?) {
        self.viaje = viaje
        _titulo = State(initialValue: viaje?.titulo ?? ""); _destino = State(initialValue: viaje?.destino ?? "")
        _conFechas = State(initialValue: viaje.map { !$0.inicio.isEmpty } ?? true)
        _inicio = State(initialValue: EditorViaje.fecha(viaje?.inicio) ?? Date())
        _fin = State(initialValue: EditorViaje.fecha((viaje?.fin).flatMap { $0.isEmpty ? nil : $0 } ?? viaje?.inicio) ?? Date())
        _companeros = State(initialValue: viaje?.companeros ?? ""); _notas = State(initialValue: viaje?.notas ?? "")
        // El id se decide al abrir: si «guardar.» llega dos veces, el viaje sale una vez.
        _id = State(initialValue: viaje?.id ?? OperacionBitacora.nuevoIdEntrada())
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("título.", text: $titulo)
                TextField("destino.", text: $destino)
                Toggle("con fechas.", isOn: $conFechas)
                if conFechas {
                    DatePicker("ida.", selection: $inicio, displayedComponents: .date)
                    DatePicker("vuelta.", selection: $fin, in: inicio..., displayedComponents: .date)
                }
                TextField("con quién.", text: $companeros)
                Section("notas.") { TextEditor(text: $notas).frame(minHeight: 90) }
            }
            .environment(\.locale, Locale(identifier: "es_ES"))
            .navigationTitle(viaje == nil ? "nuevo viaje." : "viaje.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        let ida = conFechas ? CalendarioBitacora.madrid.dia(de: inicio).iso : ""
                        let vuelta = conFechas ? CalendarioBitacora.madrid.dia(de: max(fin, inicio)).iso : ""
                        let t = titulo.trimmingCharacters(in: .whitespacesAndNewlines)
                        let d = destino.trimmingCharacters(in: .whitespacesAndNewlines)
                        Task { try? await c.encolar(.guardarViaje(id: id, titulo: t.isEmpty ? "Viaje a " + d : t, destino: d, inicio: ida, fin: vuelta,
                                                                    companeros: companeros.trimmingCharacters(in: .whitespacesAndNewlines),
                                                                    notas: notas.trimmingCharacters(in: .whitespacesAndNewlines))) }
                        cerrar()
                    }.disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty && destino.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    static func fecha(_ iso: String?) -> Date? {
        guard let iso, let d = LocalDay(iso: iso) else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        return cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))
    }
}

private struct EditorItinerario: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let viajeId: String
    let item: ItemItinerario?
    @State private var titulo: String
    @State private var lugar: String
    @State private var notas: String
    @State private var conDia: Bool
    @State private var dia: Date
    @State private var conHora: Bool
    @State private var hora: Date
    @State private var id: String

    init(viajeId: String, item: ItemItinerario?, diaInicial: String) {
        self.viajeId = viajeId; self.item = item
        _titulo = State(initialValue: item?.titulo ?? ""); _lugar = State(initialValue: item?.lugar ?? ""); _notas = State(initialValue: item?.notas ?? "")
        _conDia = State(initialValue: !(item?.dia ?? diaInicial).isEmpty)
        _dia = State(initialValue: EditorViaje.fecha(item?.dia ?? diaInicial) ?? Date())
        _conHora = State(initialValue: !(item?.hora ?? "").isEmpty)
        let p = (item?.hora ?? "").split(separator: ":").compactMap { Int($0) }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = CalendarioBitacora.madrid.zona
        _hora = State(initialValue: p.count >= 2 ? (cal.date(bySettingHour: p[0], minute: p[1], second: 0, of: Date()) ?? Date()) : Date())
        _id = State(initialValue: item?.id ?? LecturaViajes.nuevoId("it"))
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("qué vas a hacer.", text: $titulo)
                TextField("lugar.", text: $lugar)
                Toggle("un día concreto.", isOn: $conDia)
                if conDia { DatePicker("día.", selection: $dia, displayedComponents: .date) }
                Toggle("a una hora.", isOn: $conHora)
                if conHora { DatePicker("hora.", selection: $hora, displayedComponents: .hourAndMinute) }
                TextField("notas.", text: $notas, axis: .vertical).lineLimit(1...4)
                if item != nil {
                    Section { Button("quitar del itinerario.", role: .destructive) {
                        Task { try? await c.encolar(.cambiarViaje(viajeId: viajeId, cambio: .quitarItinerario(id: id))) }
                        cerrar()
                    } }
                }
            }
            .environment(\.locale, Locale(identifier: "es_ES"))
            .navigationTitle(item == nil ? "al itinerario." : "itinerario.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        var cal = Calendar(identifier: .gregorian); cal.timeZone = CalendarioBitacora.madrid.zona
                        let h = cal.dateComponents([.hour, .minute], from: hora)
                        let cambio = CambioViaje.itinerario(id: id, dia: conDia ? CalendarioBitacora.madrid.dia(de: dia).iso : "",
                                                           hora: conHora ? String(format: "%02d:%02d", h.hour ?? 0, h.minute ?? 0) : "",
                                                           titulo: titulo.trimmingCharacters(in: .whitespacesAndNewlines),
                                                           lugar: lugar.trimmingCharacters(in: .whitespacesAndNewlines),
                                                           notas: notas.trimmingCharacters(in: .whitespacesAndNewlines))
                        Task { try? await c.encolar(.cambiarViaje(viajeId: viajeId, cambio: cambio)) }
                        cerrar()
                    }.disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
