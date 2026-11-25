import SwiftUI

// Horario semanal de Estudios (3.2): studies.schedule[«lun»…«dom»] = [{ time, subject, endTime? }], como
// renderHorarioLinea / guardarClase en js/enlaces-proyectos.js. Con hora de fin, la clase dura; sin ella es un punto
// en su hora (no se inventa duración).

struct ClaseHorario: Sendable, Identifiable, Equatable {
    let dia: String
    let indice: Int
    let hora: String
    let fin: String
    let asignatura: String
    var id: String { "\(dia):\(indice)" }
}

enum LecturaHorario {
    static let dias: [(clave: String, corto: String, nombre: String)] = [
        ("lun", "L", "lunes"), ("mar", "M", "martes"), ("mie", "X", "miércoles"), ("jue", "J", "jueves"),
        ("vie", "V", "viernes"), ("sab", "S", "sábado"), ("dom", "D", "domingo"),
    ]

    static func vista(_ doc: DocumentoBitacora) -> [String: [ClaseHorario]] {
        let sch = (((try? doc.valor(de: "studies")) ?? nil)?["schedule"]?.objeto) ?? [:]
        var r: [String: [ClaseHorario]] = [:]
        for d in dias {
            r[d.clave] = (sch[d.clave]?.lista ?? []).enumerated().compactMap { n, b in
                guard b.objeto != nil else { return nil }
                return ClaseHorario(dia: d.clave, indice: n, hora: b["time"]?.texto ?? "", fin: b["endTime"]?.texto ?? "",
                                    asignatura: b["subject"]?.texto ?? "")
            }
        }
        return r
    }

    static func clave(de dia: LocalDay) -> String { dias[dia.indiceSemanaLunes].clave }
    static func nombre(_ clave: String) -> String { dias.first { $0.clave == clave }?.nombre ?? clave }

    static func minutos(_ hhmm: String) -> Int? {
        let p = hhmm.split(separator: ":")
        guard p.count == 2, let h = Int(p[0]), let m = Int(p[1]), (0..<24).contains(h), (0..<60).contains(m) else { return nil }
        return h * 60 + m
    }

    static func hhmm(_ total: Int) -> String {
        let m = max(0, min(23 * 60 + 55, total))
        return String(format: "%02d:%02d", m / 60, m % 60)
    }

    // Duración típica de las clases de este horario (la más repetida entre las que tienen fin, o 55 min), para
    // proponer la hora de la siguiente clase al tocar el hueco de después.
    static func duracionTipica(_ h: [String: [ClaseHorario]]) -> Int {
        var cuenta: [Int: Int] = [:]
        for c in h.values.joined() {
            if let a = minutos(c.hora), let b = minutos(c.fin), b > a { cuenta[b - a, default: 0] += 1 }
        }
        return cuenta.max { $0.value < $1.value }?.key ?? 55
    }

    static func asignaturas(_ doc: DocumentoBitacora) -> [String] {
        let subj = (((try? doc.valor(de: "studies")) ?? nil)?["subjects"]?.lista ?? []).compactMap { $0["name"]?.texto }
        let delHorario = vista(doc).values.joined().map(\.asignatura)
        var vistos = Set<String>(), r: [String] = []
        for n in subj + delHorario {
            let t = n.trimmingCharacters(in: .whitespaces)
            if !t.isEmpty, vistos.insert(t.lowercased()).inserted { r.append(t) }
        }
        return r
    }
}

// Escribir el horario. Las clases no llevan id: se reconocen por día, hora y asignatura (como `clase` del conector).
// Idempotentes: reaplicar un guardado encuentra la clase ya en su sitio y no cambia nada.
enum HorarioOp {
    static let guardar = "horarioGuardarClase"
    static let quitar = "horarioQuitarClase"
    static let claves = ["studies"]

    static func opGuardar(antes: ClaseHorario?, dia: String, hora: String, fin: String, asignatura: String) -> OperacionBitacora {
        var d: [String: JSONValue] = ["dia": .string(dia), "hora": .string(hora), "fin": .string(fin), "asignatura": .string(asignatura)]
        if let antes {
            d["antes"] = .object(["dia": .string(antes.dia), "hora": .string(antes.hora), "asignatura": .string(antes.asignatura)])
        }
        return OperacionesExtra.op(guardar, d)
    }

