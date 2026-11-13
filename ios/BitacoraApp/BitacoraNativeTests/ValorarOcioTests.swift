import XCTest
@testable import BitacoraNative

final class ValorarOcioTests: XCTestCase {
    private func doc(_ json: String) throws -> DocumentoBitacora { try DocumentoBitacora(datos: Data(json.utf8)) }
    private func madrid(_ s: String) -> Date {
        let f = DateFormatter()
        f.timeZone = CalendarioBitacora.madrid.zona
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.date(from: s)!
    }

    func testCineCreaLaPeliculaYLaTareaTresHorasDespuesDelFinal() throws {
        let d = try doc(#"{"entries":[{"id":"e1","type":"event","eventType":"cine","title":"Cine: Dune","date":"2026-11-12","time":"20:00","raro":1}],"dayPlanner":{"days":{}}}"#)
        // 20:00 + 2 h de película + 3 h = 01:00 del día siguiente.
        XCTAssertTrue(ValorarOcio.pendientes(d, ahora: madrid("2026-11-13 00:30")).isEmpty)
        let p = ValorarOcio.pendientes(d, ahora: madrid("2026-11-13 09:00"))
        XCTAssertEqual(p, [.init(eventoId: "e1", clase: "movie", titulo: "Dune")])
        let op = ValorarOcio.operacion(p[0], ahora: madrid("2026-11-13 09:00"))
        let (r, cambios) = AplicarOperaciones.sobre(d, [op])
        XCTAssertEqual(Set(cambios.keys), ["entries", "dayPlanner"])
        let entradas = try XCTUnwrap(((try r.valor(de: "entries")) ?? nil)?.lista)
        let ev = try XCTUnwrap(entradas.first { $0["id"]?.texto == "e1" })
        XCTAssertEqual(ev["raro"], .number("1"))
        let peli = try XCTUnwrap(entradas.first { $0["type"]?.texto == "movie" })
        XCTAssertEqual(peli["title"]?.texto, "Dune")
        XCTAssertEqual(ev["peliculaId"]?.texto, peli["id"]?.texto)
        let tareas = try XCTUnwrap(((try r.valor(de: "dayPlanner")) ?? nil)?["days"]?["2026-11-13"]?.lista)
        XCTAssertEqual(tareas.first?["title"]?.texto, "valorar la película. Dune")
        XCTAssertEqual(tareas.first?["valorarPeliculaId"]?.texto, peli["id"]?.texto)
        // Ni se repite al reaplicar ni vuelve a estar pendiente.
        XCTAssertTrue(AplicarOperaciones.sobre(r, [op]).1.isEmpty)
        XCTAssertTrue(ValorarOcio.pendientes(r, ahora: madrid("2026-11-13 10:00")).isEmpty)
    }

    func testOcioExplicitoYHastaLas() throws {
        let d = try doc(#"{"entries":[{"id":"c1","type":"event","eventType":"otro","ocioTipo":"concierto","title":"Rosalía","date":"2026-11-12","time":"21:00","notes":"hasta las 23:30"},{"id":"x","type":"event","eventType":"otro","title":"cena","date":"2026-11-12","time":"21:00"}]}"#)
        XCTAssertTrue(ValorarOcio.pendientes(d, ahora: madrid("2026-11-13 02:00")).isEmpty)
        let p = ValorarOcio.pendientes(d, ahora: madrid("2026-11-13 02:31"))
        XCTAssertEqual(p.map(\.eventoId), ["c1"])
        let (r, _) = AplicarOperaciones.sobre(d, [ValorarOcio.operacion(p[0], ahora: madrid("2026-11-13 09:00"))])
        let tareas = ((try r.valor(de: "dayPlanner")) ?? nil)?["days"]?["2026-11-13"]?.lista ?? []
        XCTAssertEqual(tareas.first?["title"]?.texto, "valorar el concierto. Rosalía")
        XCTAssertEqual(tareas.first?["valorarEventoId"]?.texto, "c1")
    }

    func testLoAntiguoNoSaltaYLaWebYaLoHizo() throws {
        let d = try doc(#"{"entries":[{"id":"v","type":"event","eventType":"cine","title":"Vieja","date":"2026-11-01","time":"20:00"},{"id":"w","type":"event","eventType":"cine","title":"Hecha","date":"2026-11-12","time":"18:00","peliculaId":"p"}]}"#)
        XCTAssertTrue(ValorarOcio.pendientes(d, ahora: madrid("2026-11-13 09:00")).isEmpty)
    }

    func testSerieExistenteSeEnlazaYValorarCompletaLaTarea() throws {
        let d = try doc(#"{"entries":[{"id":"s1","type":"series","title":"The Bear","rating":0},{"id":"e","type":"event","ocioTipo":"series","title":"the bear","date":"2026-11-12","time":"18:00"}]}"#)
        let p = try XCTUnwrap(ValorarOcio.pendientes(d, ahora: madrid("2026-11-13 09:00")).first)
        let (r, _) = AplicarOperaciones.sobre(d, [ValorarOcio.operacion(p, ahora: madrid("2026-11-13 09:00"))])
        XCTAssertEqual((((try r.valor(de: "entries")) ?? nil)?.lista ?? []).filter { $0["type"]?.texto == "series" }.count, 1)
        let completar = OperacionesExtra.op(ValorarOcio.completar, ["entradaId": .string("s1")])
        let (r2, _) = AplicarOperaciones.sobre(r, [completar])
        let t = ((try r2.valor(de: "dayPlanner")) ?? nil)?["days"]?["2026-11-13"]?.lista?.first
        XCTAssertEqual(t?["valorarOcioId"]?.texto, "s1")
        XCTAssertEqual(t?["done"], .bool(true))
    }

    func testTituloLimpio() {
        XCTAssertEqual(ValorarOcio.tituloLimpio("Cine: Dune"), "Dune")
        XCTAssertEqual(ValorarOcio.tituloLimpio("concierto de Rosalía"), "Rosalía")
        XCTAssertEqual(ValorarOcio.tituloLimpio("teatro"), "teatro")
    }

    // Medias estrellas: `rating` entero para la web y el medio en `ratingMedia`; si la web cambia la nota, manda la web.
    func testMediasEstrellasCompatiblesConLaWeb() throws {
        let d = try doc(#"{"entries":[]}"#)
        let (r, _) = AplicarOperaciones.sobre(d, [.guardarOcio(id: "m", tipo: "movie", titulo: "Dune", autor: "", estado: "", fechaInicio: "2026-11-12",
                                                              fechaFin: "", anio: "2021", valoracion: "3.5", notas: "", enlace: "", portada: "")])
        let e = try XCTUnwrap(((try r.valor(de: "entries")) ?? nil)?.lista?.first)
        XCTAssertEqual(e["rating"], .number("3"))
        XCTAssertEqual(e["ratingMedia"], .number("3.5"))
        XCTAssertEqual(LecturaOcio.vista(r).entradas.first?.valoracion, 3.5)
        XCTAssertEqual(LecturaOcio.textoNota(3.5), "3,5 de 5.")
        let web = try doc(#"{"entries":[{"id":"m","type":"movie","title":"Dune","rating":4,"ratingMedia":3.5}]}"#)
        XCTAssertEqual(LecturaOcio.vista(web).entradas.first?.valoracion, 4)
        let (r2, _) = AplicarOperaciones.sobre(r, [.guardarOcio(id: "m", tipo: "movie", titulo: "Dune", autor: "", estado: "", fechaInicio: "2026-11-12",
                                                               fechaFin: "", anio: "2021", valoracion: "4.0", notas: "", enlace: "", portada: "")])
        let e2 = try XCTUnwrap(((try r2.valor(de: "entries")) ?? nil)?.lista?.first)
        XCTAssertEqual(e2["rating"], .number("4"))
        XCTAssertNil(e2["ratingMedia"])
    }
}
