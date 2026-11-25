import SwiftUI

// Conexiones (vista web `graph`, renderGraph en js/bajo-demanda/conexiones.js): arriba el centro elegido con su
// constelación y la lista de lo relacionado (tocar abre su apartado); debajo, los centros por tipo en tarjetas pequeñas.

struct ConexionesView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var centros: [CentroConexion]?
    @State private var elegido: String?
    // 3.2: plegar la lista de relacionados se recuerda (en este iPhone) hasta que se vuelva a abrir.
    @AppStorage("bitacora.conexiones.relacionados") private var relacionadosAbiertos = true

    var body: some View {
        ScrollViewReader { lector in
            ScrollView {
                VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                    Color.clear.frame(height: 0).id("arriba")
                    if let l = centros { contenido(l, lector) }
                    else {
                        CabeceraPagina(titulo: "conexiones.")
                        ProgressView().tint(Lienzo.tintaTerciaria).frame(maxWidth: .infinity).padding(.top, Medida.xl)
                    }
                }
                .padding(.horizontal, Medida.margen)
                .padding(.top, Medida.xs)
                .padding(.bottom, Medida.xl)
                .animation(Muelle.o(Muelle.expandir, reducido: sinMovimiento), value: elegido)
            }
            .scrollIndicators(.hidden)
        }
        .fondoLienzo()
        .refreshable { await c.sincronizar() }
        .tareaVisible(id: c.revision) { await cargar() }
    }

    @ViewBuilder private func contenido(_ l: [CentroConexion], _ lector: ScrollViewProxy) -> some View {
        let total = Set(l.flatMap { $0.items.map(\.id) }).count
        CabeceraPagina(titulo: "conexiones.", subtitulo: l.isEmpty ? nil
                       : "\(total) \(total == 1 ? "entrada relacionada" : "entradas relacionadas") en \(l.count) \(l.count == 1 ? "grupo" : "grupos").")
            .padding(.bottom, Medida.xxs)
        if l.isEmpty {
            TarjetaInvitacion(frase: "todavía no hay nada", destacado: "que conectar.").entradaEscalonada(0)
            Text("en cuanto tengas viajes con fechas, partidos, etiquetas o asignaturas, aquí aparecerá todo lo que se relaciona entre sí.")
                .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).padding(.horizontal, Medida.xxs)
        } else if let actual = l.first(where: { $0.id == elegido }) ?? LecturaConexiones.principal(l) {
            tarjetaCentro(actual).entradaEscalonada(0)
            SeccionPlegable(titulo: "Relacionados.", detalle: "\(actual.items.count)", abierta: $relacionadosAbiertos) {
                TarjetaLista(elementos: actual.items) { e in filaEntrada(e) }
                    .padding(.top, Medida.xxs)
            }
            .padding(.top, Medida.xxs)
            .id(actual.id)
            .transition(.opacity)
            .entradaEscalonada(1)
            ForEach(Array(LecturaConexiones.tipos.map(\.tipo).enumerated()), id: \.element) { i, tipo in
                let grupo = LecturaConexiones.delTipo(tipo, l)
                if !grupo.isEmpty {
                    VStack(alignment: .leading, spacing: Medida.xs) {
                        RotuloPanorama(texto: LecturaConexiones.titulo(tipo))
                        ScrollView(.horizontal) {
                            HStack(spacing: Medida.xs) {
                                ForEach(grupo.prefix(24)) { centro in
                                    tarjetaPequena(centro, activo: centro.id == actual.id) {
                                        Haptica.ligera()
                                        elegido = centro.id
                                        withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento)) { lector.scrollTo("arriba", anchor: .top) }
                                    }
                                }
                            }
                            .padding(.horizontal, Medida.margen)
                            .padding(.vertical, Medida.xxs)
                        }
                        .scrollIndicators(.hidden)
                        .padding(.horizontal, -Medida.margen)
                    }
                    .padding(.top, Medida.xs)
                    .entradaEscalonada(i + 2)
                }
            }
        }
    }

    private func tarjetaCentro(_ centro: CentroConexion) -> some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            HStack(alignment: .top, spacing: Medida.s) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(RotuloPanorama.frase(LecturaConexiones.titulo(centro.tipo))).font(Letra.pieFuerte)
                        .foregroundStyle(Lienzo.tintaSecundaria)
                    Text(centro.nombre).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta).lineLimit(2)
                    if !centro.sub.isEmpty {
                        Text(centro.sub).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    }
                }
                Spacer(minLength: 0)
                if let tipo = centro.entradaTipo {
                    Button("abrir.") { Haptica.ligera(); c.abrirApartado(TipoEntrada.vista(tipo)) }
                        .buttonStyle(.capsula(.claro))
                }
            }
            ConstelacionConexion(centro: centro)
                .id(centro.id)
            if centro.items.count > ConstelacionConexion.maximo {
                Text("y \(centro.items.count - ConstelacionConexion.maximo) más en la lista.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    .frame(maxWidth: .infinity)
            }
        }
        .tarjeta()
    }

    private func tarjetaPequena(_ centro: CentroConexion, activo: Bool, tocar: @escaping () -> Void) -> some View {
        Button(action: tocar) {
            VStack(alignment: .leading, spacing: 4) {
                Text(centro.nombre).font(Letra.cuerpoFuerte).lineLimit(2).multilineTextAlignment(.leading)
                    .foregroundStyle(activo ? Lienzo.sobreOscuro : Lienzo.tinta)
                Spacer(minLength: 0)
                Text("\(centro.items.count) \(centro.items.count == 1 ? "cosa" : "cosas")").font(Letra.pie).monospacedDigit()
                    .foregroundStyle(activo ? Lienzo.sobreOscuroSuave : Lienzo.tintaSecundaria)
            }
            .frame(width: 128, height: 74, alignment: .topLeading)
            .padding(14)
            .background(activo ? Lienzo.oscuro : Lienzo.tarjeta, in: RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
            .overlay { if !activo { RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous).strokeBorder(Lienzo.filo) } }
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        }
        .buttonStyle(.pulsable(0.95))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(activo ? .isSelected : [])
    }

    private func filaEntrada(_ e: EntradaSuelta) -> some View {
        Button { Haptica.ligera(); c.abrirApartado(TipoEntrada.vista(e.tipo)) } label: {
            HStack(spacing: Medida.s) {
                IconoCuadrado(id: TipoEntrada.icono(e.tipo))
                VStack(alignment: .leading, spacing: 2) {
                    Text(e.titulo.isEmpty ? "sin título." : e.titulo).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    Text([TipoEntrada.singular(e.tipo), LecturaConexiones.fechaCorta(e.fecha)].filter { !$0.isEmpty }.joined(separator: ", "))
                        .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                }
                Spacer(minLength: Medida.xs)
                FlechaFila()
            }
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pulsable(0.98))
        .accessibilityElement(children: .combine)
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        guard let r = await ultimaGana({ doc.map { LecturaConexiones.centros($0) } }), let l = r else { return }
        centros = l
        if let e = elegido, !l.contains(where: { $0.id == e }) { elegido = nil }
    }
}

