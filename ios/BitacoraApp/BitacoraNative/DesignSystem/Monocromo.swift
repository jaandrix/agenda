import SwiftUI
import UIKit

// Tema «tinta.» (0.25): blanco, negro y grises, nada más. Sin color, la jerarquía sale de tres cosas: luminancia,
// opacidad y peso. Lo que en los otros temas dice un color aquí lo dice una forma:
// - el acento es la tinta plena invertida (pestaña activa, botón principal, día elegido: negro sobre claro, blanco sobre
//   oscuro);
// - lo que pide atención (gastos de más, presupuesto superado, errores) va en tinta plena, y en las barras rayado;
// - lo que va bien (ingresos, mejoras) en `positivo`, un gris más suave, y en las barras hueco;
// - la prioridad por peso: alta en negrita y tinta plena, media en tinta al 70 %, baja en el gris secundario;
// - los colores que elige la persona (categorías, enlaces) pasan a su gris, conservando cuál es más claro u oscuro.
// Los dos modos siguen al iPhone: «día» es papel blanco y tinta negra, «noche» carbón y tiza.
enum Grises {
    struct Paso {
        let nombre: String
        let valor: UInt32
        let uso: String
    }

    // De claro a oscuro. Cada paso tiene un papel; los que no son texto no se usan para texto.
    static let escalaDia: [Paso] = [
        Paso(nombre: "blanco", valor: 0xFFFFFF, uso: "superficie: tarjetas, hojas, barra de abajo"),
        Paso(nombre: "papel", valor: 0xF3F3F3, uso: "fondo"),
        Paso(nombre: "niebla", valor: 0xE6E6E6, uso: "pulsado, pista de las barras"),
        Paso(nombre: "ceniza", valor: 0xD6D6D6, uso: "bolitas sin nada (punto)"),
        Paso(nombre: "humo", valor: 0xBFBFBF, uso: "desactivado, decorativo"),
        Paso(nombre: "plomo", valor: 0x9E9E9E, uso: "rayas guía, decorativo"),
        Paso(nombre: "acero", valor: 0x747474, uso: "texto apagado (solo decorativo, ≥ 3:1)"),
        Paso(nombre: "grafito", valor: 0x5A5A5A, uso: "texto secundario (AA)"),
        Paso(nombre: "pizarra", valor: 0x4A4A4A, uso: "positivo: ingresos, mejoras"),
        Paso(nombre: "carbón", valor: 0x2E2E2E, uso: "colores de usuario oscuros"),
        Paso(nombre: "hollín", valor: 0x1F1F1F, uso: "colores de usuario oscuros"),
        Paso(nombre: "tinta", valor: 0x121212, uso: "texto, acento, atención"),
    ]

    static let escalaNoche: [Paso] = [
        Paso(nombre: "tiza", valor: 0xF7F7F7, uso: "acento, atención"),
        Paso(nombre: "papel", valor: 0xEDEDED, uso: "texto"),
        Paso(nombre: "niebla", valor: 0xD6D6D6, uso: "colores de usuario claros"),
        Paso(nombre: "ceniza", valor: 0xBDBDBD, uso: "positivo: ingresos, mejoras"),
        Paso(nombre: "humo", valor: 0xA8A8A8, uso: "texto secundario (AA)"),
        Paso(nombre: "plomo", valor: 0x8C8C8C, uso: "texto apagado (solo decorativo)"),
        Paso(nombre: "acero", valor: 0x5E5E5E, uso: "rayas guía, decorativo"),
        Paso(nombre: "grafito", valor: 0x3D3D3D, uso: "desactivado, decorativo"),
        Paso(nombre: "pizarra", valor: 0x2A2A2A, uso: "bolitas sin nada (punto), pulsado"),
        Paso(nombre: "carbón", valor: 0x1C1C1C, uso: "superficie: tarjetas, hojas, barra de abajo"),
        Paso(nombre: "hollín", valor: 0x161616, uso: "pista de las barras"),
        Paso(nombre: "negro", valor: 0x0E0E0E, uso: "fondo"),
    ]

