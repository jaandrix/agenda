import Foundation

// Social (js/social.js y la parte de amigos de js/nucleo.js). Nada de esto vive en la fila de `bitacora`: son tablas de
// Supabase con RLS por miembro (supabase/sql/gastos_compartidos.sql, amistades.sql, solicitudes_amistad.sql) y las mismas
// RPC que la web. Los importes viajan en euros con dos decimales y se cuentan en céntimos para que la suma cuadre.

struct SocialMiembro: Sendable, Equatable, Identifiable {
    let id: String
    let userId: String?
    let nombre: String
}

struct SocialParte: Sendable, Equatable {
    let miembro: String
    let centimos: Int
    var partes: Double?
}

struct SocialGasto: Sendable, Equatable, Identifiable {
    let id: String
    let tipo: String          // gasto, transferencia o ingreso
    let titulo: String
    let centimos: Int
    let pagadoPor: String
    let modo: String          // igual, partes o importes
    let reparto: [SocialParte]
    let fecha: String
    let categoria: String?
}

struct SocialGrupo: Sendable, Equatable, Identifiable {
    let id: String
    let nombre: String
    let descripcion: String?
    let creadorId: String
    var miembros: [SocialMiembro]
    var gastos: [SocialGasto]
}

struct SocialAmigo: Sendable, Equatable, Identifiable {
    let friendId: String
    let nombre: String
    var id: String { friendId }
}

struct SocialSolicitud: Sendable, Equatable, Identifiable {
    let id: String
    let nombre: String
    let recibida: Bool
}

struct SocialEventoRecibido: Sendable, Equatable, Identifiable {
    let id: String
    let de: String
    let evento: [String: String]
    let nota: String?
}

struct SocialDatos: Sendable, Equatable {
    var yo: String
    var miNombre: String
    var grupos: [SocialGrupo] = []
    var eventos: [SocialEventoRecibido] = []
    var amigos: [SocialAmigo] = []
    var solicitudes: [SocialSolicitud] = []
    var codigo: String?
}

// Lo que se escribe en gastos_compartidos (guardarGastoCompartido / marcarPagoSaldado).
struct SocialFilaGasto: Sendable, Equatable {
    var grupoId: String
    var tipo: String
    var titulo: String
    var centimos: Int
    var pagadoPor: String
    var modo: String
    var reparto: [SocialParte]
    var fecha: String
    var categoria: String?
}

enum ErrorSocial: Error, Equatable {
    case servidor(String)
}

// Cuentas puras de social.js (saldosGrupo, comoSaldar, totalesGrupo, calcularReparto, textoSaldo).
enum CuentasSocial {
    static let categorias = ["comida", "súper", "transporte", "alojamiento", "ocio", "compras", "otros"]

    static func miMiembro(_ g: SocialGrupo, yo: String) -> SocialMiembro? { g.miembros.first { $0.userId == yo } }

    static func nombre(_ g: SocialGrupo, _ id: String?, yo: String, amigos: [SocialAmigo]) -> String {
        guard let id, let m = g.miembros.first(where: { $0.id == id }) else { return "alguien" }
        if let u = m.userId, u == yo { return "tú" }
        if let u = m.userId, let a = amigos.first(where: { $0.friendId == u }) { return a.nombre }
        return m.nombre
    }

    static func saldos(_ g: SocialGrupo) -> [String: Int] {
        var s = Dictionary(uniqueKeysWithValues: g.miembros.map { ($0.id, 0) })
        for x in g.gastos {
            let signo = x.tipo == "ingreso" ? -1 : 1
            if s[x.pagadoPor] != nil { s[x.pagadoPor]! += signo * x.centimos }
            for r in x.reparto where s[r.miembro] != nil { s[r.miembro]! -= signo * r.centimos }
        }
        return s
    }

    struct Pago: Sendable, Equatable, Identifiable {
        let de: String
        let a: String
        let centimos: Int
        var id: String { de + ">" + a }
    }

