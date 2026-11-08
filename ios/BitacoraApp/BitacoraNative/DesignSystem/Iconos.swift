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

// La barra de abajo (DIRECCION-ICONOS-BARRA-BITACORA-2026-11-08.svg): lienzo de 24, trazo de 1,85 redondeado y un
// detalle lleno que, en la pestaña activa, toma el acento. inicio: cuaderno abierto con su punto; plan: eje con tres
// hitos; calendario: semana con una casilla marcada; finanzas: libro de cuentas con su moneda; menú: índice.
struct IconoBarra: View {
    let id: String
    var activo = false

    private var trazo: StrokeStyle { StrokeStyle(lineWidth: 1.85, lineCap: .round, lineJoin: .round) }
    private var fino: StrokeStyle { StrokeStyle(lineWidth: 1.55, lineCap: .round, lineJoin: .round) }

    var body: some View {
        ZStack {
            switch id {
            case "inicio":
                Path { p in
                    p.move(to: .init(x: 2.5, y: 5.5)); p.addCurve(to: .init(x: 12, y: 6.1), control1: .init(x: 5.5, y: 3.9), control2: .init(x: 8.6, y: 4.0))
                    p.addLine(to: .init(x: 12, y: 20.9)); p.addCurve(to: .init(x: 2.5, y: 20.3), control1: .init(x: 8.6, y: 18.8), control2: .init(x: 5.5, y: 18.7)); p.closeSubpath()
                    p.move(to: .init(x: 21.5, y: 5.5)); p.addCurve(to: .init(x: 12, y: 6.1), control1: .init(x: 18.5, y: 3.9), control2: .init(x: 15.4, y: 4.0))
                    p.addLine(to: .init(x: 12, y: 20.9)); p.addCurve(to: .init(x: 21.5, y: 20.3), control1: .init(x: 15.4, y: 18.8), control2: .init(x: 18.5, y: 18.7)); p.closeSubpath()
                }.stroke(style: trazo)
                Circle().fill(activo ? Paleta.acento : Color.clear).frame(width: 3.2, height: 3.2).position(x: 18.5, y: 10)
            case "plan":
                Path { p in p.move(to: .init(x: 5, y: 3.5)); p.addLine(to: .init(x: 5, y: 20.5)) }.stroke(style: fino)
                Path { p in
                    p.addEllipse(in: CGRect(x: 2.8, y: 2.8, width: 4.4, height: 4.4)); p.addEllipse(in: CGRect(x: 2.8, y: 16.8, width: 4.4, height: 4.4))
                    if !activo { p.addEllipse(in: CGRect(x: 2.8, y: 9.8, width: 4.4, height: 4.4)) }
                    p.move(to: .init(x: 10, y: 5)); p.addLine(to: .init(x: 20, y: 5))
                    p.move(to: .init(x: 10, y: 12)); p.addLine(to: .init(x: 17.5, y: 12))
                    p.move(to: .init(x: 10, y: 19)); p.addLine(to: .init(x: 19, y: 19))
                }.stroke(style: trazo)
                if activo { Circle().fill(Paleta.acento).frame(width: 4.4, height: 4.4).position(x: 5, y: 12) }
            case "calendario":
                Path { p in
                    p.move(to: .init(x: 4, y: 7.5)); p.addLine(to: .init(x: 20, y: 7.5))
                    p.move(to: .init(x: 5.5, y: 4)); p.addLine(to: .init(x: 5.5, y: 7.5))
                    p.move(to: .init(x: 18.5, y: 4)); p.addLine(to: .init(x: 18.5, y: 7.5))
                    p.move(to: .init(x: 4, y: 7.5)); p.addLine(to: .init(x: 4, y: 19.5)); p.addLine(to: .init(x: 20, y: 19.5)); p.addLine(to: .init(x: 20, y: 7.5))
                }.stroke(style: trazo)
                Path { p in
                    for (x, y) in [(7.0, 12.0), (12.0, 12.0), (7.0, 16.0), (12.0, 16.0)] { p.move(to: .init(x: x, y: y)); p.addLine(to: .init(x: x + 2, y: y)) }
                }.stroke(style: fino)
                Circle().fill(activo ? AnyShapeStyle(Paleta.acento) : AnyShapeStyle(.foreground)).frame(width: 4, height: 4).position(x: 18, y: 16)
            case "finanzas":
                Path { p in
                    p.addRect(CGRect(x: 3.5, y: 5.5, width: 17, height: 14))
                    p.move(to: .init(x: 7, y: 10)); p.addLine(to: .init(x: 14, y: 10))
                    p.move(to: .init(x: 7, y: 14)); p.addLine(to: .init(x: 12, y: 14))
                }.stroke(style: trazo)
                if activo {
                    Circle().fill(Paleta.acento).frame(width: 7.8, height: 7.8).position(x: 17.5, y: 15.5)
                } else {
                    Circle().stroke(lineWidth: 1.85).frame(width: 6, height: 6).position(x: 17.5, y: 15.5)
                }
            case "menu":
                Path { p in
                    p.addRoundedRect(in: CGRect(x: 3, y: 4, width: 6, height: 6), cornerSize: CGSize(width: 2, height: 2))
                    p.addRoundedRect(in: CGRect(x: 14.5, y: 12, width: 6, height: 6), cornerSize: CGSize(width: 2, height: 2))
                    p.move(to: .init(x: 12.5, y: 7)); p.addLine(to: .init(x: 20.5, y: 7))
                    p.move(to: .init(x: 3, y: 15)); p.addLine(to: .init(x: 11, y: 15))
                }.stroke(style: trazo)
                if activo { Circle().fill(Paleta.acento).frame(width: 3.4, height: 3.4).position(x: 6, y: 20.5) }
            default:
                // apuntar: cruz gruesa con el punto de Bitácora.
                Path { p in
                    p.move(to: .init(x: 12, y: 3.5)); p.addLine(to: .init(x: 12, y: 20.5))
                    p.move(to: .init(x: 3.5, y: 12)); p.addLine(to: .init(x: 20.5, y: 12))
                }.stroke(style: StrokeStyle(lineWidth: 3.2, lineCap: .round))
                Circle().frame(width: 4.4, height: 4.4).position(x: 20.5, y: 20.5)
            }
        }
        .frame(width: 24, height: 24)
        .accessibilityHidden(true)
    }
}
