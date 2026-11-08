import Foundation

struct EventoDia: Sendable, Identifiable, Equatable {
    let id: String
    let titulo: String
    let hora: String?
    let lugar: String
    let notas: String
    let tipo: String
    let editable: Bool
    let sinAviso: Bool
    // Lo que la PWA pone debajo del título (.m-fila-meta) y las entradas con QR.
    var meta = ""
    var entradas = 0
    // Pagos recurrentes: fila suave, como .m-fila-suave.
    var suave = false
}

struct VistaMes: Sendable, Equatable {
    let mes: YearMonth
    let porDia: [LocalDay: [EventoDia]]
}

// getDayAllEntries y getRecurringCalendarEntries (js/calendario.js): entradas con `date` o `startDate` ese día,
// cumpleaños por mes y día, días de trabajo (con el horario de la agenda laboral), citas laborales y pagos recurrentes
// vigentes. Fuera los tipos que no van al calendario y las marcas de «completado». Los partidos de tus equipos vienen
// de la red y se añaden aparte.
enum LecturaCalendario {
    static let fueraDelCalendario: Set<String> = ["document", "restaurant", "place", "goal", "subscription", "fixed_expense"]

    static func mes(_ doc: DocumentoBitacora, _ mes: YearMonth) -> VistaMes {
        var r: [LocalDay: [EventoDia]] = [:]
        let cats = Dictionary((((try? doc.valor(de: "categories")) ?? nil)?.lista ?? []).compactMap { c in
            c["id"]?.comoId.map { ($0, c["name"]?.texto ?? "") } }, uniquingKeysWith: { a, _ in a })
        let lista = ((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []
        for x in lista {
            guard let o = x.objeto, let id = o["id"]?.comoId, !esMarca(o, id: id) else { continue }
            let tipo = o["type"]?.texto ?? ""
            if fueraDelCalendario.contains(tipo) { continue }
            let dia: LocalDay?
            if tipo == "birthday" {
                guard let n = o["birthDate"]?.texto.flatMap(LocalDay.init(iso:)) else { continue }
                dia = LocalDay(year: mes.year, month: n.month, day: n.day)
            } else {
                dia = (o["date"]?.texto).flatMap(LocalDay.init(iso:)) ?? (o["startDate"]?.texto).flatMap(LocalDay.init(iso:))
            }
            guard let dia, dia.yearMonth == mes else { continue }
            r[dia, default: []].append(evento(o, id: id, tipo: tipo, anio: mes.year, categorias: cats))
        }
        // Exámenes y trabajos sin su entrada `evt_` (syncExamCalendarEvent solo la crea al editarlos).
        let enlazados = Set(lista.compactMap { $0["linkedItemId"]?.comoId })
        for s in ((try? doc.valor(de: "studies")) ?? nil)?["subjects"]?.lista ?? [] {
            let nombre = s["name"]?.texto ?? ""
            for (k, etiqueta) in [("exams", "Examen"), ("assignments", "Entrega")] {
                for x in s[k]?.lista ?? [] {
                    guard let id = x["id"]?.comoId, !enlazados.contains(id), let dia = (x["date"]?.texto).flatMap(LocalDay.init(iso:)),
                          dia.yearMonth == mes else { continue }
                    let titulo = x["title"]?.texto.flatMap { $0.isEmpty ? nil : $0 } ?? "Sin título"
                    r[dia, default: []].append(EventoDia(id: "estudio_" + id, titulo: "\(etiqueta): \(titulo) (\(nombre))",
                                                         hora: x["time"]?.texto.flatMap { $0.isEmpty ? nil : $0 }, lugar: "", notas: "",
                                                         tipo: "estudio", editable: false, sinAviso: true))
                }
            }
        }
        anadirRecurrentes(doc, lista, mes, &r)
        for k in r.keys { r[k]?.sort { ($0.hora ?? "") < ($1.hora ?? "") } }
        return VistaMes(mes: mes, porDia: r)
    }

    static func esMarca(_ o: [String: JSONValue], id: String) -> Bool {
        o["calendarLog"]?.booleano == true || id.hasPrefix("weekly_task_done_") || id.hasPrefix("planner_done_") || id.hasPrefix("recurring_done_")
    }

    static func evento(_ o: [String: JSONValue], id: String, tipo: String, anio: Int, categorias: [String: String] = [:]) -> EventoDia {
        var titulo = o["title"]?.texto ?? ""
        if tipo == "birthday" {
            var t = "cumpleaños de \(titulo)"
            if o["sinAnio"]?.booleano != true, let y = Int(o["birthDate"]?.texto?.prefix(4) ?? "") { t += " (\(anio - y) años)" }
            titulo = t
        } else if tipo == "travel" {
            titulo = "viaje: " + (o["destination"]?.texto.flatMap { $0.isEmpty ? nil : $0 } ?? titulo)
        }
        let hora = (o["time"]?.texto ?? o["startTime"]?.texto).flatMap { $0.isEmpty ? nil : $0 }
        return EventoDia(id: id, titulo: titulo, hora: hora, lugar: o["place"]?.texto ?? "", notas: o["notes"]?.texto ?? "",
                         tipo: tipo, editable: tipo == "event" && o["linkedItemId"] == nil, sinAviso: o["sinAviso"]?.booleano == true,
                         meta: [o["place"]?.texto ?? "", o["categoryId"]?.comoId.flatMap { categorias[$0] } ?? ""].filter { !$0.isEmpty }.joined(separator: ", "),
                         entradas: o["entradas"]?.lista?.count ?? 0)
    }

    static let tiposLaborales = ["reunion": "reunión", "turno": "turno", "formacion": "formación", "viaje": "viaje de trabajo", "otro": "trabajo"]

    // suscripcionVigente (js/suscripciones.js).
    static func vigente(_ o: [String: JSONValue], _ iso: String) -> Bool {
        if let alta = o["altaDesde"]?.texto, iso < alta { return false }
        let bajas = o["bajas"]?.lista ?? []
        if bajas.contains(where: { b in
            guard let desde = b["desde"]?.texto else { return false }
            return iso >= desde && (b["hasta"]?.texto.map { iso < $0 } ?? true)
        }) { return false }
        if o["active"]?.booleano == false && !bajas.contains(where: { $0["hasta"]?.texto == nil }) { return false }
        return true
    }

    private static func anadirRecurrentes(_ doc: DocumentoBitacora, _ lista: [JSONValue], _ mes: YearMonth, _ r: inout [LocalDay: [EventoDia]]) {
        let laboral = (try? doc.valor(de: "agendaLaboral")) ?? nil
        let enPrincipal = laboral?["enPrincipal"]?.booleano != false
        let horario = laboral?["horario"]?.objeto?.filter { $0.value.objeto != nil } ?? [:]
        let trabajos = lista.compactMap(\.objeto).filter { $0["type"]?.texto == "work" && $0["startDate"]?.texto != nil }
        let pagos = lista.compactMap(\.objeto).filter { ["subscription", "fixed_expense"].contains($0["type"]?.texto ?? "") }
        let citas = laboral?["citas"]?.lista?.compactMap(\.objeto) ?? []
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        guard let primero = LocalDay(year: mes.year, month: mes.month, day: 1) else { return }
        var diasMes = 0
        while primero.sumando(dias: diasMes).yearMonth == mes { diasMes += 1 }
        for n in 0..<diasMes {
            let d = primero.sumando(dias: n)
            let iso = d.iso
            let semana = cal.component(.weekday, from: cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))!) - 1
            var extra: [EventoDia] = []
            if enPrincipal {
                let h = horario["\(semana)"]?.objeto
                let trabaja = horario.isEmpty ? (semana != 0 && semana != 6) : h != nil
                if trabaja {
                    for w in trabajos where (w["startDate"]?.texto ?? "") <= iso && (w["endDate"]?.texto.map { $0.isEmpty || $0 >= iso } ?? true) {
                        let ini = h?["ini"]?.texto ?? w["startTime"]?.texto ?? "", fin = h?["fin"]?.texto ?? w["endTime"]?.texto ?? ""
                        let horas = ini.isEmpty && fin.isEmpty ? "" : "de \(ini.isEmpty ? "--" : ini) a \(fin.isEmpty ? "--" : fin)"
                        let empresa = w["company"]?.texto.flatMap { $0.isEmpty ? nil : $0 } ?? "tu empresa"
                        extra.append(EventoDia(id: w["id"]?.comoId ?? "work", titulo: "trabajando en \(empresa)",
                                               hora: ini.isEmpty ? nil : ini, lugar: "", notas: "", tipo: "work", editable: false, sinAviso: true,
                                               meta: [horas, w["position"]?.texto ?? ""].filter { !$0.isEmpty }.joined(separator: ", ")))
                    }
                }
                for c in citas where c["fecha"]?.texto == iso {
                    let titulo = c["titulo"]?.texto.flatMap { $0.isEmpty ? nil : $0 } ?? tiposLaborales[c["tipo"]?.texto ?? ""] ?? "trabajo"
                    extra.append(EventoDia(id: c["id"]?.comoId ?? "lab", titulo: titulo, hora: c["ini"]?.texto.flatMap { $0.isEmpty ? nil : $0 },
                                           lugar: c["lugar"]?.texto ?? "", notas: c["notas"]?.texto ?? "", tipo: "laboral", editable: false, sinAviso: true,
                                           meta: [c["lugar"]?.texto ?? "", "trabajo"].filter { !$0.isEmpty }.joined(separator: ", ")))
                }
            }
            for p in pagos {
                guard let dia = Dinero.decimal(p["renewalDay"]).map({ NSDecimalNumber(decimal: $0).intValue }), dia > 0,
                      min(dia, diasMes) == d.day, vigente(p, iso) else { continue }
                extra.append(EventoDia(id: "pago_" + (p["id"]?.comoId ?? ""), titulo: "pago: \(p["title"]?.texto ?? "")", hora: nil, lugar: "", notas: "",
                                       tipo: "pago", editable: false, sinAviso: true,
                                       meta: Dinero.decimal(p["amount"]).map(Dinero.formato) ?? "", suave: true))
            }
            if !extra.isEmpty { r[d, default: []].append(contentsOf: extra) }
        }
    }
}
