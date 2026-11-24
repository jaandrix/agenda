import XCTest
@testable import BitacoraNative

// 3.1: Coleccionables, Etiquetas y Conexiones. Operaciones nuevas idempotentes que respetan lo ajeno, y las lecturas
// como coleccionables.js, renderTagsView y construirConexiones.
final class ColeccionesEtiquetasTests: XCTestCase {
    private func doc(_ json: String) throws -> DocumentoBitacora { try DocumentoBitacora(datos: Data(json.utf8)) }
    private func lista(_ d: DocumentoBitacora, _ k: String) -> [JSONValue] { (((try? d.valor(de: k)) ?? nil)?.lista) ?? [] }

    func testColeccionableNuevoConCategoriasPorDefectoYCarta() throws {
        let d = try doc(#"{"otra":1}"#)
        let op = ColeccionesOp.guardar(id: "coll_1", nombre: " Charizard ", categoria: "cat_cartas", valor: "12,50", creado: "2026-11-24T10:00:00Z",
                                       set: "Base Set", numero: "4/102", anio: "1999", estado: "Near Mint")
        let (r, parche) = AplicarOperaciones.sobre(d, [op])
        XCTAssertEqual(Set(parche.keys), ["collectibles", "collectibleCategories"])
        XCTAssertEqual(lista(r, "collectibleCategories").compactMap { $0["id"]?.texto }, ["cat_cartas", "cat_videojuegos"])
        let (piezas, cats) = LecturaColecciones.leer(r)
        XCTAssertEqual(cats.count, 2)
        XCTAssertEqual(piezas.first?.nombre, "Charizard")
        XCTAssertEqual(piezas.first?.valor, Decimal(string: "12.5"))
        XCTAssertEqual(piezas.first?.anio, "1999")
        XCTAssertEqual(lista(r, "collectibles").first?["carta"]?["anio"], .number("1999"))
        XCTAssertTrue(AplicarOperaciones.sobre(r, [op]).1.isEmpty)
    }

    func testEditarConservaCamposAjenosYCartaEscondida() throws {
        let d = try doc(#"{"collectibleCategories":[{"id":"cat_cartas","name":"Cartas"},{"id":"cat_fig","name":"Figuras"}],"collectibles":[{"id":"c1","name":"Pikachu","category":"cat_cartas","value":3,"createdAt":"x","mercadoId":"base1-58","carta":{"set":"Base"}}]}"#)
        let (r, parche) = AplicarOperaciones.sobre(d, [ColeccionesOp.guardar(id: "c1", nombre: "Pikachu", categoria: "cat_fig", valor: "5", creado: "y")])
        XCTAssertEqual(Array(parche.keys), ["collectibles"])
        let o = lista(r, "collectibles")[0]
        XCTAssertEqual(o["category"]?.texto, "cat_fig")
        XCTAssertEqual(o["mercadoId"]?.texto, "base1-58")
        XCTAssertEqual(o["carta"]?["set"]?.texto, "Base")
        XCTAssertEqual(o["createdAt"]?.texto, "x")
        // Mismo valor escrito distinto: no cambia nada.
        XCTAssertTrue(AplicarOperaciones.sobre(r, [ColeccionesOp.guardar(id: "c1", nombre: "Pikachu", categoria: "cat_fig", valor: "5,00", creado: "y")]).1.isEmpty)
        // Categoría que no existe: no se guarda.
        XCTAssertTrue(AplicarOperaciones.sobre(r, [ColeccionesOp.guardar(id: "c2", nombre: "X", categoria: "nada", valor: "1", creado: "y")]).1.isEmpty)
        let (r2, _) = AplicarOperaciones.sobre(r, [ColeccionesOp.quitar(id: "c1")])
        XCTAssertTrue(lista(r2, "collectibles").isEmpty)
        XCTAssertTrue(AplicarOperaciones.sobre(r2, [ColeccionesOp.quitar(id: "c1")]).1.isEmpty)
    }

    func testCategoriaSinRepetirNombre() throws {
        let d = try doc(#"{"collectibleCategories":[{"id":"cat_cartas","name":"Cartas"}]}"#)
        let (r, _) = AplicarOperaciones.sobre(d, [ColeccionesOp.categoria(id: "cat_v", nombre: "Vinilos")])
        XCTAssertEqual(lista(r, "collectibleCategories").count, 2)
        XCTAssertTrue(AplicarOperaciones.sobre(r, [ColeccionesOp.categoria(id: "cat_otra", nombre: "vinilos")]).1.isEmpty)
        let (r2, _) = AplicarOperaciones.sobre(r, [ColeccionesOp.categoria(id: "cat_v", nombre: "Discos")])
        XCTAssertEqual(lista(r2, "collectibleCategories")[1]["name"]?.texto, "Discos")
    }

    private let conEtiquetas = #"{"entries":[{"id":"a","type":"book","title":"Libro","tags":["viaje/japón","leer"],"rating":4},{"id":"b","type":"travel","title":"Tokio","tags":["viaje/japón","viaje"]},{"id":"c","type":"event","title":"Cena","tags":["leer"]}]}"#

    func testGruposDeEtiquetas() throws {
        let e = EntradaSuelta.leer(try doc(conEtiquetas))
        let g = LecturaEtiquetas.grupos(e)
        XCTAssertEqual(g.map(\.ruta), ["leer", "viaje"])
        XCTAssertEqual(g[1].entradas.map(\.id), ["a", "b"])
        XCTAssertEqual(g[1].hijas, ["viaje/japón"])
        XCTAssertEqual(LecturaEtiquetas.grupos(e, busqueda: "JAPON").map(\.ruta), ["viaje"])
        XCTAssertEqual(TipoEntrada.desglose(g[0].entradas), "1 libro, 1 evento")
    }

    func testRenombrarEliminarYQuitarEtiqueta() throws {
        let d = try doc(conEtiquetas)
        let (r, parche) = AplicarOperaciones.sobre(d, [EtiquetasOp.renombrar("viaje/japón", a: "viaje")])
        XCTAssertEqual(Array(parche.keys), ["entries"])
        XCTAssertEqual(lista(r, "entries")[0]["tags"], .array([.string("viaje"), .string("leer")]))
        XCTAssertEqual(lista(r, "entries")[1]["tags"], .array([.string("viaje")]))
        XCTAssertEqual(lista(r, "entries")[0]["rating"], .number("4"))
        XCTAssertTrue(AplicarOperaciones.sobre(r, [EtiquetasOp.renombrar("viaje/japón", a: "viaje")]).1.isEmpty)
        let (r2, _) = AplicarOperaciones.sobre(r, [EtiquetasOp.quitar("leer", de: "a")])
        XCTAssertEqual(lista(r2, "entries")[0]["tags"], .array([.string("viaje")]))
        XCTAssertEqual(lista(r2, "entries")[2]["tags"], .array([.string("leer")]))
        let (r3, _) = AplicarOperaciones.sobre(r2, [EtiquetasOp.eliminar("viaje")])
        XCTAssertTrue(lista(r3, "entries").allSatisfy { ($0["tags"]?.lista ?? []).allSatisfy { $0.texto != "viaje" } })
    }

    func testConexiones() throws {
        let d = try doc(#"""
        {"entries":[
          {"id":"t1","type":"travel","title":"Lisboa","startDate":"2026-05-01","endDate":"2026-05-04","companions":"Marta y Luis"},
          {"id":"e1","type":"event","eventType":"futbol","title":"Real Zaragoza - Huesca","date":"2026-05-02","place":"La Romareda","notes":"con Marta"},
          {"id":"e2","type":"event","eventType":"futbol","title":"Huesca vs Eibar","date":"2026-06-01","place":"La Romareda"},
          {"id":"e3","type":"event","title":"Examen de Física","date":"2026-06-10","notes":"repasar [[Lisboa]]"},
          {"id":"planner_done_x","type":"event","title":"Completado: Huesca vs Eibar","date":"2026-06-01"}
        ],"studies":{"subjects":[{"id":"s1","name":"Física.","exams":[{}],"assignments":[]}]}}
        """#)
        let c = LecturaConexiones.centros(d)
        let porId = Dictionary(uniqueKeysWithValues: c.map { ($0.id, $0) })
        XCTAssertEqual(porId["viaje:t1"]?.items.map(\.id), ["e1"])
        XCTAssertEqual(porId["viaje:t1"]?.entradaTipo, "travel")
        XCTAssertEqual(porId["equipo:huesca"]?.items.map(\.id), ["e1", "e2"])
        XCTAssertNil(porId["equipo:eibar"])
        XCTAssertEqual(porId["persona:marta"]?.items.map(\.id), ["t1", "e1"])
        XCTAssertEqual(porId["lugar:la romareda"]?.items.count, 2)
        XCTAssertEqual(porId["asignatura:s1"]?.nombre, "Física")
        XCTAssertEqual(porId["asignatura:s1"]?.items.map(\.id), ["e3"])
        XCTAssertEqual(porId["enlace:e3"]?.items.map(\.id), ["t1"])
        XCTAssertFalse(c.contains { $0.items.contains { $0.id.hasPrefix("planner_done_") } })
        XCTAssertEqual(LecturaConexiones.principal(c)?.id, "equipo:huesca")
    }
}
