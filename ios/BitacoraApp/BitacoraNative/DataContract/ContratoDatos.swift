import Foundation

// Versión 1 del contrato (06-11-2026). Las claves salen de DATOS_SINCRONIZADOS en js/datos.js; pruebas/contrato-ios.mjs
// avisa si la web añade o quita una y esta lista se queda atrás. El detalle de cada bloque está en CONTRATO-DATOS.md.
enum ContratoDatos {
    static let version = 1

    static let sincronizadas: [String] = [
        // claves-inicio
        "entries", "categories", "userName", "investmentData", "notes", "prompts", "inbox",
        "registroConector", "analisisIA", "preferenciasAvisos", "ciudadTiempo", "financeIncome",
        "financeProfile", "financePro", "plannedTrips", "weeklyTasks", "cultureLists", "habits",
        "collectibleCategories", "collectibles", "dayPlanner", "recurringTasks", "dailyEffort",
        "studies", "links", "linkCategories", "blurFinances", "pedidos", "hansei", "apartadosConfig",
        "perfilLaboral", "profesorado", "agendaLaboral", "listaCompra", "estudiar", "avisoDiarioVisto",
        "apuntesRecientes", "calendarioFeedVersion", "bienvenida", "servicios",
        // claves-fin
    ]

    // `apuntes` lo escribe su propia página y la web solo lo sustituye al importar; `_meta` lleva la semana del
    // último snapshot. La app nativa no debe escribir ninguna de las dos.
    static let especiales: [String] = ["apuntes", "_meta"]

    static let todas: Set<String> = Set(sincronizadas + especiales)
}
