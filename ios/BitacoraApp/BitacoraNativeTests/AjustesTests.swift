import XCTest
@testable import BitacoraNative

// 0.22: lo que Ajustes escribe en la fila (avisos automáticos, versión del calendario, tokens de Siri y correo) y el
// perfil y los apartados, que ya existían como operaciones pero no tenían pantalla.
final class AjustesTests: XCTestCase {
    private let base = #"{"raro":{"x":1},"preferenciasAvisos":{"ritmo":false},"servicios":{"admin":{"festivosDiscretos":true}},"calendarioFeedVersion":2,"userName":"Alejandro"}"#

    private func doc() throws -> DocumentoBitacora { try DocumentoBitacora(datos: Data(base.utf8)) }

    func testApagarYEncenderAvisoEsIdempotente() throws {
        let d = try doc()
        let apagar = OperacionesAjustes.avisoOp(tipo: "eventos", activo: false)
        let (r, parche) = AplicarOperaciones.sobre(d, [apagar, apagar])
        XCTAssertEqual(Set(parche.keys), ["preferenciasAvisos"])
        let p = try XCTUnwrap(try r.valor(de: "preferenciasAvisos"))
        XCTAssertEqual(p["eventos"], .bool(false))
        XCTAssertEqual(p["ritmo"], .bool(false))
        let (r2, _) = AplicarOperaciones.sobre(r, [OperacionesAjustes.avisoOp(tipo: "ritmo", activo: true)])
        XCTAssertNil(try r2.valor(de: "preferenciasAvisos")?["ritmo"])
        XCTAssertEqual(try r2.valor(de: "raro"), try d.valor(de: "raro"))
        XCTAssertEqual(OperacionesAjustes.leer(r2).avisosApagados, ["eventos"])
    }

    func testTipoDeAvisoDesconocidoNoEscribe() throws {
        let d = try doc()
        let (r, _) = AplicarOperaciones.sobre(d, [OperacionesAjustes.avisoOp(tipo: "inventado", activo: false)])
        XCTAssertEqual(try r.valor(de: "preferenciasAvisos"), try d.valor(de: "preferenciasAvisos"))
    }

    func testVersionDelCalendarioNoSumaAlReaplicar() throws {
        let d = try doc()
        let op = OperacionesAjustes.feedOp(version: 3)
        let (r, _) = AplicarOperaciones.sobre(d, [op, op])
        XCTAssertEqual(OperacionesAjustes.leer(r).feedVersion, 3)
    }

    func testTokenDeSiriConservaElRestoDeServicios() throws {
        let d = try doc()
        let (r, parche) = AplicarOperaciones.sobre(d, [OperacionesAjustes.tokenOp(clave: "siriToken", token: "abc")])
        XCTAssertEqual(Set(parche.keys), ["servicios"])
        let s = try XCTUnwrap(try r.valor(de: "servicios"))
        XCTAssertEqual(s["siriToken"], .string("abc"))
        XCTAssertEqual(s["admin"]?["festivosDiscretos"], .bool(true))
        let (r2, _) = AplicarOperaciones.sobre(r, [OperacionesAjustes.tokenOp(clave: "otraCosa", token: "x")])
        XCTAssertNil(try r2.valor(de: "servicios")?["otraCosa"])
    }

    func testPerfilYApartadoCambianElMenu() throws {
        let d = try doc()
        XCTAssertTrue(Apartados.visible("work", d))
        let (r, _) = AplicarOperaciones.sobre(d, [.ponerPerfil(perfil: "estudiante"), .ponerApartado(vista: "links", visible: true)])
        XCTAssertFalse(Apartados.visible("work", r))
        XCTAssertTrue(Apartados.visible("links", r))
        XCTAssertEqual(OperacionesAjustes.leer(r).perfil, "estudiante")
        XCTAssertEqual(OperacionesAjustes.leer(r).nombre, "Alejandro")
    }

    func testHashDelTokenComoLaWeb() {
        XCTAssertEqual(ServidorAjustes.hash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        XCTAssertEqual(ServidorAjustes.tokenNuevo(bytes: 24).count, 48)
    }

    func testTodosLosTemasCumplenContraste() {
        func lum(_ v: UInt32) -> Double {
            let f = { (c: Double) -> Double in c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
            return 0.2126 * f(Double((v >> 16) & 0xFF) / 255) + 0.7152 * f(Double((v >> 8) & 0xFF) / 255) + 0.0722 * f(Double(v & 0xFF) / 255)
        }
        func cr(_ a: UInt32, _ b: UInt32) -> Double { let x = lum(a), y = lum(b); return (max(x, y) + 0.05) / (min(x, y) + 0.05) }
        func mezcla(_ c: UInt32, _ f: UInt32, _ a: Double) -> UInt32 {
            var r: UInt32 = 0
            for s: UInt32 in [16, 8, 0] {
                let x = Double((c >> s) & 0xFF) * a
                let y = Double((f >> s) & 0xFF) * (1 - a)
                r |= UInt32((x + y).rounded()) << s
            }
            return r
        }
        for t in TemaElegido.allCases where t != .sistema {
            let k = TemaTokens.de(t, sistemaOscuro: false)
            XCTAssertGreaterThanOrEqual(cr(k.texto, k.superficie), 4.5, "\(t) texto")
            XCTAssertGreaterThanOrEqual(cr(k.secundario, k.fondo), 4.5, "\(t) secundario")
            XCTAssertGreaterThanOrEqual(cr(k.secundario, k.superficie), 4.5, "\(t) secundario sobre superficie")
            XCTAssertGreaterThanOrEqual(cr(k.sobreAcento, k.acento), 4.5, "\(t) sobre acento")
            XCTAssertGreaterThanOrEqual(cr(mezcla(k.texto, k.fondo, Double(k.aroAlfa ?? (k.oscuro ? 0.42 : 0.36))), k.fondo), 3, "\(t) aro")
            XCTAssertGreaterThanOrEqual(cr(k.superficie, k.fondo), 1.08, "\(t) superficie")
        }
    }
}
