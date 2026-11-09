import XCTest
@testable import BitacoraNative

final class DespensaOcioTests: XCTestCase {
    private func doc(_ json: String) throws -> DocumentoBitacora { try DocumentoBitacora(datos: Data(json.utf8)) }

    private func idem(_ d: DocumentoBitacora, _ operaciones: [OperacionBitacora], file: StaticString = #filePath, line: UInt = #line) -> DocumentoBitacora {
        let (resultado, _) = AplicarOperaciones.sobre(d, operaciones)
        let (_, segundo) = AplicarOperaciones.sobre(resultado, operaciones)
        XCTAssertTrue(segundo.isEmpty, "reaplicar cambió \(segundo.keys)", file: file, line: line)
        return resultado
    }

    func testDespensaConservaCamposYTerminaCompraUnaVez() throws {
        let original = try doc(#"{"raro":{"x":1},"listaCompra":{"aprendido":{"pan":"pan"},"actual":"l1","listas":[{"id":"l1","nombre":"Casa","extra":true,"items":[{"id":"i1","texto":"pan","cantidad":"2","seccion":"pan","precio":1.25,"hecho":true},{"id":"i2","texto":"leche","hecho":false}]}]}}"#)
        let operaciones: [OperacionBitacora] = [
            .guardarRecetaCompra(id: "r1", nombre: "Tostadas", raciones: 2, ingredientes: ["2|pan", "1|tomate"], pasos: ["tostar"], notas: "rápido"),
            .guardarPlatoCompra(dia: "2026-11-10", id: "p1", momento: "cena", nombre: "Tostadas", recetaId: "r1", ingredientes: ["pan", "tomate"]),
            .terminarCompra(listaId: "l1", compraId: "c1", fecha: "2026-11-09", tienda: "Mercado", total: "1,25", txId: "tx1")
        ]
        let resultado = idem(original, operaciones)
        let compra = try XCTUnwrap(try resultado.valor(de: "listaCompra"))
        XCTAssertEqual(compra["historial"]?.lista?.count, 1)
        XCTAssertEqual(compra["historial"]?.lista?.first?["txId"], .string("tx1"))
        XCTAssertEqual(compra["listas"]?.lista?.first?["items"]?.lista?.map { $0["id"] }, [.string("i2")])
        XCTAssertEqual(compra["listas"]?.lista?.first?["extra"], .bool(true))
        XCTAssertEqual(compra["aprendido"]?["pan"], .string("pan"))
        XCTAssertEqual(try resultado.valor(de: "raro"), try original.valor(de: "raro"))
        XCTAssertEqual(LecturaDespensa.vista(resultado).recetas.first?.ingredientes.count, 2)
    }

    func testOcioConservaLaEntradaYLasListasUsanEsquemaWeb() throws {
        let original = try doc(#"{"entries":[{"id":"o1","type":"book","title":"Viejo","campoAjeno":7}],"cultureLists":[]}"#)
        let operaciones: [OperacionBitacora] = [
            .guardarOcio(id: "o1", tipo: "book", titulo: "El libro", autor: "Autora", estado: "Completado", fechaInicio: "2026-01-01", fechaFin: "2026-02-01", anio: "2025", valoracion: "4", notas: "bien", enlace: "https://example.com", portada: "https://example.com/a.jpg"),
            .guardarListaOcio(id: "l1", nombre: "favoritos", entryIds: ["o1", "o1"])
        ]
        let resultado = idem(original, operaciones)
        let entrada = try XCTUnwrap(try resultado.valor(de: "entries")?.lista?.first)
        XCTAssertEqual(entrada["campoAjeno"], .number("7"))
        XCTAssertEqual(entrada["startDate"], .string("2026-01-01"))
        XCTAssertEqual(entrada["endDate"], .string("2026-02-01"))
        XCTAssertEqual(entrada["year"], .number("2025"))
        let lista = try XCTUnwrap(try resultado.valor(de: "cultureLists")?.lista?.first)
        XCTAssertEqual(lista["name"], .string("favoritos"))
        XCTAssertNil(lista["nombre"])
        XCTAssertEqual(lista["entryIds"]?.lista, [.string("o1")])
        XCTAssertEqual(LecturaOcio.vista(resultado).entradas.first?.titulo, "El libro")
    }

    func testImportadoresCSVConComillasYFiltros() throws {
        let goodreads = "Book Id,Title,Author,My Rating,Year Published,Date Read,Exclusive Shelf\n1,\"Cien años, de soledad\",García Márquez,5,1967,2026/03/12,read\n"
        let g = try ImportadoresOcio.importar(goodreads, fuente: .goodreads)
        XCTAssertEqual(g.entradas.first?.titulo, "Cien años, de soledad")
        XCTAssertEqual(g.entradas.first?.fechaFin, "2026-03-12")
        let imdb = "Title,Title Type,Your Rating,Date Rated,Year\nSerie,tvSeries,8,2026-04-01,2025\nEpisodio,tvEpisode,9,2026-04-02,2025\n"
        let i = try ImportadoresOcio.importar(imdb, fuente: .imdb)
        XCTAssertEqual(i.entradas.count, 1)
        XCTAssertEqual(i.entradas.first?.valoracion, "4")
        XCTAssertEqual(i.omitidas, 1)
    }
}
