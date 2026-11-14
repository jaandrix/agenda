import XCTest
@testable import BitacoraNative

// 0.21: marcar en Despensa. La causa de que «no se marcara bien»: el toque mandaba el producto entero desde la foto
// con la que se pintó la fila (`hecho: !item.hecho`), y hasta recargar la fila no cambiaba; un segundo toque mandaba
// lo mismo. Además cada marca escribía `seccion: "otros"` y la web no guarda secciones, así que todo caía en «otros».
final class DespensaMarcarTests: XCTestCase {
    private let base = #"{"raro":[1,2],"listaCompra":{"actual":"l1","aprendido":{"cerveza sin":"bebida"},"listas":[{"id":"l1","nombre":"Casa","items":[{"id":"a","texto":"Leche","cantidad":"2","precio":1.15,"hecho":false,"ajeno":"x"},{"id":"b","texto":"Tomates","hecho":false},{"id":"c","texto":"Cerveza sin","hecho":false}]},{"id":"l2","nombre":"Mercadona","items":[{"id":"d","texto":"Pan","hecho":false}]}]}}"#

    private func doc() throws -> DocumentoBitacora { try DocumentoBitacora(datos: Data(base.utf8)) }

    private func item(_ d: DocumentoBitacora, _ id: String) -> [String: JSONValue]? {
        let lc = (try? d.valor(de: "listaCompra")) ?? nil
        for l in lc?["listas"]?.lista ?? [] {
            if let i = l["items"]?.lista?.first(where: { $0["id"]?.texto == id }) { return i.objeto }
        }
        return nil
    }

    func testMarcarSoloCambiaHechoYEsIdempotente() throws {
        let d = try doc()
        let op = OperacionesDespensa.marcarOp(listaId: "l1", id: "a", hecho: true)
        let (r, parche) = AplicarOperaciones.sobre(d, [op])
        XCTAssertEqual(Set(parche.keys), ["listaCompra"])
        let a = try XCTUnwrap(item(r, "a"))
        XCTAssertEqual(a["hecho"], .bool(true))
        XCTAssertEqual(a["ajeno"], .string("x"))
        XCTAssertEqual(a["precio"], .number("1.15"))
        XCTAssertNil(a["seccion"])
        XCTAssertEqual(try r.valor(de: "raro"), try d.valor(de: "raro"))
        XCTAssertTrue(AplicarOperaciones.sobre(r, [op]).1.isEmpty)
    }

    func testDesmarcarYVariosSeguidosDejanElUltimo() throws {
        var m = MarcasDespensa()
        let v = LecturaDespensa.vista(try doc())
        let leche = try XCTUnwrap(v.listaActual?.items.first { $0.id == "a" })
        // Tres toques sobre la misma foto (la fila no se ha repintado): marca, desmarca, marca.
        let valores = [m.tocar(leche), m.tocar(leche), m.tocar(leche)]
        XCTAssertEqual(valores, [true, false, true])
        XCTAssertTrue(m.hecho(leche))
        let ops = valores.map { OperacionesDespensa.marcarOp(listaId: "l1", id: "a", hecho: $0) }
        let (r, _) = AplicarOperaciones.sobre(try doc(), ops)
        XCTAssertEqual(item(r, "a")?["hecho"], .bool(true))
        // Varios productos seguidos.
        let tomates = try XCTUnwrap(v.listaActual?.items.first { $0.id == "b" })
        XCTAssertTrue(m.tocar(tomates))
        let (r2, _) = AplicarOperaciones.sobre(r, [OperacionesDespensa.marcarOp(listaId: "l1", id: "b", hecho: true)])
        XCTAssertEqual(item(r2, "b")?["hecho"], .bool(true))
        // Desmarcar.
        let (r3, _) = AplicarOperaciones.sobre(r2, [OperacionesDespensa.marcarOp(listaId: "l1", id: "b", hecho: false)])
        XCTAssertEqual(item(r3, "b")?["hecho"], .bool(false))
    }

