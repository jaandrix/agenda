import SwiftUI
import Network

enum Pestana: Hashable {
    case inicio, plan, calendario, finanzas, mas
}

// Una sola hoja a la vez: el enum impide dos modales simultáneos.
enum Modal: Identifiable, Equatable {
    case apuntar(ApuntarInicial)
    case tarea(EditorTarea)
    case evento(EditorEvento)
    case movimiento(String, tipo: String)
    case editarMovimiento(Movimiento)
    case ficha(EventoDia, dia: LocalDay)
    case tiempo
    var id: String {
        switch self {
        case .ficha(let e, let d): return "ficha:\(e.id):\(d.iso)"
        case .tiempo: return "tiempo"
        case .editarMovimiento(let m): return "editar:\(m.id)"
        case .movimiento(let id, _): return "movimiento:\(id)"
        case .evento(let e): return "evento:\(e.id)"
        case .apuntar(let a): return "apuntar:\(a.id)"
        case .tarea(let t): return "tarea:\(t.id)"
        }
    }
}

struct EditorTarea: Identifiable, Equatable {
    let id: String
    let nueva: Bool
    let dia: LocalDay?
    var titulo = ""
    var hora: String?
    var notas = ""
    var deTrabajo = false
    var prioridad: String?
}

enum FaseApp: Equatable {
    case arrancando
    case sinSesion(aviso: String?)
    case lista
}

// Los servicios se crean una vez y se comparten; las vistas no los ven, solo los modelos.
struct AppEnvironment {
    let cliente: ClienteSupabase
    let auth: AuthRepository
    let almacen: AlmacenLocal
    let sync: SyncEngine
    let servicios: ServiciosRemotos

    static func real() -> AppEnvironment {
        let cliente = ClienteSupabase()
        let auth = AuthSupabase(cliente: cliente)
        let almacen = AlmacenLocal()
        let sync = SyncEngine(auth: auth, remoto: RemotoSupabase(cliente: cliente), almacen: almacen)
        return AppEnvironment(cliente: cliente, auth: auth, almacen: almacen, sync: sync, servicios: ServiciosRemotos(cliente: cliente, auth: auth))
    }
}

@MainActor
@Observable
final class AppCoordinator {
    let entorno: AppEnvironment
    private(set) var fase: FaseApp = .arrancando
    private(set) var sesion: Sesion?
    var pestana: Pestana = .inicio
    // El cuarto hueco de la barra: el último de calendario o finanzas que se abrió.
    var secundaria: Pestana = .calendario
    var modal: Modal?
    // Lo que aún no es nativo: su página concreta de la web, a pantalla completa.
    var web: URL?
    // La pila de «más.»: los apartados se abren por su vista de la web («transporte», «events»...).
    var rutaMas: [String] = []
    private(set) var bloqueada = false
    private(set) var velo = false
    private(set) var intenciones: [IntencionEntrante]
    private(set) var informe = InformeSync()
    var avisoCola: String?
    // Una línea breve tras apuntar algo; se va sola.
    private(set) var aviso: String?
    @ObservationIgnored private var tareaAviso: Task<Void, Never>?

