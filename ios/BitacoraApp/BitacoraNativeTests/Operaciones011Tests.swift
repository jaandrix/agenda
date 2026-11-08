import XCTest
@testable import BitacoraNative

// Auditoría de la 0.11.0: cada operación nueva con su resultado, su parche mínimo, la conservación de lo desconocido
// y que reaplicarla no cambia nada.
final class Operaciones011Tests: XCTestCase {
    func doc(_ s: String) throws -> DocumentoBitacora { try DocumentoBitacora(datos: Data(s.utf8)) }

    func comprobarIdempotente(_ d: DocumentoBitacora, _ ops: [OperacionBitacora], file: StaticString = #filePath, line: UInt = #line) -> DocumentoBitacora {
        let (r, _) = AplicarOperaciones.sobre(d, ops)
        let (_, otra) = AplicarOperaciones.sobre(r, ops)
        XCTAssertTrue(otra.isEmpty, "reaplicar cambió \(otra.keys)", file: file, line: line)
        return r
    }

    func testEditarTrabajoMueveSuTareaDelPlan() throws {
        let d = try doc(#"{"raro": {"x": 1}, "dayPlanner": {"days": {"2026-11-20": [{"id": "planner_assign_w1", "title": "trabajo pendiente. a", "time": "10:00", "done": false, "linkedAssignmentId": "w1"}, {"id": "otra", "title": "z"}]}, "backlog": []}, "studies": {"subjects": [{"id": "s", "name": "Mates", "assignments": [{"id": "w1", "title": "a", "date": "2026-11-20", "done": false, "extra": true}]}]}, "entries": [{"id": "evt_w1", "type": "event", "title": "Entrega: a (Mates)", "date": "2026-11-20", "linkedItemId": "w1"}]}"#)
        let op = OperacionBitacora.editarItemEstudio(asignaturaId: "s", lista: "assignments", id: "w1", titulo: "b", fecha: "2026-11-25", hora: nil, nota: "", peso: "")
        let (_, parche) = AplicarOperaciones.sobre(d, [op])
        XCTAssertEqual(Set(parche.keys), ["studies", "entries", "dayPlanner"])
        let r = comprobarIdempotente(d, [op])
        let dias = try XCTUnwrap(try r.valor(de: "dayPlanner")?["days"]?.objeto)
        XCTAssertEqual(dias["2026-11-20"]?.lista?.map { $0["id"] }, [.string("otra")])
        let t = try XCTUnwrap(dias["2026-11-25"]?.lista?.first)
        XCTAssertEqual(t["title"], .string("trabajo pendiente. b"))
        XCTAssertEqual(t["time"], .string("10:00"))
        XCTAssertEqual(t["notes"], .string("Asignatura: Mates"))
        XCTAssertEqual(try r.valor(de: "raro"), try d.valor(de: "raro"))
        XCTAssertEqual(try r.valor(de: "studies")?["subjects"]?.lista?.first?["assignments"]?.lista?.first?["extra"], .bool(true))
        // Hora nueva y luego sin fecha: la tarea cambia de hora y después desaparece.
        let r2 = comprobarIdempotente(r, [.editarItemEstudio(asignaturaId: "s", lista: "assignments", id: "w1", titulo: "b", fecha: "2026-11-25", hora: "08:30", nota: "", peso: "")])
        XCTAssertEqual(try r2.valor(de: "dayPlanner")?["days"]?["2026-11-25"]?.lista?.first?["time"], .string("08:30"))
        let r3 = comprobarIdempotente(r2, [.editarItemEstudio(asignaturaId: "s", lista: "assignments", id: "w1", titulo: "b", fecha: nil, hora: nil, nota: "", peso: "")])
        XCTAssertNil(AplicarOperaciones.buscar("planner_assign_w1", en: AplicarOperaciones.planificador(try r3.valor(de: "dayPlanner"))))
        XCTAssertFalse((try r3.valor(de: "entries")?.lista ?? []).contains { $0["id"]?.texto == "evt_w1" })
    }

    func testBorrarItemDeEstudioQuitaEventoYTarea() throws {
        let d = try doc(#"{"dayPlanner": {"days": {"2026-11-20": [{"id": "planner_assign_w1"}]}, "backlog": []}, "studies": {"subjects": [{"id": "s", "assignments": [{"id": "w1"}, {"id": "w2"}]}]}, "entries": [{"id": "evt_w1", "linkedItemId": "w1"}]}"#)
        let r = comprobarIdempotente(d, [.borrarItemEstudio(asignaturaId: "s", lista: "assignments", id: "w1")])
        XCTAssertEqual(try r.valor(de: "studies")?["subjects"]?.lista?.first?["assignments"]?.lista?.map { $0["id"] }, [.string("w2")])
        XCTAssertEqual(try r.valor(de: "entries")?.lista?.count, 0)
        XCTAssertEqual(try r.valor(de: "dayPlanner")?["days"]?["2026-11-20"]?.lista?.count, 0)
    }

    func testEditarMovimientoSinCategoriaVuelveARevisarYNoHayAutotraspaso() throws {
        let d = try doc(#"{"financePro": {"accounts": {}, "transactions": [{"id": "m", "type": "expense", "amount": 5, "account": "bancos", "date": "2026-11-08", "category": "comida", "claveImport": "k"}, {"id": "t", "type": "transfer", "amount": 10, "account": "bancos", "transferTo": "efectivo", "date": "2026-11-08"}]}}"#)
        let r = comprobarIdempotente(d, [.editarMovimiento(id: "m", importe: "7.5", concepto: "pan", categoria: nil, fecha: "2026-11-08", cuenta: "bancos", destino: nil)])
        let m = try XCTUnwrap(try r.valor(de: "financePro")?["transactions"]?.lista?.first)
        XCTAssertNil(m["category"])
        XCTAssertEqual(m["needsReview"], .bool(true))
        XCTAssertEqual(m["claveImport"], .string("k"))
        XCTAssertEqual(m["amount"], .number("7.5"))
        let r2 = comprobarIdempotente(r, [.editarMovimiento(id: "m", importe: "7.5", concepto: "pan", categoria: "comida", fecha: "2026-11-08", cuenta: "bancos", destino: nil)])
        XCTAssertNil(try r2.valor(de: "financePro")?["transactions"]?.lista?.first?["needsReview"])
        let (_, nada) = AplicarOperaciones.sobre(d, [.editarMovimiento(id: "t", importe: "10", concepto: "", categoria: nil, fecha: "2026-11-08", cuenta: "bancos", destino: "bancos")])
        XCTAssertTrue(nada.isEmpty)
        let (_, nada2) = AplicarOperaciones.sobre(d, [.crearTraspaso(id: "x", importe: "3", desde: "bancos", hacia: "bancos", fecha: "2026-11-08", hora: "10:00", concepto: "")])
        XCTAssertTrue(nada2.isEmpty)
    }

    func testBorrarYTraspasarSonIdempotentes() throws {
        let d = try doc(#"{"financePro": {"otro": 1, "accounts": {}, "transactions": [{"id": "m", "type": "expense", "amount": 5}]}}"#)
        let r = comprobarIdempotente(d, [.borrarMovimiento(id: "m"),
                                         .crearTraspaso(id: "x", importe: "3,5", desde: "bancos", hacia: "efectivo", fecha: "2026-11-08", hora: "10:00", concepto: "")])
        let pro = try XCTUnwrap(try r.valor(de: "financePro"))
        XCTAssertEqual(pro["otro"], .number("1"))
        XCTAssertEqual(pro["transactions"]?.lista?.map { $0["id"] }, [.string("x")])
        XCTAssertEqual(pro["transactions"]?.lista?.first?["transferTo"], .string("efectivo"))
    }

    func testProyectoCrearYCambiar() throws {
        let d = try doc(#"{"entries": [{"id": "viejo", "type": "project", "categoryId": "cat_p", "title": "v"}]}"#)
        let ops: [OperacionBitacora] = [.crearProyecto(id: "pr", titulo: "Casa", fecha: "2026-11-08"),
                                        .cambiarProyecto(proyectoId: "pr", cambio: .anadirFase(id: "f", nombre: "obra", fecha: "2026-12-01")),
                                        .cambiarProyecto(proyectoId: "pr", cambio: .anadirTarea(id: "t", texto: "pintar", faseId: "f")),
                                        .cambiarProyecto(proyectoId: "pr", cambio: .siguiente(id: "t")),
                                        .cambiarProyecto(proyectoId: "pr", cambio: .colina("0.4")),
                                        .cambiarProyecto(proyectoId: "pr", cambio: .apuntar(id: "a", fecha: "2026-11-08", texto: "empezamos")),
                                        .cambiarProyecto(proyectoId: "pr", cambio: .faseHecha(id: "f", hecha: true))]
        let r = comprobarIdempotente(d, ops)
        let p = try XCTUnwrap(try r.valor(de: "entries")?.lista?.last)
        XCTAssertEqual(p["categoryId"], .string("cat_p"))
        XCTAssertEqual(p["status"], .string("En progreso"))
        XCTAssertEqual(p["siguienteId"], .string("t"))
        XCTAssertEqual(p["tasks"]?.lista?.first?["text"], .string("pintar"))
        XCTAssertEqual(p["fases"]?.lista?.first?["hecha"], .bool(true))
        let r2 = comprobarIdempotente(r, [.cambiarProyecto(proyectoId: "pr", cambio: .borrarTarea(id: "t")),
                                          .cambiarProyecto(proyectoId: "pr", cambio: .quitarApunte(id: "a"))])
        let p2 = try XCTUnwrap(try r2.valor(de: "entries")?.lista?.last)
        XCTAssertNil(p2["siguienteId"])
        XCTAssertEqual(p2["diario"]?.lista?.count, 0)
    }

    func testCiudadYTransporte() throws {
        let d = try doc(#"{"servicios": {"festivos": {"x": 1}}}"#)
        let r = comprobarIdempotente(d, [.ponerCiudadTiempo(nombre: "Zaragoza", lat: "41.65", lon: "-0.88"),
                                         .transporteFavorita(clave: "bus:688", activa: true),
                                         .transporteLinea(clave: "bus:688", linea: "35", activa: true)])
        let tr = try XCTUnwrap(try r.valor(de: "servicios")?["transporte"])
        XCTAssertEqual(tr["favoritos"]?.lista, [.string("bus:688")])
        XCTAssertEqual(tr["lineas"]?["bus:688"]?.lista, [.string("35")])
        XCTAssertEqual(try r.valor(de: "servicios")?["festivos"]?["x"], .number("1"))
        XCTAssertEqual(try r.valor(de: "ciudadTiempo")?["lat"], .number("41.65"))
        let r2 = comprobarIdempotente(r, [.transporteLinea(clave: "bus:688", linea: "35", activa: false), .transporteFavorita(clave: "bus:688", activa: false)])
        XCTAssertEqual(try r2.valor(de: "servicios")?["transporte"]?["favoritos"]?.lista, [])
        let (_, nada) = AplicarOperaciones.sobre(d, [.ponerCiudadTiempo(nombre: "x", lat: "nan?", lon: "1")])
        XCTAssertTrue(nada.isEmpty)
    }

    func testCalendarioDelMenuAbreElCalendario() throws {
        XCTAssertEqual(Apartados.secciones.first?.1.first, Apartado(vista: "calendar", nombre: "calendario"))
        XCTAssertEqual(MasView.pestanas["calendar"], .calendario)
        let soloRepaso = try doc(#"{"apartadosConfig": {"opcionales": {"studies": false, "estudiar": true}}}"#)
        XCTAssertEqual(Apartados.destinoEstudios(soloRepaso), "estudiar")
        XCTAssertEqual(Apartados.destinoEstudios(try doc("{}")), "studies")
    }
}
