import SwiftUI

// Panorama nativo (2.0): «a tener en cuenta.» en tarjeta oscura con lo que queda hoy, un bento de cifras que abre cada
// apartado, la puntualidad mensual de las tareas del plan (completadas en su día previsto) y las listas (js/listas.js),
// debajo como en la web. Las tarjetas elegibles de la PWA (apartadosConfig.panorama) siguen en la web: «ver el panorama
// completo.».
struct ResumenPanorama: Sendable, Equatable {
    struct Pendiente: Sendable, Equatable, Identifiable {
        let id: String
        let hora: String?
        let titulo: String
    }
    var puntualidad = Puntualidad()
    var pendientesHoy = 0
    var hechasHoy = 0
    var sinDia = 0
    var lo: [Pendiente] = []
    var listasPendientes = 0
    var listas = 0

    // Solo lectura: lo mismo que ya pintan Inicio y Listas, resumido.
    static func desde(_ doc: DocumentoBitacora) -> ResumenPanorama {
        var r = ResumenPanorama()
        r.puntualidad = Puntualidad.desde(doc)
        let v = VistaInicio.desde(doc)
        r.pendientesHoy = v.pendientes
        r.hechasHoy = v.hechas
        r.sinDia = v.sinDia.filter { !$0.hecha }.count
        r.lo = v.agenda.filter { !$0.hecha }.prefix(3).map { Pendiente(id: $0.id, hora: $0.hora, titulo: $0.titulo) }
        let l = VistaListas.desde(doc)
        r.listasPendientes = l.pendientes
        r.listas = l.cajas.count
        return r
    }
}

