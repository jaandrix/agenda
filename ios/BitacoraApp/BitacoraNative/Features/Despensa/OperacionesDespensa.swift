import Foundation

// compraSeccion (js/compra.js): la web no guarda la sección en el producto; la deduce del texto con COMPRA_SECCIONES
// y lo aprendido (`aprendido[compraClave]`). Hasta la 0.20 la nativa leía `seccion` del producto y todo lo de la web
// caía en «otros».
enum SeccionCompra {
    private static let reglas: [(String, NSRegularExpression)] = [
        ("aperitivo", #"\b(almendra|nuez|nueces|avellana|quesito|gusanito|risko|turron|polvoron|mantecado|crocan|lacasito|chuche|huesito|patatas? (?:fritas|de bolsa|de jamon|jamon|serrano|sabor|onduladas|campesinas|lisas|al punto de sal|chips)|chips|nachos|doritos|snack|ganchito|palomita|maiz frito|frutos secos|cacahuet|pipas|pistacho|anacardo|chicle|caramelo|golosina|gominola|regaliz|chocolatina|bombon|tortitas? (?:de maiz|de arroz|campestre)|aceitunas?|encurtido|pepinillo|banderilla)"#),
        ("fruta", #"\b(repollo|remolacha|ciruela|albaricoque|papaya|granada|higos?\b|nispero|caqui|pomelo|moras\b|nabos?\b|rabano|habas\b|endivia|escarola|manzan|platan|naranj|mandarin|limon|lima\b|pera\b|peras\b|uvas?\b|fres|kiwi|melon|sandi|pina\b|mango|aguacate|tomate(?! frito)|lechug|cebolla|ajo\b|ajos\b|patata|zanahori|pimiento|calabac|calabaza|berenjen|pepino|brocoli|coliflor|espinac|acelga|champin|seta|fruta|verdura|ensalad|canonigo|rucula|perejil|cilantro|albahaca|puerro|apio|judias? verdes?|alcachof|esparrago|boniato|melocoton|nectarina|cereza|arandano|frambuesa)"#),
        ("fresco", #"\b(salami|sobrasada|morcilla|butifarra|pate\b|trucha|rodaballo|rape\b|lenguado|emperador|anchoa|arenque|cabracho|bonito\b|codorni|perdiz|pato\b|rinon|callos|sesos|molleja|pollo|pavo|ternera|cerdo|solomillo|lomo|costilla|secreto|presa|pluma|chuleta|entrecot|cordero|conejo|pechuga|muslo|alitas?|carne|filete|hamburgues|albondiga|salchich|chorizo|jamon|fuet|salchichon|mortadela|bacon|beicon|panceta|pescado|salmon|merluza|bacalao|dorada|lubina|sardina|boqueron|gamba|langostino|calamar|sepia|pulpo|mejill|almeja)"#),
        ("lacteo", #"\b(postres? lacteos?|leche(?! de avena| de soja| de almendra)|yogur|queso|roquefort|mozzarella|mantequilla|margarina|nata|huevo|kefir|batido|natillas|flan|cuajada|requeson)"#),
        ("pan", #"\b(ensaimada|tortitas\b|colines|reganas|tortillas? de (?:trigo|maiz)|berlina|churro|pan\b|panes|barra|baguette|bocadillo|chapata|hogaza|bollo|bolleria|croissant|cruasan|magdalen|napolitana|donut|tostad|biscote|bizcocho|galleta|picos\b|rosquilla)"#),
        ("despensa", #"\b(judias blancas|maiz en lata|cornflakes|nocilla|comino|tomillo|romero|laurel|canela|azafran|bicarbonato|gelatina|colorante|arroz|pasta|macarr|espagu|tallarin|fideo|lenteja|garbanzo|alubia|judion|harina|azucar|sal\b|aceite|vinagre|atun|sardinas en lata|conserva|tomate frito|tomate triturado|salsa|ketchup|mayonesa|mostaza|especia|pimienta|pimenton|oregano|caldo|pastilla de caldo|sopa|pure|cafe|te\b|infusion|manzanilla|cacao|cereal|avena|muesli|miel|mermelada|chocolate|crema de cacao|levadura|pan rallado|maiz dulce)"#),
        ("congelado", #"\b(san jacobo|congelad|helado|pizza|nugget|croqueta|empanadilla|guisantes|varitas|lasana)"#),
        ("bebida", #"\b(whisky|ron\b|ginebra|vodka|licor|mosto|sangria|bitter|vermu|brandy|agua|refresco|coca.?cola|fanta|aquarius|zumo|nectar|cerveza|vino|cava|sidra|bebida|tonica|gaseosa|leche de (?:avena|soja|almendra)|bebida vegetal|isotonica|energetica)"#),
        ("limpieza", #"\b(desinfectante|guantes|quitamanchas|abrillantador|antical|pastillas? para el (?:inodoro|vater|wc)|escoba|recogedor|pinzas|detergente|suavizante|lejia|friegasuelos|lavavajillas|fregona|mopa|bayeta|estropajo|papel de cocina|papel higienico|servilleta|bolsas? de basura|basura|limpia|limpiador|quitagrasas|ambientador|insecticida|pilas?\b|bombilla|papel de aluminio|film|vela)"#),
        ("higiene", #"\b(papel de vater|espuma de afeitar|panuelos|alcohol\b|gasas?\b|tiritas?\b|locion|champu|acondicionador|gel\b|jabon|pasta de dientes|dentifrico|cepillo|desodorante|compresa|tampon|crema|cuchilla|maquinilla|algodon|bastoncillo|colonia|toallitas|panal|protector solar|enjuague)"#)
    ].map { ($0.0, try! NSRegularExpression(pattern: $0.1)) }
    private static let caldo = try! NSRegularExpression(pattern: #"\b(caldo|sopa|cubito|pastilla de caldo|crema de verduras)\b"#)

    static func deducir(_ texto: String) -> String {
        let t = texto.lowercased().folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_ES"))
        let r = NSRange(t.startIndex..., in: t)
        if caldo.firstMatch(in: t, range: r) != nil { return "despensa" }
        return reglas.first { $0.1.firstMatch(in: t, range: r) != nil }?.0 ?? "otros"
    }

    // Lo aprendido manda, como en la web. Sin regla ni aprendido, la `seccion` que escribía la nativa hasta la 0.20
    // (salvo «otros», que marcar ponía a todo).
    static func de(texto: String, guardada: String?, aprendido: [String: String]) -> String {
        if let a = aprendido[RecetaALista.clave(texto)], LecturaDespensa.secciones.contains(a) { return a }
        let d = deducir(texto)
        if d == "otros", let g = guardada, g != "otros", LecturaDespensa.secciones.contains(g) { return g }
        return d
    }
}

enum OperacionesDespensa {
    static let marcar = "marcarCompra"
    static let editar = "editarCompra"

    // compraMarcar: solo `hecho`. El valor va escrito (no «al revés»), así reaplicarla da lo mismo y dos toques
    // seguidos dejan lo último que se vio.
    static func marcarOp(listaId: String, id: String, hecho: Bool) -> OperacionBitacora {
        OperacionesExtra.op(marcar, ["listaId": .string(listaId), "id": .string(id), "hecho": .bool(hecho)])
    }

    // guardarCompraItem: texto, cantidad y precio; la sección va a `aprendido` si no es la que se deduce. No toca
    // `hecho` ni `recetas`. Si el producto no existe, se crea sin marcar.
    static func editarOp(listaId: String, id: String, texto: String, cantidad: String, seccion: String, precio: String?) -> OperacionBitacora {
        var d: [String: JSONValue] = ["listaId": .string(listaId), "id": .string(id), "texto": .string(texto),
                                      "cantidad": .string(cantidad), "seccion": .string(seccion)]
        if let precio, !precio.isEmpty { d["precio"] = .string(precio) }
        return OperacionesExtra.op(editar, d)
    }

    static func aplicar(_ tipo: String, _ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        guard let id = d["id"]?.texto, var lc = (valores["listaCompra"] ?? nil)?.objeto else { return valores }
        var listas = lc["listas"]?.lista ?? []
        let listaId = d["listaId"]?.texto
        // Su lista primero; si el producto se movió o la lista cambió de id en otro dispositivo, donde esté.
        let donde: (Int, Int)? = {
            for (n, l) in listas.enumerated() where l["id"]?.comoId == listaId {
                if let j = l["items"]?.lista?.firstIndex(where: { $0["id"]?.comoId == id }) { return (n, j) }
            }
            for (n, l) in listas.enumerated() {
                if let j = l["items"]?.lista?.firstIndex(where: { $0["id"]?.comoId == id }) { return (n, j) }
            }
            return nil
        }()
        var r = valores
        switch tipo {
        case marcar:
            // Un producto borrado en otro sitio no vuelve.
            guard let w = donde, let hecho = d["hecho"]?.booleano else { return valores }
            let (n, j) = w
            guard var l = listas[n].objeto, var items = l["items"]?.lista,
                  var o = items[j].objeto, o["hecho"]?.booleano != hecho else { return valores }
            o["hecho"] = .bool(hecho)
            items[j] = .object(o); l["items"] = .array(items); listas[n] = .object(l)
        case editar:
            let limpio = String((d["texto"]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(160))
            guard !limpio.isEmpty else { return valores }
            let precio: JSONValue = (d["precio"]?.texto).flatMap { Dinero.decimal(texto: $0) }.flatMap { $0 > 0 ? $0 : nil }
                .map { .number(NSDecimalNumber(decimal: Dinero.redondeado($0)).stringValue) } ?? .null
            if let w = donde {
                let (n, j) = w
                guard var l = listas[n].objeto, var items = l["items"]?.lista, var o = items[j].objeto else { return valores }
                o["texto"] = .string(limpio); o["cantidad"] = .string(String((d["cantidad"]?.texto ?? "").prefix(80))); o["precio"] = precio
                items[j] = .object(o); l["items"] = .array(items); listas[n] = .object(l)
            } else {
                guard let n = listas.firstIndex(where: { $0["id"]?.comoId == listaId }), var l = listas[n].objeto else { return valores }
                var items = l["items"]?.lista ?? []
                items.append(.object(["id": .string(id), "texto": .string(limpio), "cantidad": .string(String((d["cantidad"]?.texto ?? "").prefix(80))),
                                      "precio": precio, "hecho": .bool(false)]))
                l["items"] = .array(items); listas[n] = .object(l)
            }
            if let s = d["seccion"]?.texto, LecturaDespensa.secciones.contains(s), s != SeccionCompra.deducir(limpio) {
                var aprendido = lc["aprendido"]?.objeto ?? [:]
                aprendido[RecetaALista.clave(limpio)] = .string(s)
                lc["aprendido"] = .object(aprendido)
            }
        default:
            return valores
        }
        lc["listas"] = .array(listas)
        r["listaCompra"] = .some(.object(lc))
        return r
    }
}

// Lo marcado en este iPhone antes de que la lista recargada lo traiga. El valor de un toque sale de lo que se ve
// (no de la foto con la que se pintó la fila): tres toques rápidos dejan marcado. Una marca se suelta cuando llega
// un documento de una revisión igual o posterior a la de su operación, que ya la incluye.
struct MarcasDespensa: Equatable {
    struct Marca: Equatable { var hecho: Bool; var revision: Int? }
    private(set) var marcas: [String: Marca] = [:]

    func hecho(_ item: ItemDespensa) -> Bool { marcas[item.id]?.hecho ?? item.hecho }

    // Devuelve el valor nuevo que hay que mandar.
    mutating func tocar(_ item: ItemDespensa) -> Bool {
        let nuevo = !hecho(item)
        marcas[item.id] = Marca(hecho: nuevo, revision: nil)
        return nuevo
    }

    // La operación de ese valor ya está en la cola, con la revisión que devolvió el motor. Si entretanto hubo otro
    // toque, la marca sigue en vuelo.
    mutating func confirmar(_ id: String, hecho: Bool, revision: Int) {
        guard marcas[id]?.hecho == hecho, marcas[id]?.revision == nil else { return }
        marcas[id]?.revision = revision
    }

    mutating func fallo(_ id: String, hecho: Bool) {
        if marcas[id]?.hecho == hecho { marcas[id] = nil }
    }

    mutating func cargado(revision: Int) {
        marcas = marcas.filter { _, m in m.revision.map { $0 > revision } ?? true }
    }

    var vacio: Bool { marcas.isEmpty }
}
