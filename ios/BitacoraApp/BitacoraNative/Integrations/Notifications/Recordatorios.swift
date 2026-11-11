import Foundation
import UserNotifications

// Recordatorios de las tareas del planificador, como los de la app Recordatorios de iOS. Se guardan en la propia tarea
// (`recordatorio`: {"tipo":"hora"} a la hora de la tarea, o {"tipo":"fecha","cuando":"AAAA-MM-DDTHH:MM"} en hora de
// Madrid), así que uno puesto en la web o en otro iPhone también suena aquí: al sincronizar se reprograman todos, con id
// fijo `recordatorio-<id>` (mismo id = se sustituye, nunca se duplica). Las tareas hechas no avisan.
enum Recordatorios {
    static let prefijo = "recordatorio-"

    struct Aviso: Equatable {
        let id: String
        let titulo: String
        let cuerpo: String
        let cuando: Date
    }

    static func cuando(_ r: JSONValue?, dia: String?, hora: String?, calendario: CalendarioBitacora = .madrid) -> Date? {
        guard let r, let tipo = r["tipo"]?.texto else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = calendario.zona
        let texto: String
        switch tipo {
        case "hora":
            guard let dia, let hora, !hora.isEmpty else { return nil }
            texto = dia + "T" + hora
        case "fecha":
            guard let c = r["cuando"]?.texto else { return nil }
            texto = c
        default:
            return nil
        }
        let p = texto.split(whereSeparator: { $0 == "-" || $0 == "T" || $0 == ":" }).compactMap { Int($0) }
        guard p.count >= 5 else { return nil }
        return cal.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: p[3], minute: p[4]))
    }

    static func deseados(_ doc: DocumentoBitacora, ahora: Date = Date()) -> [Aviso] {
        let planner = (try? doc.valor(de: "dayPlanner")) ?? nil
        var r: [Aviso] = []
        func mirar(_ x: JSONValue, dia: String?) {
            guard let o = x.objeto, let id = o["id"]?.comoId, o["done"]?.booleano != true, let rec = o["recordatorio"],
                  let fecha = cuando(rec, dia: dia, hora: o["time"]?.texto), fecha > ahora else { return }
            let hora = o["time"]?.texto ?? ""
            r.append(Aviso(id: prefijo + id, titulo: o["title"]?.texto ?? "tarea",
                           cuerpo: hora.isEmpty ? "recordatorio de bitácora." : "a las \(hora).", cuando: fecha))
        }
        for (dia, lista) in planner?["days"]?.objeto ?? [:] { for x in lista.lista ?? [] { mirar(x, dia: dia) } }
        for x in planner?["backlog"]?.lista ?? [] { mirar(x, dia: nil) }
        // iOS guarda como mucho 64 avisos pendientes por app; los eventos usan hasta 50.
        return Array(r.sorted { $0.cuando < $1.cuando }.prefix(14))
    }

    static func pedirPermiso() async -> Bool {
        let centro = UNUserNotificationCenter.current()
        if await centro.notificationSettings().authorizationStatus == .notDetermined {
            _ = try? await centro.requestAuthorization(options: [.alert, .sound, .badge])
        }
        let s = await centro.notificationSettings().authorizationStatus
        return s == .authorized || s == .provisional
    }

    static func reconciliar(_ doc: DocumentoBitacora) async {
        let centro = UNUserNotificationCenter.current()
        let quiero = deseados(doc)
        let ids = Set(quiero.map(\.id))
        let pendientes = await centro.pendingNotificationRequests()
        let sobran = pendientes.map(\.identifier).filter { $0.hasPrefix(prefijo) && !ids.contains($0) }
        centro.removePendingNotificationRequests(withIdentifiers: sobran)
        let s = await centro.notificationSettings().authorizationStatus
        guard s == .authorized || s == .provisional else { return }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        for a in quiero {
            let contenido = UNMutableNotificationContent()
            contenido.title = a.titulo
            contenido.body = a.cuerpo
            contenido.sound = .default
            let partes = cal.dateComponents(in: CalendarioBitacora.madrid.zona, from: a.cuando)
            let disparo = UNCalendarNotificationTrigger(dateMatching: DateComponents(calendar: cal, timeZone: CalendarioBitacora.madrid.zona,
                                                                                      year: partes.year, month: partes.month, day: partes.day,
                                                                                      hour: partes.hour, minute: partes.minute), repeats: false)
            try? await centro.add(UNNotificationRequest(identifier: a.id, content: contenido, trigger: disparo))
        }
    }
}
