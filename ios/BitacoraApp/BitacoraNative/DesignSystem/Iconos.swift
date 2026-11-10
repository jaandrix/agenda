import SwiftUI

// Iconos propios de Bitácora en SwiftUI (sin SF Symbols): sólidos y geométricos, como los SVG de la web
// (APUNTAR_ICONOS). Heredan el color con foregroundStyle.
struct IconoApunte: View {
    let tipo: String

    var body: some View {
        GeometryReader { g in
            let s = min(g.size.width, g.size.height) / 100
            dibujo.scaleEffect(s, anchor: .topLeading).frame(width: 100, height: 100, alignment: .topLeading)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityHidden(true)
    }

    @ViewBuilder private var dibujo: some View {
        switch tipo {
        case "tarea":
            ZStack(alignment: .topLeading) {
                ForEach(0..<3, id: \.self) { i in
                    Circle().frame(width: 18, height: 18).offset(x: 8, y: CGFloat(13 + 28 * i))
                    RoundedRectangle(cornerRadius: 6).frame(width: [58, 46, 52][i], height: 12).offset(x: 34, y: CGFloat(16 + 28 * i))
                }
            }
        case "evento":
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 12).frame(width: 84, height: 74).offset(x: 8, y: 18)
                RoundedRectangle(cornerRadius: 4).frame(width: 12, height: 16).offset(x: 24, y: 6)
                RoundedRectangle(cornerRadius: 4).frame(width: 12, height: 16).offset(x: 64, y: 6)
                RoundedRectangle(cornerRadius: 4).frame(width: 60, height: 40).offset(x: 20, y: 40).blendMode(.destinationOut)
                RoundedRectangle(cornerRadius: 4).frame(width: 16, height: 16).offset(x: 30, y: 50)
            }.compositingGroup()
        case "gasto":
            ZStack(alignment: .topLeading) {
                Circle().frame(width: 88, height: 88).offset(x: 6, y: 6)
                Rectangle().frame(width: 40, height: 11).offset(x: 30, y: 38).blendMode(.destinationOut)
                Rectangle().frame(width: 40, height: 11).offset(x: 30, y: 54).blendMode(.destinationOut)
            }.compositingGroup()
        case "nota":
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 12).frame(width: 80, height: 88).offset(x: 8, y: 6)
                Rectangle().frame(width: 52, height: 10).offset(x: 24, y: 46).blendMode(.destinationOut)
                Rectangle().frame(width: 40, height: 10).offset(x: 24, y: 66).blendMode(.destinationOut)
            }.compositingGroup()
        case "compra":
            ZStack(alignment: .topLeading) {
                Path { p in p.move(to: .init(x: 6, y: 12)); p.addLine(to: .init(x: 22, y: 12)); p.addLine(to: .init(x: 34, y: 62))
                    p.addLine(to: .init(x: 82, y: 62)); p.addLine(to: .init(x: 92, y: 26)); p.addLine(to: .init(x: 32, y: 26)); p.addLine(to: .init(x: 29, y: 12)); p.closeSubpath() }
                Circle().frame(width: 16, height: 16).offset(x: 32, y: 74)
                Circle().frame(width: 16, height: 16).offset(x: 68, y: 74)
            }
        case "rutina":
            ZStack {
                Circle().stroke(lineWidth: 14).frame(width: 74, height: 74)
                Circle().frame(width: 24, height: 24)
            }.frame(width: 100, height: 100)
        case "viaje":
            Path { p in
                p.move(to: .init(x: 50, y: 4)); p.addLine(to: .init(x: 60, y: 38)); p.addLine(to: .init(x: 92, y: 52)); p.addLine(to: .init(x: 92, y: 62))
                p.addLine(to: .init(x: 58, y: 52)); p.addLine(to: .init(x: 54, y: 80)); p.addLine(to: .init(x: 64, y: 88)); p.addLine(to: .init(x: 64, y: 96))
                p.addLine(to: .init(x: 50, y: 90)); p.addLine(to: .init(x: 36, y: 96)); p.addLine(to: .init(x: 36, y: 88)); p.addLine(to: .init(x: 46, y: 80))
                p.addLine(to: .init(x: 42, y: 52)); p.addLine(to: .init(x: 8, y: 62)); p.addLine(to: .init(x: 8, y: 52)); p.addLine(to: .init(x: 40, y: 38)); p.closeSubpath()
            }
        default:
            Path { p in
                p.move(to: .init(x: 10, y: 14)); p.addLine(to: .init(x: 44, y: 14)); p.addQuadCurve(to: .init(x: 54, y: 24), control: .init(x: 54, y: 14))
                p.addLine(to: .init(x: 54, y: 90)); p.addQuadCurve(to: .init(x: 46, y: 82), control: .init(x: 54, y: 82)); p.addLine(to: .init(x: 10, y: 82)); p.closeSubpath()
                p.move(to: .init(x: 90, y: 14)); p.addLine(to: .init(x: 62, y: 14)); p.addQuadCurve(to: .init(x: 54, y: 22), control: .init(x: 54, y: 14))
                p.addLine(to: .init(x: 54, y: 90)); p.addQuadCurve(to: .init(x: 62, y: 82), control: .init(x: 54, y: 82)); p.addLine(to: .init(x: 90, y: 82)); p.closeSubpath()
            }
        }
    }
}

