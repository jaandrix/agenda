import XCTest
@testable import BitacoraNative

// Profesorado nativo contra js/bajo-demanda/profesorado.js y profesorado-aula.js: marcar una sesión (con el valor
// explícito, así reaplicar no la vuelve a cambiar), la nota del día y las entregas; lo que el iPhone no conoce se queda.
final class ProfesoradoTests: XCTestCase {
    private let base = #"""
    {"profesorado": {"curso": {"fin": "2026-12-04"}, "festivos": ["2026-12-08"], "nombresFestivos": {"2026-12-08": "Inmaculada"},
                     "ocultarPendientes": false, "plantillas": [{"id": "pl1"}],
                     "clases": [{"id": "c1", "nombre": "1º ESO A", "materia": "Lengua", "color": "#3f7be0", "dias": [1, 3],
                                 "alumnos": [{"id": "a1", "nombre": "Ana"}, {"id": "a2", "nombre": "Bruno"}],
                                 "evaluaciones": [{"id": "ev1", "peso": 40}], "calificaciones": {"ev1": {"a1": 7}},
                                 "deberes": [{"id": "d1", "titulo": "Resumen", "puesto": "2026-11-23", "entrega": "2026-11-25", "entregados": {"a2": true}}],
                                 "horario": [{"dia": 1, "inicio": "08:30", "fin": "09:25", "aula": "12"}]},
                                {"id": "c2", "nombre": "2º ESO B"}],
                     "sesiones": [{"id": "s1", "claseId": "c1", "fecha": "2026-11-18", "titulo": "Tema 1", "hecha": false, "orden": 0},
                                  {"id": "s2", "claseId": "c1", "fecha": "2026-11-23", "titulo": "Tema 2", "hecha": false, "orden": 0, "descartada": true, "extra": 1},
                                  {"id": "s3", "claseId": "c1", "fecha": "2026-11-23", "titulo": "Excursión", "hecha": null, "orden": 1},
                                  {"id": "s4", "claseId": "c1", "fecha": "2026-11-25", "titulo": "Tema 3", "hecha": true, "orden": 0}],
                     "notasDia": {"c1|2026-11-18": "faltó Ana"}},
     "entries": []}
    """#

    func testLecturaYAvance() throws {
        let v = LecturaProfesorado.vista(try DocumentoBitacora(datos: Data(base.utf8)))
        XCTAssertEqual(v.clases.map(\.id), ["c1", "c2"])
        XCTAssertEqual(v.clases[1].color, "#3f7be0", "sin color, el de PROFE_COLORES por su posición")
        let c1 = try XCTUnwrap(v.clase("c1"))
        XCTAssertEqual(c1.dias, [1, 3])
        XCTAssertEqual(c1.deberes.first?.entregados, ["a2"])
        XCTAssertTrue(v.esLectivo(c1, "2026-11-23"))          // lunes
        XCTAssertFalse(v.esLectivo(c1, "2026-11-24"))         // martes
        XCTAssertFalse(v.esLectivo(v.clases[1], "2026-12-08")) // festivo en martes
        XCTAssertTrue(v.esLectivo(v.clases[1], "2026-11-24")) // sin días: de lunes a viernes
        XCTAssertNil(v.sesiones.first { $0.id == "s3" }?.hecha)
        XCTAssertEqual(v.sesiones("c1", "2026-11-23").map(\.id), ["s2", "s3"])
        XCTAssertEqual(v.pendientes(hoy: "2026-11-24").map(\.id), ["s1"])
        XCTAssertEqual(v.franjas(c1, "2026-11-23").first?.inicio, "08:30")
        XCTAssertEqual(v.nota("c1", "2026-11-18"), "faltó Ana")
        let av = v.avance(c1, hoy: "2026-11-24")
        XCTAssertEqual(av.total, 2)        // s1 y s4: s2 descartada, s3 sin casilla
        XCTAssertEqual(av.dadas, 1)
        XCTAssertEqual(av.atrasadas, 1)
        XCTAssertEqual(av.pct, 50)
        XCTAssertEqual(av.clases, 3)       // 25-11, 30-11 y 02-12
        XCTAssertEqual(av.estado, "1 tarea por detrás.")
        XCTAssertEqual(LecturaProfesorado.diaSemana("2026-11-22"), 0)
    }

    func testOperacionesIdempotentesYSinPerderClaves() throws {
        let doc = try DocumentoBitacora(datos: Data(base.utf8))
        let ops: [OperacionBitacora] = [
            ProfeOp.opHecha(sesion: "s1", hecha: true),
            ProfeOp.opHecha(sesion: "s2", hecha: true),
            ProfeOp.opHecha(sesion: "no", hecha: true),
            ProfeOp.opNota(clase: "c1", fecha: "2026-11-23", texto: "  repasar el tema 2  "),
            ProfeOp.opNota(clase: "c1", fecha: "2026-11-18", texto: " "),
            ProfeOp.opNota(clase: "zz", fecha: "2026-11-23", texto: "no"),
            ProfeOp.opEntregado(clase: "c1", deber: "d1", alumno: "a1", marcado: true),
            ProfeOp.opEntregado(clase: "c1", deber: "d1", alumno: "a2", marcado: false),
        ]
        let (uno, _) = AplicarOperaciones.sobre(doc, ops)
        let (dos, _) = AplicarOperaciones.sobre(uno, ops)
        let p = try XCTUnwrap(dos.valor(de: "profesorado")?.objeto)
        let ses = try XCTUnwrap(p["sesiones"]?.lista)
        XCTAssertEqual(ses.first { $0["id"]?.texto == "s1" }?["hecha"], .bool(true))
        let s2 = try XCTUnwrap(ses.first { $0["id"]?.texto == "s2" }?.objeto)
        XCTAssertEqual(s2["hecha"], .bool(true))
        XCTAssertNil(s2["descartada"], "profeHecha quita el descarte")
        XCTAssertEqual(s2["extra"], .number("1"))
        XCTAssertEqual(ses.count, 4)
        XCTAssertEqual(p["notasDia"]?.objeto, ["c1|2026-11-23": .string("repasar el tema 2")])
        let c1 = try XCTUnwrap(p["clases"]?.lista?.first?.objeto)
        XCTAssertEqual(c1["deberes"]?.lista?.first?["entregados"]?.objeto, ["a1": .bool(true)])
        XCTAssertNotNil(c1["calificaciones"])
        XCTAssertNotNil(c1["evaluaciones"])
        XCTAssertNotNil(p["plantillas"])
        XCTAssertEqual(p["ocultarPendientes"], .bool(false))

        let (tres, _) = AplicarOperaciones.sobre(dos, [ProfeOp.opHecha(sesion: "s1", hecha: false)])
        let v = LecturaProfesorado.vista(tres)
        XCTAssertEqual(v.sesiones.first { $0.id == "s1" }?.hecha, false)
    }

    func testSinProfesoradoNoCreaNada() throws {
        let doc = try DocumentoBitacora(datos: Data(#"{"entries": []}"#.utf8))
        let (r, _) = AplicarOperaciones.sobre(doc, [ProfeOp.opNota(clase: "c1", fecha: "2026-11-23", texto: "hola")])
        XCTAssertNil(try r.valor(de: "profesorado"))
        XCTAssertTrue(LecturaProfesorado.vista(r).clases.isEmpty)
    }

    func testFechaDeSugerencia() {
        XCTAssertEqual(ServidorSugerencias.fecha("2026-11-24T10:00:00.123456+00:00"), "24 de noviembre de 2026")
        XCTAssertEqual(ServidorSugerencias.fecha(""), "")
    }
}