    // El que más debe paga al que más le deben: el mínimo de pagos. A igualdad, el orden de los miembros (estable).
    static func comoSaldar(_ g: SocialGrupo) -> [Pago] {
        let s = saldos(g)
        let orden = g.miembros.map(\.id)
        let ordenar: ([(String, Int)]) -> [(String, Int)] = { l in
            l.sorted { $0.1 != $1.1 ? $0.1 > $1.1 : (orden.firstIndex(of: $0.0) ?? 0) < (orden.firstIndex(of: $1.0) ?? 0) }
        }
        var deudores = ordenar(orden.compactMap { id in s[id].flatMap { $0 < 0 ? (id, -$0) : nil } })
        var acreedores = ordenar(orden.compactMap { id in s[id].flatMap { $0 > 0 ? (id, $0) : nil } })
        var pagos: [Pago] = []
        var i = 0, j = 0
        while i < deudores.count && j < acreedores.count {
            let c = min(deudores[i].1, acreedores[j].1)
            if c > 0 { pagos.append(Pago(de: deudores[i].0, a: acreedores[j].0, centimos: c)) }
            deudores[i].1 -= c; acreedores[j].1 -= c
            if deudores[i].1 == 0 { i += 1 }
            if acreedores[j].1 == 0 { j += 1 }
        }
        return pagos
    }

    struct Totales: Sendable, Equatable { let total: Int; let mio: Int; let saldo: Int }

    static func totales(_ g: SocialGrupo, yo: String) -> Totales {
        let mi = miMiembro(g, yo: yo)?.id
        var total = 0, mio = 0
        for x in g.gastos where x.tipo != "transferencia" {
            let signo = x.tipo == "ingreso" ? -1 : 1
            total += signo * x.centimos
            if let p = x.reparto.first(where: { $0.miembro == mi }) { mio += signo * p.centimos }
        }
        return Totales(total: total, mio: mio, saldo: mi.flatMap { saldos(g)[$0] } ?? 0)
    }

    static func numGastos(_ g: SocialGrupo) -> Int { g.gastos.filter { $0.tipo != "transferencia" }.count }

    // calcularReparto: a partes iguales entre los marcados, por partes (pesos) o por importes a mano (en céntimos). El
    // sobrante del redondeo va a los primeros para que la suma sea exacta.
    static func reparto(miembros: [SocialMiembro], modo: String, valores: [String: Double], centimos: Int) -> [SocialParte] {
        if modo == "importes" {
            return miembros.compactMap { m in
                let v = valores[m.id] ?? 0
                return v > 0 ? SocialParte(miembro: m.id, centimos: Int((v * 100).rounded())) : nil
            }
        }
        let pesos = miembros.compactMap { m -> (String, Double)? in
            let v = valores[m.id] ?? 0
            let p = modo == "igual" ? (v > 0 ? 1 : 0) : max(0, v)
            return p > 0 ? (m.id, p) : nil
        }
        let totalP = pesos.reduce(0) { $0 + $1.1 }
        guard totalP > 0 else { return [] }
        var base = pesos.map { (id: $0.0, p: $0.1, c: Int((Double(centimos) * $0.1 / totalP).rounded(.down))) }
        var resto = centimos - base.reduce(0) { $0 + $1.c }
        var k = 0
        while resto > 0 { base[k].c += 1; resto -= 1; k = (k + 1) % base.count }
        return base.map { SocialParte(miembro: $0.id, centimos: $0.c, partes: modo == "partes" ? $0.p : nil) }
    }

