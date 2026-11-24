import SwiftUI

// Empleo: la agenda laboral de js/agenda-laboral.js (horario por día de la semana, citas `lab_` y si salen en el
// calendario principal), el empleo actual y, desde la 0.24, las fichas de empleo y la vida laboral (FichasEmpleo.swift).
// El CV, el PDF y el importador del informe con IA siguen en la web («cv e importar vida laboral.»).

struct CitaLaboral: Sendable, Identifiable, Equatable { let id, fecha, ini, fin, titulo, tipo, lugar, notas: String }

struct VistaEmpleo: Sendable, Equatable {
    var enPrincipal: Bool
    var horario: [Int: (String, String)]
    var citas: [CitaLaboral]
    var empleo: String?
    var fichas: [FichaEmpleo] = []

    static func == (a: VistaEmpleo, b: VistaEmpleo) -> Bool {
        a.enPrincipal == b.enPrincipal && a.citas == b.citas && a.empleo == b.empleo && a.fichas == b.fichas
            && a.horario.keys.sorted() == b.horario.keys.sorted() && a.horario.allSatisfy { k, v in b.horario[k]?.0 == v.0 && b.horario[k]?.1 == v.1 }
    }
}

enum LecturaEmpleo {
    static let tipos: [(String, String)] = [("reunion", "reunión"), ("turno", "turno"), ("plazo", "plazo"), ("otro", "otro")]
    static let dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

    static func vista(_ doc: DocumentoBitacora, hoy: String) -> VistaEmpleo {
        let a = (try? doc.valor(de: "agendaLaboral")) ?? nil
        var horario: [Int: (String, String)] = [:]
        for (k, v) in a?["horario"]?.objeto ?? [:] {
            if let d = Int(k), let ini = v["ini"]?.texto, let fin = v["fin"]?.texto { horario[d] = (ini, fin) }
        }
        let citas = (a?["citas"]?.lista ?? []).compactMap { x -> CitaLaboral? in
            guard let o = x.objeto, let id = o["id"]?.comoId else { return nil }
            let s = { (k: String) in o[k]?.texto ?? "" }
            return CitaLaboral(id: id, fecha: s("fecha"), ini: s("ini"), fin: s("fin"), titulo: s("titulo"), tipo: s("tipo"), lugar: s("lugar"), notas: s("notas"))
        }.sorted { ($0.fecha, $0.ini) < ($1.fecha, $1.ini) }
        // labEmpleoActual: el primer empleo sin fecha de fin o que acaba hoy o después.
        let empleo = (((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []).compactMap(\.objeto).first {
            $0["type"]?.texto == "work" && (($0["endDate"]?.texto ?? "").isEmpty || ($0["endDate"]?.texto ?? "") >= hoy)
        }.map { o in [o["company"]?.texto ?? o["title"]?.texto ?? "", o["position"]?.texto ?? ""].filter { !$0.isEmpty }.joined(separator: ", ") }
        // laboralEnPrincipal: sin agenda o sin decir nada, sí.
        return VistaEmpleo(enPrincipal: a?["enPrincipal"]?.booleano != false, horario: horario, citas: citas, empleo: empleo,
                           fichas: LecturaFichasEmpleo.fichas(doc, hoy: hoy))
    }

    static func fecha(_ iso: String) -> Date? {
        guard let d = LocalDay(iso: iso) else { return nil }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = CalendarioBitacora.madrid.zona
        return cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))
    }

    static func nombreTipo(_ t: String) -> String { tipos.first { $0.0 == t }?.1 ?? t }

    static func nuevoId() -> String {
        let letras = "abcdefghijklmnopqrstuvwxyz0123456789"
        return "lab_\(Int64(Date().timeIntervalSince1970 * 1000))_" + String((0..<5).map { _ in letras.randomElement()! })
    }
}

private enum ModalEmpleo: Identifiable {
    case cita(CitaLaboral?)
    case horario
    case ficha(FichaEmpleo?)
    var id: String {
        switch self {
        case .cita(let c): return "cita-" + (c?.id ?? "nueva")
        case .horario: return "horario"
        case .ficha(let f): return "ficha-" + (f?.id ?? "nueva")
        }
    }
}

