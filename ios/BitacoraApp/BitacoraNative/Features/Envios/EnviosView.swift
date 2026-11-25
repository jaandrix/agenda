import SwiftUI
import UIKit

// Envíos (js/bajo-demanda/actualizaciones.js): `pedidos` en cinco pasos, con historial y los movimientos que trae la función
// seguimiento-pedidos (cada 2 horas en el servidor, o «actualizar.» aquí).

struct MovimientoPedido: Sendable, Identifiable, Equatable { let fecha, texto: String; var id: String { fecha + texto } }

struct Pedido: Sendable, Identifiable, Equatable {
    let id, titulo, tienda, seguimiento, url, fechaPedido, fechaEstimada, estado, fechaEntrega, ultimaNota: String
    let precio: Decimal?
    let movimientos: [MovimientoPedido]
    var paso: Int { LecturaEnvios.estados.firstIndex { $0.0 == estado } ?? 0 }
}

enum LecturaEnvios {
    static let estados: [(String, String, String)] = [("pedido", "pedido.", "pedido."), ("enviado", "enviado.", "enviado."), ("transito", "en camino.", "camino."),
                                                      ("reparto", "en reparto.", "reparto."), ("entregado", "entregado.", "llegó.")]
    static let tiendas = ["AliExpress", "Vinted", "Amazon", "Shein", "Temu", "Wallapop", "Zara", "Otra"]

    static func pedidos(_ doc: DocumentoBitacora) -> [Pedido] {
        (((try? doc.valor(de: "pedidos")) ?? nil)?.lista ?? []).compactMap { x -> Pedido? in
            guard let o = x.objeto, let id = o["id"]?.comoId else { return nil }
            let s = { (k: String) in o[k]?.texto ?? "" }
            let movs = (o["seguimientoAuto"]?["eventos"]?.lista ?? []).compactMap { m -> MovimientoPedido? in
                guard let t = m["texto"]?.texto else { return nil }
                return MovimientoPedido(fecha: m["fecha"]?.texto ?? "", texto: t)
            }.reversed()
            return Pedido(id: id, titulo: s("titulo"), tienda: s("tienda"), seguimiento: s("seguimiento"), url: s("url"), fechaPedido: s("fechaPedido"),
                          fechaEstimada: s("fechaEstimada"), estado: s("estado").isEmpty ? "pedido" : s("estado"), fechaEntrega: s("fechaEntrega"),
                          ultimaNota: (o["historial"]?.lista ?? []).last?["nota"]?.texto ?? "",
                          precio: Dinero.decimal(o["precio"]).flatMap { $0 > 0 ? $0 : nil }, movimientos: Array(movs))
        }
    }

    // textoLlegada.
    static func llegada(_ p: Pedido, hoy: LocalDay) -> String {
        if p.estado == "entregado" { return p.fechaEntrega.isEmpty ? "entregado." : "entregado el \(corta(p.fechaEntrega))." }
        guard let f = LocalDay(iso: p.fechaEstimada) else { return "sin fecha estimada." }
        let d = dias(desde: hoy, hasta: f)
        if d < 0 { return "debía llegar el \(corta(p.fechaEstimada))." }
        if d == 0 { return "llega hoy." }
        if d == 1 { return "llega mañana." }
        return "llega en \(d) días, \(corta(p.fechaEstimada))."
    }

