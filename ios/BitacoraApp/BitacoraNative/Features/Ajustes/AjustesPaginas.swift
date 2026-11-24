import SwiftUI
import UIKit

// Las páginas que cuelgan de Ajustes (2.0). Misma piel que la principal: título pequeño-grande, grupos en tarjetas blancas.
struct PaginaAjustes<Contenido: View>: View {
    let titulo: String
    var contexto: String?
    @ViewBuilder var contenido: () -> Contenido

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                CabeceraPagina(titulo: titulo + ".", subtitulo: contexto)
                contenido()
            }
            .padding(.horizontal, Medida.margen)
            .padding(.bottom, Medida.entreSecciones)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .toolbar(.visible, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// Texto que se copia: el enlace del conector, de Siri, la dirección de correo o el calendario.
struct CajaCopiar: View {
    let texto: String
    let aviso: String
    @Environment(AppCoordinator.self) private var c

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(texto).font(Tipo.mono).foregroundStyle(Lienzo.tinta).textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Lienzo.fondo, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous).strokeBorder(Lienzo.filo))
            Button("copiar.") { UIPasteboard.general.string = texto; c.avisar(aviso) }.buttonStyle(.capsula(.oscuro, ancho: true))
        }
        .padding(Medida.rellenoTarjeta)
    }
}

struct PasosLista: View {
    let pasos: [String]
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(pasos.enumerated()), id: \.offset) { n, p in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("\(n + 1)").font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta).frame(width: 16)
                    Text(p).font(Letra.cuerpo).foregroundStyle(Lienzo.tinta).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(Medida.rellenoTarjeta)
    }
}

// MARK: apartados

// APARTADOS_OPCIONALES (js/nucleo.js): mismos textos y el mismo porDefecto (Apartados.visible).
struct AjustesApartadosView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var visibles: [String: Bool] = [:]
    @State private var perfil = "ambos"

    static let opcionales: [(vista: String, titulo: String, texto: String)] = [
        ("studies", "estudios.", "asignaturas, horario, exámenes y entregas."),
        ("work", "empleo.", "tu trabajo actual, el historial, la agenda laboral y tu cv."),
        ("estudiar", "repaso.", "pestaña de estudios: pomodoro, temario y tarjetas de repaso."),
        ("universidad", "carrera.", "pestaña de estudios: tu carrera por cuatrimestres."),
        ("profesorado", "profesorado.", "si das clase: el cuadrante del curso con todas tus clases."),
        ("compra", "despensa.", "la lista de la compra por secciones, tickets y recetas."),
        ("actualizaciones", "envíos.", "tus pedidos por internet y por dónde van."),
        ("transporte", "transporte.", "tus paradas de bus de zaragoza, en directo."),
        ("projects", "proyectos.", "proyectos con fases, lista o tablero."),
        ("links", "enlaces.", "webs y recursos guardados por carpetas."),
        ("tags", "etiquetas.", "todo lo que lleva la misma etiqueta, junto."),
        ("graph", "conexiones.", "cómo se relacionan tus viajes, personas, lugares y etiquetas."),
        ("collectibles", "coleccionables.", "tu colección con su valor de mercado."),
    ]

    var body: some View {
        PaginaAjustes(titulo: "apartados", contexto: "\(visibles.values.filter { $0 }.count) encendidos.") {
            GrupoMenu(titulo: "eres.") {
                OpcionesAjuste(opciones: [("estudiante", "estudiante."), ("trabajador", "trabajo."), ("ambos", "las dos.")], elegida: perfil) { p in
                    perfil = p
                    Task { await c.guardar(.ponerPerfil(perfil: p)) }
                }
                .padding(Medida.rellenoTarjeta)
            }
            PieGrupo(texto: "estudiante quita empleo; trabajo quita estudios y sus avisos. lo puedes cambiar abajo uno a uno.")
            GrupoMenu(titulo: "opcionales.") {
                ForEach(Array(Self.opcionales.enumerated()), id: \.offset) { n, o in
                    if n > 0 { SeparadorMenu() }
                    FilaInterruptor(icono: Icono.deVista(o.vista), titulo: o.titulo, detalle: o.texto,
                                    activo: Binding(get: { visibles[o.vista] ?? false }, set: { v in poner(o.vista, v) }))
                }
            }
            PieGrupo(texto: "ocultar un apartado no borra nada: vuelve con sus datos al encenderlo. el menú cambia al momento.")
        }
        .task(id: c.revision) {
            guard let doc = await c.documentoVisible() else { return }
            guard let r = await ultimaGana({ () -> ([String: Bool], String) in
                var v: [String: Bool] = [:]
                for o in AjustesApartadosView.opcionales { v[o.vista] = Apartados.visible(o.vista, doc) }
                return (v, OperacionesAjustes.leer(doc).perfil)
            }) else { return }
            visibles = r.0
            perfil = r.1
        }
    }

    private func poner(_ vista: String, _ v: Bool) {
        let antes = visibles[vista]
        visibles[vista] = v
        Task {
            if !(await c.ponerAjuste("apartado:" + vista, [.ponerApartado(vista: vista, visible: v)])) { visibles[vista] = antes }
        }
    }
}