// Empleo 2.0: el empleo actual en negro con el horario de hoy, la semana como línea de tiempo, las citas en tarjetas con
// la hora pequeña a la izquierda y la trayectoria (fichas de empleo) en tarjetas blancas con su estado.
struct EmpleoView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaEmpleo?
    @State private var modal: ModalEmpleo?
    @State private var verPasadas = false
    @State private var citaABorrar: CitaLaboral?
    @State private var filtro = FiltroEmpleo.todos

    enum FiltroEmpleo: Hashable { case todos, actuales, anteriores }

    private var hoy: String { CalendarioBitacora.madrid.dia(de: Date()).iso }
    private var diaDeHoy: Int { TextoEmpleo.diaSemana(hoy) ?? 1 }
    private let anchoHora: CGFloat = 48

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "empleo.", subtitulo: subtitulo) {
                    BotonRedondo(sistema: "plus", tono: .oscuro, etiqueta: "nueva cita de trabajo") { modal = .cita(nil) }
                }
                .padding(.bottom, Medida.xxs)
                if let v = vista {
                    contenido(v)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, Medida.xl)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .refreshable { await c.sincronizar() }
        .task(id: c.revision) { await cargar() }
        .confirmarBorrado($citaABorrar, titulo: { "¿eliminar la cita «\($0.titulo)»?" }, boton: "eliminar.") { x in Task { await c.guardar(.borrarCitaLaboral(id: x.id)) } }
        .hoja(item: $modal) { m in
            switch m {
            case .cita(let cita): EditorCitaLaboral(cita: cita, hoy: hoy).environment(c)
            case .horario: EditorHorarioLaboral(horario: vista?.horario ?? [:]).environment(c)
            case .ficha(let f): EditorFichaEmpleo(editando: FichaEmpleoEditando(ficha: f)).environment(c)
            }
        }
    }

    private var subtitulo: String? {
        guard let v = vista else { return nil }
        let n = v.citas.filter { $0.fecha >= hoy }.count
        return n == 0 ? "nada a la vista." : n == 1 ? "1 cita por venir." : "\(n) citas por venir."
    }

    @ViewBuilder private func contenido(_ v: VistaEmpleo) -> some View {
        actual(v).entradaEscalonada(0)

        EtiquetaSeccion(texto: "semana", accion: (titulo: "cambiar.", hacer: { modal = .horario }))
            .padding(.top, Medida.s).entradaEscalonada(1)
        semana(v).entradaEscalonada(1)

        citas(v)
        trayectoria(v)

        Button("cv e importar vida laboral.") { c.web = Apartados.webURL("work") }
            .buttonStyle(.capsula(.blanco, ancho: true))
            .padding(.top, Medida.s)
    }

    // MARK: Empleo actual

    // labEmpleoActual: el primer empleo sin fin o que acaba hoy o después; con agenda, su horario de hoy.
    @ViewBuilder private func actual(_ v: VistaEmpleo) -> some View {
        if let f = v.fichas.first(where: { $0.activo(hoy: hoy) }) {
            let modalidad = LecturaFichasEmpleo.modalidades.first { $0.0 == f.modalidad && !$0.0.isEmpty }.map { String($0.1.dropLast()) } ?? ""
            let desde = TextoEmpleo.mesAnio(f.inicio)
            Button { modal = .ficha(f) } label: {
                TarjetaOscura {
                    VStack(alignment: .leading, spacing: Medida.s) {
                        HStack(spacing: Medida.s) {
                            IconoCuadrado(id: "empleo", tono: .translucido)
                            Text("EMPLEO ACTUAL").font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.sobreOscuroSuave)
                            Spacer()
                            if !modalidad.isEmpty { Text(modalidad).font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave) }
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text((f.cargo.isEmpty ? f.nombre : f.cargo).lowercased() + ".")
                                .font(Letra.titulo).foregroundStyle(Lienzo.sobreOscuro).multilineTextAlignment(.leading)
                            if !f.cargo.isEmpty {
                                Text(f.nombre.lowercased() + ".").font(Letra.detalle).foregroundStyle(Lienzo.sobreOscuroSuave)
                            }
                        }
                        if !desde.isEmpty || !v.horario.isEmpty {
                            Rectangle().fill(Lienzo.filoOscuro).frame(height: 1)
                            HStack(alignment: .top) {
                                if !desde.isEmpty {
                                    datoOscuro("DESDE", desde + ".", pie: TextoEmpleo.dias(f.dias(hoy: hoy)) + ".")
                                }
                                Spacer()
                                if !v.horario.isEmpty { horarioDeHoy(v).multilineTextAlignment(.trailing) }
                            }
                        }
                    }
                }
            }
            .buttonStyle(.pulsable(0.98))
            .accessibilityHint("abre la ficha del empleo")
        } else {
            TarjetaInvitacion(frase: v.fichas.isEmpty ? "¿dónde trabajas?" : "ahora no tienes un empleo actual.",
                              destacado: "apúntalo y verás aquí tu día.", boton: "+ empleo.") { modal = .ficha(nil) }
        }
    }

    private func datoOscuro(_ etiqueta: String, _ valor: String, pie: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(etiqueta).font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.sobreOscuroSuave)
            Text(valor).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.sobreOscuro)
            if let pie { Text(pie).font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave).monospacedDigit() }
        }
    }

    private func horarioDeHoy(_ v: VistaEmpleo) -> some View {
        let h = v.horario[diaDeHoy]
        return VStack(alignment: .trailing, spacing: 2) {
            Text("HOY").font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.sobreOscuroSuave)
            Text(h.map { "\($0.0)–\($0.1)" } ?? "libre.")
                .font(Letra.numero).foregroundStyle(h == nil ? Lienzo.sobreOscuro : Lienzo.naranja)
        }
    }

    // MARK: Semana

    @ViewBuilder private func semana(_ v: VistaEmpleo) -> some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            if v.horario.isEmpty {
                EstadoVacio(texto: "todavía no has puesto tu horario.")
                Button("poner horario.") { modal = .horario }
                    .buttonStyle(.capsula(.claro, ancho: true))
            } else {
                TimelineView(.periodic(from: .now, by: 60)) { t in
                    LineaSemanaEmpleo(horario: v.horario, hoy: diaDeHoy, ahora: TextoEmpleo.minutosAhora(t.date))
                }
            }
            SeparadorFila(sangria: 0)
            Toggle(isOn: Binding(get: { v.enPrincipal }, set: { si in Task { await c.guardar(.laboralEnPrincipal(si)) } })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("en el calendario principal.").font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                    Text("el horario y las citas salen en tu calendario.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                }
            }
            .tint(Lienzo.oscuro)
            .frame(minHeight: Medida.toque)
        }
        .tarjeta()
    }

    // MARK: Citas

    @ViewBuilder private func citas(_ v: VistaEmpleo) -> some View {
        let proximas = v.citas.filter { $0.fecha >= hoy }
        let pasadas = Array(v.citas.filter { $0.fecha < hoy }.reversed())
        EtiquetaSeccion(texto: "citas", accion: (titulo: "+ cita.", hacer: { modal = .cita(nil) }))
            .padding(.top, Medida.s).entradaEscalonada(2)
        if proximas.isEmpty {
            EstadoVacio(texto: "nada a la vista.").tarjeta(relleno: Medida.xs).entradaEscalonada(2)
        }
        ForEach(Array(proximas.enumerated()), id: \.element.id) { n, cita in
            tarjetaCita(cita, pasada: false).entradaEscalonada(n + 3)
        }
        if !pasadas.isEmpty {
            SeccionPlegable(titulo: "pasadas.", detalle: "\(pasadas.count)", abierta: $verPasadas) {
                VStack(spacing: Medida.entreTarjetas) {
                    ForEach(pasadas) { tarjetaCita($0, pasada: true) }
                }
                .padding(.top, Medida.xxs)
            }
            .padding(.horizontal, Medida.xxs)
        }
    }

    private func tarjetaCita(_ cita: CitaLaboral, pasada: Bool) -> some View {
        let titulo = (cita.titulo.isEmpty ? LecturaEmpleo.nombreTipo(cita.tipo) : cita.titulo).lowercased() + "."
        let detalle = [TextoEmpleo.cuando(cita.fecha, hoy: hoy), cita.lugar].filter { !$0.isEmpty }.joined(separator: ", ") + "."
        let esHoy = cita.fecha == hoy
        return Button { modal = .cita(cita) } label: {
            HStack(alignment: .top, spacing: Medida.s) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(cita.ini.isEmpty ? "sin hora" : cita.ini)
                        .font(Letra.hora)
                        .foregroundStyle(cita.ini.isEmpty ? Lienzo.tintaTerciaria : (esHoy ? Lienzo.naranjaProfundo : Lienzo.tinta))
                        .lineLimit(2)
                    if !cita.fin.isEmpty { Text(cita.fin).font(Letra.hora).foregroundStyle(Lienzo.tintaTerciaria) }
                }
                .frame(width: anchoHora, alignment: .leading)
                VStack(alignment: .leading, spacing: 4) {
                    Text(titulo).font(Letra.tituloTarjeta).foregroundStyle(pasada ? Lienzo.tintaSecundaria : Lienzo.tinta)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                }
                Spacer(minLength: Medida.xs)
                Chip(texto: LecturaEmpleo.nombreTipo(cita.tipo), tono: esHoy ? .naranja : .sutil)
            }
            .tarjeta()
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        }
        .buttonStyle(.pulsable(0.97))
        .contextMenu { Button("eliminar cita.", role: .destructive) { citaABorrar = cita } }
        .accessibilityElement(children: .combine)
    }

    // MARK: Trayectoria

    // renderWork: los empleos actuales y el historial, con los días de cada uno y el total.
    @ViewBuilder private func trayectoria(_ v: VistaEmpleo) -> some View {
        if !v.fichas.isEmpty {
            let total = v.fichas.reduce(0) { $0 + $1.dias(hoy: hoy) }
            let oficiales = v.fichas.filter(\.deVidaLaboral).count
            let hayActuales = v.fichas.contains { $0.activo(hoy: hoy) }
            let hayAnteriores = v.fichas.contains { !$0.activo(hoy: hoy) }
            let lista = v.fichas.filter { (f: FichaEmpleo) -> Bool in
                switch filtro {
                case .todos: return true
                case .actuales: return f.activo(hoy: hoy)
                case .anteriores: return !f.activo(hoy: hoy)
                }
            }
            EtiquetaSeccion(texto: "trayectoria", accion: (titulo: "+ empleo.", hacer: { modal = .ficha(nil) }))
                .padding(.top, Medida.s)
            Text("vida laboral, \(total) días trabajados en total" + Self.fuente(oficiales, de: v.fichas.count))
                .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                .padding(.horizontal, Medida.xxs)
            if hayActuales && hayAnteriores {
                SegmentoCapsula(opciones: [SegmentoCapsula<FiltroEmpleo>.Opcion(valor: .todos, titulo: "todos"),
                                           SegmentoCapsula<FiltroEmpleo>.Opcion(valor: .actuales, titulo: "actuales"),
                                           SegmentoCapsula<FiltroEmpleo>.Opcion(valor: .anteriores, titulo: "anteriores")],
                                elegido: $filtro, sobreBlanco: false)
            }
            VStack(spacing: Medida.entreTarjetas) {
                ForEach(Array(lista.enumerated()), id: \.element.id) { n, f in
                    tarjetaFicha(f).entradaEscalonada(n)
                }
            }
            .id(filtro)
            .transition(.opacity)
        }
    }

    static func fuente(_ oficiales: Int, de n: Int) -> String {
        if oficiales == 0 { return ", estimados." }
        if oficiales == n { return ", según tu informe." }
        return ", \(oficiales) de \(n) según tu informe."
    }

    private func tarjetaFicha(_ f: FichaEmpleo) -> some View {
        let activo = f.activo(hoy: hoy)
        let desde = TextoEmpleo.mesAnio(f.inicio)
        let hasta = activo ? "hoy" : TextoEmpleo.mesAnio(f.fin)
        let fechas = desde.isEmpty ? "" : desde + (hasta.isEmpty ? "" : " → " + hasta)
        let modalidad = LecturaFichasEmpleo.modalidades.first { $0.0 == f.modalidad && !$0.0.isEmpty }.map { String($0.1.dropLast()) } ?? ""
        let meta = [fechas, modalidad, activo ? "" : f.motivoSalida].filter { !$0.isEmpty }.joined(separator: ", ")
        return Button { modal = .ficha(f) } label: {
            HStack(alignment: .top, spacing: Medida.s) {
                IconoCuadrado(id: "empleo", tono: activo ? .oscuro : .claro)
                VStack(alignment: .leading, spacing: 2) {
                    Text(f.nombre.lowercased() + ".").font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    if !f.subtitulo.isEmpty {
                        Text(f.subtitulo).font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                    }
                    if !meta.isEmpty {
                        Text(meta).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(2).multilineTextAlignment(.leading)
                    }
                }
                Spacer(minLength: Medida.xs)
                VStack(alignment: .trailing, spacing: Medida.xxs) {
                    Chip(texto: activo ? "actual" : "terminado", tono: activo ? .oscuro : .sutil)
                    Text(TextoEmpleo.dias(f.dias(hoy: hoy)) + (f.deVidaLaboral ? ", informe" : ""))
                        .font(Letra.hora).foregroundStyle(Lienzo.tintaSecundaria)
                }
            }
            .tarjeta()
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        }
        .buttonStyle(.pulsable(0.97))
        .accessibilityElement(children: .combine)
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        let h = hoy
        guard let nuevo = await ultimaGana({ doc.map { LecturaEmpleo.vista($0, hoy: h) } }) else { return }
        vista = nuevo
    }
}

