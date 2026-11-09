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
        try guardarPantalla(nombre, oscuro: oscuro, activa: "plan") {
            PlanCuerpo(carga: carga, desplazamiento: .constant(0), estado: estado, pendientes: pendientes, aviso: nil)
        }
    }

    func guardarPantalla<V: View>(_ nombre: String, oscuro: Bool, activa: String, letra: DynamicTypeSize = .large, @ViewBuilder _ contenido: () -> V) throws {
        let pantalla = VStack(spacing: 0) {
            contenido()
                .padding(.horizontal, Espacio.l - 4)
                .padding(.top, 54)
            Spacer(minLength: 0)
            BarraBitacora(pestanas: PrincipalView.pestanas(secundaria: .calendario), activa: activa, elegir: { _ in }, capturar: {})
                .padding(.bottom, 20)
        }
        .frame(width: 390, height: 1100, alignment: .top)
        .background(Paleta.fondo)
        .environment(\.colorScheme, oscuro ? .dark : .light)
        .environment(\.dynamicTypeSize, letra)

        let r = ImageRenderer(content: pantalla)
        r.scale = 2
        let png = try XCTUnwrap(r.uiImage?.pngData(), "no se pudo dibujar \(nombre)")
        try FileManager.default.createDirectory(at: Self.carpeta, withIntermediateDirectories: true)
        try png.write(to: Self.carpeta.appendingPathComponent("\(nombre).png"))
    }

    func testCapturasDeInicio() throws {
        let hoy = CalendarioBitacora.madrid.diaLogico(Date())
        let v = vista()
        let semana = hoy.semanaLunesDomingo
        let conCosas: Set<LocalDay> = [semana[1], semana[2], semana[5], semana[0].sumando(dias: -5), semana[6].sumando(dias: 2)]
        let agenda = [VistaInicio.Cosa(id: "e1", hora: "09:00", titulo: "dentista", notas: "calle mayor 12", hecha: false, acento: false, tarea: nil)]
            + v.tareas.map { VistaInicio.Cosa(id: $0.id, hora: $0.hora, titulo: $0.titulo, notas: $0.notas, hecha: $0.hecha, acento: $0.arrastrada, tarea: $0) }
        let inicio = VistaInicio(hoy: hoy, semana: semana, conCosas: conCosas, agenda: agenda.sorted { ($0.hora ?? "") < ($1.hora ?? "") },
                                 sinDia: v.sinDia, pendientes: 5, hechas: 1)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let ahora = cal.date(bySettingHour: 11, minute: 40, second: 0, of: Date())!
        for oscuro in [false, true] {
            try guardarPantalla("inicio-390-" + (oscuro ? "oscuro" : "claro"), oscuro: oscuro, activa: "inicio") {
                InicioCuerpo(vista: inicio, ahora: ahora, estado: .reposo)
            }
        }
        let previa = LetraActiva.elegida
        defer { LetraActiva.elegida = previa }
        LetraActiva.elegida = .grande
        try guardarPantalla("inicio-390-letra-grande-claro", oscuro: false, activa: "inicio") {
            InicioCuerpo(vista: inicio, ahora: ahora, estado: .reposo)
        }
    }

    func testCapturasDePlan() throws {
        try guardar("plan-390-claro", oscuro: false, carga: .lista(vista()))
        try guardar("plan-390-oscuro", oscuro: true, carga: .lista(vista()))
        try guardar("plan-390-vacio-claro", oscuro: false, carga: .lista(vista(vacia: true)))
        try guardar("plan-390-sin-conexion-oscuro", oscuro: true, carga: .lista(vista()), estado: .sinConexion, pendientes: 2)
        // Letra de accesibilidad: nada se corta ni se monta.
        try guardarPantalla("plan-390-letra-grande-claro", oscuro: false, activa: "plan", letra: .accessibility2) {
            PlanCuerpo(carga: .lista(vista()), desplazamiento: .constant(0), estado: .reposo, pendientes: 0, aviso: nil)
        }
    }
}
