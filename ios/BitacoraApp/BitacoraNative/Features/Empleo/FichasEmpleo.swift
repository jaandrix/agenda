import SwiftUI

// 0.24: las fichas de empleo (entradas `type: work` de js/entradas.js) y la vida laboral (renderWork en
// js/trabajo-estudios.js): días por empleo (los de tu informe de vida laboral si los pusiste, `cotizedDays`; si no, la
// estimación con fines de semana) y el total. El importador del informe con IA, el PDF y el CV siguen en la web.

struct FichaEmpleo: Sendable, Identifiable, Equatable {
    let id, titulo, empresa, cargo, modalidad, inicio, fin, entrada, salida, cotizacion, sueldo, logros, motivoSalida, notas: String
    let diasCotizados: Int?

    var nombre: String { empresa.isEmpty ? (titulo.isEmpty ? "empleo" : titulo) : empresa }
    var subtitulo: String { [cargo, empresa.isEmpty ? "" : titulo].filter { !$0.isEmpty }.joined(separator: ", ") }
    func activo(hoy: String) -> Bool { fin.isEmpty || fin >= hoy }

    // getCotizationDays: la cifra de la vida laboral manda; si no, de inicio a fin (o a hoy) con los dos extremos.
    func dias(hoy: String) -> Int {
        if let diasCotizados { return max(0, diasCotizados) }
        guard let a = LocalDay(iso: inicio), let b = LocalDay(iso: activo(hoy: hoy) ? hoy : fin) else { return 0 }
        let n = a.dias(hasta: b)
        return n < 0 ? 0 : n + 1
    }
    var deVidaLaboral: Bool { diasCotizados != nil }
}

enum LecturaFichasEmpleo {
    static let modalidades: [(String, String)] = [("", "sin especificar."), ("presencial", "presencial."), ("hibrido", "híbrido."), ("remoto", "remoto.")]

