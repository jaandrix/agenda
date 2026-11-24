import SwiftUI

// js/bajo-demanda/transporte.js: tus paradas guardadas arriba con sus tiempos (las líneas que elegiste delante), la
// búsqueda por número, calle o línea, y recarga sola cada 30 s mientras se ve. Favoritas y líneas se guardan en
// `servicios.transporte` con operaciones propias; las paradas y los tiempos nunca entran en el documento.
// Rediseño 2.0: la parada de Inicio (o la primera guardada) es la protagonista en una tarjeta oscura; el resto, en
// tarjetas blancas. Las cifras se actualizan rodando, sin vaciar la tarjeta mientras llega la lectura nueva.
struct TransporteView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var paradas: [Parada]?
    @State private var favoritas: [String] = []
    @State private var lineas: [String: [String]] = [:]
    @State private var tiempos: [String: TiemposParada] = [:]
    @State private var cargando: Set<String> = []
    @State private var busqueda = ""
    @State private var abierta: String?
    @State private var verTodas: Set<String> = []
    @State private var aviso: String?
    @State private var enInicio: String?
    @State private var modo = "todo"
    @State private var giro: Double = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                TimelineView(.periodic(from: .now, by: 5)) { ctx in
                    CabeceraPagina(titulo: "transporte.", subtitulo: actualizado(ctx.date), derecha: {
                        BotonRedondo(sistema: "arrow.clockwise", tono: .blanco, etiqueta: "recargar") {
                            Haptica.ligera()
                            Task { await recargar(forzar: true) }
                        }
                        .rotationEffect(.degrees(giro))
                    })
                }
                .padding(.top, Medida.xs)
                if let aviso {
                    Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.negativo)
                        .transition(.opacity)
                }
                if hayModos {
                    SegmentoCapsula(opciones: [.init(valor: "todo", titulo: "todo"), .init(valor: "bus", titulo: "bus"), .init(valor: "tram", titulo: "tranvía")],
                                    elegido: $modo, sobreBlanco: false)
                }
                guardadas
                BuscadorCapsula(texto: $busqueda, placeholder: "número, calle o línea")
                    .textInputAutocapitalization(.never)
                    .padding(.top, Medida.s)
                busquedaResultados
                Text("tiempos de avanza y paradas del ayuntamiento de zaragoza. son estimaciones y pueden cambiar con el tráfico.")
                    .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    .padding(.top, Medida.xs).padding(.horizontal, Medida.xxs)
            }
            .padding(.horizontal, Medida.margen).padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.expandir, reducido: sinMovimiento), value: favoritas)
            .animation(Muelle.o(Muelle.expandir, reducido: sinMovimiento), value: enInicio)
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: modo)
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: aviso)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .scrollDismissesKeyboard(.interactively)
        .task(id: c.revision) {
            let antes = favoritas
            await leerDocumento()
            if favoritas != antes { await recargar(forzar: false) }
        }
        .task { paradas = await c.entorno.servicios.transporte.paradas() }
        .task {
            while !Task.isCancelled {
                await recargar(forzar: false)
                try? await Task.sleep(for: .seconds(30))
            }
        }
        // El botón de recargar da vueltas enteras con muelle mientras haya alguna lectura en camino; al acabar, se queda
        // en una vuelta completa (nunca a medias).
        .task(id: cargando.isEmpty) {
            guard !cargando.isEmpty, !sinMovimiento else { return }
            repeat {
                withAnimation(Muelle.suave) { giro += 360 }
                try? await Task.sleep(for: .milliseconds(450))
            } while !Task.isCancelled && !cargando.isEmpty
        }
    }

    // MARK: - Cabecera

    private func actualizado(_ ahora: Date) -> String {
        if !cargando.isEmpty && tiempos.isEmpty { return "actualizando…" }
        guard let ultima = tiempos.values.map(\.hora).max() else { return "el bus de zaragoza, en directo." }
        let s = max(0, Int(ahora.timeIntervalSince(ultima)))
        if s < 5 { return "actualizado ahora mismo." }
        if s < 60 { return "actualizado hace \(s / 5 * 5) s." }
        return "actualizado hace \(s / 60) min."
    }

    // Bus y tranvía: el segmento solo sale si tienes guardadas paradas de los dos.
    private var hayModos: Bool { Set(favoritas.compactMap { parada($0)?.tipo }).count > 1 }
    private func enModo(_ p: Parada) -> Bool { !hayModos || modo == "todo" || p.tipo == modo }

    // MARK: - Paradas guardadas

    private var visibles: [Parada] { favoritas.compactMap { parada($0) }.filter { enModo($0) } }
    private var protagonista: Parada? { visibles.first { $0.clave == enInicio } ?? visibles.first }

    @ViewBuilder private var guardadas: some View {
        let todas = visibles
        if todas.isEmpty {
            if favoritas.isEmpty {
                EstadoVacio(texto: "aún no tienes paradas guardadas. búscala abajo por su número (está en el poste), por la calle o por la línea, y guárdala con la estrella.",
                            icono: "transporte")
                    .tarjeta()
            }
        } else {
            let prota = protagonista
            if let prota {
                tarjetaOscura(prota)
                    .id("prota-" + prota.clave)
                    .transition(.opacity.combined(with: .scale(scale: 0.98)))
            }
            let resto = todas.filter { $0.clave != prota?.clave }
            if !resto.isEmpty {
                EtiquetaSeccion(texto: "tus paradas").padding(.top, Medida.xs)
                ForEach(Array(resto.enumerated()), id: \.element.clave) { i, p in
                    tarjetaBlanca(p)
                        .entradaEscalonada(i)
                        .transition(.opacity.combined(with: .scale(scale: 0.98)))
                }
            }
        }
    }

    // .tr-fav, versión protagonista: nombre, poste y líneas; el próximo de cada línea en grande.
    private func tarjetaOscura(_ p: Parada) -> some View {
        TarjetaOscura {
            VStack(alignment: .leading, spacing: Medida.s) {
                HStack(spacing: Medida.s) {
                    IconoCuadrado(id: "transporte", tono: .translucido)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.nombre.lowercased()).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.sobreOscuro).lineLimit(2)
                        Text(detalle(p)).font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave).lineLimit(2)
                    }
                    Spacer(minLength: Medida.xs)
                    if enInicio == p.clave {
                        Text("EN INICIO").font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.naranja)
                            .accessibilityLabel("esta parada sale en inicio")
                    }
                }
                llegadas(p, oscuro: true, compacto: true)
                Rectangle().fill(Lienzo.filoOscuro).frame(height: 1)
                HStack(spacing: Medida.m) {
                    Text(pie(p)).font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave).monospacedDigit()
                    Spacer()
                    if p.tipo == "bus" && enInicio != p.clave && enInicio != nil {
                        Button("poner en inicio.") { ponerEnInicio(p.clave) }
                            .font(Letra.pieFuerte).foregroundStyle(Lienzo.naranja)
                            .frame(minHeight: Medida.toque).buttonStyle(.pulsable(0.94))
                    }
                    Button("quitar.") { favorita(p.clave, false) }
                        .font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave)
                        .frame(minHeight: Medida.toque).buttonStyle(.pulsable(0.94))
                }
            }
        }
    }

    private func tarjetaBlanca(_ p: Parada) -> some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            cabecera(p)
            llegadas(p, oscuro: false, compacto: true)
            SeparadorFila(sangria: 0)
            HStack(spacing: Medida.m) {
                Text(pie(p)).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit()
                Spacer()
                if p.tipo == "bus" { marcaInicio(p) }
                Button("quitar.") { favorita(p.clave, false) }
                    .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    .frame(minHeight: Medida.toque).buttonStyle(.pulsable(0.94))
            }
        }
        .tarjeta(relleno: Medida.rellenoTarjeta)
    }

    // La parada de Inicio lleva su marca; las demás de bus, «poner en inicio.».
    @ViewBuilder private func marcaInicio(_ p: Parada) -> some View {
        if enInicio == p.clave {
            Chip(texto: "en inicio.", tono: .naranja).accessibilityLabel("esta parada sale en inicio")
        } else {
            Button("poner en inicio.") { ponerEnInicio(p.clave) }
                .font(Letra.pieFuerte).foregroundStyle(Lienzo.naranjaProfundo)
                .frame(minHeight: Medida.toque).buttonStyle(.pulsable(0.94))
        }
    }

    private func ponerEnInicio(_ clave: String) {
        let antes = enInicio
        Haptica.ligera()
        enInicio = clave
        Task {
            do { try await c.encolar(.transporteElegirInicio(clave: clave)); aviso = nil } catch {
                enInicio = antes
                aviso = "no se pudo guardar en este iPhone."
            }
        }
    }

    private func cabecera(_ p: Parada) -> some View {
        HStack(spacing: Medida.s) {
            IconoCuadrado(id: "transporte")
            VStack(alignment: .leading, spacing: 2) {
                Text(p.nombre.lowercased()).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta).lineLimit(2)
                Text(detalle(p)).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: 52)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func detalle(_ p: Parada) -> String {
        "\(p.tipo == "tram" ? "tranvía" : "poste") \(p.numero)" + (p.lineas.isEmpty ? "" : ", \(p.lineas.count == 1 ? "línea" : "líneas") \(p.lineas.joined(separator: ", "))")
    }

    // MARK: - Búsqueda

    @ViewBuilder private var busquedaResultados: some View {
        if paradas == nil {
            EstadoVacio(texto: "cargando las paradas…")
        } else if paradas?.isEmpty == true {
            EstadoVacio(texto: "no se pudieron cargar las paradas. comprueba la conexión y prueba a recargar.", icono: "transporte")
        } else if busqueda.trimmingCharacters(in: .whitespaces).isEmpty {
            if !favoritas.isEmpty {
                Text("busca otra parada por su número, la calle o la línea. con la estrella sale arriba con sus tiempos.")
                    .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).padding(.horizontal, Medida.xxs)
            }
        } else {
            let r = resultados
            if r.isEmpty {
                EstadoVacio(texto: "no hay ninguna parada con eso.")
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(r.enumerated()), id: \.element.clave) { i, p in
                        if i > 0 { SeparadorFila() }
                        resultado(p)
                    }
                }
                .tarjeta(relleno: Medida.s)
            }
        }
    }

    private func parada(_ clave: String) -> Parada? {
        if let p = paradas?.first(where: { $0.clave == clave }) { return p }
        let partes = clave.split(separator: ":")
        guard partes.count == 2 else { return nil }
        return Parada(tipo: String(partes[0]), id: "", numero: String(partes[1]), nombre: "parada", lineas: [], lat: nil, lon: nil)
    }

    // trResultados: por número (empieza por) o línea exacta; si no, por nombre sin acentos. 30 como mucho.
    private var resultados: [Parada] {
        let q = busqueda.trimmingCharacters(in: .whitespaces).lowercased().folding(options: .diacriticInsensitive, locale: nil)
        guard let todas = paradas, !q.isEmpty else { return [] }
        let numero = q.allSatisfy(\.isNumber)
        return todas.filter { p in
            enModo(p) && (numero ? p.numero.hasPrefix(q) || p.lineas.contains { $0.lowercased() == q }
                : p.nombre.lowercased().folding(options: .diacriticInsensitive, locale: nil).contains(q) || p.lineas.contains { $0.lowercased() == q })
        }
        .sorted { ($0.numero == q ? 0 : 1, Int($0.numero) ?? 0) < ($1.numero == q ? 0 : 1, Int($1.numero) ?? 0) }
        .prefix(30).map { $0 }
    }

    private func resultado(_ p: Parada) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: Medida.xs) {
                Button {
                    Haptica.ligera()
                    withAnimation(Muelle.o(Muelle.expandir, reducido: sinMovimiento)) { abierta = abierta == p.clave ? nil : p.clave }
                    if abierta != nil, p.tipo == "bus" { Task { await cargar(p.clave, forzar: false) } }
                } label: { cabecera(p) }
                .buttonStyle(.pulsable(0.98))
                .accessibilityHint(abierta == p.clave ? "toca para recoger" : "toca para ver sus tiempos")
                let fav = favoritas.contains(p.clave)
                Button { Haptica.ligera(); favorita(p.clave, !fav) } label: {
                    Image(systemName: fav ? "star.fill" : "star").font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(fav ? Lienzo.naranja : Lienzo.tintaTerciaria)
                        .frame(width: Medida.toque, height: Medida.toque)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.pulsable(0.85))
                .accessibilityLabel(fav ? "quitar de tus paradas" : "guardar en tus paradas")
            }
            if abierta == p.clave {
                VStack(alignment: .leading, spacing: Medida.xs) {
                    llegadas(p, oscuro: false, compacto: false)
                    if !pie(p).isEmpty { Text(pie(p)).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit() }
                }
                .padding(.leading, Medida.icono + Medida.s).padding(.bottom, Medida.xs)
                .transition(.opacity.combined(with: .offset(y: -6)))
            }
        }
    }

    // MARK: - Llegadas

    // trTiemposHtml: por línea y destino, el primero grande y el siguiente al lado. En las guardadas, solo las líneas
    // elegidas (tocar una línea la elige o la quita) y «+ n líneas más.».
    @ViewBuilder private func llegadas(_ p: Parada, oscuro: Bool, compacto: Bool) -> some View {
        if p.tipo != "bus" {
            nota("el tranvía no publica sus tiempos ahora mismo.", oscuro: oscuro)
        } else if let t = tiempos[p.clave] {
            let grupos = Self.agrupar(t.llegadas)
            let mias = lineas[p.clave] ?? []
            let todas = !compacto || mias.isEmpty || verTodas.contains(p.clave)
            let vis = todas ? grupos : grupos.filter { mias.contains($0.linea) }
            if grupos.isEmpty {
                estadoSinBuses(t, oscuro: oscuro)
            } else if vis.isEmpty {
                nota("\(mias.count == 1 ? "la línea" : "las líneas") \(mias.joined(separator: ", ")), sin buses previstos ahora.", oscuro: oscuro)
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(vis.enumerated()), id: \.element.clave) { i, g in
                    if i > 0 { Rectangle().fill(oscuro ? Lienzo.filoOscuro : Lienzo.filo).frame(height: 1) }
                    filaLlegada(p, g, mias: mias, oscuro: oscuro, compacto: compacto)
                }
            }
            if compacto && !mias.isEmpty && grupos.count > vis.count {
                enlace("+ \(grupos.count - vis.count) \(grupos.count - vis.count == 1 ? "línea" : "líneas") más.", oscuro: oscuro) { verTodas.insert(p.clave) }
            } else if compacto && !mias.isEmpty && verTodas.contains(p.clave) {
                enlace("solo las tuyas.", oscuro: oscuro) { verTodas.remove(p.clave) }
            } else if compacto && mias.isEmpty && grupos.count > 1 {
                nota("toca una línea para ver solo esa.", oscuro: oscuro)
            }
        } else {
            nota("mirando los tiempos…", oscuro: oscuro)
        }
    }

    private func filaLlegada(_ p: Parada, _ g: Grupo, mias: [String], oscuro: Bool, compacto: Bool) -> some View {
        let suya = mias.contains(g.linea)
        let tono: ChipLinea.Tono = oscuro ? (mias.isEmpty || suya ? .naranja : .elevado) : (suya ? .naranja : .sutil)
        return HStack(spacing: Medida.s) {
            Button {
                guard compacto else { return }
                Haptica.ligera()
                linea(p.clave, g.linea, !suya)
            } label: {
                ChipLinea(linea: g.linea, tono: tono)
                    .frame(minHeight: Medida.toque).contentShape(Rectangle())
            }
            .buttonStyle(.pulsable(0.9))
            .disabled(!compacto)
            .accessibilityLabel("línea \(g.linea)" + (compacto ? (suya ? ", elegida" : "") : ""))
            .accessibilityHint(compacto ? (suya ? "toca para dejar de elegirla" : "toca para elegirla") : "")
            Text(g.destino.lowercased()).font(Letra.detalle)
                .foregroundStyle(oscuro ? Lienzo.sobreOscuroSuave : Lienzo.tintaSecundaria).lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 0) {
                MinutosBus(minutos: g.min.first ?? nil, oscuro: oscuro, grande: oscuro)
                if g.min.count > 1 {
                    Text("luego \(Self.minutos(g.min[1]))").font(Letra.pie).monospacedDigit()
                        .foregroundStyle(oscuro ? Lienzo.sobreOscuroSuave : Lienzo.tintaSecundaria)
                        .contentTransition(.numericText())
                }
            }
        }
        .frame(minHeight: oscuro ? 56 : Medida.toque)
    }

    // «sin datos ahora» y «sin conexión»: frases amables en vez del error del servidor.
    @ViewBuilder private func estadoSinBuses(_ t: TiemposParada, oscuro: Bool) -> some View {
        let sinRed = t.error == "Sin conexión."
        let texto = sinRed ? "sin conexión. en cuanto vuelva la red, lo miro otra vez."
            : t.error.map { $0.lowercased() } ?? "sin datos ahora: no hay buses previstos en esta parada."
        if oscuro {
            nota(texto, oscuro: true)
        } else {
            EstadoVacio(texto: texto)
        }
    }

    private func nota(_ texto: String, oscuro: Bool) -> some View {
        Text(texto).font(Letra.detalle).foregroundStyle(oscuro ? Lienzo.sobreOscuroSuave : Lienzo.tintaSecundaria)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.vertical, Medida.xxs)
    }

    private func enlace(_ titulo: String, oscuro: Bool, _ hacer: @escaping () -> Void) -> some View {
        Button {
            withAnimation(Muelle.o(Muelle.expandir, reducido: sinMovimiento)) { hacer() }
        } label: {
            Text(titulo).font(Letra.pieFuerte).foregroundStyle(oscuro ? Lienzo.naranja : Lienzo.naranjaProfundo)
                .frame(minHeight: Medida.toque - Medida.xs)
        }
        .buttonStyle(.pulsable(0.94))
    }

    private func pie(_ p: Parada) -> String {
        guard let t = tiempos[p.clave] else { return cargando.contains(p.clave) ? "actualizando…" : "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "HH:mm"
        return "a las \(f.string(from: t.hora))."
    }

    struct Grupo { let linea: String; let destino: String; var min: [Int?]; var clave: String { linea + "|" + destino } }
    static func agrupar(_ l: [Llegada]) -> [Grupo] {
        var g: [Grupo] = []
        for x in l {
            if let i = g.firstIndex(where: { $0.linea == x.linea && $0.destino == x.destino }) { g[i].min.append(x.minutos) }
            else { g.append(Grupo(linea: x.linea, destino: x.destino, min: [x.minutos])) }
        }
        return g.sorted { (($0.min.first ?? nil) ?? 999) < (($1.min.first ?? nil) ?? 999) }
    }
    static func minutos(_ m: Int?) -> String { m.map { $0 == 0 ? "ya" : "\($0) min" } ?? "sin hora" }

    // MARK: - Datos (sin cambios respecto a antes del rediseño)

    private func leerDocumento() async {
        guard let doc = await c.documentoVisible() else { return }
        let tr = ((try? doc.valor(de: "servicios")) ?? nil)?["transporte"]
        favoritas = tr?["favoritos"]?.lista?.compactMap(\.texto) ?? []
        lineas = (tr?["lineas"]?.objeto ?? [:]).mapValues { $0.lista?.compactMap(\.texto) ?? [] }
        enInicio = Apartados.visible("transporte", doc) ? LecturaTransporte.posteInicio(tr) : nil
    }

    private func recargar(forzar: Bool) async {
        let claves = Set(favoritas + (abierta.map { [$0] } ?? []))
        await withTaskGroup(of: Void.self) { g in
            for clave in claves where clave.hasPrefix("bus:") { g.addTask { await cargar(clave, forzar: forzar) } }
        }
    }

    // La lectura nueva sustituye a la anterior con un muelle: los minutos ruedan (numericText) y nada se vacía.
    private func cargar(_ clave: String, forzar: Bool) async {
        let poste = String(clave.dropFirst(4))
        cargando.insert(clave)
        let t = await c.entorno.servicios.transporte.tiempos(poste: poste, forzar: forzar)
        withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento)) { tiempos[clave] = t }
        cargando.remove(clave)
    }

    private func favorita(_ clave: String, _ activa: Bool) {
        let antes = favoritas
        favoritas = activa ? favoritas + [clave] : favoritas.filter { $0 != clave }
        Task {
            do {
                try await c.encolar(.transporteFavorita(clave: clave, activa: activa))
                aviso = nil
                if activa { await cargar(clave, forzar: false) }
            } catch {
                favoritas = antes
                aviso = "no se pudo guardar en este iPhone."
            }
        }
    }

    private func linea(_ clave: String, _ l: String, _ activa: Bool) {
        let antes = lineas
        var actuales = lineas[clave] ?? []
        if activa { actuales.append(l) } else { actuales.removeAll { $0 == l } }
        withAnimation(Muelle.o(Muelle.expandir, reducido: sinMovimiento)) {
            lineas[clave] = actuales
            verTodas.remove(clave)
        }
        Task {
            do { try await c.encolar(.transporteLinea(clave: clave, linea: l, activa: activa)); aviso = nil } catch {
                lineas = antes
                aviso = "no se pudo guardar en este iPhone."
            }
        }
    }
}

// El poste de Inicio: `servicios.transporte.posteInicio` si sigue entre las favoritas de bus; si no (o sin elegir, como
// antes de la 0.13), la primera favorita de bus. Mismo criterio que mobileBusPoste en la PWA.
enum LecturaTransporte {
    static func posteInicio(_ tr: JSONValue?) -> String? {
        let buses = (tr?["favoritos"]?.lista ?? []).compactMap(\.texto).filter { $0.hasPrefix("bus:") }
        if let e = tr?["posteInicio"]?.texto, buses.contains(e) { return e }
        return buses.first
    }

    static func postesBus(_ tr: JSONValue?) -> [String] {
        (tr?["favoritos"]?.lista ?? []).compactMap(\.texto).filter { $0.hasPrefix("bus:") }
    }
}
