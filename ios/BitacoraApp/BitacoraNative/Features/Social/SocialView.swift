import SwiftUI
import UIKit

// Social nativo (vista web `friends`, js/social.js): pestañas gastos, eventos y amigos. Los datos se piden al servidor al
// entrar y tras cada cambio (como pintarSocial tras cargar); nada se guarda en el documento salvo el evento que se añade.
@MainActor
@Observable
final class SocialEstado {
    var datos: SocialDatos?
    var aviso: String?
    @ObservationIgnored private(set) var repo: RepositorioSocial?

    func preparar(_ c: AppCoordinator) {
        if repo == nil { repo = RepositorioSocial(cliente: c.entorno.cliente, auth: c.entorno.auth) }
    }

    func recargar() async {
        guard let repo else { return }
        do {
            datos = try await repo.cargar()
            aviso = nil
        } catch ErrorRed.sinConexion {
            aviso = "sin conexión: social necesita internet."
        } catch {
            aviso = "no se pudo cargar social."
        }
    }

    func grupo(_ id: String) -> SocialGrupo? { datos?.grupos.first { $0.id == id } }

    // Hace el cambio en el servidor y recarga. false si falló (el aviso ya está puesto).
    @discardableResult
    func hacer(_ fallo: String, _ trabajo: @escaping (RepositorioSocial) async throws -> Void) async -> Bool {
        guard let repo else { return false }
        do {
            try await trabajo(repo)
            await recargar()
            return true
        } catch ErrorRed.sinConexion {
            aviso = "sin conexión."
        } catch let ErrorSocial.servidor(m) {
            aviso = SocialTexto.error(m, porDefecto: fallo)
        } catch {
            aviso = fallo
        }
        Haptica.error()
        return false
    }
}

enum SocialTexto {
    private static let formato: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.timeZone = CalendarioBitacora.madrid.zona
        f.dateFormat = "EEEE, d 'de' MMMM"
        return f
    }()

    static func fecha(_ iso: String) -> String {
        guard let d = LocalDay(iso: iso) else { return iso }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        guard let f = cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12)) else { return iso }
        return formato.string(from: f)
    }

    static func hoy() -> String { CalendarioBitacora.madrid.dia(de: Date()).iso }

    // Los textos de anadirAmigoPorCodigo (js/nucleo.js) para los errores conocidos de las RPC.
    static func error(_ m: String, porDefecto: String) -> String {
        if m.contains("Código no encontrado") { return "no existe ningún amigo con ese código." }
        if m.contains("a ti mismo") { return "ese es tu propio código." }
        if m.contains("Ya sois amigos") { return "ya sois amigos." }
        if m.contains("pendiente de que la acepte") { return "ya le enviaste una solicitud; está pendiente." }
        return porDefecto
    }

    static func cuenta(_ n: Int, _ uno: String, _ varios: String) -> String { "\(n) \(n == 1 ? uno : varios)" }
}