// MARK: avisos

struct AjustesAvisosView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var apagados: Set<String> = []

    var body: some View {
        PaginaAjustes(titulo: "avisos", contexto: "\(OperacionesAjustes.avisos.count - apagados.count) de \(OperacionesAjustes.avisos.count).") {
            PieGrupo(texto: "los manda bitácora cada mañana a las 9:00 y antes de tus eventos: como mucho 3 al día y nunca dos veces lo mismo. valen para la web y para este iphone.")
            GrupoMenu(titulo: "automáticos.") {
                ForEach(Array(OperacionesAjustes.avisos.enumerated()), id: \.offset) { n, a in
                    if n > 0 { SeparadorMenu() }
                    FilaInterruptor(icono: "avisos", titulo: a.titulo, detalle: a.texto,
                                    activo: Binding(get: { !apagados.contains(a.tipo) }, set: { v in poner(a.tipo, v) }))
                }
            }
        }
        .task(id: c.revision) {
            guard let doc = await c.documentoVisible() else { return }
            guard let nuevo = await ultimaGana({ OperacionesAjustes.leer(doc).avisosApagados }) else { return }
            apagados = nuevo
        }
    }

    private func poner(_ tipo: String, _ v: Bool) {
        if v { apagados.remove(tipo) } else { apagados.insert(tipo) }
        Task {
            if await c.ponerAjuste("aviso:" + tipo, [OperacionesAjustes.avisoOp(tipo: tipo, activo: v)]) {
                if tipo == "eventos" { c.reconciliarAvisos() }
            } else {
                if v { apagados.insert(tipo) } else { apagados.remove(tipo) }
            }
        }
    }
}

// MARK: conexiones

