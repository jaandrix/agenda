import XCTest
@testable import BitacoraNative

// «apuntar.»: el intérprete del iPhone (js/apuntar.js en JavaScriptCore) da lo mismo que la web en todo el banco dorado
// (pruebas/apuntar-casos.json, que saca pruebas/apuntar-casos.mjs de la web), y cada tipo se crea, se reaplica sin
// repetirse y se deshace quitando solo lo suyo.
final class ApuntarTests: XCTestCase {
    struct Banco: Decodable {
        struct Caso: Decodable { let frase: String; let cosas: [ApunteInterpretado] }
        let ahora: [Int]
        let contexto: ContextoApuntar
        let casos: [Caso]
    }

    static let raiz = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    func banco() throws -> Banco {
        try JSONDecoder().decode(Banco.self, from: Data(contentsOf: Self.raiz.appendingPathComponent("pruebas/apuntar-casos.json")))
    }

    func interprete(_ b: Banco) async throws -> InterpreteApuntar {
        let i = InterpreteApuntar()
        try await i.fijarAhora(b.ahora[0], b.ahora[1], b.ahora[2], b.ahora[3])
        return i
    }

    func testElInterpreteDaLoMismoQueLaWeb() async throws {
        let b = try banco()
        let i = try await interprete(b)
        var distintas: [String] = []
        for c in b.casos {
            let r = try await i.interpretar(c.frase, fechaBase: nil, contexto: b.contexto)
            if r != c.cosas {
                let ver = { (x: [ApunteInterpretado]) in x.map { "\($0.tipo) \($0.r.fecha) \($0.r.hora) \($0.describir[$0.tipo]?.texto ?? "")" }.joined(separator: " | ") }
                distintas.append("«\(c.frase.prefix(60))»\n  web:    \(ver(c.cosas))\n  iphone: \(ver(r))")
            }
        }
        XCTAssertGreaterThan(b.casos.count, 100)
        XCTAssertTrue(distintas.isEmpty, "\(distintas.count) de \(b.casos.count) distintas:\n" + distintas.prefix(12).joined(separator: "\n"))
    }