struct SocialView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var estado = SocialEstado()
    @State private var pestana: Pestana = .gastos
    @State private var nuevoGrupo = false
    @State private var codigoAmigo = ""
    @State private var amigoABorrar: SocialAmigo?
    @State private var ocupado = false

    enum Pestana: Hashable { case gastos, eventos, amigos }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "social.", subtitulo: "tu gente y lo que compartís.") {
                    if pestana == .gastos {
                        BotonRedondo(sistema: "plus", tono: .oscuro, etiqueta: "nuevo grupo") { Haptica.ligera(); nuevoGrupo = true }
                    }
                }
                .padding(.bottom, Medida.xxs)
                if let aviso = estado.aviso {
                    Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        .padding(.horizontal, Medida.xxs)
                        .transition(.opacity.combined(with: .offset(y: -4)))
                }
                if let d = estado.datos {
                    if !d.grupos.isEmpty { resumen(d) }
                    SegmentoCapsula(opciones: [
                        .init(valor: Pestana.gastos, titulo: "gastos."),
                        .init(valor: Pestana.eventos, titulo: d.eventos.isEmpty ? "eventos." : "eventos. \(d.eventos.count)"),
                        .init(valor: Pestana.amigos, titulo: recibidas(d).isEmpty ? "amigos." : "amigos. \(recibidas(d).count)"),
                    ], elegido: $pestana)
                    switch pestana {
                    case .gastos: gastos(d)
                    case .eventos: eventos(d)
                    case .amigos: amigos(d)
                    }
                } else if estado.aviso == nil {
                    ProgressView().tint(Lienzo.tintaTerciaria).frame(maxWidth: .infinity).padding(.top, Medida.xl)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: estado.aviso)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: pestana)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .refreshable { await estado.recargar() }
        .task {
            estado.preparar(c)
            await estado.recargar()
        }
        .hoja(isPresented: $nuevoGrupo) { SocialEditorGrupo(estado: estado, grupo: nil).environment(c) }
        .confirmarBorrado($amigoABorrar, titulo: { "¿eliminar a \($0.nombre)? dejaréis de estar conectados en bitácora." }, boton: "eliminar.") { a in
            Task { await estado.hacer("no se pudo eliminar.") { try await $0.eliminarAmigo(a.friendId) } }
        }
    }

    private func recibidas(_ d: SocialDatos) -> [SocialSolicitud] { d.solicitudes.filter(\.recibida) }

    // El saldo de todos los grupos juntos (renderFriendsView, social-resumen).
    private func resumen(_ d: SocialDatos) -> some View {
        let total = d.grupos.reduce(0) { $0 + CuentasSocial.totales($1, yo: d.yo).saldo }
        let etiqueta = abs(total) < 1 ? "estás en paz con todos." : total > 0 ? "te deben en total." : "debes en total."
        let pie = [SocialTexto.cuenta(d.grupos.count, "grupo", "grupos"),
                   recibidas(d).isEmpty ? "" : SocialTexto.cuenta(recibidas(d).count, "solicitud", "solicitudes"),
                   d.eventos.isEmpty ? "" : SocialTexto.cuenta(d.eventos.count, "evento por ver", "eventos por ver")]
            .filter { !$0.isEmpty }.joined(separator: ", ")
        return TarjetaOscura {
            VStack(alignment: .leading, spacing: Medida.xs) {
                CifraGrande(texto: CuentasSocial.dinero(abs(total)), etiqueta: etiqueta, punto: total == 0 ? nil : Lienzo.naranja, sobreOscuro: true)
                Text(pie + ".").font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave)
            }
        }
    }

    // MARK: gastos

    @ViewBuilder private func gastos(_ d: SocialDatos) -> some View {
        if d.grupos.isEmpty {
            TarjetaInvitacion(frase: "un viaje, una cena, el piso.", destacado: "apuntad quién paga qué y bitácora echa las cuentas.",
                              boton: "nuevo grupo.") { nuevoGrupo = true }
        } else {
            TarjetaSeccion(titulo: "grupos.", detalle: "\(d.grupos.count)", enTarjeta: false) {
                TarjetaFilas {
                    ForEach(Array(d.grupos.enumerated()), id: \.element.id) { i, g in
                        if i > 0 { SeparadorFila(sangria: Medida.rellenoTarjeta + Medida.icono + Medida.s) }
                        NavigationLink { SocialGrupoView(id: g.id, estado: estado).huecoDeBarra() } label: { filaGrupo(g, d) }
                            .buttonStyle(EstiloFila())
                    }
                }
            }
        }
    }

    private func filaGrupo(_ g: SocialGrupo, _ d: SocialDatos) -> some View {
        let t = CuentasSocial.totales(g, yo: d.yo)
        let nombres = g.miembros.map { CuentasSocial.nombre(g, $0.id, yo: d.yo, amigos: d.amigos) }.joined(separator: ", ")
        return HStack(spacing: Medida.s) {
            IconoCuadrado(id: "social", tono: abs(t.saldo) >= 1 ? .oscuro : .claro)
            VStack(alignment: .leading, spacing: 2) {
                Text(g.nombre).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).lineLimit(1)
                Text(nombres).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
            }
            Spacer(minLength: Medida.xs)
            VStack(alignment: .trailing, spacing: 2) {
                Text(CuentasSocial.textoSaldo(t.saldo)).font(Letra.pieFuerte)
                    .foregroundStyle(t.saldo > 0 ? Lienzo.positivo : t.saldo < 0 ? Lienzo.negativo : Lienzo.tintaSecundaria)
                Text("\(CuentasSocial.dinero(t.total)), \(SocialTexto.cuenta(CuentasSocial.numGastos(g), "gasto", "gastos"))")
                    .font(Letra.pie).foregroundStyle(Lienzo.tintaTerciaria).monospacedDigit()
            }
            FlechaFila()
        }
        .padding(.horizontal, Medida.rellenoTarjeta)
        .frame(minHeight: 60)
        .contentShape(Rectangle())
    }

    // MARK: eventos

    @ViewBuilder private func eventos(_ d: SocialDatos) -> some View {
        TarjetaSeccion(titulo: "te han compartido.", detalle: d.eventos.isEmpty ? nil : "\(d.eventos.count)") {
            if d.eventos.isEmpty {
                EstadoVacio(texto: "nada pendiente. lo que te compartan tus amigos aparecerá aquí.", icono: "eventos")
            } else {
                ForEach(Array(d.eventos.enumerated()), id: \.element.id) { i, e in
                    if i > 0 { SeparadorFila(sangria: 0).padding(.vertical, Medida.s) }
                    eventoRecibido(e)
                }
            }
        }
        Text("para mandar un evento tuyo a tus amigos, compártelo desde la web por ahora.")
            .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).padding(.horizontal, Medida.xxs)
    }

    private func eventoRecibido(_ e: SocialEventoRecibido) -> some View {
        let ev = e.evento
        let meta = [ev["date"].map(SocialTexto.fecha), ev["time"], ev["place"]].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
        return VStack(alignment: .leading, spacing: Medida.xxs) {
            Text(e.de.lowercased() + ".").font(Letra.pieFuerte).foregroundStyle(Lienzo.naranjaProfundo)
            Text(ev["title"] ?? "Evento").font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta)
            if !meta.isEmpty { Text(meta).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) }
            if let n = e.nota, !n.isEmpty { Text("«\(n)»").font(Letra.detalle).foregroundStyle(Lienzo.tinta).padding(.top, 2) }
            HStack(spacing: Medida.xs) {
                Button("añadir.") { Task { await anadir(e) } }.buttonStyle(.capsula)
                Button("descartar.") { Task { await estado.hacer("no se pudo descartar.") { try await $0.descartarEvento(e.id) } } }
                    .buttonStyle(.capsula(.claro))
            }
            .disabled(ocupado)
            .padding(.top, Medida.xs)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // aceptarEventoCompartido: la entrada entera, como la web (con `compartidoPor`), y luego se borra lo recibido.
    private func anadir(_ e: SocialEventoRecibido) async {
        guard !ocupado, let repo = estado.repo else { return }
        ocupado = true
        defer { ocupado = false }
        guard let ev = await repo.eventoValidado(e.id) else {
            estado.aviso = "ese evento no se puede añadir: llegó con datos raros."
            return
        }
        let ms = Int64(Date().timeIntervalSince1970 * 1000)
        let id = "entry_\(ms)_" + String(UUID().uuidString.lowercased().prefix(4))
        var o: [String: JSONValue] = ["id": .string(id), "type": .string("event"), "categoryId": .string("cat_evento"), "tags": .array([]),
                                      "compartidoPor": .string(e.de), "createdAt": .string(ISO8601DateFormatter().string(from: Date()))]
        for (k, v) in ev { o[k] = .string(v) }
        guard await c.guardar(.anadirEnLista(clave: "entries", id: id, json: EscritorJSON.texto(.object(o)))) else { return }
        Haptica.exito()
        await estado.hacer("añadido, pero no se pudo quitar de la lista.") { try await $0.descartarEvento(e.id) }
    }

    // MARK: amigos

    @ViewBuilder private func amigos(_ d: SocialDatos) -> some View {
        let rec = recibidas(d)
        if !rec.isEmpty {
            TarjetaSeccion(titulo: "quieren ser tus amigos.", detalle: "\(rec.count)") {
                ForEach(Array(rec.enumerated()), id: \.element.id) { i, s in
                    if i > 0 { SeparadorFila() }
                    HStack(spacing: Medida.s) {
                        InicialCuadrada(nombre: s.nombre, oscuro: true)
                        Text(s.nombre).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).lineLimit(1)
                        Spacer(minLength: Medida.xs)
                        Button("aceptar.") { responder(s, true) }.buttonStyle(.capsula)
                        Button("rechazar.") { responder(s, false) }.buttonStyle(.capsula(.claro))
                    }
                    .frame(minHeight: 52)
                }
            }
        }
        TarjetaSeccion(titulo: "tu código de amigo.") { codigo(d) }
        TarjetaSeccion(titulo: "añadir un amigo.") {
            Text("escribe el código que te ha pasado tu amigo; le llegará una solicitud.")
                .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
            HStack(spacing: Medida.xs) {
                TextField("código de amigo.", text: $codigoAmigo)
                    .font(Letra.mono).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    .submitLabel(.send).onSubmit(enviarSolicitud)
                    .padding(.horizontal, Medida.s).frame(height: Medida.alturaControl)
                    .background(Lienzo.sutil, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
                    .onChange(of: codigoAmigo) { _, v in if v.count > 8 { codigoAmigo = String(v.prefix(8)) } }
                Button("añadir.", action: enviarSolicitud).buttonStyle(.capsula)
                    .disabled(ocupado || codigoAmigo.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(.top, Medida.xs)
        }
        let enviadas = d.solicitudes.filter { !$0.recibida }
        TarjetaSeccion(titulo: "mis amigos.", detalle: d.amigos.isEmpty ? nil : "\(d.amigos.count)") {
            if d.amigos.isEmpty && enviadas.isEmpty {
                EstadoVacio(texto: "aún no tienes amigos añadidos.", icono: "social")
            }
            ForEach(Array(enviadas.enumerated()), id: \.element.id) { i, s in
                if i > 0 { SeparadorFila() }
                HStack(spacing: Medida.s) {
                    InicialCuadrada(nombre: s.nombre)
                    Text(s.nombre).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                    Spacer(minLength: Medida.xs)
                    Chip(texto: "pendiente.")
                }
                .frame(minHeight: 52)
            }
            ForEach(Array(d.amigos.enumerated()), id: \.element.id) { i, a in
                if i > 0 || !enviadas.isEmpty { SeparadorFila() }
                HStack(spacing: Medida.s) {
                    InicialCuadrada(nombre: a.nombre)
                    Text(a.nombre).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).lineLimit(1)
                    Spacer(minLength: Medida.xs)
                    BotonRedondo(sistema: "xmark", tono: .sutil, tamano: 30, etiqueta: "eliminar a \(a.nombre)") { amigoABorrar = a }
                }
                .frame(minHeight: 52)
            }
        }
    }

    @ViewBuilder private func codigo(_ d: SocialDatos) -> some View {
        if let codigo = d.codigo {
            HStack(spacing: Medida.xs) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(codigo).font(Letra.diaBloqueGrande).foregroundStyle(Lienzo.tinta).kerning(2).textSelection(.enabled)
                    Text("compártelo para que te añadan.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                }
                Spacer(minLength: Medida.xs)
                BotonRedondo(sistema: "doc.on.doc", etiqueta: "copiar código") {
                    UIPasteboard.general.string = codigo
                    Haptica.exito()
                    estado.aviso = "código copiado."
                }
                BotonCompartirRedondo(texto: "Mi código de amigo en Bitácora: \(codigo)", etiqueta: "compartir código")
            }
        } else {
            VStack(alignment: .leading, spacing: Medida.s) {
                Text("aún no tienes código. genéralo y pásaselo a quien quieras.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                Button("generar código.") {
                    Task { await estado.hacer("no se pudo generar el código.") { _ = try await $0.generarCodigo() } }
                }
                .buttonStyle(.capsula)
            }
        }
    }

    private func responder(_ s: SocialSolicitud, _ aceptar: Bool) {
        Haptica.ligera()
        Task {
            if await estado.hacer("no se pudo procesar la solicitud.", { try await $0.responder(s.id, aceptar: aceptar) }), aceptar { Haptica.exito() }
        }
    }

    private func enviarSolicitud() {
        let codigo = codigoAmigo.trimmingCharacters(in: .whitespaces).uppercased()
        guard !codigo.isEmpty, !ocupado else { return }
        ocupado = true
        Task {
            defer { ocupado = false }
            var directa = false
            let ok = await estado.hacer("no se pudo enviar la solicitud.") { directa = try await $0.enviarSolicitud(codigo) }
            guard ok else { return }
            codigoAmigo = ""
            Haptica.exito()
            estado.aviso = directa ? "¡ya sois amigos! esa persona ya te había enviado una solicitud." : "solicitud enviada, a la espera de que la acepte."
        }
    }
}