struct AjustesConectorView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var tokens: [TokenConector]?
    @State private var nuevo: (nombre: String, url: String)?
    @State private var revocar: TokenConector?
    @State private var error: String?

    var body: some View {
        PaginaAjustes(titulo: "claude y chatgpt") {
            PieGrupo(texto: "conecta bitácora a claude o a chatgpt para preguntarle por tu agenda o tus gastos y pedirle que apunte cosas. usa tu propia suscripción.")
            if let nuevo {
                GrupoMenu(titulo: "enlace para \(nuevo.nombre == "claude" ? "claude" : "chatgpt").") {
                    PieGrupo(texto: "es tu llave personal: quien lo tenga puede leer y escribir en tu bitácora. solo se enseña ahora.").padding(.horizontal, 10)
                    CajaCopiar(texto: nuevo.url, aviso: "enlace copiado.")
                    PasosLista(pasos: nuevo.nombre == "claude" ? Self.pasosClaude : Self.pasosChatGPT)
                }
            }
            GrupoMenu(titulo: "tus enlaces.") {
                if let tokens {
                    let propios = tokens.filter { $0.nombre != "siri" && $0.nombre != "correo" }
                    if propios.isEmpty {
                        Text("aún no has creado ninguno.").font(Letra.cuerpo).foregroundStyle(Lienzo.tintaSecundaria).padding(Medida.rellenoTarjeta)
                    }
                    ForEach(Array(propios.enumerated()), id: \.element.id) { n, t in
                        if n > 0 { SeparadorMenu() }
                        FilaAjuste(icono: "conexiones", titulo: t.nombre + ".", detalle: Self.detalle(t)) {
                            Button("revocar.") { revocar = t }.font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.negativo).frame(minHeight: 44)
                        }
                    }
                } else {
                    ProgressView().tint(Lienzo.tintaSecundaria).frame(maxWidth: .infinity).padding(Medida.rellenoTarjeta)
                }
            }
            if let error { Text(error).font(Letra.pie).foregroundStyle(Lienzo.negativo).padding(.top, 8) }
            HStack(spacing: 10) {
                Button("+ claude.") { Task { await crear("claude") } }.buttonStyle(.capsula(.claro))
                Button("+ chatgpt.") { Task { await crear("chatgpt") } }.buttonStyle(.capsula(.claro))
            }
            .padding(.top, Medida.m)
        }
        .task { await cargar() }
        .confirmationDialog("¿revocar este enlace?", isPresented: Binding(get: { revocar != nil }, set: { if !$0 { revocar = nil } }), titleVisibility: .visible) {
            Button("revocar.", role: .destructive) { if let t = revocar { Task { await quitar(t) } } }
            Button("cancelar.", role: .cancel) {}
        } message: { Text("claude o chatgpt dejarán de poder entrar con él.") }
    }

    static let pasosClaude = ["en claude.ai: ajustes, conectores, añadir conector personalizado.", "nombre «bitácora» y el enlace como url del servidor, sin oauth.", "en un chat, activa bitácora en las herramientas y pregunta: «¿qué tengo esta semana?»."]
    static let pasosChatGPT = ["en chatgpt.com: ajustes, aplicaciones y conectores, avanzado, y activa el modo desarrollador.", "aplicaciones y conectores, crear: nombre «bitácora», el enlace como url y «sin autenticación».", "en un chat, elige bitácora en el menú «+» y pregunta: «¿cómo van mis gastos?»."]

    static func detalle(_ t: TokenConector) -> String {
        let creado = "creado el \(String(t.creado.prefix(10)))"
        guard let u = t.ultimoUso, !u.isEmpty else { return creado + ", sin usar todavía." }
        return creado + ", usado el \(String(u.prefix(10)))."
    }

    private var servidor: ServidorAjustes { ServidorAjustes(cliente: c.entorno.cliente, auth: c.entorno.auth) }

    private func cargar() async {
        let t = await servidor.tokens()
        if let t { tokens = t; error = nil } else { error = "no se ha podido cargar. ¿hay conexión?" }
    }

    private func crear(_ nombre: String) async {
        do {
            let token = try await servidor.crearToken(nombre: nombre)
            nuevo = (nombre, ServidorAjustes.conectorURL + token)
            await cargar()
        } catch {
            self.error = "no se pudo crear el enlace."
        }
    }

    private func quitar(_ t: TokenConector) async {
        do { try await servidor.revocar(hash: t.hash); c.avisar("enlace revocado."); await cargar() } catch {
            self.error = "no se pudo revocar."
        }
    }
}

// Siri y la dirección de correo (js/servicios.js, atajoToken): un token propio con nombre «siri» o «correo».
struct AjustesAtajoView: View {
    enum Clase { case siri, correo }
    let tipo: Clase
    let token: String?
    @Environment(AppCoordinator.self) private var c
    @State private var actual: String?
    @State private var creando = false
    @State private var cambiar = false
    @State private var error: String?