// Catálogo común (doc 03): lienzo de 24, trazo de 1,9 con extremos y uniones redondos, siluetas simples y un solo
// detalle lleno que, activo, toma el color de `detalle`. Sin SF Symbols ni letras. La barra y el menú salen de aquí.
struct Icono: View {
    let id: String
    var activo = false
    var detalle: Color = Paleta.acento

    // Vistas de la web → metáfora del catálogo.
    static func deVista(_ vista: String) -> String {
        switch vista {
        case "calendar": "calendario"
        case "home": "panorama"
        case "planner": "plan"
        case "compra": "despensa"
        case "habits": "rutinas"
        case "notes": "notas"
        case "events": "eventos"
        case "finances": "finanzas"
        case "work": "empleo"
        case "studies", "estudiar", "universidad": "estudios"
        case "documents": "documentos"
        case "goals": "objetivos"
        case "projects": "proyectos"
        case "links": "enlaces"
        case "culture": "ocio"
        case "friends": "social"
        case "travels": "viajes"
        case "actualizaciones": "envios"
        case "collectibles": "coleccionables"
        case "tags": "etiquetas"
        case "graph": "conexiones"
        case "bandeja": "propuestas"
        case "suggestions": "sugerencias"
        case "settings": "ajustes"
        default: vista
        }
    }

    private var trazo: StrokeStyle { StrokeStyle(lineWidth: 1.9, lineCap: .round, lineJoin: .round) }
    private var tinta: AnyShapeStyle { activo ? AnyShapeStyle(detalle) : AnyShapeStyle(.foreground) }

    private func t(_ f: @escaping (inout Path) -> Void) -> some View { Path { p in f(&p) }.stroke(style: trazo) }
    private func punto(_ x: CGFloat, _ y: CGFloat, _ d: CGFloat = 3.4) -> some View {
        Circle().fill(tinta).frame(width: d, height: d).position(x: x, y: y)
    }
    private func solido(_ x: CGFloat, _ y: CGFloat, _ d: CGFloat) -> some View {
        Circle().fill(.foreground).frame(width: d, height: d).position(x: x, y: y)
    }
    private func aro(_ x: CGFloat, _ y: CGFloat, _ d: CGFloat) -> some View {
        Circle().stroke(style: trazo).frame(width: d, height: d).position(x: x, y: y)
    }
    private func lleno(_ f: @escaping (inout Path) -> Void) -> some View { Path { p in f(&p) }.fill(tinta) }
    private func caja(_ r: CGRect, _ radio: CGFloat) -> some View {
        Path { $0.addRoundedRect(in: r, cornerSize: CGSize(width: radio, height: radio), style: .continuous) }.stroke(style: trazo)
    }
    private func arco(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat, desde: CGFloat, hasta: CGFloat, giro: Double = 0) -> some View {
        Circle().trim(from: desde, to: hasta).stroke(style: trazo).frame(width: r * 2, height: r * 2)
            .rotationEffect(.degrees(giro)).position(x: x, y: y)
    }

