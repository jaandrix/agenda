import Foundation

// 3.4 (petición de Alejandro: «hay libros modernos cuya portada no encuentro»): portadas de libros de Apple Books, con
// la API de búsqueda de iTunes (sin clave; solo viaja el título o el ISBN). Tiene casi todas las novedades en español.
// Las imágenes vienen a 100 px; la dirección admite otro tamaño y se pide a 600.
enum PortadasApple {
    private static let sesion: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 10
        return URLSession(configuration: c)
    }()

    static func libros(_ q: String) async -> [CandidataPortada] {
        let q = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, var c = URLComponents(string: "https://itunes.apple.com/search") else { return [] }
        c.queryItems = [.init(name: "term", value: q), .init(name: "media", value: "ebook"), .init(name: "entity", value: "ebook"),
                        .init(name: "country", value: "es"), .init(name: "limit", value: "10")]
        return await pedir(c.url)
    }

    static func libroPorISBN(_ isbn: String) async -> CandidataPortada? {
        await pedir(URL(string: "https://itunes.apple.com/lookup?isbn=\(isbn)&country=es")).first
    }

    static func porISBN(_ isbn: String) async -> String? {
        await libroPorISBN(isbn)?.imagen
    }

    private static func pedir(_ url: URL?) async -> [CandidataPortada] {
        guard let url, let res = try? await sesion.data(from: url), (res.1 as? HTTPURLResponse)?.statusCode == 200,
              let j = (try? JSONSerialization.jsonObject(with: res.0)) as? [String: Any],
              let r = j["results"] as? [[String: Any]] else { return [] }
        return r.compactMap { x in
            guard let titulo = x["trackName"] as? String, let img = x["artworkUrl100"] as? String, img.hasPrefix("https://") else { return nil }
            let grande = img.replacingOccurrences(of: #"\d+x\d+bb"#, with: "600x900bb", options: .regularExpression)
            return CandidataPortada(titulo: titulo, anio: String(((x["releaseDate"] as? String) ?? "").prefix(4)),
                                    autor: (x["artistName"] as? String) ?? "", imagen: grande)
        }
    }
}
