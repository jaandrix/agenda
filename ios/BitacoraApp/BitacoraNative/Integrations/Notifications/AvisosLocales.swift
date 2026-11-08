import Foundation
import UserNotifications

// Un aviso una hora antes de cada evento con hora de los próximos 30 días, con id fijo `evento-<id>-<fecha>`: al
// reconciliar se quitan los que sobran y se reponen los demás (mismo id = se sustituye, nunca se duplica). Respeta
// `sinAviso` y `preferenciasAvisos.eventos === false`, como avisos-diarios en el servidor. Desactivado por defecto:
// quien ya recibe los push de la web los tendría dos veces.
enum AvisosLocales {
    static let prefijo = "evento-"
    static let clave = "bitacora.avisosEventos"

    static var activos: Bool { UserDefaults.standard.bool(forKey: clave) }

    static func activar(_ si: Bool) async -> Bool {
        if !si {
            UserDefaults.standard.set(false, forKey: clave)
            await quitarTodos()
            try? await UNUserNotificationCenter.current().setBadgeCount(0)
            return false
        }
        let ok = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        UserDefaults.standard.set(ok, forKey: clave)
        return ok
    }

    static func quitarTodos() async {
        let centro = UNUserNotificationCenter.current()
        let ids = await centro.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(prefijo) }
        centro.removePendingNotificationRequests(withIdentifiers: ids)
    }

    struct Aviso: Equatable {
        let id: String
        let titulo: String
        let cuerpo: String
        let cuando: Date
    }

    static func deseados(_ doc: DocumentoBitacora, ahora: Date = Date(), calendario: CalendarioBitacora = .madrid) -> [Aviso] {
        if ((try? doc.valor(de: "preferenciasAvisos")) ?? nil)?["eventos"]?.booleano == false { return [] }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = calendario.zona
        let hoy = calendario.dia(de: ahora)
        var r: [Aviso] = []
        var mes = hoy.yearMonth
        for _ in 0..<2 {
            for (dia, eventos) in LecturaCalendario.mes(doc, mes).porDia where dia >= hoy && dia <= hoy.sumando(dias: 30) {
                for e in eventos where !e.sinAviso && e.tipo != "birthday" {
                    let p = (e.hora ?? "").split(separator: ":").compactMap { Int($0) }
                    guard p.count >= 2, let empieza = cal.date(from: DateComponents(year: dia.year, month: dia.month, day: dia.day, hour: p[0], minute: p[1])) else { continue }
                    let cuando = empieza.addingTimeInterval(-3600)
                    guard cuando > ahora else { continue }
                    r.append(Aviso(id: "\(prefijo)\(e.id)-\(dia.iso)", titulo: e.titulo, cuerpo: "a las \(e.hora!)" + (e.lugar.isEmpty ? "." : ", \(e.lugar)."), cuando: cuando))
                }
            }
            mes = mes.month == 12 ? YearMonth(year: mes.year + 1, month: 1)! : YearMonth(year: mes.year, month: mes.month + 1)!
        }
        // iOS guarda como mucho 64 avisos pendientes por app.
        return Array(r.sorted { $0.cuando < $1.cuando }.prefix(50))
    }

    static func reconciliar(_ doc: DocumentoBitacora) async {
        guard activos else { return }
        let centro = UNUserNotificationCenter.current()
        guard await centro.notificationSettings().authorizationStatus == .authorized else { return }
        // Insignia: tareas de hoy sin hacer, como la de la envoltura web.
        let pendientes = LecturaPlanificador.vista(doc).tareas.filter { !$0.hecha }.count
        try? await centro.setBadgeCount(pendientes)
        let quiero = deseados(doc)
        let ids = Set(quiero.map(\.id))
        let sobran = await centro.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(prefijo) && !ids.contains($0) }
        centro.removePendingNotificationRequests(withIdentifiers: sobran)
        for a in quiero {
            let contenido = UNMutableNotificationContent()
            contenido.title = a.titulo
            contenido.body = a.cuerpo
            contenido.sound = .default
            let disparo = UNTimeIntervalNotificationTrigger(timeInterval: max(1, a.cuando.timeIntervalSinceNow), repeats: false)
            try? await centro.add(UNNotificationRequest(identifier: a.id, content: contenido, trigger: disparo))
        }
    }
}
