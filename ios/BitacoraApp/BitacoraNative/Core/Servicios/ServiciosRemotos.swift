import Foundation

// Lo que la portada enseña y no vive en la fila de `bitacora`: la foto (`perfiles_fotos`), el tiempo (Open-Meteo) y los
// buses (función `transporte`, paradas del Ayuntamiento). Cada uno con su caché fuera del documento: nada de esto se
// escribe nunca en el JSON del usuario, y si uno falla los demás siguen.
struct ServiciosRemotos: Sendable {
    let perfil: RepositorioPerfil
    let tiempo: RepositorioTiempo
    let transporte: RepositorioTransporte
    let deportes: RepositorioDeportes

    init(cliente: ClienteSupabase, auth: AuthRepository) {
        perfil = RepositorioPerfil(cliente: cliente, auth: auth)
        tiempo = RepositorioTiempo()
        transporte = RepositorioTransporte(cliente: cliente, auth: auth)
        deportes = RepositorioDeportes(cliente: cliente, auth: auth)
    }

    static func get(_ url: URL) async -> Data? {
        var r = URLRequest(url: url, timeoutInterval: 12)
        r.setValue("Bitacora/1.0 (appbitacora.es)", forHTTPHeaderField: "User-Agent")
        guard let res = try? await URLSession.shared.data(for: r), (res.1 as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return res.0
    }

    static var carpeta: URL {
        let u = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("servicios", isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }
}

// perfil.js: la foto es un data URL JPEG de 256 px (ya en blanco y negro). Se guarda en Caches por usuario.
actor RepositorioPerfil {
    private let cliente: ClienteSupabase
    private let auth: AuthRepository
    private var pedida: Set<String> = []

    init(cliente: ClienteSupabase, auth: AuthRepository) {
        self.cliente = cliente
        self.auth = auth
    }

    private func archivo(_ uid: String) -> URL { ServiciosRemotos.carpeta.appendingPathComponent("perfil-\(uid).jpg") }

    nonisolated func guardada(_ uid: String) -> Data? { try? Data(contentsOf: ServiciosRemotos.carpeta.appendingPathComponent("perfil-\(uid).jpg")) }

    // Una vez por arranque: la foto cambia muy poco.
    func foto(_ uid: String) async -> Data? {
        if pedida.contains(uid) { return guardada(uid) }
        do {
            let s = try await auth.sesionValida()
            let r = cliente.peticion("rest/v1/perfiles_fotos", consulta: [URLQueryItem(name: "select", value: "foto"),
                                                                         URLQueryItem(name: "user_id", value: "eq.\(uid)")], token: s.accessToken)
            let (d, codigo) = try await cliente.enviar(r)
            guard codigo == 200, let fila = try (JSONSerialization.jsonObject(with: d) as? [[String: Any]])?.first else {
                if codigo == 200 { pedida.insert(uid); try? FileManager.default.removeItem(at: archivo(uid)) }
                return codigo == 200 ? nil : guardada(uid)
            }
            pedida.insert(uid)
            guard let url = fila["foto"] as? String, let coma = url.firstIndex(of: ","),
                  let bytes = Data(base64Encoded: String(url[url.index(after: coma)...])) else {
                try? FileManager.default.removeItem(at: archivo(uid))
                return nil
            }
            try? bytes.write(to: archivo(uid), options: .atomic)
            return bytes
        } catch {
            return guardada(uid)
        }
    }
}

struct Ciudad: Sendable, Equatable, Codable {
    let nombre: String
    let lat: Double
    let lon: Double
    // CIUDAD_TIEMPO_DEFECTO (calendario.js).
    static let defecto = Ciudad(nombre: "Zaragoza", lat: 41.6488, lon: -0.8891)
    var clave: String { String(format: "%.3f,%.3f", lat, lon) }
}

struct Tiempo: Sendable, Equatable, Codable {
    struct Dia: Sendable, Equatable, Codable { let fecha: String; let code: Int; let max: Double; let min: Double; let lluvia: Double? }
    let clave: String
    let hora: Date
    let temp: Double
    let sensacion: Double?
    let code: Int
    let esDia: Bool
    let dias: [Dia]

    // tiempoTipo y TIEMPO_TEXTO de calendario.js.
    var tipo: String { Tiempo.tipo(code, esDia: esDia) }
    static func tipo(_ code: Int, esDia: Bool) -> String {
        switch code {
        case 0: return esDia ? "sol" : "luna"
        case 1, 2: return esDia ? "claros" : "nube"
        case 45, 48: return "niebla"
        case 51...67, 80...82: return "lluvia"
        case 71...77, 85, 86: return "nieve"
        case 95...: return "tormenta"
        default: return "nube"
        }
    }
    static let texto = ["sol": "despejado", "luna": "despejado", "claros": "intervalos de nubes", "nube": "nuboso", "niebla": "niebla",
                        "lluvia": "lluvia", "nieve": "nieve", "tormenta": "tormenta"]
    static let simbolo = ["sol": "sun.max.fill", "luna": "moon.fill", "claros": "cloud.sun.fill", "nube": "cloud.fill", "niebla": "cloud.fog.fill",
                          "lluvia": "cloud.rain.fill", "nieve": "cloud.snow.fill", "tormenta": "cloud.bolt.fill"]
}

// La misma petición y la misma regla que la web: 30 minutos de vida, por ciudad.
actor RepositorioTiempo {
    private var cargando = false
    private let clave = "bitacora.tiempo"

    nonisolated func guardado(_ c: Ciudad) -> Tiempo? {
        guard let d = UserDefaults.standard.data(forKey: "bitacora.tiempo"), let t = try? JSONDecoder().decode(Tiempo.self, from: d), t.clave == c.clave else { return nil }
        return t
    }

    func actual(_ c: Ciudad, forzar: Bool = false) async -> Tiempo? {
        let previo = guardado(c)
        if !forzar, let previo, Date().timeIntervalSince(previo.hora) < 30 * 60 { return previo }
        guard !cargando else { return previo }
        cargando = true
        defer { cargando = false }
        var comp = URLComponents(string: "https://api.open-meteo.com/v1/forecast")!
        comp.queryItems = [URLQueryItem(name: "latitude", value: "\(c.lat)"), URLQueryItem(name: "longitude", value: "\(c.lon)"),
                           URLQueryItem(name: "current", value: "temperature_2m,apparent_temperature,weather_code,is_day"),
                           URLQueryItem(name: "daily", value: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"),
                           URLQueryItem(name: "forecast_days", value: "4"), URLQueryItem(name: "timezone", value: "auto")]
        guard let d = await ServiciosRemotos.get(comp.url!),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let cur = j["current"] as? [String: Any],
              let temp = (cur["temperature_2m"] as? NSNumber)?.doubleValue else { return previo }
        let dia = j["daily"] as? [String: Any] ?? [:]
        let fechas = dia["time"] as? [String] ?? []
        let num = { (k: String, i: Int) -> Double? in ((dia[k] as? [Any])?[safe: i] as? NSNumber)?.doubleValue }
        let dias = fechas.indices.map { i in
            Tiempo.Dia(fecha: fechas[i], code: Int(num("weather_code", i) ?? 3), max: num("temperature_2m_max", i) ?? 0,
                       min: num("temperature_2m_min", i) ?? 0, lluvia: num("precipitation_probability_max", i))
        }
        let t = Tiempo(clave: c.clave, hora: Date(), temp: temp, sensacion: (cur["apparent_temperature"] as? NSNumber)?.doubleValue,
                       code: (cur["weather_code"] as? NSNumber)?.intValue ?? 3, esDia: (cur["is_day"] as? NSNumber)?.intValue == 1, dias: dias)
        if let datos = try? JSONEncoder().encode(t) { UserDefaults.standard.set(datos, forKey: clave) }
        return t
    }

    // buscarCiudadTiempo: el geocodificador de Open-Meteo en español.
    func buscar(_ texto: String) async -> [Ciudad] {
        var comp = URLComponents(string: "https://geocoding-api.open-meteo.com/v1/search")!
        comp.queryItems = [URLQueryItem(name: "name", value: texto), URLQueryItem(name: "count", value: "5"),
                           URLQueryItem(name: "language", value: "es"), URLQueryItem(name: "format", value: "json")]
        guard let d = await ServiciosRemotos.get(comp.url!),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let r = j["results"] as? [[String: Any]] else { return [] }
        return r.compactMap { x in
            guard let n = x["name"] as? String, let la = (x["latitude"] as? NSNumber)?.doubleValue, let lo = (x["longitude"] as? NSNumber)?.doubleValue else { return nil }
            return Ciudad(nombre: n, lat: la, lon: lo)
        }
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}

struct Parada: Sendable, Equatable, Codable, Identifiable, Hashable {
    let tipo: String       // bus o tram
    let id: String
    let numero: String
    let nombre: String
    let lineas: [String]
    let lat: Double?
    let lon: Double?
    var clave: String { "\(tipo):\(numero)" }
}

struct Llegada: Sendable, Equatable, Codable {
    let linea: String
    let destino: String
    let minutos: Int?
}

struct TiemposParada: Sendable, Equatable {
    let llegadas: [Llegada]
    let error: String?
    let hora: Date
}

// js/bajo-demanda/transporte.js: paradas del Ayuntamiento (una semana en caché) y tiempos de la función `transporte`
// (30 segundos, como la web).
actor RepositorioTransporte {
    private let cliente: ClienteSupabase
    private let auth: AuthRepository
    private var paradasCache: [Parada]?
    private var tiempos: [String: TiemposParada] = [:]
    private static let api = "https://www.zaragoza.es/sede/servicio/urbanismo-infraestructuras/transporte-urbano"

    init(cliente: ClienteSupabase, auth: AuthRepository) {
        self.cliente = cliente
        self.auth = auth
    }

    func tiempos(poste: String, forzar: Bool = false) async -> TiemposParada {
        if !forzar, let t = tiempos[poste], Date().timeIntervalSince(t.hora) < 25 { return t }
        var res = TiemposParada(llegadas: [], error: "No se pudieron traer los tiempos.", hora: Date())
        do {
            let s = try await auth.sesionValida()
            let cuerpo = try JSONSerialization.data(withJSONObject: ["poste": poste])
            let (d, codigo) = try await cliente.enviar(cliente.peticion("functions/v1/transporte", metodo: "POST", token: s.accessToken, cuerpo: cuerpo, tiempo: 12))
            if codigo == 200, let j = try JSONSerialization.jsonObject(with: d) as? [String: Any] {
                let lista = (j["tiempos"] as? [[String: Any]] ?? []).map {
                    Llegada(linea: "\($0["linea"] ?? "")", destino: "\($0["destino"] ?? "")", minutos: ($0["minutos"] as? NSNumber)?.intValue)
                }
                res = TiemposParada(llegadas: lista, error: j["error"] as? String, hora: Date())
            } else if codigo == 404 {
                res = TiemposParada(llegadas: [], error: "Falta activar los tiempos en el servidor.", hora: Date())
            }
        } catch ErrorRed.sinConexion {
            res = TiemposParada(llegadas: [], error: "Sin conexión.", hora: Date())
        } catch {}
        tiempos[poste] = res
        return res
    }

    private var archivo: URL { ServiciosRemotos.carpeta.appendingPathComponent("paradas-v1.json") }

    func paradas() async -> [Parada] {
        if let p = paradasCache { return p }
        if let a = try? FileManager.default.attributesOfItem(atPath: archivo.path)[.modificationDate] as? Date,
           Date().timeIntervalSince(a) < 7 * 86400, let d = try? Data(contentsOf: archivo), let p = try? JSONDecoder().decode([Parada].self, from: d), !p.isEmpty {
            paradasCache = p
            return p
        }
        async let bus = leer("poste-autobus", tipo: "bus")
        async let tram = leer("parada-tranvia", tipo: "tram")
        let todas = await bus + tram
        if !todas.isEmpty {
            paradasCache = todas
            if let d = try? JSONEncoder().encode(todas) { try? d.write(to: archivo, options: .atomic) }
        }
        return todas
    }

    // El Ayuntamiento da como mucho 500 por petición. «(688) P. Reyes De Aragón N.º 24 Líneas: 58».
    private func leer(_ ruta: String, tipo: String) async -> [Parada] {
        var out: [Parada] = []
        var inicio = 0
        let patron = try! NSRegularExpression(pattern: #"^\((\d+)\)\s*(.*?)\s*(?:L[ií]neas?:\s*(.*))?$"#)
        while inicio < 5000 {
            guard let url = URL(string: "\(Self.api)/\(ruta).json?rows=500&start=\(inicio)&srsname=wgs84"),
                  let d = await ServiciosRemotos.get(url),
                  let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { break }
            let lote = j["result"] as? [[String: Any]] ?? []
            for x in lote {
                let titulo = x["title"] as? String ?? ""
                let ns = titulo as NSString
                let m = patron.firstMatch(in: titulo, range: NSRange(location: 0, length: ns.length))
                let grupo = { (i: Int) -> String? in
                    guard let m, m.range(at: i).location != NSNotFound else { return nil }
                    return ns.substring(with: m.range(at: i))
                }
                let id = "\(x["id"] ?? "")"
                let numero = grupo(1) ?? String(id.filter(\.isNumber))
                guard !numero.isEmpty else { continue }
                let coords = (x["geometry"] as? [String: Any])?["coordinates"] as? [NSNumber]
                out.append(Parada(tipo: tipo, id: id, numero: numero, nombre: (grupo(2) ?? titulo).trimmingCharacters(in: .whitespaces),
                                  lineas: (grupo(3) ?? "").split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty },
                                  lat: coords?[safe: 1]?.doubleValue, lon: coords?[safe: 0]?.doubleValue))
            }
            if lote.count < 500 || out.count >= (j["totalCount"] as? Int ?? 0) { break }
            inicio += 500
        }
        return out
    }
}

struct Partido: Sendable, Equatable, Codable {
    let id: String
    let fecha: String          // ISO en UTC
    let horaConfirmada: Bool
    let local: Bool
    let rival: String
    let competicion: String
    let estadio: String
}

// serviciosCalendario y partidosDe (servicios.js): el calendario de cada equipo que sigues, de la función `deportes`,
// guardado 12 horas por equipo.
actor RepositorioDeportes {
    private let cliente: ClienteSupabase
    private let auth: AuthRepository
    private var memoria: [String: (Date, [Partido])] = [:]

    init(cliente: ClienteSupabase, auth: AuthRepository) {
        self.cliente = cliente
        self.auth = auth
    }

    private func archivo(_ id: String) -> URL { ServiciosRemotos.carpeta.appendingPathComponent("partidos-\(id.filter { $0.isLetter || $0.isNumber }).json") }

    func partidos(equipo id: String, deporte: String, liga: String) async -> [Partido] {
        if let m = memoria[id], Date().timeIntervalSince(m.0) < 12 * 3600 { return m.1 }
        let previo: [Partido]? = (try? Data(contentsOf: archivo(id))).flatMap { try? JSONDecoder().decode([Partido].self, from: $0) }
        if let a = try? FileManager.default.attributesOfItem(atPath: archivo(id).path)[.modificationDate] as? Date,
           Date().timeIntervalSince(a) < 12 * 3600, let previo {
            memoria[id] = (a, previo)
            return previo
        }
        do {
            let s = try await auth.sesionValida()
            let cuerpo = try JSONSerialization.data(withJSONObject: ["accion": "calendario", "deporte": deporte, "liga": liga, "id": id])
            let (d, codigo) = try await cliente.enviar(cliente.peticion("functions/v1/deportes", metodo: "POST", token: s.accessToken, cuerpo: cuerpo, tiempo: 15))
            guard codigo == 200, let j = try JSONSerialization.jsonObject(with: d) as? [String: Any], let lista = j["partidos"] as? [[String: Any]] else { return previo ?? [] }
            let p = lista.compactMap { x -> Partido? in
                guard let f = x["fecha"] as? String else { return nil }
                return Partido(id: "\(x["id"] ?? "")", fecha: f, horaConfirmada: x["horaConfirmada"] as? Bool ?? true, local: x["local"] as? Bool ?? true,
                               rival: x["rival"] as? String ?? "", competicion: x["competicion"] as? String ?? "", estadio: x["estadio"] as? String ?? "")
            }
            memoria[id] = (Date(), p)
            if let datos = try? JSONEncoder().encode(p) { try? datos.write(to: archivo(id), options: .atomic) }
            return p
        } catch {
            return previo ?? []
        }
    }

    // Los partidos de todos tus equipos como eventos del día (srv_p_), sin los ocultos ni los ya apuntados.
    func eventos(_ doc: DocumentoBitacora, desde: LocalDay, dias: Int) async -> [LocalDay: [EventoDia]] {
        let serv = (try? doc.valor(de: "servicios")) ?? nil
        let equipos = serv?["equipos"]?.lista?.compactMap(\.objeto) ?? []
        guard !equipos.isEmpty else { return [:] }
        let ocultos = Set(serv?["ocultos"]?.lista?.compactMap(\.texto) ?? [])
        let apuntados = Set((((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []).compactMap { $0["servicioId"]?.texto })
        let hasta = desde.sumando(dias: dias)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let iso = ISO8601DateFormatter()
        let isoFrac = ISO8601DateFormatter()
        isoFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var r: [LocalDay: [EventoDia]] = [:]
        for eq in equipos {
            guard let id = eq["id"]?.comoId else { continue }
            let corto = eq["corto"]?.texto ?? eq["nombre"]?.texto ?? ""
            for p in await partidos(equipo: id, deporte: eq["deporte"]?.texto ?? "soccer", liga: eq["liga"]?.texto ?? "") {
                guard let f = iso.date(from: p.fecha) ?? isoFrac.date(from: p.fecha) else { continue }
                let dia = CalendarioBitacora.madrid.dia(de: f)
                let clave = "srv_p_" + p.id
                guard dia >= desde, dia < hasta, !ocultos.contains(clave), !apuntados.contains(clave) else { continue }
                let c = cal.dateComponents([.hour, .minute], from: f)
                r[dia, default: []].append(EventoDia(id: clave, titulo: p.local ? "\(corto) - \(p.rival)" : "\(p.rival) - \(corto)",
                                                     hora: p.horaConfirmada ? String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0) : nil,
                                                     lugar: p.estadio, notas: p.competicion, tipo: "partido", editable: false, sinAviso: true,
                                                     meta: [p.competicion, p.estadio].filter { !$0.isEmpty }.joined(separator: ", ")))
            }
        }
        return r
    }
}
