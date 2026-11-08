import AppIntents

// «Apuntar en Bitácora» para Siri y Atajos, sin extensiones (SideStore no las instala): abre la app y deja el texto en
// la cola de enlaces, que la app atiende como un bitacora://apuntar.
struct ApuntarIntent: AppIntent {
    static var title: LocalizedStringResource = "Apuntar en Bitácora"
    static var description = IntentDescription("Guarda un texto como tarea de hoy o sin día.")
    static var openAppWhenRun = true

    @Parameter(title: "Texto")
    var texto: String

    func perform() async throws -> some IntentResult {
        let limpio = String(texto.trimmingCharacters(in: .whitespacesAndNewlines).prefix(EnlaceProfundo.maxTexto))
        if !limpio.isEmpty {
            try ColaIntenciones().anadir(.apuntar(texto: limpio, url: nil))
        }
        return .result()
    }
}

struct AtajosBitacora: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: ApuntarIntent(), phrases: ["Apuntar en \(.applicationName)"], shortTitle: "Apuntar", systemImageName: "square.and.pencil")
    }
}
