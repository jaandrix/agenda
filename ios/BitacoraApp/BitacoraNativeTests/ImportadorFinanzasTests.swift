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
}
