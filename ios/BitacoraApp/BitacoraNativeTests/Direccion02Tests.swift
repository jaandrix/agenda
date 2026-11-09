import XCTest
@testable import BitacoraNative

// 0.13: contratos de la dirección 02 (menú, ranking, puntualidad, poste de Inicio y apartados).
final class Direccion02Tests: XCTestCase {
    func doc(_ s: String) throws -> DocumentoBitacora { try DocumentoBitacora(datos: Data(s.utf8)) }

    func idem(_ d: DocumentoBitacora, _ ops: [OperacionBitacora], file: StaticString = #filePath, line: UInt = #line) -> DocumentoBitacora {
        let (r, _) = AplicarOperaciones.sobre(d, ops)
        XCTAssertTrue(AplicarOperaciones.sobre(r, ops).1.isEmpty, "reaplicar cambió algo", file: file, line: line)
        return r
    }

    func testSegundoToqueDeMenuVuelveALaRaiz() {
        XCTAssertEqual(Navegacion.tocar(.mas, actual: .mas, ruta: ["studies", "x"]), .init(pestana: .mas, ruta: [], subir: false))
        XCTAssertEqual(Navegacion.tocar(.mas, actual: .mas, ruta: []), .init(pestana: .mas, ruta: [], subir: true))
        // Desde otra pestaña se abre el menú tal como estaba.
        XCTAssertEqual(Navegacion.tocar(.mas, actual: .plan, ruta: ["transporte"]), .init(pestana: .mas, ruta: ["transporte"], subir: false))
    }

    func testRankingDeApartados() {
        let ahora = Date(timeIntervalSince1970: 1_800_000_000)
        var u = UsoApartados()
        for _ in 0..<4 { u.anotar("notes", ahora: ahora.addingTimeInterval(-10 * 86400)) }
        u.anotar("compra", ahora: ahora.addingTimeInterval(-3600))
        u.anotar("compra", ahora: ahora.addingTimeInterval(-7200))
        u.anotar("viejo", ahora: ahora.addingTimeInterval(-40 * 86400))
        let menu = ["habits", "notes", "compra", "events", "studies", "viejo", "culture"]
        let r = u.ranking(candidatos: menu, excluir: ["events"], ahora: ahora)
        XCTAssertEqual(r, ["compra", "notes", "habits", "studies", "viejo"])
        XCTAssertEqual(u.puntos("viejo", ahora: ahora), 0)
    }