    static func opQuitar(_ c: ClaseHorario) -> OperacionBitacora {
        OperacionesExtra.op(quitar, ["dia": .string(c.dia), "hora": .string(c.hora), "asignatura": .string(c.asignatura)])
    }

    static func aplicar(_ tipo: String, _ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        guard var st = (valores["studies"] ?? nil)?.objeto else { return valores }
        var sch = st["schedule"]?.objeto ?? [:]
        let validos = Set(LecturaHorario.dias.map(\.clave))
        func sitio(_ dia: String, _ hora: String, _ asig: String) -> Int? {
            sch[dia]?.lista?.firstIndex { ($0["time"]?.texto ?? "") == hora && ($0["subject"]?.texto ?? "") == asig }
        }
        switch tipo {
        case guardar:
            let asig = String((d["asignatura"]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(80))
            guard let dia = d["dia"]?.texto, validos.contains(dia), !asig.isEmpty else { return valores }
            let hora = d["hora"]?.texto ?? "", fin = d["fin"]?.texto ?? ""
            guard hora.isEmpty || LecturaHorario.minutos(hora) != nil,
                  fin.isEmpty || (LecturaHorario.minutos(fin) != nil && !hora.isEmpty && fin > hora) else { return valores }
            var bloque: [String: JSONValue] = [:]
            if let a = d["antes"]?.objeto, let ad = a["dia"]?.texto,
               let n = sitio(ad, a["hora"]?.texto ?? "", a["asignatura"]?.texto ?? ""), var lista = sch[ad]?.lista {
                bloque = lista.remove(at: n).objeto ?? [:]
                sch[ad] = .array(lista)
            } else if let n = sitio(dia, hora, asig), var lista = sch[dia]?.lista, var b = lista[n].objeto {
                if fin.isEmpty { b.removeValue(forKey: "endTime") } else { b["endTime"] = .string(fin) }
                lista[n] = .object(b)
                sch[dia] = .array(lista)
                st["schedule"] = .object(sch)
                var r = valores
                r["studies"] = .some(.object(st))
                return r
            }
            bloque["time"] = .string(hora)
            bloque["subject"] = .string(asig)
            if fin.isEmpty { bloque.removeValue(forKey: "endTime") } else { bloque["endTime"] = .string(fin) }
            var lista = sch[dia]?.lista ?? []
            let pos = lista.firstIndex { ($0["time"]?.texto ?? "") > hora } ?? lista.count
            lista.insert(.object(bloque), at: pos)
            sch[dia] = .array(lista)
        case quitar:
            guard let dia = d["dia"]?.texto, let n = sitio(dia, d["hora"]?.texto ?? "", d["asignatura"]?.texto ?? ""),
                  var lista = sch[dia]?.lista else { return valores }
            lista.remove(at: n)
            sch[dia] = .array(lista)
        default:
            return valores
        }
        st["schedule"] = .object(sch)
        var r = valores
        r["studies"] = .some(.object(st))
        return r
    }
}

// Color de las fechas en las listas de Estudios: el azul de estudio, aclarado. Candidato a `Lienzo.Punto.estudioSuave`.
enum TintaEstudios {
    static let fecha = Lienzo.Punto.estudio.opacity(0.8)
}

/// Título de sección en minúscula con punto («Horario.»), sin mayúsculas completas.
struct TituloEstudios: View {
    let texto: String
    var accion: (titulo: String, etiqueta: String, hacer: () -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(texto).font(Letra.seccion).foregroundStyle(Lienzo.tinta)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            if let accion {
                Button(accion.titulo, action: accion.hacer)
                    .font(Letra.pieFuerte).estiloEnlace()
                    .frame(minHeight: Medida.toque)
                    .contentShape(Rectangle())
                    .buttonStyle(.pulsable(0.94))
                    .accessibilityLabel(accion.etiqueta)
            }
        }
        .padding(.horizontal, Medida.xxs)
    }
}

// MARK: - Tarjeta del horario

/// Qué se edita: una clase existente o una nueva en un día y a una hora.
struct ClaseEditando: Identifiable {
    let id = UUID()
    let clase: ClaseHorario?
    let dia: String
    let hora: String
}