struct PanoramaView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var r: ResumenPanorama?
    @State private var mes: String?
    @State private var deshacer: DeshacerListas?

    private let columnas = [GridItem(.flexible(), spacing: Medida.entreTarjetas, alignment: .top),
                            GridItem(.flexible(), spacing: Medida.entreTarjetas, alignment: .top)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "panorama.", subtitulo: elegido.map { Self.nombreMes($0.mes) + "." })
                    .padding(.bottom, Medida.xxs)
                if let r {
                    aTenerEnCuenta(r).entradaEscalonada(0)
                    LazyVGrid(columns: columnas, spacing: Medida.entreTarjetas) {
                        TarjetaCifraPanorama(icono: "planner", etiqueta: "hoy", cifra: r.pendientesHoy,
                                             pie: r.hechasHoy == 1 ? "por hacer, 1 hecha." : "por hacer, \(r.hechasHoy) hechas.") { c.abrirApartado("planner") }
                            .entradaEscalonada(1)
                        TarjetaCifraPanorama(icono: "planner", etiqueta: "sin día", cifra: r.sinDia,
                                             pie: r.sinDia == 1 ? "tarea esperando día." : "tareas esperando día.") { c.abrirApartado("planner") }
                            .entradaEscalonada(2)
                        TarjetaCifraPanorama(icono: "listas", etiqueta: "listas", cifra: r.listasPendientes,
                                             pie: r.listas == 1 ? "por hacer en 1 lista." : "por hacer en \(r.listas) listas.") { c.abrirApartado("listas") }
                            .entradaEscalonada(3)
                        TarjetaCifraPanorama(icono: "home", etiqueta: "puntual", cifra: elegido?.porcentaje, sufijo: " %",
                                             pie: elegido.map { $0.total == 0 ? "sin tareas comparables." : "\($0.puntuales) de \($0.total) a su día." } ?? "aún sin datos.",
                                             accion: nil)
                            .entradaEscalonada(4)
                    }
                    puntualidad(r.puntualidad).entradaEscalonada(5)
                } else {
                    ProgressView().tint(Lienzo.tintaSecundaria).frame(maxWidth: .infinity).padding(.vertical, Medida.xxl)
                }
                ListasSeccion(deshacer: $deshacer).padding(.top, Medida.s)
                Button { c.web = Apartados.webURL("home") } label: {
                    FilaTarjeta(icono: "web", titulo: "ver el panorama completo.", detalle: "las tarjetas elegibles, en la web.") { FlechaFila() }
                        .tarjeta(relleno: Medida.s)
                }
                .buttonStyle(.pulsable(0.97))
                .padding(.top, Medida.s)
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
        .safeAreaInset(edge: .bottom) { BarraDeshacerListas(deshacer: $deshacer) }
        .animation(Muelle.modal, value: deshacer?.id)
        .refreshable { await c.sincronizar() }
        .task(id: c.revision) {
            let doc = await c.documentoVisible()
            guard let nuevo = await ultimaGana({ doc.map { ResumenPanorama.desde($0) } }) else { return }
            withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento)) { r = nuevo }
        }
    }

    private var elegido: Puntualidad.Mes? { r?.puntualidad.meses.first { $0.mes == mes } ?? r?.puntualidad.meses.last }

    // Lo importante, en oscuro: lo que queda hoy (eventos y tareas sin marcar, por hora) y, si no hay nada, dicho.
    private func aTenerEnCuenta(_ r: ResumenPanorama) -> some View {
        Button { c.abrirApartado("planner") } label: {
            TarjetaOscura {
                VStack(alignment: .leading, spacing: Medida.s) {
                    HStack(spacing: Medida.xs) {
                        IconoCuadrado(id: "planner", tono: .translucido, tamano: Medida.iconoPequeno)
                        Text("A TENER EN CUENTA").font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.sobreOscuroSuave)
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(Lienzo.sobreOscuroTenue)
                    }
                    if r.lo.isEmpty {
                        Text(r.hechasHoy > 0 ? "hoy ya está todo hecho." : "nada pendiente para hoy.")
                            .font(Letra.tituloTarjeta).foregroundStyle(Lienzo.sobreOscuro)
                    } else {
                        VStack(alignment: .leading, spacing: Medida.xs) {
                            ForEach(r.lo) { p in
                                HStack(alignment: .firstTextBaseline, spacing: Medida.s) {
                                    Text(p.hora ?? "hoy").font(Letra.hora).foregroundStyle(p.hora == nil ? Lienzo.sobreOscuroTenue : Lienzo.naranja)
                                        .frame(width: MedidaPanorama.anchoHora, alignment: .leading)
                                    Text(p.titulo).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.sobreOscuro).lineLimit(1)
                                }
                            }
                        }
                        if r.pendientesHoy > r.lo.count {
                            Text("y \(r.pendientesHoy - r.lo.count) más.").font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave)
                        }
                    }
                }
            }
        }
        .buttonStyle(.pulsable(0.98))
        .accessibilityLabel("a tener en cuenta")
        .accessibilityHint("abre el plan")
    }

    // Puntualidad: barras planas por mes, el elegido en carbón; sin anillos ni adornos.
    private func puntualidad(_ p: Puntualidad) -> some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            HStack(alignment: .firstTextBaseline) {
                Text("PUNTUALIDAD").font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.tintaTerciaria)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                if let m = elegido { Chip(texto: Self.nombreMes(m.mes)) }
            }
            HStack(alignment: .firstTextBaseline, spacing: Medida.xs) {
                Text(elegido?.porcentaje.map { "\($0) %" } ?? "—")
                    .font(Letra.numeroGrande).foregroundStyle(Lienzo.tinta)
                    .contentTransition(.numericText())
                Text(elegido.map { $0.total == 0 ? "ninguna tarea con día se completó este mes." : "\($0.puntuales) de \($0.total) tareas hechas el día previsto." } ?? "")
                    .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(2)
            }
            BarrasPuntualidadPanorama(meses: p.meses, elegido: elegido?.mes) { m in
                guard m != elegido?.mes else { return }
                Haptica.ligera()
                withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { mes = m }
            }
            Text(p.desde.map { "datos desde el \(FichaEventoView.fecha(LocalDay(iso: $0) ?? CalendarioBitacora.madrid.dia(de: Date())))." } ?? "aún sin datos.")
                .font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
            Text("cuentan las tareas del plan con día. no entran las sin día, las rutinas, los eventos ni las entregas; lo marcado antes del registro tampoco.")
                .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                .fixedSize(horizontal: false, vertical: true)
        }
        .tarjeta()
    }

    static let meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    static func nombreMes(_ m: String) -> String { (Int(m.suffix(2)).map { meses[$0 - 1] } ?? m) + " " + m.prefix(4) }
    static func inicialMes(_ m: String) -> String { Int(m.suffix(2)).map { String(meses[$0 - 1].prefix(1)) } ?? "" }
}