// La constelación (renderConstelacion): el centro en naranja y, alrededor, hasta 16 cosas en una elipse (en dos anillos
// si son más de 10, para que no se pisen los nombres). Se dibuja con Canvas y entra con un muelle al cambiar de centro.
struct ConstelacionConexion: View {
    static let maximo = 16
    let centro: CentroConexion
    @State private var visto = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        let items = Array(centro.items.prefix(Self.maximo))
        Canvas { ctx, size in
            let medio = CGPoint(x: size.width / 2, y: size.height / 2)
            let rx = size.width * 0.36, ry = size.height * 0.38
            let n = items.count
            var puntos: [(CGPoint, String)] = []
            for (i, e) in items.enumerated() {
                let ang = -Double.pi / 2 + Double(i) / Double(max(n, 1)) * 2 * Double.pi
                let k: CGFloat = n > 10 && i % 2 == 1 ? 0.62 : 1
                puntos.append((CGPoint(x: medio.x + CGFloat(cos(ang)) * rx * k, y: medio.y + CGFloat(sin(ang)) * ry * k), e.titulo))
            }
            for (p, _) in puntos {
                var linea = Path()
                linea.move(to: medio)
                linea.addLine(to: p)
                ctx.stroke(linea, with: .color(Lienzo.filoFuerte), lineWidth: 1)
            }
            for (p, titulo) in puntos {
                ctx.fill(Path(ellipseIn: CGRect(x: p.x - 5, y: p.y - 5, width: 10, height: 10)), with: .color(Lienzo.oscuro))
                ctx.draw(Text(Self.corta(titulo, 14)).font(Letra.pie).foregroundColor(Lienzo.tintaSecundaria),
                         at: CGPoint(x: p.x, y: p.y + (p.y >= medio.y ? 15 : -15)), anchor: .center)
            }
            let r: CGFloat = 40
            ctx.fill(Path(ellipseIn: CGRect(x: medio.x - r, y: medio.y - r, width: r * 2, height: r * 2)), with: .color(Lienzo.naranja))
            ctx.draw(Text(Self.corta(centro.nombre, 12)).font(Letra.pieFuerte).foregroundColor(Lienzo.sobreNaranja), at: medio, anchor: .center)
        }
        .frame(height: 280)
        .scaleEffect(visto ? 1 : 0.94)
        .opacity(visto ? 1 : 0)
        .onAppear { withAnimation(Muelle.o(Muelle.entrada, reducido: sinMovimiento)) { visto = true } }
        .accessibilityElement()
        .accessibilityLabel("\(centro.nombre) y \(centro.items.count) cosas relacionadas")
    }

    static func corta(_ t: String, _ max: Int) -> String { t.count > max ? String(t.prefix(max - 1)) + "…" : t }
}
