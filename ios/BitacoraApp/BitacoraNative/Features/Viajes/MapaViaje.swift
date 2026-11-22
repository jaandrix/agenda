import SwiftUI
import MapKit
import CoreLocation

// El mapa del viaje (initTripMap en js/viajes.js): lo del itinerario que tiene lugar localizado, numerado por día y hora
// y unido por una línea discontinua. La web localiza con Nominatim al guardar; el iPhone, con el geocodificador del
// sistema, y lo guarda en el mismo sitio (`lat`, `lon` del elemento) para que la web también lo pinte.
struct MapaViaje: View {
    struct Punto: Identifiable, Equatable {
        let id, titulo: String
        let lat, lon: Double
        var coord: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
    }
    let puntos: [Punto]

    static func puntos(_ items: [ItemItinerario]) -> [Punto] {
        items.compactMap { it -> (ItemItinerario, Double, Double)? in
            guard let la = it.lat, let lo = it.lon, la != 0 || lo != 0 else { return nil }
            return (it, la, lo)
        }
        .sorted { ($0.0.dia, $0.0.hora) < ($1.0.dia, $1.0.hora) }
        .map { Punto(id: $0.0.id, titulo: $0.0.titulo, lat: $0.1, lon: $0.2) }
    }

    var body: some View {
        Map(initialPosition: .automatic) {
            ForEach(Array(puntos.enumerated()), id: \.element.id) { n, p in
                Marker("\(n + 1). \(p.titulo)", coordinate: p.coord).tint(Paleta.acento)
            }
            if puntos.count > 1 {
                MapPolyline(coordinates: puntos.map(\.coord))
                    .stroke(Paleta.acento.opacity(0.7), style: StrokeStyle(lineWidth: 3, dash: [6, 6]))
            }
        }
        .accessibilityLabel("mapa del viaje con \(puntos.count) \(puntos.count == 1 ? "lugar" : "lugares")")
    }

    // Falla en silencio, como geocodePlace: sin lugar localizado el elemento sigue en el itinerario, solo no sale en el mapa.
    static func localizar(_ c: AppCoordinator, viajeId: String, itemId: String, lugar: String) async {
        guard let sitio = try? await CLGeocoder().geocodeAddressString(lugar).first?.location?.coordinate else { return }
        let datos: [String: JSONValue] = ["viajeId": .string(viajeId), "id": .string(itemId), "lugar": .string(lugar),
                                          "lat": .number(String(format: "%.6f", sitio.latitude)), "lon": .number(String(format: "%.6f", sitio.longitude))]
        await c.guardar(OperacionesExtra.op(CoordsItinerarioOp.tipo, datos), fallo: "no se pudo guardar el lugar en el mapa.")
    }
}

// Las coordenadas de un elemento del itinerario, solo si su lugar sigue siendo el que se localizó (si se cambió entretanto,
// valen las del nuevo).
enum CoordsItinerarioOp {
    static let tipo = "coordsItinerario"

    static func aplicar(_ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        var r = valores
        guard let vid = d["viajeId"]?.comoId, let id = d["id"]?.comoId, let lugar = d["lugar"]?.texto, let lat = d["lat"], let lon = d["lon"] else { return r }
        r["entries"] = .some(OperacionesExtra.cambiarEntrada(vid, valores["entries"] ?? nil) { e in
            guard e["type"]?.texto == "travel" else { return }
            var items = e["itinerario"]?.lista ?? []
            guard let n = items.firstIndex(where: { $0["id"]?.comoId == id }), var o = items[n].objeto, o["lugar"]?.texto == lugar else { return }
            o["lat"] = lat
            o["lon"] = lon
            items[n] = .object(o)
            e["itinerario"] = .array(items)
        })
        return r
    }
}
