import SwiftUI

struct ItemEstudio: Sendable, Identifiable, Equatable {
    let id: String
    let lista: String
    let titulo: String
    let fecha: String
    let hora: String
    let estado: String
    let hecho: Bool
    var nota = ""
    var peso = ""
    var esTrabajo: Bool { lista == "assignments" }
}

struct AsignaturaVista: Sendable, Identifiable, Equatable {
    let id: String
    let nombre: String
    let pendientes: [ItemEstudio]
    let pasados: [ItemEstudio]
}

// studies.subjects[] con estadoItemAsignatura de la web (CONTRATO-ESTUDIOS-PROYECTOS.md).
enum LecturaEstudios {
    static func vista(_ doc: DocumentoBitacora, hoy: String = CalendarioBitacora.madrid.dia(de: Date()).iso) -> [AsignaturaVista] {
        (((try? doc.valor(de: "studies")) ?? nil)?["subjects"]?.lista ?? []).compactMap { s in
            guard let id = s["id"]?.comoId else { return nil }
            var pend: [ItemEstudio] = [], pas: [ItemEstudio] = []
            for k in ["exams", "assignments"] {
                for x in s[k]?.lista ?? [] {
                    guard let iid = x["id"]?.comoId else { continue }
                    let fecha = x["date"]?.texto ?? "", hecho = x["done"]?.booleano == true
                    let nota: String? = {
                        switch x["grade"] {
                        case .number(let n)?: return n
                        case .string(let t)? where !t.isEmpty && Double(t.replacingOccurrences(of: ",", with: ".")) != nil: return t
                        default: return nil
                        }
                    }()
                    let estado: String
                    if let nota { estado = "calificado, \(nota)." }
                    else if k == "assignments" && hecho { estado = "entregado." }
                    else if !fecha.isEmpty && fecha < hoy { estado = k == "assignments" ? "vencido." : "hecho, sin nota." }
                    else { estado = "pendiente." }
                    let item = ItemEstudio(id: iid, lista: k, titulo: x["title"]?.texto.flatMap { $0.isEmpty ? nil : $0 } ?? "sin título",
                                           fecha: fecha, hora: x["time"]?.texto ?? "", estado: estado, hecho: hecho, nota: nota ?? "",
                                           peso: { () -> String in switch x["weight"] { case .number(let n)?: return n; case .string(let t)?: return t; default: return "" } }())
                    if estado == "pendiente." || estado == "vencido." { pend.append(item) } else { pas.append(item) }
                }
            }
            let orden = { (a: ItemEstudio, b: ItemEstudio) in (a.fecha.isEmpty ? "9" : a.fecha) + a.hora < (b.fecha.isEmpty ? "9" : b.fecha) + b.hora }
            return AsignaturaVista(id: id, nombre: s["name"]?.texto ?? "asignatura", pendientes: pend.sorted(by: orden),
                                   pasados: Array(pas.sorted(by: orden).reversed()))
        }
    }
}

// Lo que pinta Estudios, leído de una vez.
struct DatosEstudios: Sendable {
    let asignaturas: [AsignaturaVista]
    let horario: [String: [ClaseHorario]]
    let nombres: [String]
}

// Lo pendiente de todas las asignaturas, para la pestaña «próximo.» (solo presentación).
struct ProximoEstudio: Identifiable, Equatable {
    let item: ItemEstudio
    let asignaturaId: String
    let asignatura: String
    let dias: Int?
    var id: String { asignaturaId + ":" + item.lista + ":" + item.id }
}

struct EstudiosView: View {
    enum Pestana: Hashable { case proximo, asignaturas }

    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var asignaturas: [AsignaturaVista]?
    @State private var aviso: String?
    @State private var creando: NuevaEntrega?
    @State private var editando: ItemEditando?
    @State private var pestana: Pestana = .proximo
    @State private var hechasAbiertas: Set<String> = []
    @State private var horario: [String: [ClaseHorario]] = [:]
    @State private var nombres: [String] = []
    @State private var diaHorario = LecturaHorario.clave(de: CalendarioBitacora.madrid.dia(de: Date()))
    @State private var diaElegido = false
    @State private var clase: ClaseEditando?
    // Asignaturas recogidas (ids separados por comas): se recuerda entre aperturas.
    @AppStorage("bitacora-estudios-plegadas") private var plegadasTexto = ""

    private var hoy: String { CalendarioBitacora.madrid.dia(de: Date()).iso }

