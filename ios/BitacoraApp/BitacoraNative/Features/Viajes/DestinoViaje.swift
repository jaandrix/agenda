import SwiftUI

// 0.24: la pestaña Destino de un viaje (renderTripDestinoTab en js/servicios.js): el tiempo (previsión si faltan dos
// semanas o menos; si no, cómo fueron esos días el año pasado), la hora allí, la moneda con su cambio y un conversor,
// y enchufes y urgencias. Todo de Open-Meteo y el Banco Central Europeo, con caché en este iPhone; nada se escribe en
// el documento (la web guarda `destinoGeo` y, si está, se usa). Los festivos de allí siguen en la web.

struct GeoDestino: Sendable, Equatable, Codable {
    let nombre, pais, paisNombre, zona: String
    let lat, lon: Double

    static func desde(_ v: JSONValue?) -> GeoDestino? {
        guard let o = v?.objeto, o["noEncontrado"]?.booleano != true else { return nil }
        let num = { (k: String) -> Double? in
            if case .number(let s)? = o[k] { return Double(s) }
            return nil
        }
        guard let lat = num("lat"), let lon = num("lon") else { return nil }
        return GeoDestino(nombre: o["nombre"]?.texto ?? "", pais: o["pais"]?.texto ?? "", paisNombre: o["paisNombre"]?.texto ?? "",
                          zona: o["zona"]?.texto ?? "", lat: lat, lon: lon)
    }
}

enum DestinoViaje {
    // PAISES_VIAJE: país → moneda y enchufes.
    static let paises: [String: (String, String)] = [
        "ES": ("EUR", "C/F"), "PT": ("EUR", "C/F"), "FR": ("EUR", "C/E"), "IT": ("EUR", "C/F/L"), "DE": ("EUR", "C/F"), "AT": ("EUR", "C/F"),
        "NL": ("EUR", "C/F"), "BE": ("EUR", "C/E"), "LU": ("EUR", "C/F"), "IE": ("EUR", "G"), "GR": ("EUR", "C/F"), "HR": ("EUR", "C/F"),
        "SI": ("EUR", "C/F"), "SK": ("EUR", "C/E"), "FI": ("EUR", "C/F"), "EE": ("EUR", "C/F"), "LV": ("EUR", "C/F"), "LT": ("EUR", "C/F"),
        "MT": ("EUR", "G"), "CY": ("EUR", "G"), "GB": ("GBP", "G"), "CH": ("CHF", "C/J"), "HU": ("HUF", "C/F"), "CZ": ("CZK", "C/E"),
        "PL": ("PLN", "C/E"), "DK": ("DKK", "C/F/K"), "SE": ("SEK", "C/F"), "NO": ("NOK", "C/F"), "IS": ("ISK", "C/F"), "RO": ("RON", "C/F"),
        "BG": ("BGN", "C/F"), "TR": ("TRY", "C/F"), "MA": ("MAD", "C/E"), "US": ("USD", "A/B"), "CA": ("CAD", "A/B"), "MX": ("MXN", "A/B"),
        "BR": ("BRL", "C/N"), "AR": ("ARS", "C/I"), "CL": ("CLP", "C/L"), "CO": ("COP", "A/B"), "PE": ("PEN", "A/C"), "JP": ("JPY", "A/B"),
        "CN": ("CNY", "A/C/I"), "KR": ("KRW", "C/F"), "TH": ("THB", "A/B/C/O"), "IN": ("INR", "C/D/M"), "ID": ("IDR", "C/F"), "AU": ("AUD", "I"),
        "NZ": ("NZD", "I"), "ZA": ("ZAR", "C/M/N"), "EG": ("EGP", "C/F"), "AE": ("AED", "G"), "IL": ("ILS", "C/H"), "SG": ("SGD", "G"),
        "HK": ("HKD", "G"), "PH": ("PHP", "A/B/C"), "MY": ("MYR", "G"), "VN": ("VND", "A/C"),
    ]

    static func urgencias(_ pais: String) -> String {
        switch pais {
        case "US", "CA", "MX": return "911"
        case "GB": return "999 o 112"
        case "JP": return "110 policía, 119 ambulancia"
        case "AU": return "000"
        default: return "112"
        }
    }

