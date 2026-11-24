import XCTest
@testable import BitacoraNative

// Rutinas 2.0: qué toca hoy, la semana en puntitos y la racha como habitStreak (js/planificador.js).
final class RutinasV2Tests: XCTestCase {
    func testSemanaRachasYMomentos() throws {
        let doc = try DocumentoBitacora(datos: Data(#"""
        {"habits": [
          {"id": "h1", "texto": "agua", "momento": "manana", "completadas": {"2026-11-15": true, "2026-11-16": true, "2026-11-17": true}},
          {"id": "h2", "texto": "leer", "momento": "noche", "frecuencia": {"tipo": "dias", "dias": [1, 3]},
           "completadas": {"2026-11-16": true, "2026-11-11": true, "2026-11-09": true}},
          {"id": "h3", "texto": "martes", "frecuencia": {"tipo": "dias", "dias": [2]}, "completadas": {}},
          {"id": "h4", "texto": "deporte", "momento": "raro", "frecuencia": {"tipo": "semana", "veces": 2},
           "completadas": {"2026-11-09": true, "2026-11-10": true, "2026-11-03": true}},
          {"id": "h5", "texto": "en pausa", "activo": false, "completadas": {}}
        ]}
        """#.utf8))
        let hoy = LocalDay(iso: "2026-11-18")!
        var v = LecturaRutinas.vista(doc, hoy: hoy)

        XCTAssertEqual(v.activas, 4)
        XCTAssertEqual(v.rutinas.map(\.id), ["h1", "h2", "h4"])
        XCTAssertEqual(v.rutinas.map(\.momento), [.manana, .noche, .cuandoSea])

        let agua = v.rutinas[0]
        XCTAssertEqual(agua.semana.map(\.iso).first, "2026-11-16")
        XCTAssertEqual(agua.semana.map(\.hecho), [true, true, false, false, false, false, false])
        XCTAssertEqual(agua.semana.map(\.esHoy), [false, false, true, false, false, false, false])
        XCTAssertEqual(agua.racha, 3)

        let leer = v.rutinas[1]
        XCTAssertEqual(leer.semana.map(\.toca), [true, false, true, false, false, false, false])
        XCTAssertEqual(leer.racha, 3)

        let deporte = v.rutinas[2]
        XCTAssertEqual(deporte.racha, 1)
        XCTAssertEqual(deporte.detalle, "0 de 2 esta semana.")

        v.rutinas[0].marcar(true)
        XCTAssertEqual(v.rutinas[0].racha, 4)
        XCTAssertEqual(v.rutinas[0].semana[2].hecho, true)
        XCTAssertEqual(v.rutinas[0].detalle, "4 días seguidos.")
        XCTAssertEqual(v.hechas, 1)
        XCTAssertFalse(v.completa)
    }
}
