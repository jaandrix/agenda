import XCTest
@testable import BitacoraNative

// Envíos nativos contra js/bajo-demanda/actualizaciones.js: historial al crear o cambiar de estado, fecha de entrega,
// avanzar sin repetir y lo que deja la función seguimiento-pedidos (seguimientoAuto) intacto.
final class EnviosTests: XCTestCase {
    func testPedidosComoEnLaWeb() throws {
        let doc = try DocumentoBitacora(datos: Data(#"""
        {"pedidos": [{"id": "p1", "titulo": "Cascos", "tienda": "Amazon", "seguimiento": "AB1", "estado": "enviado", "fechaEstimada": "2026-11-12",
                      "historial": [{"fecha": "2026-11-01", "estado": "pedido"}], "seguimientoAuto": {"eventos": [{"fecha": "2026-11-02", "texto": "Salida"}]}}]}
        """#.utf8))
        let ops: [OperacionBitacora] = [
            .guardarPedido(id: "p2", titulo: "Libro", tienda: "Otra", seguimiento: "  xy9 ", url: "", fechaPedido: "2026-11-10", fechaEstimada: "",
                           precio: "12.5", estado: "pedido", nota: "", hoy: "2026-11-10"),
            .estadoPedido(id: "p1", estado: "transito", hoy: "2026-11-10"),
        ]
        let (r, _) = AplicarOperaciones.sobre(doc, ops)
        let (una, _) = AplicarOperaciones.sobre(r, ops)
        let entregar: [OperacionBitacora] = [.estadoPedido(id: "p2", estado: "entregado", hoy: "2026-11-11")]
        let (dos, _) = AplicarOperaciones.sobre(AplicarOperaciones.sobre(una, entregar).0, entregar)
        let lista = LecturaEnvios.pedidos(dos)
        let p1 = try XCTUnwrap(lista.first { $0.id == "p1" })
        XCTAssertEqual(p1.estado, "transito")
        XCTAssertEqual(p1.movimientos.map(\.texto), ["Salida"])
        let p2 = try XCTUnwrap(lista.first { $0.id == "p2" })
        XCTAssertEqual(p2.seguimiento, "XY9")
        XCTAssertEqual(p2.precio, Decimal(string: "12.5"))
        XCTAssertEqual(p2.fechaEntrega, "2026-11-11")
        let crudo = try XCTUnwrap(dos.valor(de: "pedidos")?.lista)
        XCTAssertEqual(crudo.first { $0["id"]?.comoId == "p1" }?["historial"]?.lista?.count, 2)
        XCTAssertEqual(crudo.first { $0["id"]?.comoId == "p2" }?["historial"]?.lista?.count, 2)
        XCTAssertNotNil(crudo.first { $0["id"]?.comoId == "p1" }?["seguimientoAuto"])

        // Editar sin cambiar el estado ni poner nota no añade historial; volver atrás quita la fecha de entrega.
        let (ed, _) = AplicarOperaciones.sobre(dos, [.guardarPedido(id: "p2", titulo: "Libro gordo", tienda: "Otra", seguimiento: "XY9", url: "", fechaPedido: "",
                                                                    fechaEstimada: "", precio: "", estado: "entregado", nota: "", hoy: "2026-11-12"),
                                                     .guardarPedido(id: "p1", titulo: "Cascos", tienda: "Amazon", seguimiento: "AB1", url: "", fechaPedido: "",
                                                                    fechaEstimada: "2026-11-12", precio: "", estado: "pedido", nota: "", hoy: "2026-11-12")])
        let crudo2 = try XCTUnwrap(ed.valor(de: "pedidos")?.lista)
        let q2 = try XCTUnwrap(crudo2.first { $0["id"]?.comoId == "p2" })
        XCTAssertEqual(q2["historial"]?.lista?.count, 2)
        XCTAssertNil(q2["precio"])
        XCTAssertEqual(q2["fechaEntrega"], .string("2026-11-11"))
        XCTAssertEqual(crudo2.first { $0["id"]?.comoId == "p1" }?["historial"]?.lista?.count, 3)

        let p = try XCTUnwrap(LecturaEnvios.pedidos(ed).first { $0.id == "p1" })
        XCTAssertEqual(LecturaEnvios.llegada(p, hoy: LocalDay(iso: "2026-11-11")!), "llega mañana.")
        XCTAssertEqual(LecturaEnvios.urlSeguimiento(p)?.absoluteString, "https://t.17track.net/es#nums=AB1")
    }
}
