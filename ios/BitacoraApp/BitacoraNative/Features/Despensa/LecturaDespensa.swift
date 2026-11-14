import Foundation

struct ItemDespensa: Sendable, Identifiable, Equatable {
    let id: String; let texto: String; let cantidad: String; let seccion: String
    let precio: Decimal?; let hecho: Bool; let recetas: [String]
}
struct ListaDespensa: Sendable, Identifiable, Equatable { let id: String; let nombre: String; let items: [ItemDespensa] }
struct CompraGuardada: Sendable, Identifiable, Equatable {
    let id: String; let fecha: String; let tienda: String; let total: Decimal; let fuente: String; let productos: Int; let sinComprar: [String]
}
struct IngredienteReceta: Sendable, Equatable { let texto: String; let cantidad: String }
struct RecetaDespensa: Sendable, Identifiable, Equatable {
    let id: String; let nombre: String; let raciones: Int; let ingredientes: [IngredienteReceta]; let pasos: [String]; let notas: String
}
struct PlatoPlan: Sendable, Identifiable, Equatable {
    let id: String; let dia: String; let momento: String; let nombre: String; let recetaId: String?; let ingredientes: [String]
}
struct GrupoDespensa: Sendable, Equatable { let seccion: String; let items: [ItemDespensa] }
struct FrecuenteDespensa: Sendable, Identifiable, Equatable { var id: String { texto }; let texto: String; let veces: Int }
struct VistaDespensa: Sendable, Equatable {
    let listas: [ListaDespensa]; let actual: String?; let historial: [CompraGuardada]; let recetas: [RecetaDespensa]
    let plan: [String: [PlatoPlan]]; let frecuentes: [FrecuenteDespensa]
    var listaActual: ListaDespensa? { listas.first { $0.id == actual } ?? listas.first }
}

enum LecturaDespensa {
    static let secciones = ["aperitivo", "fruta", "fresco", "lacteo", "pan", "despensa", "congelado", "bebida", "limpieza", "higiene", "otros"]
    static let nombres: [String: String] = [
        "aperitivo": "aperitivos y dulces", "fruta": "frutas y verduras", "fresco": "carne y pescado", "lacteo": "lácteos y huevos",
        "pan": "panadería", "despensa": "pasta, arroz y conservas", "congelado": "congelados", "bebida": "bebidas",
        "limpieza": "limpieza y hogar", "higiene": "higiene", "otros": "otros"
    ]