private struct EditorCitaLaboral: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let cita: CitaLaboral?
    @State private var tipo: String
    @State private var titulo: String
    @State private var fecha: Date
    @State private var conHoras: Bool
    @State private var ini: Date
    @State private var fin: Date
    @State private var lugar: String
    @State private var notas: String
    @State private var id: String
    @State private var confirmarBorrado = false

    init(cita: CitaLaboral?, hoy: String) {
        self.cita = cita
        _tipo = State(initialValue: cita?.tipo ?? "reunion"); _titulo = State(initialValue: cita?.titulo ?? "")
        _fecha = State(initialValue: LecturaEmpleo.fecha(cita?.fecha ?? hoy) ?? Date())
        _conHoras = State(initialValue: !(cita?.ini ?? "").isEmpty)
        _ini = State(initialValue: EditorCitaLaboral.hora(cita?.ini, "09:00")); _fin = State(initialValue: EditorCitaLaboral.hora(cita?.fin, "10:00"))
        _lugar = State(initialValue: cita?.lugar ?? ""); _notas = State(initialValue: cita?.notas ?? "")
        _id = State(initialValue: cita?.id ?? LecturaEmpleo.nuevoId())
    }

    private var valido: Bool { !titulo.trimmingCharacters(in: .whitespaces).isEmpty || tipo == "turno" }

    var body: some View {
        NavigationStack {
            FormEmpleo {
                Section {
                    SegmentoCapsula(opciones: LecturaEmpleo.tipos.map { SegmentoCapsula<String>.Opcion(valor: $0.0, titulo: $0.1) }, elegido: $tipo)
                    TextField(tipo == "turno" ? "qué (opcional)." : "qué.", text: $titulo)
                } header: { CabeceraFormEmpleo(texto: "cita") }
                Section {
                    DatePicker("cuándo.", selection: $fecha, displayedComponents: .date)
                    Toggle("con horas.", isOn: $conHoras.animation(Muelle.suave))
                    if conHoras {
                        DatePicker("de.", selection: $ini, displayedComponents: .hourAndMinute)
                        DatePicker("a.", selection: $fin, displayedComponents: .hourAndMinute)
                    }
                } header: { CabeceraFormEmpleo(texto: "cuándo") }
                Section {
                    TextField("dónde.", text: $lugar)
                    TextField("notas.", text: $notas, axis: .vertical).lineLimit(1...4)
                } header: { CabeceraFormEmpleo(texto: "más") }
                if cita != nil { Section { Button("eliminar cita.", role: .destructive) { confirmarBorrado = true } } }
            }
            .navigationTitle(cita == nil ? "nueva cita de trabajo." : "editar cita.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
            }
            .botonPrincipalEmpleo("guardar.", activo: valido) {
                let op = OperacionBitacora.guardarCitaLaboral(id: id, fecha: CalendarioBitacora.madrid.dia(de: fecha).iso,
                                                               ini: conHoras ? texto(ini) : "", fin: conHoras ? texto(fin) : "",
                                                               titulo: titulo.trimmingCharacters(in: .whitespacesAndNewlines), tipo: tipo,
                                                               lugar: lugar.trimmingCharacters(in: .whitespacesAndNewlines),
                                                               notas: notas.trimmingCharacters(in: .whitespacesAndNewlines))
                Task { @MainActor in if await c.guardar(op) { Haptica.exito(); cerrar() } }
            }
            .confirmationDialog("¿eliminar esta cita?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("eliminar.", role: .destructive) { Task { if await c.guardar(.borrarCitaLaboral(id: id)) { cerrar() } } }
                Button("cancelar.", role: .cancel) {}
            }
        }
    }

    private func texto(_ d: Date) -> String {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = CalendarioBitacora.madrid.zona
        let h = cal.dateComponents([.hour, .minute], from: d)
        return String(format: "%02d:%02d", h.hour ?? 0, h.minute ?? 0)
    }

    static func hora(_ texto: String?, _ porDefecto: String) -> Date {
        let t = (texto ?? "").isEmpty ? porDefecto : texto!
        let p = t.split(separator: ":").compactMap { Int($0) }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = CalendarioBitacora.madrid.zona
        return p.count >= 2 ? (cal.date(bySettingHour: p[0], minute: p[1], second: 0, of: Date()) ?? Date()) : Date()
    }
}

