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

// Barato a propósito: el tipo sale del primer byte y el recuento se hace sin construir los valores.
struct ResumenDocumento: Sendable, Equatable {
    let bytes: Int
    let bloques: [ResumenBloque]
    let desconocidas: [String]
    let ausentes: [String]

    init(_ doc: DocumentoBitacora) {
        bytes = doc.tamano
        bloques = doc.claves.sorted().map { k in
            let d = doc.bytes(de: k) ?? Data()
            let tipo: String
            switch d.first {
            case UInt8(ascii: "[")?: tipo = "lista"
            case UInt8(ascii: "{")?: tipo = "objeto"
            case UInt8(ascii: "\"")?: tipo = "texto"
            case UInt8(ascii: "t")?, UInt8(ascii: "f")?: tipo = "sí/no"
            case UInt8(ascii: "n")?: tipo = "vacío"
            default: tipo = "número"
            }
            return ResumenBloque(id: k, tipo: tipo, elementos: LectorJSON.contarElementos(d), bytes: d.count, conocida: ContratoDatos.conocida(k))
        }
        desconocidas = doc.clavesDesconocidas
        ausentes = doc.clavesAusentes
    }
}

struct InformeSync: Sendable, Equatable {
    var estado: EstadoSync = .reposo
    var ultimaSincronizacion: Date?
    var actualizadoNube: String?
    var resumen: ResumenDocumento?
    var pendientes = 0
    var revision = 0
    var sesionRevocada = false
    var escrituraProtegida: Bool?
}

enum ErrorSync: Error, Equatable {
    case sinCuenta
    case colaIlegible
    case conflicto
}

