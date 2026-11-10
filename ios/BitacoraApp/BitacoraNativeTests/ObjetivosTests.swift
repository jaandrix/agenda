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
}
