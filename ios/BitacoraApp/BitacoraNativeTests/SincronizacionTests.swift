import XCTest
@testable import BitacoraNative

// MARK: piezas de prueba

// Deja pasar una petición solo cuando el test lo dice: así se ordenan las carreras sin depender de tiempos.
actor Puerta {
    private var esperando: [CheckedContinuation<Void, Never>] = []
    private var abierta = false
    private(set) var llegadas = 0

    func esperar() async {
        llegadas += 1
        if abierta { return }
        await withCheckedContinuation { esperando.append($0) }
    }

    func abrir() {
        abierta = true
        esperando.forEach { $0.resume() }
        esperando = []
    }

    func cerrar() { abierta = false }
}

func esperarA(_ condicion: @escaping () async -> Bool) async {
    for _ in 0..<500 {
        if await condicion() { return }
        try? await Task.sleep(for: .milliseconds(5))
    }
    XCTFail("la condición no llegó a cumplirse")
}

final class SesionEnMemoria: AlmacenSesion, @unchecked Sendable {
    private let cerrojo = NSLock()
    private var s: Sesion?
    init(_ s: Sesion? = nil) { self.s = s }
    func leer() -> Sesion? { cerrojo.lock(); defer { cerrojo.unlock() }; return s }
    func guardar(_ n: Sesion) { cerrojo.lock(); s = n; cerrojo.unlock() }
    func borrar() { cerrojo.lock(); s = nil; cerrojo.unlock() }
}

