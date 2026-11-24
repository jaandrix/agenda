import SwiftUI

struct EditorEvento: Identifiable, Equatable {
    let id: String
    let nuevo: Bool
    var fecha: LocalDay
    var hora: String?
    var titulo = ""
    var lugar = ""
    var notas = ""
}

struct EditorEventoView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let inicial: EditorEvento

    @State private var titulo: String
    @State private var lugar: String
    @State private var notas: String
    @State private var fecha: Date
    @State private var conHora: Bool
    @State private var hora: Date
    // Hora de fin en `endTime`, como los eventos que la web importa de un .ics o comparte (social.js). Sin ella vale
    // «hasta las HH:MM» de las notas, lo que escribe Apuntar.
    @State private var conFin = false
    @State private var fin: Date
    @State private var finInicial: String?
    @State private var guardando = false
    @State private var confirmarBorrado = false
    @State private var descartar = false
    @State private var error: String?
    @FocusState private var enfocado: Bool
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    // Tipo de ocio explícito (ValorarOcio): con él, Bitácora crea «valorar …» tres horas después del final.
    @State private var ocio = ""
    @State private var ocioInicial = ""
    @State private var ocioTocado = false
    static let opcionesOcio: [(String, String)] = [("", "nada."), ("movie", "película."), ("series", "serie."), ("concierto", "concierto."),
                                                   ("teatro", "teatro."), ("book", "libro."), ("game", "videojuego.")]

    private static var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = CalendarioBitacora.madrid.zona
        return c
    }

    init(inicial: EditorEvento) {
        self.inicial = inicial
        _titulo = State(initialValue: inicial.titulo)
        _lugar = State(initialValue: inicial.lugar)
        _notas = State(initialValue: inicial.notas)
        let f = Self.cal.date(from: DateComponents(year: inicial.fecha.year, month: inicial.fecha.month, day: inicial.fecha.day, hour: 12)) ?? Date()
        _fecha = State(initialValue: f)
        let p = (inicial.hora ?? "").split(separator: ":").compactMap { Int($0) }
        _conHora = State(initialValue: p.count >= 2)
        let h = p.count >= 2 ? (Self.cal.date(bySettingHour: p[0], minute: p[1], second: 0, of: f) ?? f) : (Self.cal.date(bySettingHour: 10, minute: 0, second: 0, of: f) ?? f)
        _hora = State(initialValue: h)
        _fin = State(initialValue: h.addingTimeInterval(2 * 3600))
    }

    // Bitácora 2.0: hoja sobre el lienzo, campos en tarjetas blancas, el día y la hora en filas limpias, el ocio en
    // chips y «guardar.» en cápsula negra pegada abajo.
    var body: some View {
        VStack(spacing: 0) {
            barraSuperior
            ScrollView {
                VStack(alignment: .leading, spacing: Medida.m) {
                    VStack(spacing: 0) {
                        campo("qué es.", texto: $titulo).focused($enfocado)
                        SeparadorFila(sangria: 0)
                        campo("dónde.", texto: $lugar)
                        SeparadorFila(sangria: 0)
                        TextField("", text: $notas, prompt: Text("notas.").foregroundColor(Lienzo.tintaTerciaria), axis: .vertical)
                            .lineLimit(1...4)
                            .font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                            .padding(.vertical, Medida.s)
                    }
                    .tarjeta(relleno: Medida.rellenoTarjeta)

                    EtiquetaSeccion(texto: "cuándo").padding(.top, Medida.xs)
                    VStack(spacing: 0) {
                        fila("día.") { DatePicker("día.", selection: $fecha, displayedComponents: .date).labelsHidden() }
                        SeparadorFila(sangria: 0)
                        interruptor("a una hora.", $conHora)
                        if conHora {
                            SeparadorFila(sangria: 0)
                            fila("empieza.") { DatePicker("hora.", selection: $hora, displayedComponents: .hourAndMinute).labelsHidden() }
                                .transition(.opacity)
                            SeparadorFila(sangria: 0)
                            interruptor("hasta una hora.", $conFin).transition(.opacity)
                            if conFin {
                                SeparadorFila(sangria: 0)
                                fila("acaba.") { DatePicker("acaba.", selection: $fin, displayedComponents: .hourAndMinute).labelsHidden() }
                                    .transition(.opacity)
                            }
                        }
                    }
                    .tarjeta(relleno: Medida.rellenoTarjeta)
                    .environment(\.locale, Locale(identifier: "es_ES"))

                    EtiquetaSeccion(texto: "de ocio").padding(.top, Medida.xs)
                    ScrollView(.horizontal) {
                        HStack(spacing: Medida.xs) {
                            ForEach(Self.opcionesOcio, id: \.0) { o in
                                let on = ocio == o.0
                                Button {
                                    guard !on else { return }
                                    Haptica.seleccion()
                                    withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { ocio = o.0; ocioTocado = true }
                                } label: {
                                    Chip(texto: o.1, tono: on ? .oscuro : .blanco).frame(minHeight: Medida.toque)
                                }
                                .buttonStyle(.pulsable(0.92))
                                .accessibilityAddTraits(on ? .isSelected : [])
                            }
                        }
                        .padding(.horizontal, Medida.margen)
                    }
                    .scrollIndicators(.hidden)
                    .padding(.horizontal, -Medida.margen)
                    if !ocio.isEmpty {
                        Text("tres horas después de que acabe, bitácora te pondrá «valorar \(ValorarOcio.nombre(ocio))» en el plan.")
                            .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                            .padding(.horizontal, Medida.xxs)
                            .transition(.opacity)
                    }

                    if let error {
                        Text(error).font(Letra.pie).foregroundStyle(Lienzo.negativo).padding(.horizontal, Medida.xxs)
                    }

                    if !inicial.nuevo {
                        Button { confirmarBorrado = true } label: {
                            Text("borrar evento.").foregroundStyle(Lienzo.negativo)
                        }
                        .buttonStyle(.capsula(.blanco, ancho: true))
                        .padding(.top, Medida.l)
                    }
                }
                .padding(.horizontal, Medida.margen)
                .padding(.top, Medida.xs)
                .padding(.bottom, Medida.l)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Button(guardando ? "guardando…" : "guardar.") { Task { await enviar(guardado) } }
                    .buttonStyle(.capsula(.oscuro, ancho: true))
                    .disabled(guardando || limpio(titulo).isEmpty)
                    .padding(.horizontal, Medida.margen)
                    .padding(.vertical, Medida.xs)
                    .background(Lienzo.fondo)
            }
        }
        .fondoLienzo()
        .tint(Lienzo.naranja)
        .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: ocio.isEmpty)
        .confirmationDialog("¿borrar este evento?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
            Button("borrar.", role: .destructive) { Task { await enviar(.borrarEntrada(id: inicial.id)) } }
            Button("cancelar.", role: .cancel) {}
        }
        .onAppear { if inicial.nuevo { enfocado = true } }
        .onChange(of: titulo) { _, t in
            guard inicial.nuevo, !ocioTocado else { return }
            ocio = ValorarOcio.clase(["title": .string(t)]) ?? ""
        }
        .task {
            guard !inicial.nuevo, let doc = await c.documentoVisible(),
                  let e = (((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []).first(where: { $0["id"]?.comoId == inicial.id })?.objeto else { return }
            let v = ValorarOcio.clase(e) ?? ""
            if !ocioTocado { ocio = v }
            ocioInicial = v
            if let f = ValorarOcio.horaFin(e), let m = ValorarOcio.minutos(f) {
                finInicial = e["endTime"]?.texto.flatMap { $0.isEmpty ? nil : $0 }
                fin = Self.cal.date(bySettingHour: m / 60, minute: m % 60, second: 0, of: fecha) ?? fin
                conFin = true
            }
        }
        .preguntarAlDescartar(cambiado, preguntar: $descartar) { cerrar() }
        .presentationDetents([.large])
    }

    // Cerrar a la izquierda y el título en el centro, como las hojas del sistema pero con las piezas de la casa.
    private var barraSuperior: some View {
        ZStack {
            Text(inicial.nuevo ? "nuevo evento." : "evento.")
                .font(Letra.seccion).foregroundStyle(Lienzo.tinta)
                .accessibilityAddTraits(.isHeader)
            HStack {
                BotonRedondo(sistema: "xmark", tono: .sutil, tamano: 34, etiqueta: "cancelar") {
                    if cambiado { descartar = true } else { cerrar() }
                }
                Spacer()
            }
        }
        .padding(.horizontal, Medida.margen - 6)
        .padding(.top, Medida.s)
        .padding(.bottom, Medida.xxs)
    }

    private func campo(_ placeholder: String, texto: Binding<String>) -> some View {
        TextField("", text: texto, prompt: Text(placeholder).foregroundColor(Lienzo.tintaTerciaria))
            .font(Letra.cuerpo)
            .foregroundStyle(Lienzo.tinta)
            .frame(minHeight: Medida.alturaControl + 4)
    }

    private func fila<Control: View>(_ titulo: String, @ViewBuilder control: () -> Control) -> some View {
        HStack(spacing: Medida.xs) {
            Text(titulo).font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
            Spacer(minLength: Medida.xs)
            control()
        }
        .frame(minHeight: Medida.alturaControl + 4)
    }

    private func interruptor(_ titulo: String, _ valor: Binding<Bool>) -> some View {
        Toggle(isOn: valor.animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento))) {
            Text(titulo).font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
        }
        .tint(Lienzo.naranja)
        .sensoryFeedback(.impact(weight: .light, intensity: 0.7), trigger: valor.wrappedValue)
        .frame(minHeight: Medida.alturaControl + 4)
    }

    private func limpio(_ s: String, _ max: Int = 500) -> String { String(s.trimmingCharacters(in: .whitespacesAndNewlines).prefix(max)) }

    private var guardado: OperacionBitacora {
        let d = Self.cal.dateComponents([.year, .month, .day], from: fecha)
        let dia = LocalDay(year: d.year!, month: d.month!, day: d.day!)!
        let h = Self.cal.dateComponents([.hour, .minute], from: hora)
        let horaTexto = conHora ? String(format: "%02d:%02d", h.hour ?? 0, h.minute ?? 0) : nil
        if inicial.nuevo {
            return .guardarEvento(id: inicial.id, fecha: dia.iso, hora: horaTexto, titulo: limpio(titulo), lugar: limpio(lugar), notas: limpio(notas, 2000))
        }
        // Solo lo que cambió: si la web tocó otro campo mientras tanto, se queda.
        var campos: [String: String] = [:]
        if limpio(titulo) != inicial.titulo { campos["title"] = limpio(titulo) }
        if limpio(lugar) != inicial.lugar { campos["place"] = limpio(lugar) }
        if limpio(notas, 2000) != inicial.notas { campos["notes"] = limpio(notas, 2000) }
        if dia != inicial.fecha { campos["date"] = dia.iso }
        if horaTexto != inicial.hora { campos["time"] = horaTexto ?? "" }
        if ocio != ocioInicial { campos.merge(Self.camposOcio(ocio)) { _, b in b } }
        if finTexto != finInicial { campos["endTime"] = finTexto ?? "" }
        return .parcharEvento(id: inicial.id, campos: campos)
    }

    // B10: el borrador frente a lo que se abrió (el ocio que se pone solo por el título no cuenta).
    private var cambiado: Bool {
        let d = Self.cal.dateComponents([.year, .month, .day], from: fecha)
        let h = Self.cal.dateComponents([.hour, .minute], from: hora)
        let horaTexto: String? = conHora ? String(format: "%02d:%02d", h.hour ?? 0, h.minute ?? 0) : nil
        let dia = LocalDay(year: d.year ?? 0, month: d.month ?? 0, day: d.day ?? 0)
        let textos = limpio(titulo) != limpio(inicial.titulo) || limpio(lugar) != limpio(inicial.lugar)
        let notasCambiadas = limpio(notas, 2000) != limpio(inicial.notas, 2000)
        let cuando = dia != inicial.fecha || horaTexto != inicial.hora || finTexto != finInicial
        return textos || notasCambiadas || cuando || (ocioTocado && ocio != ocioInicial)
    }

    private var finTexto: String? {
        guard conHora, conFin else { return nil }
        let h = Self.cal.dateComponents([.hour, .minute], from: fin)
        return String(format: "%02d:%02d", h.hour ?? 0, h.minute ?? 0)
    }

    // Para la web, película, concierto y teatro también van en `eventType` (cine, concierto, teatro).
    static func camposOcio(_ ocio: String) -> [String: String] {
        let tipo = ["movie": "cine", "concierto": "concierto", "teatro": "teatro"][ocio] ?? "otro"
        return ["ocioTipo": ocio, "eventType": tipo]
    }

    // El id viene decidido al abrir: dos toques en «guardar.» guardan el mismo evento una vez.
    private func enviar(_ op: OperacionBitacora) async {
        guard !guardando else { return }
        guardando = true
        defer { guardando = false }
        do {
            var ops = [op]
            var extra: [String: String] = [:]
            if inicial.nuevo, !ocio.isEmpty { extra = Self.camposOcio(ocio) }
            if inicial.nuevo, let f = finTexto { extra["endTime"] = f }
            if !extra.isEmpty { ops.append(.parcharEvento(id: inicial.id, campos: extra)) }
            // «valorar …» suena con la app cerrada solo si hay permiso de avisos.
            if !ocio.isEmpty { _ = await Recordatorios.pedirPermiso() }
            try await c.encolar(ops)
            cerrar()
        } catch {
            self.error = "no se pudo guardar en este iPhone."
        }
    }
}
