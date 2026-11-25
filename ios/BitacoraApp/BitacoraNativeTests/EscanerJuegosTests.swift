import XCTest
@testable import BitacoraNative

final class EscanerJuegosTests: XCTestCase {
    func testCodigoDeJuegoNoAceptaISBN() {
        XCTAssertEqual(BuscarJuegoEAN.deCodigo("0045496420055"), "0045496420055")
        XCTAssertEqual(BuscarJuegoEAN.deCodigo("045496420055"), "045496420055")
        XCTAssertNil(BuscarJuegoEAN.deCodigo("9788437604947"))
        XCTAssertNil(BuscarJuegoEAN.deCodigo("12345"))
    }

    func testPlataforma() {
        XCTAssertEqual(BuscarJuegoEAN.plataforma(de: "Mario Kart 8 Deluxe (Nintendo Switch)"), "Switch")
        XCTAssertEqual(BuscarJuegoEAN.plataforma(de: "Mario Kart World - Nintendo Switch 2"), "Switch 2")
        XCTAssertEqual(BuscarJuegoEAN.plataforma(de: "Sony PS5 Astro Bot"), "PS5")
        XCTAssertEqual(BuscarJuegoEAN.plataforma(de: "God of War PlayStation 4"), "PS4")
        XCTAssertEqual(BuscarJuegoEAN.plataforma(de: "Halo Infinite Xbox Series X"), "Xbox Series")
        XCTAssertEqual(BuscarJuegoEAN.plataforma(de: "Tetris Effect"), "")
    }

    func testLimpiarTitulo() {
        XCTAssertEqual(BuscarJuegoEAN.limpiar("Nintendo Switch - Mario Kart 8 Deluxe (Videojuego) [PEGI 3]"), "Mario Kart 8 Deluxe")
        XCTAssertEqual(BuscarJuegoEAN.limpiar("Sony PS5 Astro Bot"), "Astro Bot")
        XCTAssertEqual(BuscarJuegoEAN.limpiar("The Legend of Zelda: Tears of the Kingdom - Switch"), "The Legend of Zelda: Tears of the Kingdom")
        XCTAssertEqual(BuscarJuegoEAN.limpiar("Halo Infinite - Xbox Series X|S"), "Halo Infinite")
    }
}
