import SwiftUI
import UIKit

// Los seis temas de la PWA (THEMES en js/datos.js; colores de styles.css). «acuarela» se enseña como «teja.».
// «sistema» es papel o asfalto según el iPhone. «tinta» (0.25) es solo de la nativa: blanco, negro y grises, y sigue el
// modo del iPhone como «sistema». Se guarda en este iPhone, nunca en la nube, así que la PWA no lo ve (Monocromo.swift).
// En asfalto y papel la interfaz usa la arcilla del plan de la 0.12
// (#C96A5A / #A64235) en lugar del naranja de la PWA: el #E5532B queda solo para el punto del logo (`Paleta.marca`).
// 2.0 (23-11-2026): la app usa un único tema, «bitácora.» (blanco, carbón y naranja coral; DesignSystem/V2/Lienzo.swift).
// Los demás se conservan para las pruebas y para volver a ofrecerlos cuando el nuevo esté pulido; el coordinador fuerza
// `.bitacora` (`TemaElegido.unico`).
enum TemaElegido: String, CaseIterable, Identifiable {
    case sistema, asfalto, papel, acuarela, pizarra, oliva, fundador, tinta, bitacora
    static let unico: TemaElegido = .bitacora
    var id: String { rawValue }
    var nombre: String { self == .acuarela ? "teja." : self == .bitacora ? "bitácora." : rawValue + "." }
    var esquema: ColorScheme? {
        switch self {
        case .sistema, .tinta: return nil
        case .asfalto, .fundador: return .dark
        default: return .light   // bitácora 2.0 es solo claro, por ahora
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
    // Contexto, progreso y atención siempre se derivan del propio tema. No existe una portada o barra azul global.
    var contexto: UInt32 = 0, sobreContexto: UInt32 = 0, progreso: UInt32 = 0, sobreProgreso: UInt32 = 0, atencion: UInt32 = 0

    // Personalidad de cada tema (0.20). Sin valor, lo de siempre: título en tinta, barra de la superficie, filos de tinta.
    var titulo: UInt32?
    var barra: UInt32?, sobreBarra: UInt32?, sobreBarraSuave: UInt32?, acentoBarra: UInt32?
    var filo: UInt32?, bordeAlfa: CGFloat?, aroAlfa: CGFloat?
    // Tinta (0.25): sin color, lo bueno (ingresos, mejoras, presupuesto en orden) va en `positivo` y lo que pide atención en
    // tinta plena. En los demás temas `positivo` es el progreso de siempre.
    var positivo: UInt32?
    var mono = false

    func con(_ c: UInt32, _ sc: UInt32, _ p: UInt32, _ sp: UInt32, _ a: UInt32) -> TemaTokens {
        var t = self
        (t.contexto, t.sobreContexto, t.progreso, t.sobreProgreso, t.atencion) = (c, sc, p, sp, a)
        return t
    }

    func estilo(titulo: UInt32? = nil, barra: UInt32? = nil, sobreBarra: UInt32? = nil, sobreBarraSuave: UInt32? = nil,
                acentoBarra: UInt32? = nil, filo: UInt32? = nil, bordeAlfa: CGFloat? = nil, aroAlfa: CGFloat? = nil) -> TemaTokens {
        var t = self
        t.titulo = titulo; t.barra = barra; t.sobreBarra = sobreBarra; t.sobreBarraSuave = sobreBarraSuave
        t.acentoBarra = acentoBarra; t.filo = filo; t.bordeAlfa = bordeAlfa; t.aroAlfa = aroAlfa
        return t
    }

    static func de(_ t: TemaElegido, sistemaOscuro: Bool) -> TemaTokens {
        switch t {
        case .sistema: return de(sistemaOscuro ? .asfalto : .papel, sistemaOscuro: sistemaOscuro)
        case .tinta: return sistemaOscuro ? Grises.noche : Grises.dia
        // 2.0: el tema único. Mismos valores que Lienzo (Lienzo.Hex); el acento de los controles heredados es el naranja
        // profundo (sobre él, texto carbón: 5:1) y el lienzo se separa de las tarjetas blancas (1,11).
        case .bitacora:
            return TemaTokens(fondo: Lienzo.Hex.fondo, superficie: Lienzo.Hex.tarjeta, texto: Lienzo.Hex.tinta,
                              secundario: Lienzo.Hex.tintaSecundaria, acento: Lienzo.Hex.naranjaProfundo,
                              sobreAcento: Lienzo.Hex.oscuro, punto: Lienzo.Hex.sutil, oscuro: false)
                .con(Lienzo.Hex.fondo, Lienzo.Hex.tinta, Lienzo.Hex.naranjaProfundo, Lienzo.Hex.oscuro, Lienzo.Hex.rojo)
                .estilo(titulo: Lienzo.Hex.tinta, barra: Lienzo.Hex.tarjeta, filo: Lienzo.Hex.oscuro, bordeAlfa: 0.07, aroAlfa: 0.5)
        // Retoque de la 0.20 (pedido de Alejandro: «que tengan un poco más de personalidad, que se diferencien más»).
        // Texto y secundario cumplen AA (4,5:1) sobre fondo y superficie en todos.
        // 0.22: el aro de marcar llega a 3:1 en todos (en los claros no llegaba), las superficies se separan del fondo
        // (contraste ≥ 1,12) y los filetes suben para que los separadores se vean. Teja con tarjetas de piedra clara.
        // asfalto: grafito casi monocromo, superficies apenas elevadas con filo fino; la arcilla solo en lo activo.
        case .asfalto: return TemaTokens(fondo: 0x101112, superficie: 0x1C1D20, texto: 0xEDEDEA, secundario: 0xA2A3A0, acento: 0xCF7262, sobreAcento: 0x141312, punto: 0x2B2C30, oscuro: true)
            .con(0x101112, 0xEDEDEA, 0xCF7262, 0x141312, 0xE08FA6)
            .estilo(barra: 0x17181A, sobreBarraSuave: 0x8E8F8C, bordeAlfa: 0.11, aroAlfa: 0.46)
        // papel: crema cálido y tinta casi negra; separadores como renglones; títulos en tinta.
        case .papel: return TemaTokens(fondo: 0xF1ECE1, superficie: 0xFCFAF5, texto: 0x1F1D1A, secundario: 0x625C52, acento: 0xA64235, sobreAcento: 0xFFFFFF, punto: 0xE0D8C9, oscuro: false)
            .con(0xF1ECE1, 0x1F1D1A, 0xA64235, 0xFFFFFF, 0xA34C65)
            .estilo(titulo: 0x1F1D1A, barra: 0xFCFAF5, filo: 0x3A2E1E, bordeAlfa: 0.14, aroAlfa: 0.52)
        // teja: piedra cálida; el granate en los títulos grandes y en la barra; superficies un punto más oscuras.
        case .acuarela: return TemaTokens(fondo: 0xE9E3D9, superficie: 0xF4EFE7, texto: 0x161514, secundario: 0x564F47, acento: 0x8A2233, sobreAcento: 0xFFFFFF, punto: 0xD3C9BA, oscuro: false)
            .con(0xE9E3D9, 0x161514, 0x8A2233, 0xFFFFFF, 0x8A2233)
            .estilo(titulo: 0x8A2233, barra: 0x8A2233, sobreBarra: 0xFBF4EC, sobreBarraSuave: 0xE2C3C6, acentoBarra: 0xF2C9A8, filo: 0x5A3A2E, bordeAlfa: 0.15, aroAlfa: 0.52)
        // pizarra: gris azulado, tinta azul marino; barra #1A2D42 con iconos claros; superficies frías.
        case .pizarra: return TemaTokens(fondo: 0xC3CBCF, superficie: 0xDDE3E8, texto: 0x1A2D42, secundario: 0x33465A, acento: 0x2E4156, sobreAcento: 0xE6ECF0, punto: 0xA9B5BB, oscuro: false)
            .con(0xC3CBCF, 0x1A2D42, 0x2E4156, 0xE6ECF0, 0x7A2E47)
            .estilo(titulo: 0x1A2D42, barra: 0x1A2D42, sobreBarra: 0xEEF2F5, sobreBarraSuave: 0xA9B9C8, acentoBarra: 0xBFD6E6, filo: 0x1A2D42, bordeAlfa: 0.15, aroAlfa: 0.6)
        // oliva: marfil, verde oliva y la ciruela como acento secundario (progreso y avisos).
        case .oliva: return TemaTokens(fondo: 0xF6F4EA, superficie: 0xE3E8D1, texto: 0x232821, secundario: 0x555E51, acento: 0x5C6B34, sobreAcento: 0xFFFEF8, punto: 0xD8E0C4, oscuro: false)
            .con(0xF6F4EA, 0x232821, 0x8B4F70, 0xFFFEF8, 0x8B4F70)
            .estilo(titulo: 0x3D4824, barra: 0xE3E8D1, acentoBarra: 0x5C6B34, filo: 0x3D4824, bordeAlfa: 0.14, aroAlfa: 0.52)
        // fundador: negro carbón y dorado cálido de verdad; filo dorado tenue en las superficies.
        case .fundador: return TemaTokens(fondo: 0x121110, superficie: 0x201E19, texto: 0xF2EBDA, secundario: 0xB4A98F, acento: 0xC99A4B, sobreAcento: 0x141311, punto: 0x3A342A, oscuro: true)
            .con(0x121110, 0xF2EBDA, 0xC99A4B, 0x141311, 0xE0907E)
            .estilo(titulo: 0xE3C281, barra: 0x1A1814, acentoBarra: 0xC99A4B, filo: 0xC99A4B, bordeAlfa: 0.20, aroAlfa: 0.5)
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
    static let error = Color.delTema { UIColor(rgb: $0.mono ? $0.texto : ($0.oscuro ? 0xF2B8B5 : 0xB3261E)) }
    static let positivo = Color.delTema { UIColor(rgb: $0.positivo ?? $0.progreso) }
    // Leído al construir las vistas: la raíz se rehace con `.id(tema)` al cambiar de tema.
    static var mono: Bool { TemaActivo.elegido == .tinta }
    // --border y --border-strong son la tinta con transparencia, no un gris propio.
    static let borde = Color.delTema { UIColor(rgb: $0.filo ?? $0.texto, alfa: $0.bordeAlfa ?? ($0.oscuro ? 0.08 : 0.07)) }
    static let bordeFuerte = Color.delTema { UIColor(rgb: $0.filo ?? $0.texto, alfa: min(0.32, ($0.bordeAlfa ?? 0.08) * 2)) }
    // El aro de marcar (.m-check, --border-strong en la web). Con la raya separadora no se veía en asfalto: un control
    // necesita 3:1 con el fondo, así que la tinta va más fuerte que cualquier borde.
    static let aro = Color.delTema { UIColor(rgb: $0.texto, alfa: $0.aroAlfa ?? ($0.oscuro ? 0.42 : 0.36)) }
    // .m-ahora-bloque: el acento al 7 % sobre el fondo y un filo del acento al 16 %.
    static let tinteAcento = Color.delTema { UIColor(rgb: $0.acento, alfa: $0.oscuro ? 0.12 : 0.08) }
    static let filoAcento = Color.delTema { UIColor(rgb: $0.acento, alfa: 0.16) }
    // color-mix(--text-primary 6 %): el círculo de cada icono de la barra.
    static let tinteTexto = Color.delTema { UIColor(rgb: $0.texto, alfa: 0.06) }
    // Estados: pulsado (tinta suave), seleccionado (tinte del acento) y desactivado (secundario a media opacidad).
    static let pulsado = Color.delTema { UIColor(rgb: $0.texto, alfa: $0.oscuro ? 0.1 : 0.07) }
    static let seleccion = Color.delTema { UIColor(rgb: $0.acento, alfa: $0.oscuro ? 0.16 : 0.11) }
    static let desactivado = Color.delTema { UIColor(rgb: $0.secundario, alfa: 0.5) }
    static let separador = Color.delTema { UIColor(rgb: $0.filo ?? $0.texto, alfa: ($0.bordeAlfa ?? 0.08) + 0.03) }
    static let contexto = Color.delTema { UIColor(rgb: $0.contexto) }
    static let sobreContexto = Color.delTema { UIColor(rgb: $0.sobreContexto) }
    static let sobreContextoSuave = Color.delTema { UIColor(rgb: $0.sobreContexto, alfa: 0.74) }
    static let filoContexto = Color.delTema { UIColor(rgb: $0.sobreContexto, alfa: 0.18) }
    static let tinteContexto = Color.delTema { UIColor(rgb: $0.sobreContexto, alfa: 0.1) }
    static let progreso = Color.delTema { UIColor(rgb: $0.progreso) }
    static let sobreProgreso = Color.delTema { UIColor(rgb: $0.sobreProgreso) }
    static let atencion = Color.delTema { UIColor(rgb: $0.atencion) }
    // Títulos grandes y barra de abajo, propios de cada tema (0.20).
    static let titulo = Color.delTema { UIColor(rgb: $0.titulo ?? $0.texto) }
    static let barra = Color.delTema { UIColor(rgb: $0.barra ?? $0.superficie) }
    static let sobreBarra = Color.delTema { UIColor(rgb: $0.sobreBarra ?? $0.texto) }
    static let sobreBarraSuave = Color.delTema { UIColor(rgb: $0.sobreBarraSuave ?? $0.secundario) }
    static let acentoBarra = Color.delTema { UIColor(rgb: $0.acentoBarra ?? $0.acento) }
    static let tinteBarra = Color.delTema { UIColor(rgb: $0.acentoBarra ?? $0.acento, alfa: $0.barra != nil && $0.sobreBarra != nil ? 0.2 : ($0.oscuro ? 0.12 : 0.08)) }
    static let filoBarra = Color.delTema { UIColor(rgb: $0.sobreBarra ?? $0.filo ?? $0.texto, alfa: $0.sobreBarra != nil ? 0.12 : min(0.32, ($0.bordeAlfa ?? 0.08) * 2)) }
    // El punto oficial del logo «b.»: no cambia con el tema ni se usa en controles. En tinta, tinta (ni un punto de color).
    static let marca = Color.delTema { UIColor(rgb: $0.mono ? $0.texto : 0xE5532B) }
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

// Tamaño de letra de Bitácora (Ajustes → apariencia.), por cuenta en este iPhone. Multiplica los tamaños de Poppins
// y Dynamic Type sigue actuando encima. Sin zoom ni scaleEffect: la raíz se rehace con `.id` al cambiarlo.
enum EscalaLetra: String, CaseIterable, Identifiable {
    case pequena, normal, grande, muyGrande
    var id: String { rawValue }
    var factor: CGFloat { [.pequena: 0.9, .normal: 1, .grande: 1.12, .muyGrande: 1.25][self]! }
    var nombre: String { [.pequena: "pequeña.", .normal: "normal.", .grande: "grande.", .muyGrande: "muy grande."][self]! }
}

enum LetraActiva {
    nonisolated(unsafe) static var elegida: EscalaLetra = .normal
}

// Poppins con Dynamic Type: cada tamaño escala con el estilo de texto que se le indica, por la escala elegida.
// tamano(_:) expone el cálculo (escala de Ajustes) para que Inicio y las pruebas lo usen sin scaleEffect global.
enum Tipo {
    static func tamano(_ base: CGFloat) -> CGFloat { base * LetraActiva.elegida.factor }

    static func poppins(_ tamano: CGFloat, _ peso: Font.Weight = .regular, estilo: Font.TextStyle = .body) -> Font {
        let tamano = Self.tamano(tamano)
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
    // 2.0: escala más pequeña y curada (antes 42/34/20/16/13). Las pantallas nuevas usan `Letra` (V2/Lienzo.swift).
    static var tituloApartado: Font { poppins(28, .bold, estilo: .largeTitle) }
    static var titulo: Font { poppins(26, .bold, estilo: .largeTitle) }
    static var subtitulo: Font { poppins(16, .semibold, estilo: .title3) }
    static var cuerpo: Font { poppins(14.5, .regular, estilo: .body) }
    static var cuerpoFuerte: Font { poppins(14.5, .medium, estilo: .body) }
    static var pie: Font { poppins(12, .regular, estilo: .footnote) }
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
