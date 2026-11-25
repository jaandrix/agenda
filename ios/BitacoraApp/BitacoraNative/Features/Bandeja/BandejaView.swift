import SwiftUI
import UserNotifications

// Bandeja del conector (js/conector.js): lo que Claude, ChatGPT, Siri o el correo dejan en `conector_bandeja`.
// Igual que la web, lo automático (OPS_AUTOMATICAS) se aplica solo, con línea en `registroConector` y deshacer; el dinero
// y los borrados esperan a que se acepten o rechacen aquí. Lo que el iPhone aún no sabe aplicar se queda en el servidor
// para la web, sin perderse.
struct FilaBandeja: Identifiable, Equatable, Sendable {
    let id: String
    let op: [String: JSONValue]
    let creado: String
    var tipo: String { op["tipo"]?.texto ?? "" }
}

@MainActor
@Observable
final class EstadoBandeja {
    static let shared = EstadoBandeja()
    var pendientes: [FilaBandeja] = []
    var enLaWeb = 0
    var error: String?
    @ObservationIgnored var ultima = Date.distantPast
    @ObservationIgnored var revisando = false
}

@MainActor
enum BandejaConector {
    static let automaticas: Set<String> = ["evento", "inversion", "editar_evento", "entrada", "ocio", "tarjetas", "compra", "ticket", "receta", "proyecto",
                                           "apuntar", "correo", "pedido", "objetivo", "laboral", "profe", "test", "tarea", "editar_tarea", "tarea_recurrente",
                                           "estudio_crear", "estudio_editar", "clase", "nota", "habito", "dia", "enlace", "deseo", "entrada_crear", "entrada_editar"]
    private static let claveVistas = "bitacora.bandeja.avisadas"