    static func dias(desde a: LocalDay, hasta b: LocalDay) -> Int {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "UTC")!
        let f = { (d: LocalDay) in cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))! }
        return cal.dateComponents([.day], from: f(a), to: f(b)).day ?? 0
    }

    static func corta(_ iso: String) -> String {
        guard let d = LocalDay(iso: iso) else { return iso }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = CalendarioBitacora.madrid.zona
        guard let f = cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12)) else { return iso }
        let fmt = DateFormatter(); fmt.locale = Locale(identifier: "es_ES"); fmt.timeZone = CalendarioBitacora.madrid.zona; fmt.dateFormat = "EEE d MMM"
        return fmt.string(from: f)
    }

    // urlSeguimiento: la página del transportista si el número o el enlace lo es; si no, 17TRACK.
    static func urlSeguimiento(_ p: Pedido) -> URL? {
        let patron = #"^https?://[^/]*(inpost|correos|seur|gls|mrw|ups|dhl|dpd|nacex|ctt|17track|cainiao)\."#
        for u in [p.seguimiento, p.url] where u.range(of: patron, options: [.regularExpression, .caseInsensitive]) != nil { return URL(string: u) }
        let n = p.seguimiento.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? p.seguimiento
        return URL(string: "https://t.17track.net/es#nums=" + n)
    }

    static func esPaginaSeguimiento(_ u: String) -> Bool {
        u.range(of: #"^https?://[^/]*(inpost|correos|seur|gls|mrw|ups|dhl|dpd|nacex|ctt|17track|cainiao)\."#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    static func nuevoId() -> String {
        let letras = "abcdefghijklmnopqrstuvwxyz0123456789"
        return "ped_\(Int64(Date().timeIntervalSince1970 * 1000))_" + String((0..<4).map { _ in letras.randomElement()! })
    }
}

private struct EdicionPedido: Identifiable { let pedido: Pedido?; var id: String { pedido?.id ?? "nuevo" } }

