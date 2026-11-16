import XCTest

// El carrusel de semanas de Inicio en el simulador (0.23): deslizar a la izquierda pasa a la semana siguiente y a la
// derecha vuelve, también con la recarga de Inicio que llega tarde y la sincronización de fondo (PruebaCarruselView).
final class CarruselUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-pruebaCarrusel"]
        app.launch()
    }

    private func semana() -> String { app.staticTexts["semana-cargada"].label }

    private func esperar(_ semana: String, _ archivo: StaticString = #filePath, _ linea: UInt = #line) {
        let el = app.staticTexts["semana-cargada"]
        let ok = NSPredicate(format: "label == %@", semana)
        let e = expectation(for: ok, evaluatedWith: el)
        if XCTWaiter.wait(for: [e], timeout: 5) != .completed {
            XCTFail("se esperaba la semana \(semana) y se ve \(el.label)", file: archivo, line: linea)
        }
    }

    func testDeslizarPasaDeSemanaYVuelve() {
        let carrusel = app.otherElements["carrusel-semanas"].firstMatch
        XCTAssertTrue(carrusel.waitForExistence(timeout: 10))
        esperar("2026-11-09")
        XCTAssertTrue(carrusel.label.contains("12"), carrusel.label)

        carrusel.swipeLeft()
        esperar("2026-11-16")
        carrusel.swipeLeft()
        esperar("2026-11-23")
        carrusel.swipeRight()
        esperar("2026-11-16")
        carrusel.swipeRight()
        carrusel.swipeRight()
        esperar("2026-11-02")
        // La sincronización de fondo no devuelve el carrusel a la semana de antes.
        sleep(2)
        XCTAssertEqual(semana(), "2026-11-02")
        // El día de la semana se conserva (jueves).
        XCTAssertTrue(carrusel.label.contains("5"), carrusel.label)
    }
}