// Un solo ciclo a la vez: traer la fila, volver a aplicar encima la cola de cambios, subir el parche y guardar la
// nueva base. Cada `iniciar` abre una generación ligada a una cuenta; lo que vuelve de un ciclo de otra generación
// se descarta sin publicar ni guardar nada. Los errores de red o del servidor (5xx) se reintentan con espera
// exponencial y azar; los demás no, para no machacar con un token o una petición que el servidor ya rechazó.
actor SyncEngine {
    private let auth: AuthRepository
    private let remoto: BitacoraRemoteDataSource
    private let almacen: AlmacenLocal
    private var enCurso: Task<Void, Never>?
    private var reintento: Task<Void, Never>?
    private var intentos = 0
    private var informe = InformeSync()
    private var generacion = 0
    private var uid: String?
    private var otraVuelta = false
    private let continuacion: AsyncStream<InformeSync>.Continuation
    nonisolated let informes: AsyncStream<InformeSync>
    private var esperaBase: Double = 2
    func ponerEsperaBase(_ s: Double) { esperaBase = s }
    func informeActual() -> InformeSync { informe }
    func generacionActual() -> Int { generacion }

    init(auth: AuthRepository, remoto: BitacoraRemoteDataSource, almacen: AlmacenLocal) {
        self.auth = auth
        self.remoto = remoto
        self.almacen = almacen
        var c: AsyncStream<InformeSync>.Continuation!
        informes = AsyncStream(bufferingPolicy: .bufferingNewest(1)) { c = $0 }
        continuacion = c
    }

    // Abre la generación de una cuenta y pinta con su copia local antes de ir a la red.
    func iniciar(uid: String) async {
        // La generación vieja queda obsoleta ya, antes de esperar a que su ciclo termine.
        generacion += 1
        let gen = generacion
        await detenerCiclos()
        guard gen == generacion else { return }
        self.uid = uid
        intentos = 0
        informe = InformeSync()
        let e = try? await almacen.estado(uid: uid)
        informe.ultimaSincronizacion = e?.ultimaSincronizacion
        informe.actualizadoNube = e?.actualizadoNube
        informe.pendientes = e?.pendientes.count ?? 0
        if let d = await almacen.leerBase(uid: uid), let doc = try? DocumentoBitacora(datos: d) {
            informe.resumen = ResumenDocumento(doc)
            informe.revision += 1
        }
        publicar()
    }

    func detener(borrandoUsuario borrar: String?) async {
        generacion += 1
        uid = nil
        await detenerCiclos()
        if let borrar { await almacen.borrarUsuario(borrar) }
        informe = InformeSync()
        publicar()
    }

    private func detenerCiclos() async {
        otraVuelta = false
        reintento?.cancel()
        reintento = nil
        if let t = enCurso {
            t.cancel()
            await t.value
        }
        enCurso = nil
    }

    func sincronizar() async {
        guard uid != nil else { return }
        if let enCurso { return await enCurso.value }
        reintento?.cancel()
        reintento = nil
        let gen = generacion
        let t = Task { await self.ciclo(generacion: gen) }
        enCurso = t
        await t.value
        guard generacion == gen else { return }
        enCurso = nil
        // Lo que se encoló durante el ciclo no iba en su lote: otra vuelta.
        if otraVuelta {
            otraVuelta = false
            await sincronizar()
        }
    }

    // La cola se guarda en disco antes de devolver: la interfaz solo da el cambio por hecho después.
    func encolar(_ op: OperacionBitacora) async throws { try await encolar([op]) }

    // Varias operaciones en una sola escritura de la cola: o entran todas o ninguna.
    func encolar(_ ops: [OperacionBitacora]) async throws {
        guard let uid else { throw ErrorSync.sinCuenta }
        let pendientes = ops.map { OperacionPendiente($0) }
        var total = 0
        try await almacen.actualizarEstado(uid: uid) {
            $0.pendientes.append(contentsOf: pendientes)
            total = $0.pendientes.count
        }
        informe.pendientes = total
        informe.revision += 1
        publicar()
        if enCurso != nil { otraVuelta = true }
        Task { await self.sincronizar() }
    }

    // Lo que ve la interfaz: la base confirmada con la cola aplicada encima.
    func documentoVisible() async -> DocumentoBitacora? {
        guard let uid, let d = await almacen.leerBase(uid: uid), let base = try? DocumentoBitacora(datos: d) else { return nil }
        let ops = ((try? await almacen.estado(uid: uid))?.pendientes ?? []).map(\.operacion)
        return AplicarOperaciones.sobre(base, ops).0
    }

    // Diagnóstico de «estado.»: reescribir la copia no cambia ninguna clave. No va en cada sincronización.
    func comprobarConservacion() async -> Bool? {
        guard let uid, let d = await almacen.leerBase(uid: uid), let doc = try? DocumentoBitacora(datos: d) else { return nil }
        return doc.conservaTodoAlReescribir()
    }

    private func vigente(_ gen: Int) -> Bool { gen == generacion && !Task.isCancelled }

    private func ciclo(generacion gen: Int) async {
        guard let uid, vigente(gen) else { return }
        informe.estado = .trayendo
        publicar()
        do {
            try await conRenovacion(uid: uid, gen: gen) { sesion in try await self.traerYSubir(sesion: sesion, uid: uid, gen: gen) }
            guard vigente(gen) else { return }
            intentos = 0
            informe.estado = .reposo
            publicar()
        } catch {
            guard vigente(gen) else { return }
            switch error {
            case is CancellationError, ErrorAuth.sinSesion, ErrorSync.sinCuenta:
                return
            case ErrorAuth.sesionRevocada:
                informe.sesionRevocada = true
                informe.estado = .error(ErrorAuth.sesionRevocada.mensaje)
                publicar()
            case ErrorRed.sinConexion:
                informe.estado = .sinConexion
                publicar()
                programarReintento(gen)
            default:
                Registro.sync.error("Fallo al sincronizar: \(String(describing: error), privacy: .private)")
                informe.estado = .error(SyncEngine.mensaje(error))
                try? await almacen.actualizarEstado(uid: uid) { $0.ultimoError = SyncEngine.mensaje(error) }
                publicar()
                if SyncEngine.reintentable(error) { programarReintento(gen) }
            }
        }
    }

    // Ante un 401/403 se renueva el token una sola vez y se repite. Si la renovación también se rechaza, Auth lanza
    // sesionRevocada; si con el token nuevo se vuelve a rechazar, es un error terminal, sin reintentos.
    private func conRenovacion(uid: String, gen: Int, _ trabajo: (Sesion) async throws -> Void) async throws {
        let sesion = try await auth.sesionValida()
        guard sesion.userId == uid else { throw ErrorSync.sinCuenta }
        do {
            try await trabajo(sesion)
        } catch ErrorRed.noAutorizado {
            guard vigente(gen) else { throw CancellationError() }
            let nueva = try await auth.sesionValida(forzarRenovacion: true)
            guard nueva.userId == uid, vigente(gen) else { throw ErrorSync.sinCuenta }
            try await trabajo(nueva)
        }
    }

    private func traerYSubir(sesion: Sesion, uid: String, gen: Int) async throws {
        // Si otro cliente escribe el mismo bloque entre la lectura y la escritura, el servidor no escribe y se vuelve a
        // empezar sobre lo nuevo: las operaciones se aplican otra vez encima, así no se pisa lo que hizo el otro.
        var intento = 0
        var fila = FilaRemota(datos: Data(), actualizado: nil)
        var base = DocumentoBitacora.vacio
        var lote: [OperacionPendiente] = []
        while true {
            guard let leida = try await remoto.leerFila(sesion: sesion) else { throw ErrorRed.servidor(404) }
            guard vigente(gen) else { throw CancellationError() }
            fila = leida
            let nube = try DocumentoBitacora(datos: fila.datos)
            lote = try await almacen.estado(uid: uid).pendientes
            base = nube
            guard !lote.isEmpty else { break }
            let (resultado, parche) = AplicarOperaciones.sobre(nube, lote.map(\.operacion))
            base = resultado
            guard !parche.isEmpty else { break }
            guard vigente(gen) else { throw CancellationError() }
            let respuesta: ResultadoMezcla
            if let huellas = fila.huellas {
                respuesta = try await remoto.mezclar(parche: parche, huellas: huellas, sesion: sesion)
            } else {
                var esperado: [String: JSONValue?] = [:]
                for k in parche.keys { esperado[k] = .some((try? nube.valor(de: k)) ?? nil) }
                respuesta = try await remoto.mezclar(parche: parche, esperado: esperado, sesion: sesion)
            }
            switch respuesta {
            case .aplicada(let protegida):
                informe.escrituraProtegida = protegida
            case .conflicto:
                intento += 1
                if intento < 4 { continue }
                throw ErrorSync.conflicto
            }
            break
        }
        // A partir de aquí el servidor ya tiene el cambio: aunque la vista ya no sea vigente, se guarda la base y se
        // quita el lote de la cola para no dejarlo a medias. Lo que se encoló mientras tanto se queda.
        try await almacen.guardarBase(lote.isEmpty ? fila.datos : base.serializado(), uid: uid)
        let ahora = Date()
        let hechas = Set(lote.map(\.id))
        var quedan = 0
        try await almacen.actualizarEstado(uid: uid) {
            $0.pendientes.removeAll { hechas.contains($0.id) }
            $0.confirmadasRecientes = Array(($0.confirmadasRecientes + hechas).suffix(200))
            $0.actualizadoNube = fila.actualizado
            $0.ultimaSincronizacion = ahora
            $0.ultimoError = nil
            quedan = $0.pendientes.count
        }
        guard vigente(gen) else { return }
        informe.ultimaSincronizacion = ahora
        informe.actualizadoNube = fila.actualizado
        informe.resumen = ResumenDocumento(base)
        informe.pendientes = quedan
        informe.revision += 1
    }

    private func programarReintento(_ gen: Int) {
        guard gen == generacion else { return }
        intentos += 1
        let espera = min(pow(2, Double(min(intentos, 8))) * esperaBase, 300) * Double.random(in: 0.8...1.2)
        reintento = Task { [weak self] in
            try? await Task.sleep(for: .seconds(espera))
            guard !Task.isCancelled else { return }
            await self?.sincronizar()
        }
    }

    private func publicar() { continuacion.yield(informe) }

    static func reintentable(_ e: Error) -> Bool {
        switch e {
        case ErrorRed.sinConexion, ErrorSync.conflicto: return true
        case ErrorRed.servidor(let c): return c >= 500 || c == 429
        default: return false
        }
    }

    static func mensaje(_ e: Error) -> String {
        switch e {
        case ErrorSync.conflicto: return "otro dispositivo está escribiendo a la vez. se reintenta solo."
        case ErrorServidor.sinActualizar: return "el servidor necesita actualizarse: tus cambios esperan en este iPhone."
        case ErrorRed.servidor(404): return "tu cuenta aún no tiene datos en la nube."
        case ErrorRed.servidor(let c): return "el servidor respondió \(c)."
        case ErrorRed.noAutorizado: return "la nube no deja leer tus datos."
        case ErrorRed.respuestaInvalida, is ErrorJSON: return "llegaron datos que no se entienden."
        case is DecodingError, is CocoaError: return "no se pudo leer la copia de este iPhone."
        case let a as ErrorAuth: return a.mensaje
        default: return "no se pudo sincronizar."
        }
    }
}
