import XCTest
@testable import BitacoraNative

final class JSONTests: XCTestCase {
    func testLeeTodosLosTipos() throws {
        let v = try LectorJSON.valor(Data(#"{"a":1,"b":-2.50,"c":"hóla \"x\" 😀","d":[true,false,null],"e":{},"f":1e3}"#.utf8))
        XCTAssertEqual(v["a"], .number("1"))
        XCTAssertEqual(v["b"], .number("-2.5"))
        XCTAssertEqual(v["c"], .string("hóla \"x\" 😀"))
        XCTAssertEqual(v["d"], .array([.bool(true), .bool(false), .null]))
        XCTAssertEqual(v["e"], .object([:]))
        XCTAssertEqual(v["f"], .number("1000"))
    }

    func testNumerosConservanSuTexto() throws {
        let v = try LectorJSON.valor(Data(#"[0.1, 12345678901234567890, 19.99]"#.utf8))
        XCTAssertEqual(EscritorJSON.texto(v), "[0.1,12345678901234567890,19.99]")
    }

    func testIdaYVuelta() throws {
        let texto = #"{"x":"línea\nnueva\t\u0001","y":[1,{"z":null}]}"#
        let v = try LectorJSON.valor(Data(texto.utf8))
        XCTAssertEqual(try LectorJSON.valor(EscritorJSON.datos(v)), v)
    }

    func testRechazaJSONRoto() {
        XCTAssertThrowsError(try LectorJSON.valor(Data(#"{"a":}"#.utf8)))
        XCTAssertThrowsError(try LectorJSON.valor(Data(#"{"a":1} x"#.utf8)))
        XCTAssertThrowsError(try LectorJSON.valor(Data(#"[1,]"#.utf8)))
        XCTAssertThrowsError(try LectorJSON.valor(Data(#""sin cerrar"#.utf8)))
    }
}

final class DocumentoTests: XCTestCase {
    // Formato real de PostgREST para jsonb: espacios tras «:» y «,».
    let crudo = Data(#"{"entries": [{"id": "e1", "amount": 10.10}], "claveDelFuturo": {"nueva": [1, 2]}, "apuntes": [{"id": 1}], "_meta": {"lastSnapshotWeek": "2026-W45"}, "dayPlanner": {"days": {}, "backlog": []}}"#.utf8)

    func testConservaClavesDesconocidasByteAByte() throws {
        let doc = try DocumentoBitacora(datos: crudo)
        XCTAssertEqual(doc.claves, ["entries", "claveDelFuturo", "apuntes", "_meta", "dayPlanner"])
        XCTAssertEqual(doc.clavesDesconocidas, ["claveDelFuturo"])
        XCTAssertEqual(String(data: doc.bytes(de: "claveDelFuturo")!, encoding: .utf8), #"{"nueva": [1, 2]}"#)
        XCTAssertTrue(doc.conservaTodoAlReescribir())
        let otra = try DocumentoBitacora(datos: doc.serializado())
        XCTAssertEqual(otra, doc)
    }

    func testParcheSoloTocaSuClave() throws {
        let doc = try DocumentoBitacora(datos: crudo)
        let nuevo = doc.aplicandoParche(["dayPlanner": .object(["days": .object([:]), "backlog": .array([.object(["id": .string("b1")])])])])
        for k in ["entries", "claveDelFuturo", "apuntes", "_meta"] {
            XCTAssertEqual(nuevo.bytes(de: k), doc.bytes(de: k), k)
        }
        XCTAssertEqual(try nuevo.valor(de: "dayPlanner")?["backlog"]?.lista?.count, 1)
        XCTAssertTrue(nuevo.conservaTodoAlReescribir())
    }

    func testClaveRepetidaSeQuedaConLaUltima() throws {
        let doc = try DocumentoBitacora(datos: Data(#"{"a": 1, "a": 2}"#.utf8))
        XCTAssertEqual(doc.claves, ["a"])
        XCTAssertEqual(try doc.valor(de: "a"), .number("2"))
    }

    func testDatosConIndicesQueNoEmpiezanEnCero() throws {
        let todo = Data("xx".utf8) + crudo
        let trozo = todo[2...]
        XCTAssertEqual(try DocumentoBitacora(datos: trozo), try DocumentoBitacora(datos: crudo))
    }

    func testExtraeLaFilaDePostgrest() throws {
        let respuesta = Data(#"[{"data": {"userName": "a", "x": [1]}, "updated_at": "2026-11-06T10:00:00.123+00:00"}]"#.utf8)
        let fila = try XCTUnwrap(RemotoSupabase.extraer(respuesta))
        XCTAssertEqual(String(data: fila.datos, encoding: .utf8), #"{"userName": "a", "x": [1]}"#)
        XCTAssertEqual(fila.actualizado, "2026-11-06T10:00:00.123+00:00")
        XCTAssertNil(try RemotoSupabase.extraer(Data("[]".utf8)))
    }

    func testContratoSinRepetidas() {
        XCTAssertEqual(Set(ContratoDatos.sincronizadas).count, ContratoDatos.sincronizadas.count)
        XCTAssertTrue(ContratoDatos.todas.contains("apuntes"))
        XCTAssertTrue(ContratoDatos.todas.contains("_meta"))
    }
}

final class FusionTests: XCTestCase {
    func v(_ s: String) -> JSONValue { try! LectorJSON.valor(Data(s.utf8)) }

    func testSoloCambioLocalGana() {
        XCTAssertEqual(Fusion.tresBandas(base: v("1"), local: v("2"), nube: v("1")), v("2"))
    }

    func testSoloCambioEnNubeGana() {
        XCTAssertEqual(Fusion.tresBandas(base: v("1"), local: v("1"), nube: v("3")), v("3"))
    }

    func testObjetosSeMezclanCampoACampo() {
        let r = Fusion.tresBandas(base: v(#"{"a":1,"b":1}"#), local: v(#"{"a":2,"b":1}"#), nube: v(#"{"a":1,"b":3}"#))
        XCTAssertEqual(r, v(#"{"a":2,"b":3}"#))
    }

    func testListasPorId() {
        let base = v(#"[{"id":"1","t":"a"},{"id":"2","t":"b"},{"id":"3","t":"c"}]"#)
        let local = v(#"[{"id":"1","t":"A"},{"id":"2","t":"b"},{"id":"3","t":"c"},{"id":"4","t":"nuevo local"}]"#)
        let nube = v(#"[{"id":"1","t":"a"},{"id":"3","t":"c"},{"id":"5","t":"nuevo nube"}]"#)
        // 1 cambiado aquí, 2 borrado en la nube, 4 y 5 nuevos en cada lado.
        XCTAssertEqual(Fusion.tresBandas(base: base, local: local, nube: nube),
                       v(#"[{"id":"1","t":"A"},{"id":"3","t":"c"},{"id":"4","t":"nuevo local"},{"id":"5","t":"nuevo nube"}]"#))
    }

    func testBorradoPierdeSiElOtroLadoLoCambio() {
        let base = v(#"[{"id":1,"t":"a"}]"#)
        let local = v(#"[{"id":1,"t":"cambiado"}]"#)
        let nube = v(#"[{"id":2,"t":"otro"}]"#)
        XCTAssertEqual(Fusion.tresBandas(base: base, local: local, nube: nube), v(#"[{"id":1,"t":"cambiado"},{"id":2,"t":"otro"}]"#))
    }

    func testUndefinedYNullSonDistintos() {
        XCTAssertEqual(Fusion.tresBandas(base: nil, local: nil, nube: .null), .null)
        XCTAssertNil(Fusion.tresBandas(base: .null, local: nil, nube: .null))
    }

    func testEsIdempotente() {
        let base = v(#"{"a":[{"id":"1","x":1}]}"#), local = v(#"{"a":[{"id":"1","x":2}]}"#), nube = v(#"{"a":[{"id":"1","x":1}],"b":true}"#)
        let r = Fusion.tresBandas(base: base, local: local, nube: nube)
        XCTAssertEqual(Fusion.tresBandas(base: base, local: r, nube: nube), r)
    }
}

final class FechasTests: XCTestCase {
    let cal = CalendarioBitacora.madrid

    func instante(_ s: String) -> Date { ISO8601DateFormatter().date(from: s)! }

    func testDiaLogicoCambiaALas4() {
        XCTAssertEqual(cal.diaLogico(instante("2026-11-06T03:59:00+01:00")).iso, "2026-11-05")
        XCTAssertEqual(cal.diaLogico(instante("2026-11-06T04:00:00+01:00")).iso, "2026-11-06")
        XCTAssertEqual(cal.diaLogico(instante("2026-11-06T04:00:00+01:00"), desplazamiento: 2).iso, "2026-11-08")
    }

    func testCambioAHorarioDeVerano() {
        // 29-03-2026: a las 2:00 pasan a ser las 3:00 en Madrid.
        XCTAssertEqual(cal.diaLogico(instante("2026-03-29T03:30:00+02:00")).iso, "2026-03-28")
        XCTAssertEqual(cal.diaLogico(instante("2026-03-29T04:00:00+02:00")).iso, "2026-03-29")
    }

    func testCambioAHorarioDeInvierno() {
        // 25-10-2026: a las 3:00 vuelven a ser las 2:00.
        XCTAssertEqual(cal.diaLogico(instante("2026-10-25T02:30:00+02:00")).iso, "2026-10-24")
        XCTAssertEqual(cal.diaLogico(instante("2026-10-25T02:30:00+01:00")).iso, "2026-10-24")
        XCTAssertEqual(cal.diaLogico(instante("2026-10-25T04:00:00+01:00")).iso, "2026-10-25")
    }

    func testMedianocheUTCNoCambiaElDia() {
        // 00:30 en Madrid son las 23:30 UTC del día anterior; el día civil es el de Madrid.
        XCTAssertEqual(cal.dia(de: instante("2026-07-01T00:30:00+02:00")).iso, "2026-07-01")
    }

    func testDiasCiviles() {
        XCTAssertNil(LocalDay(iso: "2026-02-30"))
        XCTAssertNil(LocalDay(iso: "2026-2-3"))
        XCTAssertEqual(LocalDay(iso: "2028-02-28")!.sumando(dias: 1).iso, "2028-02-29")
        XCTAssertEqual(LocalDay(iso: "2026-12-31")!.sumando(dias: 1).iso, "2027-01-01")
        XCTAssertEqual(LocalDay(iso: "2026-03-29")!.sumando(dias: -1).iso, "2026-03-28")
        XCTAssertEqual(YearMonth(iso: "2026-11")?.iso, "2026-11")
        XCTAssertNil(YearMonth(iso: "2026-13"))
    }
}

final class DineroTests: XCTestCase {
    func testLeeNumeroYCadenas() {
        XCTAssertEqual(Dinero.decimal(.number("12.5")), Decimal(string: "12.5"))
        XCTAssertEqual(Dinero.decimal(.string("12,50")), Decimal(string: "12.5"))
        XCTAssertEqual(Dinero.decimal(.string("1.200,50")), Decimal(string: "1200.5"))
        XCTAssertEqual(Dinero.decimal(.string("-3")), Decimal(-3))
        XCTAssertNil(Dinero.decimal(.string("abc")))
        XCTAssertNil(Dinero.decimal(.string("")))
        XCTAssertNil(Dinero.decimal(.string("1.2.3")))
        XCTAssertNil(Dinero.decimal(.null))
    }

    func testSumaSinErroresDeComaFlotante() {
        let suma = [Dinero.decimal(.number("0.1"))!, Dinero.decimal(.number("0.2"))!].reduce(0, +)
        XCTAssertEqual(suma, Decimal(string: "0.3"))
    }

    func testRedondeoBancario() {
        XCTAssertEqual(Dinero.redondeado(Decimal(string: "2.345")!), Decimal(string: "2.34"))
        XCTAssertEqual(Dinero.redondeado(Decimal(string: "2.355")!), Decimal(string: "2.36"))
    }
}

final class EnlacesTests: XCTestCase {
    func testApuntar() {
        XCTAssertEqual(EnlaceProfundo.interpretar(URL(string: "bitacora://apuntar?texto=cena%20el%20viernes")!), .apuntar(texto: "cena el viernes", url: nil))
        XCTAssertEqual(EnlaceProfundo.interpretar(URL(string: "bitacoradev://apuntar?url=https://a.es/x")!), .apuntar(texto: "", url: "https://a.es/x"))
    }

    func testRechazaLoQueNoToca() {
        XCTAssertNil(EnlaceProfundo.interpretar(URL(string: "otra://apuntar?texto=x")!))
        XCTAssertNil(EnlaceProfundo.interpretar(URL(string: "bitacora://borrar?id=1")!))
        XCTAssertNil(EnlaceProfundo.interpretar(URL(string: "bitacora://apuntar")!))
        XCTAssertNil(EnlaceProfundo.interpretar(URL(string: "bitacora://apuntar?url=javascript:alert(1)")!))
        XCTAssertNil(EnlaceProfundo.interpretar(URL(string: "bitacora://quick?type=transfer")!))
        let largo = String(repeating: "a", count: EnlaceProfundo.maxTexto + 1)
        XCTAssertNil(EnlaceProfundo.interpretar(URL(string: "bitacora://apuntar?texto=\(largo)")!))
    }

    func testRapido() {
        XCTAssertEqual(EnlaceProfundo.interpretar(URL(string: "bitacora://quick?type=income")!), .rapido(.income))
    }

    func testColaPersiste() {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".json")
        let cola = ColaIntenciones(url: url)
        cola.guardar([.rapido(.expense), .apuntar(texto: "a", url: nil)])
        XCTAssertEqual(ColaIntenciones(url: url).leer(), [.rapido(.expense), .apuntar(texto: "a", url: nil)])
    }
}

final class PlanificadorTests: XCTestCase {
    func testHoyConArrastradasYSinDia() throws {
        let doc = try DocumentoBitacora(datos: Data(#"""
        {"dayPlanner": {"days": {
            "2026-11-04": [{"id": "v1", "title": "vieja hecha", "done": true}, {"id": "v2", "title": "vieja pendiente", "done": false}],
            "2026-11-06": [{"id": "h1", "title": "tarde", "time": "18:00", "done": false}, {"id": "h2", "title": "mañana", "time": "09:30", "done": true}],
            "2026-11-07": [{"id": "m1", "title": "de mañana"}]
        }, "backlog": [{"id": "b1", "title": "x"}, {"id": "b2", "title": "y", "done": true}]}}
        """#.utf8))
        let ahora = ISO8601DateFormatter().date(from: "2026-11-06T12:00:00+01:00")!
        let v = LecturaPlanificador.hoy(doc, ahora: ahora)
        XCTAssertEqual(v.dia.iso, "2026-11-06")
        XCTAssertEqual(v.tareas.map(\.id), ["v2", "h2", "h1"])
        XCTAssertTrue(v.tareas[0].arrastrada)
        XCTAssertEqual(v.sinDia, 1)
    }
}

final class AlmacenTests: XCTestCase {
    func testGuardaYBorraPorUsuario() async throws {
        let raiz = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let a = AlmacenLocal(raiz: raiz)
        try await a.guardarBase(Data(#"{"x": 1}"#.utf8), uid: "abc-123")
        try await a.actualizarEstado(uid: "abc-123") { $0.actualizadoNube = "hoy" }
        let base = await a.leerBase(uid: "abc-123")
        let estado = await a.estado(uid: "abc-123")
        XCTAssertEqual(base, Data(#"{"x": 1}"#.utf8))
        XCTAssertEqual(estado.actualizadoNube, "hoy")
        XCTAssertEqual(estado.pendientes, [])
        await a.borrarUsuario("abc-123")
        let tras = await a.leerBase(uid: "abc-123")
        XCTAssertNil(tras)
    }

    func testUidNoSaleDeLaCarpeta() async throws {
        let raiz = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let a = AlmacenLocal(raiz: raiz)
        try await a.guardarBase(Data("{}".utf8), uid: "../../fuera")
        XCTAssertFalse(FileManager.default.fileExists(atPath: raiz.deletingLastPathComponent().appendingPathComponent("fuera").path))
    }
}
