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

    // 0.26 (F-09): varias entradas sin comprimir en un mismo ZIP.
    private func zipVarios(_ entradas: [(String, String)]) -> Data {
        func u16(_ v: UInt16) -> [UInt8] { [UInt8(v & 0xff), UInt8(v >> 8)] }
        func u32(_ v: UInt32) -> [UInt8] { [UInt8(v & 0xff), UInt8((v >> 8) & 0xff), UInt8((v >> 16) & 0xff), UInt8(v >> 24)] }
        var b: [UInt8] = [], central: [UInt8] = []
        for (nombre, texto) in entradas {
            let n = Array(nombre.utf8), c = Array(texto.utf8), local = UInt32(b.count)
            b += u32(0x04034b50) + u16(20) + u16(0) + u16(0) + u16(0) + u16(0) + u32(0)
            b += u32(UInt32(c.count)) + u32(UInt32(c.count)) + u16(UInt16(n.count)) + u16(0) + n + c
            central += u32(0x02014b50) + u16(20) + u16(20) + u16(0) + u16(0) + u16(0) + u16(0) + u32(0)
            central += u32(UInt32(c.count)) + u32(UInt32(c.count)) + u16(UInt16(n.count)) + u16(0) + u16(0) + u16(0) + u16(0) + u32(0) + u32(local) + n
        }
        let inicio = UInt32(b.count)
        b += central
        b += u32(0x06054b50) + u16(0) + u16(0) + u16(UInt16(entradas.count)) + u16(UInt16(entradas.count)) + u32(UInt32(central.count)) + u32(inicio) + u16(0)
        return Data(b)
    }

    func testElLibroUsaLaHojaDeMovimientosVisibleYLasFechasDe1904() throws {
        let libro = #"<workbook xmlns:r="r"><workbookPr date1904="1"/><sheets><sheet name="Portada" sheetId="1" r:id="rId1"/><sheet name="Oculta" sheetId="2" state="hidden" r:id="rId2"/><sheet name="Movimientos" sheetId="3" r:id="rId3"/></sheets></workbook>"#
        let rels = #"<Relationships><Relationship Id="rId1" Target="worksheets/sheet3.xml"/><Relationship Id="rId2" Target="worksheets/sheet1.xml"/><Relationship Id="rId3" Target="/xl/worksheets/sheet2.xml"/></Relationships>"#
        let portada = #"<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Banco</t></is></c></row></sheetData></worksheet>"#
        let oculta = #"<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Fecha</t></is></c><c r="B1" t="inlineStr"><is><t>Importe</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>mal</t></is></c></row></sheetData></worksheet>"#
        let datos = #"<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Fecha</t></is></c><c r="B1" t="inlineStr"><is><t>Importe</t></is></c></row><row r="2"><c r="A2" s="1"><v>45000</v></c><c r="B2"><v>-12.5</v></c></row></sheetData></worksheet>"#
        let estilos = #"<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>"#
        let d = zipVarios([("xl/workbook.xml", libro), ("xl/_rels/workbook.xml.rels", rels), ("xl/styles.xml", estilos),
                           ("xl/worksheets/sheet1.xml", oculta), ("xl/worksheets/sheet2.xml", datos), ("xl/worksheets/sheet3.xml", portada)])
        let s = try LectorExtracto.leer(d, nombre: "banco.xlsx")
        // 45000 en un libro de 1904 es el 16-03-2027 (en uno normal sería el 15-03-2023).
        XCTAssertEqual(s, #"[["Fecha","Importe"],["2027-03-16","-12.5"]]"#)
    }

    func testUnTextoDemasiadoGrandeSeRechaza() {
        let d = Data(repeating: 0x41, count: LectorExtracto.maxTexto + 1)
        XCTAssertThrowsError(try LectorExtracto.leer(d, nombre: "a.csv")) { XCTAssertEqual($0 as? LectorExtracto.Fallo, .grande) }
    }
}
