import XCTest
import SwiftUI
@testable import BitacoraNative

// Capturas de Plan para aprobar el diseño sin Mac: el CI las deja en ios/BitacoraApp/capturas y las sube como artefacto.
// Datos inventados, sin tocar el almacén ni la nube.
@MainActor
final class CapturasTests: XCTestCase {
    private static let carpeta = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("capturas")

    private func vista(vacia: Bool = false) -> VistaPlan {
        let hoy = CalendarioBitacora.madrid.diaLogico(Date())
        guard !vacia else { return VistaPlan(dia: hoy, hoyCivil: hoy, tareas: [], sinDia: [], recurrentes: []) }
        func t(_ id: String, _ hora: String?, _ titulo: String, _ hecha: Bool = false, arrastrada: Bool = false, notas: String = "") -> TareaPlan {
            TareaPlan(id: id, titulo: titulo, hora: hora, notas: notas, hecha: hecha, arrastrada: arrastrada, deTrabajo: false)
        }
        return VistaPlan(dia: hoy, hoyCivil: hoy,
                         tareas: [t("1", nil, "llamar al fontanero", arrastrada: true),
                                  t("2", "08:30", "gimnasio", true),
                                  t("3", "10:00", "repasar el tema 4", notas: "capítulos 4.2 y 4.3"),
                                  t("4", "13:30", "comida con marta"),
                                  t("5", "18:00", "entregar la práctica de redes"),
                                  t("6", "21:00", "preparar la mochila")],
                         sinDia: [t("b1", nil, "renovar el dni"), t("b2", nil, "comprar regalo de lucía"),
                                  t("b3", nil, "devolver el libro"), t("b4", nil, "arreglar la bici")],
                         recurrentes: [RecurrenteHoy(id: "r1", texto: "leer 20 minutos", hecha: true),
                                       RecurrenteHoy(id: "r2", texto: "regar las plantas", hecha: false)])
    }

    private func guardar(_ nombre: String, oscuro: Bool, carga: Carga<VistaPlan>, estado: EstadoSync = .reposo, pendientes: Int = 0) throws {
        let pantalla = VStack(spacing: 0) {
            PlanCuerpo(carga: carga, desplazamiento: .constant(0), estado: estado, pendientes: pendientes, aviso: nil)
                .padding(.horizontal, Espacio.l - 4)
                .padding(.top, 54)
            Spacer(minLength: 0)
            BarraBitacora(pestanas: [.init(id: "plan", titulo: "plan", icono: "checklist"),
                                     .init(id: "calendario", titulo: "calendario", icono: "calendar"),
                                     .init(id: "finanzas", titulo: "finanzas", icono: "eurosign"),
                                     .init(id: "mas", titulo: "más", icono: "square.grid.2x2")],
                          activa: "plan", elegir: { _ in }, capturar: {})
                .padding(.bottom, 20)
        }
        .frame(width: 390, height: 1100, alignment: .top)
        .background(Paleta.fondo)
        .environment(\.colorScheme, oscuro ? .dark : .light)

        let r = ImageRenderer(content: pantalla)
        r.scale = 2
        let png = try XCTUnwrap(r.uiImage?.pngData(), "no se pudo dibujar \(nombre)")
        try FileManager.default.createDirectory(at: Self.carpeta, withIntermediateDirectories: true)
        try png.write(to: Self.carpeta.appendingPathComponent("\(nombre).png"))
    }

    func testCapturasDePlan() throws {
        try guardar("plan-390-claro", oscuro: false, carga: .lista(vista()))
        try guardar("plan-390-oscuro", oscuro: true, carga: .lista(vista()))
        try guardar("plan-390-vacio-claro", oscuro: false, carga: .lista(vista(vacia: true)))
        try guardar("plan-390-sin-conexion-oscuro", oscuro: true, carga: .lista(vista()), estado: .sinConexion, pendientes: 2)
    }
}
