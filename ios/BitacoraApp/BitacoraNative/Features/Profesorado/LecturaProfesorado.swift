import SwiftUI

// Profesorado (js/bajo-demanda/profesorado.js y profesorado-aula.js), clave `profesorado`: clases, sesiones (varias por
// casilla; `hecha` true/false, o null = sin casilla; `descartada`), festivos y sus nombres, notas del día
// (`notasDia["claseId|fecha"]`) y, en cada clase, alumnos, deberes y franjas de horario. El iPhone lee el día y la
// semana, marca sesiones, escribe la nota del día y marca entregas; el cuadrante, arrastrar, correr el temario,
// importar y exportar siguen en la web.

struct AlumnoProfe: Sendable, Identifiable, Equatable { let id, nombre: String }

struct DeberProfe: Sendable, Identifiable, Equatable {
    let id, titulo, puesto, entrega: String
    let entregados: Set<String>
}

struct FranjaProfe: Sendable, Equatable { let dia: Int; let inicio, fin, aula: String }

struct ClaseProfe: Sendable, Identifiable, Equatable {
    let id, nombre, materia, color: String
    let dias: [Int]                // como getDay() de JavaScript: 0 domingo … 6 sábado
    let alumnos: [AlumnoProfe]
    let deberes: [DeberProfe]
    let horario: [FranjaProfe]
}

struct SesionProfe: Sendable, Identifiable, Equatable {
    let id, claseId, fecha, titulo: String
    let hecha: Bool?
    let descartada: Bool
    let orden: Double
    var conCasilla: Bool { hecha != nil }
}

struct AvanceProfe: Sendable, Equatable {
    let dadas, total, atrasadas, porDar, clases: Int
    let fin, estado: String
    let pct: Int
}

struct VistaProfesorado: Sendable, Equatable {
    var clases: [ClaseProfe] = []
    var sesiones: [SesionProfe] = []
    var festivos: Set<String> = []
    var nombresFestivos: [String: String] = [:]
    var notasDia: [String: String] = [:]
    var cursoFin: String?

    func clase(_ id: String) -> ClaseProfe? { clases.first { $0.id == id } }
    func esFestivo(_ iso: String) -> Bool { festivos.contains(iso) }

    // profeEsLectivo: sin días marcados, de lunes a viernes; los festivos no cuentan para ninguna.
    func esLectivo(_ c: ClaseProfe, _ iso: String) -> Bool {
        guard !esFestivo(iso), let w = LecturaProfesorado.diaSemana(iso) else { return false }
        return c.dias.isEmpty ? (1...5).contains(w) : c.dias.contains(w)
    }

    func sesiones(_ claseId: String, _ fecha: String) -> [SesionProfe] {
        sesiones.filter { $0.claseId == claseId && $0.fecha == fecha }.sorted { $0.orden < $1.orden }
    }

    // profeEsPendiente: con casilla, sin hacer ni descartar y de un día pasado.
    func esPendiente(_ s: SesionProfe, hoy: String) -> Bool { s.hecha == false && !s.descartada && s.fecha < hoy }

    func pendientes(hoy: String) -> [SesionProfe] {
        let ids = Set(clases.map(\.id))
        return sesiones.filter { esPendiente($0, hoy: hoy) && ids.contains($0.claseId) }.sorted { ($0.fecha, $0.orden) < ($1.fecha, $1.orden) }
    }

    func nota(_ claseId: String, _ fecha: String) -> String? { notasDia["\(claseId)|\(fecha)"] }

    func notas(de claseId: String) -> [(fecha: String, texto: String)] {
        notasDia.compactMap { k, t -> (fecha: String, texto: String)? in
            let p = k.split(separator: "|", maxSplits: 1).map(String.init)
            return p.count == 2 && p[0] == claseId ? (p[1], t) : nil
        }.sorted { $0.fecha > $1.fecha }
    }

    func franjas(_ c: ClaseProfe, _ iso: String) -> [FranjaProfe] {
        guard let w = LecturaProfesorado.diaSemana(iso) else { return [] }
        return c.horario.filter { $0.dia == w }.sorted { $0.inicio < $1.inicio }
    }

    func entregas(_ c: ClaseProfe, _ iso: String) -> [DeberProfe] { c.deberes.filter { $0.entrega == iso } }

