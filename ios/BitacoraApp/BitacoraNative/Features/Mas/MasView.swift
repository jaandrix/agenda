import SwiftUI
import SafariServices

struct Rutina: Sendable, Identifiable, Equatable {
    let id: String
    let texto: String
    let momento: String
    var hecha: Bool
    let semana: Int
}

struct Nota: Sendable, Identifiable, Equatable {
    let id: String
    let fecha: String
    let texto: String
}

struct Entrega: Sendable, Identifiable, Equatable {
    let id: String
    let titulo: String
    let asignatura: String
    let fecha: String
    let tipo: String
}

struct VistaMas: Sendable, Equatable {
    var rutinas: [Rutina]
    var notas: [Nota]
    var entregas: [Entrega]
}

// Rutinas (`habits`: rutinaToca y rutinaHechasSemana de la web, día del calendario), notas (`notes`) y lo que viene de
// las asignaturas (`studies.subjects[].exams/assignments`).
enum LecturaMas {
    static func vista(_ doc: DocumentoBitacora, hoy: LocalDay = CalendarioBitacora.madrid.dia(de: Date())) -> VistaMas {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let semanaDe = { (d: LocalDay) -> Int in
            cal.component(.weekday, from: cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))!) - 1
        }
        let lunes = hoy.sumando(dias: -((semanaDe(hoy) + 6) % 7))
        var rutinas: [Rutina] = []
        for x in ((try? doc.valor(de: "habits")) ?? nil)?.lista ?? [] {
            guard let o = x.objeto, let id = o["id"]?.comoId, o["activo"]?.booleano != false else { continue }
            let f = o["frecuencia"]?.objeto
            if f?["tipo"]?.texto == "dias", let dias = f?["dias"]?.lista, !dias.isEmpty,
               !dias.compactMap({ Dinero.decimal($0) }).map({ NSDecimalNumber(decimal: $0).intValue }).contains(semanaDe(hoy)) { continue }
            let hechas = o["completadas"]?.objeto ?? [:]
            let semana = (0..<7).filter { hechas[lunes.sumando(dias: $0).iso]?.booleano == true }.count
            rutinas.append(Rutina(id: id, texto: o["texto"]?.texto ?? "", momento: o["momento"]?.texto ?? "",
                                  hecha: hechas[hoy.iso]?.booleano == true, semana: semana))
        }
        let notas = (((try? doc.valor(de: "notes")) ?? nil)?.lista ?? []).compactMap { x -> Nota? in
            guard let o = x.objeto, let id = o["id"]?.comoId else { return nil }
            let texto = o["content"]?.texto ?? o["text"]?.texto ?? o["title"]?.texto ?? ""
            return texto.isEmpty ? nil : Nota(id: id, fecha: o["date"]?.texto ?? String((o["createdAt"]?.texto ?? "").prefix(10)), texto: texto)
        }.sorted { $0.fecha > $1.fecha }
        var entregas: [Entrega] = []
        for s in (((try? doc.valor(de: "studies")) ?? nil)?["subjects"]?.lista ?? []) {
            let nombre = s["name"]?.texto ?? ""
            for (k, tipo) in [("exams", "examen"), ("assignments", "trabajo")] {
                for x in s[k]?.lista ?? [] {
                    guard let fecha = x["date"]?.texto, fecha >= hoy.iso, x["done"]?.booleano != true, x["entregado"]?.booleano != true else { continue }
                    entregas.append(Entrega(id: x["id"]?.comoId ?? UUID().uuidString, titulo: x["title"]?.texto ?? tipo, asignatura: nombre, fecha: fecha, tipo: tipo))
                }
            }
        }
        return VistaMas(rutinas: rutinas, notas: Array(notas.prefix(40)), entregas: entregas.sorted { $0.fecha < $1.fecha })
    }
}

// Lo no migrado se abre en un Safari dentro de la app (no un WKWebView): misma web, sin puente ni cookies compartidas.
struct NavegadorWeb: UIViewControllerRepresentable {
    let url: URL
    @Environment(\.dismiss) private var cerrar

    func makeCoordinator() -> Coordinador { Coordinador(cerrar: { cerrar() }) }
    func makeUIViewController(context: Context) -> SFSafariViewController {
        let v = SFSafariViewController(url: url)
        v.delegate = context.coordinator
        v.dismissButtonStyle = .close
        return v
    }
    func updateUIViewController(_ c: SFSafariViewController, context: Context) {}

    final class Coordinador: NSObject, SFSafariViewControllerDelegate {
        let cerrar: () -> Void
        init(cerrar: @escaping () -> Void) { self.cerrar = cerrar }
        func safariViewControllerDidFinish(_ controller: SFSafariViewController) { cerrar() }
    }
}
