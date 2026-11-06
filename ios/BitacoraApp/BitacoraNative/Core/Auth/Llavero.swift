import Foundation
import Security

// La sesión vive en el llavero, nunca en UserDefaults. Solo en este iPhone y tras el primer desbloqueo, para que la
// sincronización al volver a la app funcione con la pantalla recién desbloqueada.
enum Llavero {
    private static let servicio = "com.bitacora.nativa.sesion"

    static func guardar(_ datos: Data, cuenta: String) -> Bool {
        let busqueda: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                       kSecAttrService as String: servicio,
                                       kSecAttrAccount as String: cuenta]
        SecItemDelete(busqueda as CFDictionary)
        var alta = busqueda
        alta[kSecValueData as String] = datos
        alta[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(alta as CFDictionary, nil) == errSecSuccess
    }

    static func leer(cuenta: String) -> Data? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrService as String: servicio,
                                kSecAttrAccount as String: cuenta,
                                kSecReturnData as String: true,
                                kSecMatchLimit as String: kSecMatchLimitOne]
        var r: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &r) == errSecSuccess else { return nil }
        return r as? Data
    }

    static func borrar(cuenta: String) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrService as String: servicio,
                                kSecAttrAccount as String: cuenta]
        SecItemDelete(q as CFDictionary)
    }
}