    static func ahoraISO() -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: Date())
    }

    static func leer(_ c: AppCoordinator) async throws -> [FilaBandeja] {
        let s = try await c.entorno.auth.sesionValida()
        let cl = c.entorno.cliente
        let (d, codigo) = try await cl.enviar(cl.peticion("rest/v1/conector_bandeja", consulta: [
            URLQueryItem(name: "select", value: "id,op,creado"), URLQueryItem(name: "order", value: "creado")], token: s.accessToken))
        guard codigo == 200 else { throw ErrorRed.servidor(codigo) }
        return (try LectorJSON.valor(d).lista ?? []).compactMap { f in
            guard let id = f["id"]?.comoId, let op = f["op"]?.objeto else { return nil }
            return FilaBandeja(id: id, op: op, creado: f["creado"]?.texto ?? "")
        }
    }

    static func borrar(_ ids: [String], _ c: AppCoordinator) async {
        guard !ids.isEmpty, let s = try? await c.entorno.auth.sesionValida() else { return }
        let cl = c.entorno.cliente
        _ = try? await cl.enviar(cl.peticion("rest/v1/conector_bandeja", consulta: [URLQueryItem(name: "id", value: "in.(\(ids.joined(separator: ",")))")],
                                             metodo: "DELETE", token: s.accessToken))
    }

    static func opConector(_ f: FilaBandeja, origen: String) -> OperacionBitacora {
        OperacionesExtra.op(OperacionesExtra.conector, ["ref": .string("ia_" + f.id), "op": .object(f.op), "origen": .string(origen),
                                                        "cuando": .string(ahoraISO()), "hoy": .string(CalendarioBitacora.madrid.dia(de: Date()).iso),
                                                        "ahoraMs": .number(String(Int64(Date().timeIntervalSince1970 * 1000)))])
    }

    // aplicarBandejaConector: como mucho cada 30 s, al sincronizar y al volver a la app.
    static func revisar(_ c: AppCoordinator, forzar: Bool = false) async {
        let e = EstadoBandeja.shared
        guard c.sesion != nil, !e.revisando, forzar || Date().timeIntervalSince(e.ultima) > 30 else { return }
        e.revisando = true
        defer { e.revisando = false }
        guard let filas = try? await leer(c) else { return }
        e.ultima = Date()
        let doc = await c.documentoVisible()
        let eventos = Set((((try? doc?.valor(de: "entries")) ?? nil)?.lista ?? []).compactMap { $0["id"]?.comoId })
        var nuevos = Set<String>()
        var aplicar: [FilaBandeja] = []
        for f in filas where automaticas.contains(f.tipo) && OperacionesExtra.sabeAplicar(f.op) {
            // Una entrada cuyo evento aún no está (lo crea otra fila que la web no ha aplicado) espera a la siguiente vuelta.
            if f.tipo == "entrada", let eid = f.op["eventoId"]?.comoId, !eventos.contains(eid), !nuevos.contains(eid) { continue }
            if f.tipo == "evento" { nuevos.insert("ia_" + f.id) }
            aplicar.append(f)
        }
        if !aplicar.isEmpty, await c.guardar(aplicar.map { opConector($0, origen: "auto") }) {
            await borrar(aplicar.map(\.id), c)
            c.avisar(resumen(aplicar))
        }
        let hechas = Set(aplicar.map(\.id))
        e.pendientes = filas.filter { !automaticas.contains($0.tipo) }
        e.enLaWeb = filas.filter { automaticas.contains($0.tipo) && !hechas.contains($0.id) }.count
        await avisarNuevas(e.pendientes)
    }

    // «Claude añadió 3 tareas y 1 evento».
    static func resumen(_ filas: [FilaBandeja]) -> String {
        let origenes = Set(filas.map { $0.op["origen"]?.texto == "siri" ? "Siri" : ($0.op["origen"]?.texto == "correo" || $0.tipo == "correo") ? "tu correo" : "Claude" })
        let quien = origenes.count == 1 ? origenes.first! : "fuera de la app"
        let nombres: [String: (String, String)] = ["tarea": ("tarea", "tareas"), "correo": ("tarea", "tareas"), "evento": ("evento", "eventos"),
                                                   "pedido": ("envío", "envíos"), "entrada": ("entrada con qr", "entradas con qr"), "nota": ("nota", "notas"),
                                                   "editar_tarea": ("cambio de tarea", "cambios de tareas"), "habito": ("rutina", "rutinas"),
                                                   "tarea_recurrente": ("tarea recurrente", "tareas recurrentes"), "enlace": ("enlace", "enlaces"),
                                                   "entrada_crear": ("entrada", "entradas")]
        var cuenta: [String: Int] = [:]
        var orden: [String] = []
        for f in filas {
            let n = nombres[f.tipo] ?? ("cambio", "cambios")
            if cuenta[n.0] == nil { orden.append(n.0) }
            cuenta[n.0, default: 0] += 1
        }
        let partes = orden.map { k -> String in
            let n = cuenta[k]!
            let plural = nombres.values.first { $0.0 == k }?.1 ?? k + "s"
            return "\(n) \(n == 1 ? k : plural)"
        }
        let lista = partes.count > 1 ? partes.dropLast().joined(separator: ", ") + " y " + partes.last! : partes.first ?? ""
        return quien == "tu correo" ? "llegó de tu correo: \(lista)." : "\(quien) añadió \(lista)."
    }

    // Notificación local la primera vez que se ve una propuesta que espera validación.
    static func avisarNuevas(_ pendientes: [FilaBandeja]) async {
        var vistas = Set(UserDefaults.standard.stringArray(forKey: claveVistas) ?? [])
        let nuevas = pendientes.filter { !vistas.contains($0.id) }
        guard !nuevas.isEmpty else { return }
        vistas.formUnion(nuevas.map(\.id))
        UserDefaults.standard.set(Array(vistas.suffix(400)), forKey: claveVistas)
        let centro = UNUserNotificationCenter.current()
        var estado = await centro.notificationSettings().authorizationStatus
        if estado == .notDetermined {
            _ = try? await centro.requestAuthorization(options: [.alert, .sound, .badge])
            estado = await centro.notificationSettings().authorizationStatus
        }
        guard estado == .authorized || estado == .provisional else { return }
        let contenido = UNMutableNotificationContent()
        contenido.title = "propuestas."
        contenido.body = nuevas.count == 1 ? "\(describir(nuevas[0].op).tipo): \(describir(nuevas[0].op).texto). espera que lo valides."
            : "Claude propone \(nuevas.count) cambios que esperan que los valides."
        contenido.sound = .default
        contenido.userInfo = ["url": "bitacora://bandeja"]
        try? await centro.add(UNNotificationRequest(identifier: "bandeja-\(nuevas[0].id)", content: contenido, trigger: nil))
    }

    // describirOpConector, en corto, para lo que suele esperar validación.
    static func describir(_ op: [String: JSONValue]) -> (tipo: String, texto: String, meta: String) {
        let t = { (k: String) in op[k]?.texto ?? "" }
        let importe = op["importe"].map { $0.texto ?? EscritorJSON.texto($0) } ?? ""
        switch t("tipo") {
        case "movimiento": return (t("type") == "income" ? "nuevo ingreso" : "nuevo gasto", "\(importe) €, \(t("concepto").isEmpty ? "sin concepto" : t("concepto"))", [t("fecha"), t("cuenta")].filter { !$0.isEmpty }.joined(separator: ", "))
        case "editar_movimiento": return ("corregir movimiento", "«\(t("resumen"))»", "")
        case "importar": return ("importar extracto", "\(max(0, t("csv").split(whereSeparator: \.isNewline).count - 1)) filas", t("cuenta"))
        case "borrar": return ("borrar \(t("coleccion"))", t("resumen"), "se puede deshacer después")
        case "tarea": return ("nueva tarea", "«\(t("titulo"))»", t("fecha"))
        case "evento": return ("nuevo evento", "«\(t("titulo"))»", t("fecha"))
        default: return (t("tipo").replacingOccurrences(of: "_", with: " "), t("titulo").isEmpty ? t("resumen") : "«\(t("titulo"))»", t("fecha"))
        }
    }
}

