import SwiftUI
import CoreImage.CIFilterBuiltins

// La ficha de un evento (openEntryDetail y abrirEntradas de la web): qué es, cuándo, dónde y sus notas; las entradas
// con su QR, a pantalla entera para que lo lean. Los eventos propios se editan desde aquí; lo que viene de otro
// apartado (trabajo, pagos, Estudios, partidos) solo se consulta.
struct FichaEventoView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    let evento: EventoDia
    let dia: LocalDay
    @State private var entradas: [EntradaQR] = []
    @State private var indice = 0
    @State private var pantallaCompleta = false
    @State private var entradaABorrar: EntradaQR?
    @State private var borrando: EventoDia?
    @State private var entradaAbierta = false
    @State private var hoy = CalendarioBitacora.madrid.dia(de: Date())

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                cabecera.entradaEscalonada(0)
                filas.entradaEscalonada(1)
                if !entradas.isEmpty { tarjetaEntradas.entradaEscalonada(2) }
                if evento.tipo == "event" {
                    AnadirEntradaQR(eventoId: evento.id) { Task { await cargarEntradas(forzar: true) } }
                        .entradaEscalonada(3)
                }
                acciones.padding(.top, Medida.xs).entradaEscalonada(4)
                if !evento.editable && !origen.isEmpty {
                    Text(origen).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).padding(.horizontal, Medida.xxs)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .presentationDetents(entradas.isEmpty ? [.medium, .large] : [.large])
        .presentationDragIndicator(.visible)
        .task { await cargarEntradas(); if dia == hoy && !entradas.isEmpty { entradaAbierta = true } }
        .fullScreenCover(isPresented: $pantallaCompleta) {
            EntradaPantallaCompleta(titulo: evento.titulo, detalle: [evento.lugar, evento.hora ?? ""].filter { !$0.isEmpty }.joined(separator: ", "),
                                    entradas: entradas, indice: min(indice, max(entradas.count - 1, 0)))
        }
        .confirmarBorrado($borrando, titulo: { _ in "¿borrar este evento?" }) { e in
            Task { @MainActor in if await c.guardar(.borrarEntrada(id: e.id), fallo: "no se pudo borrar en este iPhone.") { Haptica.exito(); cerrar() } }
        }
    }

    // Bloque de fecha grande, el título y la cuenta atrás; cerrar a la derecha.
    private var cabecera: some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            HStack(alignment: .top) {
                BloqueFecha(dia: dia, tono: dia >= hoy ? .naranja : .apagado, grande: true)
                Spacer()
                BotonRedondo(sistema: "xmark", tono: .blanco, tamano: 36, etiqueta: "cerrar") { cerrar() }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(evento.titulo).font(Letra.titulo).kerning(-0.4).foregroundStyle(Lienzo.tinta)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                HStack(spacing: Medida.xs) {
                    Text(Self.fecha(dia) + ".").font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                    TimelineView(.periodic(from: .now, by: 60)) { t in
                        Chip(texto: CuentaAtras.texto(dia, hora: evento.hora, hoy: hoy, ahora: t.date), tono: dia >= hoy ? .naranja : .sutil)
                    }
                }
            }
        }
        .padding(.horizontal, Medida.xxs)
    }

    // Lo que hay que saber, en filas: hora, lugar, lo de debajo del título y las notas.
    private var filas: some View {
        VStack(alignment: .leading, spacing: 0) {
            FilaTarjeta(icono: "calendario", titulo: TextoEventos.horario(evento) ?? "todo el día.", detalle: "hora.")
            if !evento.lugar.isEmpty {
                SeparadorFila()
                FilaTarjeta(icono: "viajes", titulo: evento.lugar, detalle: "dónde.")
            }
            if !evento.meta.isEmpty && evento.meta != evento.lugar {
                SeparadorFila()
                FilaTarjeta(icono: "eventos", titulo: evento.meta, detalle: "más.")
            }
            if !evento.notas.isEmpty {
                SeparadorFila()
                HStack(alignment: .top, spacing: Medida.s) {
                    IconoCuadrado(id: "notas")
                    VStack(alignment: .leading, spacing: 2) {
                        Text("notas.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        Text(evento.notas).font(Letra.cuerpo).foregroundStyle(Lienzo.tinta).textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, Medida.s)
            }
        }
        .tarjeta(relleno: Medida.s)
    }

    // .entrada-ticket: recogida, una miniatura del QR; abierta, el QR grande. Tocar el grande lo pone a pantalla entera.
    private var tarjetaEntradas: some View {
        let e = entradas[min(indice, entradas.count - 1)]
        return VStack(spacing: Medida.s) {
            Button {
                Haptica.ligera()
                withAnimation(Muelle.o(Muelle.expandir, reducido: sinMovimiento)) { entradaAbierta.toggle() }
            } label: {
                HStack(spacing: Medida.s) {
                    if !entradaAbierta {
                        CodigoQR(datos: e.datos).frame(width: MedidaEventos.qrMiniatura, height: MedidaEventos.qrMiniatura)
                            .transition(.scale(scale: 0.6).combined(with: .opacity))
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entradas.count == 1 ? "entrada." : "\(entradas.count) entradas.").font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta)
                        Text(entradaAbierta ? "toca el qr para verlo a pantalla completa." : (e.etiqueta.isEmpty ? "toca para enseñarla." : e.etiqueta))
                            .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.down").font(.system(size: 12, weight: .bold)).foregroundStyle(Lienzo.tintaTerciaria)
                        .rotationEffect(.degrees(entradaAbierta ? 180 : 0))
                }
                .frame(minHeight: Medida.toque)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pulsable(0.98))
            .accessibilityValue(entradaAbierta ? "abierta" : "recogida")
            if entradaAbierta {
                VStack(spacing: Medida.s) {
                    Button { pantallaCompleta = true } label: { CodigoQR(datos: e.datos) }
                        .buttonStyle(.pulsable(0.97))
                        .accessibilityHint("abre la entrada a pantalla completa con el brillo al máximo")
                        .contextMenu {
                            Button("abrir a pantalla completa.") { pantallaCompleta = true }
                            Button("quitar esta entrada.", role: .destructive) { entradaABorrar = e }
                        }
                        .confirmarBorrado($entradaABorrar, titulo: { _ in "¿quitar esta entrada? el qr no se puede recuperar." }, boton: "quitar.") { quitar($0) }
                        .id(e.id)
                        .transition(.opacity)
                    if !e.etiqueta.isEmpty { Text(e.etiqueta).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta) }
                    if entradas.count > 1 {
                        HStack(spacing: Medida.s) {
                            BotonRedondo(sistema: "chevron.left", tono: .sutil, tamano: 36, etiqueta: "entrada anterior") { pasar(-1) }
                            Text("\(indice + 1) de \(entradas.count)").font(Letra.hora).foregroundStyle(Lienzo.tintaSecundaria)
                                .contentTransition(.numericText())
                            BotonRedondo(sistema: "chevron.right", tono: .sutil, tamano: 36, etiqueta: "entrada siguiente") { pasar(1) }
                        }
                    }
                    Button("ver a pantalla completa.") { pantallaCompleta = true }.buttonStyle(.capsula(.oscuro, ancho: true))
                    Text("mantén pulsado el qr para quitarlo.").font(Letra.pie).foregroundStyle(Lienzo.tintaTerciaria)
                }
                .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .top)))
            }
        }
        .tarjeta(relleno: Medida.s)
    }

    // Editar, compartir y borrar, en cápsulas.
    private var acciones: some View {
        HStack(spacing: Medida.xs) {
            if evento.editable {
                Button("editar.") {
                    c.modal = .evento(EditorEvento(id: evento.id, nuevo: false, fecha: dia, hora: evento.hora, titulo: evento.titulo,
                                                   lugar: evento.lugar, notas: evento.notas))
                }
                .buttonStyle(.capsula(.oscuro, ancho: true))
            }
            ShareLink(item: textoCompartir) { Text("compartir.") }
                .buttonStyle(.capsula(.blanco, ancho: true))
            if evento.editable {
                Button { borrando = evento } label: { Text("borrar.").foregroundStyle(Lienzo.negativo) }
                    .buttonStyle(.capsula(.blanco))
            }
        }
    }

    private var textoCompartir: String {
        let cuando = [Self.fecha(dia), TextoEventos.horario(evento)].compactMap { $0 }.joined(separator: ", ")
        return [evento.titulo, cuando, evento.lugar].filter { !$0.isEmpty }.joined(separator: "\n")
    }

    private func pasar(_ paso: Int) {
        Haptica.ligera()
        withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { indice = (indice + entradas.count + paso) % entradas.count }
    }

    private var origen: String {
        switch evento.tipo {
        case "work", "laboral": return "viene de empleo. se cambia en la agenda laboral de la web."
        case "pago": return "pago recurrente de finanzas."
        case "estudio": return "viene de estudios."
        case "birthday": return "cumpleaños."
        case "partido": return "lo añade bitácora porque sigues a este equipo."
        default: return evento.id.hasPrefix("evt_") ? "lo mantiene estudios: se cambia allí." : ""
        }
    }

    private func quitar(_ e: EntradaQR) {
        Task {
            await c.guardar(OperacionesExtra.op(OperacionesExtra.quitarEntradaQR, ["eventoId": .string(evento.id), "id": .string(e.id)]))
            await cargarEntradas(forzar: true)
        }
    }

    private func cargarEntradas(forzar: Bool = false) async {
        guard forzar || evento.entradas > 0, let doc = await c.documentoVisible() else { return }
        let lista = ((try? doc.valor(de: "entries")) ?? nil)?.lista?.first { $0["id"]?.comoId == evento.id }?["entradas"]?.lista ?? []
        entradas = lista.compactMap(EntradaQR.desde)
        indice = min(indice, max(entradas.count - 1, 0))
    }

    // Formateadores hechos una vez (0.20): el carrusel de Inicio pedía 21 fechas en cada fotograma del arrastre y cada
    // una creaba su DateFormatter.
    private static let utc: Calendar = { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "UTC")!; return c }()
    private static func formato(_ f: String) -> DateFormatter {
        let d = DateFormatter()
        d.locale = Locale(identifier: "es_ES")
        d.timeZone = TimeZone(identifier: "UTC")
        d.dateFormat = f
        return d
    }
    private static let formatoLargo = formato("EEEE d 'de' MMMM")
    static let formatoCorto = formato("EEE")
    static func mediodia(_ d: LocalDay) -> Date { utc.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))! }

    static func fecha(_ d: LocalDay) -> String { formatoLargo.string(from: mediodia(d)) }
}