    func testCompletarGuardaFechaPrevistaYArrastre() throws {
        // 2026-11-10 12:00 en Madrid: la tarea del día 8 se arrastra al marcarla y conserva su día previsto.
        let momento: Int64 = 1_794_308_400_000
        let d = try doc(#"{"dayPlanner": {"days": {"2026-11-08": [{"id": "t1", "title": "a", "done": false}], "2026-11-10": [{"id": "t2", "title": "b", "done": false}, {"id": "t3", "title": "c", "done": false, "arrastrado": true}]}, "backlog": []}, "entries": []}"#)
        let r = idem(d, [.marcarTarea(id: "t1", hecha: true, momentoMs: momento), .marcarTarea(id: "t2", hecha: true, momentoMs: momento),
                         .marcarTarea(id: "t3", hecha: true, momentoMs: momento)])
        let e = Dictionary(uniqueKeysWithValues: (try r.valor(de: "entries")?.lista ?? []).map { ($0["taskId"]?.texto ?? "", $0) })
        XCTAssertEqual(e["t1"]?["plannedDate"], .string("2026-11-08"))
        XCTAssertEqual(e["t1"]?["automaticCarry"], .bool(true))
        XCTAssertEqual(e["t1"]?["completedDate"], .string("2026-11-10"))
        XCTAssertEqual(e["t2"]?["plannedDate"], .string("2026-11-10"))
        XCTAssertEqual(e["t2"]?["source"], .string("ios"))
        XCTAssertEqual(e["t3"]?["plannedDate"], .null)
        XCTAssertEqual(try r.valor(de: "dayPlanner")?["days"]?["2026-11-10"]?.lista?.first { $0["id"]?.texto == "t1" }?["fechaPrevista"], .string("2026-11-08"))
        // Desmarcar quita el registro.
        let r2 = idem(r, [.marcarTarea(id: "t1", hecha: false, momentoMs: momento)])
        XCTAssertFalse((try r2.valor(de: "entries")?.lista ?? []).contains { $0["taskId"]?.texto == "t1" })
        // Moverla a mano cambia la fecha prevista.
        let r3 = idem(r2, [.moverTarea(id: "t1", dia: "2026-11-12")])
        XCTAssertNil(try r3.valor(de: "dayPlanner")?["days"]?["2026-11-12"]?.lista?.first?["fechaPrevista"])
    }

    func testPuntualidadSinInventarHistorico() throws {
        let d = try doc(#"{"entries": [{"id": "planner_done_viejo", "date": "2026-09-01"}, {"id": "planner_done_a", "completionSchema": 1, "plannedDate": "2026-11-03", "completedDate": "2026-11-03"}, {"id": "planner_done_b", "completionSchema": 1, "plannedDate": "2026-11-02", "completedDate": "2026-11-04"}, {"id": "planner_done_c", "completionSchema": 1, "plannedDate": null, "completedDate": "2026-11-01"}]}"#)
        let p = Puntualidad.desde(d, hasta: LocalDay(year: 2026, month: 11, day: 9)!)
        XCTAssertEqual(p.desde, "2026-11-01")
        XCTAssertEqual(p.meses.count, 12)
        XCTAssertEqual(p.meses.last, Puntualidad.Mes(mes: "2026-11", puntuales: 1, total: 2))
        XCTAssertNil(p.meses.first { $0.mes == "2026-09" }?.porcentaje)
    }

    func testPosteDeInicio() throws {
        let d = try doc(#"{"servicios": {"x": 1, "transporte": {"favoritos": ["bus:1", "tranvia:9", "bus:2", "bus:3"]}}}"#)
        XCTAssertEqual(LecturaTransporte.posteInicio(try d.valor(de: "servicios")?["transporte"]), "bus:1")
        let r = idem(d, [.transporteElegirInicio(clave: "bus:2")])
        XCTAssertEqual(LecturaTransporte.posteInicio(try r.valor(de: "servicios")?["transporte"]), "bus:2")
        XCTAssertEqual(try r.valor(de: "servicios")?["x"], .number("1"))
        // Una que no es favorita no se elige.
        XCTAssertTrue(AplicarOperaciones.sobre(r, [.transporteElegirInicio(clave: "bus:99")]).1.isEmpty)
        // Quitar la favorita elegida pasa a la siguiente y se guarda.
        let r2 = idem(r, [.transporteFavorita(clave: "bus:2", activa: false)])
        XCTAssertEqual(try r2.valor(de: "servicios")?["transporte"]?["posteInicio"], .string("bus:3"))
        let r3 = idem(r2, [.transporteFavorita(clave: "bus:3", activa: false)])
        XCTAssertEqual(try r3.valor(de: "servicios")?["transporte"]?["posteInicio"], .string("bus:1"))
    }

    func testApartadosVisibles() throws {
        let d = try doc(#"{"apartadosConfig": {"perfil": "ambos", "panorama": ["hoy"], "opcionales": {"links": true}}}"#)
        let r = idem(d, [.ponerApartado(vista: "links", visible: false), .ponerApartado(vista: "culture", visible: false), .ponerPerfil(perfil: "estudiante")])
        XCTAssertFalse(Apartados.visible("links", r))
        XCTAssertFalse(Apartados.visible("culture", r))
        XCTAssertFalse(Apartados.visible("work", r))
        XCTAssertEqual(try r.valor(de: "apartadosConfig")?["panorama"], try d.valor(de: "apartadosConfig")?["panorama"])
        // Ajustes y el planificador no se ocultan; un perfil desconocido no se guarda.
        XCTAssertTrue(AplicarOperaciones.sobre(r, [.ponerApartado(vista: "settings", visible: false), .ponerPerfil(perfil: "x")]).1.isEmpty)
    }
}
