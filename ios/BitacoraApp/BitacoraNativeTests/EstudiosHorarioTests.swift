import XCTest
@testable import BitacoraNative

// 3.2, Estudios: el horario se edita desde la app (HorarioOp) y un trabajo que cambia de fecha no deja copias de su
// tarea en el plan.
final class EstudiosHorarioTests: XCTestCase {
    private func doc(_ s: String) throws -> DocumentoBitacora { try DocumentoBitacora(datos: Data(s.utf8)) }

    private func idempotente(_ d: DocumentoBitacora, _ ops: [OperacionBitacora], file: StaticString = #filePath, line: UInt = #line) -> DocumentoBitacora {
        let (r, _) = AplicarOperaciones.sobre(d, ops)
        let (_, otra) = AplicarOperaciones.sobre(r, ops)
        XCTAssertTrue(otra.isEmpty, "reaplicar cambió \(otra.keys)", file: file, line: line)
        return r
    }

    private let base = #"{"raro": 1, "studies": {"subjects": [], "otro": true, "schedule": {"lun": [{"time": "15:00", "subject": "Inglés", "aula": "3"}, {"time": "16:50", "subject": "Logística"}], "mar": []}}}"#

    func testAnadirClaseConFinEnSuSitio() throws {
        let d = try doc(base)
        let op = HorarioOp.opGuardar(antes: nil, dia: "lun", hora: "15:55", fin: "16:50", asignatura: " Comercialización ")
        let (_, parche) = AplicarOperaciones.sobre(d, [op])
        XCTAssertEqual(Set(parche.keys), ["studies"])
        let r = idempotente(d, [op])
        let h = LecturaHorario.vista(r)
        XCTAssertEqual(h["lun"]?.map(\.asignatura), ["Inglés", "Comercialización", "Logística"])
        XCTAssertEqual(h["lun"]?[1].fin, "16:50")
        XCTAssertEqual(try r.valor(de: "studies")?["otro"], .bool(true))
        XCTAssertEqual(try r.valor(de: "raro"), .number("1"))
    }

    func testMoverClaseConservaLoDesconocido() throws {
        let d = try doc(base)
        let antes = try XCTUnwrap(LecturaHorario.vista(d)["lun"]?.first)
        let r = idempotente(d, [HorarioOp.opGuardar(antes: antes, dia: "mar", hora: "09:00", fin: "", asignatura: "Inglés")])
        let st = try XCTUnwrap(try r.valor(de: "studies")?["schedule"])
        XCTAssertEqual(st["lun"]?.lista?.map { $0["subject"] }, [.string("Logística")])
        let movida = try XCTUnwrap(st["mar"]?.lista?.first)
        XCTAssertEqual(movida["time"], .string("09:00"))
        XCTAssertEqual(movida["aula"], .string("3"))
        XCTAssertNil(movida["endTime"])
    }

    func testFinAntesQueInicioNoSeGuarda() throws {
        let d = try doc(base)
        let (_, parche) = AplicarOperaciones.sobre(d, [HorarioOp.opGuardar(antes: nil, dia: "mie", hora: "10:00", fin: "09:00", asignatura: "x")])
        XCTAssertTrue(parche.isEmpty)
    }

    func testQuitarClase() throws {
        let d = try doc(base)
        let c = try XCTUnwrap(LecturaHorario.vista(d)["lun"]?.last)
        let r = idempotente(d, [HorarioOp.opQuitar(c)])
        XCTAssertEqual(LecturaHorario.vista(r)["lun"]?.map(\.asignatura), ["Inglés"])
    }

    // Inglés a las 17:45 (25-11): una copia vieja de la tarea del trabajo seguía arrastrándose. Al editar el trabajo
    // quedan cero copias de más.
    func testEditarTrabajoQuitaLasCopiasDeSuTarea() throws {
        let tarea = #"{"id": "planner_assign_w1", "title": "trabajo pendiente. a", "time": "17:45", "done": false, "linkedAssignmentId": "w1"}"#
        let d = try doc(#"{"dayPlanner": {"days": {"2026-11-25": [\#(tarea)], "2026-11-27": [\#(tarea)]}, "backlog": []}, "studies": {"subjects": [{"id": "s", "name": "Inglés", "assignments": [{"id": "w1", "title": "a", "date": "2026-11-27", "time": "17:45", "done": false}]}]}}"#)
        let r = idempotente(d, [.editarItemEstudio(asignaturaId: "s", lista: "assignments", id: "w1", titulo: "a", fecha: "2026-11-27", hora: "17:45", nota: "", peso: "")])
        let dias = try XCTUnwrap(try r.valor(de: "dayPlanner")?["days"]?.objeto)
        let copias = dias.flatMap { k, v in (v.lista ?? []).filter { $0["id"]?.texto == "planner_assign_w1" }.map { _ in k } }
        XCTAssertEqual(copias, ["2026-11-27"])
    }
}
