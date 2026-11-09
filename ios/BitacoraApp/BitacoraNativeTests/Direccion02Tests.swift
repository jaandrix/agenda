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

    func testSemanaLunesDomingo() {
        // 2026-11-09 es lunes.
        let lun = LocalDay(year: 2026, month: 11, day: 9)!
        XCTAssertEqual(lun.indiceSemanaLunes, 0)
        let s = lun.semanaLunesDomingo
        XCTAssertEqual(s.count, 7)
        XCTAssertEqual(s.first, lun)
        XCTAssertEqual(s.last, LocalDay(year: 2026, month: 11, day: 15))
        XCTAssertEqual(s.map(\.indiceSemanaLunes), [0, 1, 2, 3, 4, 5, 6])
        // Un miércoles devuelve la misma semana lunes-domingo.
        XCTAssertEqual(LocalDay(year: 2026, month: 11, day: 11)!.semanaLunesDomingo, s)
        // Domingo cierra la semana.
        XCTAssertEqual(LocalDay(year: 2026, month: 11, day: 15)!.semanaLunesDomingo, s)
        // Cruza de mes y de año.
        let fin = LocalDay(year: 2025, month: 12, day: 31)!
        XCTAssertEqual(fin.indiceSemanaLunes, 2)
        XCTAssertEqual(fin.inicioSemanaLunes, LocalDay(year: 2025, month: 12, day: 29))
        XCTAssertEqual(fin.semanaLunesDomingo.last, LocalDay(year: 2026, month: 1, day: 4))
    }

    func testAvanceSemanaExacta() {
        let d = LocalDay(year: 2026, month: 11, day: 11)! // miércoles
        XCTAssertEqual(d.sumando(dias: 7), LocalDay(year: 2026, month: 11, day: 18))
        XCTAssertEqual(d.sumando(dias: -7), LocalDay(year: 2026, month: 11, day: 4))
        XCTAssertEqual(d.sumando(dias: 7).indiceSemanaLunes, d.indiceSemanaLunes)
        XCTAssertEqual(d.sumando(dias: -7).inicioSemanaLunes, LocalDay(year: 2026, month: 11, day: 2))
        // Siete avances seguidos cruzan de mes sin perder el día de la semana.
        var x = d
        for _ in 0..<7 { x = x.sumando(dias: 7) }
        XCTAssertEqual(x, LocalDay(year: 2026, month: 12, day: 30))
        XCTAssertEqual(x.indiceSemanaLunes, d.indiceSemanaLunes)
    }

    func testVistaInicioUsaSemanaLunesDomingo() throws {
        // 2026-11-11 12:00 en Madrid (miércoles); la semana visible debe ser lun 9 - dom 15.
        let ahora = ISO8601DateFormatter().date(from: "2026-11-11T12:00:00+01:00")!
        let v = VistaInicio.desde(try doc(#"{"dayPlanner": {"days": {}, "backlog": []}, "entries": []}"#), ahora: ahora)
        XCTAssertEqual(v.semana.count, 7)
        XCTAssertEqual(v.semana.first, LocalDay(year: 2026, month: 11, day: 9))
        XCTAssertEqual(v.semana.last, LocalDay(year: 2026, month: 11, day: 15))
        XCTAssertTrue(v.semana.contains(v.dia))
        // Elegir un día de otra semana muestra esa semana, lunes a domingo.
        let v2 = VistaInicio.desde(try doc(#"{"dayPlanner": {"days": {}, "backlog": []}, "entries": []}"#), ahora: ahora,
                                   elegido: LocalDay(year: 2026, month: 12, day: 2))
        XCTAssertEqual(v2.semana, LocalDay(year: 2026, month: 12, day: 2)!.semanaLunesDomingo)
        XCTAssertEqual(v2.semana.first?.indiceSemanaLunes, 0)
        XCTAssertEqual(v2.semana.last?.indiceSemanaLunes, 6)
    }

    func testGeometriaBarra() {
        // Los cuatro iconos laterales comparten geometría, centrados en la altura útil, con áreas táctiles >= 44 pt.
        XCTAssertEqual(BarraBitacora.altoHuecoLateral, 62)
        XCTAssertEqual(BarraBitacora.tamanoIconoLateral, 32)
        XCTAssertEqual(BarraBitacora.diametroCentral, 56)
        XCTAssertEqual(BarraBitacora.altoBotonCentral, 64)
        XCTAssertEqual(BarraBitacora.duracionLongPress, 0.5, accuracy: 0.001)
        XCTAssertGreaterThanOrEqual(BarraBitacora.altoHuecoLateral, BarraBitacora.altoTactilMinimo)
        XCTAssertGreaterThanOrEqual(BarraBitacora.altoBotonCentral, BarraBitacora.altoTactilMinimo)
        XCTAssertGreaterThanOrEqual(BarraBitacora.diametroCentral, 55)
        XCTAssertGreaterThanOrEqual(BarraBitacora.diametroCentral, 42 * 1.3)
        XCTAssertGreaterThanOrEqual(BarraBitacora.tamanoIconoLateral, 24)
        // El icono queda dentro del hueco, con sitio para etiqueta y punto; el grupo usa un alto fijo y centrado.
        XCTAssertLessThan(BarraBitacora.tamanoIconoLateral, BarraBitacora.altoHuecoLateral)
    }
}