    func testCadaTipoSeCreaSeReaplicaYSeDeshace() async throws {
        let b = try banco()
        let i = try await interprete(b)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let ahora = try XCTUnwrap(cal.date(from: DateComponents(year: 2026, month: 11, day: 5, hour: 16)))
        let doc = try DocumentoBitacora(datos: Data(#"""
        {"raro": [1, 2], "dayPlanner": {"days": {"2026-11-05": [{"id": "otra"}]}, "backlog": []}, "entries": [], "recurringTasks": [], "notes": [{"id": "n1", "date": "2026-11-05", "content": "ya había"}],
         "financePro": {"accounts": {}, "categories": [], "transactions": [{"id": "t0", "manual": true, "account": "online", "type": "expense", "amount": 1}]},
         "listaCompra": {"listas": [{"id": "l1", "nombre": "Casa", "items": [{"id": "x", "texto": "Pan", "hecho": false}]}], "actual": "l1", "frecuentes": {}},
         "studies": {"subjects": [{"id": "s0", "name": "Estadística", "exams": [], "assignments": []}, {"id": "s3", "name": "Psicología", "exams": [], "assignments": []}], "schedule": {}}}
        """#.utf8))
        let casos: [(String, String, String)] = [
            ("llamar al banco", "tarea", "dayPlanner"), ("cena con Marta el viernes a las 9 en La Pepita", "evento", "entries"),
            ("gasté doce euros en gasolina en efectivo", "gasto", "financePro"), ("comprar huevos y leche", "compra", "listaCompra"),
            ("nota: idea para el proyecto", "nota", "notes"), ("cumple de Ana el 3 de mayo", "cumple", "entries"),
            ("examen de estadística el 20 a las 9", "examen", "studies"), ("entregar trabajo de psicología el 25", "trabajo", "studies"),
            ("gimnasio todos los lunes y jueves a las 19", "recurrente", "recurringTasks"), ("clase de inglés los martes a las 18", "clase", "studies"),
            ("viaje a Lisboa del 3 al 7 de noviembre", "viaje", "entries"), ("serie Los hombres de Paco", "serie", "entries"),
            ("libro El infinito en un junco", "libro", "entries"), ("peli Dune", "peli", "entries"), ("juego Zelda", "juego", "entries"),
        ]
        for (frase, tipo, clave) in casos {
            let lista = try await i.interpretar(frase, fechaBase: nil, contexto: b.contexto)
            let a = try XCTUnwrap(lista.first, frase)
            guard case let .success(creado) = CrearApunte.crear(a, tipo: tipo, doc: doc, ahora: ahora) else { XCTFail("\(frase): no se creó"); continue }
            let (r, parche) = AplicarOperaciones.sobre(doc, creado.ops)
            XCTAssertNotNil(parche[clave], "\(frase): no tocó \(clave)")
            XCTAssertNotNil(parche["apuntesRecientes"], frase)
            XCTAssertNil(parche["raro"], frase)
            let (_, otra) = AplicarOperaciones.sobre(r, creado.ops)
            XCTAssertTrue(otra.isEmpty, "\(frase): reaplicar cambió \(otra.keys.sorted())")
            let apunte = try XCTUnwrap(try r.valor(de: "apuntesRecientes")?.lista?.first)
            XCTAssertEqual(apunte["tipo"], .string(tipo))
            let id = try XCTUnwrap(apunte["id"]?.comoId)
            let (sin, quitado) = AplicarOperaciones.sobre(r, [.deshacerApunte(id: id)])
            XCTAssertNotNil(quitado[clave], "\(frase): deshacer no tocó \(clave)")
            XCTAssertEqual(try sin.valor(de: clave), try doc.valor(de: clave), "\(frase): deshacer no dejó \(clave) como estaba")
            XCTAssertEqual(try sin.valor(de: "apuntesRecientes")?.lista?.first?["deshecho"], .bool(true))
            let (_, nada) = AplicarOperaciones.sobre(sin, [.deshacerApunte(id: id)])
            XCTAssertTrue(nada.isEmpty, "\(frase): deshacer dos veces cambió algo")
        }
    }

    func testGastoUsaLaUltimaCuentaYQuedaPorRevisarSinCategoria() async throws {
        let b = try banco()
        let i = try await interprete(b)
        let doc = try DocumentoBitacora(datos: Data(#"{"financePro": {"transactions": [{"id": "t0", "manual": true, "account": "online"}]}}"#.utf8))
        let pagado = try await i.interpretar("me han pagado 50", fechaBase: nil, contexto: b.contexto)
        let a = try XCTUnwrap(pagado.first)
        guard case let .success(c) = CrearApunte.crear(a, tipo: "gasto", doc: doc) else { return XCTFail() }
        let (r, _) = AplicarOperaciones.sobre(doc, c.ops)
        let t = try XCTUnwrap(try r.valor(de: "financePro")?["transactions"]?.lista?.last)
        XCTAssertEqual(t["account"], .string("online"))
        XCTAssertEqual(t["type"], .string("income"))
        XCTAssertEqual(t["needsReview"], .bool(true))
        let soloFecha = try await i.interpretar("el viernes", fechaBase: nil, contexto: b.contexto)
        let vacio = try XCTUnwrap(soloFecha.first)
        XCTAssertEqual(CrearApunte.crear(vacio, tipo: "viaje", doc: doc), .failure(ErrorApunte(motivo: "falta el destino")))
    }

    func testCompraInterpretaCantidadYPrecio() {
        XCTAssertEqual(Compra.interpretar("2 kg naranjas 3,50€"), Compra.Item(texto: "Naranjas", cantidad: "2 kg", precio: "3.5"))
        XCTAssertEqual(Compra.interpretar("huevos x 12"), Compra.Item(texto: "Huevos", cantidad: "12", precio: nil))
    }
}