    var body: some View {
        ZStack { dibujo }
            .frame(width: 24, height: 24)
            .accessibilityHidden(true)
    }

    @ViewBuilder private var dibujo: some View {
        switch id {
        case "inicio":
            caja(CGRect(x: 3, y: 4, width: 8, height: 16), 3)
            caja(CGRect(x: 13, y: 4, width: 8, height: 16), 3)
            punto(17, 9)
        case "plan":
            t { p in
                p.move(to: .init(x: 6.8, y: 16.6)); p.addLine(to: .init(x: 10.2, y: 13.4))
                p.move(to: .init(x: 13.8, y: 10.6)); p.addLine(to: .init(x: 16.8, y: 7.8))
            }
            aro(5, 18, 4.6)
            aro(12, 12, 4.6)
            punto(19, 6, 6.4)
        case "calendario":
            t { p in
                p.addRoundedRect(in: CGRect(x: 3, y: 4.5, width: 18, height: 16), cornerSize: CGSize(width: 5, height: 5), style: .continuous)
                p.move(to: .init(x: 3.5, y: 9.5)); p.addLine(to: .init(x: 20.5, y: 9.5))
                p.move(to: .init(x: 8, y: 3)); p.addLine(to: .init(x: 8, y: 6.5))
                p.move(to: .init(x: 16, y: 3)); p.addLine(to: .init(x: 16, y: 6.5))
            }
            punto(15.5, 15, activo ? 4.6 : 3.6)
        case "finanzas":
            t { p in
                p.addRoundedRect(in: CGRect(x: 3, y: 6.5, width: 18, height: 13), cornerSize: CGSize(width: 4, height: 4), style: .continuous)
                p.move(to: .init(x: 6, y: 6.5)); p.addLine(to: .init(x: 15, y: 3.5)); p.addLine(to: .init(x: 16.5, y: 6.5))
            }
            Circle().fill(tinta).frame(width: 5.4, height: 5.4).position(x: 16, y: 13)
        case "menu":
            t { p in for y in [7.0, 12.0, 17.0] { p.move(to: .init(x: 9.5, y: y)); p.addLine(to: .init(x: 20, y: y)) } }
            solido(4.6, 7, 3)
            punto(4.6, 12, 3)
            solido(4.6, 17, 3)
        case "apuntar":
            Path { p in
                p.move(to: .init(x: 12, y: 4.5)); p.addLine(to: .init(x: 12, y: 19.5))
                p.move(to: .init(x: 4.5, y: 12)); p.addLine(to: .init(x: 19.5, y: 12))
            }.stroke(style: StrokeStyle(lineWidth: 2.8, lineCap: .round))
            Circle().fill(detalle).frame(width: 4, height: 4).position(x: 19, y: 19)
        case "panorama":
            caja(CGRect(x: 3.5, y: 3.5, width: 7.5, height: 7.5), 2.5)
            caja(CGRect(x: 13, y: 3.5, width: 7.5, height: 7.5), 2.5)
            caja(CGRect(x: 3.5, y: 13, width: 7.5, height: 7.5), 2.5)
            lleno { $0.addRoundedRect(in: CGRect(x: 13, y: 13, width: 7.5, height: 7.5), cornerSize: CGSize(width: 2.5, height: 2.5), style: .continuous) }
        case "despensa":
            t { p in
                p.move(to: .init(x: 3.5, y: 10)); p.addLine(to: .init(x: 20.5, y: 10)); p.addLine(to: .init(x: 18.2, y: 19.5))
                p.addLine(to: .init(x: 5.8, y: 19.5)); p.closeSubpath()
                p.move(to: .init(x: 8, y: 10)); p.addQuadCurve(to: .init(x: 16, y: 10), control: .init(x: 12, y: 1.5))
            }
            punto(12, 14.8)
        case "rutinas":
            arco(12, 12, 8, desde: 0.08, hasta: 0.9, giro: -90)
            t { p in p.move(to: .init(x: 8.5, y: 12.2)); p.addLine(to: .init(x: 11, y: 14.6)); p.addLine(to: .init(x: 15.6, y: 9.6)) }
            punto(16.4, 5.4, 3.2)
        case "notas":
            t { p in
                p.move(to: .init(x: 5, y: 3.5)); p.addLine(to: .init(x: 14, y: 3.5)); p.addLine(to: .init(x: 19, y: 8.5))
                p.addLine(to: .init(x: 19, y: 20.5)); p.addLine(to: .init(x: 5, y: 20.5)); p.closeSubpath()
                p.move(to: .init(x: 14, y: 3.8)); p.addLine(to: .init(x: 14, y: 8.5)); p.addLine(to: .init(x: 18.7, y: 8.5))
                p.move(to: .init(x: 8.5, y: 13)); p.addLine(to: .init(x: 15.5, y: 13))
            }
            punto(9, 16.8, 3)
        case "eventos":
            t { p in
                p.move(to: .init(x: 3.5, y: 6.5)); p.addLine(to: .init(x: 20.5, y: 6.5)); p.addLine(to: .init(x: 20.5, y: 9.8))
                p.addQuadCurve(to: .init(x: 20.5, y: 14.2), control: .init(x: 17.6, y: 12)); p.addLine(to: .init(x: 20.5, y: 17.5))
                p.addLine(to: .init(x: 3.5, y: 17.5)); p.addLine(to: .init(x: 3.5, y: 14.2))
                p.addQuadCurve(to: .init(x: 3.5, y: 9.8), control: .init(x: 6.4, y: 12)); p.closeSubpath()
            }
            punto(12, 12)
        case "empleo":
            t { p in
                p.addRoundedRect(in: CGRect(x: 3.5, y: 8, width: 17, height: 12), cornerSize: CGSize(width: 3, height: 3), style: .continuous)
                p.move(to: .init(x: 9, y: 8)); p.addLine(to: .init(x: 9, y: 6)); p.addQuadCurve(to: .init(x: 10.5, y: 4.5), control: .init(x: 9, y: 4.5))
                p.addLine(to: .init(x: 13.5, y: 4.5)); p.addQuadCurve(to: .init(x: 15, y: 6), control: .init(x: 15, y: 4.5)); p.addLine(to: .init(x: 15, y: 8))
                p.move(to: .init(x: 3.8, y: 13)); p.addLine(to: .init(x: 9.6, y: 13))
                p.move(to: .init(x: 14.4, y: 13)); p.addLine(to: .init(x: 20.2, y: 13))
            }
            punto(12, 13, 3.6)
        case "estudios":
            t { p in
                p.move(to: .init(x: 12, y: 7)); p.addCurve(to: .init(x: 3, y: 5.5), control1: .init(x: 9.5, y: 5), control2: .init(x: 6, y: 4.8))
                p.addLine(to: .init(x: 3, y: 18)); p.addCurve(to: .init(x: 12, y: 19.5), control1: .init(x: 6, y: 17.3), control2: .init(x: 9.5, y: 17.8))
                p.addCurve(to: .init(x: 21, y: 18), control1: .init(x: 14.5, y: 17.8), control2: .init(x: 18, y: 17.3))
                p.addLine(to: .init(x: 21, y: 5.5)); p.addCurve(to: .init(x: 12, y: 7), control1: .init(x: 18, y: 4.8), control2: .init(x: 14.5, y: 5))
                p.move(to: .init(x: 12, y: 7)); p.addLine(to: .init(x: 12, y: 19.5))
            }
            lleno { p in
                p.move(to: .init(x: 15.5, y: 5.8)); p.addLine(to: .init(x: 18.5, y: 5.3)); p.addLine(to: .init(x: 18.5, y: 11))
                p.addLine(to: .init(x: 17, y: 9.8)); p.addLine(to: .init(x: 15.5, y: 11)); p.closeSubpath()
            }
        case "profesorado":
            t { p in
                p.addRoundedRect(in: CGRect(x: 3, y: 4, width: 18, height: 12), cornerSize: CGSize(width: 3, height: 3), style: .continuous)
                p.move(to: .init(x: 8, y: 16)); p.addLine(to: .init(x: 6.5, y: 20.5))
                p.move(to: .init(x: 16, y: 16)); p.addLine(to: .init(x: 17.5, y: 20.5))
                p.move(to: .init(x: 11, y: 10)); p.addLine(to: .init(x: 17, y: 10))
            }
            punto(7.5, 10)
        case "documentos":
            t { p in
                p.move(to: .init(x: 8, y: 6.5)); p.addLine(to: .init(x: 8, y: 5.5)); p.addQuadCurve(to: .init(x: 10, y: 3.5), control: .init(x: 8, y: 3.5))
                p.addLine(to: .init(x: 18, y: 3.5)); p.addQuadCurve(to: .init(x: 20, y: 5.5), control: .init(x: 20, y: 3.5))
                p.addLine(to: .init(x: 20, y: 15.5)); p.addQuadCurve(to: .init(x: 18, y: 17.5), control: .init(x: 20, y: 17.5)); p.addLine(to: .init(x: 16, y: 17.5))
                p.addRoundedRect(in: CGRect(x: 4, y: 6.5, width: 12, height: 14), cornerSize: CGSize(width: 2.5, height: 2.5), style: .continuous)
            }
            punto(10, 13.5)
        case "objetivos":
            arco(10.5, 13.5, 7.5, desde: 0.2, hasta: 0.98)
            aro(10.5, 13.5, 7)
            t { p in p.move(to: .init(x: 10.5, y: 13.5)); p.addLine(to: .init(x: 17, y: 7)) }
            lleno { p in p.move(to: .init(x: 17, y: 3)); p.addLine(to: .init(x: 21.5, y: 5)); p.addLine(to: .init(x: 17, y: 7.5)); p.closeSubpath() }
        case "proyectos":
            aro(6, 5.5, 4.6)
            aro(6, 18.5, 4.6)
            t { p in
                p.move(to: .init(x: 6, y: 7.8)); p.addLine(to: .init(x: 6, y: 16.2))
                p.move(to: .init(x: 6, y: 8)); p.addQuadCurve(to: .init(x: 15.4, y: 12), control: .init(x: 6, y: 12))
            }
            punto(18, 12, 6)
        case "enlaces":
            RoundedRectangle(cornerRadius: 3.2, style: .continuous).stroke(style: trazo).frame(width: 12, height: 6.4)
                .rotationEffect(.degrees(-45)).position(x: 8.8, y: 15.2)
            RoundedRectangle(cornerRadius: 3.2, style: .continuous).stroke(style: trazo).frame(width: 12, height: 6.4)
                .rotationEffect(.degrees(-45)).position(x: 15.2, y: 8.8)
        case "ocio":
            caja(CGRect(x: 3, y: 4.5, width: 18, height: 15), 3.5)
            lleno { p in p.move(to: .init(x: 10, y: 8.6)); p.addLine(to: .init(x: 15.6, y: 12)); p.addLine(to: .init(x: 10, y: 15.4)); p.closeSubpath() }
        case "social":
            aro(9, 8, 6.4)
            t { p in
                p.move(to: .init(x: 3, y: 20)); p.addQuadCurve(to: .init(x: 15, y: 20), control: .init(x: 9, y: 11))
                p.move(to: .init(x: 16.5, y: 13.6)); p.addQuadCurve(to: .init(x: 21, y: 19), control: .init(x: 20.5, y: 14.5))
            }
            punto(16.5, 8.5, 5)
        case "viajes":
            t { p in
                p.addRoundedRect(in: CGRect(x: 5, y: 7.5, width: 14, height: 11.5), cornerSize: CGSize(width: 3, height: 3), style: .continuous)
                p.move(to: .init(x: 9.5, y: 7.5)); p.addLine(to: .init(x: 9.5, y: 5)); p.addQuadCurve(to: .init(x: 10.5, y: 4), control: .init(x: 9.5, y: 4))
                p.addLine(to: .init(x: 13.5, y: 4)); p.addQuadCurve(to: .init(x: 14.5, y: 5), control: .init(x: 14.5, y: 4)); p.addLine(to: .init(x: 14.5, y: 7.5))
                p.move(to: .init(x: 9, y: 11.2)); p.addLine(to: .init(x: 9, y: 15.2))
            }
            punto(8.5, 21.2, 2.6)
            punto(15.5, 21.2, 2.6)
        case "envios":
            caja(CGRect(x: 9, y: 6, width: 12, height: 12), 2.5)
            t { p in
                p.move(to: .init(x: 15, y: 6.3)); p.addLine(to: .init(x: 15, y: 10))
                p.move(to: .init(x: 2.5, y: 9.5)); p.addLine(to: .init(x: 6, y: 9.5))
                p.move(to: .init(x: 4, y: 14.5)); p.addLine(to: .init(x: 6, y: 14.5))
            }
            punto(15, 13.8, 3)
        case "transporte":
            t { p in
                p.addRoundedRect(in: CGRect(x: 5, y: 3.5, width: 14, height: 15), cornerSize: CGSize(width: 3.5, height: 3.5), style: .continuous)
                p.move(to: .init(x: 5.3, y: 10.5)); p.addLine(to: .init(x: 18.7, y: 10.5))
                p.move(to: .init(x: 8, y: 18.6)); p.addLine(to: .init(x: 8, y: 20.5))
                p.move(to: .init(x: 16, y: 18.6)); p.addLine(to: .init(x: 16, y: 20.5))
            }
            punto(8.6, 14.6, 2.8)
            punto(15.4, 14.6, 2.8)
        case "coleccionables":
            RoundedRectangle(cornerRadius: 2.6, style: .continuous).stroke(style: trazo).frame(width: 10.5, height: 14.5)
                .rotationEffect(.degrees(-12)).position(x: 9.6, y: 12.4)
            RoundedRectangle(cornerRadius: 2.6, style: .continuous).stroke(style: trazo).frame(width: 10.5, height: 14.5)
                .rotationEffect(.degrees(8)).position(x: 14.6, y: 11.8)
            punto(14.8, 11.8, 3)
        case "etiquetas":
            t { p in
                p.move(to: .init(x: 4, y: 4)); p.addLine(to: .init(x: 11.5, y: 4)); p.addLine(to: .init(x: 20, y: 12.5))
                p.addLine(to: .init(x: 12.5, y: 20)); p.addLine(to: .init(x: 4, y: 11.5)); p.closeSubpath()
            }
            punto(8.4, 8.4, 3.4)
        case "conexiones":
            t { p in
                p.move(to: .init(x: 5, y: 7)); p.addLine(to: .init(x: 12, y: 4.5)); p.addLine(to: .init(x: 19, y: 9))
                p.addLine(to: .init(x: 16, y: 17.5)); p.addLine(to: .init(x: 8.5, y: 19)); p.addLine(to: .init(x: 5, y: 7))
                p.move(to: .init(x: 12, y: 4.5)); p.addLine(to: .init(x: 16, y: 17.5))
            }
            solido(5, 7, 4)
            solido(19, 9, 4)
            solido(16, 17.5, 4)
            solido(8.5, 19, 4)
            punto(12, 4.5, 4.4)
        case "propuestas":
            t { p in
                p.move(to: .init(x: 3.5, y: 13)); p.addLine(to: .init(x: 8, y: 13)); p.addLine(to: .init(x: 9.5, y: 15.5))
                p.addLine(to: .init(x: 14.5, y: 15.5)); p.addLine(to: .init(x: 16, y: 13)); p.addLine(to: .init(x: 20.5, y: 13))
                p.addLine(to: .init(x: 20.5, y: 18)); p.addQuadCurve(to: .init(x: 18.5, y: 20), control: .init(x: 20.5, y: 20))
                p.addLine(to: .init(x: 5.5, y: 20)); p.addQuadCurve(to: .init(x: 3.5, y: 18), control: .init(x: 3.5, y: 20)); p.closeSubpath()
            }
            lleno { p in
                p.move(to: .init(x: 12, y: 2.5)); p.addQuadCurve(to: .init(x: 15.5, y: 6.5), control: .init(x: 12.6, y: 5.9))
                p.addQuadCurve(to: .init(x: 12, y: 10.5), control: .init(x: 12.6, y: 7.1)); p.addQuadCurve(to: .init(x: 8.5, y: 6.5), control: .init(x: 11.4, y: 7.1))
                p.addQuadCurve(to: .init(x: 12, y: 2.5), control: .init(x: 11.4, y: 5.9)); p.closeSubpath()
            }
        case "sugerencias":
            t { p in
                p.addRoundedRect(in: CGRect(x: 3, y: 4, width: 18, height: 12.5), cornerSize: CGSize(width: 4.5, height: 4.5), style: .continuous)
                p.move(to: .init(x: 8, y: 16.5)); p.addLine(to: .init(x: 7, y: 20.5)); p.addLine(to: .init(x: 12.5, y: 16.5))
            }
            punto(12, 10.2)
        case "ajustes":
            t { p in for y in [6.5, 12.0, 17.5] { p.move(to: .init(x: 4, y: y)); p.addLine(to: .init(x: 20, y: y)) } }
            solido(15, 6.5, 5.2)
            punto(8.5, 12, 5.2)
            solido(13, 17.5, 5.2)
        case "buscar":
            aro(10.5, 10.5, 12)
            t { p in p.move(to: .init(x: 15, y: 15)); p.addLine(to: .init(x: 20, y: 20)) }
        case "perfil":
            punto(12, 8, 7)
            t { p in p.move(to: .init(x: 5, y: 20.5)); p.addQuadCurve(to: .init(x: 19, y: 20.5), control: .init(x: 12, y: 10.5)) }
        case "estado":
            arco(12, 12, 8, desde: 0.05, hasta: 0.8, giro: -90)
            punto(12, 12, 4)
        case "web":
            aro(12, 12, 17)
            Ellipse().stroke(style: trazo).frame(width: 7.5, height: 17).position(x: 12, y: 12)
            t { p in p.move(to: .init(x: 3.8, y: 12)); p.addLine(to: .init(x: 20.2, y: 12)) }
        default:
            caja(CGRect(x: 4, y: 4, width: 16, height: 16), 5)
            punto(12, 12)
        }
    }
}

// La barra de abajo usa el catálogo: el detalle lleno de la pestaña activa toma el acento.
struct IconoBarra: View {
    let id: String
    var activo = false
    var detalle: Color = Paleta.progreso

    var body: some View { Icono(id: id, activo: activo, detalle: detalle) }
}
