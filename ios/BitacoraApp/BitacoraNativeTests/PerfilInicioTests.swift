import XCTest
@testable import BitacoraNative

// 3.2: «mi perfil.» (nombre y cumpleaños en el documento) y el bus de Inicio solo en la zona de Avanza.
final class PerfilInicioTests: XCTestCase {
    private func doc(_ s: String) throws -> DocumentoBitacora { try DocumentoBitacora(datos: Data(s.utf8)) }

    func testNombreYCumpleSonIdempotentesYConservanElResto() throws {
        let d = try doc(#"{"userName":"Alejandro","perfilPersonal":{"otro":1}}"#)
        let op = PerfilPersonalOp.op(nombre: "  Ale  ", cumple: .some(LocalDay(iso: "1995-05-14")), sinAnio: true)
        let (r, parche) = AplicarOperaciones.sobre(d, [op, op])
        XCTAssertEqual(Set(parche.keys), ["userName", "perfilPersonal"])
        let l = PerfilPersonalOp.leer(r)
        XCTAssertEqual(l.nombre, "Ale")
        XCTAssertEqual(l.cumple?.iso, "2000-05-14")
        XCTAssertTrue(l.sinAnio)
        XCTAssertEqual(try r.valor(de: "perfilPersonal")?["otro"], .number("1"))
    }

    func testSoloCumpleNoTocaElNombreYQuitarLoBorra() throws {
        let d = try doc(#"{"userName":"Alejandro"}"#)
        let (r, _) = AplicarOperaciones.sobre(d, [PerfilPersonalOp.op(cumple: .some(LocalDay(iso: "1995-05-14")))])
        XCTAssertEqual(PerfilPersonalOp.leer(r).nombre, "Alejandro")
        XCTAssertEqual(PerfilPersonalOp.leer(r).cumple?.iso, "1995-05-14")
        let (r2, _) = AplicarOperaciones.sobre(r, [PerfilPersonalOp.op(cumple: .some(nil))])
        XCTAssertNil(PerfilPersonalOp.leer(r2).cumple)
    }

    func testCumpleYEdad() throws {
        let hoy = try XCTUnwrap(LocalDay(iso: "2027-02-28"))
        XCTAssertTrue(PerfilPersonalOp.esCumple(LocalDay(iso: "2000-02-29"), hoy: hoy))
        XCTAssertFalse(PerfilPersonalOp.esCumple(LocalDay(iso: "2000-03-01"), hoy: hoy))
        XCTAssertEqual(PerfilPersonalOp.edad(LocalDay(iso: "1995-02-28"), sinAnio: false, hoy: hoy), 32)
        XCTAssertNil(PerfilPersonalOp.edad(LocalDay(iso: "2000-02-28"), sinAnio: true, hoy: hoy))
    }

    func testZonaDelTransporte() {
        XCTAssertTrue(ZonaTransporte.cubre(.defecto))
        XCTAssertTrue(ZonaTransporte.cubre(Ciudad(nombre: "Utebo", lat: 41.709, lon: -0.997)))
        XCTAssertFalse(ZonaTransporte.cubre(Ciudad(nombre: "Madrid", lat: 40.4168, lon: -3.7038)))
    }

    func testInicioSinBusFueraDeZaragoza() throws {
        let base = #""dayPlanner":{"days":{},"backlog":[]},"entries":[],"servicios":{"transporte":{"favoritos":["bus:123"]}}"#
        let zgz = VistaInicio.desde(try doc("{" + base + "}"))
        XCTAssertEqual(zgz.poste, "123")
        let mad = VistaInicio.desde(try doc("{" + base + #","ciudadTiempo":{"nombre":"Madrid","lat":40.4168,"lon":-3.7038}}"#))
        XCTAssertNil(mad.poste)
    }
}
