import Foundation

// 0.24: lo que necesitan las reservas y las listas de un viaje (CambioViaje), como saveTripReserva y las listas de
// js/viajes.js.
extension AplicarOperaciones {
    static let camposTransporte: Set<String> = ["tipo", "compania", "numero", "origen", "destino", "salida", "llegada", "reserva", "asiento", "notas"]
    static let camposAlojamiento: Set<String> = ["nombre", "direccion", "entrada", "salida", "reserva", "notas"]

    // Cambia los `items` de una lista del viaje; si la lista no está, no hace nada.
    static func cambiarListaViaje(_ v: inout [String: JSONValue], _ lid: String, _ f: (inout [JSONValue]) -> Void) {
        guard var listas = v["listas"]?.lista, let n = listas.firstIndex(where: { $0["id"]?.comoId == lid }), var l = listas[n].objeto else { return }
        var items = l["items"]?.lista ?? []
        f(&items)
        l["items"] = .array(items)
        listas[n] = .object(l)
        v["listas"] = .array(listas)
    }
}