    // profeAvance: lo dado sobre lo que lleva casilla, lo que va por detrás y las clases que quedan hasta el fin de curso.
    func avance(_ c: ClaseProfe, hoy: String) -> AvanceProfe {
        let ses = sesiones.filter { $0.claseId == c.id && $0.conCasilla && !$0.descartada }
        let dadas = ses.filter { $0.hecha == true }.count
        let atrasadas = ses.filter { esPendiente($0, hoy: hoy) }.count
        let porDar = ses.filter { $0.hecha != true }.count
        let fin = cursoFin ?? ses.map(\.fecha).max() ?? hoy
        var clasesQuedan = 0
        if fin >= hoy, var d = LocalDay(iso: hoy) {
            for _ in 0..<400 {
                if d.iso > fin { break }
                if esLectivo(c, d.iso) { clasesQuedan += 1 }
                d = d.sumando(dias: 1)
            }
        }
        var estado = "al día."
        if atrasadas > 0 { estado = "\(atrasadas) \(atrasadas == 1 ? "tarea" : "tareas") por detrás." }
        else if porDar > clasesQuedan && clasesQuedan > 0 { estado = "ajustado: \(porDar) por dar y \(clasesQuedan) clases." }
        return AvanceProfe(dadas: dadas, total: ses.count, atrasadas: atrasadas, porDar: porDar, clases: clasesQuedan, fin: fin,
                           estado: estado, pct: ses.isEmpty ? 0 : Int((Double(dadas) / Double(ses.count) * 100).rounded()))
    }
}

enum LecturaProfesorado {
    // PROFE_COLORES: la web da este color a la clase que no tiene ninguno, por su posición.
    static let colores = ["#e07a3f", "#3f7be0", "#3a9e64", "#c94f7c", "#8a63d2", "#cf9f22", "#2aa5a0", "#8b6f55"]
    static let letras = ["D", "L", "M", "X", "J", "V", "S"]

    static func vista(_ doc: DocumentoBitacora) -> VistaProfesorado {
        guard let p = ((try? doc.valor(de: "profesorado")) ?? nil)?.objeto else { return VistaProfesorado() }
        let clases = (p["clases"]?.lista ?? []).enumerated().compactMap { i, x -> ClaseProfe? in
            guard let o = x.objeto, let id = o["id"]?.comoId else { return nil }
            let color = o["color"]?.texto.flatMap { $0.isEmpty ? nil : $0 } ?? colores[i % colores.count]
            let alumnos = (o["alumnos"]?.lista ?? []).compactMap { a -> AlumnoProfe? in
                guard let id = a["id"]?.comoId else { return nil }
                return AlumnoProfe(id: id, nombre: a["nombre"]?.texto ?? "")
            }
            let deberes = (o["deberes"]?.lista ?? []).compactMap { d -> DeberProfe? in
                guard let id = d["id"]?.comoId, let entrega = d["entrega"]?.texto else { return nil }
                let hechos = (d["entregados"]?.objeto ?? [:]).filter { $0.value != .bool(false) && $0.value != .null }.keys
                return DeberProfe(id: id, titulo: d["titulo"]?.texto ?? "", puesto: d["puesto"]?.texto ?? "", entrega: entrega, entregados: Set(hechos))
            }
            let horario = (o["horario"]?.lista ?? []).compactMap { h -> FranjaProfe? in
                guard let dia = entero(h["dia"]) else { return nil }
                return FranjaProfe(dia: dia, inicio: h["inicio"]?.texto ?? "", fin: h["fin"]?.texto ?? "", aula: h["aula"]?.texto ?? "")
            }
            return ClaseProfe(id: id, nombre: o["nombre"]?.texto ?? "", materia: o["materia"]?.texto ?? "", color: color,
                              dias: (o["dias"]?.lista ?? []).compactMap { entero($0) }, alumnos: alumnos, deberes: deberes, horario: horario)
        }
        let sesiones = (p["sesiones"]?.lista ?? []).compactMap { x -> SesionProfe? in
            guard let o = x.objeto, let id = o["id"]?.comoId, let cid = o["claseId"]?.comoId, let f = o["fecha"]?.texto else { return nil }
            let hecha: Bool? = o["hecha"].flatMap { v in v == .null ? nil : v.booleano }
            return SesionProfe(id: id, claseId: cid, fecha: f, titulo: o["titulo"]?.texto ?? "", hecha: hecha,
                               descartada: o["descartada"]?.booleano == true, orden: doble(o["orden"]) ?? 0)
        }
        var notas: [String: String] = [:]
        for (k, v) in p["notasDia"]?.objeto ?? [:] { if let t = v.texto, !t.isEmpty { notas[k] = t } }
        var nombres: [String: String] = [:]
        for (k, v) in p["nombresFestivos"]?.objeto ?? [:] { if let t = v.texto { nombres[k] = t } }
        return VistaProfesorado(clases: clases, sesiones: sesiones, festivos: Set((p["festivos"]?.lista ?? []).compactMap(\.texto)),
                                nombresFestivos: nombres, notasDia: notas, cursoFin: p["curso"]?["fin"]?.texto.flatMap { $0.isEmpty ? nil : $0 })
    }

    static func doble(_ v: JSONValue?) -> Double? {
        switch v {
        case .number(let s)?: return Double(s)
        case .string(let s)?: return Double(s)
        default: return nil
        }
    }

    static func entero(_ v: JSONValue?) -> Int? { doble(v).map { Int($0) } }