    private var clave: String { tipo == .siri ? "siriToken" : "correoToken" }
    private var nombre: String { tipo == .siri ? "siri" : "correo" }

    var body: some View {
        PaginaAjustes(titulo: tipo == .siri ? "siri" : "tu correo") {
            PieGrupo(texto: tipo == .siri
                     ? "un atajo de la app atajos: se hace una vez y luego basta con decir «oye siri, apunta en bitácora». lo dictado entra como tarea, evento, gasto o compra."
                     : "tu dirección para reenviar reservas y pedidos: vuelos, hoteles, entradas o compras se apuntan solos.")
            if let t = actual ?? token {
                GrupoMenu(titulo: tipo == .siri ? "tu enlace." : "tu dirección.") {
                    CajaCopiar(texto: tipo == .siri ? "\(ServidorAjustes.entradaURL)?t=\(t)" : "\(t)@\(ServidorAjustes.correoDominio)",
                               aviso: tipo == .siri ? "enlace copiado." : "dirección copiada.")
                    if tipo == .siri { PasosLista(pasos: Self.pasosSiri) }
                }
                Button { cambiar = true } label: {
                    FilaAjuste(icono: "borrar", titulo: tipo == .siri ? "cambiar el enlace." : "cambiar la dirección.", detalle: "la de ahora deja de funcionar.") { EmptyView() }
                }
                .buttonStyle(EstiloFila())
                .background(Lienzo.tarjeta, in: RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
                .sombra(.suave)
                .padding(.top, Medida.m)
            } else {
                Button(creando ? "creando." : (tipo == .siri ? "conectar siri." : "crear mi dirección.")) { Task { await crear() } }
                    .buttonStyle(.capsula(.oscuro, ancho: true)).disabled(creando).padding(.top, Medida.m)
            }
            if let error { Text(error).font(Letra.pie).foregroundStyle(Lienzo.negativo).padding(.top, 8) }
        }
        .confirmationDialog("¿cambiar?", isPresented: $cambiar, titleVisibility: .visible) {
            Button("cambiar.", role: .destructive) { Task { await crear() } }
            Button("cancelar.", role: .cancel) {}
        } message: { Text(tipo == .siri ? "el atajo dejará de funcionar hasta que pegues el enlace nuevo." : "lo que reenvíes a la dirección vieja ya no llegará.") }
    }

    static let pasosSiri = ["abre atajos, pulsa + y llámalo «apunta en bitácora».", "añade la acción «dictar texto».", "añade «obtener contenido de url», pega el enlace y en su flecha: método post, cuerpo json, un campo de texto «texto» con el texto dictado.", "añade «leer texto» con el contenido de la url: siri te dirá lo que ha apuntado."]

    private func crear() async {
        creando = true
        defer { creando = false }
        let servidor = ServidorAjustes(cliente: c.entorno.cliente, auth: c.entorno.auth)
        do {
            let nuevo = try await servidor.crearToken(nombre: nombre, bytes: 24)
            try await c.encolar(OperacionesAjustes.tokenOp(clave: clave, token: nuevo))
            if let viejo = actual ?? token { try? await servidor.revocar(hash: ServidorAjustes.hash(viejo)) }
            actual = nuevo
            error = nil
        } catch {
            self.error = "no se ha podido crear. ¿hay conexión?"
        }
    }
}

// Calendario suscribible (función calendario-feed). Cambiar el enlace sube `calendarioFeedVersion`.
struct AjustesCalendarioView: View {
    let version: Int
    @Environment(AppCoordinator.self) private var c
    @Environment(\.openURL) private var abrir
    @State private var url: URL?
    @State private var error: String?
    @State private var cambiar = false