struct EnviosView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.openURL) private var abrir
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var pedidos: [Pedido]?
    @State private var verEntregados = false
    @State private var edicion: EdicionPedido?
    @State private var consultando: String?
    @State private var pedidoABorrar: Pedido?
    @State private var aviso: String?

    private var hoy: LocalDay { CalendarioBitacora.madrid.dia(de: Date()) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "envíos.", subtitulo: subtitulo) {
                    BotonRedondo(sistema: "plus", tono: .oscuro, etiqueta: "nuevo pedido") { nuevo() }
                }
                .padding(.bottom, Medida.xxs)
                if let aviso {
                    Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        .padding(.horizontal, Medida.xxs)
                        .transition(.opacity.combined(with: .offset(y: -4)))
                }
                if let pedidos { lista(pedidos) }
                else { ProgressView().tint(Lienzo.tintaTerciaria).frame(maxWidth: .infinity).padding(.top, Medida.xl) }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: aviso)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .refreshable { await c.sincronizar() }.tareaVisible(id: c.revision) { await cargar() }
        .hoja(item: $edicion) { e in EditorPedido(pedido: e.pedido).environment(c) }
        .confirmarBorrado($pedidoABorrar, titulo: { "¿borrar el pedido «\($0.titulo)»?" }) { p in Task { await c.guardar(.borrarPedido(id: p.id)) } }
    }

    private var subtitulo: String? {
        guard let pedidos else { return nil }
        let n = pedidos.filter { $0.estado != "entregado" }.count
        return n == 0 ? "nada en camino." : "\(n) en camino."
    }

    private func nuevo() {
        Haptica.ligera()
        edicion = EdicionPedido(pedido: nil)
    }

    // El más cercano a llegar: el que va más avanzado y, a igualdad, el que antes se espera.
    static func masCercano(_ activos: [Pedido]) -> Pedido? {
        activos.min { a, b in
            if a.paso != b.paso { return a.paso > b.paso }
            return (a.fechaEstimada.isEmpty ? "9999" : a.fechaEstimada) < (b.fechaEstimada.isEmpty ? "9999" : b.fechaEstimada)
        }
    }

    @ViewBuilder private func lista(_ pedidos: [Pedido]) -> some View {
        let activos = pedidos.filter { $0.estado != "entregado" }
        let entregados = pedidos.filter { $0.estado == "entregado" }
        let primero = Self.masCercano(activos)
        let resto = activos.filter { $0.id != primero?.id }
        if let primero {
            EtiquetaSeccion(texto: "lo próximo")
            TarjetaOscura { contenido(primero, oscuro: true) }
                .contextMenu { Button("borrar pedido.", role: .destructive) { pedidoABorrar = primero } }
                .entradaEscalonada(0)
                .transition(.opacity.combined(with: .scale(scale: 0.97)))
        } else {
            TarjetaInvitacion(frase: "no esperas nada", destacado: "ahora mismo.", boton: "+ pedido.") { nuevo() }
                .transition(.opacity)
        }
        if !resto.isEmpty {
            EtiquetaSeccion(texto: "en camino").padding(.top, Medida.xs)
            ForEach(Array(resto.enumerated()), id: \.element.id) { i, p in
                tarjeta(p)
                    .entradaEscalonada(i + 1)
                    .transition(.opacity.combined(with: .scale(scale: 0.97)))
            }
        }
        if !entregados.isEmpty {
            SeccionPlegable(titulo: "entregados.", detalle: "\(entregados.count)", abierta: $verEntregados) {
                VStack(spacing: Medida.entreTarjetas) {
                    ForEach(Array(entregados.reversed().enumerated()), id: \.element.id) { i, p in
                        tarjeta(p).entradaEscalonada(i)
                    }
                }
                .padding(.top, Medida.xs)
            }
            .padding(.top, Medida.s)
        }
    }

    private func tarjeta(_ p: Pedido) -> some View {
        contenido(p, oscuro: false)
            .tarjeta()
            .contextMenu { Button("borrar pedido.", role: .destructive) { pedidoABorrar = p } }
    }

    private func contenido(_ p: Pedido, oscuro: Bool) -> some View {
        let retraso = p.estado != "entregado" && (LocalDay(iso: p.fechaEstimada).map { LecturaEnvios.dias(desde: hoy, hasta: $0) < 0 } ?? false)
        let entregado = p.estado == "entregado"
        let principal = oscuro ? Lienzo.sobreOscuro : Lienzo.tinta
        let secundaria = oscuro ? Lienzo.sobreOscuroSuave : Lienzo.tintaSecundaria
        let llegada: Color = retraso ? Lienzo.negativo : (entregado ? secundaria : (oscuro ? Lienzo.naranja : Lienzo.naranjaProfundo))
        let tienda = (p.tienda.isEmpty ? "otra" : p.tienda).lowercased() + "."
        return VStack(alignment: .leading, spacing: Medida.s) {
            HStack(alignment: .top, spacing: Medida.s) {
                IconoCuadrado(id: "envios", tono: oscuro ? .translucido : (entregado ? .claro : .suave))
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.titulo).font(Letra.tituloTarjeta).foregroundStyle(principal).lineLimit(2)
                    Text(p.precio.map { tienda + " " + Dinero.formato($0) } ?? tienda)
                        .font(Letra.pie).foregroundStyle(secundaria).monospacedDigit()
                }
                Spacer(minLength: 0)
                menu(p, oscuro: oscuro)
            }
            Text(LecturaEnvios.llegada(p, hoy: hoy)).font(Letra.pieFuerte).foregroundStyle(llegada)
            PasosEnvio(paso: p.paso, oscuro: oscuro)
            if !p.ultimaNota.isEmpty {
                Text(p.ultimaNota).font(Letra.pie).foregroundStyle(secundaria)
            }
            if !p.seguimiento.isEmpty {
                HStack(spacing: Medida.xs) {
                    Text(p.seguimiento).font(Letra.hora).foregroundStyle(secundaria).textSelection(.enabled).lineLimit(1)
                    Button { copiar(p) } label: {
                        Image(systemName: "doc.on.doc").font(.system(size: 12, weight: .semibold)).foregroundStyle(secundaria)
                            .frame(width: 32, height: 32).contentShape(Rectangle())
                    }
                    .buttonStyle(.pulsable(0.85))
                    .accessibilityLabel("copiar el número de seguimiento")
                }
            }
            if !p.movimientos.isEmpty { MovimientosEnvio(movimientos: p.movimientos, oscuro: oscuro) }
            if !entregado { acciones(p, oscuro: oscuro) }
        }
    }

    // Una acción principal a la vista (pasar al siguiente estado) y «actualizar.» si hay número; lo demás, en «···».
    private func acciones(_ p: Pedido, oscuro: Bool) -> some View {
        let siguiente = LecturaEnvios.estados[min(p.paso + 1, LecturaEnvios.estados.count - 1)]
        return HStack(spacing: Medida.xs) {
            Button("→ " + siguiente.1) {
                if siguiente.0 == "entregado" { Haptica.exito() } else { Haptica.media() }
                Task { await c.guardar(.estadoPedido(id: p.id, estado: siguiente.0, hoy: hoy.iso)) }
            }
            .buttonStyle(.capsula(oscuro ? .naranja : .oscuro))
            if !p.seguimiento.isEmpty {
                Button(consultando == p.id ? "consultando..." : "actualizar.") { Task { await actualizar(p) } }
                    .buttonStyle(.capsula(oscuro ? .blanco : .claro))
                    .disabled(consultando != nil)
            }
        }
        .padding(.top, Medida.xxs)
    }

    private func menu(_ p: Pedido, oscuro: Bool) -> some View {
        Menu {
            Button("editar.") { edicion = EdicionPedido(pedido: p) }
            if !p.seguimiento.isEmpty, let u = LecturaEnvios.urlSeguimiento(p) { Button("seguir envío.") { abrir(u) } }
            if !p.url.isEmpty, !LecturaEnvios.esPaginaSeguimiento(p.url), let u = URL(string: p.url) { Button("ver pedido.") { abrir(u) } }
            if !p.seguimiento.isEmpty { Button("copiar el número.") { copiar(p) } }
            Button("borrar pedido.", role: .destructive) { pedidoABorrar = p }
        } label: {
            Image(systemName: "ellipsis").font(.system(size: 14, weight: .bold))
                .foregroundStyle(oscuro ? Lienzo.sobreOscuroSuave : Lienzo.tintaSecundaria)
                .frame(width: Medida.toque, height: Medida.toque).contentShape(Rectangle())
        }
        .padding(.top, -10).padding(.trailing, -10)
        .accessibilityLabel("opciones de «\(p.titulo)»")
    }

    private func copiar(_ p: Pedido) {
        UIPasteboard.general.string = p.seguimiento
        Haptica.ligera()
        aviso = "número copiado."
    }
    // actualizarPedido: la función consulta el transportista y guarda el resultado en la nube; luego se trae.
    private func actualizar(_ p: Pedido) async {
        guard consultando == nil else { return }
        consultando = p.id
        defer { consultando = nil }
        do {
            let s = try await c.entorno.auth.sesionValida()
            let cuerpo = try JSONSerialization.data(withJSONObject: ["pedido": p.id])
            let cliente = c.entorno.cliente
            let (d, codigo) = try await cliente.enviar(cliente.peticion("functions/v1/seguimiento-pedidos", metodo: "POST", token: s.accessToken, cuerpo: cuerpo, tiempo: 25))
            let j = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any]
            guard codigo == 200 else { aviso = "no se pudo actualizar el pedido."; return }
            let informe = ((j?["resumen"] as? [[String: Any]])?.first?["informe"] as? [[String: Any]]) ?? []
            if informe.isEmpty { aviso = "este número aún no se puede seguir automáticamente." }
            else if let e = informe[0]["error"] as? String { aviso = "no se pudo consultar: " + e }
            else { aviso = (informe[0]["a"] as? String).map { $0 != (informe[0]["de"] as? String) } == true ? "pedido actualizado." : "sin novedades." }
            await c.sincronizar()
        } catch {
            aviso = "no se pudo actualizar el pedido."
        }
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        guard let nuevo = await ultimaGana({ doc.map { LecturaEnvios.pedidos($0) } }) else { return }
        pedidos = nuevo
    }
}

