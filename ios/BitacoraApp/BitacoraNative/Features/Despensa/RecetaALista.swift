import SwiftUI

// Pasar los ingredientes de una receta a la cesta (0.20), con la regla de recetaALaLista (js/compra.js):
// - lo que ya está en la lista sin comprar (misma `compraClave`) no se repite: solo se le anota «para Receta»;
// - lo nuevo entra como {id, texto, cantidad: "", precio: null, hecho: false, recetas: ["Receta (cantidad)"]}.
// En el iPhone, además, se elige qué ingredientes pasan y se avisa de lo añadido.
enum RecetaALista {
    static let tipo = "recetaALista"

    // compraClave: sin acentos ni mayúsculas, sin la cantidad delante y sin el plural de las palabras largas.
    static func clave(_ texto: String) -> String {
        var s = texto.lowercased().folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_ES"))
        s = s.replacingOccurrences(of: #"^\s*\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|uds?|paquetes?|botes?|latas?|docenas?|x)?\s+"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: #"[^a-z0-9ñ ]+"#, with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
        return s.split(separator: " ").map { p in
            p.count > 4 ? String(p).replacingOccurrences(of: #"(?:es|s)$"#, with: "", options: .regularExpression) : String(p)
        }.joined(separator: " ")
    }

    static func para(_ receta: RecetaDespensa, _ i: IngredienteReceta) -> String {
        i.cantidad.isEmpty ? receta.nombre : "\(receta.nombre) (\(i.cantidad))"
    }

    // Lo que ya está en la lista (sin comprar), por ingrediente.
    static func yaEsta(_ receta: RecetaDespensa, en lista: ListaDespensa?) -> Set<String> {
        let claves = Set((lista?.items ?? []).filter { !$0.hecho }.map { clave($0.texto) })
        return Set(receta.ingredientes.map(\.texto).filter { claves.contains(clave($0)) })
    }

    static func operacion(listaId: String, receta: RecetaDespensa, elegidos: [IngredienteReceta], ahora: Date = Date()) -> OperacionBitacora {
        let ms = Int64(ahora.timeIntervalSince1970 * 1000)
        let ings: [JSONValue] = elegidos.enumerated().map { k, i in
            .object(["texto": .string(i.texto), "para": .string(para(receta, i)), "id": .string("cmp_\(ms)_\(k)")])
        }
        return OperacionesExtra.op(tipo, ["listaId": .string(listaId), "ingredientes": .array(ings)])
    }

    static func aplicar(_ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        guard let listaId = d["listaId"]?.texto, let ings = d["ingredientes"]?.lista, !ings.isEmpty else { return valores }
        var lc = (valores["listaCompra"] ?? nil)?.objeto ?? [:]
        var listas = lc["listas"]?.lista ?? []
        guard let n = listas.firstIndex(where: { $0["id"]?.comoId == listaId }), var l = listas[n].objeto else { return valores }
        var items = l["items"]?.lista ?? []
        let antes = items
        for i in ings {
            guard let texto = i["texto"]?.texto, !texto.isEmpty, let id = i["id"]?.texto else { continue }
            let para = i["para"]?.texto ?? ""
            // Reaplicar: el id ya está, no se hace nada.
            if items.contains(where: { $0["id"]?.comoId == id }) { continue }
            if let j = items.firstIndex(where: { $0["hecho"]?.booleano != true && clave($0["texto"]?.texto ?? "") == clave(texto) }) {
                guard var o = items[j].objeto else { continue }
                var r = (o["recetas"]?.lista ?? []).compactMap(\.texto)
                if !para.isEmpty, !r.contains(para) { r.append(para) }
                o["recetas"] = .array(r.map { .string($0) })
                items[j] = .object(o)
            } else {
                items.append(.object(["id": .string(id), "texto": .string(texto), "cantidad": .string(""), "precio": .null,
                                      "hecho": .bool(false), "recetas": .array(para.isEmpty ? [] : [.string(para)])]))
            }
        }
        guard items != antes else { return valores }
        l["items"] = .array(items)
        listas[n] = .object(l)
        lc["listas"] = .array(listas)
        var r = valores
        r["listaCompra"] = .some(.object(lc))
        return r
    }
}

// La hoja para elegir: marcado lo que falta y desmarcado lo que ya está (si se marca, solo se anota la receta).
struct PasarRecetaView: View {
    @Environment(\.dismiss) private var cerrar
    let receta: RecetaDespensa
    let lista: ListaDespensa
    let pasar: ([IngredienteReceta]) -> Void
    @State private var elegidos: Set<String>
    private let ya: Set<String>

    init(receta: RecetaDespensa, lista: ListaDespensa, pasar: @escaping ([IngredienteReceta]) -> Void) {
        self.receta = receta; self.lista = lista; self.pasar = pasar
        let ya = RecetaALista.yaEsta(receta, en: lista)
        self.ya = ya
        _elegidos = State(initialValue: Set(receta.ingredientes.map(\.texto).filter { !ya.contains($0) }))
    }

    var body: some View {
        let nuevos = receta.ingredientes.filter { elegidos.contains($0.texto) && !ya.contains($0.texto) }.count
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    Text("a «\(lista.nombre.lowercased())».").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.bottom, Espacio.s)
                    ForEach(receta.ingredientes, id: \.texto) { i in
                        let marcado = elegidos.contains(i.texto), esta = ya.contains(i.texto)
                        Button {
                            if marcado { elegidos.remove(i.texto) } else { elegidos.insert(i.texto) }
                        } label: {
                            HStack(spacing: Espacio.s) {
                                Image(systemName: marcado ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: Tipo.tamano(20))).foregroundStyle(marcado ? Paleta.acento : Paleta.aro)
                                    .frame(width: 44, height: 44)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(i.texto).font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto)
                                    let meta = [i.cantidad, esta ? "ya está en la lista" : ""].filter { !$0.isEmpty }.joined(separator: ", ")
                                    if !meta.isEmpty { Text(meta + ".").font(Tipo.pie).foregroundStyle(esta ? Paleta.acento : Paleta.textoSecundario) }
                                }
                                Spacer(minLength: 0)
                            }
                            .frame(minHeight: 52)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                        .accessibilityAddTraits(marcado ? .isSelected : [])
                        .accessibilityHint(esta ? "ya está en la lista" : "")
                    }
                    HStack {
                        Button("todos.") { elegidos = Set(receta.ingredientes.map(\.texto)) }
                        Button("ninguno.") { elegidos = [] }
                    }
                    .font(Tipo.pie).foregroundStyle(Paleta.acento).buttonStyle(.plain).frame(minHeight: 44)
                }
                .padding(.horizontal, 20)
            }
            .background(Paleta.fondo.ignoresSafeArea())
            .safeAreaInset(edge: .bottom) {
                Button(nuevos == 0 && !elegidos.isEmpty ? "anotar la receta." : "pasar \(nuevos) a la cesta.") {
                    pasar(receta.ingredientes.filter { elegidos.contains($0.texto) })
                    cerrar()
                }
                .buttonStyle(BotonPrincipal())
                .disabled(elegidos.isEmpty)
                .padding(.horizontal, 20).padding(.vertical, Espacio.s)
                .background(Paleta.fondo)
            }
            .navigationTitle(receta.nombre.lowercased() + ".")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } } }
        }
        .presentationDetents([.medium, .large])
    }
}
