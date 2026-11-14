import XCTest
@testable import BitacoraNative

// 0.21: fichas de Documentos creadas y editadas en el iPhone.
final class DocumentosFichasTests: XCTestCase {
    func testFichaDeDocumentoCreaYEditaConservandoLoDemas() throws {
        let d = try DocumentoBitacora(datos: Data(#"{"entries":[{"id":"d1","type":"document","title":"DNI","date":"2027-01-01","url":"https://x","tags":["a"]}]}"#.utf8))
        let ops = [FichaDocumentoOp.op(id: "d1", titulo: "DNI", tipoDoc: "DNI", caduca: "2031-05-02", notas: "renovado"),
                   FichaDocumentoOp.op(id: "d2", titulo: "Seguro del coche", tipoDoc: "", caduca: "", notas: "")]
        let (r, _) = AplicarOperaciones.sobre(d, ops)
        XCTAssertTrue(AplicarOperaciones.sobre(r, ops).1.isEmpty)
        let fichas = LecturaDocumentos.fichas(r)
        XCTAssertEqual(fichas.map(\.id), ["d1", "d2"])
        XCTAssertEqual(fichas.first?.caduca, "2031-05-02")
        XCTAssertEqual(fichas.first?.url, "https://x")
        let d2 = (((try r.valor(de: "entries")) ?? nil)?.lista ?? []).first { $0["id"]?.texto == "d2" }
        XCTAssertEqual(d2?["type"], .string("document"))
        XCTAssertNil(d2?["docTipo"])
    }
}
