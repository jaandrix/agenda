import Foundation

// 3.3 (petición de Alejandro: «algunos juegos no están en Steam»): carátulas de videojuegos de Wikipedia, sin clave.
// La imagen del cuadro de un artículo de videojuego es su carátula. Son imágenes no libres, así que hay que pedirlas con
// `pilicense=any`; sin eso Wikipedia no las da. Se busca en la inglesa (tiene casi todas) y en la española.
enum PortadasWikipedia {
    private static let sesion: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 10
        c.httpAdditionalHeaders = ["User-Agent": "Bitacora/1.0 (iOS)"]
        return URLSession(configuration: c)
    }()

    static func juegos(_ q: String) async -> [CandidataPortada] {
        let q = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return [] }
        async let en = buscar(q + " video game", idioma: "en")
        async let es = buscar(q + " videojuego", idioma: "es")
        return await en + es
    }

    private static func buscar(_ q: String, idioma: String) async -> [CandidataPortada] {
        var c = URLComponents(string: "https://\(idioma).wikipedia.org/w/api.php")
        c?.queryItems = [
            .init(name: "action", value: "query"), .init(name: "format", value: "json"),
            .init(name: "generator", value: "search"), .init(name: "gsrsearch", value: q), .init(name: "gsrlimit", value: "6"),
            .init(name: "prop", value: "pageimages"), .init(name: "piprop", value: "thumbnail"),
            .init(name: "pithumbsize", value: "600"), .init(name: "pilicense", value: "any")
        ]
        guard let url = c?.url, let res = try? await sesion.data(from: url),
              (res.1 as? HTTPURLResponse)?.statusCode == 200,
              let j = (try? JSONSerialization.jsonObject(with: res.0)) as? [String: Any],
              let paginas = (j["query"] as? [String: Any])?["pages"] as? [String: [String: Any]] else { return [] }
        return paginas.values
            .sorted { ($0["index"] as? Int ?? 99) < ($1["index"] as? Int ?? 99) }
            .compactMap { p in
                guard let titulo = p["title"] as? String, let img = (p["thumbnail"] as? [String: Any])?["source"] as? String,
                      img.hasPrefix("https://"), !img.lowercased().contains(".svg") else { return nil }
                return CandidataPortada(titulo: limpiar(titulo), anio: "", autor: "", imagen: img)
            }
    }

    // «Halo 3 (video game)» → «Halo 3».
    static func limpiar(_ titulo: String) -> String {
        titulo.replacingOccurrences(of: #"\s*\((video ?game|videojuego)[^)]*\)"#, with: "", options: [.regularExpression, .caseInsensitive])
    }
}