// openTiempo: la previsión de los próximos días y la ciudad (la misma que usa la web, `ciudadTiempo`).
struct TiempoView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    @State private var ciudad = Ciudad.defecto
    @State private var tiempo: Tiempo?
    @State private var busqueda = ""
    @State private var resultados: [Ciudad] = []
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let t = tiempo {
                        HStack(spacing: Espacio.m) {
                            Image(systemName: Tiempo.simbolo[t.tipo] ?? "cloud.fill").font(.system(size: 44)).foregroundStyle(Paleta.texto)
                            VStack(alignment: .leading, spacing: 2) {
                                (Text("\(Int(t.temp.rounded()))°").font(Tipo.poppins(40, .bold, estilo: .largeTitle))
                                    + Text(t.sensacion.map { " (sensación de \(Int($0.rounded()))°)" } ?? "").font(Tipo.pie).foregroundColor(Paleta.textoSecundario))
                                    .foregroundStyle(Paleta.texto)
                                Text((Tiempo.texto[t.tipo] ?? "") + "." + (t.dias.first.map { " máx \(Int($0.max.rounded()))°, mín \(Int($0.min.rounded()))°" } ?? ""))
                                    .font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario)
                            }
                        }
                        .padding(.top, Espacio.s)
                        ForEach(t.dias.dropFirst(), id: \.fecha) { d in
                            HStack {
                                Text(Self.diaCorto(d.fecha) + ".").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto).frame(width: 60, alignment: .leading)
                                Image(systemName: Tiempo.simbolo[Tiempo.tipo(d.code, esDia: true)] ?? "cloud.fill").foregroundStyle(Paleta.texto)
                                Spacer()
                                Text("\(Int(d.max.rounded()))°").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto)
                                Text("\(Int(d.min.rounded()))°").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).frame(width: 40, alignment: .trailing)
                            }
                            .frame(minHeight: 44)
                            .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                        }
                    } else {
                        Text("cargando la previsión…").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.top, Espacio.s)
                    }
                    CabeceraSeccion(titulo: "ciudad.", detalle: ciudad.nombre)
                    TextField("busca tu ciudad…", text: $busqueda).font(Tipo.cuerpo).padding(.vertical, 12)
                        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                        .submitLabel(.search)
                    ForEach(resultados, id: \.clave) { r in
                        Button { elegir(r) } label: { FilaLibro(etiqueta: r.nombre, flecha: true) }.buttonStyle(EstiloFila())
                    }
                    if let error { Text(error).font(Tipo.pie).foregroundStyle(Paleta.error).padding(.top, Espacio.s) }
                }
                .padding(.horizontal, 20).padding(.bottom, Espacio.xl)
            }
            .background(Paleta.fondo)
            .navigationTitle("tiempo.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } } }
        }
        .presentationDetents([.medium, .large])
        .task {
            if let doc = await c.documentoVisible() { ciudad = VistaInicio.desde(doc).ciudad }
            tiempo = c.entorno.servicios.tiempo.guardado(ciudad)
            tiempo = await c.entorno.servicios.tiempo.actual(ciudad) ?? tiempo
        }
        .task(id: busqueda) {
            let q = busqueda.trimmingCharacters(in: .whitespaces)
            guard q.count >= 2 else { resultados = []; return }
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            resultados = await c.entorno.servicios.tiempo.buscar(q)
        }
    }

    private func elegir(_ r: Ciudad) {
        Task {
            do {
                try await c.encolar(.ponerCiudadTiempo(nombre: r.nombre, lat: String(r.lat), lon: String(r.lon)))
                ciudad = r
                busqueda = ""
                resultados = []
                tiempo = await c.entorno.servicios.tiempo.actual(r, forzar: true)
            } catch {
                self.error = "no se pudo guardar en este iPhone."
            }
        }
    }

    static func diaCorto(_ iso: String) -> String {
        guard let d = LocalDay(iso: iso) else { return iso }
        return FichaEventoView.formatoCorto.string(from: FichaEventoView.mediodia(d)).replacingOccurrences(of: ".", with: "")
    }
}
