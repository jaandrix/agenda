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
        if !aplicar.isEmpty, (try? await c.encolar(aplicar.map { opConector($0, origen: "auto") })) != nil {
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

struct BandejaView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var estado = EstadoBandeja.shared
    @State private var registro: [[String: JSONValue]] = []
    @State private var verTodo = false
    @State private var trabajando = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                CabeceraApartado(titulo: "propuestas", contexto: estado.pendientes.isEmpty ? "nada esperando." : "\(estado.pendientes.count) esperan tu visto bueno.") { EmptyView() }
                CabeceraSeccion(titulo: "esperan tu validación.", detalle: "")
                if estado.pendientes.isEmpty {
                    Text("lo que proponga claude con dinero o para borrar aparecerá aquí.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.m)
                } else {
                    if estado.pendientes.count > 1 {
                        HStack(spacing: Espacio.l) {
                            AccionTexto(texto: "aceptar todo.") { aceptar(estado.pendientes) }
                            AccionTexto(texto: "rechazar todo.", color: Paleta.error) { rechazar(estado.pendientes) }
                        }.padding(.vertical, Espacio.xs)
                    }
                    ForEach(estado.pendientes) { fila($0) }
                }
                if estado.enLaWeb > 0 {
                    Text("\(estado.enLaWeb) \(estado.enLaWeb == 1 ? "cambio se aplicará" : "cambios se aplicarán") al abrir la web (ocio, despensa, estudios…).")
                        .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.top, Espacio.s)
                }
                CabeceraSeccion(titulo: "lo último.", detalle: "")
                if registro.isEmpty {
                    Text("aún no hay nada.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.m)
                }
                ForEach(Array((verTodo ? registro : Array(registro.prefix(8))).enumerated()), id: \.offset) { _, l in linea(l) }
                if registro.count > 8 {
                    AccionTexto(texto: verTodo ? "ver solo lo último." : "ver todo el historial (\(registro.count)).") { verTodo.toggle() }.padding(.top, Espacio.s)
                }
            }
            .padding(.horizontal, 20).padding(.bottom, Espacio.xl)
        }
        .background(Paleta.fondo.ignoresSafeArea()).scrollIndicators(.hidden)
        .refreshable { await c.sincronizar(); await BandejaConector.revisar(c, forzar: true) }
        .task { await BandejaConector.revisar(c, forzar: true) }
        .task(id: c.informe.revision) { await cargarRegistro() }
        .disabled(trabajando)
    }

    private func fila(_ f: FilaBandeja) -> some View {
        let d = BandejaConector.describir(f.op)
        let sabe = OperacionesExtra.sabeAplicar(f.op)
        return VStack(alignment: .leading, spacing: 4) {
            Text(d.tipo + ".").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            Text(d.texto).font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto)
            if !d.meta.isEmpty { Text(d.meta).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
            HStack(spacing: Espacio.l) {
                if sabe { AccionTexto(texto: "aceptar.") { aceptar([f]) } }
                else { AccionTexto(texto: "validar en la web.") { c.web = Apartados.webURL("bandeja") } }
                AccionTexto(texto: "rechazar.", color: Paleta.error) { rechazar([f]) }
            }
        }
        .padding(.vertical, Espacio.s)
        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
        .accessibilityElement(children: .contain)
    }

    private func linea(_ l: [String: JSONValue]) -> some View {
        let origen = l["origen"]?.texto ?? ""
        let deshecho = l["deshecho"]?.booleano == true
        return HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(l["resumen"]?.texto ?? "").font(Tipo.cuerpo).foregroundStyle(deshecho ? Paleta.textoSecundario : Paleta.texto).strikethrough(deshecho)
                Text([origen == "auto" ? "aplicado solo" : origen == "validado" ? "aceptado" : origen == "descartado" ? "rechazado" : origen,
                      deshecho ? "deshecho" : ""].filter { !$0.isEmpty }.joined(separator: ", ") + ".")
                    .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            }
            Spacer()
            if OperacionesExtra.sePuedeDeshacer(l), let ref = l["id"]?.comoId {
                AccionTexto(texto: "deshacer.") { deshacer(ref) }
            }
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
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
                estado.pendientes.removeAll { f in sabe.contains { $0.id == f.id } }
                c.avisar(sabe.count == 1 ? "cambio aceptado." : "\(sabe.count) cambios aceptados.")
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
                estado.pendientes.removeAll { f in filas.contains { $0.id == f.id } }
                c.avisar(filas.count == 1 ? "cambio rechazado." : "\(filas.count) cambios rechazados.")
                await cargarRegistro()
            } catch { c.avisar("no se pudo guardar en este iphone.") }
        }
    }

    private func deshacer(_ ref: String) {
        Task {
            try? await c.encolar(OperacionesExtra.op(OperacionesExtra.quitarConector, ["ref": .string(ref)]))
            c.avisar("deshecho.")
            await cargarRegistro()
        }
    }
}
