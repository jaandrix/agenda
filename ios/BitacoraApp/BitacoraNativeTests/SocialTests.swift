import XCTest
@testable import BitacoraNative

// Cuentas de Social contra js/social.js: saldos, mínimo de pagos, reparto sin descuadre y validación de eventos recibidos.
final class SocialTests: XCTestCase {
    private let miembros = [SocialMiembro(id: "a", userId: "yo", nombre: "Yo"), SocialMiembro(id: "b", userId: nil, nombre: "Bea"),
                            SocialMiembro(id: "c", userId: "u3", nombre: "Carlos")]

    private func grupo(_ gastos: [SocialGasto]) -> SocialGrupo {
        SocialGrupo(id: "g", nombre: "Lisboa", descripcion: nil, creadorId: "yo", miembros: miembros, gastos: gastos)
    }

    func testRepartoIgualCuadraConElResto() {
        let r = CuentasSocial.reparto(miembros: miembros, modo: "igual", valores: ["a": 1, "b": 1, "c": 1], centimos: 1000)
        XCTAssertEqual(r.map(\.centimos), [334, 333, 333])
        let p = CuentasSocial.reparto(miembros: miembros, modo: "partes", valores: ["a": 2, "b": 1, "c": 0], centimos: 900)
        XCTAssertEqual(p.map(\.centimos), [600, 300])
        XCTAssertEqual(p.first?.partes, 2)
        let i = CuentasSocial.reparto(miembros: miembros, modo: "importes", valores: ["a": 2.5, "c": 7.5], centimos: 1000)
        XCTAssertEqual(i.map(\.miembro), ["a", "c"])
        XCTAssertEqual(i.map(\.centimos), [250, 750])
    }

    func testSaldosYComoSaldar() {
        let cena = SocialGasto(id: "1", tipo: "gasto", titulo: "Cena", centimos: 3000, pagadoPor: "a", modo: "igual",
                               reparto: CuentasSocial.reparto(miembros: miembros, modo: "igual", valores: ["a": 1, "b": 1, "c": 1], centimos: 3000),
                               fecha: "2026-11-20", categoria: "comida")
        let g = grupo([cena])
        XCTAssertEqual(CuentasSocial.saldos(g), ["a": 2000, "b": -1000, "c": -1000])
        XCTAssertEqual(CuentasSocial.comoSaldar(g), [CuentasSocial.Pago(de: "b", a: "a", centimos: 1000), CuentasSocial.Pago(de: "c", a: "a", centimos: 1000)])
        let t = CuentasSocial.totales(g, yo: "yo")
        XCTAssertEqual(t, CuentasSocial.Totales(total: 3000, mio: 1000, saldo: 2000))

        let pago = SocialGasto(id: "2", tipo: "transferencia", titulo: "Pago para saldar", centimos: 1000, pagadoPor: "b", modo: "importes",
                               reparto: [SocialParte(miembro: "a", centimos: 1000)], fecha: "2026-11-21", categoria: nil)
        let g2 = grupo([cena, pago])
        XCTAssertEqual(CuentasSocial.comoSaldar(g2), [CuentasSocial.Pago(de: "c", a: "a", centimos: 1000)])
        XCTAssertEqual(CuentasSocial.totales(g2, yo: "yo").total, 3000)
        XCTAssertEqual(CuentasSocial.numGastos(g2), 1)
    }

    func testIngresoRestaYTextos() {
        let ingreso = SocialGasto(id: "1", tipo: "ingreso", titulo: "Fianza", centimos: 600, pagadoPor: "a", modo: "igual",
                                  reparto: [SocialParte(miembro: "a", centimos: 300), SocialParte(miembro: "b", centimos: 300)],
                                  fecha: "2026-11-20", categoria: nil)
        XCTAssertEqual(CuentasSocial.saldos(grupo([ingreso])), ["a": -300, "b": 300, "c": 0])
        XCTAssertEqual(CuentasSocial.textoSaldo(0), "estás en paz.")
        XCTAssertEqual(CuentasSocial.centimos("12,5"), 1250)
        XCTAssertNil(CuentasSocial.centimos("0"))
        XCTAssertEqual(CuentasSocial.nombre(grupo([]), "a", yo: "yo", amigos: []), "tú")
        XCTAssertEqual(CuentasSocial.nombre(grupo([]), "c", yo: "yo", amigos: [SocialAmigo(friendId: "u3", nombre: "Carlitos")]), "Carlitos")
    }

    func testEventoRecibidoSeValida() {
        XCTAssertEqual(CuentasSocial.eventoValido(["title": "Concierto", "date": "2026-12-01", "time": "21:00", "otro": "x"]),
                       ["title": "Concierto", "date": "2026-12-01", "time": "21:00"])
        XCTAssertNil(CuentasSocial.eventoValido(["title": "Sin fecha"]))
        XCTAssertNil(CuentasSocial.eventoValido(["title": "Raro", "date": "mañana"]))
        XCTAssertNil(CuentasSocial.eventoValido(["title": 3, "date": "2026-12-01"]))
        XCTAssertEqual(CuentasSocial.codigoAleatorio().count, 8)
    }
}