    var body: some View {
        let lista = asignaturas ?? []
        let proximos = proximosOrdenados(lista)
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "estudios.", subtitulo: asignaturas == nil ? nil : subtitulo(proximos))
                    .padding(.top, Medida.xs)
                if let aviso {
                    Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.negativo)
                        .transition(.opacity)
                }
                if asignaturas != nil { seccionHorario }
                if asignaturas != nil && lista.isEmpty {
                    TarjetaInvitacion(frase: "aún no hay asignaturas.", destacado: "se crean en la web.", boton: "abrir la web.") {
                        c.web = Apartados.webURL("studies")
                    }
                    .padding(.top, Medida.s)
                } else if !lista.isEmpty {
                    SegmentoCapsula(opciones: [.init(valor: Pestana.proximo, titulo: "próximo"),
                                               .init(valor: Pestana.asignaturas, titulo: "asignaturas")],
                                    elegido: $pestana, sobreBlanco: false)
                        .padding(.bottom, Medida.xxs)
                    Group {
                        switch pestana {
                        case .proximo: proximo(proximos)
                        case .asignaturas: asignaturasLista(lista)
                        }
                    }
                    .transition(.opacity)
                    accesosWeb
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: pestana)
        }
        .font(Letra.cuerpo)
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .refreshable { await c.sincronizar() }
        .hoja(item: $creando) { n in EditorEntregaView(nueva: n) { aviso = $0 } }
        .hoja(item: $editando) { e in EditorEntregaView(nueva: e.nueva, existente: e.item) { aviso = $0 } }
        .hoja(item: $clase) { e in EditorClaseView(editando: e, asignaturas: nombres) { aviso = $0 } }
        .task(id: c.revision) {
            let doc = await c.documentoVisible()
            guard let nuevo = await ultimaGana({ doc.map { d in
                DatosEstudios(asignaturas: LecturaEstudios.vista(d), horario: LecturaHorario.vista(d), nombres: LecturaHorario.asignaturas(d))
            } }) else { return }
            asignaturas = nuevo?.asignaturas
            horario = nuevo?.horario ?? [:]
            nombres = nuevo?.nombres ?? []
            elegirDiaInicial()
        }
    }

    // MARK: - Horario

    private var hayHorario: Bool { horario.values.contains { !$0.isEmpty } }

    @ViewBuilder private var seccionHorario: some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            TituloEstudios(texto: "Horario.", accion: accionHorario)
            if hayHorario {
                TimelineView(.everyMinute) { ctx in
                    TarjetaHorario(horario: horario, dia: $diaHorario,
                                   hoy: LecturaHorario.clave(de: CalendarioBitacora.madrid.dia(de: ctx.date)),
                                   ahora: minutosMadrid(ctx.date),
                                   editar: { clase = $0 }, quitar: quitarClase)
                }
            } else {
                HorarioVacio { clase = ClaseEditando(clase: nil, dia: diaHorario == "sab" || diaHorario == "dom" ? "lun" : diaHorario, hora: "") }
            }
        }
    }

    private var accionHorario: (titulo: String, etiqueta: String, hacer: () -> Void)? {
        guard hayHorario else { return nil }
        let dia = diaHorario
        return (titulo: "+ clase.", etiqueta: "añadir una clase", hacer: { clase = ClaseEditando(clase: nil, dia: dia, hora: "") })
    }

    private func minutosMadrid(_ d: Date) -> Int {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let k = cal.dateComponents([.hour, .minute], from: d)
        return (k.hour ?? 0) * 60 + (k.minute ?? 0)
    }

    // Al abrir: hoy, o el siguiente día con clases si hoy no hay (el fin de semana enseña el lunes).
    private func elegirDiaInicial() {
        guard !diaElegido, hayHorario else { return }
        diaElegido = true
        let hoy = CalendarioBitacora.madrid.dia(de: Date())
        for n in 0..<7 {
            let k = LecturaHorario.clave(de: hoy.sumando(dias: n))
            if !(horario[k] ?? []).isEmpty { diaHorario = k; return }
        }
    }

    private func quitarClase(_ cl: ClaseHorario) {
        Haptica.media()
        Task {
            do { try await c.encolar(HorarioOp.opQuitar(cl)); aviso = nil }
            catch { aviso = "no se pudo borrar en este iPhone." }
        }
    }

    // MARK: - Próximo

    private func proximosOrdenados(_ lista: [AsignaturaVista]) -> [ProximoEstudio] {
        let h = hoy
        return lista.flatMap { s in
            s.pendientes.map { i in
                ProximoEstudio(item: i, asignaturaId: s.id, asignatura: s.nombre,
                               dias: i.fecha.isEmpty ? nil : CuentaEstudios.dias(hasta: i.fecha, hoy: h))
            }
        }
        .sorted { a, b in
            (a.item.fecha.isEmpty ? "9" : a.item.fecha) + a.item.hora < (b.item.fecha.isEmpty ? "9" : b.item.fecha) + b.item.hora
        }
    }

    private func subtitulo(_ p: [ProximoEstudio]) -> String {
        let examenes = p.filter { x in !x.item.esTrabajo && (x.dias.map { (0...6).contains($0) } ?? false) }.count
        if examenes == 1 { return "1 examen esta semana." }
        if examenes > 1 { return "\(examenes) exámenes esta semana." }
        return p.isEmpty ? "todo al día." : "\(p.count) por hacer."
    }

    @ViewBuilder private func proximo(_ p: [ProximoEstudio]) -> some View {
        let vencidos = p.filter { ($0.dias ?? 0) < 0 }
        let futuros = p.filter { ($0.dias ?? -1) >= 0 }
        let sinFecha = p.filter { $0.dias == nil }
        VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
            if let primero = futuros.first {
                destacado(primero).entradaEscalonada(0)
            } else if p.isEmpty {
                TarjetaInvitacion(frase: "nada pendiente.", destacado: "todo al día.")
            }
            if futuros.count > 1 {
                TituloEstudios(texto: "Después.").padding(.top, Medida.xs)
                ForEach(Array(futuros.dropFirst().enumerated()), id: \.element.id) { i, x in
                    tarjetaItem(x).entradaEscalonada(i + 1)
                }
            }
            if !vencidos.isEmpty {
                TituloEstudios(texto: "Vencido.").padding(.top, Medida.xs)
                ForEach(vencidos) { x in tarjetaItem(x) }
            }
            if !sinFecha.isEmpty {
                TituloEstudios(texto: "Sin fecha.").padding(.top, Medida.xs)
                ForEach(sinFecha) { x in tarjetaItem(x) }
            }
        }
    }

    private func destacado(_ x: ProximoEstudio) -> some View {
        let i = x.item
        let cuenta = x.dias.map { CuentaAtras.texto(dias: $0) } ?? "sin fecha."
        let cerca = (x.dias ?? 99) <= 3
        return TarjetaOscura {
            VStack(alignment: .leading, spacing: Medida.s) {
                HStack(spacing: Medida.xs) {
                    IconoCuadrado(id: "estudios", tono: .translucido, tamano: Medida.iconoPequeno)
                    Text(i.esTrabajo ? "ENTREGA" : "EXAMEN").font(Letra.etiqueta).tracking(Letra.espaciado)
                        .foregroundStyle(Lienzo.sobreOscuroSuave)
                    Spacer()
                    if cerca { Puntito(color: Lienzo.naranja, tamano: 7) }
                }
                Text(cuenta)
                    .font(Letra.numeroGrande).foregroundStyle(Lienzo.sobreOscuro)
                    .contentTransition(.numericText())
                VStack(alignment: .leading, spacing: 2) {
                    Text(i.titulo).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.sobreOscuro).lineLimit(2)
                    Text(detalle(x, conAsignatura: true)).font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave).lineLimit(1)
                }
                HStack(spacing: Medida.xs) {
                    if i.esTrabajo {
                        Button("marcar entregado.") {
                            Haptica.exito()
                            marcar(i, asignatura: x.asignaturaId)
                        }
                        .buttonStyle(.capsula(.naranja))
                    }
                    Button("abrir.") { abrir(x) }.buttonStyle(.capsula(.blanco))
                }
                .padding(.top, Medida.xxs)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func tarjetaItem(_ x: ProximoEstudio) -> some View {
        let i = x.item
        return HStack(spacing: Medida.xs) {
            if i.esTrabajo {
                CasillaMarcar(hecha: i.hecho) { marcar(i, asignatura: x.asignaturaId) }
            } else {
                IconoCuadrado(id: "estudios", tono: .claro)
                    .frame(width: Medida.toque, height: Medida.toque)
            }
            Button { abrir(x) } label: {
                HStack(spacing: Medida.s) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(i.titulo).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).lineLimit(2)
                            .multilineTextAlignment(.leading)
                        Text(detalle(x, conAsignatura: true)).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                    }
                    Spacer(minLength: Medida.xs)
                    if let d = x.dias { Chip(texto: CuentaAtras.chip(dias: d), tono: d <= 3 ? .naranja : .sutil) }
                }
                .frame(minHeight: Medida.toque)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pulsable(0.98))
        }
        .tarjeta(relleno: Medida.s)
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: i.esTrabajo ? (i.hecho ? "marcar sin entregar" : "marcar entregado") : "abrir") {
            if i.esTrabajo { marcar(i, asignatura: x.asignaturaId) } else { abrir(x) }
        }
    }

    private func detalle(_ x: ProximoEstudio, conAsignatura: Bool) -> String {
        let i = x.item
        var partes = [i.esTrabajo ? "trabajo" : "examen"]
        if conAsignatura { partes.append(x.asignatura.lowercased()) }
        if !i.fecha.isEmpty { partes.append(CuentaEstudios.fechaCorta(i.fecha)) }
        if !i.hora.isEmpty { partes.append(i.hora) }
        return partes.joined(separator: ", ") + "."
    }

    // MARK: - Asignaturas

    private func asignaturasLista(_ lista: [AsignaturaVista]) -> some View {
        ForEach(Array(lista.enumerated()), id: \.element.id) { n, s in
            tarjetaAsignatura(s).entradaEscalonada(n)
        }
    }

    private func tarjetaAsignatura(_ s: AsignaturaVista) -> some View {
        let total = s.pendientes.count + s.pasados.count
        let media = CuentaEstudios.media(s.pasados + s.pendientes)
        let abierta = Binding<Bool>(get: { hechasAbiertas.contains(s.id) },
                                    set: { v in if v { hechasAbiertas.insert(s.id) } else { hechasAbiertas.remove(s.id) } })
        let partes: [String] = [s.pendientes.isEmpty ? "al día" : "\(s.pendientes.count) pendientes", media.map { "media \($0)" }].compactMap { $0 }
        let resumen = partes.joined(separator: ", ") + "."
        let plegada = plegadas.contains(s.id)
        let nombre = s.nombre.hasSuffix(".") ? s.nombre.lowercased() : s.nombre.lowercased() + "."
        return VStack(alignment: .leading, spacing: Medida.s) {
            Button {
                Haptica.ligera()
                withAnimation(Muelle.o(Muelle.expandir, reducido: sinMovimiento)) { plegar(s.id, !plegada) }
            } label: {
                HStack(spacing: Medida.s) {
                    InicialCuadrada(nombre: s.nombre, oscuro: !s.pendientes.isEmpty)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(nombre).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta).lineLimit(1)
                        Text(resumen).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    }
                    Spacer(minLength: Medida.xs)
                    if let media { Text(media).font(Letra.numero).foregroundStyle(Lienzo.tinta) }
                    Image(systemName: "chevron.down").font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaTerciaria)
                        .rotationEffect(.degrees(plegada ? -90 : 0))
                        .accessibilityHidden(true)
                }
                .frame(minHeight: Medida.toque)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pulsable(0.98))
            .accessibilityElement(children: .combine)
            .accessibilityValue(plegada ? "recogida" : "abierta")
            .accessibilityHint(plegada ? "toca para ver sus tareas." : "toca para recoger sus tareas.")
            if total > 0 {
                BarraFina(valor: Double(s.pasados.count) / Double(total), color: Lienzo.tinta, alto: Medida.barraFina)
            }
            if !plegada {
                contenidoAsignatura(s, abierta: abierta)
                    .transition(.opacity.combined(with: .offset(y: -6)))
            }
        }
        .tarjeta()
    }

    private var plegadas: Set<String> { Set(plegadasTexto.split(separator: ",").map(String.init)) }

    private func plegar(_ id: String, _ si: Bool) {
        var p = plegadas
        if si { p.insert(id) } else { p.remove(id) }
        plegadasTexto = p.sorted().joined(separator: ",")
    }

    private func contenidoAsignatura(_ s: AsignaturaVista, abierta: Binding<Bool>) -> some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            if !s.pendientes.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(s.pendientes.enumerated()), id: \.element.id) { k, i in
                        if k > 0 { SeparadorFila(sangria: Medida.toque) }
                        filaAsignatura(i, asignatura: s)
                    }
                }
            }
            if !s.pasados.isEmpty {
                SeccionPlegable(titulo: "hecho.", detalle: "\(s.pasados.count)", abierta: abierta) {
                    VStack(spacing: 0) {
                        ForEach(s.pasados) { i in filaAsignatura(i, asignatura: s) }
                    }
                }
            }
            HStack(spacing: Medida.xs) {
                Button("+ trabajo.") { creando = NuevaEntrega(asignaturaId: s.id, lista: "assignments") }
                    .buttonStyle(.capsula(.claro))
                Button("+ examen.") { creando = NuevaEntrega(asignaturaId: s.id, lista: "exams") }
                    .buttonStyle(.capsula(.claro))
            }
        }
    }

    private func filaAsignatura(_ i: ItemEstudio, asignatura s: AsignaturaVista) -> some View {
        let x = ProximoEstudio(item: i, asignaturaId: s.id, asignatura: s.nombre,
                               dias: i.fecha.isEmpty ? nil : CuentaEstudios.dias(hasta: i.fecha, hoy: hoy))
        let pasado = i.estado != "pendiente." && i.estado != "vencido."
        return HStack(spacing: Medida.xxs) {
            if i.esTrabajo {
                CasillaMarcar(hecha: i.hecho) { marcar(i, asignatura: s.id) }
            } else {
                IconoCuadrado(id: "estudios", tono: .claro, tamano: Medida.iconoPequeno)
                    .frame(width: Medida.toque, height: Medida.toque)
            }
            Button { abrir(x) } label: {
                HStack(spacing: Medida.xs) {
                    VStack(alignment: .leading, spacing: 2) {
                        (Text(i.titulo).foregroundStyle(pasado ? Lienzo.tintaSecundaria : Lienzo.tinta)
                            + Text(i.fecha.isEmpty ? "" : " (\(CuentaEstudios.fechaCorta(i.fecha)))").foregroundStyle(TintaEstudios.fecha))
                            .font(Letra.cuerpo)
                            .strikethrough(i.hecho, color: Lienzo.tintaTerciaria)
                            .lineLimit(2).multilineTextAlignment(.leading)
                        Text(pasado ? i.estado : detalleFila(i))
                            .font(Letra.pie).foregroundStyle(i.estado == "vencido." ? Lienzo.naranjaProfundo : Lienzo.tintaSecundaria)
                            .lineLimit(1)
                    }
                    Spacer(minLength: Medida.xs)
                    if !pasado, let d = x.dias { Chip(texto: CuentaAtras.chip(dias: d), tono: d <= 3 ? .naranja : .sutil) }
                    if !i.nota.isEmpty { Text(i.nota).font(Letra.numero).foregroundStyle(Lienzo.tinta) }
                }
                .frame(minHeight: Medida.toque)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pulsable(0.98))
        }
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: i.esTrabajo ? (i.hecho ? "marcar sin entregar" : "marcar entregado") : "abrir") {
            if i.esTrabajo { marcar(i, asignatura: s.id) } else { abrir(x) }
        }
    }

    // En la lista de una asignatura la fecha ya va entre paréntesis junto al título.
    private func detalleFila(_ i: ItemEstudio) -> String {
        (i.esTrabajo ? "trabajo" : "examen") + (i.hora.isEmpty ? "" : ", a las \(i.hora)") + (i.estado == "vencido." ? ", vencido." : ".")
    }

    // MARK: - Web

    private var accesosWeb: some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            TituloEstudios(texto: "En la web.").padding(.top, Medida.m)
            VStack(spacing: 0) {
                Button { c.web = Apartados.webURL("estudiar") } label: {
                    FilaTarjeta(icono: "estudios", titulo: "repaso.", detalle: "tarjetas, tests y pomodoro.") { FlechaFila() }
                }
                .buttonStyle(.pulsable(0.98))
                SeparadorFila()
                Button { c.web = Apartados.webURL("universidad") } label: {
                    FilaTarjeta(icono: "estudios", titulo: "carrera.", detalle: "cuatrimestres, créditos y notas.") { FlechaFila() }
                }
                .buttonStyle(.pulsable(0.98))
            }
            .tarjeta(relleno: Medida.s)
        }
    }

    // MARK: - Acciones

    private func abrir(_ x: ProximoEstudio) {
        editando = ItemEditando(NuevaEntrega(asignaturaId: x.asignaturaId, lista: x.item.lista, idFijo: x.item.id), x.item)
    }

    private func marcar(_ i: ItemEstudio, asignatura: String) {
        Task {
            do {
                try await c.encolar(.marcarTrabajo(asignaturaId: asignatura, id: i.id, hecho: !i.hecho, momentoMs: Int64(Date().timeIntervalSince1970 * 1000)))
                aviso = nil
            } catch { aviso = "no se pudo guardar en este iPhone." }
        }
    }
}


