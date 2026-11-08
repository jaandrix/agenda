import SwiftUI
import UIKit

// Los seis temas de la PWA (THEMES en js/datos.js; colores de styles.css). «acuarela» se enseña como «teja.».
// «sistema» es papel o asfalto según el iPhone. En asfalto y papel la interfaz usa la arcilla del plan de la 0.12
// (#C96A5A / #A64235) en lugar del naranja de la PWA: el #E5532B queda solo para el punto del logo (`Paleta.marca`).
enum TemaElegido: String, CaseIterable, Identifiable {
    case sistema, asfalto, papel, acuarela, pizarra, oliva, fundador
    var id: String { rawValue }
    var nombre: String { self == .acuarela ? "teja." : rawValue + "." }
    var esquema: ColorScheme? {
        switch self {
        case .sistema: return nil
        case .asfalto, .fundador: return .dark
        default: return .light
        }
    }

    // temasDisponibles: fundador para socios y la cuenta del creador; oliva para quien invitó o entró invitado.
    func permitido(_ p: PermisosTemas) -> Bool {
        switch self {
        case .fundador: return p.todos
        case .oliva: return p.todos || p.oliva
        default: return true
        }
    }
}

struct PermisosTemas: Codable, Equatable, Sendable {
    var todos = false
    var oliva = false
}

struct TemaTokens {
    let fondo: UInt32, superficie: UInt32, texto: UInt32, secundario: UInt32, acento: UInt32, sobreAcento: UInt32, punto: UInt32
    let oscuro: Bool

    static func de(_ t: TemaElegido, sistemaOscuro: Bool) -> TemaTokens {
        switch t {
        case .sistema: return de(sistemaOscuro ? .asfalto : .papel, sistemaOscuro: sistemaOscuro)
        case .asfalto: return TemaTokens(fondo: 0x121211, superficie: 0x1D1D1B, texto: 0xF4F2EB, secundario: 0xA29F96, acento: 0xC96A5A, sobreAcento: 0x161514, punto: 0x2A2A27, oscuro: true)
        case .papel: return TemaTokens(fondo: 0xEFEEE9, superficie: 0xFFFFFF, texto: 0x302F2C, secundario: 0x736F63, acento: 0xA64235, sobreAcento: 0xFFFFFF, punto: 0xE2E0D9, oscuro: false)
        case .acuarela: return TemaTokens(fondo: 0xE7E2D9, superficie: 0xF2EFE9, texto: 0x161514, secundario: 0x625D55, acento: 0x8A2233, sobreAcento: 0xFFFFFF, punto: 0xD2CCC1, oscuro: false)
        case .pizarra: return TemaTokens(fondo: 0xC0C8CA, superficie: 0xD4D8DD, texto: 0x1A2D42, secundario: 0x2E4156, acento: 0x2E4156, sobreAcento: 0xD4D8DD, punto: 0xAAB7B7, oscuro: false)
        case .oliva: return TemaTokens(fondo: 0xF7F5EE, superficie: 0xEFF1E8, texto: 0x252A22, secundario: 0x687064, acento: 0x8B4F70, sobreAcento: 0xFFFEFA, punto: 0xDDE4CE, oscuro: false)
        case .fundador: return TemaTokens(fondo: 0x1A1916, superficie: 0x23211D, texto: 0xF1EAD8, secundario: 0xB0A68F, acento: 0xD4B06A, sobreAcento: 0x1A1916, punto: 0x3A362D, oscuro: true)
        }
    }
}

// El tema elegido, leído por los colores dinámicos de `Paleta` cada vez que se resuelven. Solo lo cambia el coordinador
// (en el hilo principal), y la raíz se vuelve a construir con `.id(tema)` para que todo se pinte otra vez.
enum TemaActivo {
    nonisolated(unsafe) static var elegido: TemaElegido = .sistema
}

extension UIColor {
    convenience init(rgb v: UInt32, alfa: CGFloat = 1) {
        self.init(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: alfa)
    }
}

extension Color {
    init(claro: UInt32, oscuro: UInt32, alfaClaro: CGFloat = 1, alfaOscuro: CGFloat = 1) {
        self.init(uiColor: UIColor { t in
            let oscura = t.userInterfaceStyle == .dark
            return UIColor(rgb: oscura ? oscuro : claro, alfa: oscura ? alfaOscuro : alfaClaro)
        })
    }

    static func delTema(_ f: @escaping (TemaTokens) -> UIColor) -> Color {
        Color(uiColor: UIColor { t in f(TemaTokens.de(TemaActivo.elegido, sistemaOscuro: t.userInterfaceStyle == .dark)) })
    }
}

// Nombres semánticos: las vistas nunca llevan colores sueltos.
enum Paleta {
    static let fondo = Color.delTema { UIColor(rgb: $0.fondo) }                                      // --bg-app
    static let superficie = Color.delTema { UIColor(rgb: $0.superficie) }                            // --m-superficie
    static let texto = Color.delTema { UIColor(rgb: $0.texto) }                                      // --text-primary
    static let textoSecundario = Color.delTema { UIColor(rgb: $0.secundario) }                       // --text-secondary
    static let textoApagado = Color.delTema { UIColor(rgb: $0.secundario, alfa: 0.75) }              // --text-muted, solo lo decorativo
    static let acento = Color.delTema { UIColor(rgb: $0.acento) }                                    // acento de interacción
    static let sobreAcento = Color.delTema { UIColor(rgb: $0.sobreAcento) }
    static let punto = Color.delTema { UIColor(rgb: $0.punto) }                                      // --m-punto
    static let error = Color.delTema { UIColor(rgb: $0.oscuro ? 0xF2B8B5 : 0xB3261E) }
    // --border y --border-strong son la tinta con transparencia, no un gris propio.
    static let borde = Color.delTema { UIColor(rgb: $0.texto, alfa: $0.oscuro ? 0.08 : 0.07) }
    static let bordeFuerte = Color.delTema { UIColor(rgb: $0.texto, alfa: 0.16) }
    // .m-ahora-bloque: el acento al 7 % sobre el fondo y un filo del acento al 16 %.
    static let tinteAcento = Color.delTema { UIColor(rgb: $0.acento, alfa: $0.oscuro ? 0.12 : 0.08) }
    static let filoAcento = Color.delTema { UIColor(rgb: $0.acento, alfa: 0.16) }
    // color-mix(--text-primary 6 %): el círculo de cada icono de la barra.
    static let tinteTexto = Color.delTema { UIColor(rgb: $0.texto, alfa: 0.06) }
    // El punto oficial del logo «b.»: no cambia con el tema ni se usa en controles.
    static let marca = Color(uiColor: UIColor(rgb: 0xE5532B))
}

enum Duracion {
    static let toque: Double = 0.12
    static let sello: Double = 0.16
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
    static let bloque: CGFloat = 20      // .m-ahora-bloque
    static let barra: CGFloat = 26       // .m-tabbar, esquinas de arriba
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

    // --m-fs-titulo (42) para la cabecera de un apartado; --m-fs-sub (22) para su subtítulo.
    static let tituloApartado = poppins(42, .bold, estilo: .largeTitle)
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
