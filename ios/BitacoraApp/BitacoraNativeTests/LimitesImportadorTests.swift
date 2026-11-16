import XCTest
@testable import BitacoraNative

// 0.23 (auditoría P0): el importador no reserva memoria según lo que declara un ZIP ni lee archivos enormes.
final class LimitesImportadorTests: XCTestCase {
    // ZIP mínimo con una entrada guardada sin comprimir; `declarado` es el tamaño descomprimido que dice tener.
    private func zip(nombre: String, contenido: [UInt8], declarado: UInt32? = nil, metodo: UInt16 = 0) -> Data {
        func u16(_ v: UInt16) -> [UInt8] { [UInt8(v & 0xff), UInt8(v >> 8)] }
        func u32(_ v: UInt32) -> [UInt8] { [UInt8(v & 0xff), UInt8((v >> 8) & 0xff), UInt8((v >> 16) & 0xff), UInt8(v >> 24)] }
        let n = Array(nombre.utf8), tam = declarado ?? UInt32(contenido.count)
        var b: [UInt8] = u32(0x04034b50) + u16(20) + u16(0) + u16(metodo) + u16(0) + u16(0) + u32(0)
        b += u32(UInt32(contenido.count)) + u32(tam) + u16(UInt16(n.count)) + u16(0) + n + contenido
        let central = b.count
        b += u32(0x02014b50) + u16(20) + u16(20) + u16(0) + u16(metodo) + u16(0) + u16(0) + u32(0)
        b += u32(UInt32(contenido.count)) + u32(tam) + u16(UInt16(n.count)) + u16(0) + u16(0) + u16(0) + u16(0) + u32(0) + u32(0) + n
        let finCentral = b.count
        b += u32(0x06054b50) + u16(0) + u16(0) + u16(1) + u16(1) + u32(UInt32(finCentral - central)) + u32(UInt32(central)) + u16(0)
        return Data(b)
    }

    func testUnTamanoDeclaradoDe4GBSeRechazaSinReservarlo() {
        let d = zip(nombre: "xl/worksheets/sheet1.xml", contenido: Array("<x/>".utf8), declarado: 0xFFFF_FFF0, metodo: 8)
        XCTAssertThrowsError(try LectorExtracto.leer(d, nombre: "a.xlsx")) { XCTAssertEqual($0 as? LectorExtracto.Fallo, .grande) }
    }

    func testUnaRelacionDeCompresionExageradaSeRechaza() {
        let d = zip(nombre: "xl/worksheets/sheet1.xml", contenido: Array("<x/>".utf8), declarado: 4 * 101, metodo: 8)
        XCTAssertThrowsError(try LectorExtracto.leer(d, nombre: "a.xlsx")) { XCTAssertEqual($0 as? LectorExtracto.Fallo, .grande) }
    }

    func testUnaColumnaExtremaSeRechaza() {
        let hoja = #"<worksheet><sheetData><row r="1"><c r="ZZZ1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>"#
        let d = zip(nombre: "xl/worksheets/sheet1.xml", contenido: Array(hoja.utf8))
        XCTAssertThrowsError(try LectorExtracto.leer(d, nombre: "a.xlsx")) { XCTAssertEqual($0 as? LectorExtracto.Fallo, .demasiado) }
    }

    func testUnExcelPequenoSeSigueLeyendo() throws {
        let hoja = #"<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>fecha</t></is></c><c r="B1"><v>12.5</v></c></row></sheetData></worksheet>"#
        let s = try LectorExtracto.leer(zip(nombre: "xl/worksheets/sheet1.xml", contenido: Array(hoja.utf8)), nombre: "a.xlsx")
        XCTAssertEqual(s, #"[["fecha","12.5"]]"#)
    }

    func testUnZipTruncadoNoRompe() {
        let d = zip(nombre: "xl/worksheets/sheet1.xml", contenido: Array("<x/>".utf8)).prefix(30)
        XCTAssertThrowsError(try LectorExtracto.leer(Data(d), nombre: "a.xlsx"))
    }

    func testUnTextoDemasiadoGrandeSeRechaza() {
        let d = Data(repeating: 0x41, count: LectorExtracto.maxTexto + 1)
        XCTAssertThrowsError(try LectorExtracto.leer(d, nombre: "a.csv")) { XCTAssertEqual($0 as? LectorExtracto.Fallo, .grande) }
    }
}
