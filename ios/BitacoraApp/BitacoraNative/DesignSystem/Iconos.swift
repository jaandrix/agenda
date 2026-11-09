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

// La barra de abajo: lienzo de 24, trazo redondeado y un detalle lleno que, en la pestaña activa, toma el color
// señalado por la barra (contexto/progreso en la carcasa tonal). Cinco iconos propios, simplificados y con curvas
// consistentes.
struct IconoBarra: View {
    let id: String
    var activo = false
    var detalle: Color = Paleta.progreso

    private var trazo: StrokeStyle { StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round) }

    var body: some View {
        ZStack {
            switch id {
            case "inicio":
                Path { p in
                    p.addRoundedRect(in: CGRect(x: 3, y: 4.5, width: 8, height: 15), cornerSize: CGSize(width: 3.5, height: 3.5))
                    p.addRoundedRect(in: CGRect(x: 13, y: 4.5, width: 8, height: 15), cornerSize: CGSize(width: 3.5, height: 3.5))
                }.stroke(style: trazo)
                if activo { Circle().fill(detalle).frame(width: 3.8, height: 3.8).position(x: 17, y: 9.5) }
            case "plan":
                Path { p in
                    p.move(to: .init(x: 8.5, y: 6)); p.addLine(to: .init(x: 20, y: 6))
                    p.move(to: .init(x: 8.5, y: 12)); p.addLine(to: .init(x: 18, y: 12))
                    p.move(to: .init(x: 8.5, y: 18)); p.addLine(to: .init(x: 20, y: 18))
                }.stroke(style: trazo)
                ForEach(Array([6.0, 12.0, 18.0].enumerated()), id: \.offset) { i, y in
                    let on = activo && i == 1
                    Circle()
                        .fill(on ? AnyShapeStyle(detalle) : AnyShapeStyle(.clear))
                        .overlay(Circle().stroke(style: trazo))
                        .frame(width: 4.4, height: 4.4)
                        .position(x: 4.5, y: y)
                }
            case "calendario", "finanzas":
                if id == "calendario" {
                    Path { p in p.addRoundedRect(in: CGRect(x: 3.5, y: 5, width: 17, height: 15), cornerSize: CGSize(width: 4, height: 4)) }.stroke(style: trazo)
                    Path { p in p.move(to: .init(x: 3.5, y: 9.5)); p.addLine(to: .init(x: 20.5, y: 9.5)) }.stroke(style: trazo)
                    if activo {
                        RoundedRectangle(cornerRadius: 1.5).fill(detalle).frame(width: 5, height: 4.5).position(x: 15.5, y: 14.5)
                    } else {
                        Circle().fill(.foreground).frame(width: 3.4, height: 3.4).position(x: 15.5, y: 14.5)
                    }
                } else {
                    Path { p in p.addRoundedRect(in: CGRect(x: 3.5, y: 5, width: 17, height: 14), cornerSize: CGSize(width: 4, height: 4)) }.stroke(style: trazo)
                    Path { p in p.move(to: .init(x: 7.5, y: 12)); p.addLine(to: .init(x: 16.5, y: 12)) }.stroke(style: trazo)
                    Circle().fill(activo ? AnyShapeStyle(detalle) : AnyShapeStyle(.clear))
                        .overlay(Circle().stroke(style: trazo))
                        .frame(width: 6.2, height: 6.2).position(x: 16.5, y: 15.5)
                }
            case "menu":
                Path { p in
                    for y in [7.0, 12.0, 17.0] {
                        p.move(to: .init(x: 5, y: y)); p.addLine(to: .init(x: 19, y: y))
                    }
                }.stroke(style: trazo)
                if activo { Circle().fill(detalle).frame(width: 4, height: 4).position(x: 5, y: 12) }
            default:
                Path { p in
                    p.move(to: .init(x: 12, y: 4.5)); p.addLine(to: .init(x: 12, y: 19.5))
                    p.move(to: .init(x: 4.5, y: 12)); p.addLine(to: .init(x: 19.5, y: 12))
                }.stroke(style: StrokeStyle(lineWidth: 2.8, lineCap: .round))
                Circle().fill(detalle).frame(width: 4, height: 4).position(x: 19, y: 19)
            }
        }
        .frame(width: 24, height: 24)
        .accessibilityHidden(true)
    }
}
