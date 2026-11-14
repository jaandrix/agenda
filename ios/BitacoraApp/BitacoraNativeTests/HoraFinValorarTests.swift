import XCTest
@testable import BitacoraNative

// 0.21: hora de fin en `endTime` y «valorar …» como aviso a su hora.
final class HoraFinValorarTests: XCTestCase {
    private func doc(_ json: String) throws -> DocumentoBitacora { try DocumentoBitacora(datos: Data(json.utf8)) }
    private func madrid(_ s: String) -> Date {
        let f = DateFormatter()
        f.timeZone = CalendarioBitacora.madrid.zona
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.date(from: s)!
    }

    func testEndTimeMandaYCruzaLaMedianoche() throws {
        let e: [String: JSONValue] = ["type": .string("event"), "date": .string("2026-11-14"), "time": .string("21:30"),
                                      "endTime": .string("00:45"), "notes": .string("hasta las 23:00")]
        XCTAssertEqual(ValorarOcio.horaFin(e), "00:45")
        // 00:45 del día siguiente + 3 h.
        XCTAssertEqual(ValorarOcio.momento(e, clase: "concierto"), madrid("2026-11-15 03:45"))
        var sinFin = e
        sinFin.removeValue(forKey: "endTime")
        XCTAssertEqual(ValorarOcio.horaFin(sinFin), "23:00")
        sinFin["notes"] = .string("")
        XCTAssertNil(ValorarOcio.horaFin(sinFin))
        XCTAssertEqual(ValorarOcio.momento(sinFin, clase: "concierto"), madrid("2026-11-15 03:00"))
    }

    func testParcharEventoPoneYQuitaLaHoraDeFin() throws {
        let d = try doc(#"{"entries":[{"id":"e1","type":"event","title":"Dune","date":"2026-11-14","time":"20:00","ajeno":true}]}"#)
        let (r, _) = AplicarOperaciones.sobre(d, [.parcharEvento(id: "e1", campos: ["endTime": "22:40"])])
        let e = try XCTUnwrap(((try r.valor(de: "entries")) ?? nil)?.lista?.first)
        XCTAssertEqual(e["endTime"], .string("22:40"))
        XCTAssertEqual(e["ajeno"], .bool(true))
        let (r2, _) = AplicarOperaciones.sobre(r, [.parcharEvento(id: "e1", campos: ["endTime": ""])])
        XCTAssertNil(((try r2.valor(de: "entries")) ?? nil)?.lista?.first?["endTime"])
        XCTAssertEqual(LecturaCalendario.evento(try XCTUnwrap(e.objeto), id: "e1", tipo: "event", anio: 2026).fin, "22:40")
    }

    func testAvisoDeValorarSoloParaLoQueAunNoHaLlegado() throws {
        let d = try doc(#"{"entries":[{"id":"e1","type":"event","eventType":"cine","title":"Cine: Dune","date":"2026-11-14","time":"20:00","endTime":"22:40"},{"id":"e2","type":"event","eventType":"cine","title":"Ya valorada","date":"2026-11-14","time":"18:00","valorarTareaId":"x"}]}"#)
        let antes = madrid("2026-11-14 12:00")
        let avisos = Recordatorios.valorar(d, ahora: antes)
        XCTAssertEqual(avisos.map(\.id), ["valorar-e1"])
        XCTAssertEqual(avisos.first?.cuando, madrid("2026-11-15 01:40"))
        XCTAssertEqual(avisos.first?.titulo, "valorar la película.")
        XCTAssertTrue(Recordatorios.valorar(d, ahora: madrid("2026-11-15 02:00")).isEmpty)
        XCTAssertEqual(ValorarOcio.pendientes(d, ahora: madrid("2026-11-15 02:00")).map(\.eventoId), ["e1"])
    }
}
