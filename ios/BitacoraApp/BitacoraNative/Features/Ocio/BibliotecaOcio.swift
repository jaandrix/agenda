import SwiftUI

// 3.2: la biblioteca de cada pestaña de Ocio con orden y filtro que se recuerdan entre aperturas (UserDefaults, por
// tipo), los juegos agrupados por plataforma y la mayúscula inicial de lo que se guarda.

enum OrdenOcio: String, CaseIterable, Identifiable {
    case recientes, anadidos, alfabetico, autor, publicacion, nota
    var id: String { rawValue }
    var titulo: String {
        switch self {
        case .recientes: return "lo último."
        case .anadidos: return "añadidos hace poco."
        case .alfabetico: return "de la a a la z."
        case .autor: return "por autor."
        case .publicacion: return "por año de publicación."
        case .nota: return "por nota."
        }
    }
    static func opciones(_ tipo: String) -> [OrdenOcio] {
        tipo == "book" ? allCases : allCases.filter { $0 != .autor }
    }
}

enum FiltroOcio: String, CaseIterable, Identifiable {
    case todos, terminados, pendientes, cinco
    var id: String { rawValue }
    func titulo(_ tipo: String) -> String {
        switch (self, tipo) {
        case (.todos, "book"), (.todos, "game"): return "todos."
        case (.todos, _): return "todas."
        case (.terminados, "book"): return "leídos."
        case (.terminados, "movie"): return "vistas."
        case (.terminados, "series"): return "terminadas."
        case (.terminados, _): return "completados."
        case (.pendientes, "book"): return "sin leer."
        case (.pendientes, "movie"): return "sin ver."
        case (.pendientes, "series"): return "sin terminar."
        case (.pendientes, _): return "sin terminar."
        case (.cinco, _): return "5 estrellas."
        }
    }
}

enum BibliotecaOcio {
    // Terminado: con fecha de fin o un estado «Complet…»; una película, si tiene día de vista.
    static func terminada(_ e: EntradaOcio) -> Bool {
        if e.tipo == "movie" { return !e.fechaInicio.isEmpty || !e.fechaFin.isEmpty }
        return !e.fechaFin.isEmpty || e.estado.hasPrefix("Complet")
    }

    static func cinco(_ e: EntradaOcio) -> Bool { e.valoracion >= 5 }

    static func filtrar(_ lista: [EntradaOcio], _ f: FiltroOcio, plataforma: String = "") -> [EntradaOcio] {
        let porFiltro: [EntradaOcio]
        switch f {
        case .todos: porFiltro = lista
        case .terminados: porFiltro = lista.filter(terminada)
        case .pendientes: porFiltro = lista.filter { !terminada($0) }
        case .cinco: porFiltro = lista.filter(cinco)
        }
        guard !plataforma.isEmpty else { return porFiltro }
        let p = clavePlataforma(plataforma)
        return porFiltro.filter { clavePlataforma($0.plataforma) == p }
    }

    // `lista` llega ya por «lo último» (LecturaOcio.vista); el resto se ordena aquí, con el título de desempate.
    static func ordenar(_ lista: [EntradaOcio], _ o: OrdenOcio) -> [EntradaOcio] {
        let t = { (e: EntradaOcio) in LecturaOcio.normalizar(e.titulo) }
        switch o {
        case .recientes: return lista
        case .anadidos: return lista.sorted { ($0.creada, t($1)) > ($1.creada, t($0)) }
        case .alfabetico: return lista.sorted { t($0).localizedStandardCompare(t($1)) == .orderedAscending }
        case .autor:
            return lista.sorted {
                let a = apellido($0.autor), b = apellido($1.autor)
                if a.isEmpty != b.isEmpty { return !a.isEmpty }
                if a != b { return a.localizedStandardCompare(b) == .orderedAscending }
                return t($0).localizedStandardCompare(t($1)) == .orderedAscending
            }
        case .publicacion:
            return lista.sorted {
                let a = Int($0.anio.prefix(4)) ?? 0, b = Int($1.anio.prefix(4)) ?? 0
                if (a == 0) != (b == 0) { return a != 0 }
                return a != b ? a > b : t($0).localizedStandardCompare(t($1)) == .orderedAscending
            }
        case .nota:
            return lista.sorted { $0.valoracion != $1.valoracion ? $0.valoracion > $1.valoracion : t($0).localizedStandardCompare(t($1)) == .orderedAscending }
        }
    }

    // «Gabriel García Márquez» → «garcia marquez gabriel»: se ordena por apellidos, como en una librería.
    static func apellido(_ autor: String) -> String {
        let partes = LecturaOcio.normalizar(autor).split(separator: " ").map(String.init)
        guard partes.count > 1 else { return partes.first ?? "" }
        return (partes.dropFirst() + [partes[0]]).joined(separator: " ")
    }

