import XCTest
@testable import BitacoraNative

final class OcioBibliotecaTests: XCTestCase {
    private func doc(_ json: String) throws -> DocumentoBitacora { try DocumentoBitacora(datos: Data(json.utf8)) }
    private func entradas(_ d: DocumentoBitacora) -> [JSONValue] { ((try? d.valor(de: "entries")) ?? nil)?.lista ?? [] }

    func testDatosOcioGuardaIsbnPlataformaYFormatoSinTocarLoDemas() throws {
        let d = try doc(#"{"entries":[{"id":"b","type":"book","title":"Rayuela","raro":1},{"id":"g","type":"game","title":"Zelda"},{"id":"ev","type":"event","title":"x"}]}"#)
        let ops = [OcioDatosOp.op(id: "b", isbn: "978-84-376-0494-7"),
                   OcioDatosOp.op(id: "g", plataforma: "  Switch 2 ", formato: "fisico"),
                   OcioDatosOp.op(id: "ev", isbn: "9788437604947")]
        let (r, cambios) = AplicarOperaciones.sobre(d, ops)
        XCTAssertEqual(Set(cambios.keys), ["entries"])
        let l = entradas(r)
        XCTAssertEqual(l[0]["isbn"]?.texto, "9788437604947")
        XCTAssertEqual(l[0]["raro"], .number("1"))
        XCTAssertEqual(l[1]["platform"]?.texto, "Switch 2")
        XCTAssertEqual(l[1]["format"]?.texto, "fisico")
        XCTAssertNil(l[2]["isbn"])
        // Idempotente.
        XCTAssertTrue(AplicarOperaciones.sobre(r, ops).1.isEmpty)
        // Vacío quita; un formato desconocido también.
        let (r2, _) = AplicarOperaciones.sobre(r, [OcioDatosOp.op(id: "b", isbn: ""), OcioDatosOp.op(id: "g", plataforma: "", formato: "raro")])
        XCTAssertNil(entradas(r2)[0]["isbn"])
        XCTAssertNil(entradas(r2)[1]["platform"])
        XCTAssertNil(entradas(r2)[1]["format"])
        let v = LecturaOcio.vista(r).entradas
        XCTAssertEqual(v.first { $0.id == "g" }?.plataforma, "Switch 2")
        XCTAssertEqual(v.first { $0.id == "b" }?.isbn, "9788437604947")
    }

    func testPortadaSoloSiFaltaNoPisaLaQueHay() throws {
        let d = try doc(#"{"entries":[{"id":"a","type":"movie","title":"A","portada":"","portadaPendiente":true},{"id":"b","type":"movie","title":"B","portada":"https://ya.jpg"}]}"#)
        let (r, _) = AplicarOperaciones.sobre(d, [OcioDatosOp.op(id: "a", portadaSiFalta: "https://nueva.jpg"),
                                                  OcioDatosOp.op(id: "b", portadaSiFalta: "https://nueva.jpg")])
        XCTAssertEqual(entradas(r)[0]["portada"]?.texto, "https://nueva.jpg")
        XCTAssertNil(entradas(r)[0]["portadaPendiente"])
        XCTAssertEqual(entradas(r)[1]["portada"]?.texto, "https://ya.jpg")
    }

    func testIsbnLimpioYDeCodigo() {
        XCTAssertEqual(OcioDatosOp.isbnLimpio("84-376-0494-x"), "843760494X")
        XCTAssertEqual(OcioDatosOp.isbnLimpio("12345"), "")
        XCTAssertEqual(OcioDatosOp.isbnLimpio("X437604947"), "")
        XCTAssertEqual(BuscarISBN.deCodigo("9788437604947"), "9788437604947")
        XCTAssertNil(BuscarISBN.deCodigo("8412345678901"))
        XCTAssertEqual(BuscarISBN.anio("March 2005"), "2005")
    }

    func testMayusculaInicial() {
        XCTAssertEqual(MayusculaOcio.inicial("la invitación"), "La invitación")
        XCTAssertEqual(MayusculaOcio.inicial("  ¿quién es? "), "¿Quién es?")
        XCTAssertEqual(MayusculaOcio.inicial("iPhone 16"), "iPhone 16")
        XCTAssertEqual(MayusculaOcio.inicial("1984"), "1984")
        XCTAssertEqual(MayusculaOcio.inicial("El Quijote"), "El Quijote")
    }

    private func e(_ id: String, _ titulo: String, autor: String = "", anio: String = "", nota: Double = 0,
                   estado: String = "", fin: String = "", plataforma: String = "") -> EntradaOcio {
        EntradaOcio(id: id, tipo: "book", titulo: titulo, autor: autor, estado: estado, fechaInicio: "", fechaFin: fin, anio: anio,
                    valoracion: nota, notas: "", enlace: "", portada: "", plataforma: plataforma)
    }

    func testOrdenYFiltro() {
        let l = [e("1", "Zeta", autor: "Ana Ruiz", anio: "2001", nota: 5, estado: "Completado"),
                 e("2", "alfa", autor: "Juan Abad", anio: "1999", estado: "Por leer"),
                 e("3", "Beta", anio: "", nota: 3, fin: "2026-01-02")]
        XCTAssertEqual(BibliotecaOcio.ordenar(l, .alfabetico).map(\.id), ["2", "3", "1"])
        XCTAssertEqual(BibliotecaOcio.ordenar(l, .autor).map(\.id), ["2", "1", "3"])
        XCTAssertEqual(BibliotecaOcio.ordenar(l, .publicacion).map(\.id), ["1", "2", "3"])
        XCTAssertEqual(BibliotecaOcio.ordenar(l, .nota).map(\.id), ["1", "3", "2"])
        XCTAssertEqual(BibliotecaOcio.filtrar(l, .terminados).map(\.id), ["1", "3"])
        XCTAssertEqual(BibliotecaOcio.filtrar(l, .pendientes).map(\.id), ["2"])
        XCTAssertEqual(BibliotecaOcio.filtrar(l, .cinco).map(\.id), ["1"])
    }

    func testJuegosPorPlataforma() {
        let l = [e("1", "A", plataforma: "PS5"), e("2", "B", plataforma: "ps5"), e("3", "C"), e("4", "D", plataforma: "Switch")]
        let g = BibliotecaOcio.porPlataforma(l)
        XCTAssertEqual(g.map(\.plataforma), ["PS5", "Switch", ""])
        XCTAssertEqual(g.first?.entradas.count, 2)
        XCTAssertEqual(BibliotecaOcio.filtrar(l, .todos, plataforma: "Ps5").map(\.id), ["1", "2"])
    }

    func testMejorPortadaUsaAutorYAnio() {
        let r = [CandidataPortada(titulo: "Dune", anio: "2021", autor: "", imagen: "https://a"),
                 CandidataPortada(titulo: "Dune", anio: "1965", autor: "Frank Herbert", imagen: "https://b")]
        XCTAssertEqual(BuscarPortadas.mejor(r, titulo: "dune", autor: "Frank Herbert", anio: "1965")?.imagen, "https://b")
        XCTAssertEqual(BuscarPortadas.mejor(r, titulo: "dune")?.imagen, "https://a")
        XCTAssertNil(BuscarPortadas.mejor(r, titulo: "otra cosa"))
    }
}