    static func vista(_ doc: DocumentoBitacora) -> VistaDespensa {
        let d = ((try? doc.valor(de: "listaCompra")) ?? nil)?.objeto ?? [:]
        let aprendido = (d["aprendido"]?.objeto ?? [:]).compactMapValues(\.texto)
        var vistasListas = Set<String>()
        let listas = (d["listas"]?.lista ?? []).compactMap { l -> ListaDespensa? in
            guard let id = l["id"]?.comoId, vistasListas.insert(id).inserted else { return nil }
            // Un id repetido haría que el ForEach pintara una fila con los datos de otra y que marcar tocara la que no es.
            var vistos = Set<String>()
            let items = (l["items"]?.lista ?? []).compactMap { x -> ItemDespensa? in
                guard let iid = x["id"]?.comoId, vistos.insert(iid).inserted else { return nil }
                let texto = x["texto"]?.texto ?? ""
                return ItemDespensa(id: iid, texto: texto, cantidad: x["cantidad"]?.texto ?? "",
                                    seccion: SeccionCompra.de(texto: texto, guardada: x["seccion"]?.texto, aprendido: aprendido), precio: Dinero.decimal(x["precio"]),
                                    hecho: x["hecho"]?.booleano == true, recetas: (x["recetas"]?.lista ?? []).compactMap(\.texto))
            }
            return ListaDespensa(id: id, nombre: l["nombre"]?.texto ?? "Casa", items: items)
        }
        let historial = (d["historial"]?.lista ?? []).compactMap { x -> CompraGuardada? in
            guard let id = x["id"]?.comoId else { return nil }
            return CompraGuardada(id: id, fecha: x["fecha"]?.texto ?? "", tienda: x["tienda"]?.texto ?? "",
                                  total: Dinero.decimal(x["total"]) ?? 0, fuente: x["fuente"]?.texto ?? "manual",
                                  productos: (x["items"]?.lista ?? []).count, sinComprar: (x["sinComprar"]?.lista ?? []).compactMap(\.texto))
        }.sorted { ($0.fecha, $0.id) > ($1.fecha, $1.id) }
        let recetas = (d["recetas"]?.lista ?? []).compactMap { r -> RecetaDespensa? in
            guard let id = r["id"]?.comoId else { return nil }
            return RecetaDespensa(id: id, nombre: r["nombre"]?.texto ?? "receta",
                                  raciones: NSDecimalNumber(decimal: Dinero.decimal(r["raciones"]) ?? 1).intValue,
                                  ingredientes: (r["ingredientes"]?.lista ?? []).compactMap { i in
                                      guard let t = i["texto"]?.texto, !t.isEmpty else { return nil }
                                      return IngredienteReceta(texto: t, cantidad: i["cantidad"]?.texto ?? "")
                                  }, pasos: (r["pasos"]?.lista ?? []).compactMap(\.texto), notas: r["notas"]?.texto ?? "")
        }.sorted { $0.nombre.localizedCaseInsensitiveCompare($1.nombre) == .orderedAscending }
        var plan: [String: [PlatoPlan]] = [:]
        for (dia, valor) in d["plan"]?.objeto ?? [:] {
            plan[dia] = (valor.lista ?? []).compactMap { p in
                guard let id = p["id"]?.comoId else { return nil }
                return PlatoPlan(id: id, dia: dia, momento: p["momento"]?.texto ?? "", nombre: p["nombre"]?.texto ?? "",
                                 recetaId: p["recetaId"]?.comoId, ingredientes: (p["ingredientes"]?.lista ?? []).compactMap { $0["texto"]?.texto })
            }
        }
        let frecuentes = (d["frecuentes"]?.objeto ?? [:]).map { FrecuenteDespensa(texto: $0.key, veces: NSDecimalNumber(decimal: Dinero.decimal($0.value) ?? 0).intValue) }
            .filter { $0.veces > 0 }.sorted { ($0.veces, $0.texto) > ($1.veces, $1.texto) }
        return VistaDespensa(listas: listas, actual: d["actual"]?.comoId, historial: historial, recetas: recetas, plan: plan,
                             frecuentes: Array(frecuentes.prefix(12)))
    }

    // Por secciones del súper en su orden (lo que no está en ninguna, al final) y lo marcado aparte: el carro.
    static func agrupar(_ items: [ItemDespensa], hecho: (ItemDespensa) -> Bool) -> (secciones: [GrupoDespensa], carro: [ItemDespensa]) {
        var porSeccion: [String: [ItemDespensa]] = [:]
        var carro: [ItemDespensa] = []
        for i in items {
            if hecho(i) { carro.append(i) } else { porSeccion[i.seccion.isEmpty ? "otros" : i.seccion, default: []].append(i) }
        }
        let orden = secciones.filter { porSeccion[$0] != nil } + porSeccion.keys.filter { !secciones.contains($0) }.sorted()
        return (orden.map { GrupoDespensa(seccion: $0, items: porSeccion[$0] ?? []) }, carro)
    }

    static func estimado(_ lista: ListaDespensa) -> Decimal { lista.items.filter { !$0.hecho }.reduce(Decimal(0)) { $0 + ($1.precio ?? 0) } }
    static func ingredientesFaltantes(_ receta: RecetaDespensa, en lista: ListaDespensa?) -> [String] {
        let presentes = Set((lista?.items ?? []).filter { !$0.hecho }.map { normalizar($0.texto) })
        return receta.ingredientes.filter { !presentes.contains(normalizar($0.texto)) }.map { $0.texto }
    }
    static func normalizar(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