    var body: some View {
        PaginaAjustes(titulo: "calendario") {
            PieGrupo(texto: "un enlace personal para ver tu calendario en google, el calendario del iphone u outlook. quien lo tenga puede verlo; las apps lo vuelven a leer cada pocas horas.")
            if let url {
                GrupoMenu(titulo: "tu enlace.") {
                    CajaCopiar(texto: url.absoluteString, aviso: "enlace copiado.")
                    SeparadorMenu()
                    Button { if let w = URL(string: url.absoluteString.replacingOccurrences(of: "https:", with: "webcal:")) { abrir(w) } } label: {
                        FilaAjuste(icono: "calendario", titulo: "abrir en el calendario.", detalle: "lo añade al calendario de este iphone.")
                    }.buttonStyle(EstiloFila())
                }
                GrupoMenu(titulo: "en otras apps.") {
                    PasosLista(pasos: ["google: calendar.google.com, otros calendarios (+), desde url, y pega el enlace.", "outlook: añadir calendario, suscribirse desde la web, y pega el enlace."])
                }
                Button { cambiar = true } label: {
                    FilaAjuste(icono: "borrar", titulo: "cambiar el enlace.", detalle: "el anterior deja de funcionar.") { EmptyView() }
                }
                .buttonStyle(EstiloFila())
                .background(Lienzo.tarjeta, in: RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
                .sombra(.suave)
                .padding(.top, Medida.m)
            } else if let error {
                Text(error).font(Letra.cuerpo).foregroundStyle(Lienzo.negativo).padding(.top, Medida.m)
            } else {
                ProgressView().tint(Lienzo.tintaSecundaria).frame(maxWidth: .infinity).padding(.top, Medida.xl)
            }
        }
        .task { await pedir() }
        .confirmationDialog("¿cambiar el enlace?", isPresented: $cambiar, titleVisibility: .visible) {
            Button("cambiar.", role: .destructive) { Task { await cambiarEnlace() } }
            Button("cancelar.", role: .cancel) {}
        } message: { Text("dejará de funcionar en las apps donde lo hayas añadido.") }
    }

    private func pedir() async {
        do { url = try await ServidorAjustes(cliente: c.entorno.cliente, auth: c.entorno.auth).enlaceCalendario(); error = nil } catch {
            self.error = "no se pudo preparar el enlace. prueba en un rato."
        }
    }

    private func cambiarEnlace() async {
        url = nil
        do {
            try await c.encolar(OperacionesAjustes.feedOp(version: version + 1))
            // El servidor firma con la versión guardada en la nube: primero se sube.
            await c.sincronizar()
        } catch {
            c.avisar("no se pudo guardar en este iphone.")
        }
        await pedir()
    }
}

// Correo de los domingos (tabla correo_semanal, RPC poner_correo_semanal).
struct CorreoSemanalFila: View {
    @Environment(AppCoordinator.self) private var c
    @State private var activo: Bool?

    var body: some View {
        FilaInterruptor(icono: "correo", titulo: "correo de los domingos.", detalle: activo == nil ? "cargando." : "tu semana, el domingo a las 18:00.",
                        activo: Binding(get: { activo ?? false }, set: { v in poner(v) }), deshabilitado: activo == nil)
            .task { activo = await ServidorAjustes(cliente: c.entorno.cliente, auth: c.entorno.auth).correoSemanal() }
    }

    private func poner(_ v: Bool) {
        let antes = activo
        activo = v
        Task {
            do {
                try await ServidorAjustes(cliente: c.entorno.cliente, auth: c.entorno.auth).ponerCorreoSemanal(v)
                c.avisar(v ? "te llegará el domingo a las 18:00." : "correo de los domingos apagado.")
            } catch {
                activo = antes
                c.avisar("no se pudo cambiar.")
            }
        }
    }
}

// MARK: cuenta

struct AjustesCuentaView: View {
    let suscripcion: Suscripcion?
    @Environment(AppCoordinator.self) private var c
    @State private var abriendo = false