private struct EditorPedido: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let pedido: Pedido?
    @State private var titulo: String
    @State private var tienda: String
    @State private var seguimiento: String
    @State private var url: String
    @State private var conFechaPedido: Bool
    @State private var fechaPedido: Date
    @State private var conEstimada: Bool
    @State private var estimada: Date
    @State private var precio: String
    @State private var estado: String
    @State private var nota = ""
    @State private var id: String
    @State private var confirmarBorrado = false

    init(pedido: Pedido?) {
        self.pedido = pedido
        let fecha = { (iso: String) -> Date? in
            guard let d = LocalDay(iso: iso) else { return nil }
            var cal = Calendar(identifier: .gregorian); cal.timeZone = CalendarioBitacora.madrid.zona
            return cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))
        }
        _titulo = State(initialValue: pedido?.titulo ?? ""); _tienda = State(initialValue: pedido?.tienda ?? "")
        _seguimiento = State(initialValue: pedido?.seguimiento ?? ""); _url = State(initialValue: pedido?.url ?? "")
        _conFechaPedido = State(initialValue: pedido.map { !$0.fechaPedido.isEmpty } ?? true)
        _fechaPedido = State(initialValue: fecha(pedido?.fechaPedido ?? "") ?? Date())
        _conEstimada = State(initialValue: !(pedido?.fechaEstimada ?? "").isEmpty)
        _estimada = State(initialValue: fecha(pedido?.fechaEstimada ?? "") ?? Date())
        _precio = State(initialValue: pedido?.precio.map { NSDecimalNumber(decimal: $0).stringValue } ?? "")
        _estado = State(initialValue: pedido?.estado ?? "pedido")
        _id = State(initialValue: pedido?.id ?? LecturaEnvios.nuevoId())
    }

    var body: some View {
        NavigationStack {
            FormCasa {
                TextField("qué has pedido.", text: $titulo)
                Picker("tienda.", selection: $tienda) {
                    Text("sin decir.").tag("")
                    ForEach(LecturaEnvios.tiendas, id: \.self) { Text($0.lowercased() + ".").tag($0) }
                    if !tienda.isEmpty && !LecturaEnvios.tiendas.contains(tienda) { Text(tienda.lowercased() + ".").tag(tienda) }
                }
                TextField("número de seguimiento.", text: $seguimiento).textInputAutocapitalization(.characters).autocorrectionDisabled()
                TextField("enlace del pedido.", text: $url).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                Toggle("fecha del pedido.", isOn: $conFechaPedido)
                if conFechaPedido { DatePicker("pedido el.", selection: $fechaPedido, displayedComponents: .date) }
                Toggle("llegada estimada.", isOn: $conEstimada)
                if conEstimada { DatePicker("llega el.", selection: $estimada, displayedComponents: .date) }
                TextField("precio.", text: $precio).keyboardType(.decimalPad)
                Picker("estado.", selection: $estado) { ForEach(LecturaEnvios.estados, id: \.0) { e in Text(e.1).tag(e.0) } }
                TextField("nota (se apunta en el historial).", text: $nota)
                if pedido != nil { Section { Button("borrar pedido.", role: .destructive) { confirmarBorrado = true } } }
            }
            .environment(\.locale, Locale(identifier: "es_ES"))
            .navigationTitle(pedido == nil ? "nuevo pedido." : "pedido.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        let dia = { (d: Date) in CalendarioBitacora.madrid.dia(de: d).iso }
                        let op = OperacionBitacora.guardarPedido(id: id, titulo: titulo, tienda: tienda, seguimiento: seguimiento, url: url,
                                                                  fechaPedido: conFechaPedido ? dia(fechaPedido) : "", fechaEstimada: conEstimada ? dia(estimada) : "",
                                                                  precio: precio.replacingOccurrences(of: ",", with: "."), estado: estado, nota: nota,
                                                                  hoy: CalendarioBitacora.madrid.dia(de: Date()).iso)
                        Task { if await c.guardar(op) { cerrar() } }
                    }.disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .confirmationDialog("¿borrar este pedido?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("borrar.", role: .destructive) { Task { if await c.guardar(.borrarPedido(id: id)) { cerrar() } } }
                Button("cancelar.", role: .cancel) {}
            }
        }
    }
}

