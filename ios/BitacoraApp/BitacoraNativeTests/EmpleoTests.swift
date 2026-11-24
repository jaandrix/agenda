import XCTest
@testable import BitacoraNative

// La agenda laboral nativa contra js/agenda-laboral.js: citas lab_, horario por día de la semana y enPrincipal.
final class EmpleoTests: XCTestCase {
    func testSinAgendaSeCreaComoEnLaWeb() throws {
        let doc = try DocumentoBitacora(datos: Data(#"{"entries": [{"id": "w1", "type": "work", "company": "Acme", "position": "QA"}]}"#.utf8))
        let v0 = LecturaEmpleo.vista(doc, hoy: "2026-11-10")
        XCTAssertTrue(v0.enPrincipal)
        XCTAssertEqual(v0.empleo, "Acme, QA")
        let (r, _) = AplicarOperaciones.sobre(doc, [.guardarCitaLaboral(id: "lab_1", fecha: "2026-11-12", ini: "09:00", fin: "10:00", titulo: "Reunión", tipo: "reunion", lugar: "Teams", notas: "")])
        let a = try XCTUnwrap(r.valor(de: "agendaLaboral"))
        XCTAssertEqual(a["enPrincipal"], .bool(true))
        XCTAssertEqual(a["horario"], .object([:]))
        XCTAssertEqual(a["citas"]?.lista?.count, 1)
    }

    func testCitasHorarioYPrincipalConservanLoDemas() throws {
        let doc = try DocumentoBitacora(datos: Data(#"""
        {"agendaLaboral": {"enPrincipal": true, "horario": {"1": {"ini": "08:00", "fin": "15:00"}}, "raro": 1,
          "citas": [{"id": "lab_a", "fecha": "2026-11-01", "ini": "", "fin": "", "titulo": "vieja", "tipo": "otro", "lugar": "", "notas": "", "extra": "x"}]}}
        """#.utf8))
        let ops: [OperacionBitacora] = [
            .guardarCitaLaboral(id: "lab_a", fecha: "2026-11-20", ini: "07:00", fin: "15:00", titulo: "", tipo: "turno", lugar: "", notas: ""),
            .guardarCitaLaboral(id: "lab_b", fecha: "2026-11-15", ini: "", fin: "", titulo: "Entrega", tipo: "plazo", lugar: "", notas: ""),
            .guardarCitaLaboral(id: "lab_c", fecha: "2026-11-15", ini: "", fin: "", titulo: "", tipo: "reunion", lugar: "", notas: ""),
            .guardarCitaLaboral(id: "lab_d", fecha: "no", ini: "", fin: "", titulo: "x", tipo: "otro", lugar: "", notas: ""),
            .horarioLaboral(dias: ["1": "09:00|17:00", "5": "09:00|14:00", "9": "09:00|10:00", "3": "|"]),
            .laboralEnPrincipal(false),
        ]
        let (r, _) = AplicarOperaciones.sobre(doc, ops)
        let (dos, _) = AplicarOperaciones.sobre(r, ops)
        let v = LecturaEmpleo.vista(dos, hoy: "2026-11-10")
        XCTAssertFalse(v.enPrincipal)
        XCTAssertEqual(v.citas.map(\.id), ["lab_b", "lab_a"])
        XCTAssertEqual(v.citas.last?.tipo, "turno")
        XCTAssertEqual(Set(v.horario.keys), [1, 5])
        XCTAssertEqual(v.horario[5]?.1, "14:00")
        let a = try XCTUnwrap(dos.valor(de: "agendaLaboral"))
        XCTAssertEqual(a["raro"], .number("1"))
        XCTAssertEqual(a["citas"]?.lista?.first { $0["id"]?.comoId == "lab_a" }?["extra"], .string("x"))

        let (sin, _) = AplicarOperaciones.sobre(dos, [.borrarCitaLaboral(id: "lab_a")])
        XCTAssertEqual(LecturaEmpleo.vista(sin, hoy: "2026-11-10").citas.map(\.id), ["lab_b"])
    }

    // 0.24: fichas de empleo como saveEntry (type: work) y los días de getCotizationDays.
    func testFichasDeEmpleoYVidaLaboral() throws {
        let doc = try DocumentoBitacora(datos: Data(#"{"entries": [{"id": "w1", "type": "work", "title": "Acme", "company": "Acme", "startDate": "2026-01-01", "endDate": "2026-01-31", "cotizedDays": 20, "documentos": [1]}, {"id": "e1", "type": "event", "title": "cine"}]}"#.utf8))
        let antes = LecturaFichasEmpleo.fichas(doc, hoy: "2026-11-10")
        XCTAssertEqual(antes.first?.dias(hoy: "2026-11-10"), 20)
        XCTAssertTrue(antes.first?.deVidaLaboral == true)
        let ops: [OperacionBitacora] = [
            FichaEmpleoOp.op(id: "w2", campos: ["company": "Bitácora", "position": "dev", "startDate": "2026-11-01", "modalidad": "remoto"], diasCotizados: "", sueldo: "1.500,50"),
            FichaEmpleoOp.op(id: "w1", campos: ["company": "Acme SA", "startDate": "2026-01-01", "endDate": "2026-01-31"], diasCotizados: "", sueldo: ""),
            FichaEmpleoOp.op(id: "e1", campos: ["company": "no"], diasCotizados: "", sueldo: ""),
            FichaEmpleoOp.op(id: "w3", campos: [:], diasCotizados: "", sueldo: ""),
        ]
        let (r, _) = AplicarOperaciones.sobre(doc, ops)
        let (dos, _) = AplicarOperaciones.sobre(r, ops)
        let f = LecturaFichasEmpleo.fichas(dos, hoy: "2026-11-10")
        XCTAssertEqual(f.map(\.id), ["w2", "w1"])
        XCTAssertEqual(f[0].dias(hoy: "2026-11-10"), 10)
        XCTAssertEqual(f[0].nombre, "Bitácora")
        XCTAssertEqual(f[1].dias(hoy: "2026-11-10"), 31)
        XCTAssertFalse(f[1].deVidaLaboral)
        let lista = try XCTUnwrap(dos.valor(de: "entries")?.lista)
        let w2 = try XCTUnwrap(lista.first { $0["id"]?.comoId == "w2" })
        XCTAssertEqual(w2["categoryId"], .string("cat_trabajo"))
        XCTAssertEqual(w2["title"], .string("Bitácora"))
        XCTAssertEqual(w2["salary"], .number("1500.5"))
        XCTAssertEqual(w2["status"], .string("Trabajo actual"))
        let w1 = try XCTUnwrap(lista.first { $0["id"]?.comoId == "w1" })
        XCTAssertEqual(w1["title"], .string("Acme SA"))
        XCTAssertEqual(w1["documentos"]?.lista?.count, 1)
        XCTAssertEqual(w1["cotizedDays"], .null)
        XCTAssertEqual(lista.first { $0["id"]?.comoId == "e1" }?["title"], .string("cine"))
        XCTAssertEqual(lista.count, 3)
    }

    // Empleo 2.0: el día de la semana con la clave de agendaLaboral.horario (0 = domingo) y los tramos de la línea de
    // tiempo, con los turnos de noche alargados más allá de medianoche.
    func testSemanaDeLaLineaDeTiempo() {
        XCTAssertEqual(TextoEmpleo.diaSemana("2026-11-22"), 0)
        XCTAssertEqual(TextoEmpleo.diaSemana("2026-11-23"), 1)
        XCTAssertEqual(TextoEmpleo.diaSemana("2026-11-28"), 6)
        XCTAssertNil(TextoEmpleo.diaSemana(""))
        XCTAssertEqual(LineaSemanaEmpleo.tramo(("09:00", "17:30")).map { [$0.0, $0.1] }, [540, 1050])
        XCTAssertEqual(LineaSemanaEmpleo.tramo(("22:00", "06:00")).map { [$0.0, $0.1] }, [1320, 1800])
        XCTAssertNil(LineaSemanaEmpleo.tramo(("", "17:00")))
        XCTAssertEqual(TextoEmpleo.cuando("2026-11-25", hoy: "2026-11-24"), "mañana")
        XCTAssertEqual(TextoEmpleo.dias(1), "1 día")
    }
}
