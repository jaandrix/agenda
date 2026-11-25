import SwiftUI

// Viajes (js/viajes.js): entradas `type: travel` en `entries`, con `itinerario` (por día) y `places`. Los gastos son los
// movimientos de Finanzas marcados `viaje` (financeProGastosDelViaje) más los apuntados a mano en el viaje (`expenses`).
// 0.24: también reservas (`transportes`, `alojamientos`), `listas` y la pestaña Destino (DestinoViaje.swift). Los
// documentos del viaje siguen en la web: PLAN-0.24.md. El mapa es nativo desde la 0.27 (MapaViaje.swift).

struct ItemItinerario: Sendable, Identifiable, Equatable {
    let id, dia, hora, titulo, lugar, notas: String
    // Lo que puso la web al geocodificar el lugar (o el iPhone desde la 0.27); nil sin lugar localizado.
    var lat: Double? = nil
    var lon: Double? = nil
}
struct LugarViaje: Sendable, Identifiable, Equatable { let id, nombre: String; let visitado: Bool }
struct GastoViaje: Sendable, Identifiable, Equatable { let id, fecha, nota: String; let importe: Decimal }
struct ReservaViaje: Sendable, Identifiable, Equatable {
    let id: String
    let campos: [String: String]
    subscript(_ k: String) -> String { campos[k] ?? "" }
}
struct ItemListaViaje: Sendable, Identifiable, Equatable { let id, texto: String; let hecho: Bool }
struct ListaViaje: Sendable, Identifiable, Equatable {
    let id, nombre: String
    let items: [ItemListaViaje]
    var hechos: Int { items.filter(\.hecho).count }
}