func respuestaToken(_ uid: String, refresh: String) -> Data {
    Data(#"{"access_token":"a-\#(refresh)","refresh_token":"\#(refresh)","expires_in":3600,"user":{"id":"\#(uid)","email":"x@y.es"}}"#.utf8)
}

func sesion(_ uid: String, refresh: String = "r1", caduca: Date = Date().addingTimeInterval(3600)) -> Sesion {
    Sesion(accessToken: "a-\(refresh)", refreshToken: refresh, caduca: caduca, userId: uid, email: nil)
}

actor AuthFalsa: AuthRepository {
    var actual: Sesion?
    private(set) var renovacionesForzadas = 0
    var rechazarRenovacion = false

    init(_ s: Sesion?) { actual = s }
    func sesionGuardada() -> Sesion? { actual }
    func entrar(email: String, contrasena: String) async throws -> Sesion { throw ErrorAuth.credenciales }
    func sesionValida(forzarRenovacion: Bool) async throws -> Sesion {
        guard let s = actual else { throw ErrorAuth.sinSesion }
        if forzarRenovacion {
            renovacionesForzadas += 1
            if rechazarRenovacion { actual = nil; throw ErrorAuth.sesionRevocada }
            actual = sesion(s.userId, refresh: "r\(renovacionesForzadas + 1)")
        }
        return actual!
    }
    func salir() async { actual = nil }
    func poner(_ s: Sesion?) { actual = s }
    func rechazar() { rechazarRenovacion = true }
}

actor RemotoFalso: BitacoraRemoteDataSource {
    var datos: Data
    var noAutorizadosPendientes = 0
    var perderRespuestaDeMezcla = false
    var puertaLectura: Puerta?
    private(set) var lecturas = 0
    private(set) var parches: [[String: JSONValue]] = []

    init(_ texto: String) { datos = Data(texto.utf8) }

    func leerFila(sesion: Sesion) async throws -> FilaRemota? {
        lecturas += 1
        if let puertaLectura { await puertaLectura.esperar() }
        if noAutorizadosPendientes > 0 { noAutorizadosPendientes -= 1; throw ErrorRed.noAutorizado }
        return FilaRemota(datos: datos, actualizado: "t\(lecturas)")
    }

    // Como merge_bitacora_si: compara lo esperado con lo que hay y, si otro escribió antes, no toca nada.
    var escrituraAjena: [String: JSONValue]?
    func mezclar(parche: [String: JSONValue], esperado: [String: JSONValue?], sesion: Sesion) async throws -> ResultadoMezcla {
        if let ajena = escrituraAjena {
            escrituraAjena = nil
            datos = try DocumentoBitacora(datos: datos).aplicandoParche(ajena).serializado()
        }
        let actual = try DocumentoBitacora(datos: datos)
        for (k, v) in esperado where ((try? actual.valor(de: k)) ?? nil) != v { return .conflicto }
        parches.append(parche)
        datos = actual.aplicandoParche(parche).serializado()
        if perderRespuestaDeMezcla { perderRespuestaDeMezcla = false; throw ErrorRed.sinConexion }
        return .aplicada(protegida: true)
    }
    func escribirOtroAntes(_ p: [String: JSONValue]) { escrituraAjena = p }
    func mezclar(parche: [String: JSONValue], huellas: [String: String], sesion: Sesion) async throws -> ResultadoMezcla {
        var esperado: [String: JSONValue?] = [:]
        let actual = try DocumentoBitacora(datos: datos)
        for k in parche.keys { esperado[k] = .some((try? actual.valor(de: k)) ?? nil) }
        return try await mezclar(parche: parche, esperado: esperado, sesion: sesion)
    }

    func ponerNoAutorizados(_ n: Int) { noAutorizadosPendientes = n }
    func ponerPuerta(_ p: Puerta?) { puertaLectura = p }
    func perderLaSiguienteRespuesta() { perderRespuestaDeMezcla = true }
}

func almacenTemporal() -> AlmacenLocal {
    AlmacenLocal(raiz: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
}

let docInicial = #"{"dayPlanner": {"days": {}, "backlog": []}, "entries": [{"id": "e1"}], "claveDelFuturo": {"x": 1}, "apuntes": [{"id": "a"}]}"#

// MARK: sesión

final class AuthCarrerasTests: XCTestCase {
    func autenticacion(puerta: Puerta, almacen: SesionEnMemoria) -> AuthSupabase {
        let cliente = ClienteSupabase(transporte: { r in
            let url = r.url!.absoluteString
            if url.contains("grant_type=refresh_token") {
                await puerta.esperar()
                return (respuestaToken("A", refresh: "r-renovado"), 200)
            }
            if url.contains("grant_type=password") { return (respuestaToken("B", refresh: "rB"), 200) }
            return (Data(), 204)
        })
        return AuthSupabase(cliente: cliente, almacen: almacen)
    }

    func testCerrarSesionDuranteUnaRenovacionNoLaResucita() async {
        let puerta = Puerta()
        let guardada = SesionEnMemoria(sesion("A", caduca: Date().addingTimeInterval(10)))
        let auth = autenticacion(puerta: puerta, almacen: guardada)
        let renovacion = Task { try await auth.sesionValida() }
        await esperarA { await puerta.llegadas == 1 }
        let salida = Task { await auth.salir() }
        await puerta.abrir()
        await salida.value
        let resultado = await renovacion.result
        XCTAssertThrowsError(try resultado.get())
        XCTAssertNil(guardada.leer())
        let tras = await auth.sesionGuardada()
        XCTAssertNil(tras)
    }

    func testEntrarConOtraCuentaDuranteUnaRenovacion() async throws {
        let puerta = Puerta()
        let guardada = SesionEnMemoria(sesion("A", caduca: Date().addingTimeInterval(10)))
        let auth = autenticacion(puerta: puerta, almacen: guardada)
        let renovacion = Task { try await auth.sesionValida() }
        await esperarA { await puerta.llegadas == 1 }
        let entrada = Task { try await auth.entrar(email: "b@b.es", contrasena: "x") }
        await puerta.abrir()
        let b = try await entrada.value
        _ = await renovacion.result
        XCTAssertEqual(b.userId, "B")
        XCTAssertEqual(guardada.leer()?.userId, "B")
        XCTAssertEqual(guardada.leer()?.refreshToken, "rB")
    }

    func testRenovacionRechazadaBorraLaSesion() async {
        let guardada = SesionEnMemoria(sesion("A", caduca: Date().addingTimeInterval(10)))
        let auth = AuthSupabase(cliente: ClienteSupabase(transporte: { _ in (Data(#"{"error":"invalid_grant"}"#.utf8), 400) }), almacen: guardada)
        do {
            _ = try await auth.sesionValida()
            XCTFail("debía rechazarse")
        } catch {
            XCTAssertEqual(error as? ErrorAuth, .sesionRevocada)
        }
        XCTAssertNil(guardada.leer())
    }

    func testDosPeticionesSeQuedanConUnaSolaRenovacion() async throws {
        let puerta = Puerta()
        let auth = autenticacion(puerta: puerta, almacen: SesionEnMemoria(sesion("A", caduca: Date().addingTimeInterval(10))))
        let a = Task { try await auth.sesionValida() }
        let b = Task { try await auth.sesionValida() }
        await esperarA { await puerta.llegadas >= 1 }
        try? await Task.sleep(for: .milliseconds(50))
        await puerta.abrir()
        let ra = try await a.value, rb = try await b.value
        XCTAssertEqual(ra.refreshToken, "r-renovado")
        XCTAssertEqual(rb.refreshToken, "r-renovado")
        let llegadas = await puerta.llegadas
        XCTAssertEqual(llegadas, 1)
    }
}

// MARK: sincronización

final class SyncTests: XCTestCase {
    func testUn401RenuevaUnaVezYRepite() async {
        let auth = AuthFalsa(sesion("A"))
        let remoto = RemotoFalso(docInicial)
        await remoto.ponerNoAutorizados(1)
        let almacen = almacenTemporal()
        let sync = SyncEngine(auth: auth, remoto: remoto, almacen: almacen)
        await sync.iniciar(uid: "A")
        await sync.sincronizar()
        let forzadas = await auth.renovacionesForzadas
        let lecturas = await remoto.lecturas
        let base = await almacen.leerBase(uid: "A")
        XCTAssertEqual(forzadas, 1)
        XCTAssertEqual(lecturas, 2)
        XCTAssertNotNil(base)
    }

    func testUn401PersistenteNoSeReintentaEnBucle() async throws {
        let auth = AuthFalsa(sesion("A"))
        let remoto = RemotoFalso(docInicial)
        await remoto.ponerNoAutorizados(100)
        let sync = SyncEngine(auth: auth, remoto: remoto, almacen: almacenTemporal())
        await sync.ponerEsperaBase(0.001)
        await sync.iniciar(uid: "A")
        await sync.sincronizar()
        try await Task.sleep(for: .milliseconds(300))
        let lecturas = await remoto.lecturas
        let forzadas = await auth.renovacionesForzadas
        XCTAssertEqual(lecturas, 2)
        XCTAssertEqual(forzadas, 1)
    }

    func testRenovacionRechazadaTrasUn401MarcaLaSesionRevocada() async {
        let auth = AuthFalsa(sesion("A"))
        await auth.rechazar()
        let remoto = RemotoFalso(docInicial)
        await remoto.ponerNoAutorizados(1)
        let sync = SyncEngine(auth: auth, remoto: remoto, almacen: almacenTemporal())
        await sync.iniciar(uid: "A")
        await sync.sincronizar()
        let informe = await sync.informeActual()
        XCTAssertTrue(informe.sesionRevocada)
    }

    func testCerrarSesionDuranteLaDescargaNoGuardaNada() async {
        let puerta = Puerta()
        let remoto = RemotoFalso(docInicial)
        await remoto.ponerPuerta(puerta)
        let almacen = almacenTemporal()
        let sync = SyncEngine(auth: AuthFalsa(sesion("A")), remoto: remoto, almacen: almacen)
        await sync.iniciar(uid: "A")
        let ciclo = Task { await sync.sincronizar() }
        await esperarA { await puerta.llegadas == 1 }
        let parada = Task { await sync.detener(borrandoUsuario: "A") }
        await esperarA { await sync.generacionActual() == 2 }
        await puerta.abrir()
        await parada.value
        await ciclo.value
        let base = await almacen.leerBase(uid: "A")
        XCTAssertNil(base)
    }

    func testCambiarDeCuentaAlMomentoNoMezclaLosDatos() async {
        let puerta = Puerta()
        let remoto = RemotoFalso(docInicial)
        await remoto.ponerPuerta(puerta)
        let auth = AuthFalsa(sesion("A"))
        let almacen = almacenTemporal()
        let sync = SyncEngine(auth: auth, remoto: remoto, almacen: almacen)
        await sync.iniciar(uid: "A")
        let ciclo = Task { await sync.sincronizar() }
        await esperarA { await puerta.llegadas == 1 }
        await auth.poner(sesion("B"))
        let cambio = Task { await sync.iniciar(uid: "B") }
        await esperarA { await sync.generacionActual() == 2 }
        await puerta.abrir()
        await cambio.value
        await ciclo.value
        let baseA = await almacen.leerBase(uid: "A")
        XCTAssertNil(baseA, "el ciclo de A no debe guardar nada tras cambiar a B")
        await sync.sincronizar()
        let baseB = await almacen.leerBase(uid: "B")
        XCTAssertNotNil(baseB)
    }

    func testSubeUnaTareaConservandoLoDemas() async throws {
        let remoto = RemotoFalso(docInicial)
        let almacen = almacenTemporal()
        let sync = SyncEngine(auth: AuthFalsa(sesion("A")), remoto: remoto, almacen: almacen)
        await sync.iniciar(uid: "A")
        await sync.sincronizar()
        try await sync.encolar(.crearTarea(id: "planner_1", dia: "2026-11-06", titulo: "llamar", hora: nil))
        await sync.sincronizar()
        await esperarA { (try? await almacen.estado(uid: "A").pendientes.isEmpty) == true }
        let parches = await remoto.parches
        XCTAssertEqual(parches.count, 1)
        XCTAssertEqual(Array(parches[0].keys), ["dayPlanner"])
        let enLaNube = await remoto.datos
        let nube = try DocumentoBitacora(datos: enLaNube)
        XCTAssertEqual(try nube.valor(de: "dayPlanner")?["days"]?["2026-11-06"]?.lista?.first?["title"], .string("llamar"))
        XCTAssertEqual(nube.bytes(de: "claveDelFuturo"), try DocumentoBitacora(datos: Data(docInicial.utf8)).bytes(de: "claveDelFuturo"))
        XCTAssertEqual(nube.bytes(de: "apuntes"), try DocumentoBitacora(datos: Data(docInicial.utf8)).bytes(de: "apuntes"))
        let guardada = await almacen.leerBase(uid: "A")
        let base = try DocumentoBitacora(datos: XCTUnwrap(guardada))
        XCTAssertEqual(try base.valor(de: "dayPlanner"), try nube.valor(de: "dayPlanner"))
    }

    func testRespuestaPerdidaNoDuplica() async throws {
        let remoto = RemotoFalso(docInicial)
        let almacen = almacenTemporal()
        let sync = SyncEngine(auth: AuthFalsa(sesion("A")), remoto: remoto, almacen: almacen)
        await sync.ponerEsperaBase(100)
        await sync.iniciar(uid: "A")
        await sync.sincronizar()
        await remoto.perderLaSiguienteRespuesta()
        try await sync.encolar(.crearTarea(id: "planner_1", dia: "2026-11-06", titulo: "llamar", hora: "10:00"))
        await sync.sincronizar()
        // El servidor guardó, pero el iPhone no se enteró: la operación sigue en la cola.
        await esperarA {
            let enCola = (try? await almacen.estado(uid: "A").pendientes.count) ?? -1
            let subidas = await remoto.parches.count
            return enCola == 1 && subidas == 1
        }
        await sync.sincronizar()
        await esperarA { (try? await almacen.estado(uid: "A").pendientes.isEmpty) == true }
        let parches = await remoto.parches
        XCTAssertEqual(parches.count, 1, "la segunda vuelta ve el cambio ya en la nube y no vuelve a escribir")
        let enLaNube = await remoto.datos
        let nube = try DocumentoBitacora(datos: enLaNube)
        XCTAssertEqual(try nube.valor(de: "dayPlanner")?["days"]?["2026-11-06"]?.lista?.count, 1)
    }

    func testSiOtroEscribeEntreMedioSeReaplicaYNoSePierdeNada() async throws {
        let remoto = RemotoFalso(docInicial)
        let almacen = almacenTemporal()
        let sync = SyncEngine(auth: AuthFalsa(sesion("A")), remoto: remoto, almacen: almacen)
        await sync.ponerEsperaBase(100)
        await sync.iniciar(uid: "A")
        await sync.sincronizar()
        // La web añade una tarea justo antes de que llegue la escritura del iPhone.
        let web = try LectorJSON.valor(Data(#"{"days": {"2026-11-06": [{"id": "web", "title": "de la web"}]}, "backlog": []}"#.utf8))
        await remoto.escribirOtroAntes(["dayPlanner": web])
        try await sync.encolar([.crearTarea(id: "ios", dia: "2026-11-06", titulo: "del iphone", hora: nil)])
        await sync.sincronizar()
        await esperarA { (try? await almacen.estado(uid: "A").pendientes.isEmpty) == true }
        let enLaNube = await remoto.datos
        let ids = try DocumentoBitacora(datos: enLaNube).valor(de: "dayPlanner")?["days"]?["2026-11-06"]?.lista?.compactMap { $0["id"]?.texto }
        XCTAssertEqual(ids, ["web", "ios"])
    }

    func testLaVistaIncluyeLoQueEsperaEnLaCola() async throws {
        let remoto = RemotoFalso(docInicial)
        let almacen = almacenTemporal()
        let sync = SyncEngine(auth: AuthFalsa(sesion("A")), remoto: remoto, almacen: almacen)
        await sync.ponerEsperaBase(100)
        await sync.iniciar(uid: "A")
        await sync.sincronizar()
        await remoto.ponerNoAutorizados(100)
        try await sync.encolar(.crearTarea(id: "planner_9", dia: "2026-11-06", titulo: "sin red", hora: nil))
        let visible = await sync.documentoVisible()
        XCTAssertEqual(try visible?.valor(de: "dayPlanner")?["days"]?["2026-11-06"]?.lista?.count, 1)
    }
}

// MARK: operaciones

final class OperacionesTests: XCTestCase {
    func v(_ s: String) -> JSONValue { try! LectorJSON.valor(Data(s.utf8)) }
    let momento: Int64 = 1_794_481_200_000 // 12-11-2026, 12:00 en Madrid

    func testCrearEsIdempotente() {
        let op = OperacionBitacora.crearTarea(id: "p1", dia: "2026-11-06", titulo: "a", hora: "09:00")
        let una = AplicarOperaciones.aplicar(op, a: v(#"{"days":{},"backlog":[]}"#))
        XCTAssertEqual(AplicarOperaciones.aplicar(op, a: una), una)
        XCTAssertEqual(una["days"]?["2026-11-06"]?.lista?.first?["time"], .string("09:00"))
    }

    func testCrearNoPisaLoQueOtroCambio() {
        let nube = v(#"{"days":{"2026-11-06":[{"id":"p1","title":"renombrada en la web","done":false}]},"backlog":[]}"#)
        let r = AplicarOperaciones.aplicar(.crearTarea(id: "p1", dia: "2026-11-06", titulo: "original", hora: nil), a: nube)
        XCTAssertEqual(r, nube)
    }

    func testMarcarEsIdempotenteYSoloTocaSuTarea() {
        let nube = v(#"{"days":{"2026-11-12":[{"id":"p1","title":"a","done":false,"notes":"x"},{"id":"p2","title":"b","done":false}]},"backlog":[]}"#)
        let op = OperacionBitacora.marcarTarea(id: "p1", hecha: true, momentoMs: momento)
        let una = AplicarOperaciones.aplicar(op, a: nube)
        XCTAssertEqual(AplicarOperaciones.aplicar(op, a: una), una)
        let t = una["days"]?["2026-11-12"]?.lista
        XCTAssertEqual(t?[0]["done"], .bool(true))
        XCTAssertEqual(t?[0]["hechaEn"], .number(String(momento)))
        XCTAssertEqual(t?[0]["notes"], .string("x"))
        XCTAssertEqual(t?[1], nube["days"]?["2026-11-12"]?.lista?[1])
        let desmarcada = AplicarOperaciones.aplicar(.marcarTarea(id: "p1", hecha: false, momentoMs: momento), a: una)
        XCTAssertNil(desmarcada["days"]?["2026-11-12"]?.lista?[0]["hechaEn"])
    }

    func testMarcarUnaBorradaNoLaResucita() {
        let nube = v(#"{"days":{},"backlog":[]}"#)
        XCTAssertEqual(AplicarOperaciones.aplicar(.marcarTarea(id: "nada", hecha: true, momentoMs: momento), a: nube), nube)
    }

    func testMarcarUnaDeDiasPasadosLaTraeAHoy() {
        let nube = v(#"{"days":{"2026-11-10":[{"id":"p1","title":"vieja","done":false}]},"backlog":[]}"#)
        let r = AplicarOperaciones.aplicar(.marcarTarea(id: "p1", hecha: true, momentoMs: momento), a: nube)
        XCTAssertEqual(r["days"]?["2026-11-10"]?.lista?.count, 0)
        XCTAssertEqual(r["days"]?["2026-11-12"]?.lista?.first?["arrastrado"], .bool(true))
        XCTAssertEqual(r["days"]?["2026-11-12"]?.lista?.first?["done"], .bool(true))
    }

    func testMarcarEnPendientesSinDia() {
        let nube = v(#"{"days":{},"backlog":[{"id":"b1","title":"x"}]}"#)
        let r = AplicarOperaciones.aplicar(.marcarTarea(id: "b1", hecha: true, momentoMs: momento), a: nube)
        XCTAssertEqual(r["backlog"]?.lista?.first?["done"], .bool(true))
    }

    func testFormatoViejoDelPlanificador() {
        let viejo = v(#"{"dayKey":"2026-11-06","items":[{"id":"p1","title":"a"}]}"#)
        let r = AplicarOperaciones.aplicar(.crearTarea(id: "p2", dia: "2026-11-06", titulo: "b", hora: nil), a: viejo)
        XCTAssertEqual(r["days"]?["2026-11-06"]?.lista?.count, 2)
        XCTAssertNil(r["items"])
        XCTAssertEqual(r["backlog"], .array([]))
    }

    func testElParcheSoloLlevaLoQueCambia() throws {
        let doc = try DocumentoBitacora(datos: Data(docInicial.utf8))
        let (_, sinCambios) = AplicarOperaciones.sobre(doc, [.marcarTarea(id: "nada", hecha: true, momentoMs: momento)])
        XCTAssertTrue(sinCambios.isEmpty)
        let (nuevo, parche) = AplicarOperaciones.sobre(doc, [.crearTarea(id: "p1", dia: "2026-11-06", titulo: "a", hora: nil)])
        XCTAssertEqual(Array(parche.keys), ["dayPlanner"])
        for k in ["entries", "claveDelFuturo", "apuntes"] { XCTAssertEqual(nuevo.bytes(de: k), doc.bytes(de: k)) }
    }

    func testEditarMoverYBorrarSonIdempotentes() {
        let nube = v(#"{"days":{"2026-11-12":[{"id":"p1","title":"a","time":"09:00","done":false,"arrastrado":true}]},"backlog":[]}"#)
        let ops: [OperacionBitacora] = [.editarTarea(id: "p1", titulo: "b", hora: "10:00", notas: "n"), .moverTarea(id: "p1", dia: nil),
                                        .moverTarea(id: "p1", dia: "2026-11-13"), .borrarTarea(id: "p1")]
        var actual: JSONValue? = nube
        for op in ops {
            let una = AplicarOperaciones.aplicar(op, a: actual)
            XCTAssertEqual(AplicarOperaciones.aplicar(op, a: una), una, "\(op)")
            actual = una
            switch op {
            case .editarTarea: XCTAssertEqual(una["days"]?["2026-11-12"]?.lista?.first?["notes"], .string("n"))
            case .moverTarea(_, nil):
                XCTAssertEqual(una["backlog"]?.lista?.first?["title"], .string("b"))
                XCTAssertNil(una["backlog"]?.lista?.first?["time"])
            case .moverTarea:
                XCTAssertEqual(una["days"]?["2026-11-13"]?.lista?.first?["time"], .string(""))
                XCTAssertNil(una["days"]?["2026-11-13"]?.lista?.first?["arrastrado"])
            default: XCTAssertEqual(una["days"]?["2026-11-13"]?.lista?.count, 0)
            }
        }
    }

    func testMarcarRecurrenteYSuEntrada() throws {
        let doc = try DocumentoBitacora(datos: Data(#"{"recurringTasks": [{"id": "r1", "texto": "regar", "activo": true, "frecuencia": "diaria", "completadas": {}}], "entries": [{"id": "e1"}]}"#.utf8))
        let op = OperacionBitacora.marcarRecurrente(id: "r1", dia: "2026-11-12", hecha: true, momentoMs: momento)
        let (hecho, parche) = AplicarOperaciones.sobre(doc, [op])
        XCTAssertEqual(Set(parche.keys), ["recurringTasks", "entries"])
        XCTAssertEqual(AplicarOperaciones.sobre(hecho, [op]).1.count, 0)
        XCTAssertEqual(try hecho.valor(de: "entries")?.lista?.last?["title"], .string("Completado: regar"))
        let (deshecho, _) = AplicarOperaciones.sobre(hecho, [.marcarRecurrente(id: "r1", dia: "2026-11-12", hecha: false, momentoMs: momento)])
        XCTAssertEqual(try deshecho.valor(de: "entries")?.lista?.count, 1)
        XCTAssertEqual(try deshecho.valor(de: "recurringTasks")?.lista?.first?["completadas"]?["2026-11-12"], .bool(false))
    }

    func testRecurrentesQueTocan() {
        let jueves = LocalDay(iso: "2026-11-12")!
        func t(_ s: String) -> [String: JSONValue] { try! LectorJSON.valor(Data(s.utf8)).objeto! }
        XCTAssertTrue(LecturaPlanificador.tocaHoy(t(#"{"activo":true,"frecuencia":"semanal","diasSemana":[4]}"#), jueves))
        XCTAssertFalse(LecturaPlanificador.tocaHoy(t(#"{"activo":true,"frecuencia":"semanal","diaSemana":1}"#), jueves))
        XCTAssertTrue(LecturaPlanificador.tocaHoy(t(#"{"activo":true,"frecuencia":"mensual","diaMes":12}"#), jueves))
        XCTAssertTrue(LecturaPlanificador.tocaHoy(t(#"{"activo":true,"frecuencia":"intervalo","intervaloInicio":"2026-11-02","intervaloDias":5}"#), jueves))
        XCTAssertFalse(LecturaPlanificador.tocaHoy(t(#"{"activo":false,"frecuencia":"diaria"}"#), jueves))
    }

    func testEventosConservanSusCamposYSeLeenEnElMes() throws {
        let doc = try DocumentoBitacora(datos: Data(#"{"entries": [{"id": "e1", "type": "event", "title": "cine", "date": "2026-11-12", "time": "20:00", "entradas": [{"qr": "x"}]}, {"id": "c1", "type": "birthday", "title": "ana", "birthDate": "1990-11-20"}, {"id": "recurring_done_r_2026-11-12", "type": "event", "date": "2026-11-12", "calendarLog": true}, {"id": "d1", "type": "document", "date": "2026-11-12"}]}"#.utf8))
        let editar = OperacionBitacora.guardarEvento(id: "e1", fecha: "2026-11-13", hora: "21:00", titulo: "cine.", lugar: "centro", notas: "")
        let crear = OperacionBitacora.guardarEvento(id: "e2", fecha: "2026-11-12", hora: nil, titulo: "cena", lugar: "", notas: "")
        let (r, _) = AplicarOperaciones.sobre(doc, [editar, crear, crear])
        let lista = try XCTUnwrap(try r.valor(de: "entries")?.lista)
        XCTAssertEqual(lista.count, 5)
        XCTAssertEqual(lista[0]["entradas"]?.lista?.count, 1)
        XCTAssertEqual(lista[0]["date"], .string("2026-11-13"))
        let mes = LecturaCalendario.mes(r, YearMonth(year: 2026, month: 11)!)
        XCTAssertEqual(mes.porDia[LocalDay(iso: "2026-11-12")!]?.map(\.id), ["e2"])
        XCTAssertEqual(mes.porDia[LocalDay(iso: "2026-11-20")!]?.first?.titulo, "cumpleaños de ana (36 años)")
        let (borrado, parche) = AplicarOperaciones.sobre(r, [.borrarEntrada(id: "e2"), .borrarEntrada(id: "e2")])
        XCTAssertEqual(try borrado.valor(de: "entries")?.lista?.count, 4)
        XCTAssertEqual(Array(parche.keys), ["entries"])
    }

    func testFinanzasCuadranYElMovimientoNoSeDuplica() throws {
        let doc = try DocumentoBitacora(datos: Data(#"{"financeProfile": {"invested": 1000.10, "emergency": "500,05", "vacation": 100, "customAccounts": [{"id": "x", "balance": 0.1}]}, "financePro": {"accounts": {"bancos": {"name": "Bancos", "balance0": 100.10}, "efectivo": {"balance0": 0.2}}, "categories": [{"id": "c1", "name": "Inversiones"}], "transactions": [{"id": "a", "type": "expense", "amount": 0.1, "account": "bancos", "date": "2026-11-01"}, {"id": "b", "type": "income", "amount": "20,00", "account": "efectivo", "date": "2026-11-02"}, {"id": "c", "type": "transfer", "amount": 50, "account": "bancos", "transferTo": "efectivo", "date": "2026-11-03"}, {"id": "d", "type": "expense", "amount": 30, "account": "bancos", "category": "c1", "date": "2026-11-04"}, {"id": "e", "type": "expense", "amount": 999, "account": "bancos", "date": "2026-12-01"}, {"id": "f", "type": "income", "amount": 5, "account": "bancos", "pendiente": true, "date": "2026-11-05"}]}}"#.utf8))
        let hoy = LocalDay(iso: "2026-11-08")!
        let v = LecturaFinanzas.vista(doc, hoy: hoy)
        XCTAssertEqual(v.saldoLiquido, Decimal(string: "90.2"))
        XCTAssertEqual(v.patrimonioOperativo, Decimal(string: "1590.35"))
        XCTAssertEqual(v.activosTotales, Decimal(string: "1690.45"))
        XCTAssertEqual(v.ingresosMes, Decimal(string: "20"))
        XCTAssertEqual(v.gastosMes, Decimal(string: "0.1"))
        let op = OperacionBitacora.crearMovimiento(id: "ptx_q_1", tipo: "expense", importe: "12,5", cuenta: "bancos", categoria: nil, fecha: "2026-11-08", hora: "10:00", concepto: "pan")
        let (r, _) = AplicarOperaciones.sobre(doc, [op, op])
        let w = LecturaFinanzas.vista(r, hoy: hoy)
        XCTAssertEqual(w.saldoLiquido, Decimal(string: "77.7"))
        XCTAssertEqual(try r.valor(de: "financePro")?["transactions"]?.lista?.last?["amount"], .number("12.5"))
        XCTAssertEqual(r.bytes(de: "financeProfile"), doc.bytes(de: "financeProfile"))
    }

    func testRutinasYNotas() throws {
        let doc = try DocumentoBitacora(datos: Data(#"{"habits": [{"id": "h1", "texto": "leer", "activo": true, "pasos": ["a", "b"], "completadas": {"2026-11-09": true}}, {"id": "h2", "texto": "nadar", "activo": true, "frecuencia": {"tipo": "dias", "dias": [1]}}], "notes": []}"#.utf8))
        let hoy = LocalDay(iso: "2026-11-12")!
        let op = OperacionBitacora.marcarRutina(id: "h1", dia: hoy.iso, hecha: true)
        let nota = OperacionBitacora.crearNota(id: "note_1", dia: hoy.iso, texto: "hola", creada: "2026-11-12T10:00:00Z")
        let (r, parche) = AplicarOperaciones.sobre(doc, [op, op, nota, nota])
        XCTAssertEqual(Set(parche.keys), ["habits", "notes"])
        let v = LecturaMas.vista(r, hoy: hoy)
        XCTAssertEqual(v.rutinas.map(\.id), ["h1"])
        XCTAssertEqual(v.rutinas.first?.semana, 2)
        XCTAssertEqual(v.notas.map(\.texto), ["hola"])
        XCTAssertEqual(try r.valor(de: "habits")?.lista?.first?["pasosHechos"]?[hoy.iso]?.lista?.count, 2)
        let (d, _) = AplicarOperaciones.sobre(r, [.marcarRutina(id: "h1", dia: hoy.iso, hecha: false)])
        XCTAssertNil(try d.valor(de: "habits")?.lista?.first?["completadas"]?[hoy.iso])
    }

    func testMarcarUnaTareaVinculadaActualizaSusApartados() throws {
        let doc = try DocumentoBitacora(datos: Data(#"{"dayPlanner": {"days": {"2026-11-12": [{"id": "p1", "title": "entregar", "time": "", "linkedAssignmentId": "w1"}, {"id": "p2", "title": "paso", "proyectoId": "pr", "proyectoTareaId": "t1"}]}, "backlog": []}, "studies": {"subjects": [{"id": "s", "assignments": [{"id": "w1", "done": false}]}]}, "entries": [{"id": "pr", "type": "project", "tareas": [{"id": "t1", "texto": "paso", "estado": "pendiente"}]}]}"#.utf8))
        let (r, _) = AplicarOperaciones.sobre(doc, [.marcarTarea(id: "p1", hecha: true, momentoMs: momento), .marcarTarea(id: "p2", hecha: true, momentoMs: momento)])
        XCTAssertEqual(try r.valor(de: "studies")?["subjects"]?.lista?.first?["assignments"]?.lista?.first?["done"], .bool(true))
        let entradas = try XCTUnwrap(try r.valor(de: "entries")?.lista)
        XCTAssertEqual(entradas.first?["tareas"]?.lista?.first?["estado"], .string("hecha"))
        XCTAssertEqual(entradas.first?["tasks"]?.lista?.first?["done"], .bool(true))
        XCTAssertEqual(Set(entradas.compactMap { $0["id"]?.texto }), ["pr", "planner_done_p1", "planner_done_p2"])
        let (d, _) = AplicarOperaciones.sobre(r, [.marcarTarea(id: "p1", hecha: false, momentoMs: momento)])
        XCTAssertEqual(try d.valor(de: "entries")?.lista?.count, 2)
    }

    func testEstudiosMarcarYCrearSonIdempotentes() throws {
        let doc = try DocumentoBitacora(datos: Data(#"{"dayPlanner": {"days": {"2026-11-20": [{"id": "planner_assign_w1", "title": "trabajo pendiente. a", "time": "10:00", "done": false, "linkedAssignmentId": "w1"}]}, "backlog": []}, "studies": {"subjects": [{"id": "s", "name": "Mates", "notas": "x", "assignments": [{"id": "w1", "title": "a", "date": "2026-11-20", "done": false, "grade": "7"}, {"id": "w2", "title": "b", "date": "2026-11-21", "done": false}]}]}, "entries": [{"id": "e", "type": "event"}]}"#.utf8))
        let ops: [OperacionBitacora] = [.marcarTrabajo(asignaturaId: "s", id: "w1", hecho: true, momentoMs: momento),
                                        .marcarTrabajo(asignaturaId: "otra", id: "w2", hecho: true, momentoMs: momento),
                                        .crearEntrega(asignaturaId: "s", lista: "assignments", id: "w3", titulo: "c", fecha: "2026-11-22", hora: nil),
                                        .crearEntrega(asignaturaId: "s", lista: "exams", id: "x1", titulo: "parcial", fecha: "2026-11-23", hora: "09:00")]
        let (r, _) = AplicarOperaciones.sobre(doc, ops)
        let s = try XCTUnwrap(try r.valor(de: "studies")?["subjects"]?.lista?.first)
        XCTAssertEqual(s["notas"], .string("x"))
        XCTAssertEqual(s["assignments"]?.lista?.map { $0["done"] }, [.bool(true), .bool(true), .bool(false)])
        XCTAssertEqual(s["assignments"]?.lista?.first?["grade"], .string("7"))
        XCTAssertEqual(s["exams"]?.lista?.first?["time"], .string("09:00"))
        let dias = try XCTUnwrap(try r.valor(de: "dayPlanner")?["days"]?.objeto)
        XCTAssertEqual(dias["2026-11-20"]?.lista?.first?["done"], .bool(true))
        XCTAssertEqual(dias["2026-11-20"]?.lista?.first?["time"], .string("10:00"))
        XCTAssertEqual(dias["2026-11-21"]?.lista?.first?["id"], .string("planner_assign_w2"))
        XCTAssertEqual(dias["2026-11-22"]?.lista?.first?["time"], .string("23:59"))
        XCTAssertNil(dias["2026-11-23"])
        XCTAssertEqual(try r.valor(de: "entries")?.lista?.compactMap { $0["id"]?.texto }, ["e", "evt_w3", "evt_x1"])
        // Reaplicar (respuesta perdida o conflicto) no cambia nada.
        let (r2, parche) = AplicarOperaciones.sobre(r, ops)
        XCTAssertTrue(parche.isEmpty)
        XCTAssertEqual(try r2.valor(de: "entries"), try r.valor(de: "entries"))
        // Lo que ya no existe no se resucita.
        let (_, nada) = AplicarOperaciones.sobre(doc, [.marcarTrabajo(asignaturaId: "s", id: "borrado", hecho: true, momentoMs: momento),
                                                       .crearEntrega(asignaturaId: "no", lista: "exams", id: "x9", titulo: "", fecha: nil, hora: nil)])
        XCTAssertTrue(nada.isEmpty)
    }

    func testProyectosEstadoYAHoy() throws {
        let doc = try DocumentoBitacora(datos: Data(#"{"dayPlanner": {"days": {}, "backlog": []}, "entries": [{"id": "pr", "type": "project", "title": "Casa", "siguienteId": "t1", "fases": [{"id": "f"}], "tareas": [{"id": "t1", "texto": "pintar", "estado": "pendiente", "faseId": "f"}, {"id": "t2", "texto": "luz", "estado": "pendiente"}], "tasks": [{"text": "pintar", "done": false}, {"text": "luz", "done": false}, {"text": "del conector", "done": false}]}, {"id": "solo", "type": "project", "title": "Viejo", "tasks": [{"text": "uno", "done": true}, {"text": "dos", "done": false}]}]}"#.utf8))
        let ops: [OperacionBitacora] = [.estadoTareaProyecto(proyectoId: "pr", tareaId: "t1", estado: "hecha"),
                                        .proyectoAHoy(proyectoId: "pr", tareaId: "t2", idTarea: "planner_a", dia: "2026-11-12"),
                                        .proyectoAHoy(proyectoId: "pr", tareaId: "t2", idTarea: "planner_b", dia: "2026-11-12"),
                                        .estadoTareaProyecto(proyectoId: "solo", tareaId: "pt_c1", estado: "curso")]
        let (r, _) = AplicarOperaciones.sobre(doc, ops)
        let ent = try XCTUnwrap(try r.valor(de: "entries")?.lista)
        let p = try XCTUnwrap(ent.first)
        XCTAssertNil(p["siguienteId"])
        XCTAssertEqual(p["fases"]?.lista?.count, 1)
        XCTAssertEqual(p["tareas"]?.lista?.map { $0["estado"] }, [.string("hecha"), .string("curso"), .string("pendiente")])
        XCTAssertEqual(p["tareas"]?.lista?.first?["faseId"], .string("f"))
        XCTAssertEqual(p["tasks"]?.lista?.map { $0["text"] }, [.string("pintar"), .string("luz"), .string("del conector")])
        XCTAssertEqual(ent.last?["tareas"]?.lista?.map { $0["estado"] }, [.string("hecha"), .string("curso")])
        let hoy = try XCTUnwrap(try r.valor(de: "dayPlanner")?["days"]?["2026-11-12"]?.lista)
        XCTAssertEqual(hoy.count, 1)
        XCTAssertEqual(hoy.first?["title"], .string("Casa: luz"))
        XCTAssertEqual(hoy.first?["proyectoTareaId"], .string("t2"))
        let (_, parche) = AplicarOperaciones.sobre(r, ops)
        XCTAssertTrue(parche.isEmpty)
    }

    func testLasEntregasSalenEnElCalendarioSinRepetirse() throws {
        let doc = try DocumentoBitacora(datos: Data(#"{"studies": {"subjects": [{"id": "s", "name": "Mates", "exams": [{"id": "x1", "title": "parcial", "date": "2026-11-23"}, {"id": "x2", "title": "final", "date": "2026-11-24"}]}]}, "entries": [{"id": "evt_x1", "type": "event", "title": "Examen: parcial (Mates)", "date": "2026-11-23", "linkedItemId": "x1"}]}"#.utf8))
        let v = LecturaCalendario.mes(doc, YearMonth(year: 2026, month: 11)!)
        XCTAssertEqual(v.porDia[LocalDay(iso: "2026-11-23")!]?.map(\.editable), [false])
        XCTAssertEqual(v.porDia[LocalDay(iso: "2026-11-24")!]?.map(\.titulo), ["Examen: final (Mates)"])
    }

    func testLosParchesSoloTocanSusCampos() throws {
        let doc = try DocumentoBitacora(datos: Data(#"{"dayPlanner": {"days": {"2026-11-12": [{"id": "p1", "title": "a", "notes": "de la web", "time": "09:00"}]}, "backlog": []}, "entries": [{"id": "e1", "type": "event", "title": "cine", "notes": "web", "date": "2026-11-12"}]}"#.utf8))
        let (r, _) = AplicarOperaciones.sobre(doc, [.parcharTarea(id: "p1", campos: ["title": "b"]), .parcharEvento(id: "e1", campos: ["time": "20:00"])])
        let t = try r.valor(de: "dayPlanner")?["days"]?["2026-11-12"]?.lista?.first
        XCTAssertEqual(t?["title"], .string("b"))
        XCTAssertEqual(t?["notes"], .string("de la web"))
        XCTAssertEqual(t?["time"], .string("09:00"))
        let e = try r.valor(de: "entries")?.lista?.first
        XCTAssertEqual(e?["notes"], .string("web"))
        XCTAssertEqual(e?["time"], .string("20:00"))
    }

    func testMovimientoSinCategoriaQuedaPorRevisar() throws {
        let doc = try DocumentoBitacora(datos: Data(#"{"financePro": {"accounts": {}, "transactions": [{"id": "a", "date": "2026-11-08", "type": "expense", "amount": 1, "account": "bancos", "hora": "09:00"}, {"id": "b", "date": "2026-11-08", "type": "expense", "amount": 1, "account": "bancos", "hora": "18:00"}]}}"#.utf8))
        let (r, _) = AplicarOperaciones.sobre(doc, [.crearMovimiento(id: "c", tipo: "expense", importe: "2", cuenta: "bancos", categoria: nil, fecha: "2026-11-08", hora: "12:00", concepto: "")])
        XCTAssertEqual(try r.valor(de: "financePro")?["transactions"]?.lista?.last?["needsReview"], .bool(true))
        XCTAssertEqual(LecturaFinanzas.vista(r, hoy: LocalDay(iso: "2026-11-08")!).movimientos.map(\.id), ["b", "c", "a"])
    }

    func testLecturaConHuellasYValorDeLaCartera() throws {
        let fila = try XCTUnwrap(RemotoSupabase.extraerConHuellas(Data(#"{"data": {"financeProfile": {"invested": 0}, "investmentData": {"funds": [{"valuations": [{"date": "2026-01-01", "value": 100}, {"date": "2026-10-01", "value": 150.5}]}, {"contributions": [{"amount": 20}, {"amount": "5,25"}]}]}}, "updated_at": "x", "huellas": {"financeProfile": "abc"}}"#.utf8)))
        XCTAssertEqual(fila.huellas, ["financeProfile": "abc"])
        XCTAssertNil(try RemotoSupabase.extraerConHuellas(Data("null".utf8)))
        let v = LecturaFinanzas.vista(try DocumentoBitacora(datos: fila.datos), hoy: LocalDay(iso: "2026-11-08")!)
        XCTAssertEqual(v.patrimonioOperativo, Decimal(string: "175.75"))
    }

    func testIdsConElFormatoDeLaWeb() {
        let id = OperacionBitacora.nuevoIdTarea()
        XCTAssertTrue(id.hasPrefix("planner_"))
        XCTAssertEqual(id.split(separator: "_").count, 3)
    }

    func testRecuentoSinConstruirValores() {
        XCTAssertEqual(LectorJSON.contarElementos(Data(#"[1, {"a": [2, 3]}, "x,y"]"#.utf8)), 3)
        XCTAssertEqual(LectorJSON.contarElementos(Data(#"{"a": 1, "b": {"c": "}"}}"#.utf8)), 2)
        XCTAssertEqual(LectorJSON.contarElementos(Data("[]".utf8)), 0)
        XCTAssertNil(LectorJSON.contarElementos(Data("3".utf8)))
    }
}
