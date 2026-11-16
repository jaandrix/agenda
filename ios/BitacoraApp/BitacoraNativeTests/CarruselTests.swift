import XCTest
@testable import BitacoraNative

final class CarruselTests: XCTestCase {
    private func d(_ iso: String) -> LocalDay { LocalDay(iso: iso)! }

    // Jueves 12-11-2026, semana del lunes 9.
    func testUnPasoVaALaSemanaSiguienteConElMismoDiaDeLaSemana() {
        var e = EstadoCarrusel()
        let nuevo = e.paso(7, semanaInicio: d("2026-11-09"), dia: d("2026-11-12"))
        XCTAssertEqual(nuevo, d("2026-11-19"))
        XCTAssertEqual(e.lunesVisible(semanaInicio: d("2026-11-09")), d("2026-11-16"))
        e.llega(d("2026-11-19"))
        XCTAssertEqual(e, EstadoCarrusel())
        XCTAssertEqual(e.lunesVisible(semanaInicio: d("2026-11-16")), d("2026-11-16"))
    }

    // El fallo de la 0.19: dos pasos antes de que Inicio recargue tienen que avanzar dos semanas, y la respuesta vieja
    // no puede devolver el carrusel a la semana de antes.
    func testDosPasosSeguidosSinRecargaAvanzanDosSemanas() {
        var e = EstadoCarrusel()
        let inicio = d("2026-11-09"), dia = d("2026-11-12")
        XCTAssertEqual(e.paso(7, semanaInicio: inicio, dia: dia), d("2026-11-19"))
        XCTAssertEqual(e.paso(7, semanaInicio: inicio, dia: dia), d("2026-11-26"))
        XCTAssertEqual(e.lunesVisible(semanaInicio: inicio), d("2026-11-23"))
        e.llega(d("2026-11-19"))
        XCTAssertEqual(e.lunesVisible(semanaInicio: d("2026-11-16")), d("2026-11-23"))
        XCTAssertEqual(e.diaMarcado(dia: d("2026-11-19")), d("2026-11-26"))
        e.llega(d("2026-11-26"))
        XCTAssertNil(e.centro)
    }

    func testAtrasYAdelanteVuelveAlMismoDia() {
        var e = EstadoCarrusel()
        let inicio = d("2026-11-09"), dia = d("2026-11-15")
        XCTAssertEqual(e.paso(-7, semanaInicio: inicio, dia: dia), d("2026-11-08"))
        XCTAssertEqual(e.paso(7, semanaInicio: inicio, dia: dia), d("2026-11-15"))
        XCTAssertEqual(e.lunesVisible(semanaInicio: inicio), inicio)
    }

    // Lo que no pidió el carrusel (hoy a las 4:00, «ir a hoy.») manda sobre lo pedido.
    func testUnCambioDeFueraSueltaElCentro() {
        var e = EstadoCarrusel()
        _ = e.paso(7, semanaInicio: d("2026-11-09"), dia: d("2026-11-12"))
        e.llega(d("2026-11-13"))
        XCTAssertEqual(e, EstadoCarrusel())
    }

    func testTocarUnDiaLoMarcaYaYCentraSuSemana() {
        var e = EstadoCarrusel()
        e.tocar(d("2026-11-14"))
        XCTAssertEqual(e.diaMarcado(dia: d("2026-11-12")), d("2026-11-14"))
        XCTAssertEqual(e.lunesVisible(semanaInicio: d("2026-11-09")), d("2026-11-09"))
    }

    // 0.23: el scroll paginado avisa de la semana en la que se asienta; pide el mismo día de la semana.
    func testIrALaSemanaQueSeVePideElMismoDiaDeLaSemana() {
        var e = EstadoCarrusel()
        let inicio = d("2026-11-09"), dia = d("2026-11-12")
        XCTAssertNil(e.irA(lunes: inicio, semanaInicio: inicio, dia: dia))
        XCTAssertEqual(e.irA(lunes: d("2026-11-16"), semanaInicio: inicio, dia: dia), d("2026-11-19"))
        XCTAssertEqual(e.irA(lunes: d("2026-11-23"), semanaInicio: inicio, dia: dia), d("2026-11-26"))
        e.llega(d("2026-11-19"))
        XCTAssertEqual(e.lunesVisible(semanaInicio: d("2026-11-16")), d("2026-11-23"))
        XCTAssertNil(e.irA(lunes: d("2026-11-23"), semanaInicio: d("2026-11-16"), dia: d("2026-11-19")))
        XCTAssertEqual(e.irA(lunes: d("2026-11-16"), semanaInicio: d("2026-11-16"), dia: d("2026-11-19")), d("2026-11-19"))
    }

    // Las páginas no cambian al moverse cerca de hoy (ids estables): solo se rehacen cerca del borde.
    func testLasSemanasSonEstablesAlrededorDeHoy() {
        let hoy = d("2026-11-12")
        let a = EstadoCarrusel.semanas(hoy: hoy, visible: hoy)
        XCTAssertEqual(a, EstadoCarrusel.semanas(hoy: hoy, visible: d("2027-06-01")))
        XCTAssertEqual(a.count, 2 * EstadoCarrusel.alcance + 1)
        XCTAssertTrue(a.contains(d("2026-11-09")))
        XCTAssertTrue(a.allSatisfy { $0.indiceSemanaLunes == 0 })
        let lejos = d("2032-01-07")
        XCTAssertTrue(EstadoCarrusel.semanas(hoy: hoy, visible: lejos).contains(lejos.inicioSemanaLunes))
    }
}