    func testConSincronizacionAMediasLaMarcaNoVuelveAtras() throws {
        var m = MarcasDespensa()
        let leche = try XCTUnwrap(LecturaDespensa.vista(try doc()).listaActual?.items.first { $0.id == "a" })
        XCTAssertTrue(m.tocar(leche))
        // Llega una lista de antes de encolar (revisión 4): la marca sigue.
        m.cargado(revision: 4)
        XCTAssertTrue(m.hecho(leche))
        // La operación entra en la cola con la revisión 5; una carga de la 4 que llegue tarde no la suelta.
        m.confirmar("a", hecho: true, revision: 5)
        m.cargado(revision: 4)
        XCTAssertTrue(m.hecho(leche))
        // La de la 5 ya la trae: se suelta y manda el documento.
        m.cargado(revision: 5)
        XCTAssertTrue(m.vacio)
        // Un toque que no llegó a guardarse vuelve atrás.
        XCTAssertTrue(m.tocar(leche))
        m.fallo("a", hecho: true)
        XCTAssertFalse(m.hecho(leche))
        // Confirmar un valor viejo no suelta el toque que vino después.
        _ = m.tocar(leche); _ = m.tocar(leche)
        m.confirmar("a", hecho: true, revision: 6)
        m.cargado(revision: 9)
        XCTAssertFalse(m.hecho(leche))
        XCTAssertFalse(m.vacio)
    }

    func testMarcarEnOtraListaYBorradoNoResucita() throws {
        let (r, _) = AplicarOperaciones.sobre(try doc(), [OperacionesDespensa.marcarOp(listaId: "l1", id: "d", hecho: true)])
        XCTAssertEqual(item(r, "d")?["hecho"], .bool(true))
        let (r2, parche) = AplicarOperaciones.sobre(r, [OperacionesDespensa.marcarOp(listaId: "l1", id: "zz", hecho: true)])
        XCTAssertTrue(parche.isEmpty)
        XCTAssertNil(item(r2, "zz"))
    }

    func testSeccionesComoLaWeb() throws {
        let v = LecturaDespensa.vista(try doc())
        let s = Dictionary(uniqueKeysWithValues: (v.listaActual?.items ?? []).map { ($0.texto, $0.seccion) })
        XCTAssertEqual(s["Leche"], "lacteo")
        XCTAssertEqual(s["Tomates"], "fruta")
        XCTAssertEqual(s["Cerveza sin"], "bebida")
        XCTAssertEqual(SeccionCompra.deducir("tomate frito"), "despensa")
        XCTAssertEqual(SeccionCompra.deducir("caldo de pollo"), "despensa")
        XCTAssertEqual(SeccionCompra.deducir("patatas de jamón"), "aperitivo")
        XCTAssertEqual(SeccionCompra.deducir("cosa rara"), "otros")
        let g = LecturaDespensa.agrupar(v.listaActual?.items ?? [], hecho: { $0.id == "b" })
        XCTAssertEqual(g.secciones.map(\.seccion), ["lacteo", "bebida"])
        XCTAssertEqual(g.carro.map(\.id), ["b"])
    }

    func testEditarNoTocaHechoYApunteLaSeccion() throws {
        let (r, _) = AplicarOperaciones.sobre(try doc(), [
            OperacionesDespensa.marcarOp(listaId: "l1", id: "a", hecho: true),
            OperacionesDespensa.editarOp(listaId: "l1", id: "a", texto: "Leche sin lactosa", cantidad: "6", seccion: "bebida", precio: "1,30")
        ])
        let a = try XCTUnwrap(item(r, "a"))
        XCTAssertEqual(a["hecho"], .bool(true))
        XCTAssertEqual(a["texto"], .string("Leche sin lactosa"))
        XCTAssertEqual(a["precio"], .number("1.3"))
        let lc = try XCTUnwrap(try r.valor(de: "listaCompra"))
        XCTAssertEqual(lc["aprendido"]?["leche sin lactosa"], .string("bebida"))
        XCTAssertEqual(LecturaDespensa.vista(r).listaActual?.items.first { $0.id == "a" }?.seccion, "bebida")
    }

    func testIdsRepetidosNoSePintanDosVeces() throws {
        let d = try DocumentoBitacora(datos: Data(#"{"listaCompra":{"listas":[{"id":"l1","items":[{"id":"a","texto":"uno"},{"id":"a","texto":"otro"}]}]}}"#.utf8))
        XCTAssertEqual(LecturaDespensa.vista(d).listaActual?.items.map(\.texto), ["uno"])
    }
}