struct Viaje: Sendable, Identifiable, Equatable {
    let id, titulo, destino, inicio, fin, companeros, notas: String
    let itinerario: [ItemItinerario]
    let lugares: [LugarViaje]
    let gastos: [GastoViaje]
    let aMano: Decimal
    let transportes: [ReservaViaje]
    let alojamientos: [ReservaViaje]
    let listas: [ListaViaje]
    // `destinoGeo`, el destino ya localizado por la web (servicios.js); si falta, la pestaña Destino lo busca.
    let geo: GeoDestino?

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
                return ItemItinerario(id: iid, dia: t("dia"), hora: t("hora"), titulo: t("titulo"), lugar: t("lugar"), notas: t("notas"),
                                      lat: io["lat"].flatMap { Dinero.decimal($0) }.map { NSDecimalNumber(decimal: $0).doubleValue },
                                      lon: io["lon"].flatMap { Dinero.decimal($0) }.map { NSDecimalNumber(decimal: $0).doubleValue })
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
            let listas = (o["listas"]?.lista ?? []).compactMap { l -> ListaViaje? in
                guard let lo = l.objeto, let lid = lo["id"]?.comoId else { return nil }
                let items = (lo["items"]?.lista ?? []).compactMap { i -> ItemListaViaje? in
                    guard let io = i.objeto, let iid = io["id"]?.comoId else { return nil }
                    return ItemListaViaje(id: iid, texto: io["texto"]?.texto ?? "", hecho: io["hecho"]?.booleano == true)
                }
                return ListaViaje(id: lid, nombre: lo["nombre"]?.texto ?? "", items: items)
            }
            return Viaje(id: id, titulo: s("title"), destino: s("destination"), inicio: inicio, fin: fin, companeros: s("companions"),
                         notas: s("notes"), itinerario: itinerario, lugares: lugares, gastos: gastos, aMano: aMano,
                         transportes: reservas(o["transportes"], orden: "salida"), alojamientos: reservas(o["alojamientos"], orden: "entrada"),
                         listas: listas, geo: GeoDestino.desde(o["destinoGeo"]))
        }
    }

    // renderTripReservasTab: cada reserva con sus campos de texto, por fecha de salida o de entrada.
    static func reservas(_ v: JSONValue?, orden: String) -> [ReservaViaje] {
        (v?.lista ?? []).compactMap { r -> ReservaViaje? in
            guard let o = r.objeto, let id = o["id"]?.comoId else { return nil }
            var campos: [String: String] = [:]
            for (k, x) in o where k != "id" { if let t = x.texto { campos[k] = t } }
            return ReservaViaje(id: id, campos: campos)
        }.sorted { $0[orden] < $1[orden] }
    }

    // fechaHoraViaje: «2026-12-01T09:30» → «mar 1 dic, 09:30».
    static func fechaHora(_ v: String) -> String {
        guard !v.isEmpty else { return "" }
        let partes = v.split(separator: "T", maxSplits: 1).map(String.init)
        var r = partes[0]
        if let d = LocalDay(iso: partes[0]) {
            let dias = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"], meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
            r = "\(dias[d.indiceSemanaLunes]) \(d.day) \(meses[d.month - 1])"
        }
        if partes.count > 1 { r += ", " + String(partes[1].prefix(5)) }
        return r
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
    @Environment(\.scenePhase) private var fase
    @State private var viajes: [Viaje]?
    @State private var tramo = Tramo.proximos
    @State private var abierto: ViajeAbierto?
    @State private var edicion: EdicionViaje?
    @State private var hoy = CalendarioBitacora.madrid.dia(de: Date())

    enum Tramo: Hashable { case proximos, pasados, lugares }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "viajes.", subtitulo: subtitulo) {
                    BotonRedondo(sistema: "plus", tono: .oscuro, etiqueta: "nuevo viaje") { edicion = .viaje(nil) }
                }
                .padding(.bottom, Medida.xxs)
                if let viajes {
                    let ops = opciones(viajes)
                    if ops.count > 1 {
                        SegmentoCapsula(opciones: ops, elegido: $tramo, sobreBlanco: false)
                    }
                    Group {
                        switch tramo {
                        case .proximos: proximos(viajes)
                        case .pasados: pasados(viajes)
                        case .lugares: lugares(viajes)
                        }
                    }
                    .id(tramo)
                    .transition(.opacity)
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
        .onChange(of: fase) { _, f in if f == .active { hoy = CalendarioBitacora.madrid.dia(de: Date()) } }
        .tareaVisible(id: "\(c.revision)-\(hoy.iso)") { await cargar() }
        .hoja(item: $abierto) { a in FichaViaje(id: a.id).environment(c) }
        .hoja(item: $edicion) { e in
            if case .viaje(let v) = e { EditorViaje(viaje: v).environment(c) }
        }
    }

    private var subtitulo: String {
        guard let v = viajes else { return "" }
        let n = activos(v).count
        return n == 0 ? "nada a la vista." : n == 1 ? "1 próximo." : "\(n) próximos."
    }

    private func opciones(_ v: [Viaje]) -> [SegmentoCapsula<Tramo>.Opcion] {
        var o: [SegmentoCapsula<Tramo>.Opcion] = [.init(valor: .proximos, titulo: "próximos")]
        if !completados(v).isEmpty { o.append(.init(valor: .pasados, titulo: "pasados")) }
        if v.contains(where: { !$0.lugares.isEmpty }) { o.append(.init(valor: .lugares, titulo: "lugares")) }
        return o
    }

    // renderTravels: próximos y en curso por fecha de inicio; completados, del más reciente al más antiguo.
    private func activos(_ v: [Viaje]) -> [Viaje] {
        v.filter { $0.estado(hoy: hoy.iso) != "completado" }.sorted { ($0.inicio.isEmpty ? "9" : $0.inicio) < ($1.inicio.isEmpty ? "9" : $1.inicio) }
    }

    private func completados(_ v: [Viaje]) -> [Viaje] {
        v.filter { $0.estado(hoy: hoy.iso) == "completado" }.sorted { $0.inicio > $1.inicio }
    }

    // El más cercano, protagonista en negro con su cuenta atrás; el resto, en tarjetas blancas.
    @ViewBuilder private func proximos(_ v: [Viaje]) -> some View {
        let lista = activos(v)
        if let primero = lista.first {
            destacado(primero).entradaEscalonada(0)
            let resto = Array(lista.dropFirst())
            if !resto.isEmpty { EtiquetaSeccion(texto: "después").padding(.top, Medida.s).entradaEscalonada(1) }
            ForEach(Array(resto.enumerated()), id: \.element.id) { n, x in
                tarjeta(x, apagada: false).entradaEscalonada(n + 2)
            }
        } else {
            TarjetaInvitacion(frase: "ningún viaje a la vista.", destacado: "planea el siguiente.", boton: "nuevo viaje.") { edicion = .viaje(nil) }
                .entradaEscalonada(0)
        }
    }

    @ViewBuilder private func pasados(_ v: [Viaje]) -> some View {
        let lista = completados(v)
        if lista.isEmpty {
            EstadoVacio(texto: "todavía no hay viajes terminados.", icono: "viajes").tarjeta(relleno: Medida.xs)
        }
        ForEach(Array(lista.enumerated()), id: \.element.id) { n, x in
            tarjeta(x, apagada: true).entradaEscalonada(n)
        }
    }

    // Los sitios que ver de cada viaje, para marcarlos sin abrir la ficha.
    @ViewBuilder private func lugares(_ v: [Viaje]) -> some View {
        let conLugares = (activos(v) + completados(v)).filter { !$0.lugares.isEmpty }
        if conLugares.isEmpty {
            EstadoVacio(texto: "apunta sitios que ver en la ficha de cada viaje.", icono: "viajes").tarjeta(relleno: Medida.xs)
        }
        ForEach(Array(conLugares.enumerated()), id: \.element.id) { n, x in
            VStack(alignment: .leading, spacing: Medida.xs) {
                EtiquetaSeccion(texto: String(TextoViajes.titulo(x).dropLast()) + ", \(x.lugares.filter(\.visitado).count) de \(x.lugares.count)")
                    .padding(.top, n == 0 ? 0 : Medida.s)
                VStack(spacing: 0) {
                    ForEach(Array(x.lugares.enumerated()), id: \.element.id) { i, l in
                        if i > 0 { SeparadorFila(sangria: Medida.toque) }
                        HStack(spacing: Medida.xxs) {
                            CasillaMarcar(hecha: l.visitado) {
                                Task { await c.guardar(.cambiarViaje(viajeId: x.id, cambio: .lugarVisitado(id: l.id, visitado: !l.visitado))) }
                            }
                            Text(l.nombre).font(Letra.cuerpo).foregroundStyle(l.visitado ? Lienzo.tintaSecundaria : Lienzo.tinta)
                                .lineLimit(2)
                            Spacer(minLength: 0)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityValue(l.visitado ? "visitado" : "por visitar")
                    }
                }
                .tarjeta(relleno: Medida.xs)
            }
            .entradaEscalonada(n)
        }
    }

    private func destacado(_ v: Viaje) -> some View {
        Button { abrir(v) } label: {
            TarjetaOscura {
                VStack(alignment: .leading, spacing: Medida.s) {
                    HStack(alignment: .top) {
                        Text(v.estado(hoy: hoy.iso) == "en curso" ? "DE VIAJE" : "EL PRÓXIMO")
                            .font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.sobreOscuroSuave)
                        Spacer()
                        IconoCuadrado(id: "viajes", tono: .translucido)
                    }
                    Text(TextoViajes.cuentaAtras(v, hoy: hoy))
                        .font(LetraViajes.cuentaAtras).kerning(-0.8).foregroundStyle(Lienzo.naranja)
                        .lineLimit(1).minimumScaleFactor(0.6)
                        .contentTransition(.numericText())
                    VStack(alignment: .leading, spacing: 3) {
                        Text(TextoViajes.titulo(v)).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.sobreOscuro)
                            .lineLimit(2).multilineTextAlignment(.leading)
                        Text(([v.destino.lowercased(), TextoViajes.fechas(v, hoy: hoy)].filter { !$0.isEmpty }).joined(separator: ", ") + ".")
                            .font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave).lineLimit(2)
                    }
                    ChipsReservasViaje(viaje: v, sobreOscuro: true)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        }
        .buttonStyle(.pulsable(0.97))
        .accessibilityElement(children: .combine)
        .accessibilityHint("abre la ficha del viaje")
        .contextMenu { menu(v) }
    }

    private func tarjeta(_ v: Viaje, apagada: Bool) -> some View {
        let enCurso = v.estado(hoy: hoy.iso) == "en curso"
        return Button { abrir(v) } label: {
            HStack(spacing: Medida.s) {
                IconoCuadrado(id: "viajes", tono: enCurso ? .suave : .claro)
                VStack(alignment: .leading, spacing: 2) {
                    Text(TextoViajes.titulo(v)).font(Letra.tituloTarjeta)
                        .foregroundStyle(apagada ? Lienzo.tintaSecundaria : Lienzo.tinta)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    Text(([v.destino.lowercased(), TextoViajes.fechas(v, hoy: hoy)].filter { !$0.isEmpty }).joined(separator: ", ") + ".")
                        .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                }
                Spacer(minLength: Medida.xxs)
                if !v.inicio.isEmpty {
                    Chip(texto: TextoViajes.cuentaAtras(v, hoy: hoy), tono: enCurso ? .naranja : .sutil)
                }
            }
            .tarjeta(relleno: Medida.s)
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        }
        .buttonStyle(.pulsable(0.97))
        .accessibilityElement(children: .combine)
        .accessibilityHint("abre la ficha del viaje")
        .contextMenu { menu(v) }
    }

    @ViewBuilder private func menu(_ v: Viaje) -> some View {
        Button("editar.") { edicion = .viaje(v) }
        Button("eliminar.", role: .destructive) { Task { await c.guardar(.borrarEntrada(id: v.id)) } }
    }

    private func abrir(_ v: Viaje) {
        Haptica.ligera()
        abierto = ViajeAbierto(id: v.id)
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        guard let nuevo = await ultimaGana({ doc.map { LecturaViajes.viajes($0) } }) else { return }
        viajes = nuevo
        if !opciones(nuevo ?? []).contains(where: { $0.valor == tramo }) { tramo = .proximos }
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
    @State private var reserva: ReservaEditando?
    @State private var nuevaLista = ""
    @State private var nuevosItems: [String: String] = [:]
    @State private var listaABorrar: ListaViaje?
    @State private var hoy = CalendarioBitacora.madrid.dia(de: Date())
    @State private var verDestino = false
    @State private var verMapa = true
    @State private var verItinerario = true
    @State private var verReservas = true
    @State private var verLugares = true
    @State private var verListas = true
    @State private var verGastos = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                if let v = viaje {
                    cabecera(v).entradaEscalonada(0)
                    if !v.destino.isEmpty {
                        SeccionPlegable(titulo: "destino.", detalle: "tiempo, hora y moneda", abierta: $verDestino) {
                            DestinoViajeView(viaje: v).padding(.top, Medida.xxs)
                        }
                        .entradaEscalonada(1)
                    }
                    let puntos = MapaViaje.puntos(v.itinerario)
                    if !puntos.isEmpty {
                        SeccionPlegable(titulo: "mapa.", detalle: puntos.count == 1 ? "1 lugar" : "\(puntos.count) lugares", abierta: $verMapa) {
                            MapaViaje(puntos: puntos)
                                .frame(height: MedidaViajes.mapa)
                                .clipShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous).strokeBorder(Lienzo.filo))
                                .sombra(.suave)
                                .padding(.top, Medida.xxs)
                        }
                        .entradaEscalonada(2)
                    }
                    SeccionPlegable(titulo: "itinerario.", detalle: v.itinerario.isEmpty ? nil : "\(v.itinerario.count)", abierta: $verItinerario) {
                        itinerario(v).padding(.top, Medida.xxs)
                    }
                    .entradaEscalonada(3)
                    SeccionPlegable(titulo: "reservas.", detalle: numero(v.transportes.count + v.alojamientos.count), abierta: $verReservas) {
                        reservas(v).padding(.top, Medida.xxs)
                    }
                    .entradaEscalonada(4)
                    SeccionPlegable(titulo: "lugares.", detalle: v.lugares.isEmpty ? nil : "\(v.lugares.filter(\.visitado).count) de \(v.lugares.count)", abierta: $verLugares) {
                        lugares(v).padding(.top, Medida.xxs)
                    }
                    .entradaEscalonada(5)
                    SeccionPlegable(titulo: "listas.", detalle: numero(v.listas.count), abierta: $verListas) {
                        listas(v).padding(.top, Medida.xxs)
                    }
                    .entradaEscalonada(6)
                    SeccionPlegable(titulo: "gastos.", detalle: v.totalGastos + v.aMano > 0 ? Dinero.formato(v.totalGastos + v.aMano) : nil, abierta: $verGastos) {
                        gastos(v).padding(.top, Medida.xxs)
                    }
                    .entradaEscalonada(7)
                    Button { confirmarBorrado = true } label: {
                        Text("eliminar viaje.").foregroundStyle(Lienzo.negativo)
                    }
                    .buttonStyle(.capsula(.blanco, ancho: true))
                    .padding(.top, Medida.s)
                    .entradaEscalonada(8)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, Medida.xxl)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.m)
            .padding(.bottom, Medida.xl)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
        .presentationDragIndicator(.visible)
        .confirmationDialog("¿eliminar este viaje?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
            Button("eliminar.", role: .destructive) { Task { @MainActor in if await c.guardar(.borrarEntrada(id: id)) { Haptica.exito(); cerrar() } } }
            Button("cancelar.", role: .cancel) {}
        }
        .hoja(isPresented: $editando) { EditorViaje(viaje: viaje).environment(c) }
        .hoja(isPresented: $nuevoItem) { EditorItinerario(viajeId: id, item: nil, diaInicial: viaje?.inicio ?? "").environment(c) }
        .hoja(item: $itemEditado) { it in EditorItinerario(viajeId: id, item: it, diaInicial: it.dia).environment(c) }
        .hoja(item: $reserva) { r in EditorReservaViaje(viajeId: id, editando: r).environment(c) }
        .confirmationDialog("¿eliminar la lista «\(listaABorrar?.nombre.lowercased() ?? "")»?",
                            isPresented: Binding(get: { listaABorrar != nil }, set: { if !$0 { listaABorrar = nil } }), titleVisibility: .visible) {
            Button("eliminar.", role: .destructive) { if let l = listaABorrar { enviar(.quitarLista(id: l.id)) }; listaABorrar = nil }
            Button("cancelar.", role: .cancel) { listaABorrar = nil }
        }
        .tareaVisible(id: c.revision) { await cargar() }
    }

    private func numero(_ n: Int) -> String? { n == 0 ? nil : "\(n)" }

    // El icono del apartado en negro, el título, las fechas con su cuenta atrás y con quién; editar y cerrar a la derecha.
    private func cabecera(_ v: Viaje) -> some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            HStack(alignment: .top, spacing: 0) {
                IconoCuadrado(id: "viajes", tono: .oscuro, tamano: Medida.iconoGrande)
                Spacer()
                BotonRedondo(sistema: "pencil", tono: .blanco, tamano: 36, etiqueta: "editar") { editando = true }
                BotonRedondo(sistema: "xmark", tono: .blanco, tamano: 36, etiqueta: "cerrar") { cerrar() }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(TextoViajes.titulo(v)).font(Letra.titulo).kerning(-0.4).foregroundStyle(Lienzo.tinta)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                HStack(spacing: Medida.xs) {
                    Text(TextoViajes.fechas(v, hoy: hoy) + ".").font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                    if !v.inicio.isEmpty {
                        Chip(texto: TextoViajes.cuentaAtras(v, hoy: hoy), tono: v.estado(hoy: hoy.iso) == "completado" ? .sutil : .naranja)
                    }
                }
                if !v.companeros.isEmpty {
                    Text("con " + v.companeros + ".").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                }
            }
            ChipsReservasViaje(viaje: v)
            if !v.notas.isEmpty {
                Text(v.notas).font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
        }
        .padding(.horizontal, Medida.xxs)
    }

    // Por día, con la hora delante; tocar abre el elemento y mantener lo quita.
    private func itinerario(_ v: Viaje) -> some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            if v.itinerario.isEmpty {
                Text("qué vais a hacer cada día, con su hora y su sitio.").font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                    .padding(.vertical, Medida.xxs)
            }
            ForEach(LecturaViajes.porDia(v.itinerario), id: \.0) { grupo in
                Text(LecturaViajes.fechaLarga(grupo.0) + ".").font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
                    .padding(.top, Medida.xxs)
                VStack(spacing: 0) {
                    ForEach(Array(grupo.1.enumerated()), id: \.element.id) { i, it in
                        if i > 0 { SeparadorFila(sangria: MedidaViajes.hora + Medida.s) }
                        Button { itemEditado = it } label: {
                            HStack(alignment: .firstTextBaseline, spacing: Medida.s) {
                                Text(it.hora).font(Letra.hora).foregroundStyle(Lienzo.tinta)
                                    .frame(width: MedidaViajes.hora, alignment: .leading)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(it.titulo).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                                        .multilineTextAlignment(.leading)
                                    if !it.lugar.isEmpty || !it.notas.isEmpty {
                                        Text([it.lugar, it.notas].filter { !$0.isEmpty }.joined(separator: ". "))
                                            .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).multilineTextAlignment(.leading)
                                    }
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(.vertical, Medida.s)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.pulsable(0.98))
                        .contextMenu { Button("borrar.", role: .destructive) { enviar(.quitarItinerario(id: it.id)) } }
                    }
                }
            }
            Button("+ al itinerario.") { nuevoItem = true }
                .buttonStyle(.capsula(.claro))
                .padding(.top, Medida.xxs)
        }
        .tarjeta(relleno: Medida.s)
    }

    // renderTripReservasTab: transportes y alojamiento con su chip; tocar uno lo abre para editarlo.
    private func reservas(_ v: Viaje) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if v.transportes.isEmpty && v.alojamientos.isEmpty {
                Text("vuelos, trenes y alojamiento, con su localizador a mano.").font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                    .padding(.vertical, Medida.xs)
            }
            ForEach(Array(v.transportes.enumerated()), id: \.element.id) { i, r in
                if i > 0 { SeparadorFila() }
                let clase = TextoViajes.clase(r["tipo"])
                Button { reserva = ReservaEditando(lista: "transportes", reserva: r) } label: {
                    FilaTarjeta(icono: "transporte", titulo: transporte(r), detalle: unir(detalleTransporte(r), r["notas"])) {
                        Chip(texto: clase.uno, icono: clase.simbolo)
                    }
                }
                .buttonStyle(.pulsable(0.98))
                .contextMenu { Button("borrar.", role: .destructive) { enviar(.quitarReserva(lista: "transportes", id: r.id)) } }
            }
            ForEach(Array(v.alojamientos.enumerated()), id: \.element.id) { i, r in
                if i > 0 || !v.transportes.isEmpty { SeparadorFila() }
                Button { reserva = ReservaEditando(lista: "alojamientos", reserva: r) } label: {
                    FilaTarjeta(icono: "viajes", titulo: r["nombre"].isEmpty ? "alojamiento." : r["nombre"], detalle: unir(detalleAlojamiento(r), r["notas"])) {
                        Chip(texto: "hotel", icono: "bed.double.fill")
                    }
                }
                .buttonStyle(.pulsable(0.98))
                .contextMenu { Button("borrar.", role: .destructive) { enviar(.quitarReserva(lista: "alojamientos", id: r.id)) } }
            }
            HStack(spacing: Medida.xs) {
                Button("+ transporte.") { reserva = ReservaEditando(lista: "transportes", reserva: nil) }.buttonStyle(.capsula(.claro))
                Button("+ alojamiento.") { reserva = ReservaEditando(lista: "alojamientos", reserva: nil) }.buttonStyle(.capsula(.claro))
            }
            .padding(.top, Medida.xs)
        }
        .tarjeta(relleno: Medida.s)
    }

    private func unir(_ a: String, _ b: String) -> String { [a, b].filter { !$0.isEmpty }.joined(separator: ". ") }

    private func transporte(_ r: ReservaViaje) -> String {
        let origen = r["origen"].isEmpty ? "?" : r["origen"]
        let destino = r["destino"].isEmpty ? "?" : r["destino"]
        return origen + " → " + destino
    }

    private func detalleTransporte(_ r: ReservaViaje) -> String {
        var p: [String] = [r["compania"], r["numero"], LecturaViajes.fechaHora(r["salida"])]
        if !r["llegada"].isEmpty { p.append("llega " + LecturaViajes.fechaHora(r["llegada"])) }
        if !r["reserva"].isEmpty { p.append("reserva " + r["reserva"]) }
        if !r["asiento"].isEmpty { p.append("asiento " + r["asiento"]) }
        return p.filter { !$0.isEmpty }.joined(separator: ", ")
    }

    private func detalleAlojamiento(_ r: ReservaViaje) -> String {
        var p: [String] = [r["direccion"]]
        if !r["entrada"].isEmpty { p.append("entrada " + LecturaViajes.fechaHora(r["entrada"])) }
        if !r["salida"].isEmpty { p.append("salida " + LecturaViajes.fechaHora(r["salida"])) }
        if !r["reserva"].isEmpty { p.append("reserva " + r["reserva"]) }
        return p.filter { !$0.isEmpty }.joined(separator: ", ")
    }

    private func lugares(_ v: Viaje) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(v.lugares.enumerated()), id: \.element.id) { i, l in
                if i > 0 { SeparadorFila(sangria: Medida.toque) }
                HStack(spacing: Medida.xxs) {
                    CasillaMarcar(hecha: l.visitado) { enviar(.lugarVisitado(id: l.id, visitado: !l.visitado)) }
                    Text(l.nombre).font(Letra.cuerpo).foregroundStyle(l.visitado ? Lienzo.tintaSecundaria : Lienzo.tinta).lineLimit(2)
                    Spacer(minLength: 0)
                }
                .accessibilityElement(children: .combine)
                .accessibilityValue(l.visitado ? "visitado" : "por visitar")
                .contextMenu { Button("borrar.", role: .destructive) { enviar(.quitarLugar(id: l.id)) } }
            }
            CampoAnadirViaje(placeholder: "un sitio que ver.", texto: $nuevoLugar, accion: anadirLugar)
                .padding(.top, v.lugares.isEmpty ? 0 : Medida.xs)
        }
        .tarjeta(relleno: Medida.s)
    }

    // renderTripListsTab: cada lista en su tarjeta con «x de y», sus cosas y un campo para añadir; al final, crear otra.
    private func listas(_ v: Viaje) -> some View {
        VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
            ForEach(v.listas) { l in
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(l.nombre.lowercased() + ".").font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta)
                        Text("\(l.hechos) de \(l.items.count)").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit()
                        Spacer()
                        Button("eliminar.") { listaABorrar = l }
                            .font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
                            .frame(minHeight: Medida.toque)
                            .buttonStyle(.pulsable(0.94))
                    }
                    .padding(.horizontal, Medida.xxs)
                    ForEach(Array(l.items.enumerated()), id: \.element.id) { i, it in
                        if i > 0 { SeparadorFila(sangria: Medida.toque) }
                        HStack(spacing: Medida.xxs) {
                            CasillaMarcar(hecha: it.hecho) { enviar(.itemListaHecho(listaId: l.id, id: it.id, hecho: !it.hecho)) }
                            Text(it.texto).font(Letra.cuerpo).foregroundStyle(it.hecho ? Lienzo.tintaSecundaria : Lienzo.tinta)
                                .strikethrough(it.hecho).lineLimit(2)
                            Spacer(minLength: 0)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityValue(it.hecho ? "hecho" : "pendiente")
                        .contextMenu { Button("borrar.", role: .destructive) { enviar(.quitarItemLista(listaId: l.id, id: it.id)) } }
                    }
                    CampoAnadirViaje(placeholder: "añadir.", texto: Binding(get: { nuevosItems[l.id] ?? "" }, set: { nuevosItems[l.id] = $0 })) { anadirItem(l.id) }
                        .padding(.top, Medida.xs)
                }
                .tarjeta(relleno: Medida.s)
            }
            CampoAnadirViaje(placeholder: "nueva lista (qué llevar…).", texto: $nuevaLista, boton: "crear.", accion: anadirLista)
                .tarjeta(relleno: Medida.s)
        }
    }

    // financeProGastosDelViaje: el total grande, lo que sale al día y cada gasto.
    private func gastos(_ v: Viaje) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if v.gastos.isEmpty && v.aMano == 0 {
                Text("en finanzas, marca los gastos de estos días como «gasto de viaje.» y aparecerán aquí.")
                    .font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                    .padding(.vertical, Medida.xs)
            }
            if !v.gastos.isEmpty {
                HStack(alignment: .lastTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("gastado en el viaje.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        Text(Dinero.formato(v.totalGastos)).font(Letra.numeroGrande).foregroundStyle(Lienzo.tinta)
                    }
                    Spacer()
                    if let dias = dias(v), dias > 0 {
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("al día.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                            Text(Dinero.formato(v.totalGastos / Decimal(dias))).font(Letra.numero).foregroundStyle(Lienzo.tinta)
                        }
                    }
                }
                .padding(.vertical, Medida.xs)
                .accessibilityElement(children: .combine)
                ForEach(v.gastos) { g in
                    SeparadorFila(sangria: 0)
                    HStack(spacing: Medida.s) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(g.nota.isEmpty ? "gasto." : g.nota).font(Letra.cuerpo).foregroundStyle(Lienzo.tinta).lineLimit(1)
                            Text(TextoViajes.fechaCorta(g.fecha, hoy: hoy)).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        }
                        Spacer()
                        Text(Dinero.formato(g.importe)).font(Letra.numero).foregroundStyle(Lienzo.tinta)
                    }
                    .frame(minHeight: Medida.toque)
                    .padding(.vertical, Medida.xxs)
                    .accessibilityElement(children: .combine)
                }
            }
            if v.aMano > 0 {
                if !v.gastos.isEmpty { SeparadorFila(sangria: 0) }
                HStack {
                    Text("apuntados a mano en el viaje.").font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                    Spacer()
                    Text(Dinero.formato(v.aMano)).font(Letra.numero).foregroundStyle(Lienzo.tinta)
                }
                .frame(minHeight: Medida.toque)
                .accessibilityElement(children: .combine)
            }
        }
        .tarjeta(relleno: Medida.s)
    }

    private func anadirLista() {
        let nombre = nuevaLista.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !nombre.isEmpty else { return }
        enviar(.lista(id: LecturaViajes.nuevoId("lista"), nombre: nombre))
        nuevaLista = ""
    }

    private func anadirItem(_ lid: String) {
        let texto = (nuevosItems[lid] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !texto.isEmpty else { return }
        enviar(.itemLista(listaId: lid, id: LecturaViajes.nuevoId("item"), texto: texto))
        nuevosItems[lid] = ""
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

    private func enviar(_ cambio: CambioViaje) { Task { await c.guardar(.cambiarViaje(viajeId: id, cambio: cambio)) } }

    private func cargar() async {
        let doc = await c.documentoVisible()
        let vid = id
        guard let nuevo = await ultimaGana({ doc.flatMap { LecturaViajes.viajes($0).first { $0.id == vid } } }) else { return }
        viaje = nuevo
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
    @State private var descartar = false
    @State private var original: [String]?

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

    // B10: lo que se guardaría frente a lo que había al abrir (`original` se toma al aparecer).
    private var clave: [String] {
        let ida = conFechas ? CalendarioBitacora.madrid.dia(de: inicio).iso : ""
        let vuelta = conFechas ? CalendarioBitacora.madrid.dia(de: max(fin, inicio)).iso : ""
        return [titulo, destino, ida, vuelta, companeros, notas].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    }
    private var cambiado: Bool { original.map { $0 != clave } ?? false }

    var body: some View {
        NavigationStack {
            FormCasa {
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
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { if cambiado { descartar = true } else { cerrar() } } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        let ida = conFechas ? CalendarioBitacora.madrid.dia(de: inicio).iso : ""
                        let vuelta = conFechas ? CalendarioBitacora.madrid.dia(de: max(fin, inicio)).iso : ""
                        let t = titulo.trimmingCharacters(in: .whitespacesAndNewlines)
                        let d = destino.trimmingCharacters(in: .whitespacesAndNewlines)
                        Task { if await c.guardar(.guardarViaje(id: id, titulo: t.isEmpty ? "Viaje a " + d : t, destino: d, inicio: ida, fin: vuelta,
                                                                    companeros: companeros.trimmingCharacters(in: .whitespacesAndNewlines),
                                                                    notas: notas.trimmingCharacters(in: .whitespacesAndNewlines))) { cerrar() } }
                    }.disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty && destino.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear { if original == nil { original = clave } }
            .preguntarAlDescartar(cambiado, preguntar: $descartar) { cerrar() }
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
            FormCasa {
                TextField("qué vas a hacer.", text: $titulo)
                TextField("lugar.", text: $lugar)
                Toggle("un día concreto.", isOn: $conDia)
                if conDia { DatePicker("día.", selection: $dia, displayedComponents: .date) }
                Toggle("a una hora.", isOn: $conHora)
                if conHora { DatePicker("hora.", selection: $hora, displayedComponents: .hourAndMinute) }
                TextField("notas.", text: $notas, axis: .vertical).lineLimit(1...4)
                if item != nil {
                    Section { Button("quitar del itinerario.", role: .destructive) {
                        Task { if await c.guardar(.cambiarViaje(viajeId: viajeId, cambio: .quitarItinerario(id: id))) { cerrar() } }
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
                        let sitio = lugar.trimmingCharacters(in: .whitespacesAndNewlines)
                        let localizar = !sitio.isEmpty && (item?.lugar != sitio || item?.lat == nil)
                        let coordinador = c, vid = viajeId, iid = id
                        Task {
                            guard await coordinador.guardar(.cambiarViaje(viajeId: vid, cambio: cambio)) else { return }
                            cerrar()
                            if localizar { await MapaViaje.localizar(coordinador, viajeId: vid, itemId: iid, lugar: sitio) }
                        }
                    }.disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
