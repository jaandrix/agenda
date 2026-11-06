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

    func mezclar(parche: [String: JSONValue], sesion: Sesion) async throws {
        parches.append(parche)
        datos = try DocumentoBitacora(datos: datos).aplicandoParche(parche).serializado()
        if perderRespuestaDeMezcla { perderRespuestaDeMezcla = false; throw ErrorRed.sinConexion }
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
