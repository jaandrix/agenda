import XCTest
import SwiftUI
@testable import BitacoraNative

// Tema «tinta.» (0.25): solo grises, contraste AA en todo el texto, en día y en noche. Y una lámina por modo en el
// artefacto `capturas-diseno` (tinta-dia.png, tinta-noche.png) con Inicio, Plan y las piezas que cambian de forma.
@MainActor
final class TintaTests: XCTestCase {
    private static let carpeta = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("capturas")

    private func lum(_ v: UInt32) -> Double {
        let f = { (c: Double) -> Double in c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        let r = f(Double((v >> 16) & 0xFF) / 255), g = f(Double((v >> 8) & 0xFF) / 255), b = f(Double(v & 0xFF) / 255)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    private func cr(_ a: UInt32, _ b: UInt32) -> Double {
        let x = lum(a), y = lum(b)
        return (max(x, y) + 0.05) / (min(x, y) + 0.05)
    }

    private func mezcla(_ c: UInt32, _ f: UInt32, _ a: Double) -> UInt32 {
        var r: UInt32 = 0
        for s: UInt32 in [16, 8, 0] {
            let x = Double((c >> s) & 0xFF) * a
            let y = Double((f >> s) & 0xFF) * (1 - a)
            r |= UInt32((x + y).rounded()) << s
        }
        return r
    }

    private func gris(_ v: UInt32) -> Bool { (v >> 16) & 0xFF == (v >> 8) & 0xFF && (v >> 8) & 0xFF == v & 0xFF }

    func testTintaSigueAlIphoneYEsParaTodos() {
        XCTAssertNil(TemaElegido.tinta.esquema)
        XCTAssertTrue(TemaElegido.tinta.permitido(PermisosTemas()))
        XCTAssertEqual(TemaElegido.tinta.nombre, "tinta.")
        XCTAssertFalse(TemaTokens.de(.tinta, sistemaOscuro: false).oscuro)
        XCTAssertTrue(TemaTokens.de(.tinta, sistemaOscuro: true).oscuro)
        XCTAssertTrue(TemaTokens.de(.tinta, sistemaOscuro: true).mono)
        XCTAssertFalse(TemaTokens.de(.papel, sistemaOscuro: false).mono)
    }

    func testEscalaDeDocePasosNeutraYOrdenada() {
        for escala in [Grises.escalaDia, Grises.escalaNoche] {
            XCTAssertEqual(escala.count, 12)
            XCTAssertEqual(Set(escala.map(\.nombre)).count, 12, "nombres repetidos")
            for p in escala { XCTAssertTrue(gris(p.valor), "\(p.nombre) no es gris") }
            for (a, b) in zip(escala, escala.dropFirst()) { XCTAssertGreaterThan(lum(a.valor), lum(b.valor), "\(a.nombre) → \(b.nombre)") }
        }
    }

    func testTokensSoloGrisesYContrasteAA() {
        for k in [Grises.dia, Grises.noche] {
            let modo = k.oscuro ? "noche" : "día"
            let todos = [k.fondo, k.superficie, k.texto, k.secundario, k.acento, k.sobreAcento, k.punto, k.contexto, k.sobreContexto,
                         k.progreso, k.sobreProgreso, k.atencion, k.titulo ?? 0, k.barra ?? 0, k.filo ?? 0, k.positivo ?? 0]
            for v in todos { XCTAssertTrue(gris(v), "\(modo): \(String(v, radix: 16)) no es gris") }
            for (nombre, fondo) in [("fondo", k.fondo), ("superficie", k.superficie), ("barra", k.barra ?? k.superficie)] {
                XCTAssertGreaterThanOrEqual(cr(k.texto, fondo), 7, "\(modo) texto sobre \(nombre)")
                XCTAssertGreaterThanOrEqual(cr(k.secundario, fondo), 4.5, "\(modo) secundario sobre \(nombre)")
                XCTAssertGreaterThanOrEqual(cr(k.positivo!, fondo), 4.5, "\(modo) positivo sobre \(nombre)")
                XCTAssertGreaterThanOrEqual(cr(k.atencion, fondo), 7, "\(modo) atención sobre \(nombre)")
                // Texto apagado (secundario al 75 %): solo decorativo, pero que se vea.
                XCTAssertGreaterThanOrEqual(cr(mezcla(k.secundario, fondo, 0.75), fondo), 3, "\(modo) apagado sobre \(nombre)")
                XCTAssertGreaterThanOrEqual(cr(mezcla(k.texto, fondo, Double(k.aroAlfa!)), fondo), 3, "\(modo) aro sobre \(nombre)")
            }
            XCTAssertGreaterThanOrEqual(cr(k.sobreAcento, k.acento), 7, "\(modo) sobre acento")
            XCTAssertGreaterThanOrEqual(cr(k.sobreProgreso, k.progreso), 7, "\(modo) sobre progreso")
            XCTAssertGreaterThanOrEqual(cr(k.sobreContexto, k.contexto), 7, "\(modo) sobre contexto")
            XCTAssertGreaterThanOrEqual(cr(k.superficie, k.fondo), 1.1, "\(modo) superficie separada del fondo")
            XCTAssertGreaterThan(cr(k.punto, k.fondo), 1.15, "\(modo) bolitas sin nada")
            // Lo bueno y lo que pide atención no pueden ser el mismo gris.
            XCTAssertGreaterThan(cr(k.positivo!, k.atencion), 1.5, "\(modo) positivo frente a atención")
        }
    }

    func testColoresDeUsuarioEnSuGris() {
        let muestras: [UInt32] = [0x000000, 0xFFFFFF, 0xE5484D, 0xFFADAD, 0x2463C9, 0xCAFFBF, 0x78716C, 0xF2C94C]
        for oscuro in [false, true] {
            let k = oscuro ? Grises.noche : Grises.dia
            for c in muestras {
                let g = Grises.deColor(c, oscuro: oscuro)
                XCTAssertTrue(gris(g))
                XCTAssertGreaterThanOrEqual(cr(g, k.fondo), 4.5, "\(String(c, radix: 16)) sobre el fondo")
                XCTAssertGreaterThanOrEqual(cr(g, k.superficie), 4.5, "\(String(c, radix: 16)) sobre la superficie")
            }
            // El más claro sigue siendo el más claro.
            XCTAssertGreaterThan(lum(Grises.deColor(0xFFADAD, oscuro: oscuro)), lum(Grises.deColor(0x2463C9, oscuro: oscuro)))
        }
    }

    // MARK: láminas

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

    private func inicio(_ v: VistaPlan) -> VistaInicio {
        let hoy = v.dia
        let semana = hoy.semanaLunesDomingo
        let conCosas: Set<LocalDay> = [semana[1], semana[2], semana[5]]
        let agenda = [VistaInicio.Cosa(id: "e1", hora: "09:00", titulo: "dentista", notas: "calle mayor 12", hecha: false, acento: false, tarea: nil)]
            + v.tareas.map { VistaInicio.Cosa(id: $0.id, hora: $0.hora, titulo: $0.titulo, notas: $0.notas, hecha: $0.hecha, acento: $0.arrastrada, tarea: $0) }
        return VistaInicio(hoy: hoy, semana: semana, conCosas: conCosas, agenda: agenda.sorted { ($0.hora ?? "") < ($1.hora ?? "") },
                           sinDia: v.sinDia, pendientes: 4, hechas: 1)
    }

    private func etiqueta(_ s: String) -> some View {
        Text(s).font(Tipo.poppins(13, .bold, estilo: .footnote)).foregroundStyle(Paleta.textoSecundario).padding(.top, 18)
    }

    private func piezas() -> some View {
        VStack(alignment: .leading, spacing: 8) {
            CabeceraApartado(titulo: "piezas", contexto: "sin color, por forma.") { EmptyView() }
            etiqueta("prioridad: peso y tinta.")
            FilaAgenda(hora: "09:00", titulo: "pagar el alquiler", hecho: false, prioridad: "alta", marcar: {})
            FilaAgenda(hora: "11:00", titulo: "llamar al banco", hecho: false, prioridad: "media", marcar: {})
            FilaAgenda(hora: "17:00", titulo: "ordenar fotos", hecho: false, prioridad: "baja", marcar: {})
            FilaAgenda(hora: nil, titulo: "arrastrada de ayer", hecho: false, acento: true, marcar: {})
            FilaAgenda(hora: "08:00", titulo: "hecha", hecho: true, marcar: {})
            etiqueta("barras: llena, hueca (va bien), rayada (atención).")
            BarraAvance(valor: 0.62, fondo: Paleta.borde, color: Paleta.acento, alto: 8)
            BarraAvance(valor: 0.45, fondo: Paleta.borde, color: Paleta.positivo, alto: 8, forma: .hueca)
            BarraAvance(valor: 1, fondo: Paleta.borde, color: Paleta.atencion, alto: 8, forma: .rayada)
            HStack {
                Text("+1.250,00 €").foregroundStyle(Paleta.positivo)
                Spacer()
                Text("−86,40 €").foregroundStyle(Paleta.atencion)
            }
            .font(Tipo.poppins(15, .semibold, estilo: .body)).monospacedDigit()
            etiqueta("categorías: cada color, su gris.")
            HStack(spacing: 8) {
                let colores = ["#E5484D", "#F2C94C", "#2463C9", "#30A46C", "#8E4EC6", ""]
                ForEach(0..<colores.count, id: \.self) { n in
                    IconoCategoria(icono: IconosCategoria.lista[n].clave, color: colores[n], tam: 36)
                }
            }
            etiqueta("ocio, nube y estados.")
            EstrellasOcio(valor: 3.5, tamano: 22)
            HStack(spacing: 16) {
                IndicadorSync(estado: .reposo)
                IndicadorSync(estado: .trayendo)
                IndicadorSync(estado: .error("sin red"))
            }
            FilaLibro(etiqueta: "gastado este mes.", valor: "642,10 €")
            Text("comida con marta").font(Tipo.cuerpo).foregroundStyle(Paleta.texto).frame(maxWidth: .infinity, alignment: .leading).campoCasa(activo: true)
            Button("guardar.") {}.buttonStyle(BotonPrincipal())
            Button("cancelar.") {}.buttonStyle(BotonSecundario())
            Button("eliminar.") {}.buttonStyle(BotonPeligro())
            Button("desactivado.") {}.buttonStyle(BotonPrincipal()).disabled(true)
            FilaAjuste(icono: "borrar", titulo: "eliminar mi cuenta.", peligro: true)
        }
    }

    func testLaminasDeTinta() throws {
        let antes = TemaActivo.elegido
        defer { TemaActivo.elegido = antes }
        TemaActivo.elegido = .tinta
        let v = plan()
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let ahora = cal.date(bySettingHour: 11, minute: 40, second: 0, of: Date())!
        for oscuro in [false, true] {
            let lamina = HStack(alignment: .top, spacing: 0) {
                VStack(spacing: 0) {
                    InicioCuerpo(vista: inicio(v), ahora: ahora, estado: .reposo).padding(.horizontal, Espacio.l - 4).padding(.top, 54)
                    Spacer(minLength: 0)
                    BarraBitacora(pestanas: PrincipalView.pestanas(secundaria: .calendario), activa: "inicio", elegir: { _ in }, capturar: {})
                        .padding(.bottom, 20)
                }
                .frame(width: 390, height: 1240, alignment: .top)
                VStack(spacing: 0) {
                    PlanCuerpo(carga: .lista(v), desplazamiento: .constant(0), estado: .reposo, pendientes: 0, aviso: nil)
                        .padding(.horizontal, Espacio.l - 4).padding(.top, 54)
                    Spacer(minLength: 0)
                    BarraBitacora(pestanas: PrincipalView.pestanas(secundaria: .calendario), activa: "plan", elegir: { _ in }, capturar: {})
                        .padding(.bottom, 20)
                }
                .frame(width: 390, height: 1240, alignment: .top)
                piezas().padding(.horizontal, 20).padding(.top, 54).frame(width: 390, height: 1240, alignment: .top)
            }
            .background(Paleta.fondo)
            .environment(\.colorScheme, oscuro ? .dark : .light)

            let r = ImageRenderer(content: lamina)
            r.scale = 1.5
            let png = try XCTUnwrap(r.uiImage?.pngData(), "no se pudo dibujar tinta")
            try FileManager.default.createDirectory(at: Self.carpeta, withIntermediateDirectories: true)
            try png.write(to: Self.carpeta.appendingPathComponent("tinta-" + (oscuro ? "noche" : "dia") + ".png"))
        }
    }
}
