import XCTest
@testable import BitacoraNative

// 3.2: «cambiar portada.» desde la ficha de Ocio.
final class PortadaOcioTests: XCTestCase {
    private func doc(_ json: String) throws -> DocumentoBitacora { try DocumentoBitacora(datos: Data(json.utf8)) }
    private func entradas(_ d: DocumentoBitacora) -> [JSONValue] { ((try? d.valor(de: "entries")) ?? nil)?.lista ?? [] }

    func testPortadaElegidaSustituyeLaQueHayYQuitaPendiente() throws {
        let d = try doc(#"{"entries":[{"id":"a","type":"book","title":"A","portada":"https://vieja.jpg","portadaPendiente":true,"raro":1},{"id":"b","type":"movie","title":"B","portada":""}]}"#)
        let ops = [OcioDatosOp.op(id: "a", portada: "https://nueva.jpg"), OcioDatosOp.op(id: "b", portada: "https://otra.jpg")]
        let (r, cambios) = AplicarOperaciones.sobre(d, ops)
        XCTAssertEqual(Set(cambios.keys), ["entries"])
        let l = entradas(r)
        XCTAssertEqual(l[0]["portada"]?.texto, "https://nueva.jpg")
        XCTAssertNil(l[0]["portadaPendiente"])
        XCTAssertEqual(l[0]["raro"], .number("1"))
        XCTAssertEqual(l[1]["portada"]?.texto, "https://otra.jpg")
        // Idempotente.
        XCTAssertTrue(AplicarOperaciones.sobre(r, ops).1.isEmpty)
        XCTAssertEqual(LecturaOcio.vista(r).entradas.first { $0.id == "a" }?.portada, "https://nueva.jpg")
    }

    func testSoloSiFaltaSigueSinPisarla() throws {
        let d = try doc(#"{"entries":[{"id":"a","type":"book","title":"A","portada":"https://elegida.jpg"}]}"#)
        let (r, cambios) = AplicarOperaciones.sobre(d, [OcioDatosOp.op(id: "a", portadaSiFalta: "https://auto.jpg")])
        XCTAssertTrue(cambios.isEmpty)
        XCTAssertEqual(entradas(r)[0]["portada"]?.texto, "https://elegida.jpg")
    }

    func testNoGuardaUnaPortadaQueNoEsHttps() throws {
        let d = try doc(#"{"entries":[{"id":"a","type":"book","title":"A","portada":"https://ya.jpg"}]}"#)
        let (r, _) = AplicarOperaciones.sobre(d, [OcioDatosOp.op(id: "a", portada: "http://insegura.jpg")])
        XCTAssertEqual(entradas(r)[0]["portada"]?.texto, "https://ya.jpg")
    }

    func testLaDelIsbnVaPrimeraSinRepetirYSoloHttps() {
        let isbn = CandidataPortada(titulo: "A", anio: "", autor: "", imagen: "https://isbn.jpg")
        let r = [CandidataPortada(titulo: "A", anio: "2001", autor: "X", imagen: "https://uno.jpg"),
                 CandidataPortada(titulo: "A", anio: "", autor: "", imagen: "https://isbn.jpg"),
                 CandidataPortada(titulo: "A", anio: "", autor: "", imagen: "http://dos.jpg")]
        XCTAssertEqual(CambiarPortadaOcio.ordenadas(isbn: isbn, r).map(\.imagen), ["https://isbn.jpg", "https://uno.jpg"])
        XCTAssertEqual(CambiarPortadaOcio.ordenadas(isbn: nil, r).map(\.imagen), ["https://uno.jpg", "https://isbn.jpg"])
    }
}
