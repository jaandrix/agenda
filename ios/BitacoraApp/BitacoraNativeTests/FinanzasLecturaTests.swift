import XCTest
@testable import BitacoraNative

final class FinanzasLecturaTests: XCTestCase {
    private func doc(_ json: String) throws -> DocumentoBitacora {
        try DocumentoBitacora(datos: Data(json.utf8))
    }
    private let hoy = LocalDay(iso: "2026-11-08")!

    func testMesOffsetYEtiqueta() {
        XCTAssertEqual(LecturaFinanzas.mesOffset("2026-01", -1), "2025-12")
        XCTAssertEqual(LecturaFinanzas.mesOffset("2026-12", 1), "2027-01")
        XCTAssertEqual(LecturaFinanzas.mesOffset("2026-06", -3), "2026-03")
        XCTAssertTrue(LecturaFinanzas.etiquetaMes("2026-11").hasPrefix("noviembre"))
    }

    func testNeutrosYAjustesNoSonGasto() throws {
        let d = try doc(#"{"financePro": {"accounts": {"bancos": {"balance0": 100}}, "categories": [{"id": "inv", "name": "Inversiones"}], "transactions": [
            {"id": "n1", "type": "expense", "amount": 10, "account": "bancos", "date": "2026-11-01", "ahorro": true},
            {"id": "n2", "type": "expense", "amount": 5, "account": "bancos", "date": "2026-11-01", "ajuste": true},
            {"id": "n3", "type": "expense", "amount": 7, "account": "bancos", "date": "2026-11-01", "category": "inv"},
            {"id": "n4", "type": "expense", "amount": 3, "account": "bancos", "date": "2026-11-01", "category": "cat_inversion_gasto"},
            {"id": "g1", "type": "expense", "amount": 20, "account": "bancos", "date": "2026-11-01"},
            {"id": "i1", "type": "income", "amount": 50, "account": "bancos", "date": "2026-11-01", "ajuste": true}
        ]}}"#)
        let v = LecturaFinanzas.vista(d, hoy: hoy)
        XCTAssertEqual(v.gastosMes, 20)
        XCTAssertEqual(v.ingresosMes, 0)
        XCTAssertTrue(v.movimientos.first { $0.id == "n1" }?.neutro == true)
        XCTAssertTrue(v.movimientos.first { $0.id == "g1" }?.neutro == false)
        // los neutros afectan saldo pero no el gasto del mes
        XCTAssertEqual(v.saldoLiquido, 100 - 10 - 5 - 7 - 3 - 20 + 50)
    }

    func testBaseCeroSinDatos() throws {
        let d = try doc(#"{}"#)
        let v = LecturaFinanzas.vista(d, hoy: hoy)
        XCTAssertEqual(v.saldoLiquido, 0)
        XCTAssertEqual(v.patrimonioOperativo, 0)
        XCTAssertEqual(v.activosTotales, 0)
        XCTAssertEqual(v.ingresosMes, 0)
        XCTAssertEqual(v.gastosMes, 0)
        XCTAssertTrue(v.movimientos.isEmpty)
        XCTAssertTrue(v.cuentas.isEmpty == false) // cuentas fijas base
        XCTAssertEqual(v.presupuestosActual.remaining, 0)
        XCTAssertTrue(v.suscripciones.isEmpty)
        XCTAssertEqual(v.patrimonio.totalActivos, 0)
    }

    func testPresupuestoSumaCategoriasYCompromisos() throws {
        let d = try doc(#"{"financeProfile": {"budgetPlans": {"2026-11": {"salary": 2000, "contributions": 0, "allocations": [
            {"amount": 300, "categoryId": "comida", "label": "comida"},
            {"amount": 200, "categoryId": "comida", "label": "extra comida"},
            {"amount": 100, "auto": "subscription", "label": "suscripciones"}
        ]}}}, "financePro": {"accounts": {}, "categories": [{"id": "comida", "name": "Comida"}], "transactions": [
            {"id": "g1", "type": "expense", "amount": 120, "account": "bancos", "category": "comida", "date": "2026-11-03"},
            {"id": "r1", "type": "income", "amount": 20, "account": "bancos", "category": "comida", "date": "2026-11-04"},
            {"id": "s1", "type": "expense", "amount": 15, "account": "bancos", "date": "2026-11-05", "recurringEntryId": "sub1"}
        ]}}, "entries": [{"id": "sub1", "type": "subscription", "active": true, "amount": 15, "renewalDay": 5}]}"#)
        let v = LecturaFinanzas.vista(d, hoy: hoy)
        let p = v.presupuestosActual
        XCTAssertEqual(p.income, 2000)
        XCTAssertEqual(p.manualAssigned, 500)
        XCTAssertEqual(p.commitmentsAssigned, 100)
        XCTAssertEqual(p.totalAssigned, 600)
        XCTAssertEqual(p.remaining, 1400)
        XCTAssertEqual(p.categories.count, 1)
        let cat = try XCTUnwrap(p.categories.first)
        XCTAssertEqual(cat.planned, 500)
        XCTAssertEqual(cat.refunded, 20)
        XCTAssertEqual(cat.spent, 120)
        XCTAssertEqual(cat.available, 520)
        XCTAssertEqual(cat.remaining, 400)
        XCTAssertEqual(cat.casillas, 2)
        XCTAssertEqual(p.commitments.first?.charged, 15)
    }

    func testEquivalenteMensualYSuscripcionVigente() throws {
        let d = try doc(#"{"financePro": {"accounts": {}, "transactions": []}, "entries": [
            {"id": "s1", "type": "subscription", "title": "net", "amount": 12.99, "renewalDay": 10, "active": true},
            {"id": "s2", "type": "subscription", "title": "baja", "amount": 9, "renewalDay": 1, "active": false, "bajas": [{"desde": "2026-10-01"}]},
            {"id": "s3", "type": "subscription", "title": "futura", "amount": 5, "renewalDay": 1, "active": true, "altaDesde": "2026-12-01"}
        ]}"#)
        let v = LecturaFinanzas.vista(d, hoy: hoy)
        XCTAssertEqual(v.suscripciones.count, 3)
        let net = try XCTUnwrap(v.suscripciones.first { $0.id == "s1" })
        XCTAssertTrue(net.activa)
        XCTAssertEqual(net.equivalenteMensual, LecturaFinanzas.redondo(Decimal(string: "12.99")!))
        XCTAssertEqual(net.frecuencia, "mensual")
        XCTAssertNotNil(net.proximaFecha)
        XCTAssertFalse(v.suscripciones.first { $0.id == "s2" }!.activa)
        XCTAssertFalse(v.suscripciones.first { $0.id == "s3" }!.activa)
    }

    func testProximaSuscripcionCruzaDiciembreAEnero() throws {
        let d = try doc(#"{"financePro":{"accounts":{},"transactions":[]},"entries":[{"id":"s","type":"subscription","title":"anualidad","amount":10,"renewalDay":31,"active":true}]}"#)
        let diciembre = LocalDay(iso: "2026-12-31")!
        let v = LecturaFinanzas.vista(d, hoy: diciembre)
        XCTAssertEqual(v.suscripciones.first?.proximaFecha, "2026-12-31")
        let enero = LocalDay(iso: "2027-01-01")!
        let v2 = LecturaFinanzas.vista(d, hoy: enero)
        XCTAssertEqual(v2.suscripciones.first?.proximaFecha, "2027-01-31")
    }

    func testSerieDiariaYTotalesMensuales() throws {
        let d = try doc(#"{"financePro": {"accounts": {"bancos": {"balance0": 100}}, "transactions": [
            {"id": "a", "type": "income", "amount": 50, "account": "bancos", "date": "2026-11-01"},
            {"id": "b", "type": "expense", "amount": 10, "account": "bancos", "date": "2026-11-03"},
            {"id": "c", "type": "expense", "amount": 5, "account": "bancos", "date": "2026-10-15"}
        ]}}"#)
        let v = LecturaFinanzas.vista(d, hoy: hoy)
        XCTAssertEqual(v.ingresosMes, 50)
        XCTAssertEqual(v.gastosMes, 10)
        XCTAssertEqual(v.mesAnterior.mes, "2026-10")
        XCTAssertEqual(v.mesAnterior.gastos, 5)
        let serie = LecturaFinanzas.serieDiaria(doc: d, meses: 1, conExtras: false, hoy: hoy)
        XCTAssertFalse(serie.isEmpty)
        XCTAssertEqual(serie.first?.fecha.prefix(7), "2026-11")
        XCTAssertEqual(serie.last?.fecha, hoy.iso)
        XCTAssertEqual(serie.last?.valor, v.saldoLiquido)
        let vacia = LecturaFinanzas.serieDiaria(doc: try doc("{}"), meses: 1, conExtras: false, hoy: hoy)
        XCTAssertEqual(vacia.last?.valor, 0)
    }

    func testFiltroYAgrupacionPorDia() throws {
        let d = try doc(#"{"financePro": {"accounts": {"bancos": {"name": "Bancos", "balance0": 0}, "efectivo": {"name": "Efectivo", "balance0": 0}}, "categories": [{"id": "c1", "name": "Comida"}], "transactions": [
            {"id": "a", "type": "expense", "amount": 1, "account": "bancos", "category": "c1", "date": "2026-11-08", "note": "pan"},
            {"id": "b", "type": "income", "amount": 2, "account": "efectivo", "date": "2026-11-07", "note": "extra"}
        ]}}"#)
        let v = LecturaFinanzas.vista(d, hoy: hoy)
        var f = FiltrosMovimientos(busqueda: "pan")
        XCTAssertEqual(LecturaFinanzas.filtrar(v.movimientos, con: f).map(\.id), ["a"])
        f = FiltrosMovimientos(tipo: "income")
        XCTAssertEqual(LecturaFinanzas.filtrar(v.movimientos, con: f).map(\.id), ["b"])
        f = FiltrosMovimientos(cuenta: "bancos")
        XCTAssertEqual(LecturaFinanzas.filtrar(v.movimientos, con: f).count, 1)
        let grupos = LecturaFinanzas.agruparPorDia(v.movimientos)
        XCTAssertEqual(grupos.first?.fecha, "2026-11-08")
    }
}