    private static func v(_ escala: [Paso], _ nombre: String) -> UInt32 { escala.first { $0.nombre == nombre }!.valor }

    static let dia: TemaTokens = {
        let e = Grises.escalaDia
        var t = TemaTokens(fondo: Grises.v(e, "papel"), superficie: Grises.v(e, "blanco"), texto: Grises.v(e, "tinta"), secundario: Grises.v(e, "grafito"),
                           acento: Grises.v(e, "tinta"), sobreAcento: Grises.v(e, "blanco"), punto: Grises.v(e, "ceniza"), oscuro: false)
            .con(Grises.v(e, "papel"), Grises.v(e, "tinta"), Grises.v(e, "tinta"), Grises.v(e, "blanco"), Grises.v(e, "tinta"))
            .estilo(titulo: Grises.v(e, "tinta"), barra: Grises.v(e, "blanco"), filo: Grises.v(e, "tinta"), bordeAlfa: 0.12, aroAlfa: 0.5)
        t.positivo = Grises.v(e, "pizarra")
        t.mono = true
        return t
    }()

    static let noche: TemaTokens = {
        let e = Grises.escalaNoche
        var t = TemaTokens(fondo: Grises.v(e, "negro"), superficie: Grises.v(e, "carbón"), texto: Grises.v(e, "papel"), secundario: Grises.v(e, "humo"),
                           acento: Grises.v(e, "tiza"), sobreAcento: Grises.v(e, "negro"), punto: Grises.v(e, "pizarra"), oscuro: true)
            .con(Grises.v(e, "negro"), Grises.v(e, "papel"), Grises.v(e, "tiza"), Grises.v(e, "negro"), Grises.v(e, "tiza"))
            .estilo(filo: Grises.v(e, "papel"), bordeAlfa: 0.12, aroAlfa: 0.46)
        t.positivo = Grises.v(e, "ceniza")
        t.mono = true
        return t
    }()

    // Un color elegido por la persona («#FFADAD») pasado a gris: se conserva su claridad relativa dentro de la franja que se
    // lee sobre el fondo (día de #121212 a #666666, noche de #969696 a #F0F0F0), así dos categorías siguen distinguiéndose
    // por tono y cualquiera llega a 4,5:1.
    static func deColor(_ c: UInt32, oscuro: Bool) -> UInt32 {
        let r = Double((c >> 16) & 0xFF), g = Double((c >> 8) & 0xFF), b = Double(c & 0xFF)
        let y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        let (desde, hasta): (Double, Double) = oscuro ? (0x96, 0xF0) : (0x12, 0x66)
        let n = UInt32((desde + (hasta - desde) * y).rounded())
        return n << 16 | n << 8 | n
    }
}

extension Color {
    // Colores guardados por la persona: tal cual en los temas de color, en su gris en tinta.
    static func deUsuario(_ v: UInt32) -> Color {
        Color(uiColor: UIColor { t in
            let k = TemaTokens.de(TemaActivo.elegido, sistemaOscuro: t.userInterfaceStyle == .dark)
            return UIColor(rgb: k.mono ? Grises.deColor(v, oscuro: k.oscuro) : v)
        })
    }
}

// Rayado a 45°: lo que pide atención sin color (presupuesto superado, gasto por encima de lo que entra).
struct Trama: Shape {
    var paso: CGFloat = 4

    func path(in r: CGRect) -> Path {
        var p = Path()
        var x = r.minX - r.height
        while x < r.maxX {
            p.move(to: CGPoint(x: x, y: r.maxY))
            p.addLine(to: CGPoint(x: x + r.height, y: r.minY))
            x += paso
        }
        return p
    }
}

// Portadas, logos y fotos en gris solo con tinta. Las remotas ya llegan en gris desde `Imagenes` (sin coste al pintar);
// esto es para las que no pasan por ahí. En los demás temas no añade nada.
struct EnGrises: ViewModifier {
    func body(content: Content) -> some View {
        if Paleta.mono { content.grayscale(1) } else { content }
    }
}

extension View {
    func enGrises() -> some View { modifier(EnGrises()) }
}
