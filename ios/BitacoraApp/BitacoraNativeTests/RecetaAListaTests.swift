import XCTest
@testable import BitacoraNative

final class RecetaAListaTests: XCTestCase {
    func testClaveComoLaWeb() {
        XCTAssertEqual(RecetaALista.clave("2 Tomates"), "tomat")
        XCTAssertEqual(RecetaALista.clave("tomate"), "tomate")
        XCTAssertEqual(RecetaALista.clave("500 g Harina"), "harina")
        XCTAssertEqual(RecetaALista.clave("Plátanos"), "platano")
        XCTAssertEqual(RecetaALista.clave("Plátano"), RecetaALista.clave("platanos"))
    }

    func testNoDuplicaAnotaLaRecetaYEsIdempotente() throws {
        let d = try DocumentoBitacora(datos: Data(#"{"listaCompra":{"actual":"l1","listas":[{"id":"l1","nombre":"Casa","items":[{"id":"a","texto":"Plátanos","hecho":false,"seccion":"fruta"},{"id":"b","texto":"leche","hecho":true}]}]}}"#.utf8))
        let receta = RecetaDespensa(id: "r", nombre: "Batido", raciones: 2,
                                    ingredientes: [.init(texto: "plátano", cantidad: "2"), .init(texto: "leche", cantidad: "")], pasos: [], notas: "")
        let lista = LecturaDespensa.vista(d).listaActual
        XCTAssertEqual(RecetaALista.yaEsta(receta, en: lista), ["plátano"])
        let op = RecetaALista.operacion(listaId: "l1", receta: receta, elegidos: receta.ingredientes, ahora: Date(timeIntervalSince1970: 1))
        let (r, cambios) = AplicarOperaciones.sobre(d, [op])
        XCTAssertEqual(Array(cambios.keys), ["listaCompra"])
        let items = try XCTUnwrap(LecturaDespensa.vista(r).listaActual?.items)
        XCTAssertEqual(items.count, 3)
        XCTAssertEqual(items.first { $0.id == "a" }?.recetas, ["Batido (2)"])
        // La leche estaba comprada (hecha): entra como nueva, como en la web.
        XCTAssertEqual(items.filter { $0.texto == "leche" && !$0.hecho }.first?.recetas, ["Batido"])
        XCTAssertEqual(items.first { $0.id == "a" }?.seccion, "fruta")
        XCTAssertTrue(AplicarOperaciones.sobre(r, [op]).1.isEmpty)
    }
}
