import XCTest
@testable import BitacoraNative

final class HisteresisSyncTests: XCTestCase {
    func testSoloSeEnsenaSiDuraYSeQuedaUnMinimo() {
        let t0 = Date(timeIntervalSince1970: 1000)
        XCTAssertNil(HisteresisSync.siguiente(real: .reposo, visible: .reposo, visibleDesde: t0, ahora: t0))
        let aparecer = HisteresisSync.siguiente(real: .trayendo, visible: .reposo, visibleDesde: .distantPast, ahora: t0)
        XCTAssertEqual(aparecer?.espera, HisteresisSync.aparecer)
        XCTAssertEqual(aparecer?.estado, .trayendo)
        let pronto = HisteresisSync.siguiente(real: .reposo, visible: .trayendo, visibleDesde: t0, ahora: t0.addingTimeInterval(0.2))
        XCTAssertEqual(pronto?.espera ?? 0, HisteresisSync.minimo - 0.2, accuracy: 0.001)
        let tarde = HisteresisSync.siguiente(real: .reposo, visible: .trayendo, visibleDesde: t0, ahora: t0.addingTimeInterval(5))
        XCTAssertEqual(tarde?.espera, 0)
    }

    func testElTiempoSoloCambiaSiCambiaLoQueSeVe() {
        let a = Tiempo(clave: "z", hora: Date(timeIntervalSince1970: 0), temp: 12.2, sensacion: nil, code: 0, esDia: true, dias: [])
        let b = Tiempo(clave: "z", hora: Date(timeIntervalSince1970: 1800), temp: 11.8, sensacion: 10, code: 0, esDia: true, dias: [])
        XCTAssertFalse(InicioView.cambiaTiempo(a, b))
        let c = Tiempo(clave: "z", hora: Date(), temp: 13, sensacion: nil, code: 0, esDia: true, dias: [])
        XCTAssertTrue(InicioView.cambiaTiempo(a, c))
        XCTAssertTrue(InicioView.cambiaTiempo(nil, a))
    }
}