struct TarjetaHorario: View {
    let horario: [String: [ClaseHorario]]
    @Binding var dia: String
    let hoy: String
    let ahora: Int
    let editar: (ClaseEditando) -> Void
    let quitar: (ClaseHorario) -> Void
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    init(horario: [String: [ClaseHorario]], dia: Binding<String>, hoy: String, ahora: Int,
         editar: @escaping (ClaseEditando) -> Void, quitar: @escaping (ClaseHorario) -> Void) {
        self.horario = horario
        self._dia = dia
        self.hoy = hoy
        self.ahora = ahora
        self.editar = editar
        self.quitar = quitar
    }

    private var clases: [ClaseHorario] {
        (horario[dia] ?? []).sorted { ($0.hora.isEmpty ? "99" : $0.hora, $0.indice) < ($1.hora.isEmpty ? "99" : $1.hora, $1.indice) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            selectorDias
            let lista = clases
            if lista.isEmpty {
                Button {
                    editar(ClaseEditando(clase: nil, dia: dia, hora: ""))
                } label: {
                    HStack(spacing: Medida.s) {
                        Image(systemName: "plus").font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
                            .frame(width: Medida.iconoPequeno, height: Medida.iconoPequeno)
                            .background(Lienzo.sutil, in: RoundedRectangle(cornerRadius: Medida.radioIcono, style: .continuous))
                        Text("sin clases el \(LecturaHorario.nombre(dia)). toca para añadir una.")
                            .font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: Medida.toque)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.pulsable(0.98))
                .accessibilityLabel("sin clases el \(LecturaHorario.nombre(dia)). añadir una clase.")
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(lista.enumerated()), id: \.element.id) { n, c in
                        fila(c)
                        if let h = hueco(tras: c, siguiente: n + 1 < lista.count ? lista[n + 1] : nil) {
                            botonHueco(h)
                        }
                    }
                }
            }
        }
        .tarjeta(relleno: Medida.s)
        .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: dia)
    }

    private var selectorDias: some View {
        HStack(spacing: Medida.xxs) {
            ForEach(LecturaHorario.dias.indices, id: \.self) { k in
                let d = LecturaHorario.dias[k]
                let elegido = d.clave == dia
                let n = horario[d.clave]?.count ?? 0
                Button {
                    guard !elegido else { return }
                    Haptica.ligera()
                    dia = d.clave
                } label: {
                    VStack(spacing: 3) {
                        Text(d.corto).font(Letra.pestana)
                            .foregroundStyle(elegido ? Lienzo.sobreOscuro : (d.clave == hoy ? Lienzo.naranjaProfundo : Lienzo.tinta))
                        Circle().fill(n > 0 ? (elegido ? Lienzo.sobreOscuro : Lienzo.Punto.estudio) : Color.clear)
                            .frame(width: 4, height: 4)
                    }
                    .frame(maxWidth: .infinity, minHeight: Medida.toque)
                    .background(elegido ? Lienzo.oscuro : Color.clear,
                                in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(Pulsable(escala: 0.92, haptica: false))
                .accessibilityLabel("\(d.nombre)\(d.clave == hoy ? ", hoy" : ""), \(n == 1 ? "1 clase" : "\(n) clases")")
                .accessibilityAddTraits(elegido ? .isSelected : [])
            }
        }
    }

    private func enCurso(_ c: ClaseHorario) -> Bool {
        guard dia == hoy, let a = LecturaHorario.minutos(c.hora) else { return false }
        let b = LecturaHorario.minutos(c.fin) ?? a + 1
        return a <= ahora && ahora < b
    }

    private func fila(_ c: ClaseHorario) -> some View {
        let curso = enCurso(c)
        let cuando = c.hora.isEmpty ? "sin hora" : (c.fin.isEmpty ? "a las \(c.hora)" : "de \(c.hora) a \(c.fin)")
        return Button {
            editar(ClaseEditando(clase: c, dia: c.dia, hora: c.hora))
        } label: {
            HStack(alignment: .center, spacing: Medida.s) {
                VStack(alignment: .trailing, spacing: 0) {
                    Text(c.hora.isEmpty ? "—" : c.hora).font(Letra.hora).foregroundStyle(curso ? Lienzo.naranjaProfundo : Lienzo.tinta)
                    if !c.fin.isEmpty { Text(c.fin).font(Letra.hora).foregroundStyle(Lienzo.tintaSecundaria) }
                }
                .frame(width: 44, alignment: .trailing)
                Capsule()
                    .fill(curso ? Lienzo.naranja : Lienzo.Punto.estudio)
                    .frame(width: 4, height: c.fin.isEmpty ? 8 : 30)
                VStack(alignment: .leading, spacing: 1) {
                    Text(c.asignatura.isEmpty ? "clase." : c.asignatura).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    if curso { Text("ahora.").font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta) }
                }
                Spacer(minLength: Medida.xs)
                Image(systemName: "chevron.right").font(Letra.pie).foregroundStyle(Lienzo.tintaTerciaria)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: Medida.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pulsable(0.98))
        .contextMenu {
            Button("editar.") { editar(ClaseEditando(clase: c, dia: c.dia, hora: c.hora)) }
            Button("borrar.", role: .destructive) { quitar(c) }
        }
        .accessibilityLabel("\(c.asignatura.isEmpty ? "clase" : c.asignatura), \(cuando)\(curso ? ", ahora" : "")")
        .accessibilityHint("abre la clase para cambiarla.")
        .accessibilityAction(named: "borrar") { quitar(c) }
    }

    // Tras cada clase con hora, un hueco que propone la siguiente: si hay otra después, solo cuando queda sitio entre
    // las dos (con su hora de fin), y siempre tras la última.
    private func hueco(tras c: ClaseHorario, siguiente: ClaseHorario?) -> String? {
        guard let a = LecturaHorario.minutos(c.hora) else { return nil }
        let fin = LecturaHorario.minutos(c.fin) ?? a + LecturaHorario.duracionTipica(horario)
        guard fin < 23 * 60 + 55 else { return nil }
        if let s = siguiente {
            guard !c.fin.isEmpty, let b = LecturaHorario.minutos(s.hora), b - fin >= 15 else { return nil }
        }
        return LecturaHorario.hhmm(fin)
    }

    private func botonHueco(_ hora: String) -> some View {
        Button {
            editar(ClaseEditando(clase: nil, dia: dia, hora: hora))
        } label: {
            HStack(spacing: Medida.s) {
                Text(hora).font(Letra.hora).foregroundStyle(Lienzo.tintaTerciaria)
                    .frame(width: 44, alignment: .trailing)
                RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous)
                    .strokeBorder(Lienzo.filoFuerte, style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    .frame(height: 30)
                    .overlay(alignment: .leading) {
                        Text("+ clase a esta hora.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                            .padding(.horizontal, Medida.s)
                    }
            }
            .frame(minHeight: Medida.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pulsable(0.98))
        .accessibilityLabel("añadir una clase el \(LecturaHorario.nombre(dia)) a las \(hora).")
    }
}

/// Estado vacío del horario: qué es y cómo se empieza.
struct HorarioVacio: View {
    let empezar: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            Text("aún no tienes horario.").font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta)
            VStack(alignment: .leading, spacing: Medida.xxs) {
                paso("1", "elige el día y la hora a la que empieza la clase.")
                paso("2", "escribe la asignatura (o toca una de las tuyas).")
                paso("3", "la hora de fin es opcional; después, toca el hueco de debajo para la siguiente.")
            }
            Button("+ primera clase.", action: empezar)
                .buttonStyle(.capsula(.naranja))
                .padding(.top, Medida.xxs)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjeta()
    }

    private func paso(_ n: String, _ texto: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Medida.xs) {
            Text(n).font(Letra.pieFuerte).foregroundStyle(Lienzo.Punto.estudio).monospacedDigit()
            Text(texto).font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Editor de una clase

struct EditorClaseView: View {
    let editando: ClaseEditando
    let asignaturas: [String]
    let alFallar: (String?) -> Void
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    @State private var asignatura = ""
    @State private var dia = "lun"
    @State private var inicio = Date()
    @State private var conFin = false
    @State private var fin = Date()
    @State private var guardando = false
    @State private var confirmarBorrado = false
    @State private var listo = false

    init(editando: ClaseEditando, asignaturas: [String], alFallar: @escaping (String?) -> Void) {
        self.editando = editando
        self.asignaturas = asignaturas
        self.alFallar = alFallar
    }

    private var horaInicio: String { Self.texto(inicio) }
    private var horaFin: String { Self.texto(fin) }
    private var finValido: Bool { !conFin || horaFin > horaInicio }
    private var sugerencias: [String] {
        let t = asignatura.trimmingCharacters(in: .whitespaces).lowercased()
        return asignaturas.filter { t.isEmpty || ($0.lowercased().contains(t) && $0.lowercased() != t) }.prefix(8).map { $0 }
    }

    var body: some View {
        NavigationStack {
            FormCasa {
                Section {
                    TextField("asignatura o clase.", text: $asignatura)
                        .textInputAutocapitalization(.sentences)
                    if !sugerencias.isEmpty {
                        ScrollView(.horizontal) {
                            HStack(spacing: 6) {
                                ForEach(sugerencias, id: \.self) { s in
                                    Button { Haptica.seleccion(); asignatura = s } label: {
                                        Chip(texto: s, tono: .sutil).frame(minHeight: Medida.toque).contentShape(Rectangle())
                                    }
                                    .buttonStyle(Pulsable(escala: 0.92, haptica: false))
                                    .accessibilityLabel("usar \(s)")
                                }
                            }
                        }
                        .scrollIndicators(.hidden)
                    }
                }
                Section {
                    Picker("día.", selection: $dia) {
                        ForEach(LecturaHorario.dias.indices, id: \.self) { k in
                            Text(LecturaHorario.dias[k].nombre + ".").tag(LecturaHorario.dias[k].clave)
                        }
                    }
                    DatePicker("empieza.", selection: $inicio, displayedComponents: .hourAndMinute)
                    Toggle("con hora de fin.", isOn: $conFin)
                    if conFin {
                        DatePicker("termina.", selection: $fin, displayedComponents: .hourAndMinute)
                        if !finValido {
                            Text("tiene que terminar después de empezar.").font(Letra.pie).foregroundStyle(Lienzo.negativo)
                        }
                    }
                } footer: {
                    Text("sin hora de fin, la clase sale como un punto a su hora.").font(Letra.pie)
                }
                if editando.clase != nil {
                    Section { Button("borrar clase.", role: .destructive) { confirmarBorrado = true } }
                }
            }
            .confirmationDialog("¿borrar esta clase?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("borrar.", role: .destructive) { borrar() }
                Button("cancelar.", role: .cancel) {}
            }
            .onAppear(perform: rellenar)
            .environment(\.locale, Locale(identifier: "es_ES"))
            .navigationTitle(editando.clase == nil ? "clase nueva." : "la clase.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") { guardar() }
                        .disabled(guardando || !finValido || asignatura.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private static func texto(_ d: Date) -> String {
        let k = Calendar.current.dateComponents([.hour, .minute], from: d)
        return String(format: "%02d:%02d", k.hour ?? 0, k.minute ?? 0)
    }

    private static func fecha(_ hhmm: String) -> Date? {
        guard let m = LecturaHorario.minutos(hhmm) else { return nil }
        return Calendar.current.date(bySettingHour: m / 60, minute: m % 60, second: 0, of: Date())
    }

    private func rellenar() {
        guard !listo else { return }
        listo = true
        dia = editando.dia
        let base = editando.clase?.hora ?? editando.hora
        inicio = Self.fecha(base) ?? Self.fecha("15:00") ?? Date()
        if let cl = editando.clase {
            asignatura = cl.asignatura
            conFin = !cl.fin.isEmpty
            fin = Self.fecha(cl.fin) ?? inicio.addingTimeInterval(55 * 60)
        } else {
            fin = inicio.addingTimeInterval(55 * 60)
        }
    }

    private func guardar() {
        guardando = true
        let op = HorarioOp.opGuardar(antes: editando.clase, dia: dia, hora: horaInicio, fin: conFin ? horaFin : "",
                                     asignatura: asignatura.trimmingCharacters(in: .whitespacesAndNewlines))
        Task {
            do { try await c.encolar(op); Haptica.exito(); alFallar(nil); cerrar() }
            catch { guardando = false; alFallar("no se pudo guardar en este iPhone.") }
        }
    }

    private func borrar() {
        guard let cl = editando.clase else { return }
        Task {
            do { try await c.encolar(HorarioOp.opQuitar(cl)); alFallar(nil); cerrar() }
            catch { alFallar("no se pudo borrar en este iPhone.") }
        }
    }
}
