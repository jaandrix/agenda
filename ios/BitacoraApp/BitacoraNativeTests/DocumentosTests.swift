import XCTest
@testable import BitacoraNative

// Documentos en lectura contra renderFichasDocumentos: por caducidad (sin fecha al final) y aviso a 30 días o caducada.
final class DocumentosTests: XCTestCase {
    func testFichasPorCaducidad() throws {
        let doc = try DocumentoBitacora(datos: Data(#"""
        {"entries": [{"id": "d1", "type": "document", "title": "DNI", "docTipo": "Identidad", "date": "2027-06-01"},
                     {"id": "d2", "type": "document", "title": "Garantía", "date": ""},
                     {"id": "d3", "type": "document", "title": "Seguro", "date": "2026-11-20"},
                     {"id": "d4", "type": "document", "title": "Pasaporte", "date": "2026-11-01"},
                     {"id": "e1", "type": "event", "title": "cine", "date": "2026-11-02"}]}
        """#.utf8))
        let f = LecturaDocumentos.fichas(doc)
        XCTAssertEqual(f.map(\.id), ["d4", "d3", "d1", "d2"])
        let hoy = LocalDay(iso: "2026-11-10")!
        XCTAssertTrue(LecturaDocumentos.estado(f[0], hoy: hoy).1)
        XCTAssertTrue(LecturaDocumentos.estado(f[0], hoy: hoy).0.hasPrefix("caducada hace 9 días"))
        XCTAssertTrue(LecturaDocumentos.estado(f[1], hoy: hoy).1)
        XCTAssertFalse(LecturaDocumentos.estado(f[2], hoy: hoy).1)
        XCTAssertEqual(LecturaDocumentos.estado(f[3], hoy: hoy).0, "sin caducidad.")
        XCTAssertEqual(LecturaDocumentos.ruta("u1", "mi contrato.pdf"), "storage/v1/object/authenticated/documents/u1/mi contrato.pdf")
    }
}