// Los cinco pasos de un pedido como segmentos que se llenan de izquierda a derecha con un muelle, uno tras otro.
struct PasosEnvio: View {
    let paso: Int
    var oscuro = false
    @State private var lleno = -1
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        let estados = LecturaEnvios.estados
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                ForEach(0..<estados.count, id: \.self) { i in
                    Capsule().fill(oscuro ? Lienzo.filoOscuro : Lienzo.sutil)
                        .overlay(alignment: .leading) {
                            Capsule().fill(Lienzo.naranja)
                                .scaleEffect(x: i <= lleno ? 1 : 0.001, anchor: .leading)
                                .animation(Muelle.o(Muelle.expandir, reducido: sinMovimiento).delay(sinMovimiento ? 0 : Double(i) * 0.07), value: lleno)
                        }
                        .frame(height: 5)
                }
            }
            HStack(spacing: 4) {
                ForEach(0..<estados.count, id: \.self) { i in
                    Text(estados[i].2)
                        .font(i == paso ? Letra.pieFuerte : Letra.pie)
                        .foregroundStyle(color(i))
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .onAppear { lleno = paso }
        .onChange(of: paso) { _, nuevo in lleno = nuevo }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("estado")
        .accessibilityValue(estados[min(max(paso, 0), estados.count - 1)].1)
    }

    private func color(_ i: Int) -> Color {
        if i == paso { return oscuro ? Lienzo.sobreOscuro : Lienzo.tinta }
        if i < paso { return oscuro ? Lienzo.sobreOscuroSuave : Lienzo.tintaSecundaria }
        return oscuro ? Lienzo.sobreOscuroTenue : Lienzo.tintaTerciaria
    }
}