    static func resumen(_ s: Suscripcion) -> String {
        switch s.estado {
        case "fundador": return "socio fundador nº \(String(format: "%02d", s.socioNumero ?? 0))."
        case "legado": return "acceso gratuito permanente."
        case "prueba": return "prueba gratuita."
        case "regalo": return "regalo de un socio fundador."
        case "active", "trialing": return "suscripción \(s.plan == "anual" ? "anual" : "mensual")."
        case "past_due": return "pago pendiente."
        case "canceled": return "suscripción terminada."
        default: return "beta abierta."
        }
    }

    private var pagando: Bool { ["active", "trialing", "past_due"].contains(suscripcion?.estado ?? "") }

    var body: some View {
        PaginaAjustes(titulo: "suscripción", contexto: suscripcion.map(Self.resumen)) {
            GrupoMenu(titulo: "tu plan.") {
                VStack(alignment: .leading, spacing: 6) {
                    Text(suscripcion.map(Self.resumen) ?? "cargando.").font(Letra.seccion).foregroundStyle(Lienzo.tinta)
                    Text(nota).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Medida.rellenoTarjeta)
                if pagando {
                    SeparadorMenu()
                    Button { Task { await portal() } } label: {
                        FilaAjuste(icono: "suscripcion", titulo: abriendo ? "abriendo." : "pagos y facturas.", detalle: "tarjeta, facturas, cambiar de plan o cancelar.", web: true)
                    }.buttonStyle(EstiloFila()).disabled(abriendo)
                } else {
                    SeparadorMenu()
                    Button { c.web = URL(string: "https://appbitacora.es/#settings")! } label: {
                        FilaAjuste(icono: "suscripcion", titulo: "planes y códigos regalo.", detalle: "en ajustes de la web.", web: true)
                    }.buttonStyle(EstiloFila())
                }
            }
        }
    }

    private var nota: String {
        guard let s = suscripcion else { return "" }
        let fin = String((s.periodoFin ?? s.trialFin ?? "").prefix(10))
        switch s.estado {
        case "fundador": return "bitácora de por vida. tu tema exclusivo, «fundador.», está en apariencia."
        case "prueba": return fin.isEmpty ? "sin tarjeta. si te convence, suscríbete cuando quieras." : "hasta el \(fin). sin tarjeta; tus datos se quedan guardados."
        case "regalo": return fin.isEmpty ? "seis meses sin pagar nada." : "hasta el \(fin)."
        case "active", "trialing", "past_due": return fin.isEmpty ? "" : "se renueva el \(fin)."
        case "legado": return "cuenta anterior al lanzamiento de pago."
        default: return "bitácora es gratis y completa mientras dura la beta."
        }
    }

    private func portal() async {
        abriendo = true
        defer { abriendo = false }
        do { c.web = try await ServidorAjustes(cliente: c.entorno.cliente, auth: c.entorno.auth).portalPago() } catch {
            c.avisar("no se pudo abrir el portal de pagos.")
        }
    }
}

struct AjustesInvitarView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var codigo: CodigoInvitacion?
    @State private var error = false

