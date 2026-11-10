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
    @State private var pedidos: [Pedido]?
    @State private var verEntregados = false
    @State private var edicion: EdicionPedido?
    @State private var consultando: String?
    @State private var aviso: String?

    private var hoy: LocalDay { CalendarioBitacora.madrid.dia(de: Date()) }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                CabeceraContexto(titulo: "envíos", detalle: pedidos.map { "\($0.filter { $0.estado != "entregado" }.count) en camino." }) {
                    Text("tus pedidos.").font(Tipo.poppins(24, .bold, estilo: .title3)).foregroundStyle(Paleta.sobreContexto)
                    Text("dónde está cada paquete.").font(Tipo.pie).foregroundStyle(Paleta.sobreContextoSuave)
                }
                VStack(alignment: .leading, spacing: 0) {
                    HStack { Spacer(); AccionTexto(texto: "+ pedido.") { edicion = EdicionPedido(pedido: nil) } }.padding(.vertical, Espacio.xs)
                    if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.bottom, Espacio.xs) }
                    if let pedidos {
                        let activos = pedidos.filter { $0.estado != "entregado" }
                        let entregados = pedidos.filter { $0.estado == "entregado" }
                        if activos.isEmpty { Text("no esperas nada ahora mismo.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.l) }
                        ForEach(activos) { tarjeta($0) }
                        if !entregados.isEmpty {
                            AccionTexto(texto: verEntregados ? "ocultar los entregados." : "ver los entregados (\(entregados.count)).") { verEntregados.toggle() }.padding(.top, Espacio.m)
                            if verEntregados { ForEach(entregados.reversed()) { tarjeta($0) } }
                        }
                    } else { ProgressView().frame(maxWidth: .infinity).padding(.top, Espacio.xl) }
                }.modifier(HojaContenido())
            }
        }
        .background(Paleta.fondo.ignoresSafeArea()).scrollIndicators(.hidden)
        .refreshable { await c.sincronizar() }.task(id: c.informe.revision) { await cargar() }
        .sheet(item: $edicion) { e in EditorPedido(pedido: e.pedido).environment(c) }
    }

    private func tarjeta(_ p: Pedido) -> some View {
        let retraso = p.estado != "entregado" && (LocalDay(iso: p.fechaEstimada).map { LecturaEnvios.dias(desde: hoy, hasta: $0) < 0 } ?? false)
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text((p.tienda.isEmpty ? "otra" : p.tienda).lowercased() + ".").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                Spacer()
                if let precio = p.precio { Text(Dinero.formato(precio)).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
            }
            Text(p.titulo).font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto)
            Text(LecturaEnvios.llegada(p, hoy: hoy)).font(Tipo.pie).foregroundStyle(retraso ? Paleta.error : (p.estado == "entregado" ? Paleta.textoSecundario : Paleta.acento))
            HStack(spacing: 4) {
                ForEach(0..<LecturaEnvios.estados.count, id: \.self) { i in
                    let e = LecturaEnvios.estados[i]
                    VStack(spacing: 3) {
                        Capsule().fill(i <= p.paso ? Paleta.acento : Paleta.borde).frame(height: 4)
                        Text(e.2).font(Tipo.poppins(10.5, i == p.paso ? .semibold : .regular, estilo: .caption2))
                            .foregroundStyle(i == p.paso ? Paleta.texto : Paleta.textoSecundario)
                    }
                }
            }.accessibilityElement(children: .ignore).accessibilityLabel("estado").accessibilityValue(LecturaEnvios.estados[p.paso].1)
            if !p.ultimaNota.isEmpty { Text(p.ultimaNota).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
            if !p.movimientos.isEmpty {
                DisclosureGroup("movimientos. \(p.movimientos.count)") {
                    ForEach(p.movimientos) { m in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(m.fecha.replacingOccurrences(of: "T", with: " ").prefix(16)).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                            Text(m.texto).font(Tipo.pie).foregroundStyle(Paleta.texto)
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 2)
                    }
                }.font(Tipo.pie).tint(Paleta.textoSecundario)
            }
            if !p.seguimiento.isEmpty {
                HStack {
                    Text(p.seguimiento).font(.system(.footnote, design: .monospaced)).foregroundStyle(Paleta.textoSecundario).textSelection(.enabled)
                    AccionTexto(texto: "copiar.") { UIPasteboard.general.string = p.seguimiento; aviso = "número copiado." }
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Espacio.m) {
                    if p.estado != "entregado" {
                        let siguiente = LecturaEnvios.estados[min(p.paso + 1, LecturaEnvios.estados.count - 1)]
                        AccionTexto(texto: "→ " + siguiente.1) { Task { try? await c.encolar(.estadoPedido(id: p.id, estado: siguiente.0, hoy: hoy.iso)) } }
                    }
                    if !p.seguimiento.isEmpty && p.estado != "entregado" {
                        AccionTexto(texto: consultando == p.id ? "consultando..." : "actualizar.") { Task { await actualizar(p) } }
                    }
                    if !p.seguimiento.isEmpty, let u = LecturaEnvios.urlSeguimiento(p) { AccionTexto(texto: "seguir envío.") { abrir(u) } }
                    if !p.url.isEmpty, !LecturaEnvios.esPaginaSeguimiento(p.url), let u = URL(string: p.url) { AccionTexto(texto: "ver pedido.") { abrir(u) } }
                    AccionTexto(texto: "editar.") { edicion = EdicionPedido(pedido: p) }
                }
            }
        }
        .padding(.vertical, Espacio.m).overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
        .contextMenu { Button("borrar pedido.", role: .destructive) { Task { try? await c.encolar(.borrarPedido(id: p.id)) } } }
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
        pedidos = await Task.detached(priority: .userInitiated) { doc.map { LecturaEnvios.pedidos($0) } }.value
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
            Form {
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
                        Task { try? await c.encolar(op) }
                        cerrar()
                    }.disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .confirmationDialog("¿borrar este pedido?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("borrar.", role: .destructive) { Task { try? await c.encolar(.borrarPedido(id: id)) }; cerrar() }
                Button("cancelar.", role: .cancel) {}
            }
        }
    }
}