// Propuestas 2.0 (24-11): cada propuesta en su tarjeta blanca con el icono del tipo, el cambio resumido y «validar.» /
// «descartar.» en cápsulas; al validarla o descartarla sale de la lista con un muelle. Lo último, en una tarjeta de filas.
struct BandejaView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var estado = EstadoBandeja.shared
    @State private var registro: [[String: JSONValue]] = []
    @State private var verTodo = false
    @State private var trabajando = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "propuestas.",
                               subtitulo: estado.pendientes.isEmpty ? "nada esperando." : "\(estado.pendientes.count) esperan tu visto bueno.")
                    .padding(.bottom, Medida.xs)

                EtiquetaSeccion(texto: "esperan tu validación")
                if estado.pendientes.isEmpty {
                    EstadoVacio(texto: "lo que proponga claude con dinero o para borrar aparecerá aquí.", icono: "propuestas")
                        .tarjeta()
                        .transition(.opacity)
                } else {
                    if estado.pendientes.count > 1 {
                        HStack(spacing: Medida.xs) {
                            Button("validar todo.") { aceptar(estado.pendientes) }.buttonStyle(.capsula(.oscuro, ancho: true))
                            Button("descartar todo.") { rechazar(estado.pendientes) }.buttonStyle(.capsula(.claro, ancho: true))
                        }
                        .transition(.opacity)
                    }
                    ForEach(Array(estado.pendientes.enumerated()), id: \.element.id) { i, f in
                        tarjeta(f)
                            .entradaEscalonada(i)
                            .transition(sinMovimiento ? .opacity : .asymmetric(
                                insertion: .opacity,
                                removal: .move(edge: .trailing).combined(with: .scale(scale: 0.92)).combined(with: .opacity)))
                    }
                }
                if estado.enLaWeb > 0 {
                    Text("\(estado.enLaWeb) \(estado.enLaWeb == 1 ? "cambio se aplicará" : "cambios se aplicarán") al abrir la web (ocio, despensa, estudios…).")
                        .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        .padding(.horizontal, Medida.xxs)
                }

                EtiquetaSeccion(texto: "lo último")
                    .padding(.top, Medida.entreSecciones - Medida.entreTarjetas)
                ultimo
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: estado.pendientes.map(\.id))
            .animation(Muelle.o(Muelle.expandir, reducido: sinMovimiento), value: verTodo)
        }
        .fondoLienzo().scrollIndicators(.hidden)
        .refreshable { await c.sincronizar(); await BandejaConector.revisar(c, forzar: true) }
        .task { await BandejaConector.revisar(c, forzar: true) }
        .tareaVisible(id: c.revision) { await cargarRegistro() }
        .disabled(trabajando)
    }

    // MARK: - Propuesta

    private func tarjeta(_ f: FilaBandeja) -> some View {
        let d = BandejaConector.describir(f.op)
        let sabe = OperacionesExtra.sabeAplicar(f.op)
        return VStack(alignment: .leading, spacing: Medida.m) {
            HStack(alignment: .top, spacing: Medida.s) {
                IconoCuadrado(id: Self.icono(f.tipo), tono: f.tipo == "borrar" ? .oscuro : .claro)
                VStack(alignment: .leading, spacing: 3) {
                    Text(d.tipo.uppercased()).font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.tintaTerciaria)
                    Text(d.texto).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta)
                        .fixedSize(horizontal: false, vertical: true)
                    if !d.meta.isEmpty {
                        Text(d.meta).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    }
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)
            HStack(spacing: Medida.xs) {
                if sabe {
                    Button("validar.") { aceptar([f]) }.buttonStyle(.capsula(.oscuro, ancho: true))
                } else {
                    Button("validar en la web.") { c.web = Apartados.webURL("bandeja") }.buttonStyle(.capsula(.oscuro, ancho: true))
                }
                Button("descartar.") { rechazar([f]) }.buttonStyle(.capsula(.claro, ancho: true))
            }
        }
        .tarjeta()
        .accessibilityElement(children: .contain)
    }

    // El tipo de propuesta → el icono del catálogo común.
    private static func icono(_ tipo: String) -> String {
        switch tipo {
        case "movimiento", "editar_movimiento", "importar", "inversion": return "finanzas"
        case "borrar": return "borrar"
        case "tarea", "editar_tarea", "tarea_recurrente": return "plan"
        case "evento", "editar_evento": return "calendario"
        case "nota": return "notas"
        default: return "propuestas"
        }
    }

    // MARK: - Lo último

    @ViewBuilder private var ultimo: some View {
        if registro.isEmpty {
            EstadoVacio(texto: "aún no hay nada.").tarjeta()
        } else {
            let lineas = verTodo ? registro : Array(registro.prefix(8))
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(lineas.enumerated()), id: \.offset) { n, l in
                    if n > 0 { SeparadorFila(sangria: 0) }
                    linea(l)
                }
            }
            .tarjeta(relleno: 0)
            if registro.count > 8 {
                Button(verTodo ? "ver solo lo último." : "ver todo el historial (\(registro.count)).") {
                    Haptica.ligera()
                    verTodo.toggle()
                }
                .buttonStyle(.capsula(.blanco, ancho: true))
            }
        }
    }

    private func linea(_ l: [String: JSONValue]) -> some View {
        let origen = l["origen"]?.texto ?? ""
        let deshecho = l["deshecho"]?.booleano == true
        return HStack(alignment: .center, spacing: Medida.s) {
            VStack(alignment: .leading, spacing: 2) {
                Text(l["resumen"]?.texto ?? "").font(Letra.cuerpo)
                    .foregroundStyle(deshecho ? Lienzo.tintaTerciaria : Lienzo.tinta).strikethrough(deshecho)
                Text([origen == "auto" ? "aplicado solo" : origen == "validado" ? "validado" : origen == "descartado" ? "descartado" : origen,
                      deshecho ? "deshecho" : ""].filter { !$0.isEmpty }.joined(separator: ", ") + ".")
                    .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
            }
            Spacer(minLength: Medida.xs)
            if OperacionesExtra.sePuedeDeshacer(l), let ref = l["id"]?.comoId {
                Button("deshacer.") { deshacer(ref) }
                    .font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta)
                    .frame(minHeight: Medida.toque)
                    .buttonStyle(.pulsable(0.92))
            }
        }
        .padding(.horizontal, Medida.rellenoTarjeta)
        .padding(.vertical, Medida.s)
    }

    private func cargarRegistro() async {
        guard let doc = await c.documentoVisible() else { return }
        registro = (((try? doc.valor(de: "registroConector")) ?? nil)?.lista ?? []).compactMap(\.objeto)
    }

    private func aceptar(_ filas: [FilaBandeja]) {
        let sabe = filas.filter { OperacionesExtra.sabeAplicar($0.op) }
        guard !sabe.isEmpty else { return }
        trabajando = true
        Task {
            defer { trabajando = false }
            do {
                try await c.encolar(sabe.map { BandejaConector.opConector($0, origen: "validado") })
                await BandejaConector.borrar(sabe.map(\.id), c)
                Haptica.exito()
                withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento)) {
                    estado.pendientes.removeAll { f in sabe.contains { $0.id == f.id } }
                }
                c.avisar(sabe.count == 1 ? "cambio validado." : "\(sabe.count) cambios validados.")
                await cargarRegistro()
            } catch { c.avisar("no se pudo guardar en este iphone.") }
        }
    }

    private func rechazar(_ filas: [FilaBandeja]) {
        trabajando = true
        Task {
            defer { trabajando = false }
            let ops = filas.map { f -> OperacionBitacora in
                let d = BandejaConector.describir(f.op)
                return OperacionesExtra.op(OperacionesExtra.descartarConector, ["ref": .string("ia_" + f.id), "cuando": .string(BandejaConector.ahoraISO()),
                                                                                "tipo": .string(f.tipo), "resumen": .string("\(d.tipo): \(d.texto)")])
            }
            do {
                try await c.encolar(ops)
                await BandejaConector.borrar(filas.map(\.id), c)
                Haptica.media()
                withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento)) {
                    estado.pendientes.removeAll { f in filas.contains { $0.id == f.id } }
                }
                c.avisar(filas.count == 1 ? "cambio descartado." : "\(filas.count) cambios descartados.")
                await cargarRegistro()
            } catch { c.avisar("no se pudo guardar en este iphone.") }
        }
    }

    private func deshacer(_ ref: String) {
        Task {
            await c.guardar(OperacionesExtra.op(OperacionesExtra.quitarConector, ["ref": .string(ref)]))
            Haptica.ligera()
            c.avisar("deshecho.")
            await cargarRegistro()
        }
    }
}