    var body: some View {
        PaginaAjustes(titulo: "invitar") {
            PieGrupo(texto: "quien entre con tu enlace tiene 30 días gratis, y los dos desbloqueáis el tema «oliva.».")
            if let codigo {
                GrupoMenu(titulo: "tu código.") {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(codigo.codigo).font(Letra.titulo).foregroundStyle(Lienzo.tinta).textSelection(.enabled)
                        Text(codigo.amigos == 0 ? "nadie ha entrado aún con tu código." : "\(codigo.amigos) \(codigo.amigos == 1 ? "amigo ha entrado" : "amigos han entrado") con tu código.")
                            .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(Medida.rellenoTarjeta)
                }
                ShareLink(item: codigo.enlace, message: Text("yo organizo mi vida con bitácora. con mi enlace tienes 30 días gratis:")) {
                    Text("compartir enlace.")
                }
                .buttonStyle(.capsula(.oscuro, ancho: true))
                .padding(.top, Medida.m)
            } else if error {
                Text("no se ha podido cargar tu código ahora mismo.").font(Letra.cuerpo).foregroundStyle(Lienzo.negativo).padding(.top, Medida.m)
            } else {
                ProgressView().tint(Lienzo.tintaSecundaria).frame(maxWidth: .infinity).padding(.top, Medida.xl)
            }
        }
        .task {
            codigo = await ServidorAjustes(cliente: c.entorno.cliente, auth: c.entorno.auth).codigoInvitacion()
            error = codigo == nil
        }
    }
}

// openEliminarCuenta: explica, ofrece la copia y pide escribir «eliminar». Llama a la misma función que la web.
struct AjustesEliminarView: View {
    let exportar: () -> Void
    @Environment(AppCoordinator.self) private var c
    @State private var confirmacion = ""
    @State private var eliminando = false
    @State private var error: String?

    var body: some View {
        PaginaAjustes(titulo: "eliminar") {
            GrupoMenu(titulo: "antes de seguir.") {
                VStack(alignment: .leading, spacing: 8) {
                    Text("se borran tu cuenta y todos tus datos de bitácora, en la nube y en todos tus dispositivos. no se puede deshacer.")
                    Text("si pagas una suscripción, se cancela. si eres socio fundador, tu plaza no se recupera.")
                }
                .font(Letra.cuerpo).foregroundStyle(Lienzo.tinta).fixedSize(horizontal: false, vertical: true)
                .padding(Medida.rellenoTarjeta)
                SeparadorMenu()
                Button { exportar() } label: {
                    FilaAjuste(icono: "datos", titulo: "descargar mis datos.", detalle: "una copia antes de borrar.") { EmptyView() }
                }.buttonStyle(EstiloFila())
            }
            Text("para confirmar, escribe eliminar.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).padding(.top, Medida.l)
            TextField("eliminar", text: $confirmacion)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                .campoCasa()
                .padding(.top, 6)
            if let error { Text(error).font(Letra.pie).foregroundStyle(Lienzo.negativo).padding(.top, 8) }
            Button(eliminando ? "eliminando." : "eliminar mi cuenta para siempre.") { Task { await eliminar() } }
                .buttonStyle(BotonPeligro())
                .disabled(eliminando || confirmacion.trimmingCharacters(in: .whitespaces).lowercased() != "eliminar")
                .padding(.top, Medida.m)
        }
    }

    private func eliminar() async {
        eliminando = true
        do {
            try await ServidorAjustes(cliente: c.entorno.cliente, auth: c.entorno.auth).eliminarCuenta()
            await c.salir()
        } catch {
            eliminando = false
            self.error = "no se pudo eliminar la cuenta. ¿hay conexión?"
        }
    }
}

// Lo irreversible (eliminar la cuenta): cápsula a todo el ancho con tinte rojo y su filete; se hunde como EstiloCapsula.
struct BotonPeligro: ButtonStyle {
    @Environment(\.isEnabled) private var activo
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Letra.boton)
            .lineLimit(1)
            .frame(maxWidth: .infinity, minHeight: Medida.alturaControl)
            .foregroundStyle(activo ? Lienzo.negativo : Lienzo.tintaTerciaria)
            .background(activo ? Lienzo.negativo.opacity(0.1) : Lienzo.sutil, in: Capsule())
            .overlay(Capsule().strokeBorder(activo ? Lienzo.negativo : Lienzo.filo))
            .contentShape(Capsule())
            .scaleEffect(configuration.isPressed && !sinMovimiento ? 0.97 : 1)
            .animation(configuration.isPressed ? Muelle.toque : Muelle.soltar, value: configuration.isPressed)
    }
}
