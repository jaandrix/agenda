import XCTest
@testable import BitacoraNative

// Finanzas con el código de la web en JavaScriptCore (MotorFinanzas) y sus escrituras (CambioFinanzas). La paridad
// fina con la web la vigila pruebas/finanzas-ios.mjs; aquí, que el motor arranca en el iPhone, que importar da la
// operación esperada y que aplicarla dos veces no duplica nada.
final class MotorFinanzasTests: XCTestCase {
    private let base = #"""
    {"financePro": {"accounts": {"efectivo": {"name": "Efectivo", "balance0": 0}, "bancos": {"name": "Ibercaja", "balance0": 100}, "online": {"name": "Revolut", "balance0": 0}},
     "categories": [], "transactions": [{"id": "t1", "type": "expense", "amount": 12.5, "account": "bancos", "date": "2026-11-02", "note": "Café", "rara": {"x": 1}}]},
     "entries": [{"id": "sub_1", "type": "subscription", "title": "Netflix", "amount": 12.99, "renewalDay": 3, "active": true}],
     "financeProfile": {}, "otra": [1, 2, 3]}
    """#

    func testCuentasConElSaldoDeLaWeb() async throws {
        let doc = try DocumentoBitacora(datos: Data(base.utf8))
        let m = MotorFinanzas()
        try await m.cargar(doc, revision: "t1")
        let cuentas = try await m.pestana("cuentas", opciones: #"{"rango":"6m","extras":false}"#, como: ModeloCuentas.self)
        XCTAssertEqual(cuentas.cuentas.first { $0.id == "bancos" }?.saldo ?? 0, 87.5, accuracy: 0.001)
        _ = try await m.pestana("movimientos", opciones: #"{"n":30}"#, como: ModeloMovimientos.self)
        _ = try await m.pestana("planificacion", como: ModeloPlanificacion.self)
        _ = try await m.pestana("resumen", como: ModeloResumen.self)
        let gestor = try await m.llamar("gestor", como: ModeloGestor.self)
        XCTAssertEqual(gestor.activas.map(\.id), ["sub_1"])
    }

    func testImportarEsUnaOperacionIdempotenteQueConservaLoDemas() async throws {
        let doc = try DocumentoBitacora(datos: Data(base.utf8))
        let m = MotorFinanzas()
        try await m.cargar(doc, revision: "t2")
        let csv = "Fecha;Concepto;Importe\n09/11/2026;Nómina;1.250,50\n10/11/2026;Mercado;-34,20\n"
        let vista = try JSONDecoder().decode(VistaImportacion.self, from: try await m.crudo("importarPreparar", [csv, "bancos"]))
        XCTAssertEqual(vista.nuevas, 2)
        let r = try LectorJSON.valor(try await m.crudo("importarEjecutar"))
        let op = try XCTUnwrap(CambioFinanzas.operacion(try XCTUnwrap(r["cambios"]), sobre: doc))
        let (una, _) = AplicarOperaciones.sobre(doc, [op])
        let (dos, _) = AplicarOperaciones.sobre(una, [op])
        let txs = try XCTUnwrap(try una.valor(de: "financePro")?["transactions"]?.lista)
        XCTAssertEqual(txs.count, 3)
        XCTAssertEqual(try dos.valor(de: "financePro")?["transactions"]?.lista?.count, 3)
        XCTAssertEqual(una.bytes(de: "otra"), doc.bytes(de: "otra"))
        XCTAssertEqual(una.bytes(de: "entries"), doc.bytes(de: "entries"))
        XCTAssertEqual(txs.first { $0["id"]?.comoId == "t1" }?["rara"], .object(["x": .number("1")]))
    }

    func testDarDeBajaUnaSuscripcion() async throws {
        let doc = try DocumentoBitacora(datos: Data(base.utf8))
        let m = MotorFinanzas()
        try await m.cargar(doc, revision: "t3")
        let r = try LectorJSON.valor(try await m.crudo("suscripcion", ["sub_1", "baja"]))
        let op = try XCTUnwrap(CambioFinanzas.operacion(try XCTUnwrap(r["cambios"]), sobre: doc))
        let (nuevo, parche) = AplicarOperaciones.sobre(doc, [op])
        XCTAssertEqual(Set(parche.keys), ["entries"])
        let e = try XCTUnwrap(try nuevo.valor(de: "entries")?.lista?.first)
        XCTAssertEqual(e["active"], .bool(false))
        XCTAssertEqual(e["bajas"]?.lista?.count, 1)
    }
}