// Tarjeta del bento: icono del apartado, etiqueta pequeña, cifra grande y una línea. Con acción, abre su apartado.
struct TarjetaCifraPanorama: View {
    let icono: String
    let etiqueta: String
    let cifra: Int?
    var sufijo = ""
    let pie: String
    var accion: (() -> Void)?

    var body: some View {
        if let accion {
            Button(action: accion) { cuerpo }
                .buttonStyle(.pulsable(0.96))
                .accessibilityHint("abre el apartado")
        } else {
            cuerpo
        }
    }

    private var cuerpo: some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            HStack(alignment: .center) {
                IconoCuadrado(id: icono, tono: .claro, tamano: Medida.iconoPequeno)
                Spacer()
                if accion != nil { FlechaFila() }
            }
            Text(cifra.map { "\($0)\(sufijo)" } ?? "—")
                .font(Letra.numeroGrande).foregroundStyle(Lienzo.tinta)
                .contentTransition(.numericText())
                .padding(.top, Medida.xxs)
            Text(etiqueta.uppercased()).font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.tintaTerciaria)
            Text(pie).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: MedidaPanorama.altoCifra, alignment: .topLeading)
        .tarjeta()
        .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

// Doce barras planas (una por mes); tocar una la elige. La de cada mes sobre un carril sutil, la elegida en carbón.
struct BarrasPuntualidadPanorama: View {
    let meses: [Puntualidad.Mes]
    let elegido: String?
    let elegir: (String) -> Void
    var body: some View {
        HStack(alignment: .bottom, spacing: MedidaPanorama.entreBarras) {
            ForEach(meses) { m in
                let on = m.mes == elegido
                Button { elegir(m.mes) } label: {
                    VStack(spacing: MedidaPanorama.entreBarras) {
                        ZStack(alignment: .bottom) {
                            RoundedRectangle(cornerRadius: MedidaPanorama.radioBarra, style: .continuous).fill(Lienzo.sutilSuave).frame(height: MedidaPanorama.altoBarras)
                            RoundedRectangle(cornerRadius: MedidaPanorama.radioBarra, style: .continuous).fill(on ? Lienzo.oscuro : Lienzo.tintaTerciaria)
                                .frame(height: m.porcentaje.map { max(3, CGFloat($0) / 100 * MedidaPanorama.altoBarras) } ?? 0)
                        }
                        Text(PanoramaView.inicialMes(m.mes)).font(Letra.pie)
                            .foregroundStyle(on ? Lienzo.tinta : Lienzo.tintaTerciaria)
                    }
                    .frame(maxWidth: .infinity, minHeight: Medida.toque)
                    .contentShape(Rectangle())
                }
                .buttonStyle(Pulsable(escala: 0.92, haptica: false))
                .accessibilityLabel(PanoramaView.nombreMes(m.mes))
                .accessibilityValue(m.porcentaje.map { "\($0) por ciento, \(m.puntuales) de \(m.total)" } ?? "sin tareas comparables")
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

// Medidas propias de Panorama (para subir a DesignSystem/V2 si otra pantalla las necesita).
enum MedidaPanorama {
    static let radioBarra: CGFloat = 4
    static let altoBarras: CGFloat = 88
    static let entreBarras: CGFloat = 6
    static let altoCifra: CGFloat = 132
    static let anchoHora: CGFloat = 40
    // Listas
    static let subrayado: CGFloat = 9            // subrayado de rotulador del título de una caja
    static let anchoPlegar: CGFloat = 26         // columna del triángulo de plegar (y sangría del filete)
    static let anchoMenuFila: CGFloat = 36       // «···» de cada tarea
}
