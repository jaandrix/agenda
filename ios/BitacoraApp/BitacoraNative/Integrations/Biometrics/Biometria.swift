import LocalAuthentication

// Face ID solo abre una sesión que ya es válida en este iPhone; no sustituye a la contraseña de la cuenta.
// Con la política de «propietario del dispositivo», si Face ID falla o cambia, el código del iPhone sirve de recuperación.
enum Biometria {
    static var disponible: Bool {
        var e: NSError?
        return LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: &e)
    }

    static var nombre: String {
        let c = LAContext()
        _ = c.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch c.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        default: return "el código del iPhone"
        }
    }

    static func comprobar(motivo: String) async -> Bool {
        let c = LAContext()
        c.localizedCancelTitle = "ahora no"
        do {
            return try await c.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: motivo)
        } catch {
            return false
        }
    }
}
