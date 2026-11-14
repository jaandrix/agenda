import XCTest
@testable import BitacoraNative

// 0.21: ocio, compra, proyecto, objetivo, estudios y deseo desde la bandeja, como aplicarOpConector de la web.
final class ConectorMasTests: XCTestCase {
    private let base = #"{"entries":[{"id":"p1","type":"project","title":"Web","tareas":[{"id":"t1","texto":"Diseño","estado":"pendiente"}],"fases":[],"diario":[]},{"id":"g1","type":"goal","title":"Correr","milestones":[{"text":"5 km","done":false}]},{"id":"m1","type":"movie","title":"Dune","rating":0}],"dayPlanner":{"days":{"2026-11-14":[{"id":"planner_valorar_m1","title":"valorar la película. Dune","valorarPeliculaId":"m1","done":false}]},"backlog":[]},"listaCompra":{"actual":"l1","listas":[{"id":"l1","nombre":"Casa","items":[{"id":"a","texto":"Leche","hecho":false}]}]},"financeProfile":{"wishlist":[],"otro":1},"studies":{"subjects":[{"id":"s1","name":"Física","exams":[],"assignments":[]}]},"registroConector":[]}"#

    private func aplicar(_ ops: [(String, [String: JSONValue])]) throws -> DocumentoBitacora {
        let d = try DocumentoBitacora(datos: Data(base.utf8))
        let lista = ops.map { ref, op in
            OperacionesExtra.op(OperacionesExtra.conector, ["ref": .string(ref), "op": .object(op), "cuando": .string("2026-11-14T10:00:00Z"),
                                                            "hoy": .string("2026-11-14"), "ahoraMs": .number("1794650000000"), "origen": .string("auto")])
        }
        let (r, _) = AplicarOperaciones.sobre(d, lista)
        XCTAssertTrue(AplicarOperaciones.sobre(r, lista).1.isEmpty, "reaplicar cambió algo")
        return r
    }

    private func entrada(_ d: DocumentoBitacora, _ id: String) -> [String: JSONValue]? {
        (((try? d.valor(de: "entries")) ?? nil)?.lista ?? []).first { $0["id"]?.comoId == id }?.objeto
    }

    func testCompraDeseoYOcio() throws {
        let d = try aplicar([
            ("ia_1", ["tipo": .string("compra"), "cosas": .array([.string("leche"), .string("2 tomates")])]),
            ("ia_2", ["tipo": .string("deseo"), "titulo": .string("Auriculares"), "precio": .number("59.9")]),
            ("ia_3", ["tipo": .string("ocio"), "entryType": .string("book"), "titulo": .string("Dune"), "datos": .object(["author": .string("Herbert")])]),
            ("ia_4", ["tipo": .string("ocio"), "id": .string("m1"), "datos": .object(["rating": .number("4")])])
        ])
        let lc = try XCTUnwrap(try d.valor(de: "listaCompra"))
        XCTAssertEqual(lc["listas"]?.lista?.first?["items"]?.lista?.map { $0["texto"]?.texto ?? "" }, ["Leche", "Tomates"])
        let fp = try XCTUnwrap(try d.valor(de: "financeProfile"))
        XCTAssertEqual(fp["wishlist"]?.lista?.first?["price"], .number("59.9"))
        XCTAssertEqual(fp["otro"], .number("1"))
        XCTAssertEqual(entrada(d, "ia_3")?["categoryId"], .string("cat_libro"))
        XCTAssertEqual(entrada(d, "ia_3")?["author"], .string("Herbert"))
        XCTAssertEqual(entrada(d, "m1")?["rating"], .number("4"))
        let tarea = try XCTUnwrap(try d.valor(de: "dayPlanner"))["days"]?["2026-11-14"]?.lista?.first
        XCTAssertEqual(tarea?["done"], .bool(true))
        let reg = try XCTUnwrap(try d.valor(de: "registroConector")).lista ?? []
        XCTAssertEqual(reg.count, 4)
        XCTAssertEqual(reg.first { $0["id"]?.texto == "ia_1" }?["deshacer"]?["accion"], .string("compra"))
    }

    func testProyectoYObjetivo() throws {
        let d = try aplicar([
            ("ia_1", ["tipo": .string("proyecto"), "accion": .string("tareas"), "proyectoId": .string("p1"), "fase": .string("Lanzar"),
                      "tareas": .array([.string("Dominio"), .string("diseño")])]),
            ("ia_2", ["tipo": .string("proyecto"), "accion": .string("completar"), "proyectoId": .string("p1"), "tarea": .string("diseno")]),
            ("ia_3", ["tipo": .string("proyecto"), "accion": .string("crear"), "titulo": .string("Casa"), "tareas": .array([.string("Pintar")])]),
            ("ia_4", ["tipo": .string("objetivo"), "accion": .string("hitos"), "id": .string("g1"), "hitos": .array([.string("10 km"), .string("5 KM")])]),
            ("ia_5", ["tipo": .string("objetivo"), "accion": .string("hito_hecho"), "id": .string("g1"), "hito": .string("5 km")])
        ])
        let p = try XCTUnwrap(entrada(d, "p1"))
        XCTAssertEqual(p["tareas"]?.lista?.map { $0["texto"]?.texto ?? "" }, ["Diseño", "Dominio"])
        XCTAssertEqual(p["tareas"]?.lista?.first?["estado"], .string("hecha"))
        XCTAssertEqual(p["tasks"]?.lista?.first?["done"], .bool(true))
        XCTAssertEqual(p["fases"]?.lista?.first?["nombre"], .string("Lanzar"))
        XCTAssertEqual(entrada(d, "ia_3")?["tareas"]?.lista?.count, 1)
        let g = try XCTUnwrap(entrada(d, "g1"))
        XCTAssertEqual(g["milestones"]?.lista?.map { $0["text"]?.texto ?? "" }, ["5 km", "10 km"])
        XCTAssertEqual(g["milestones"]?.lista?.first?["done"], .bool(true))
    }

    func testEstudios() throws {
        let d = try aplicar([
            ("ia_1", ["tipo": .string("estudio_crear"), "subjectId": .string("s1"), "lista": .string("exams"),
                      "item": .object(["title": .string("Parcial"), "date": .string("2026-12-01"), "time": .string("09:00"), "weight": .number("40")])]),
            ("ia_2", ["tipo": .string("estudio_editar"), "subjectId": .string("s1"), "lista": .string("exams"), "id": .string("ia_1"),
                      "cambios": .object(["grade": .number("8.5")]), "resumen": .string("Parcial")])
        ])
        let s = try XCTUnwrap(try d.valor(de: "studies"))["subjects"]?.lista?.first
        let examen = try XCTUnwrap(s?["exams"]?.lista?.first)
        XCTAssertEqual(examen["title"], .string("Parcial"))
        XCTAssertEqual(examen["grade"], .number("8.5"))
        XCTAssertEqual(examen["weight"], .number("40"))
        XCTAssertEqual(entrada(d, "evt_ia_1")?["date"], .string("2026-12-01"))
    }
}
