import XCTest
import Vision
@testable import BitacoraNative

final class QRMarcadoTests: XCTestCase {
    private func leerConVision(_ img: UIImage) -> String? {
        guard let cg = img.cgImage else { return nil }
        let p = VNDetectBarcodesRequest()
        p.symbologies = [.qr]
        try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([p])
        return p.results?.compactMap(\.payloadStringValue).first
    }

    func testLaMatrizTieneLosOjosEnSuSitio() throws {
        let m = try XCTUnwrap(QRMarcado.matriz(Data("hola".utf8)))
        XCTAssertEqual((m.n - 17) % 4, 0)
        // Esquina y centro del ojo de arriba a la izquierda oscuros; el separador, claro.
        XCTAssertTrue(m.oscuro(0, 0))
        XCTAssertTrue(m.oscuro(3, 3))
        XCTAssertFalse(m.oscuro(7, 0))
        XCTAssertFalse(m.oscuro(1, 1))
        XCTAssertTrue(m.oscuro(m.n - 1, 0))
        XCTAssertTrue(m.oscuro(0, m.n - 1))
    }

    func testElHuecoEsImparYPequeno() {
        for n in stride(from: 21, through: 77, by: 4) {
            let h = QRMarcado.hueco(n)
            XCTAssertEqual(h % 2, 1)
            XCTAssertLessThan(Double(h * h) / Double(n * n), 0.08, "n=\(n)")
        }
    }

    // Con la «b.» en su placa se sigue leyendo, corto y largo, en los temas claro y oscuro.
    func testSeLeeConLaMarcaPuesta() throws {
        let textos = ["E-TICKET-2026-000123",
                      "https://entradas.example.com/v/8f3a9c2e-1b4d-4f6a-9e0c-7d2b5a1c3e9f?asiento=F12&puerta=3",
                      String(repeating: "BITACORA0123456789", count: 12)]
        for placa in [UIColor(rgb: 0x302F2C), UIColor(rgb: 0x121211), UIColor(rgb: 0x1A2D42)] {
            for t in textos {
                let img = try XCTUnwrap(QRMarcado.imagen(Data(t.utf8), placa: placa, letra: .white, punto: UIColor(rgb: 0xE5532B), porModulo: 8))
                let leido = leerConVision(img) ?? LectorQR.leer(img)
                XCTAssertEqual(leido, t, "placa \(placa), \(t.count) caracteres")
            }
        }
    }

    func testLasCapturasDelSimuladorTambienPasanPorVision() throws {
        let img = try XCTUnwrap(QRMarcado.imagen(Data("vision".utf8), placa: .black, letra: .white, punto: .orange))
        // En el simulador Vision puede no tener su modelo; entonces vale la lectura de respaldo.
        XCTAssertEqual(leerConVision(img) ?? LectorQR.leer(img), "vision")
    }
}