struct NuevaEntrega: Identifiable, Equatable {
    let id: String
    let asignaturaId: String
    let lista: String
    init(asignaturaId: String, lista: String, idFijo: String? = nil) {
        id = idFijo ?? OperacionBitacora.nuevoIdItem()
        self.asignaturaId = asignaturaId
        self.lista = lista
    }
}

struct ItemEditando: Identifiable {
    let nueva: NuevaEntrega
    let item: ItemEstudio
    init(_ n: NuevaEntrega, _ i: ItemEstudio) { nueva = n; item = i }
    var id: String { nueva.id }
}

struct EditorEntregaView: View {
    let nueva: NuevaEntrega
    var existente: ItemEstudio?
    let alFallar: (String?) -> Void
    @State private var nota = ""
    @State private var peso = ""
    @State private var confirmarBorrado = false
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    @State private var titulo = ""
    @State private var conFecha = true
    @State private var fecha = Date()
    @State private var conHora = false
    @State private var hora = Calendar.current.date(bySettingHour: 9, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var guardando = false

    var body: some View {
        NavigationStack {
            FormCasa {
                TextField(nueva.lista == "exams" ? "examen." : "trabajo.", text: $titulo)
                Toggle("con fecha.", isOn: $conFecha)
                if conFecha {
                    DatePicker("fecha.", selection: $fecha, displayedComponents: .date)
                    Toggle("con hora.", isOn: $conHora)
                    if conHora { DatePicker("hora.", selection: $hora, displayedComponents: .hourAndMinute) }
                }
                if existente != nil {
                    Section {
                        TextField("nota.", text: $nota).keyboardType(.decimalPad)
                        TextField("peso en la media (%).", text: $peso).keyboardType(.decimalPad)
                    }
                    Section { Button("borrar.", role: .destructive) { confirmarBorrado = true } }
                }
            }
            .confirmationDialog("¿borrar este \(nueva.lista == "exams" ? "examen" : "trabajo")?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("borrar.", role: .destructive) { borrar() }
                Button("cancelar.", role: .cancel) {}
            }
            .onAppear(perform: rellenar)
            .environment(\.locale, Locale(identifier: "es_ES"))
            .navigationTitle(existente != nil ? (nueva.lista == "exams" ? "examen." : "trabajo.") : nueva.lista == "exams" ? "nuevo examen." : "nuevo trabajo.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") { guardar() }.disabled(guardando || titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func rellenar() {
        guard let e = existente, titulo.isEmpty else { return }
        titulo = e.titulo
        nota = e.nota
        peso = e.peso
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        conFecha = !e.fecha.isEmpty
        if let d = f.date(from: e.fecha) { fecha = d }
        f.dateFormat = "HH:mm"
        conHora = !e.hora.isEmpty
        if let h = f.date(from: e.hora) { hora = Calendar.current.date(bySettingHour: Calendar.current.component(.hour, from: h), minute: Calendar.current.component(.minute, from: h), second: 0, of: fecha) ?? hora }
    }

    private func borrar() {
        let op = OperacionBitacora.borrarItemEstudio(asignaturaId: nueva.asignaturaId, lista: nueva.lista, id: nueva.id)
        Task {
            do { try await c.encolar(op); alFallar(nil); cerrar() } catch { alFallar("no se pudo borrar en este iPhone.") }
        }
    }

    private func guardar() {
        guardando = true
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        let dia = conFecha ? f.string(from: fecha) : nil
        f.dateFormat = "HH:mm"
        let h = conFecha && conHora ? f.string(from: hora) : nil
        let limpio = String(titulo.trimmingCharacters(in: .whitespaces).prefix(300))
        let op = existente != nil
            ? OperacionBitacora.editarItemEstudio(asignaturaId: nueva.asignaturaId, lista: nueva.lista, id: nueva.id, titulo: limpio, fecha: dia, hora: h,
                                                  nota: nota, peso: peso)
            : OperacionBitacora.crearEntrega(asignaturaId: nueva.asignaturaId, lista: nueva.lista, id: nueva.id, titulo: limpio, fecha: dia, hora: h)
        Task {
            do { try await c.encolar(op); alFallar(nil); cerrar() } catch { guardando = false; alFallar("no se pudo guardar en este iPhone.") }
        }
    }
}