    // Juegos por plataforma: grupos por nombre (sin distinguir mayúsculas), los más poblados primero y «sin plataforma»
    // al final.
    static func clavePlataforma(_ p: String) -> String { LecturaOcio.normalizar(p) }

    static func porPlataforma(_ lista: [EntradaOcio]) -> [GrupoPlataformaOcio] {
        var orden: [String] = [], grupos: [String: [EntradaOcio]] = [:], nombres: [String: String] = [:]
        for e in lista {
            let k = clavePlataforma(e.plataforma)
            if grupos[k] == nil { orden.append(k); nombres[k] = MayusculaOcio.inicial(e.plataforma.trimmingCharacters(in: .whitespaces)) }
            grupos[k, default: []].append(e)
        }
        let claves = orden.sorted { a, b in
            if a.isEmpty != b.isEmpty { return !a.isEmpty }
            let na = grupos[a]?.count ?? 0, nb = grupos[b]?.count ?? 0
            return na != nb ? na > nb : a < b
        }
        return claves.map { GrupoPlataformaOcio(id: $0, plataforma: nombres[$0] ?? "", entradas: grupos[$0] ?? []) }
    }

    static func plataformas(_ lista: [EntradaOcio]) -> [String] {
        porPlataforma(lista).map(\.plataforma).filter { !$0.isEmpty }
    }

    static func textoFormato(_ f: String) -> String {
        switch f { case "fisico": return "físico"; case "digital": return "digital"; case "otro": return "otro"; default: return "" }
    }
}

struct GrupoPlataformaOcio: Identifiable {
    let id: String
    let plataforma: String
    let entradas: [EntradaOcio]
}

// Las plataformas que salen como atajo en el editor de juegos (se puede escribir cualquier otra).
enum PlataformasOcio {
    static let comunes = ["PS5", "PS4", "Switch 2", "Switch", "Xbox Series", "PC", "Steam Deck", "Móvil"]
}

// Lo guardado en Ocio empieza por mayúscula: «la invitación» → «La invitación». Solo cambia la primera letra, y no si
// la primera palabra ya lleva otra mayúscula dentro («iPhone», «eBook»): es un nombre escrito así a propósito.
enum MayusculaOcio {
    static func inicial(_ texto: String) -> String {
        let t = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let i = t.firstIndex(where: { $0.isLetter }) else { return t }
        let letra = t[i]
        guard letra.isLowercase else { return t }
        let resto = t[t.index(after: i)...]
        let palabra = resto.prefix { !$0.isWhitespace }
        if palabra.contains(where: { $0.isUppercase }) { return t }
        return String(t[..<i]) + String(letra).uppercased() + String(resto)
    }
}

// Orden y filtro de cada pestaña, recordados entre aperturas.
enum PreferenciasOcio {
    private static let defaults = UserDefaults.standard
    static func orden(_ tipo: String) -> OrdenOcio {
        let o = OrdenOcio(rawValue: defaults.string(forKey: "ocio.orden.\(tipo)") ?? "") ?? .recientes
        return OrdenOcio.opciones(tipo).contains(o) ? o : .recientes
    }
    static func filtro(_ tipo: String) -> FiltroOcio {
        FiltroOcio(rawValue: defaults.string(forKey: "ocio.filtro.\(tipo)") ?? "") ?? .todos
    }
    static func plataforma(_ tipo: String) -> String { defaults.string(forKey: "ocio.plataforma.\(tipo)") ?? "" }
    static func guardar(_ tipo: String, orden: OrdenOcio, filtro: FiltroOcio, plataforma: String) {
        defaults.set(orden.rawValue, forKey: "ocio.orden.\(tipo)")
        defaults.set(filtro.rawValue, forKey: "ocio.filtro.\(tipo)")
        defaults.set(plataforma, forKey: "ocio.plataforma.\(tipo)")
    }
}

// Título de sección de Ocio en frase normal («Ahora mismo.»), sin las mayúsculas espaciadas de `EtiquetaSeccion`.
struct TituloSeccionOcio: View {
    let texto: String
    var detalle: String? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Medida.xs) {
            Text(texto).font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
            if let detalle {
                Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaTerciaria).monospacedDigit()
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Medida.xxs)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

// Distintivo de las de 5 estrellas, arriba a la derecha de la portada (como la chapa de la web, pero discreto): un
// círculo negro pequeño con la estrella naranja y un filo blanco para que se lea sobre cualquier portada.
struct ChapaCincoOcio: View {
    var lado: CGFloat = 20

    var body: some View {
        Image(systemName: "star.fill")
            .font(.system(size: lado * 0.48, weight: .bold))
            .foregroundStyle(Lienzo.naranja)
            .frame(width: lado, height: lado)
            .background(Lienzo.oscuro, in: Circle())
            .overlay(Circle().strokeBorder(Lienzo.tarjeta.opacity(0.9), lineWidth: 1.5))
            .sombra(.suave)
            .accessibilityHidden(true)
    }
}