    static func enchufe(_ tipos: String) -> String {
        "enchufe tipo \(tipos)" + (tipos.hasPrefix("C/") ? ", el mismo que en españa." : ", lleva adaptador.")
    }

    // destinoHora: la hora allí y la diferencia con Madrid.
    static func hora(_ zona: String, ahora: Date = Date()) -> String? {
        guard let z = TimeZone(identifier: zona) else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES"); f.timeZone = z; f.dateFormat = "HH:mm"
        let dif = (z.secondsFromGMT(for: ahora) - CalendarioBitacora.madrid.zona.secondsFromGMT(for: ahora)) / 3600
        let resto = dif == 0 ? ", la misma hora que en españa." : ", \(abs(dif)) \(abs(dif) == 1 ? "hora" : "horas") \(dif > 0 ? "más" : "menos") que en españa."
        return "allí son las \(f.string(from: ahora))" + resto
    }

    // MARK: red, con caché de 6 horas como destinoPedir

    private static func cache(_ clave: String) -> Data? {
        let url = ServiciosRemotos.carpeta.appendingPathComponent("destino-" + clave.filter { $0.isLetter || $0.isNumber || $0 == "-" } + ".json")
        guard let a = try? FileManager.default.attributesOfItem(atPath: url.path), let f = a[.modificationDate] as? Date,
              Date().timeIntervalSince(f) < 6 * 3600 else { return nil }
        return try? Data(contentsOf: url)
    }

    private static func pedir(_ clave: String, _ url: URL) async -> [String: Any]? {
        let archivo = ServiciosRemotos.carpeta.appendingPathComponent("destino-" + clave.filter { $0.isLetter || $0.isNumber || $0 == "-" } + ".json")
        if let d = cache(clave), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { return j }
        guard let d = await ServiciosRemotos.get(url), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return nil }
        try? d.write(to: archivo, options: .atomic)
        return j
    }

    static func buscar(_ destino: String) async -> GeoDestino? {
        let nombre = destino.split(separator: ",").first.map { $0.trimmingCharacters(in: .whitespaces) } ?? destino
        var comp = URLComponents(string: "https://geocoding-api.open-meteo.com/v1/search")!
        comp.queryItems = [URLQueryItem(name: "name", value: nombre), URLQueryItem(name: "count", value: "1"),
                           URLQueryItem(name: "language", value: "es"), URLQueryItem(name: "format", value: "json")]
        guard let url = comp.url, let j = await pedir("geo-" + nombre.lowercased(), url), let r = (j["results"] as? [[String: Any]])?.first,
              let lat = (r["latitude"] as? NSNumber)?.doubleValue, let lon = (r["longitude"] as? NSNumber)?.doubleValue else { return nil }
        return GeoDestino(nombre: r["name"] as? String ?? nombre, pais: (r["country_code"] as? String ?? "").uppercased(),
                          paisNombre: r["country"] as? String ?? "", zona: r["timezone"] as? String ?? "", lat: lat, lon: lon)
    }

    static func prevision(_ g: GeoDestino, desde: String, hasta: String) async -> [Tiempo.Dia] {
        var comp = URLComponents(string: "https://api.open-meteo.com/v1/forecast")!
        comp.queryItems = [URLQueryItem(name: "latitude", value: "\(g.lat)"), URLQueryItem(name: "longitude", value: "\(g.lon)"),
                           URLQueryItem(name: "daily", value: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"),
                           URLQueryItem(name: "timezone", value: "auto"), URLQueryItem(name: "start_date", value: desde), URLQueryItem(name: "end_date", value: hasta)]
        guard let url = comp.url, let j = await pedir("prev-\(g.lat)-\(g.lon)-\(desde)-\(hasta)", url), let dia = j["daily"] as? [String: Any] else { return [] }
        let fechas = dia["time"] as? [String] ?? []
        let num = { (k: String, i: Int) -> Double? in ((dia[k] as? [Any])?[safe: i] as? NSNumber)?.doubleValue }
        return fechas.indices.map { i in
            Tiempo.Dia(fecha: fechas[i], code: Int(num("weather_code", i) ?? 3), max: num("temperature_2m_max", i) ?? 0,
                       min: num("temperature_2m_min", i) ?? 0, lluvia: num("precipitation_probability_max", i))
        }
    }

    struct Historico: Equatable { let max, min, lluvia, dias: Int }

    static func historico(_ g: GeoDestino, desde: String, hasta: String) async -> Historico? {
        var comp = URLComponents(string: "https://archive-api.open-meteo.com/v1/archive")!
        comp.queryItems = [URLQueryItem(name: "latitude", value: "\(g.lat)"), URLQueryItem(name: "longitude", value: "\(g.lon)"),
                           URLQueryItem(name: "start_date", value: desde), URLQueryItem(name: "end_date", value: hasta),
                           URLQueryItem(name: "daily", value: "temperature_2m_max,temperature_2m_min,precipitation_sum"), URLQueryItem(name: "timezone", value: "auto")]
        guard let url = comp.url, let j = await pedir("hist-\(g.lat)-\(g.lon)-\(desde)-\(hasta)", url), let dia = j["daily"] as? [String: Any] else { return nil }
        let serie = { (k: String) -> [Double] in (dia[k] as? [Any] ?? []).compactMap { ($0 as? NSNumber)?.doubleValue } }
        let mx = serie("temperature_2m_max"), mn = serie("temperature_2m_min"), ll = serie("precipitation_sum")
        guard !mx.isEmpty, !mn.isEmpty else { return nil }
        let media = { (l: [Double]) in Int((l.reduce(0, +) / Double(l.count)).rounded()) }
        return Historico(max: media(mx), min: media(mn), lluvia: ll.filter { $0 >= 1 }.count, dias: mx.count)
    }

    static func cambio(_ moneda: String) async -> Double? {
        guard let url = URL(string: "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=\(moneda)"),
              let j = await pedir("cambio-" + moneda, url) else { return nil }
        return ((j["rates"] as? [String: Any])?[moneda] as? NSNumber)?.doubleValue
    }

    // El año anterior de una fecha ISO (para comparar con esos mismos días).
    static func anoAntes(_ iso: String) -> String {
        guard let a = Int(iso.prefix(4)) else { return iso }
        return String(a - 1) + iso.dropFirst(4)
    }
}

