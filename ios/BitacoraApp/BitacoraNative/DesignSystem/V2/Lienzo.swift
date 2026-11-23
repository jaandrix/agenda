import SwiftUI
import UIKit

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Bitácora 2.0 (rediseño del 23-11-2026). Un solo tema, «bitácora.»: blanco roto, tarjetas blancas, negro carbón y
// naranja coral. Fuente única de verdad de colores, medidas, letra y sombras para TODAS las pantallas nuevas.
// Reglas (ver ios/BitacoraApp/DISENO-V2.md): ninguna vista usa hex, radios, tamaños de letra o sombras sueltos; si falta
// algo, se añade aquí primero. `Paleta` (Tema.swift) sigue existiendo y, con el tema «bitácora.», da estos mismos colores,
// así que lo que aún no se ha rediseñado ya se ve con la paleta nueva.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

enum Lienzo {
    private static func c(_ v: UInt32, _ a: CGFloat = 1) -> Color { Color(uiColor: UIColor(rgb: v, alfa: a)) }

    // Valores crudos: los comparten Lienzo y TemaTokens.bitacora (Tema.swift). Nadie más debe leerlos.
    enum Hex {
        static let fondo: UInt32 = 0xF2F3F5
        static let tarjeta: UInt32 = 0xFFFFFF
        static let oscuro: UInt32 = 0x111315
        static let oscuroElevado: UInt32 = 0x1D2024
        static let sutil: UInt32 = 0xE8E9EC
        static let naranja: UInt32 = 0xFF6B4A
        static let naranjaClaro: UInt32 = 0xFF9A7A
        static let naranjaProfundo: UInt32 = 0xE8572F
        static let tinta: UInt32 = 0x111315
        static let tintaSecundaria: UInt32 = 0x5F6672
        static let tintaTerciaria: UInt32 = 0x9AA0AA
        static let sobreOscuro: UInt32 = 0xF4F4F2
        static let verde: UInt32 = 0x23986A
        static let rojo: UInt32 = 0xD8402B
        static let azul: UInt32 = 0x4A72E8
        static let ambar: UInt32 = 0xE9A21F
        static let violeta: UInt32 = 0x8A63D2
    }

    // Superficies
    static let fondo = c(Hex.fondo)                         // lienzo general (bgCanvas)
    static let tarjeta = c(Hex.tarjeta)                     // tarjetas, semana, píldora activa (surfaceCard)
    static let oscuro = c(Hex.oscuro)                       // modal flotante, botón apuntar, botones primarios (surfaceDark)
    static let oscuroElevado = c(Hex.oscuroElevado)         // campos y filas dentro de lo oscuro
    static let sutil = c(Hex.sutil)                         // chips inactivos, buscador sobre blanco, día elegido
    static let sutilSuave = c(Hex.sutil, 0.55)              // pulsado sobre blanco, fondos de iconos claros
    static let velo = Color.black.opacity(0.28)             // detrás de un modal flotante

    // Acento
    static let naranja = c(Hex.naranja)                     // relleno: banda del modal, indicadores, puntos
    static let naranjaProfundo = c(Hex.naranjaProfundo)     // texto o icono naranja sobre blanco (más contraste)
    static let naranjaSuave = c(Hex.naranja, 0.12)          // tinte de fondo (seleccionado, chip naranja)
    static let naranjaBrillo = c(Hex.naranja, 0.45)         // sombra luminosa de la banda naranja

    // Tinta
    static let tinta = c(Hex.tinta)                         // títulos y texto principal
    static let tintaSecundaria = c(Hex.tintaSecundaria)     // texto que informa (4,5:1 sobre fondo y tarjeta)
    static let tintaTerciaria = c(Hex.tintaTerciaria)       // decorativo, placeholders, iconos inactivos
    static let sobreOscuro = c(Hex.sobreOscuro)             // texto sobre negro
    static let sobreOscuroSuave = c(Hex.sobreOscuro, 0.56)  // texto secundario sobre negro
    static let sobreOscuroTenue = c(Hex.sobreOscuro, 0.32)  // placeholders sobre negro
    static let sobreNaranja = c(Hex.oscuro)                 // texto sobre naranja: negro (7:1), como en la referencia

    // Filetes
    static let filo = c(Hex.oscuro, 0.06)                   // borde de tarjeta y separadores
    static let filoFuerte = c(Hex.oscuro, 0.12)
    static let filoOscuro = c(Hex.sobreOscuro, 0.08)        // separadores dentro de lo oscuro

    // Estados de dinero y avisos
    static let positivo = c(Hex.verde)
    static let negativo = c(Hex.rojo)
    static let aviso = c(Hex.ambar)

    // Los puntitos de la semana y las marcas de tipo. Siempre por significado, nunca por gusto.
    enum Punto {
        static let evento = Lienzo.naranja
        static let tarea = Lienzo.tinta
        static let estudio = Lienzo.c(Hex.azul)
        static let rutina = Lienzo.c(Hex.verde)
        static let cumple = Lienzo.c(Hex.ambar)
        static let viaje = Lienzo.c(Hex.violeta)
        static let dinero = Lienzo.c(Hex.verde)
        static let otro = Lienzo.tintaTerciaria
    }

    // Degradado de bienvenida (fotos 1 y 2): naranja arriba que se funde con el lienzo. Solo cabeceras de portada.
    static let degradadoCabecera = LinearGradient(
        stops: [.init(color: c(Hex.naranja, 0.95), location: 0),
                .init(color: c(Hex.naranjaClaro, 0.55), location: 0.38),
                .init(color: c(Hex.fondo, 0), location: 1)],
        startPoint: .top, endPoint: .bottom)
}

