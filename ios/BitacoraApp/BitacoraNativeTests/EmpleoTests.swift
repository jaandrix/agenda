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
}
