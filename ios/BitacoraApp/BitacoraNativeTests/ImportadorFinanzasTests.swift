import XCTest
@testable import BitacoraNative

final class ImportadorFinanzasTests: XCTestCase {
    func testCSVSemicolonEuropeoYReimportacionIdempotente() throws {
        let csv = """
        Fecha;Concepto;Importe;Estado
        09/11/2026;Nómina;1.250,50;COMPLETED
        10/11/2026;Mercado;-34,20;COMPLETED
        10/11/2026;Tarjeta;-8,00;PENDING
        """
        let e = try ImportadorFinanzas.analizar(csv, nombre: "banco.csv")
        XCTAssertEqual(e.filas.count, 2)
        XCTAssertEqual(e.omitidas, 1)
        XCTAssertEqual(e.filas[0].tipo, "income")
        XCTAssertEqual(e.filas[0].importe, Decimal(string: "1250.50"))
        XCTAssertEqual(e.filas[1].fecha, "2026-11-10")

        let doc = try DocumentoBitacora(datos: Data(#"{"financePro":{"accounts":{"bancos":{"name":"Banco","balance0":0}},"transactions":[]}}"#.utf8))
        let ops = ImportadorFinanzas.operaciones(e, cuenta: "bancos")
        let (una, _) = AplicarOperaciones.sobre(doc, ops)
        let (dos, _) = AplicarOperaciones.sobre(una, ops)
        let tx1 = try una.valor(de: "financePro")?["transactions"]?.lista?.count
        let tx2 = try dos.valor(de: "financePro")?["transactions"]?.lista?.count
        XCTAssertEqual(tx1, 2)
        XCTAssertEqual(tx2, 2)
    }

    func testColumnasCargoAbonoYCabeceraPrevia() throws {
        let csv = """
        Cuenta: ES00 0000
        Generado: hoy
        Fecha\tDescripción\tCargo\tAbono
        2026-11-08\tCafé\t2.40\t
        2026-11-09\tIngreso\t\t50.00
        """
        let e = try ImportadorFinanzas.analizar(csv, nombre: "cuenta.tsv")
        XCTAssertEqual(e.filas.map(\.tipo), ["expense", "income"])
        XCTAssertEqual(e.filas.map(\.importe), [Decimal(string: "2.40")!, Decimal(string: "50")!])
    }

    // La clave es la de la web (dedupeKey): lo que la web ya importó no entra otra vez, y dos filas iguales son dos.
    // El otro sentido (iPhone y luego web) lo prueba pruebas/importar-ios-web.mjs con el importador real.
    func testMismaClaveQueLaWebEnLosDosSentidos() throws {
        let csv = "Fecha;Concepto;Importe\n09/11/2026;Nómina;1.250,50\n10/11/2026;Mercado;-34,20\n10/11/2026;Mercado;-34,20\n11/11/2026;Café;-2,00\n"
        let e = try ImportadorFinanzas.analizar(csv, nombre: "banco.csv")
        let ops = ImportadorFinanzas.operaciones(e, cuenta: "bancos")
        let cuenta = { (d: DocumentoBitacora) in try d.valor(de: "financePro")?["transactions"]?.lista ?? [] }

        let vacio = try DocumentoBitacora(datos: Data(#"{"financePro":{"accounts":{},"transactions":[]}}"#.utf8))
        let (una, _) = AplicarOperaciones.sobre(vacio, ops)
        let (dos, _) = AplicarOperaciones.sobre(una, ops)
        XCTAssertEqual(try cuenta(una).count, 4)
        XCTAssertEqual(try cuenta(dos).count, 4)
        let t = try XCTUnwrap(cuenta(una).first)
        XCTAssertEqual(t["note"], .string("Nómina"))
        XCTAssertNil(t["claveImport"])
        XCTAssertNil(t["conceptoBanco"])
        XCTAssertEqual(ClaveImportacion.claves(t), ["bancos|2026-11-09|1250.5|Nómina"])

        // Como lo deja financeProEjecutarImport en la web (con el concepto cambiado a mano en uno: bankNote manda).
        let web = try DocumentoBitacora(datos: Data(#"""
        {"financePro":{"accounts":{},"transactions":[
         {"id":"ptx_1","date":"2026-11-09","account":"bancos","type":"income","amount":1250.5,"note":"sueldo","bankNote":"Nómina","orden":0},
         {"id":"ptx_2","date":"2026-11-10","account":"bancos","type":"expense","amount":34.2,"note":"Mercado","orden":1},
         {"id":"ptx_3","date":"2026-11-10","account":"bancos","type":"expense","amount":34.2,"note":"Mercado","orden":2},
         {"id":"ptx_4","date":"2026-11-11","account":"bancos","type":"expense","amount":2,"note":"Café","orden":3}]}}
        """#.utf8))
        XCTAssertEqual(try cuenta(AplicarOperaciones.sobre(web, ops).0).count, 4)
        // Si en la web solo estaba uno de los dos mercados, entra el otro.
        let uno = try DocumentoBitacora(datos: Data(#"{"financePro":{"accounts":{},"transactions":[{"id":"ptx_2","date":"2026-11-10","account":"bancos","type":"expense","amount":34.2,"note":"Mercado"}]}}"#.utf8))
        let (sinUno, _) = AplicarOperaciones.sobre(uno, ops)
        XCTAssertEqual(try cuenta(sinUno).filter { $0["note"] == .string("Mercado") }.count, 2)
    }
}
