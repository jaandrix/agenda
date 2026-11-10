import XCTest
@testable import BitacoraNative

// Enlaces nativos contra js/enlaces-proyectos.js: https:// por defecto, nuevos arriba, 5 favoritos como mucho y al borrar
// una categoría sus enlaces pasan a otra o se quedan sin ella.
final class EnlacesTests: XCTestCase {
    func testEnlacesFavoritosYCategorias() throws {
        let favs = (1...5).map { #"{"id": "f\#($0)", "title": "f", "url": "https://a.es", "favorito": true}"# }.joined(separator: ",")
        let doc = try DocumentoBitacora(datos: Data(#"""
        {"links": [\#(favs), {"id": "l1", "title": "Viejo", "url": "https://b.es", "categoryId": "c1", "raro": 1}],
         "linkCategories": [{"id": "c1", "name": "Trabajo", "color": "#FFADAD"}, {"id": "c2", "name": "Ocio", "color": "#CAFFBF"}]}
        """#.utf8))
        let ops: [OperacionBitacora] = [
            .guardarEnlace(id: "l2", titulo: "Nuevo", url: "ejemplo.com", categoriaId: nil, descripcion: "", creado: "2026-11-10T10:00:00Z"),
            .guardarEnlace(id: "l1", titulo: "Viejo editado", url: "https://b.es/x", categoriaId: "c1", descripcion: "para el curro", creado: "x"),
            .guardarEnlace(id: "l3", titulo: "", url: "https://c.es", categoriaId: nil, descripcion: "", creado: "x"),
            .favoritoEnlace(id: "l1", favorito: true),
            .favoritoEnlace(id: "f1", favorito: false),
            .favoritoEnlace(id: "l2", favorito: true),
        ]
        let (r, _) = AplicarOperaciones.sobre(doc, ops)
        let (dos, _) = AplicarOperaciones.sobre(r, ops)
        let (enlaces, _) = LecturaEnlaces.leer(dos)
        XCTAssertEqual(enlaces.first?.id, "l2")
        XCTAssertEqual(enlaces.first?.url, "https://ejemplo.com")
        XCTAssertEqual(enlaces.count, 7)
        XCTAssertFalse(enlaces.first { $0.id == "l1" }!.favorito)
        XCTAssertTrue(enlaces.first { $0.id == "l2" }!.favorito)
        XCTAssertEqual(enlaces.filter(\.favorito).count, 5)
        let l1 = try XCTUnwrap(dos.valor(de: "links")?.lista?.first { $0["id"]?.comoId == "l1" })
        XCTAssertEqual(l1["descripcion"], .string("para el curro"))
        XCTAssertEqual(l1["raro"], .number("1"))

        let (sin, _) = AplicarOperaciones.sobre(dos, [.borrarCategoriaEnlace(id: "c1", destino: "c2"), .guardarCategoriaEnlace(id: "c3", nombre: "Leer", color: ""),
                                                     .borrarEnlace(id: "f2")])
        let (e2, cats) = LecturaEnlaces.leer(sin)
        XCTAssertEqual(cats.map(\.id), ["c2", "c3"])
        XCTAssertEqual(cats.last?.color, "#FFADAD")
        XCTAssertEqual(e2.first { $0.id == "l1" }?.categoriaId, "c2")
        XCTAssertNil(e2.first { $0.id == "f2" })
        XCTAssertTrue(LecturaEnlaces.coincide(e2.first { $0.id == "l1" }!, "CURRO"))
    }
}
