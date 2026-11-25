import Foundation

// 3.2, «mi perfil.»: lo personal que vive en la fila de `bitacora`. El nombre es `userName` (el mismo que usa la web
// para el saludo, el CV y compartir); el cumpleaños va en `perfilPersonal` = { cumple: "AAAA-MM-DD", sinAnio? }, clave
// nueva en DATOS_SINCRONIZADOS. Sin año se guarda 2000, como los cumpleaños de `entries` (birthDate 2000 y sinAnio).
// Solo escribe lo que trae: sin "nombre" no toca userName; "cumple" null lo quita. Idempotente y conserva el resto de
// `perfilPersonal`.
enum PerfilPersonalOp {
    static let tipo = "perfilPersonal"
    static let claves = ["userName", "perfilPersonal"]
    static let maxNombre = 40

    struct Lectura: Sendable, Equatable {
        var nombre = ""
        var cumple: LocalDay?
        var sinAnio = false
    }

    static func op(nombre: String? = nil, cumple: LocalDay?? = nil, sinAnio: Bool = false) -> OperacionBitacora {
        var d: [String: JSONValue] = [:]
        if let nombre { d["nombre"] = .string(nombre) }
        if let cumple {
            if let dia = cumple {
                d["cumple"] = .string(sinAnio ? LocalDay(year: 2000, month: dia.month, day: dia.day)?.iso ?? dia.iso : dia.iso)
                d["sinAnio"] = .bool(sinAnio)
            } else {
                d["cumple"] = .null
            }
        }
        return OperacionesExtra.op(tipo, d)
    }

    static func aplicar(_ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        var r = valores
        if let n = d["nombre"]?.texto {
            r["userName"] = .some(.string(String(n.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxNombre))))
        }
        if let c = d["cumple"] {
            var p = (valores["perfilPersonal"] ?? nil)?.objeto ?? [:]
            if let iso = c.texto, LocalDay(iso: iso) != nil {
                p["cumple"] = .string(iso)
                if d["sinAnio"]?.booleano == true { p["sinAnio"] = .bool(true) } else { p.removeValue(forKey: "sinAnio") }
                r["perfilPersonal"] = .some(.object(p))
            } else if case .null = c {
                p.removeValue(forKey: "cumple")
                p.removeValue(forKey: "sinAnio")
                r["perfilPersonal"] = .some(.object(p))
            }
        }
        return r
    }

    static func leer(_ doc: DocumentoBitacora) -> Lectura {
        var l = Lectura()
        l.nombre = ((try? doc.valor(de: "userName")) ?? nil)?.texto ?? ""
        let p = (try? doc.valor(de: "perfilPersonal")) ?? nil
        l.cumple = p?["cumple"]?.texto.flatMap { LocalDay(iso: $0) }
        l.sinAnio = p?["sinAnio"]?.booleano == true
        return l
    }

    // El 29 de febrero se celebra el 28 los años que no son bisiestos.
    static func esCumple(_ cumple: LocalDay?, hoy: LocalDay) -> Bool {
        guard let c = cumple else { return false }
        if c.month == hoy.month && c.day == hoy.day { return true }
        return c.month == 2 && c.day == 29 && hoy.month == 2 && hoy.day == 28 && LocalDay(year: hoy.year, month: 2, day: 29) == nil
    }

    // Años que cumple hoy (nil sin año o si la fecha es de este año o posterior).
    static func edad(_ cumple: LocalDay?, sinAnio: Bool, hoy: LocalDay) -> Int? {
        guard let c = cumple, !sinAnio, c.year < hoy.year else { return nil }
        return hoy.year - c.year
    }
}