// Dentro de la ficha del viaje, plegada: cada bloque en su tarjeta (dónde y la hora, el tiempo, el dinero, enchufes y
// urgencias). Se carga al abrirla.
struct DestinoViajeView: View {
    let viaje: Viaje
    @State private var geo: GeoDestino?
    @State private var buscando = true
    @State private var dias: [Tiempo.Dia] = []
    @State private var historico: DestinoViaje.Historico?
    @State private var tasa: Double?
    @State private var importe = ""

    private var hoy: String { CalendarioBitacora.madrid.dia(de: Date()).iso }
    private var ini: String { viaje.inicio.isEmpty ? hoy : viaje.inicio }
    private var fin: String { viaje.fin.isEmpty ? ini : viaje.fin }

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
            if viaje.destino.isEmpty {
                EstadoVacio(texto: "ponle un destino al viaje y aquí tendrás el tiempo, la hora, la moneda y los enchufes de allí.", icono: "viajes")
                    .tarjeta(relleno: Medida.xs)
            } else if let g = geo {
                VStack(alignment: .leading, spacing: 0) {
                    FilaTarjeta(icono: "viajes", titulo: g.nombre.lowercased() + ".", detalle: g.paisNombre.lowercased())
                    if let h = DestinoViaje.hora(g.zona) {
                        SeparadorFila()
                        FilaTarjeta(icono: "calendario", titulo: h, detalle: "la hora.")
                    }
                }
                .tarjeta(relleno: Medida.s)
                if fin >= hoy {
                    bloque("el tiempo.") { tiempo }
                }
                if let info = DestinoViaje.paises[g.pais] {
                    bloque("el dinero.") { dinero(info.0) }
                    bloque("enchufes y urgencias.") {
                        Text(DestinoViaje.enchufe(info.1)).font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                        fila("urgencias.", DestinoViaje.urgencias(g.pais))
                    }
                } else {
                    bloque("urgencias.") { fila("urgencias.", DestinoViaje.urgencias(g.pais)) }
                }
                Text("datos de open-meteo y del banco central europeo. los festivos de allí, en la web.")
                    .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    .padding(.horizontal, Medida.xxs)
            } else if buscando {
                HStack(spacing: Medida.xs) {
                    ProgressView()
                    Text("buscando el destino.").font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                }
                .tarjeta(relleno: Medida.s)
            } else {
                EstadoVacio(texto: "no encuentro «\(viaje.destino)». prueba a escribir solo la ciudad en el destino del viaje.", icono: "viajes")
                    .tarjeta(relleno: Medida.xs)
            }
        }
        .task { await cargar() }
    }

    private func bloque<C: View>(_ titulo: String, @ViewBuilder _ contenido: () -> C) -> some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            Text(titulo).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta).accessibilityAddTraits(.isHeader)
            contenido()
        }
        .tarjeta()
    }

    private func fila(_ titulo: String, _ valor: String) -> some View {
        HStack {
            Text(titulo).font(Letra.cuerpo).foregroundStyle(Lienzo.tintaSecundaria)
            Spacer()
            Text(valor).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).multilineTextAlignment(.trailing)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var tiempo: some View {
        if !dias.isEmpty {
            VStack(spacing: Medida.xs) {
                ForEach(dias, id: \.fecha) { d in
                    HStack(spacing: Medida.s) {
                        Text(DestinoViajeView.diaCorto(d.fecha)).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                            .frame(width: 56, alignment: .leading)
                        Image(systemName: Tiempo.simbolo[Tiempo.tipo(d.code, esDia: true)] ?? "cloud.fill")
                            .symbolRenderingMode(.hierarchical).foregroundStyle(Lienzo.tinta).frame(width: 26)
                        Text("\(Int(d.max.rounded()))°").font(Letra.numero).foregroundStyle(Lienzo.tinta)
                        Text("\(Int(d.min.rounded()))°").font(Letra.cuerpo).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit()
                        Spacer()
                        if let l = d.lluvia, l >= 40 { Chip(texto: "\(Int(l)) %", icono: "drop.fill") }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        } else if let h = historico {
            Text("el año pasado, esos mismos días: entre \(h.min)° y \(h.max)° de media" + (h.lluvia > 0 ? ", y llovió \(h.lluvia) de \(h.dias) días." : ", sin lluvia.") + " la previsión llega dos semanas antes.")
                .font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria).fixedSize(horizontal: false, vertical: true)
        } else {
            Text("cargando.").font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
        }
    }

    @ViewBuilder private func dinero(_ moneda: String) -> some View {
        if moneda == "EUR" {
            Text("se paga en euros.").font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
        } else if let tasa {
            fila("1 €", String(format: tasa < 10 ? "%.3f %@" : "%.1f %@", tasa, moneda))
            HStack(spacing: Medida.xs) {
                TextField("", text: $importe, prompt: Text("importe en \(moneda).").foregroundColor(Lienzo.tintaTerciaria))
                    .font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                    .keyboardType(.decimalPad)
                    .padding(.horizontal, Medida.s)
                    .frame(height: Medida.alturaControl)
                    .background(Lienzo.sutil, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
                if let d = Dinero.decimal(texto: importe), d > 0 {
                    Text(Dinero.formato(d / Decimal(tasa))).font(Letra.numero).foregroundStyle(Lienzo.tinta)
                        .transition(.opacity)
                }
            }
            .animation(Muelle.rapido, value: importe.isEmpty)
        } else {
            Text("se paga en \(moneda).").font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
        }
    }

    static func diaCorto(_ iso: String) -> String {
        guard let d = LocalDay(iso: iso) else { return iso }
        return ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"][d.indiceSemanaLunes] + " \(d.day)"
    }

    private func cargar() async {
        guard !viaje.destino.isEmpty else { return }
        var g = viaje.geo
        if g == nil { g = await DestinoViaje.buscar(viaje.destino) }
        geo = g
        buscando = false
        guard let g else { return }
        if let m = DestinoViaje.paises[g.pais]?.0, m != "EUR" { tasa = await DestinoViaje.cambio(m) }
        guard fin >= hoy, let a = LocalDay(iso: ini), let h = LocalDay(iso: hoy) else { return }
        if h.dias(hasta: a) <= 14 {
            let tope = h.sumando(dias: 15).iso
            dias = await DestinoViaje.prevision(g, desde: max(ini, hoy), hasta: min(fin, tope))
        } else {
            historico = await DestinoViaje.historico(g, desde: DestinoViaje.anoAntes(ini), hasta: DestinoViaje.anoAntes(fin))
        }
    }
}
