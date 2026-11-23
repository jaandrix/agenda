import XCTest
@testable import BitacoraNative

final class NotasTests: XCTestCase {
    func testLecturaNotasTituloExtractoYOrden() throws {
        let largo = String(repeating: "palabra ", count: 12)
        let json = #"{"notes": [{"id": "a", "date": "2026-11-20", "content": "compra\nleche y pan", "createdAt": "2026-11-20T09:05:00.000Z"}, {"id": "b", "date": "2026-11-22", "title": "Ideas", "content": "una\ndos", "tags": ["trabajo"]}, {"id": "c", "date": "2026-11-21", "content": "\#(largo)"}, {"id": "d", "content": ""}]}"#
        let doc = try DocumentoBitacora(datos: Data(json.utf8))
        let n = LecturaNotas.fichas(doc)
        XCTAssertEqual(n.map(\.id), ["b", "c", "a"])
        XCTAssertEqual(n[0].titulo, "Ideas")
        XCTAssertEqual(n[0].extracto, "una dos")
        XCTAssertEqual(n[0].dato, "#trabajo")
        XCTAssertEqual(n[2].titulo, "compra")
        XCTAssertEqual(n[2].extracto, "leche y pan")
        XCTAssertEqual(n[2].hora, "10:05")
        XCTAssertEqual(n[2].fecha, "20.11.2026")
        XCTAssertTrue(n[1].titulo.hasSuffix("…"))
        XCTAssertTrue(n[1].titulo.count <= 61)
        XCTAssertTrue(n[0].clave.contains(LecturaNotas.normalizar("IDEAS")))
        XCTAssertEqual(LecturaNotas.normalizar("Canción"), "cancion")
        XCTAssertEqual(LecturaNotas.nombreMes("2026-11"), "noviembre 2026")
    }
}