// Los movimientos del transportista, plegados; se abren con un muelle. Vale sobre blanco y sobre la tarjeta oscura.
struct MovimientosEnvio: View {
    let movimientos: [MovimientoPedido]
    var oscuro = false
    @State private var abierto = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        let principal = oscuro ? Lienzo.sobreOscuro : Lienzo.tinta
        let secundaria = oscuro ? Lienzo.sobreOscuroSuave : Lienzo.tintaSecundaria
        VStack(alignment: .leading, spacing: Medida.xs) {
            Button {
                Haptica.ligera()
                withAnimation(Muelle.o(Muelle.expandir, reducido: sinMovimiento)) { abierto.toggle() }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold))
                        .rotationEffect(.degrees(abierto ? 90 : 0))
                    Text("movimientos.").font(Letra.pieFuerte)
                    Text("\(movimientos.count)").font(Letra.pie).monospacedDigit()
                    Spacer(minLength: 0)
                }
                .foregroundStyle(secundaria)
                .frame(minHeight: Medida.toque)
                .contentShape(Rectangle())
            }
            .buttonStyle(Pulsable(escala: 0.98, haptica: false))
            .accessibilityValue(abierto ? "abiertos" : "plegados")
            if abierto {
                VStack(alignment: .leading, spacing: Medida.s) {
                    ForEach(Array(movimientos.enumerated()), id: \.offset) { i, m in
                        HStack(alignment: .top, spacing: Medida.xs) {
                            Puntito(color: i == 0 ? Lienzo.naranja : (oscuro ? Lienzo.sobreOscuroTenue : Lienzo.tintaTerciaria), tamano: 6)
                                .padding(.top, 5)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(m.texto).font(Letra.pie).foregroundStyle(principal)
                                Text(String(m.fecha.replacingOccurrences(of: "T", with: " ").prefix(16)))
                                    .font(Letra.hora).foregroundStyle(secundaria)
                            }
                            Spacer(minLength: 0)
                        }
                    }
                }
                .padding(.bottom, Medida.xs)
                .transition(.opacity.combined(with: .offset(y: -6)))
            }
        }
        .clipped()
    }
}
