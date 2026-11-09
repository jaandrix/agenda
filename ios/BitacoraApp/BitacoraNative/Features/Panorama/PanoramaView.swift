import SwiftUI

// Panorama nativo, primera pieza: puntualidad mensual de las tareas del plan (completadas en su día previsto).
// Las tarjetas elegibles de la PWA (apartadosConfig.panorama) siguen en la web: «ver el panorama completo.».
struct PanoramaView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var p: Puntualidad?
    @State private var mes: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                CabeceraContexto(titulo: "panorama", detalle: elegido.map { Self.nombreMes($0.mes) }) {
                    if let m = elegido {
                        Text(m.porcentaje.map { "\($0) %" } ?? "sin tareas comparables.")
                            .font(Tipo.poppins(m.porcentaje == nil ? 20 : 52, .bold, estilo: .largeTitle)).monospacedDigit()
                            .foregroundStyle(Paleta.sobreContexto).padding(.top, Espacio.m)
                        Text(m.total == 0 ? "ninguna tarea con día se completó este mes." : "\(m.puntuales) de \(m.total) tareas hechas el día previsto.")
                            .font(Tipo.pie).foregroundStyle(Paleta.sobreContextoSuave)
                        BarraAvance(valor: Double(m.puntuales) / Double(max(m.total, 1))).padding(.top, Espacio.m)
                    }
                }
                VStack(alignment: .leading, spacing: 0) {
                    CabeceraSeccion(titulo: "puntualidad.", detalle: p?.desde.map { "datos desde el \(FichaEventoView.fecha(LocalDay(iso: $0) ?? CalendarioBitacora.madrid.dia(de: Date())))." } ?? "aún sin datos.")
                    if let p {
                        HStack(alignment: .bottom, spacing: 6) {
                            ForEach(p.meses) { m in
                                Button { mes = m.mes } label: {
                                    VStack(spacing: 6) {
                                        ZStack(alignment: .bottom) {
                                            RoundedRectangle(cornerRadius: 3).fill(Paleta.tinteTexto).frame(height: 96)
                                            RoundedRectangle(cornerRadius: 3).fill(m.mes == elegido?.mes ? Paleta.texto : Paleta.bordeFuerte)
                                                .frame(height: m.porcentaje.map { max(3, CGFloat($0) * 0.96) } ?? 0)
                                        }
                                        Text(Self.inicialMes(m.mes)).font(Tipo.poppins(11, .medium, estilo: .caption2))
                                            .foregroundStyle(m.mes == elegido?.mes ? Paleta.texto : Paleta.textoSecundario)
                                    }
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(Self.nombreMes(m.mes))
                                .accessibilityValue(m.porcentaje.map { "\($0) por ciento, \(m.puntuales) de \(m.total)" } ?? "sin tareas comparables")
                            }
                        }
                        .padding(.top, Espacio.s)
                        Text("cuentan las tareas del plan con día. no entran las sin día, las rutinas, los eventos ni las entregas; lo marcado antes del registro tampoco.")
                            .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.top, Espacio.m)
                    }
                    Button { c.web = Apartados.webURL("home") } label: { FilaLibro(etiqueta: "ver el panorama completo.", flecha: true) }
                        .buttonStyle(.plain).padding(.top, Espacio.l)
                }
                .modifier(HojaContenido())
            }
        }
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .task(id: c.informe.revision) {
            let doc = await c.documentoVisible()
            p = await Task.detached(priority: .userInitiated) { doc.map { Puntualidad.desde($0) } }.value
        }
    }

    private var elegido: Puntualidad.Mes? { p?.meses.first { $0.mes == mes } ?? p?.meses.last }

    static let meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    static func nombreMes(_ m: String) -> String { (Int(m.suffix(2)).map { meses[$0 - 1] } ?? m) + " " + m.prefix(4) }
    static func inicialMes(_ m: String) -> String { Int(m.suffix(2)).map { String(meses[$0 - 1].prefix(1)) } ?? "" }
}