    static func fichas(_ doc: DocumentoBitacora, hoy: String) -> [FichaEmpleo] {
        let lista = (((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []).compactMap { x -> FichaEmpleo? in
            guard let o = x.objeto, o["type"]?.texto == "work", let id = o["id"]?.comoId else { return nil }
            let s = { (k: String) in o[k]?.texto ?? "" }
            var dias: Int?
            if case .number(let n)? = o["cotizedDays"], let d = Double(n), d >= 0 { dias = Int(d) }
            var sueldo = s("salary")
            if case .number(let n)? = o["salary"] { sueldo = n }
            return FichaEmpleo(id: id, titulo: s("title"), empresa: s("company"), cargo: s("position"), modalidad: s("modalidad"), inicio: s("startDate"),
                               fin: s("endDate"), entrada: s("startTime"), salida: s("endTime"), cotizacion: s("cotizationType"), sueldo: sueldo,
                               logros: s("logros"), motivoSalida: s("motivoSalida"), notas: s("notes"), diasCotizados: dias)
        }
        // Como renderWork: primero los actuales, y dentro de cada grupo el que empezó más tarde.
        return lista.sorted { a, b in
            let x = a.activo(hoy: hoy), y = b.activo(hoy: hoy)
            if x != y { return x }
            return a.inicio > b.inicio
        }
    }
}

// saveEntry para `type: work`. Crear pone lo común (categoría cat_trabajo, sin etiquetas); editar cambia solo los
// campos del formulario y deja lo demás (documentos, lo que añada la web).
enum FichaEmpleoOp {
    static let tipo = "fichaEmpleo"
    static let textos = ["title", "company", "position", "modalidad", "startDate", "endDate", "startTime", "endTime", "cotizationType", "logros", "motivoSalida", "notes"]

    static func op(id: String, campos: [String: String], diasCotizados: String, sueldo: String) -> OperacionBitacora {
        var d: [String: JSONValue] = ["id": .string(id), "dias": .string(diasCotizados), "sueldo": .string(sueldo)]
        for k in textos { d[k] = .string(campos[k] ?? "") }
        return OperacionesExtra.op(tipo, d)
    }

    static func aplicar(_ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        guard let id = d["id"]?.texto else { return valores }
        let t = { (k: String) in (d[k]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
        let empresa = t("company")
        let titulo = t("title").isEmpty ? empresa : t("title")
        guard !titulo.isEmpty else { return valores }
        var lista = (valores["entries"] ?? nil)?.lista ?? []
        let n = lista.firstIndex(where: { $0["id"]?.comoId == id })
        if let n, lista[n]["type"]?.texto != "work" { return valores }
        var e = n.flatMap { lista[$0].objeto } ?? ["id": .string(id), "type": .string("work"), "categoryId": .string("cat_trabajo"), "tags": .array([])]
        for k in textos { e[k] = .string(String(t(k).prefix(k == "notes" || k == "logros" ? 4000 : 300))) }
        e["title"] = .string(String(titulo.prefix(200)))
        let ini = t("startDate"), fin = t("endDate"), entra = t("startTime"), sale = t("endTime")
        e["date"] = .string(ini.isEmpty ? fin : ini)
        e["schedule"] = .string(entra + (sale.isEmpty ? "" : " - " + sale))
        if t("cotizationType").isEmpty { e["cotizationType"] = .string("general") }
        if let dias = Int(t("dias")), dias >= 0 { e["cotizedDays"] = .number(String(dias)) } else { e["cotizedDays"] = .null }
        if let s = Dinero.decimal(texto: t("sueldo")), s > 0 { e["salary"] = .number(NSDecimalNumber(decimal: s).stringValue) } else { e["salary"] = .null }
        e["status"] = .string(fin.isEmpty ? "Trabajo actual" : "Completado")
        if let n { lista[n] = .object(e) } else { lista.append(.object(e)) }
        var r = valores
        r["entries"] = .some(.array(lista))
        return r
    }
}

struct FichaEmpleoEditando: Identifiable {
    let ficha: FichaEmpleo?
    var id: String { ficha?.id ?? "nueva" }
}

struct EditorFichaEmpleo: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let editando: FichaEmpleoEditando
    @State private var campos: [String: String]
    @State private var dias: String
    @State private var sueldo: String
    @State private var id: String
    @State private var descartar = false
    @State private var confirmarBorrado = false
    private let original: [String]

    init(editando: FichaEmpleoEditando) {
        self.editando = editando
        let f = editando.ficha
        let inicial = Self.campos(f)
        let d = f?.diasCotizados.map { String($0) } ?? ""
        let s = f?.sueldo ?? ""
        _campos = State(initialValue: inicial)
        _dias = State(initialValue: d)
        _sueldo = State(initialValue: s)
        _id = State(initialValue: f?.id ?? OperacionBitacora.nuevoIdEntrada())
        original = Self.clave(inicial, d, s)
    }

    private static func campos(_ f: FichaEmpleo?) -> [String: String] {
        guard let f else { return ["cotizationType": "general"] }
        var r: [String: String] = [:]
        r["title"] = f.titulo; r["company"] = f.empresa; r["position"] = f.cargo; r["modalidad"] = f.modalidad
        r["startDate"] = f.inicio; r["endDate"] = f.fin; r["startTime"] = f.entrada; r["endTime"] = f.salida
        r["cotizationType"] = f.cotizacion.isEmpty ? "general" : f.cotizacion
        r["logros"] = f.logros; r["motivoSalida"] = f.motivoSalida; r["notes"] = f.notas
        return r
    }

    private static func clave(_ c: [String: String], _ d: String, _ s: String) -> [String] {
        FichaEmpleoOp.textos.map { (c[$0] ?? "").trimmingCharacters(in: .whitespacesAndNewlines) } + [d, s]
    }
    private var cambiado: Bool { Self.clave(campos, dias, sueldo) != original }
    private func campo(_ k: String) -> Binding<String> { Binding(get: { campos[k] ?? "" }, set: { campos[k] = $0 }) }
    private var valido: Bool { !(campos["title"] ?? "").trimmingCharacters(in: .whitespaces).isEmpty || !(campos["company"] ?? "").trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        NavigationStack {
            FormEmpleo {
                Section {
                    TextField("empresa.", text: campo("company"))
                    TextField("cargo.", text: campo("position"))
                    TextField("título (si no, la empresa).", text: campo("title"))
                    Picker("modalidad.", selection: campo("modalidad")) { ForEach(LecturaFichasEmpleo.modalidades, id: \.0) { Text($0.1).tag($0.0) } }
                } header: { CabeceraFormEmpleo(texto: "puesto") }
                Section {
                    CampoFecha(titulo: "empieza.", texto: campo("startDate"))
                    CampoFecha(titulo: "acaba.", texto: campo("endDate"))
                    CampoHora(titulo: "entrada.", texto: campo("startTime"))
                    CampoHora(titulo: "salida.", texto: campo("endTime"))
                } header: { CabeceraFormEmpleo(texto: "fechas y jornada") }
                Section {
                    Picker("cotización.", selection: campo("cotizationType")) {
                        Text("régimen general.").tag("general")
                        Text("prácticas formativas.").tag("practicas")
                    }
                    TextField("días cotizados (vida laboral).", text: $dias).keyboardType(.numberPad)
                    TextField("sueldo al mes (€).", text: $sueldo).keyboardType(.decimalPad)
                } header: {
                    CabeceraFormEmpleo(texto: "vida laboral")
                } footer: {
                    Text("si pones los días de tu informe de vida laboral, bitácora usa esa cifra en vez de calcularla.").pieFormEmpleo()
                }
                Section {
                    TextField("logros.", text: campo("logros"), axis: .vertical).lineLimit(1...5)
                    TextField("motivo de salida.", text: campo("motivoSalida"))
                    TextField("notas.", text: campo("notes"), axis: .vertical).lineLimit(1...5)
                } header: { CabeceraFormEmpleo(texto: "más") }
                if editando.ficha != nil {
                    Section { Button("eliminar el empleo.", role: .destructive) { confirmarBorrado = true } }
                }
            }
            .navigationTitle(editando.ficha == nil ? "nuevo empleo." : "empleo.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { if cambiado { descartar = true } else { cerrar() } } }
            }
            .botonPrincipalEmpleo("guardar.", activo: valido) {
                let op = FichaEmpleoOp.op(id: id, campos: campos, diasCotizados: dias.trimmingCharacters(in: .whitespaces), sueldo: sueldo)
                Task { @MainActor in if await c.guardar(op) { Haptica.exito(); cerrar() } }
            }
            .confirmationDialog("¿eliminar este empleo?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("eliminar.", role: .destructive) { Task { if await c.guardar(.borrarEntrada(id: id)) { cerrar() } } }
                Button("cancelar.", role: .cancel) {}
            }
            .preguntarAlDescartar(cambiado, preguntar: $descartar) { cerrar() }
        }
    }
}

// Una fecha «AAAA-MM-DD» opcional.
struct CampoFecha: View {
    let titulo: String
    @Binding var texto: String

    var body: some View {
        Toggle(titulo, isOn: Binding(get: { !texto.isEmpty }, set: { texto = $0 ? CalendarioBitacora.madrid.dia(de: Date()).iso : "" }))
        if !texto.isEmpty {
            DatePicker(titulo, selection: Binding(get: { LecturaEmpleo.fecha(texto) ?? Date() }, set: { texto = CalendarioBitacora.madrid.dia(de: $0).iso }),
                       displayedComponents: .date)
                .labelsHidden()
                .environment(\.locale, Locale(identifier: "es_ES"))
        }
    }
}

// Una hora «HH:MM» opcional.
struct CampoHora: View {
    let titulo: String
    @Binding var texto: String

    private static var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = CalendarioBitacora.madrid.zona
        return c
    }

    private static func fecha(_ t: String) -> Date {
        let p = t.split(separator: ":").compactMap { Int($0) }
        return cal.date(bySettingHour: p.first ?? 9, minute: p.count > 1 ? p[1] : 0, second: 0, of: Date()) ?? Date()
    }

    var body: some View {
        Toggle(titulo, isOn: Binding(get: { !texto.isEmpty }, set: { texto = $0 ? "09:00" : "" }))
        if !texto.isEmpty {
            DatePicker(titulo, selection: Binding(get: { Self.fecha(texto) }, set: {
                let h = Self.cal.dateComponents([.hour, .minute], from: $0)
                texto = String(format: "%02d:%02d", h.hour ?? 0, h.minute ?? 0)
            }), displayedComponents: .hourAndMinute)
                .labelsHidden()
                .environment(\.timeZone, CalendarioBitacora.madrid.zona)
                .environment(\.locale, Locale(identifier: "es_ES"))
        }
    }
}
