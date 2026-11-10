import XCTest
@testable import BitacoraNative

// Viajes nativos contra lo que hace js/viajes.js: crear y editar sin perder lo que la app no conoce, itinerario por día,
// lugares y gastos del viaje (financeProGastosDelViaje).
final class ViajesTests: XCTestCase {
    private let base = #"""
    {"entries": [{"id": "v1", "type": "travel", "title": "Roma", "destination": "Roma", "startDate": "2026-12-01", "endDate": "2026-12-04",
                  "date": "2026-12-01", "transportes": [{"id": "tr1"}], "expenses": [{"amount": 20}], "raro": true},
                 {"id": "e1", "type": "event", "title": "cine"}],
     "financePro": {"transactions": [
        {"id": "g1", "type": "expense", "viaje": true, "date": "2026-12-02", "amount": 12.5, "note": "pizza"},
        {"id": "g2", "type": "expense", "viaje": true, "viajeId": "otro", "date": "2026-12-02", "amount": 99},
        {"id": "g3", "type": "expense", "date": "2026-12-03", "amount": 5},
        {"id": "g4", "type": "expense", "viaje": true, "viajeId": "v1", "date": "2026-11-20", "amount": 30}]}}
    """#

    func testCrearYEditarConservaLoDemas() throws {
        let doc = try DocumentoBitacora(datos: Data(base.utf8))
        let (r, _) = AplicarOperaciones.sobre(doc, [
            .guardarViaje(id: "v1", titulo: "Roma y Florencia", destino: "Italia", inicio: "2026-12-01", fin: "2026-12-06", companeros: "Ana", notas: ""),
            .guardarViaje(id: "v2", titulo: "Lisboa", destino: "Lisboa", inicio: "", fin: "", companeros: "", notas: ""),
            .guardarViaje(id: "e1", titulo: "no", destino: "", inicio: "", fin: "", companeros: "", notas: ""),
        ])
        let lista = try XCTUnwrap(r.valor(de: "entries")?.lista)
        let v1 = try XCTUnwrap(lista.first { $0["id"]?.comoId == "v1" })
        XCTAssertEqual(v1["title"], .string("Roma y Florencia"))
        XCTAssertEqual(v1["endDate"], .string("2026-12-06"))
        XCTAssertEqual(v1["raro"], .bool(true))
        XCTAssertEqual(v1["transportes"]?.lista?.count, 1)
        let v2 = try XCTUnwrap(lista.first { $0["id"]?.comoId == "v2" })
        XCTAssertEqual(v2["type"], .string("travel"))
        XCTAssertEqual(v2["categoryId"], .string("cat_viaje"))
        XCTAssertEqual(v2["date"], .string(""))
        XCTAssertEqual(lista.first { $0["id"]?.comoId == "e1" }?["title"], .string("cine"))
    }

    func testItinerarioLugaresYGastos() throws {
        let doc = try DocumentoBitacora(datos: Data(base.utf8))
        let ops: [OperacionBitacora] = [
            .cambiarViaje(viajeId: "v1", cambio: .itinerario(id: "it2", dia: "2026-12-02", hora: "18:00", titulo: "cena", lugar: "Trastevere", notas: "")),
            .cambiarViaje(viajeId: "v1", cambio: .itinerario(id: "it1", dia: "2026-12-02", hora: "10:00", titulo: "Coliseo", lugar: "", notas: "")),
            .cambiarViaje(viajeId: "v1", cambio: .itinerario(id: "it3", dia: "", hora: "", titulo: "helado", lugar: "", notas: "")),
            .cambiarViaje(viajeId: "v1", cambio: .lugar(id: "p1", nombre: "Panteón")),
            .cambiarViaje(viajeId: "v1", cambio: .lugar(id: "p1", nombre: "Panteón")),
            .cambiarViaje(viajeId: "v1", cambio: .lugarVisitado(id: "p1", visitado: true)),
            .cambiarViaje(viajeId: "e1", cambio: .lugar(id: "p9", nombre: "no")),
        ]
        let (r, _) = AplicarOperaciones.sobre(doc, ops)
        let (dos, _) = AplicarOperaciones.sobre(r, ops)
        let v = try XCTUnwrap(LecturaViajes.viajes(dos).first { $0.id == "v1" })
        XCTAssertEqual(v.itinerario.count, 3)
        XCTAssertEqual(LecturaViajes.porDia(v.itinerario).map { $0.1.map(\.id) }, [["it1", "it2"], ["it3"]])
        XCTAssertEqual(v.lugares, [LugarViaje(id: "p1", nombre: "Panteón", visitado: true)])
        XCTAssertEqual(v.gastos.map(\.id), ["g4", "g1"])
        XCTAssertEqual(v.totalGastos, Decimal(string: "42.5"))
        XCTAssertEqual(v.aMano, 20)
        XCTAssertNil(try dos.valor(de: "entries")?.lista?.first { $0["id"]?.comoId == "e1" }?["places"])

        let (sin, _) = AplicarOperaciones.sobre(dos, [.cambiarViaje(viajeId: "v1", cambio: .quitarItinerario(id: "it1")),
                                                     .cambiarViaje(viajeId: "v1", cambio: .quitarLugar(id: "p1"))])
        let v3 = try XCTUnwrap(LecturaViajes.viajes(sin).first { $0.id == "v1" })
        XCTAssertEqual(v3.itinerario.map(\.id).sorted(), ["it2", "it3"])
        XCTAssertTrue(v3.lugares.isEmpty)
        XCTAssertEqual(v3.estado(hoy: "2026-12-03"), "en curso")
        XCTAssertEqual(v3.estado(hoy: "2026-11-01"), "próximo")
        XCTAssertEqual(v3.estado(hoy: "2027-01-01"), "completado")
    }
}
