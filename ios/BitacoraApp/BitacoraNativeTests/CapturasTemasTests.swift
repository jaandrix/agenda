import XCTest
import SwiftUI
@testable import BitacoraNative

// 0.22: una lámina por tema con Plan, el menú y Ajustes uno al lado del otro, para revisar cada tema sin Mac. Va al
// artefacto `capturas-diseno` (tema-<nombre>.png). Datos inventados.
@MainActor
final class CapturasTemasTests: XCTestCase {
    private static let carpeta = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("capturas")

    private func plan() -> VistaPlan {
        let hoy = CalendarioBitacora.madrid.diaLogico(Date())
        func t(_ id: String, _ hora: String?, _ titulo: String, _ hecha: Bool = false, arrastrada: Bool = false, notas: String = "") -> TareaPlan {
            TareaPlan(id: id, titulo: titulo, hora: hora, notas: notas, hecha: hecha, arrastrada: arrastrada, deTrabajo: false)
        }
        return VistaPlan(dia: hoy, hoyCivil: hoy,
                         tareas: [t("1", nil, "llamar al fontanero", arrastrada: true), t("2", "08:30", "gimnasio", true),
                                  t("3", "10:00", "repasar el tema 4", notas: "capítulos 4.2 y 4.3"), t("4", "13:30", "comida con marta"),
                                  t("5", "18:00", "entregar la práctica de redes")],
                         sinDia: [t("b1", nil, "renovar el dni"), t("b2", nil, "comprar regalo de lucía")],
                         recurrentes: [RecurrenteHoy(id: "r1", texto: "leer 20 minutos", hecha: true)])
    }

    private func columnaMenu() -> some View {
        VStack(alignment: .leading, spacing: 0) {
            CabeceraApartado(titulo: "menú", contexto: nil) { EmptyView() }
            GrupoMenu(titulo: "general.") {
                FilaMenu(nombre: "calendario", inicial: "calendar")
                SeparadorMenu()
                FilaMenu(nombre: "planificador", inicial: "planner", cuenta: 3)
                SeparadorMenu()
                FilaMenu(nombre: "despensa", inicial: "compra")
                SeparadorMenu()
                FilaMenu(nombre: "rutinas", inicial: "habits", cuenta: 1)
            }
            GrupoMenu(titulo: "desarrollo.") {
                FilaMenu(nombre: "finanzas", inicial: "finances")
                SeparadorMenu()
                FilaMenu(nombre: "estudios", inicial: "studies")
                SeparadorMenu()
                FilaMenu(nombre: "profesorado", inicial: "profesorado", web: true)
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("campos y botones.").font(Tipo.poppins(13, .bold, estilo: .footnote)).foregroundStyle(Paleta.textoSecundario)
                Text("comida con marta").font(Tipo.cuerpo).foregroundStyle(Paleta.texto).frame(maxWidth: .infinity, alignment: .leading).campoCasa(activo: true)
                Text("notas.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoApagado).frame(maxWidth: .infinity, alignment: .leading).campoCasa()
                Button("guardar.") {}.buttonStyle(BotonPrincipal())
                Button("cancelar.") {}.buttonStyle(BotonSecundario())
                Button("eliminar.") {}.buttonStyle(BotonPeligro())
                Button("desactivado.") {}.buttonStyle(BotonPrincipal()).disabled(true)
            }
            .padding(.top, 22)
        }
    }

    private func columnaAjustes() -> some View {
        VStack(alignment: .leading, spacing: 0) {
            CabeceraApartado(titulo: "ajustes", contexto: nil) { EmptyView() }
            CabeceraPerfil(nombre: "alejandro", correo: "tu@correo.es", foto: nil, resumen: "socio fundador nº 07.").padding(.top, Espacio.m)
            GrupoMenu(titulo: "apariencia.") {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 88), spacing: 10)], spacing: 14) {
                    ForEach(TemaElegido.allCases.filter { $0 != .sistema }) { t in
                        MuestraTema(tema: t, elegido: t == TemaActivo.elegido, oscuroSistema: false)
                    }
                }
                .padding(16)
                SeparadorMenu()
                OpcionesAjuste(opciones: EscalaLetra.allCases.map { ($0, $0.nombre) }, elegida: EscalaLetra.normal) { _ in }.padding(16)
            }
            GrupoMenu(titulo: "avisos.") {
                FilaAjuste(icono: "avisos", titulo: "avisos automáticos.", detalle: "11 de 12 tipos encendidos.")
                SeparadorMenu()
                FilaInterruptor(icono: "candado", titulo: "pedir face id al abrir.", activo: .constant(true))
                SeparadorMenu()
                FilaInterruptor(icono: "correo", titulo: "correo de los domingos.", activo: .constant(false))
            }
            GrupoMenu(titulo: "cuenta.") {
                FilaAjuste(icono: "invitar", titulo: "invitar a un amigo.", detalle: "tu código y tu enlace.")
                SeparadorMenu()
                FilaAjuste(icono: "borrar", titulo: "eliminar mi cuenta.", peligro: true)
            }
        }
    }

    func testLaminaPorTema() throws {
        let antes = TemaActivo.elegido
        defer { TemaActivo.elegido = antes }
        let v = plan()
        for t in TemaElegido.allCases where t != .sistema {
            TemaActivo.elegido = t
            let lamina = HStack(alignment: .top, spacing: 0) {
                VStack(spacing: 0) {
                    PlanCuerpo(carga: .lista(v), desplazamiento: .constant(0), estado: .reposo, pendientes: 0, aviso: nil)
                        .padding(.horizontal, Espacio.l - 4).padding(.top, 54)
                    Spacer(minLength: 0)
                    BarraBitacora(pestanas: PrincipalView.pestanas(secundaria: .calendario), activa: "plan", elegir: { _ in }, capturar: {})
                        .padding(.bottom, 20)
                }
                .frame(width: 390, height: 1240, alignment: .top)
                columnaMenu().padding(.horizontal, 20).padding(.top, 54).frame(width: 390, height: 1240, alignment: .top)
                columnaAjustes().padding(.horizontal, 20).padding(.top, 54).frame(width: 390, height: 1240, alignment: .top)
            }
            .background(Paleta.fondo)
            .environment(\.colorScheme, t.esquema == .dark ? .dark : .light)

            let r = ImageRenderer(content: lamina)
            r.scale = 1.5
            let png = try XCTUnwrap(r.uiImage?.pngData(), "no se pudo dibujar \(t.rawValue)")
            try FileManager.default.createDirectory(at: Self.carpeta, withIntermediateDirectories: true)
            try png.write(to: Self.carpeta.appendingPathComponent("tema-\(t.rawValue).png"))
        }
    }
}