    // getDay() de JavaScript (0 domingo … 6 sábado).
    static func diaSemana(_ iso: String) -> Int? { LocalDay(iso: iso).map { ($0.indiceSemanaLunes + 1) % 7 } }

    // profeNombrePartido: «1º ESO A» → «1º» y «ESO A».
    static func partir(_ nombre: String) -> (curso: String, grupo: String) {
        let palabras = nombre.trimmingCharacters(in: .whitespaces).split(separator: " ").map(String.init)
        guard let primera = palabras.first else { return ("", "") }
        return (primera, palabras.dropFirst().joined(separator: " "))
    }
}

// Escrituras del iPhone, como las funciones de la web: profeHecha (con el valor explícito, para que reaplicar tras un
// conflicto no lo vuelva a cambiar), guardarNotaDiaProfe y profeEntregado. Solo tocan `profesorado` y dejan intacto
// todo lo demás de cada sesión, clase y deber.
enum ProfeOp {
    static let hecha = "profeSesionHecha"
    static let nota = "profeNotaDia"
    static let entregado = "profeEntregado"
    static let tipos: Set<String> = [hecha, nota, entregado]
    static let claves = ["profesorado"]

    static func opHecha(sesion: String, hecha h: Bool) -> OperacionBitacora {
        OperacionesExtra.op(hecha, ["id": .string(sesion), "hecha": .bool(h)])
    }
    static func opNota(clase: String, fecha: String, texto: String) -> OperacionBitacora {
        OperacionesExtra.op(nota, ["claseId": .string(clase), "fecha": .string(fecha), "texto": .string(texto)])
    }
    static func opEntregado(clase: String, deber: String, alumno: String, marcado: Bool) -> OperacionBitacora {
        OperacionesExtra.op(entregado, ["claseId": .string(clase), "deberId": .string(deber), "alumnoId": .string(alumno), "marcado": .bool(marcado)])
    }

    static func aplicar(_ tipo: String, _ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        guard var p = (valores["profesorado"] ?? nil)?.objeto else { return valores }
        switch tipo {
        case hecha:
            guard let id = d["id"]?.texto, let h = d["hecha"]?.booleano, var lista = p["sesiones"]?.lista,
                  let n = lista.firstIndex(where: { $0["id"]?.comoId == id }), var s = lista[n].objeto else { return valores }
            s["hecha"] = .bool(h)
            s.removeValue(forKey: "descartada")
            lista[n] = .object(s)
            p["sesiones"] = .array(lista)
        case nota:
            guard let cid = d["claseId"]?.texto, let f = d["fecha"]?.texto, LocalDay(iso: f) != nil,
                  (p["clases"]?.lista ?? []).contains(where: { $0["id"]?.comoId == cid }) else { return valores }
            let texto = String((d["texto"]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(5000))
            var notas = p["notasDia"]?.objeto ?? [:]
            if texto.isEmpty { notas.removeValue(forKey: "\(cid)|\(f)") } else { notas["\(cid)|\(f)"] = .string(texto) }
            p["notasDia"] = .object(notas)
        case entregado:
            guard let cid = d["claseId"]?.texto, let did = d["deberId"]?.texto, let aid = d["alumnoId"]?.texto, let marcado = d["marcado"]?.booleano,
                  var clases = p["clases"]?.lista, let n = clases.firstIndex(where: { $0["id"]?.comoId == cid }), var c = clases[n].objeto,
                  var deberes = c["deberes"]?.lista, let m = deberes.firstIndex(where: { $0["id"]?.comoId == did }), var deber = deberes[m].objeto
            else { return valores }
            var e = deber["entregados"]?.objeto ?? [:]
            if marcado { e[aid] = .bool(true) } else { e.removeValue(forKey: aid) }
            deber["entregados"] = .object(e)
            deberes[m] = .object(deber)
            c["deberes"] = .array(deberes)
            clases[n] = .object(c)
            p["clases"] = .array(clases)
        default:
            return valores
        }
        var r = valores
        r["profesorado"] = .some(.object(p))
        return r
    }
}

enum TextoProfe {
    private static func formato(_ patron: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = patron
        return f
    }
    private static let largo = formato("EEEE d 'de' MMMM")
    private static let corto = formato("EEE d MMM")

    private static func fecha(_ iso: String) -> Date? {
        guard let d = LocalDay(iso: iso) else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))
    }

    static func dia(_ iso: String) -> String { fecha(iso).map { largo.string(from: $0) } ?? iso }
    static func corta(_ iso: String) -> String { fecha(iso).map { corto.string(from: $0).replacingOccurrences(of: ".", with: "") } ?? iso }

    static func cuando(_ iso: String, hoy: String) -> String {
        guard let h = LocalDay(iso: hoy) else { return dia(iso) }
        if iso == hoy { return "hoy" }
        if iso == h.sumando(dias: 1).iso { return "mañana" }
        if iso == h.sumando(dias: -1).iso { return "ayer" }
        return dia(iso)
    }
}
