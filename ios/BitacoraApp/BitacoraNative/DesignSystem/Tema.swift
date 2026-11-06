import SwiftUI
import UIKit

// Tokens sacados de styles.css: asfalto (oscuro, el de siempre) y papel (claro). El resto de temas llegará cuando
// haya pantallas que lo justifiquen.
enum TemaElegido: String, CaseIterable, Identifiable {
    case sistema, asfalto, papel
    var id: String { rawValue }
    var nombre: String { rawValue + "." }
    var esquema: ColorScheme? {
        switch self {
        case .sistema: return nil
        case .asfalto: return .dark
        case .papel: return .light
        }
    }
}

extension Color {
    init(claro: UInt32, oscuro: UInt32) {
        self.init(uiColor: UIColor { t in
            let v = t.userInterfaceStyle == .dark ? oscuro : claro
            return UIColor(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
        })
    }
}

enum Paleta {
    static let fondo = Color(claro: 0xFAF8F5, oscuro: 0x302F2C)
    static let superficie = Color(claro: 0xFFFFFF, oscuro: 0x3A3934)
    static let borde = Color(claro: 0xE8E4DC, oscuro: 0x4A4941)
    static let texto = Color(claro: 0x302F2C, oscuro: 0xEFEDE3)
    static let textoSecundario = Color(claro: 0x736F63, oscuro: 0xA9A89C)
    static let acento = Color(claro: 0xE5532B, oscuro: 0xF0643A)
    static let sobreAcento = Color(claro: 0xFFFFFF, oscuro: 0x161514)
    static let error = Color(claro: 0xB3261E, oscuro: 0xF2B8B5)
}

enum Espacio {
    static let xs: CGFloat = 4
    static let s: CGFloat = 8
    static let m: CGFloat = 16
    static let l: CGFloat = 24
    static let xl: CGFloat = 40
}

enum Radio {
    static let control: CGFloat = 10
    static let bloque: CGFloat = 16
}

// Poppins con Dynamic Type: cada tamaño escala con el estilo de texto que se le indica.
enum Tipo {
    static func poppins(_ tamano: CGFloat, _ peso: Font.Weight = .regular, estilo: Font.TextStyle = .body) -> Font {
        let nombre: String
        switch peso {
        case .bold, .heavy, .black: nombre = "Poppins-Bold"
        case .semibold: nombre = "Poppins-SemiBold"
        case .medium: nombre = "Poppins-Medium"
        default: nombre = "Poppins-Regular"
        }
        return .custom(nombre, size: tamano, relativeTo: estilo)
    }

    static let titulo = poppins(34, .bold, estilo: .largeTitle)
    static let subtitulo = poppins(20, .semibold, estilo: .title3)
    static let cuerpo = poppins(16, .regular, estilo: .body)
    static let cuerpoFuerte = poppins(16, .medium, estilo: .body)
    static let pie = poppins(13, .regular, estilo: .footnote)
    static let mono = Font.system(.footnote, design: .monospaced)
}

struct BotonPrincipal: ButtonStyle {
    @Environment(\.isEnabled) private var activo

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Tipo.cuerpoFuerte)
            .frame(maxWidth: .infinity, minHeight: 50)
            .foregroundStyle(Paleta.sobreAcento)
            .background(Paleta.acento.opacity(activo ? 1 : 0.5), in: RoundedRectangle(cornerRadius: Radio.control))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

struct BotonSecundario: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Tipo.cuerpoFuerte)
            .frame(maxWidth: .infinity, minHeight: 50)
            .foregroundStyle(Paleta.texto)
            .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: Radio.control))
            .overlay(RoundedRectangle(cornerRadius: Radio.control).stroke(Paleta.borde))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

// El estado de la nube, discreto: un punto y una palabra, nunca un spinner que tape la pantalla.
struct IndicadorSync: View {
    let estado: EstadoSync

    var body: some View {
        HStack(spacing: Espacio.xs) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(texto).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("nube: \(texto)")
    }

    private var texto: String {
        switch estado {
        case .reposo: return "al día."
        case .trayendo: return "sincronizando."
        case .sinConexion: return "sin conexión."
        case .error: return "error."
        }
    }

    private var color: Color {
        switch estado {
        case .reposo: return Paleta.textoSecundario
        case .trayendo: return Paleta.acento
        case .sinConexion: return Paleta.borde
        case .error: return Paleta.error
        }
    }
}
