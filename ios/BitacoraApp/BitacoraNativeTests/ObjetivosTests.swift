import XCTest
@testable import BitacoraNative

// Objetivos nativos contra saveEntry (type goal) y la op `objetivo` del conector: hitos por texto, progreso numérico,
// y lo que la app no conoce (método Harada, etiquetas) se queda.
final class ObjetivosTests: XCTestCase {
    func testObjetivoHitosYProgreso() throws {
        let doc = try DocumentoBitacora(datos: Data(#"""
        {"entries": [{"id": "g1", "type": "goal", "title": "Leer", "term": "medium", "status": "En progreso", "goalType": "numeric",
                      "currentValue": 3, "targetValue": 12, "unit": "libros", "milestones": [{"text": "Primer trimestre", "done": false}],
                      "harada": {"pilares": [1]}, "tags": ["2026"]},
                     {"id": "e1", "type": "event", "title": "cine"}]}
        """#.utf8))
        let ops: [OperacionBitacora] = [
            .cambiarObjetivo(objetivoId: "g1", cambio: .hito(texto: "Verano")),
            .cambiarObjetivo(objetivoId: "g1", cambio: .hito(texto: "verano")),
            .cambiarObjetivo(objetivoId: "g1", cambio: .hitoHecho(texto: "primer trimestre", hecho: true)),
            .cambiarObjetivo(objetivoId: "g1", cambio: .progreso(actual: "6")),
            .cambiarObjetivo(objetivoId: "e1", cambio: .hito(texto: "no")),
            .guardarObjetivo(id: "g2", titulo: "Correr", plazo: "long", numerico: false, actual: "", meta: "", unidad: "", estado: "Pendiente", notas: ""),
        ]
        let (r, _) = AplicarOperaciones.sobre(doc, ops)
        let (dos, _) = AplicarOperaciones.sobre(r, ops)
        let lista = LecturaObjetivos.objetivos(dos)
        let g1 = try XCTUnwrap(lista.first { $0.id == "g1" })
        XCTAssertEqual(g1.hitos, [HitoObjetivo(texto: "Primer trimestre", hecho: true), HitoObjetivo(texto: "Verano", hecho: false)])
        XCTAssertEqual(g1.actual, 6)
        XCTAssertEqual(g1.porcentaje, 50)
        let g2 = try XCTUnwrap(lista.first { $0.id == "g2" })
        XCTAssertEqual(g2.plazo, "long")
        XCTAssertFalse(g2.numerico)
        XCTAssertNil(g2.porcentaje)
        let crudo = try XCTUnwrap(dos.valor(de: "entries")?.lista)
        XCTAssertNotNil(crudo.first { $0["id"]?.comoId == "g1" }?["harada"])
        XCTAssertNil(crudo.first { $0["id"]?.comoId == "e1" }?["milestones"])
        XCTAssertEqual(crudo.first { $0["id"]?.comoId == "g2" }?["categoryId"], .string("cat_general"))

        let (editado, _) = AplicarOperaciones.sobre(dos, [.guardarObjetivo(id: "g1", titulo: "Leer más", plazo: "short", numerico: true, actual: "7", meta: "20",
                                                                            unidad: "libros", estado: "Completado", notas: ""),
                                                          .cambiarObjetivo(objetivoId: "g1", cambio: .quitarHito(texto: "Verano"))])
        let g = try XCTUnwrap(LecturaObjetivos.objetivos(editado).first { $0.id == "g1" })
        XCTAssertEqual(g.titulo, "Leer más")
        XCTAssertEqual(g.porcentaje, 35)
        XCTAssertEqual(g.hitos.map(\.texto), ["Primer trimestre"])
        XCTAssertEqual(g.estado, "Completado")
    }

    // 0.24: mandala, paso kaizen y tablero como js/bajo-demanda/metodo.js; lo demás del objetivo se queda.
    func testMandalaKaizenYTablero() throws {
        let doc = try DocumentoBitacora(datos: Data(#"""
        {"entries": [{"id": "g1", "type": "goal", "title": "Correr", "status": "Pendiente", "proposito": {"yo": "salud"}},
                     {"id": "e1", "type": "event", "title": "cine"}],
         "habits": [{"id": "h0", "texto": "otra", "completadas": {}}]}
        """#.utf8))
        let hoy = LocalDay(iso: "2026-11-17")!
        let ops: [OperacionBitacora] = [
            MetodoOp.opPilar(objetivo: "g1", indice: 2, texto: " Constancia ", acciones: ["salir", "", "estirar"]),
            MetodoOp.opPilar(objetivo: "g1", indice: 9, texto: "no", acciones: []),
            MetodoOp.opKaizen(objetivo: "g1", habito: "habit_1", texto: "ponerme las zapatillas"),
            MetodoOp.opEstado(objetivo: "g1", estado: "En progreso"),
            MetodoOp.opEstado(objetivo: "g1", estado: "raro"),
            MetodoOp.opKaizen(objetivo: "e1", habito: "habit_9", texto: "no"),
            .marcarRutina(id: "habit_1", dia: "2026-11-16", hecha: true),
            .marcarRutina(id: "habit_1", dia: "2026-11-17", hecha: true),
        ]
        let (r, _) = AplicarOperaciones.sobre(doc, ops)
        let (dos, _) = AplicarOperaciones.sobre(r, ops)
        let g = try XCTUnwrap(LecturaObjetivos.objetivos(dos).first { $0.id == "g1" })
        XCTAssertEqual(g.estado, "En progreso")
        XCTAssertEqual(g.pilares.count, 8)
        XCTAssertEqual(g.pilares[2].texto, "Constancia")
        XCTAssertEqual(g.pilares[2].acciones.count, 8)
        XCTAssertEqual(g.pilares[2].hechas, 2)
        XCTAssertEqual(g.pilares[0].texto, "")
        XCTAssertEqual(g.kaizen?.texto, "ponerme las zapatillas")
        XCTAssertEqual(g.kaizen?.racha(hoy: hoy), 2)
        XCTAssertEqual(try dos.valor(de: "habits")?.lista?.count, 2)
        let crudo = try XCTUnwrap(dos.valor(de: "entries")?.lista)
        XCTAssertNotNil(crudo.first { $0["id"]?.comoId == "g1" }?["proposito"])
        XCTAssertNil(crudo.first { $0["id"]?.comoId == "e1" }?["kaizenHabitId"])

        let (sin, _) = AplicarOperaciones.sobre(dos, [MetodoOp.opQuitarKaizen(objetivo: "g1")])
        XCTAssertNil(LecturaObjetivos.objetivos(sin).first { $0.id == "g1" }?.kaizen)
        let h = try XCTUnwrap(sin.valor(de: "habits")?.lista?.first { $0["id"]?.comoId == "habit_1" })
        XCTAssertEqual(h["activo"], .bool(false))
        XCTAssertEqual(h["completadas"]?.objeto?.count, 2)
    }
}