private struct EditorHorarioLaboral: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    @State private var activos: Set<Int>
    @State private var ini: [Int: Date]
    @State private var fin: [Int: Date]

    // openHorarioLaboral: sin horario guardado, de lunes a viernes de 9 a 17.
    init(horario: [Int: (String, String)]) {
        let base = horario.isEmpty ? Dictionary(uniqueKeysWithValues: [1, 2, 3, 4, 5].map { ($0, ("09:00", "17:00")) }) : horario
        _activos = State(initialValue: Set(base.keys))
        _ini = State(initialValue: Dictionary(uniqueKeysWithValues: (0...6).map { ($0, EditorCitaLaboral.hora(base[$0]?.0, "09:00")) }))
        _fin = State(initialValue: Dictionary(uniqueKeysWithValues: (0...6).map { ($0, EditorCitaLaboral.hora(base[$0]?.1, "17:00")) }))
    }

    var body: some View {
        NavigationStack {
            FormEmpleo {
                Section {
                    ForEach([1, 2, 3, 4, 5, 6, 0], id: \.self) { d in
                        Toggle(LecturaEmpleo.dias[d] + ".", isOn: Binding(get: { activos.contains(d) }, set: { si in
                            withAnimation(Muelle.suave) { if si { activos.insert(d) } else { activos.remove(d) } }
                        }))
                        if activos.contains(d) {
                            HStack {
                                DatePicker("entrada.", selection: Binding(get: { ini[d] ?? Date() }, set: { ini[d] = $0 }), displayedComponents: .hourAndMinute).labelsHidden()
                                Text("a").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                                DatePicker("salida.", selection: Binding(get: { fin[d] ?? Date() }, set: { fin[d] = $0 }), displayedComponents: .hourAndMinute).labelsHidden()
                            }
                        }
                    }
                } header: {
                    CabeceraFormEmpleo(texto: "días de trabajo")
                } footer: {
                    Text("los cambios puntuales (un turno distinto, una guardia) apúntalos como cita de tipo turno.").pieFormEmpleo()
                }
            }
            .navigationTitle("horario laboral.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
            }
            .botonPrincipalEmpleo("guardar.") {
                var cal = Calendar(identifier: .gregorian); cal.timeZone = CalendarioBitacora.madrid.zona
                let t = { (d: Date?) -> String in let h = cal.dateComponents([.hour, .minute], from: d ?? Date()); return String(format: "%02d:%02d", h.hour ?? 0, h.minute ?? 0) }
                let dias = Dictionary(uniqueKeysWithValues: activos.map { (String($0), t(ini[$0]) + "|" + t(fin[$0])) })
                Task { @MainActor in if await c.guardar(.horarioLaboral(dias: dias)) { Haptica.exito(); cerrar() } }
            }
        }
    }
}
