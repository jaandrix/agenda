import Foundation

// 3.2: el bus de Inicio sale solo donde funciona. Transporte lee los tiempos de Avanza y las paradas del Ayuntamiento
// de Zaragoza (función `transporte`), así que con la ciudad del tiempo en otro sitio el bloque no aparece. Se mira por
// coordenadas y no por nombre (Open-Meteo puede devolver «Zaragoza», «Saragossa» o un barrio): a 25 km del centro
// entran los barrios rurales y el área de Avanza. Sin `ciudadTiempo` guardada la ciudad es Zaragoza (CIUDAD_TIEMPO_DEFECTO).
enum ZonaTransporte {
    static let centro = Ciudad.defecto
    static let radioKm = 25.0

    static func cubre(_ ciudad: Ciudad) -> Bool { distanciaKm(ciudad, centro) <= radioKm }

    static func distanciaKm(_ a: Ciudad, _ b: Ciudad) -> Double {
        let r = 6371.0
        let rad = { (g: Double) in g * .pi / 180 }
        let dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
        let h = sin(dLat / 2) * sin(dLat / 2) + cos(rad(a.lat)) * cos(rad(b.lat)) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * r * asin(min(1, sqrt(h)))
    }
}
