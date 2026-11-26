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
        XCTAssertEqual(BuscarJuegoEAN.plataforma(de: "Pokemon Y (Nintendo 3DS)"), "3DS")
        XCTAssertEqual(BuscarJuegoEAN.plataforma(de: "New Super Mario Bros - Nintendo DS"), "NDS")
        XCTAssertEqual(BuscarJuegoEAN.plataforma(de: "Gran Turismo 4 PS2"), "PS2")
        XCTAssertEqual(BuscarJuegoEAN.plataforma(de: "The Last of Us PlayStation 3"), "PS3")
        XCTAssertEqual(BuscarJuegoEAN.plataforma(de: "Crash Bandicoot PSX"), "PS1")
        XCTAssertEqual(BuscarJuegoEAN.plataforma(de: "Halo 3 Xbox 360"), "Xbox 360")
        XCTAssertEqual(BuscarJuegoEAN.plataforma(de: "Age of Empires II PC CD-ROM"), "PC")
    }

    func testLimpiarTitulo() {
        XCTAssertEqual(BuscarJuegoEAN.limpiar("Nintendo Switch - Mario Kart 8 Deluxe (Videojuego) [PEGI 3]"), "Mario Kart 8 Deluxe")
        XCTAssertEqual(BuscarJuegoEAN.limpiar("Sony PS5 Astro Bot"), "Astro Bot")
        XCTAssertEqual(BuscarJuegoEAN.limpiar("The Legend of Zelda: Tears of the Kingdom - Switch"), "The Legend of Zelda: Tears of the Kingdom")
        XCTAssertEqual(BuscarJuegoEAN.limpiar("Halo Infinite - Xbox Series X|S"), "Halo Infinite")
        XCTAssertEqual(BuscarJuegoEAN.limpiar("Pokemon Y (Nintendo 3DS)"), "Pokemon Y")
        XCTAssertEqual(BuscarJuegoEAN.limpiar("Gran Turismo 4 PS2"), "Gran Turismo 4")
        XCTAssertEqual(BuscarJuegoEAN.limpiar("Lords of the Fallen PS5"), "Lords of the Fallen")
        XCTAssertEqual(BuscarJuegoEAN.limpiar("Nintendo Switch: The Legend of Zelda: Breath of the Wild EU Version Region Free"),
                       "The Legend of Zelda: Breath of the Wild")
        XCTAssertEqual(BuscarJuegoEAN.limpiar("Gran Turismo 3 A-Spec PAL Standard Edition"), "Gran Turismo 3 A-Spec")
    }
}
