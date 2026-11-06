import OSLog

// Nunca se registran el documento, importes, tokens, correos ni textos del usuario: lo variable va con privacy: .private.
enum Registro {
    static let auth = Logger(subsystem: "com.bitacora.nativa", category: "auth")
    static let sync = Logger(subsystem: "com.bitacora.nativa", category: "sync")
    static let almacen = Logger(subsystem: "com.bitacora.nativa", category: "almacen")
    static let app = Logger(subsystem: "com.bitacora.nativa", category: "app")
}