    // Un solo formateador: se creaba uno por cifra en cada pintado (varias por fila de gasto) y era lo que más pesaba.
    private static let formatoDinero: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.numberStyle = .currency
        f.currencyCode = "EUR"
        return f
    }()

    static func dinero(_ centimos: Int) -> String {
        formatoDinero.string(from: NSNumber(value: Double(centimos) / 100)) ?? "\(Double(centimos) / 100) €"
    }

    static func textoSaldo(_ c: Int) -> String {
        if abs(c) < 1 { return "estás en paz." }
        return c > 0 ? "te deben \(dinero(c))." : "debes \(dinero(-c))."
    }

    // «12,50» o «12.50» → céntimos; nil si no es una cifra positiva.
    static func centimos(_ texto: String) -> Int? {
        let t = texto.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard let d = Decimal(string: t, locale: Locale(identifier: "en_US_POSIX")), d > 0 else { return nil }
        var x = d * 100, r = Decimal()
        NSDecimalRound(&r, &x, 0, .plain)
        return NSDecimalNumber(decimal: r).intValue
    }

    // eventoCompartidoValido: lo que manda otra persona se valida al entrar (solo texto, forma de fecha u hora, largo máximo).
    static let camposEvento = ["title", "date", "time", "endDate", "endTime", "place", "notes", "eventType"]
    private static let formaEvento: [String: (Int, String?)] = [
        "title": (200, nil), "date": (10, #"^\d{4}-\d{2}-\d{2}$"#), "time": (5, #"^\d{2}:\d{2}$"#),
        "endDate": (10, #"^\d{4}-\d{2}-\d{2}$"#), "endTime": (5, #"^\d{2}:\d{2}$"#), "place": (200, nil), "notes": (4000, nil),
        "eventType": (40, #"^[a-zA-Z0-9_-]+$"#),
    ]

    static func eventoValido(_ crudo: [String: Any]?) -> [String: String]? {
        guard let crudo else { return nil }
        var ev: [String: String] = [:]
        for k in camposEvento {
            guard let v = crudo[k], !(v is NSNull) else { continue }
            guard let s = v as? String else { return nil }
            if s.isEmpty { continue }
            guard let forma = formaEvento[k] else { continue }
            let (largo, re) = forma
            if let re, s.range(of: re, options: .regularExpression) == nil { return nil }
            ev[k] = String(s.prefix(largo))
        }
        return ev["title"] != nil && ev["date"] != nil ? ev : nil
    }

    // generarCodigoAmigoAleatorio: sin 0/O/1/I para no confundirse al escribirlo.
    static func codigoAleatorio() -> String {
        let alfabeto = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        return String((0..<8).map { _ in alfabeto.randomElement()! })
    }
}

actor RepositorioSocial {
    private let cliente: ClienteSupabase
    private let auth: AuthRepository

    init(cliente: ClienteSupabase, auth: AuthRepository) {
        self.cliente = cliente
        self.auth = auth
    }

    private func pedir(_ ruta: String, consulta: [URLQueryItem] = [], metodo: String = "GET", cuerpo: Any? = nil,
                       representacion: Bool = false) async throws -> (Any?, Int) {
        let s = try await auth.sesionValida()
        let datos = try cuerpo.map { try JSONSerialization.data(withJSONObject: $0) }
        var r = cliente.peticion(ruta, consulta: consulta, metodo: metodo, token: s.accessToken, cuerpo: datos, tiempo: 20)
        if representacion { r.setValue("return=representation", forHTTPHeaderField: "Prefer") }
        let (d, codigo) = try await cliente.enviar(r)
        let json = d.isEmpty ? nil : try? JSONSerialization.jsonObject(with: d, options: .fragmentsAllowed)
        return (json, codigo)
    }

    private func exigir(_ ruta: String, consulta: [URLQueryItem] = [], metodo: String, cuerpo: Any? = nil, representacion: Bool = false) async throws -> Any? {
        let (j, codigo) = try await pedir(ruta, consulta: consulta, metodo: metodo, cuerpo: cuerpo, representacion: representacion)
        guard (200..<300).contains(codigo) else {
            throw ErrorSocial.servidor(((j as? [String: Any])?["message"] as? String) ?? "error \(codigo)")
        }
        return j
    }

    private func filas(_ ruta: String, _ consulta: [URLQueryItem]) async -> [[String: Any]]? {
        guard let (j, codigo) = try? await pedir(ruta, consulta: consulta), codigo == 200 else { return nil }
        return j as? [[String: Any]]
    }

    private static func q(_ n: String, _ v: String) -> URLQueryItem { URLQueryItem(name: n, value: v) }
    private static func en(_ ids: [String]) -> String { "in.(" + ids.joined(separator: ",") + ")" }
    private static func texto(_ v: Any?) -> String? { (v as? String) ?? (v as? NSNumber).map { $0.stringValue } }
    private static func centimos(_ v: Any?) -> Int {
        if let n = v as? NSNumber { return Int((n.doubleValue * 100).rounded()) }
        if let s = v as? String, let d = Double(s) { return Int((d * 100).rounded()) }
        return 0
    }

    // loadFriendsViewData: todo a la vez; lo que falle se queda vacío y lo demás sigue.
    func cargar() async throws -> SocialDatos {
        let s = try await auth.sesionValida()
        let yo = s.userId
        async let gs = grupos()
        async let es = eventos(yo)
        async let am = amigos(yo)
        async let so = solicitudes(yo)
        async let co = filas("rest/v1/codigos_amigo", [Self.q("select", "codigo"), Self.q("user_id", "eq.\(yo)")])
        async let no = nombres([yo])
        var d = SocialDatos(yo: yo, miNombre: (await no)[yo] ?? "")
        d.grupos = await gs
        d.eventos = await es
        d.amigos = await am
        d.solicitudes = await so
        d.codigo = (await co)?.first.flatMap { $0["codigo"] as? String }
        return d
    }

    private func nombres(_ ids: [String]) async -> [String: String] {
        guard !ids.isEmpty, let f = await filas("rest/v1/perfiles_publicos", [Self.q("select", "user_id,nombre_publico"), Self.q("user_id", Self.en(ids))]) else { return [:] }
        var r: [String: String] = [:]
        for x in f { if let u = x["user_id"] as? String, let n = x["nombre_publico"] as? String, !n.isEmpty { r[u] = n } }
        return r
    }

    private func grupos() async -> [SocialGrupo] {
        guard let gs = await filas("rest/v1/grupos_gastos", [Self.q("select", "*"), Self.q("order", "creado_en.desc")]), !gs.isEmpty else { return [] }
        let ids = gs.compactMap { $0["id"] as? String }
        async let ms = filas("rest/v1/grupos_gastos_miembros", [Self.q("select", "*"), Self.q("grupo_id", Self.en(ids)), Self.q("order", "creado_en")])
        async let xs = filas("rest/v1/gastos_compartidos", [Self.q("select", "*"), Self.q("grupo_id", Self.en(ids)), Self.q("order", "fecha.desc,creado_en.desc")])
        let miembros = await ms ?? []
        let gastos = await xs ?? []
        return gs.compactMap { g in
            guard let id = g["id"] as? String else { return nil }
            let m = miembros.filter { $0["grupo_id"] as? String == id }.compactMap { m -> SocialMiembro? in
                guard let mid = m["id"] as? String else { return nil }
                return SocialMiembro(id: mid, userId: m["user_id"] as? String, nombre: m["nombre"] as? String ?? "")
            }
            let x = gastos.filter { $0["grupo_id"] as? String == id }.compactMap { x -> SocialGasto? in
                guard let xid = x["id"] as? String, let pagado = x["pagado_por"] as? String else { return nil }
                let reparto = (x["reparto"] as? [[String: Any]] ?? []).compactMap { r -> SocialParte? in
                    guard let m = r["miembro"] as? String else { return nil }
                    return SocialParte(miembro: m, centimos: Self.centimos(r["importe"]), partes: (r["partes"] as? NSNumber)?.doubleValue)
                }
                return SocialGasto(id: xid, tipo: x["tipo"] as? String ?? "gasto", titulo: x["titulo"] as? String ?? "", centimos: Self.centimos(x["importe"]),
                                   pagadoPor: pagado, modo: x["modo"] as? String ?? "igual", reparto: reparto,
                                   fecha: x["fecha"] as? String ?? "", categoria: x["categoria"] as? String)
            }
            return SocialGrupo(id: id, nombre: g["nombre"] as? String ?? "", descripcion: g["descripcion"] as? String,
                               creadorId: g["creador_id"] as? String ?? "", miembros: m, gastos: x)
        }
    }

    private func eventos(_ yo: String) async -> [SocialEventoRecibido] {
        guard let f = await filas("rest/v1/eventos_compartidos", [Self.q("select", "*"), Self.q("destinatario_id", "eq.\(yo)"), Self.q("order", "creado_en.desc")]),
              !f.isEmpty else { return [] }
        let porId = await nombres(Array(Set(f.compactMap { $0["remitente_id"] as? String })))
        return f.compactMap { e in
            guard let id = e["id"] as? String else { return nil }
            let crudo = e["evento"] as? [String: Any] ?? [:]
            var ev: [String: String] = [:]
            for k in CuentasSocial.camposEvento { if let v = crudo[k] as? String { ev[k] = v } }
            return SocialEventoRecibido(id: id, de: porId[e["remitente_id"] as? String ?? ""] ?? "Un amigo", evento: ev, nota: e["nota"] as? String)
        }
    }

    // El evento tal como llegó, validado al añadirlo (eventoCompartidoValido rechaza lo que no sea texto).
    func eventoValidado(_ id: String) async -> [String: String]? {
        guard let f = await filas("rest/v1/eventos_compartidos", [Self.q("select", "evento"), Self.q("id", "eq.\(id)")]) else { return nil }
        return CuentasSocial.eventoValido(f.first?["evento"] as? [String: Any])
    }

    private func amigos(_ yo: String) async -> [SocialAmigo] {
        guard let f = await filas("rest/v1/amistades", [Self.q("select", "friend_id,friend_nombre,creado_en"), Self.q("user_id", "eq.\(yo)"),
                                                        Self.q("order", "creado_en.desc")]), !f.isEmpty else { return [] }
        let porId = await nombres(f.compactMap { $0["friend_id"] as? String })
        return f.compactMap { a in
            guard let id = a["friend_id"] as? String else { return nil }
            let snap = (a["friend_nombre"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            return SocialAmigo(friendId: id, nombre: porId[id] ?? snap ?? "Amigo sin nombre")
        }
    }

    private func solicitudes(_ yo: String) async -> [SocialSolicitud] {
        guard let f = await filas("rest/v1/solicitudes_amistad", [Self.q("select", "id,remitente_id,destinatario_id,estado,creado_en"), Self.q("estado", "eq.pendiente"),
                                                                  Self.q("or", "(remitente_id.eq.\(yo),destinatario_id.eq.\(yo))"), Self.q("order", "creado_en.desc")]),
              !f.isEmpty else { return [] }
        let otro = { (s: [String: Any]) -> String? in (s["destinatario_id"] as? String == yo ? s["remitente_id"] : s["destinatario_id"]) as? String }
        let porId = await nombres(Array(Set(f.compactMap(otro))))
        return f.compactMap { s in
            guard let id = Self.texto(s["id"]) else { return nil }
            return SocialSolicitud(id: id, nombre: otro(s).flatMap { porId[$0] } ?? "Alguien", recibida: s["destinatario_id"] as? String == yo)
        }
    }

    // ---------- amigos ----------

    func responder(_ solicitud: String, aceptar: Bool) async throws {
        _ = try await exigir("rest/v1/rpc/responder_solicitud_amistad", metodo: "POST", cuerpo: ["p_solicitud_id": solicitud, "p_aceptar": aceptar])
    }

    // anadirAmigoPorCodigo: true si ya sois amigos al momento (esa persona ya te había mandado una solicitud).
    func enviarSolicitud(_ codigo: String) async throws -> Bool {
        let j = try await exigir("rest/v1/rpc/enviar_solicitud_amistad_por_codigo", metodo: "POST", cuerpo: ["p_codigo": codigo])
        return (j as? String) == "aceptada_directa"
    }

    func eliminarAmigo(_ friendId: String) async throws {
        _ = try await exigir("rest/v1/rpc/eliminar_amigo", metodo: "POST", cuerpo: ["p_friend_id": friendId])
    }

    // generarCodigoAmigo: tres intentos, y solo se reintenta si el código ya existía (23505, código único).
    func generarCodigo() async throws -> String {
        let yo = try await auth.sesionValida().userId
        var ultimo = "no se pudo generar el código."
        for _ in 0..<3 {
            let codigo = CuentasSocial.codigoAleatorio()
            let (j, estado) = try await pedir("rest/v1/codigos_amigo", metodo: "POST", cuerpo: ["user_id": yo, "codigo": codigo])
            if (200..<300).contains(estado) { return codigo }
            let o = j as? [String: Any]
            ultimo = o?["message"] as? String ?? ultimo
            if o?["code"] as? String != "23505" { break }
        }
        throw ErrorSocial.servidor(ultimo)
    }

    // ---------- grupos ----------

    // guardarGrupoGastos: al crear, el grupo y luego sus miembros (tú el primero); al editar, nombre, descripción y los nuevos.
    func guardarGrupo(id: String?, nombre: String, descripcion: String?, nuevos: [(userId: String?, nombre: String)], miNombre: String) async throws -> String {
        let yo = try await auth.sesionValida().userId
        let desc: Any = descripcion ?? NSNull()
        var grupoId = id ?? ""
        var miembros = nuevos
        if let id {
            _ = try await exigir("rest/v1/grupos_gastos", consulta: [Self.q("id", "eq.\(id)")], metodo: "PATCH", cuerpo: ["nombre": nombre, "descripcion": desc])
        } else {
            let j = try await exigir("rest/v1/grupos_gastos", metodo: "POST", cuerpo: ["nombre": nombre, "descripcion": desc, "creador_id": yo], representacion: true)
            guard let nuevo = ((j as? [[String: Any]])?.first ?? (j as? [String: Any]))?["id"] as? String else { throw ErrorSocial.servidor("sin id") }
            grupoId = nuevo
            miembros.insert((userId: yo, nombre: miNombre.isEmpty ? "Yo" : miNombre), at: 0)
        }
        if !miembros.isEmpty {
            let lista: [[String: Any]] = miembros.map { ["grupo_id": grupoId, "user_id": $0.userId.map { $0 as Any } ?? NSNull(), "nombre": $0.nombre] }
            _ = try await exigir("rest/v1/grupos_gastos_miembros", metodo: "POST", cuerpo: lista)
        }
        return grupoId
    }

    func salirGrupo(_ id: String) async throws {
        _ = try await exigir("rest/v1/rpc/salir_grupo_gastos", metodo: "POST", cuerpo: ["p_grupo": id])
    }

    func borrarGrupo(_ id: String) async throws {
        _ = try await exigir("rest/v1/grupos_gastos", consulta: [Self.q("id", "eq.\(id)")], metodo: "DELETE")
    }

    // ---------- gastos ----------

    private static func euros(_ c: Int) -> NSDecimalNumber { NSDecimalNumber(mantissa: UInt64(abs(c)), exponent: -2, isNegative: c < 0) }

    func guardarGasto(_ f: SocialFilaGasto, id: String?) async throws {
        let yo = try await auth.sesionValida().userId
        var fila: [String: Any] = [
            "grupo_id": f.grupoId, "tipo": f.tipo, "titulo": f.titulo, "importe": Self.euros(f.centimos), "pagado_por": f.pagadoPor,
            "modo": f.modo, "fecha": f.fecha, "categoria": f.categoria ?? NSNull(),
            "reparto": f.reparto.map { r -> [String: Any] in
                var o: [String: Any] = ["miembro": r.miembro, "importe": Self.euros(r.centimos)]
                if let p = r.partes { o["partes"] = p }
                return o
            },
        ]
        if let id {
            fila["actualizado_en"] = ISO8601DateFormatter().string(from: Date())
            _ = try await exigir("rest/v1/gastos_compartidos", consulta: [Self.q("id", "eq.\(id)")], metodo: "PATCH", cuerpo: fila)
        } else {
            fila["creado_por"] = yo
            _ = try await exigir("rest/v1/gastos_compartidos", metodo: "POST", cuerpo: fila)
        }
    }

    func borrarGasto(_ id: String) async throws {
        _ = try await exigir("rest/v1/gastos_compartidos", consulta: [Self.q("id", "eq.\(id)")], metodo: "DELETE")
    }

    // ---------- eventos ----------

    func descartarEvento(_ id: String) async throws {
        _ = try await exigir("rest/v1/eventos_compartidos", consulta: [Self.q("id", "eq.\(id)")], metodo: "DELETE")
    }
}

// 3.4 (petición de Alejandro): recomendaciones de Ocio también desde el iPhone, las mismas de la web (js/ocio.js:
// enviarRecomendacion, cargarRecomendaciones y quitarRecomendacion). Viajan con la portada para que llegue completa.
struct RecomendacionOcio: Sendable, Identifiable, Equatable {
    let id, tipo, titulo, autor, portada, anio, nota, de: String
}

extension RepositorioSocial {
    func listaAmigos() async throws -> [SocialAmigo] {
        let s = try await auth.sesionValida()
        return await amigos(s.userId)
    }

    func recomendar(a amigo: String, tipo: String, titulo: String, autor: String, portada: String, anio: String, nota: String) async throws {
        let s = try await auth.sesionValida()
        var entrada: [String: Any] = ["title": titulo]
        if !autor.isEmpty { entrada["author"] = autor }
        if portada.hasPrefix("https://") { entrada["portada"] = portada }
        if !anio.isEmpty { entrada["year"] = anio }
        let n = nota.trimmingCharacters(in: .whitespacesAndNewlines)
        _ = try await exigir("rest/v1/recomendaciones", metodo: "POST",
                             cuerpo: ["remitente_id": s.userId, "destinatario_id": amigo, "tipo": tipo, "entrada": entrada,
                                      "nota": n.isEmpty ? NSNull() as Any : n as Any])
    }

    func recomendaciones() async -> [RecomendacionOcio] {
        guard let s = try? await auth.sesionValida(),
              let f = await filas("rest/v1/recomendaciones", [Self.q("select", "id,remitente_id,tipo,entrada,nota"),
                                                              Self.q("destinatario_id", "eq.\(s.userId)"), Self.q("order", "creado_en.desc")]),
              !f.isEmpty else { return [] }
        let porId = await nombres(f.compactMap { $0["remitente_id"] as? String })
        return f.compactMap { r in
            guard let id = Self.texto(r["id"]), let tipo = r["tipo"] as? String else { return nil }
            let e = r["entrada"] as? [String: Any] ?? [:]
            return RecomendacionOcio(id: id, tipo: tipo, titulo: (e["title"] as? String) ?? "sin título", autor: (e["author"] as? String) ?? "",
                                     portada: (e["portada"] as? String) ?? "", anio: Self.texto(e["year"]) ?? "",
                                     nota: (r["nota"] as? String) ?? "", de: (r["remitente_id"] as? String).flatMap { porId[$0] } ?? "un amigo")
        }
    }

    func quitarRecomendacion(_ id: String) async throws {
        _ = try await exigir("rest/v1/recomendaciones", consulta: [Self.q("id", "eq.\(id)")], metodo: "DELETE")
    }
}