// Medidas: radios, márgenes y alturas. Radios concéntricos: interior = max(exterior - relleno, 8).
enum Medida {
    // Radios (siempre con style: .continuous)
    static let radioTarjeta: CGFloat = 22
    static let radioModal: CGFloat = 28
    static let radioControl: CGFloat = 14
    static let radioFila: CGFloat = 16
    static let radioIcono: CGFloat = 10          // para un IconoCuadrado de 34; el componente lo escala solo
    static func concentrico(_ exterior: CGFloat, relleno: CGFloat) -> CGFloat { max(exterior - relleno, 8) }

    // Espacios (escala de 4)
    static let xxs: CGFloat = 4
    static let xs: CGFloat = 8
    static let s: CGFloat = 12
    static let m: CGFloat = 16
    static let l: CGFloat = 20
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32

    // Márgenes de página
    static let margen: CGFloat = 16              // lateral de toda pantalla
    static let rellenoTarjeta: CGFloat = 16
    static let entreTarjetas: CGFloat = 12
    static let entreSecciones: CGFloat = 24

    // Controles
    static let toque: CGFloat = 44               // área táctil mínima
    static let alturaControl: CGFloat = 44
    static let alturaBuscador: CGFloat = 42
    static let icono: CGFloat = 34               // IconoCuadrado por defecto
    static let iconoGrande: CGFloat = 44
    static let iconoPequeno: CGFloat = 26

    // Barra flotante y botón de apuntar
    static let alturaBarra: CGFloat = 60
    static let anchoApuntar: CGFloat = 78
    static let separacionInferior: CGFloat = 10  // de la barra al borde de abajo, además del indicador de inicio
    // Lo que las pantallas reservan abajo para que su último elemento suba por encima de la barra.
    static let reservaBarra: CGFloat = 74
}

// Letra: Poppins (la de la marca), esencialmente pequeña. Pasa por Tipo.poppins: respeta el tamaño de letra de Ajustes
// y Dynamic Type.
enum Letra {
    static var portada: Font { Tipo.poppins(26, .bold, estilo: .title) }           // «hola, alejandro.»
    static var titulo: Font { Tipo.poppins(22, .bold, estilo: .title2) }           // título de página
    static var marca: Font { Tipo.poppins(17, .bold, estilo: .headline) }          // «bitácora» junto a la b.
    static var seccion: Font { Tipo.poppins(15, .semibold, estilo: .headline) }    // cabecera de sección
    static var tituloTarjeta: Font { Tipo.poppins(15, .semibold, estilo: .headline) }
    static var cuerpo: Font { Tipo.poppins(14, .regular, estilo: .body) }
    static var cuerpoFuerte: Font { Tipo.poppins(14, .medium, estilo: .body) }
    static var detalle: Font { Tipo.poppins(13, .regular, estilo: .subheadline) }  // extractos, segunda línea
    static var pie: Font { Tipo.poppins(12, .regular, estilo: .footnote) }         // metadatos, fechas
    static var pieFuerte: Font { Tipo.poppins(12, .semibold, estilo: .footnote) }
    static var etiqueta: Font { Tipo.poppins(11, .semibold, estilo: .caption) }    // EN MAYÚSCULAS con `.tracking(Letra.espaciado)`
    static var boton: Font { Tipo.poppins(14, .semibold, estilo: .body) }
    static var pestana: Font { Tipo.poppins(13, .semibold, estilo: .footnote) }
    static var numeroGrande: Font { Tipo.poppins(28, .semibold, estilo: .title).monospacedDigit() }
    static var numero: Font { Tipo.poppins(15, .semibold, estilo: .headline).monospacedDigit() }
    static var hora: Font { Tipo.poppins(12, .medium, estilo: .footnote).monospacedDigit() }
    static let espaciado: CGFloat = 1.4
}

// Sombras: difusas, casi imperceptibles. Solo estas tres.
enum Sombra {
    case suave       // tarjetas sobre el lienzo
    case flotante    // barra, semana, buscador flotante
    case oscura      // botón de apuntar y modal oscuro

    var color: Color {
        switch self {
        case .suave: return .black.opacity(0.05)
        case .flotante: return .black.opacity(0.09)
        case .oscura: return .black.opacity(0.26)
        }
    }
    var radio: CGFloat { switch self { case .suave: 12; case .flotante: 22; case .oscura: 18 } }
    var y: CGFloat { switch self { case .suave: 4; case .flotante: 10; case .oscura: 10 } }
}

extension View {
    func sombra(_ s: Sombra) -> some View { shadow(color: s.color, radius: s.radio, x: 0, y: s.y) }

    // Tarjeta blanca estándar: relleno, radio 22 continuo, filete casi invisible y sombra suave.
    func tarjeta(relleno: CGFloat = Medida.rellenoTarjeta, radio: CGFloat = Medida.radioTarjeta) -> some View {
        padding(relleno)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Lienzo.tarjeta, in: RoundedRectangle(cornerRadius: radio, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radio, style: .continuous).strokeBorder(Lienzo.filo))
            .sombra(.suave)
    }

    // Fondo de página: el lienzo hasta los bordes.
    func fondoLienzo() -> some View { background(Lienzo.fondo.ignoresSafeArea()) }

    // Para pantallas con scroll: deja subir el último elemento por encima de la barra flotante. El armazón ya añade la
    // reserva a cada NavigationStack; usar esto solo en scrolls que viven fuera de él (hojas a pantalla completa).
    func huecoBarra() -> some View { contentMargins(.bottom, Medida.reservaBarra, for: .scrollContent) }
}
