import Foundation

enum EstadoSync: Equatable, Sendable {
    case reposo
    case trayendo
    case sinConexion
    case error(String)
}

struct ResumenBloque: Sendable, Identifiable, Equatable {
    let id: String
    let tipo: String
    let elementos: Int?
    let bytes: Int
    let conocida: Bool
}

struct ResumenDocumento: Sendable, Equatable {
    let bytes: Int
    let bloques: [ResumenBloque]
    let desconocidas: [String]
    let ausentes: [String]
    let conservaTodo: Bool

    init(_ doc: DocumentoBitacora) {
        bytes = doc.tamano
        bloques = doc.claves.sorted().map { k in
            let v = try? doc.valor(de: k)
            let (tipo, n): (String, Int?) = {
                switch v {
                case .array(let a)?: return ("lista", a.count)
                case .object(let o)?: return ("objeto", o.count)
                case .string?: return ("texto", nil)
                case .number?: return ("número", nil)
                case .bool?: return ("sí/no", nil)
                case .null?: return ("vacío", nil)
                case nil: return ("ilegible", nil)
                }
            }()
            return ResumenBloque(id: k, tipo: tipo, elementos: n, bytes: doc.bytes(de: k)?.count ?? 0, conocida: ContratoDatos.todas.contains(k))
        }
        desconocidas = doc.clavesDesconocidas
        ausentes = doc.clavesAusentes
        conservaTodo = doc.conservaTodoAlReescribir()
    }
}

struct InformeSync: Sendable, Equatable {
    var estado: EstadoSync = .reposo
    var ultimaSincronizacion: Date?
    var actualizadoNube: String?
    var resumen: ResumenDocumento?
    var revision = 0
    var sesionRevocada = false
}

// Un solo ciclo a la vez. idle -> pulling -> (replayingPending -> pushing, cuando haya escrituras) -> idle.
// Sin red o con error se reintenta con espera exponencial y algo de azar; al cerrar sesión se cancela todo.
actor SyncEngine {
    private let auth: AuthRepository
    private let remoto: BitacoraRemoteDataSource
    private let almacen: AlmacenLocal
    private var enCurso: Task<Void, Never>?
    private var reintento: Task<Void, Never>?
    private var intentos = 0
    private var informe = InformeSync()
    private var activo = true
    private let continuacion: AsyncStream<InformeSync>.Continuation
    nonisolated let informes: AsyncStream<InformeSync>

    init(auth: AuthRepository, remoto: BitacoraRemoteDataSource, almacen: AlmacenLocal) {
        self.auth = auth
        self.remoto = remoto
        self.almacen = almacen
        var c: AsyncStream<InformeSync>.Continuation!
        informes = AsyncStream(bufferingPolicy: .bufferingNewest(1)) { c = $0 }
        continuacion = c
    }

    // Arranque: pinta con la copia local antes de ir a la red.
    func cargarCopiaLocal(uid: String) async {
        activo = true
        let e = await almacen.estado(uid: uid)
        informe.ultimaSincronizacion = e.ultimaSincronizacion
        informe.actualizadoNube = e.actualizadoNube
        if let d = await almacen.leerBase(uid: uid), let doc = try? DocumentoBitacora(datos: d) {
            informe.resumen = ResumenDocumento(doc)
            informe.revision += 1
        }
        publicar()
    }

    func sincronizar() async {
        guard activo else { return }
        if let enCurso { return await enCurso.value }
        reintento?.cancel()
        reintento = nil
        let t = Task { await self.ciclo() }
        enCurso = t
        await t.value
        enCurso = nil
    }

    func detener(borrandoUsuario uid: String?) async {
        activo = false
        reintento?.cancel()
        reintento = nil
        enCurso?.cancel()
        if let uid { await almacen.borrarUsuario(uid) }
        informe = InformeSync()
        publicar()
    }

    private func ciclo() async {
        informe.estado = .trayendo
        publicar()
        do {
            let sesion = try await auth.sesionValida()
            try Task.checkCancellation()
            guard let fila = try await remoto.leerFila(sesion: sesion) else {
                informe.estado = .error("tu cuenta aún no tiene datos en la nube.")
                publicar()
                return
            }
            try Task.checkCancellation()
            guard activo else { return }
            // Se comprueba que se puede leer antes de sustituir la copia buena.
            let doc = try DocumentoBitacora(datos: fila.datos)
            try await almacen.guardarBase(fila.datos, uid: sesion.userId)
            let ahora = Date()
            try await almacen.actualizarEstado(uid: sesion.userId) {
                $0.actualizadoNube = fila.actualizado
                $0.ultimaSincronizacion = ahora
                $0.ultimoError = nil
            }
            intentos = 0
            informe.estado = .reposo
            informe.ultimaSincronizacion = ahora
            informe.actualizadoNube = fila.actualizado
            informe.resumen = ResumenDocumento(doc)
            informe.revision += 1
            publicar()
        } catch is CancellationError {
            return
        } catch ErrorAuth.sesionRevocada {
            informe.sesionRevocada = true
            informe.estado = .error(ErrorAuth.sesionRevocada.mensaje)
            publicar()
        } catch ErrorRed.sinConexion {
            informe.estado = .sinConexion
            publicar()
            programarReintento()
        } catch {
            Registro.sync.error("Fallo al traer la nube: \(String(describing: error), privacy: .private)")
            informe.estado = .error(SyncEngine.mensaje(error))
            publicar()
            programarReintento()
        }
    }

    private func programarReintento() {
        guard activo else { return }
        intentos += 1
        let espera = min(pow(2, Double(min(intentos, 8))) * 2, 300) * Double.random(in: 0.8...1.2)
        reintento = Task { [weak self] in
            try? await Task.sleep(for: .seconds(espera))
            guard !Task.isCancelled else { return }
            await self?.sincronizar()
        }
    }

    private func publicar() { continuacion.yield(informe) }

    static func mensaje(_ e: Error) -> String {
        switch e {
        case ErrorRed.servidor(let c): return "el servidor respondió \(c)."
        case ErrorRed.noAutorizado: return "la nube no deja leer tus datos."
        case ErrorRed.respuestaInvalida, is ErrorJSON: return "llegaron datos que no se entienden."
        case let a as ErrorAuth: return a.mensaje
        default: return "no se pudo sincronizar."
        }
    }
}