    func avisar(_ texto: String) {
        aviso = texto
        tareaAviso?.cancel()
        tareaAviso = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2.6))
            guard !Task.isCancelled else { return }
            self?.aviso = nil
        }
    }

    // El + de la barra y el de cada día: la hoja de apuntar con la fecha de ese día.
    func abrirApuntar(dia: LocalDay? = nil) {
        modal = .apuntar(ApuntarInicial(fechaBase: dia))
    }

    // Sube a la raíz de una pestaña al tocarla otra vez (las vistas la escuchan con su ScrollViewReader).
    private(set) var subir: [Pestana: Int] = [:]
    @ObservationIgnored private(set) var uso = UsoApartados()

    // Un toque en la barra. En «menú.», el segundo toque vacía `rutaMas` y vuelve a la raíz.
    func tocarPestana(_ p: Pestana) {
        let r = Navegacion.tocar(p, actual: pestana, ruta: rutaMas)
        if r.ruta != rutaMas { rutaMas = r.ruta }
        pestana = r.pestana
        if r.subir { subir[p, default: 0] += 1 }
    }

    // Abrir un apartado desde el menú, el selector rápido o la búsqueda: pestaña, página nativa o su web.
    func abrirApartado(_ vista: String) {
        anotarUso(vista)
        if let p = MasView.pestanas[vista] { pestana = p; return }
        if MasView.paginas.contains(vista) { pestana = .mas; rutaMas = [vista]; return }
        web = Apartados.webURL(vista)
    }

    func anotarUso(_ vista: String) {
        uso.anotar(vista)
        if let uid = sesion?.userId { uso.guardar(uid) }
    }

    private(set) var letra: EscalaLetra
    func ponerLetra(_ l: EscalaLetra) {
        LetraActiva.elegida = l
        letra = l
        if let uid = sesion?.userId { UserDefaults.standard.set(l.rawValue, forKey: "bitacora.letra.\(uid)") }
    }

    private(set) var bloqueoActivo: Bool
    private(set) var tema: TemaElegido
    private(set) var permisosTemas = PermisosTemas()

    @ObservationIgnored private let cola = ColaIntenciones()
    @ObservationIgnored private var escuchaSync: Task<Void, Never>?
    @ObservationIgnored private var pidiendoBiometria = false
    @ObservationIgnored private let red = NWPathMonitor()
    @ObservationIgnored private var habiaRed = true

    init(entorno: AppEnvironment = .real()) {
        self.entorno = entorno
        bloqueoActivo = UserDefaults.standard.bool(forKey: "bitacora.bloqueo")
        let t = TemaElegido(rawValue: UserDefaults.standard.string(forKey: "bitacora.tema") ?? "") ?? .sistema
        tema = t
        letra = .normal
        intenciones = ColaIntenciones().leer()
        TemaActivo.elegido = t
    }

    func arrancar() async {
        escucharSync()
        vigilarRed()
        if let s = await entorno.auth.sesionGuardada() {
            // Con sesión guardada se entra ya con la copia local y la nube se comprueba a la vez.
            sesion = s
            temaDeCuenta(s.userId)
            bloqueada = bloqueoActivo
            await entorno.sync.iniciar(uid: s.userId)
            fase = .lista
            if bloqueada { await desbloquear() }
            Task { await entorno.sync.sincronizar() }
        } else {
            fase = .sinSesion(aviso: nil)
        }
        atenderIntenciones()
    }

    func entrar(email: String, contrasena: String) async throws {
        let s = try await entorno.auth.entrar(email: email, contrasena: contrasena)
        sesion = s
        temaDeCuenta(s.userId)
        await entorno.sync.iniciar(uid: s.userId)
        fase = .lista
        pestana = .inicio
        Task { await entorno.sync.sincronizar() }
        atenderIntenciones()
    }

    func salir() async {
        let uid = sesion?.userId
        await entorno.sync.detener(borrandoUsuario: uid)
        await entorno.auth.salir()
        await AvisosLocales.quitarTodos()
        sesion = nil
        bloqueada = false
        modal = nil
        fase = .sinSesion(aviso: nil)
    }

    func sincronizar() async { await entorno.sync.sincronizar() }

    func encolar(_ op: OperacionBitacora) async throws { try await entorno.sync.encolar([op]) }
    func encolar(_ ops: [OperacionBitacora]) async throws { try await entorno.sync.encolar(ops) }

    func documentoVisible() async -> DocumentoBitacora? { await entorno.sync.documentoVisible() }

    func comprobarConservacion() async -> Bool? { await entorno.sync.comprobarConservacion() }

    @ObservationIgnored private var tareaAvisos: Task<Void, Never>?
    func reconciliarAvisos() {
        tareaAvisos?.cancel()
        tareaAvisos = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2))
            guard let self, !Task.isCancelled, let doc = await self.documentoVisible() else { return }
            await AvisosLocales.reconciliar(doc)
        }
    }

    private func escucharSync() {
        guard escuchaSync == nil else { return }
        let flujo = entorno.sync.informes
        escuchaSync = Task { [weak self] in
            for await i in flujo {
                guard let self else { return }
                let revisionAntes = self.informe.revision
                self.informe = i
                if !i.sesionRevocada { Task { await BandejaConector.revisar(self) } }
                if i.revision != revisionAntes, AvisosLocales.activos { self.reconciliarAvisos() }
                if i.sesionRevocada, self.sesion != nil {
                    let uid = self.sesion?.userId
                    self.sesion = nil
                    await self.entorno.sync.detener(borrandoUsuario: uid)
                    self.fase = .sinSesion(aviso: ErrorAuth.sesionRevocada.mensaje)
                }
            }
        }
    }

    private func vigilarRed() {
        red.pathUpdateHandler = { [weak self] camino in
            let hay = camino.status == .satisfied
            Task { @MainActor in
                guard let self else { return }
                if hay, !self.habiaRed, self.sesion != nil { Task { await self.entorno.sync.sincronizar() } }
                self.habiaRed = hay
            }
        }
        red.start(queue: DispatchQueue(label: "bitacora.red"))
    }

    // MARK: ciclo de vida

    func cambioDeFase(_ f: ScenePhase) {
        switch f {
        case .active:
            velo = false
            // Lo que dejó un atajo de Siri mientras la app estaba cerrada o en segundo plano.
            let enCola = cola.leer()
            if enCola != intenciones { intenciones = enCola; atenderIntenciones() }
            if bloqueada { Task { await desbloquear() } }
            else if sesion != nil { Task { await entorno.sync.sincronizar() } }
        case .inactive:
            // Antes de que iOS haga la foto del selector de apps.
            velo = true
        case .background:
            velo = true
            if bloqueoActivo, sesion != nil { bloqueada = true }
        @unknown default:
            break
        }
    }

    func desbloquear() async {
        guard bloqueada, !pidiendoBiometria else { return }
        guard Biometria.disponible else {
            // Sin Face ID ni código en el iPhone no hay con qué bloquear: se apaga para no dejar a nadie fuera.
            ponerBloqueo(false)
            bloqueada = false
            return
        }
        pidiendoBiometria = true
        defer { pidiendoBiometria = false }
        if await Biometria.comprobar(motivo: "abrir bitácora.") {
            bloqueada = false
            if sesion != nil { Task { await entorno.sync.sincronizar() } }
            atenderIntenciones()
        }
    }

    func activarBloqueo(_ si: Bool) async {
        if !si { ponerBloqueo(false); return }
        guard Biometria.disponible else { return }
        if await Biometria.comprobar(motivo: "activar el bloqueo de bitácora.") { ponerBloqueo(true) }
    }

    private func ponerBloqueo(_ si: Bool) {
        bloqueoActivo = si
        UserDefaults.standard.set(si, forKey: "bitacora.bloqueo")
    }

    // El tema es de cada cuenta en este iPhone (la PWA lo guarda en el navegador: no se sincroniza). La primera vez se
    // hereda el que había para todo el iPhone. Un tema que esta cuenta no puede usar vuelve a «sistema».
    func ponerTema(_ t: TemaElegido) {
        guard t.permitido(permisosTemas) else { return }
        TemaActivo.elegido = t
        tema = t
        UserDefaults.standard.set(t.rawValue, forKey: "bitacora.tema")
        if let uid = sesion?.userId { UserDefaults.standard.set(t.rawValue, forKey: "bitacora.tema.\(uid)") }
    }

    private func temaDeCuenta(_ uid: String) {
        uso = UsoApartados.cargar(uid)
        let l = UserDefaults.standard.string(forKey: "bitacora.letra.\(uid)").flatMap(EscalaLetra.init(rawValue:)) ?? .normal
        if l != letra { LetraActiva.elegida = l; letra = l }
        permisosTemas = PermisosTemasRemotos.guardados(uid)
        let guardado = UserDefaults.standard.string(forKey: "bitacora.tema.\(uid)").flatMap(TemaElegido.init(rawValue:)) ?? tema
        let t = guardado.permitido(permisosTemas) ? guardado : .sistema
        if t != tema { TemaActivo.elegido = t; tema = t }
        let cliente = entorno.cliente, auth = entorno.auth
        Task { [weak self] in
            guard let p = await PermisosTemasRemotos.leer(uid, cliente: cliente, auth: auth), let self, self.sesion?.userId == uid else { return }
            self.permisosTemas = p
            if !self.tema.permitido(p) { TemaActivo.elegido = .sistema; self.tema = .sistema }
        }
    }

    // MARK: enlaces

    func recibirURL(_ url: URL) {
        let intencion = url.isFileURL ? EnlaceProfundo.desdeArchivo(url) : EnlaceProfundo.interpretar(url)
        guard let intencion else {
            Registro.app.notice("Enlace no admitido, se ignora.")
            return
        }
        do {
            try cola.anadir(intencion)
            intenciones = cola.leer()
        } catch {
            // Sin poder guardarla, se atiende ya y se avisa: si la app se cierra antes, se perdería.
            avisoCola = "no se pudo guardar lo recibido en este iPhone. atiéndelo ahora."
            if !intenciones.contains(intencion) { intenciones.append(intencion) }
        }
        atenderIntenciones()
    }

    private func atenderIntenciones() {
        guard fase == .lista, !bloqueada, modal == nil, let primera = intenciones.first else { return }
        // Gasto o ingreso rápido: va directo al editor de movimientos.
        if case .rapido(let tipo) = primera {
            intenciones = (try? cola.quitar(primera)) ?? intenciones.filter { $0 != primera }
            pestana = .finanzas
            modal = .movimiento(OperacionBitacora.nuevoIdMovimiento(), tipo: tipo.rawValue)
            return
        }
        if case let .apuntar(texto, url) = primera {
            // Siri, los enlaces y «Abrir en» abren la misma hoja que el +, con el texto puesto.
            let t = [texto, url ?? ""].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.joined(separator: " ")
            modal = .apuntar(ApuntarInicial(texto: String(t.prefix(2000)), intencion: primera))
        }
    }

    func resolverIntencion(_ i: IntencionEntrante) {
        do {
            intenciones = try cola.quitar(i)
            avisoCola = nil
        } catch {
            intenciones.removeAll { $0 == i }
            avisoCola = "no se pudo actualizar la lista de lo recibido. puede volver a aparecer."
        }
        modal = nil
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(400))
            atenderIntenciones()
        }
    }
}
