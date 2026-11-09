import Foundation

// Lectura Finanzas (paridad con js/finanzas.js, finanzas-pro.js, presupuesto.js, suscripciones.js,
// finanzas-resumen.js). Solo lee: no materializa cargos ni programados ni guarda (eso es prepararFinanzas en la web).

struct CuentaSaldo: Sendable, Identifiable, Equatable {
    let id: String
    let nombre: String
    let saldo: Decimal
    let enSaldo: Bool
}

struct Movimiento: Sendable, Identifiable, Equatable {
    let id: String
    let fecha: String
    let hora: String
    let concepto: String
    let categoria: String
    let tipo: String
    let importe: Decimal
    let cuenta: String
    let cuentaNombre: String
    let destino: String
    let destinoNombre: String
    let futuro: Bool
    let pendienteIngreso: Bool
    let neutro: Bool
    let claveDia: String
    var categoriaId = ""
    // Para conservar compatibilidad con el editor existente.
    var enSaldo: Bool { !futuro && !pendienteIngreso }
}

struct CategoriaFin: Sendable, Identifiable, Equatable, Hashable {
    let id: String
    let nombre: String
    let tipo: String?
}

struct TotalesMes: Sendable, Equatable {
    let mes: String
    let ingresos: Decimal
    let gastos: Decimal
    var ahorro: Decimal { LecturaFinanzas.redondo(ingresos - gastos) }
    var tasaAhorro: Decimal? { ingresos > 0 ? (ingresos - gastos) / ingresos : nil }
}

struct PuntoDia: Sendable, Equatable, Identifiable {
    var id: String { fecha }
    let fecha: String
    let valor: Decimal
}

enum RangoGrafica: String, CaseIterable, Sendable, Identifiable {
    case unMes = "1m", tresMeses = "3m", anio = "1y", todo = "all"
    var id: String { rawValue }
    var etiqueta: String {
        switch self { case .unMes: return "1 mes"; case .tresMeses: return "3 meses"; case .anio: return "año"; case .todo: return "todo" }
    }
    var meses: Int? {
        switch self { case .unMes: return 1; case .tresMeses: return 3; case .anio: return 12; case .todo: return nil }
    }
}

struct PresupuestoCategoria: Sendable, Identifiable, Equatable {
    var id: String { categoryId }
    let categoryId: String
    let nombre: String
    let planned: Decimal
    let refunded: Decimal
    let spent: Decimal
    let available: Decimal
    let remaining: Decimal
    let percentage: Double
    let estado: String // normal, aviso, superado
    let lastMonth: Decimal
    let casillas: Int
}

struct PresupuestoCompromiso: Sendable, Identifiable, Equatable {
    var id: String { tipo }
    let tipo: String
    let nombre: String
    let planned: Decimal
    let charged: Decimal
    let n: Int
    let confirmados: Int
}

struct PresupuestoMes: Sendable, Equatable {
    let mes: String
    let salary: Decimal
    let contributions: Decimal
    let income: Decimal
    let manualAssigned: Decimal
    let commitmentsAssigned: Decimal
    let totalAssigned: Decimal
    let remaining: Decimal
    let categories: [PresupuestoCategoria]
    let commitments: [PresupuestoCompromiso]
    let recorded: Bool
}

struct SuscripcionVista: Sendable, Identifiable, Equatable {
    let id: String
    let titulo: String
    let importe: Decimal
    let renewalDay: Int
    let activa: Bool
    let frecuencia: String
    let proximaFecha: String?
    let equivalenteMensual: Decimal
    let cobrosTrasBaja: Int
    let logoData: String?
}

struct ActivoPatrimonio: Sendable, Identifiable, Equatable {
    let id: String
    let nombre: String
    let valor: Decimal
    let nota: String
    let porcentajeTexto: String // "sin base comparable" o porcentaje/cambio
    let clase: String // sube, baja, neutra
}

struct PatrimonioVista: Sendable, Equatable {
    var cuentas: [CuentaSaldo]
    var activos: [ActivoPatrimonio]
    var invertido: Decimal
    var emergencia: Decimal
    var vacaciones: Decimal
    var aMano: Decimal
    var totalActivos: Decimal
}

struct FiltrosMovimientos: Sendable, Equatable {
    var busqueda: String = ""
    var mes: String = "" // "" = todos
    var cuenta: String = ""
    var categoria: String = ""
    var tipo: String = "" // income/expense/transfer
}

struct GrupoDia: Sendable, Identifiable, Equatable {
    var id: String { fecha }
    let fecha: String
    let movimientos: [Movimiento]
}

struct VistaFinanzas: Sendable, Equatable {
    var cuentas: [CuentaSaldo]
    var saldoLiquido: Decimal
    var patrimonioOperativo: Decimal
    var activosTotales: Decimal
    var ingresosMes: Decimal
    var gastosMes: Decimal
    var movimientos: [Movimiento]
    var categorias: [CategoriaFin]
    var ocultar: Bool
    // 0.14
    var mesActual: String
    var mesAnterior: TotalesMes
    var totalesActual: TotalesMes
    var diferenciaFuturoPendiente: Decimal
    var historialAhorro: [TotalesMes] // meses cerrados con datos, más antiguo primero
    var mesesDisponibles: [String] // desc
    var presupuestosActual: PresupuestoMes
    var presupuestosAnterior: PresupuestoMes
    var suscripciones: [SuscripcionVista]
    var patrimonio: PatrimonioVista
}

enum LecturaFinanzas {
    static let cuentasFijas = ["efectivo", "bancos", "online"]

    static func vista(_ doc: DocumentoBitacora, hoy: LocalDay = CalendarioBitacora.madrid.dia(de: Date())) -> VistaFinanzas {
        let pro = ((try? doc.valor(de: "financePro")) ?? nil)?.objeto ?? [:]
        let perfil = ((try? doc.valor(de: "financeProfile")) ?? nil)?.objeto ?? [:]
        let invData = (try? doc.valor(de: "investmentData")) ?? nil
        let entries = ((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []

        let categorias = leerCategorias(pro)
        let nombreCat = Dictionary(categorias.map { ($0.id, $0.nombre) }, uniquingKeysWith: { a, _ in a })
        let mes = String(hoy.iso.prefix(7))
        let mesAnt = mesOffset(mes, -1)

        let (cuentas, saldos, movimientos, ingresosMes, gastosMes, diferenciaFP, mesesSet) =
            procesarTransacciones(pro: pro, hoy: hoy, mes: mes, nombreCat: nombreCat)

        let liquido = redondo(saldos.values.reduce(0, +))
        var invertidoBruto = Dinero.decimal(perfil["invested"]) ?? 0
        if invertidoBruto <= 0 { invertidoBruto = valorCartera(invData) }
        let invertido = redondo(invertidoBruto)
        let emergencia = redondo(Dinero.decimal(perfil["emergency"]) ?? 0)
        let vacaciones = redondo(Dinero.decimal(perfil["vacation"]) ?? 0)
        let aMano = (perfil["customAccounts"]?.lista ?? []).reduce(Decimal(0)) { $0 + redondo(Dinero.decimal($1["balance"]) ?? 0) }
        let operativo = redondo(liquido + invertido + emergencia)
        let activos = redondo(operativo + vacaciones + aMano)

        let totalesActual = TotalesMes(mes: mes, ingresos: redondo(ingresosMes), gastos: redondo(gastosMes))
        let totalesAnt = totalesMes(mes: mesAnt, pro: pro, nombreCat: nombreCat)
        let historial = historialAhorro(pro: pro, nombreCat: nombreCat, hastaMes: mes)

        let mesesDisponibles = mesesSet.sorted(by: >)
        let presupuestosActual = presupuestoMes(mes: mes, pro: pro, perfil: perfil, entries: entries, nombreCat: nombreCat)
        let presupuestosAnterior = presupuestoMes(mes: mesAnt, pro: pro, perfil: perfil, entries: entries, nombreCat: nombreCat)
        let suscripciones = leerSuscripciones(entries: entries, pro: pro, hoy: hoy)
        let patrimonio = leerPatrimonio(cuentas: cuentas, perfil: perfil, invData: invData, invertido: invertido, emergencia: emergencia, vacaciones: vacaciones, aMano: aMano, liquido: liquido)

        return VistaFinanzas(
            cuentas: cuentas, saldoLiquido: liquido, patrimonioOperativo: operativo, activosTotales: activos,
            ingresosMes: redondo(ingresosMes), gastosMes: redondo(gastosMes),
            movimientos: movimientos, categorias: categorias,
            ocultar: ((try? doc.valor(de: "blurFinances")) ?? nil)?.booleano == true,
            mesActual: mes, mesAnterior: totalesAnt, totalesActual: totalesActual,
            diferenciaFuturoPendiente: redondo(diferenciaFP),
            historialAhorro: historial, mesesDisponibles: mesesDisponibles,
            presupuestosActual: presupuestosActual, presupuestosAnterior: presupuestosAnterior,
            suscripciones: suscripciones, patrimonio: patrimonio)
    }

    // Serie diaria de saldo (financeSerieDiaria). Agregación por día; llamar desde Task.detached.
    static func serieDiaria(doc: DocumentoBitacora, meses: Int?, conExtras: Bool, hoy: LocalDay = CalendarioBitacora.madrid.dia(de: Date())) -> [PuntoDia] {
        let pro = ((try? doc.valor(de: "financePro")) ?? nil)?.objeto ?? [:]
        let perfil = ((try? doc.valor(de: "financeProfile")) ?? nil)?.objeto ?? [:]
        let invData = (try? doc.valor(de: "investmentData")) ?? nil
        let base = saldoLiquidoBase(pro: pro, hoy: hoy)
        let saldoActual = base + (conExtras ? extrasSaldo(perfil: perfil, invData: invData) : 0)
        let txs = (pro["transactions"]?.lista ?? []).compactMap { t -> (String, Decimal)? in
            guard let o = t.objeto, let imp = Dinero.decimal(o["amount"]), let fecha = o["date"]?.texto, !fecha.isEmpty, cuentaEnSaldo(o, hoy: hoy) else { return nil }
            let tipo = o["type"]?.texto ?? ""
            guard tipo == "income" || tipo == "expense" else { return nil }
            return (fecha, (tipo == "income" ? 1 : -1) * imp)
        }
        var porDia: [String: Decimal] = [:]
        for (f, v) in txs { porDia[f, default: 0] += v }
        let desde: LocalDay
        if let m = meses {
            let hm = YearMonth(year: hoy.year, month: hoy.month)!
            var y = hm.year, mo = hm.month - (m - 1)
            while mo <= 0 { mo += 12; y -= 1 }
            desde = LocalDay(year: y, month: mo, day: 1) ?? hoy
        } else {
            let primero = txs.map(\.0).min() ?? hoy.iso
            desde = LocalDay(iso: primero) ?? hoy
        }
        let futuras = txs.filter { $0.0 > hoy.iso }.reduce(Decimal(0)) { $0 + $1.1 }
        // Saldo inmediatamente anterior al primer día visible; después se suman
        // todos los deltas del rango, incluido el propio `desde` exactamente una vez.
        let deltasHastaHoy = txs.filter { $0.0 >= desde.iso && $0.0 <= hoy.iso }.reduce(Decimal(0)) { $0 + $1.1 }
        var s = saldoActual - futuras - deltasHastaHoy
        var cursor = desde
        var res: [PuntoDia] = []
        while cursor <= hoy {
            s = redondo(s + (porDia[cursor.iso] ?? 0))
            res.append(PuntoDia(fecha: cursor.iso, valor: s))
            cursor = cursor.sumando(dias: 1)
        }
        // incluir hoy ya cubierto; asegurar que el último es saldoActual redondeado si cuadra
        if res.isEmpty { res.append(PuntoDia(fecha: hoy.iso, valor: redondo(saldoActual))) }
        return res
    }

    static func filtrar(_ movimientos: [Movimiento], con f: FiltrosMovimientos) -> [Movimiento] {
        let q = normalizarBusqueda(f.busqueda)
        return movimientos.filter { m in
            if !f.mes.isEmpty && !m.fecha.hasPrefix(f.mes) { return false }
            if !f.cuenta.isEmpty && m.cuenta != f.cuenta && m.destino != f.cuenta { return false }
            if !f.categoria.isEmpty && m.categoriaId != f.categoria { return false }
            if !f.tipo.isEmpty && m.tipo != f.tipo { return false }
            if !q.isEmpty {
                let texto = normalizarBusqueda([m.concepto, m.categoria, m.cuentaNombre, m.destinoNombre].joined(separator: " "))
                if !texto.contains(q) { return false }
            }
            return true
        }
    }

    static func agruparPorDia(_ movimientos: [Movimiento]) -> [GrupoDia] {
        var orden: [String] = []
        var grupos: [String: [Movimiento]] = [:]
        for m in movimientos {
            let k = m.fecha.isEmpty ? "sin fecha" : m.fecha
            if grupos[k] == nil { orden.append(k); grupos[k] = [] }
            grupos[k]!.append(m)
        }
        return orden.map { GrupoDia(fecha: $0, movimientos: grupos[$0] ?? []) }
    }

    static func mesOffset(_ mes: String, _ delta: Int) -> String {
        let p = mes.split(separator: "-")
        guard p.count == 2, let y = Int(p[0]), let m = Int(p[1]) else { return mes }
        var ny = y, nm = m + delta
        while nm <= 0 { nm += 12; ny -= 1 }
        while nm > 12 { nm -= 12; ny += 1 }
        return String(format: "%04d-%02d", ny, nm)
    }

    static func etiquetaMes(_ mes: String) -> String {
        let nombres = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        let p = mes.split(separator: "-")
        guard p.count == 2, let m = Int(p[1]), m >= 1, m <= 12 else { return mes }
        return nombres[m] + " " + String(p[0])
    }

    // --- internos ---

    private static func procesarTransacciones(pro: [String: JSONValue], hoy: LocalDay, mes: String, nombreCat: [String: String])
    -> ([CuentaSaldo], [String: Decimal], [Movimiento], Decimal, Decimal, Decimal, Set<String>) {
        let cuentasJSON = pro["accounts"]?.objeto ?? [:]
        var claves = cuentasFijas
        for k in cuentasJSON.keys.sorted() where !claves.contains(k) { claves.append(k) }
        var saldos: [String: Decimal] = [:]
        for k in claves { saldos[k] = Dinero.decimal(cuentasJSON[k]?["balance0"]) ?? 0 }
        let nombreCuenta: (String) -> String = { k in cuentasJSON[k]?["name"]?.texto ?? (k.isEmpty ? "" : k.prefix(1).uppercased() + String(k.dropFirst())) }

        var ingresos: Decimal = 0, gastos: Decimal = 0, diferenciaFP: Decimal = 0
        var movimientos: [Movimiento] = []
        var mesesSet = Set<String>()

        for t in pro["transactions"]?.lista ?? [] {
            guard let o = t.objeto, let importe = Dinero.decimal(o["amount"]) else { continue }
            let tipo = o["type"]?.texto ?? ""
            let fecha = o["date"]?.texto ?? ""
            if fecha.count >= 7 { mesesSet.insert(String(fecha.prefix(7))) }
            let cuenta = o["account"]?.texto ?? ""
            let destinoId = o["transferTo"]?.texto ?? ""
            let futuro = !fecha.isEmpty && fecha > hoy.iso
            let pendienteIngreso = o["pendiente"]?.booleano == true && tipo == "income"
            let enSaldo = !futuro && !pendienteIngreso
            if !enSaldo {
                // Diferencia futuro/pendiente: efecto neto sobre liquidez cuando entre/salga.
                if tipo == "income" { diferenciaFP += importe }
                else if tipo == "expense" { diferenciaFP -= importe }
                else if tipo == "transfer" { /* neutro en líquido total */ }
            }
            if enSaldo {
                if tipo == "transfer" {
                    if saldos[cuenta] != nil { saldos[cuenta]! -= importe }
                    if !destinoId.isEmpty, saldos[destinoId] != nil { saldos[destinoId]! += importe }
                } else if saldos[cuenta] != nil {
                    saldos[cuenta]! += tipo == "income" ? importe : -importe
                }
            }
            let neut = neutro(o, nombreCat)
            if fecha.hasPrefix(mes), enSaldo, (tipo == "income" || tipo == "expense"), !neut {
                if tipo == "income" { ingresos += importe } else { gastos += importe }
            }
            let catId = o["category"]?.texto ?? ""
            let concepto = [o["note"], o["description"], o["concepto"]].compactMap { $0?.texto }.first { !$0.isEmpty } ?? ""
            let hora = o["hora"]?.texto ?? ""
            movimientos.append(Movimiento(id: o["id"]?.comoId ?? UUID().uuidString, fecha: fecha, hora: hora, concepto: concepto,
                                          categoria: nombreCat[catId] ?? "", tipo: tipo, importe: importe, cuenta: cuenta,
                                          cuentaNombre: nombreCuenta(cuenta), destino: destinoId, destinoNombre: nombreCuenta(destinoId),
                                          futuro: futuro, pendienteIngreso: pendienteIngreso, neutro: neut,
                                          claveDia: claveDia(o), categoriaId: catId))
        }
        movimientos.sort { ($0.fecha, $0.claveDia, $0.id) > ($1.fecha, $1.claveDia, $1.id) }
        let cuentas = claves.map { k in
            CuentaSaldo(id: k, nombre: cuentasJSON[k]?["name"]?.texto ?? (k.prefix(1).uppercased() + String(k.dropFirst())), saldo: redondo(saldos[k] ?? 0), enSaldo: true)
        }
        return (cuentas, saldos, movimientos, ingresos, gastos, diferenciaFP, mesesSet)
    }

    static func totalesMes(mes: String, pro: [String: JSONValue], nombreCat: [String: String]) -> TotalesMes {
        var ing: Decimal = 0, gas: Decimal = 0
        for t in pro["transactions"]?.lista ?? [] {
            guard let o = t.objeto, let imp = Dinero.decimal(o["amount"]) else { continue }
            let tipo = o["type"]?.texto ?? ""
            guard tipo == "income" || tipo == "expense", (o["date"]?.texto ?? "").hasPrefix(mes), !neutro(o, nombreCat) else { continue }
            if tipo == "income" { ing += imp } else { gas += imp }
        }
        return TotalesMes(mes: mes, ingresos: redondo(ing), gastos: redondo(gas))
    }

    static func historialAhorro(pro: [String: JSONValue], nombreCat: [String: String], hastaMes: String) -> [TotalesMes] {
        let txs = pro["transactions"]?.lista ?? []
        let primero = txs.compactMap { $0["date"]?.texto }.filter { $0.count >= 7 }.map { String($0.prefix(7)) }.min() ?? hastaMes
        var res: [TotalesMes] = []
        var m = primero
        while m < hastaMes {
            let t = totalesMes(mes: m, pro: pro, nombreCat: nombreCat)
            if t.ingresos != 0 || t.gastos != 0 { res.append(t) }
            m = mesOffset(m, 1)
            if res.count > 120 { break }
        }
        return res
    }

    private static func saldoLiquidoBase(pro: [String: JSONValue], hoy: LocalDay) -> Decimal {
        let cuentasJSON = pro["accounts"]?.objeto ?? [:]
        var claves = cuentasFijas
        for k in cuentasJSON.keys.sorted() where !claves.contains(k) { claves.append(k) }
        var saldos: [String: Decimal] = [:]
        for k in claves { saldos[k] = Dinero.decimal(cuentasJSON[k]?["balance0"]) ?? 0 }
        for t in pro["transactions"]?.lista ?? [] {
            guard let o = t.objeto, let imp = Dinero.decimal(o["amount"]), cuentaEnSaldo(o, hoy: hoy) else { continue }
            let tipo = o["type"]?.texto ?? "", cuenta = o["account"]?.texto ?? ""
            if tipo == "transfer" {
                if saldos[cuenta] != nil { saldos[cuenta]! -= imp }
                if let dest = o["transferTo"]?.texto, saldos[dest] != nil { saldos[dest]! += imp }
            } else if saldos[cuenta] != nil {
                saldos[cuenta]! += tipo == "income" ? imp : -imp
            }
        }
        return saldos.values.reduce(0, +)
    }

    private static func extrasSaldo(perfil: [String: JSONValue], invData: JSONValue?) -> Decimal {
        var invertidoBruto = Dinero.decimal(perfil["invested"]) ?? 0
        if invertidoBruto <= 0 { invertidoBruto = valorCartera(invData) }
        return redondo(invertidoBruto) + redondo(Dinero.decimal(perfil["emergency"]) ?? 0)
    }

    static func cuentaEnSaldo(_ o: [String: JSONValue], hoy: LocalDay) -> Bool {
        let fecha = o["date"]?.texto ?? ""
        let futuro = !fecha.isEmpty && fecha > hoy.iso
        let pendienteIngreso = o["pendiente"]?.booleano == true && (o["type"]?.texto ?? "") == "income"
        return !futuro && !pendienteIngreso
    }

    // --- presupuestos ---
    static func presupuestoMes(mes: String, pro: [String: JSONValue], perfil: [String: JSONValue], entries: [JSONValue], nombreCat: [String: String]) -> PresupuestoMes {
        let history = perfil["budgetHistory"]?.lista ?? []
        let recorded = history.first { $0["month"]?.texto == mes }?.objeto
        let plan = recorded ?? planParaVer(mes: mes, perfil: perfil)
        let allocations = plan["allocations"]?.lista ?? []
        let salary = Dinero.decimal(plan["salary"]) ?? 0
        let contributionsPlanned = Dinero.decimal(plan["contributions"]) ?? 0
        let contributionsReal = (pro["transactions"]?.lista ?? []).reduce(Decimal(0)) { s, t in
            guard let o = t.objeto, o["type"]?.texto == "income", (o["date"]?.texto ?? "").hasPrefix(mes), !neutro(o, nombreCat) else { return s }
            let catNombre = (nombreCat[o["category"]?.texto ?? ""] ?? "").folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES"))
            guard catNombre.range(of: "aportaci", options: .caseInsensitive) != nil else { return s }
            return s + (Dinero.decimal(o["amount"]) ?? 0)
        }
        let contributions = max(contributionsPlanned, redondo(contributionsReal))
        let income = redondo(salary + contributions)
        var porCat: [String: [(JSONValue, Decimal)]] = [:]
        var commitmentsAssigned: Decimal = 0
        var manualAssigned: Decimal = 0
        var compromisos: [PresupuestoCompromiso] = []
        for a in allocations {
            let auto = a["auto"]?.texto
            let amt = Dinero.decimal(a["amount"]) ?? 0
            if let auto {
                commitmentsAssigned += amt
                let lista = entries.filter { $0["type"]?.texto == auto && $0["active"]?.booleano != false }
                let confirmados = lista.filter { estadoRecurrenteMes($0, mes: mes) == "banco" }.count
                let charged = cargoAuto(tipo: auto, mes: mes, pro: pro)
                let nombre = a["label"]?.texto ?? (auto == "subscription" ? "suscripciones" : "gastos fijos")
                compromisos.append(PresupuestoCompromiso(tipo: auto, nombre: nombre, planned: redondo(amt), charged: redondo(charged), n: lista.count, confirmados: confirmados))
            } else {
                manualAssigned += amt
                if let catId = a["categoryId"]?.texto, !catId.isEmpty { porCat[catId, default: []].append((a, amt)) }
            }
        }
        manualAssigned = redondo(manualAssigned); commitmentsAssigned = redondo(commitmentsAssigned)
        let mesAnt = mesOffset(mes, -1)
        var cats: [PresupuestoCategoria] = []
        for (catId, l) in porCat {
            let planned = redondo(l.reduce(Decimal(0)) { $0 + $1.1 })
            let refunded = redondo(categoryRefunds(catId: catId, mes: mes, pro: pro))
            let spent = redondo(categoryExpense(catId: catId, mes: mes, pro: pro))
            let available = redondo(planned + refunded)
            let remaining = redondo(available - spent)
            let pct = available > 0 ? NSDecimalNumber(decimal: spent / available * 100).doubleValue : (spent > 0 ? 100.0 : 0.0)
            let estado = remaining < 0 ? "superado" : pct >= 80 ? "aviso" : "normal"
            let lastMonth = redondo(categoryExpense(catId: catId, mes: mesAnt, pro: pro))
            let nombre = nombreCat[catId] ?? l.first?.0["label"]?.texto ?? "categoría"
            cats.append(PresupuestoCategoria(categoryId: catId, nombre: nombre, planned: planned, refunded: refunded, spent: spent, available: available, remaining: remaining, percentage: pct, estado: estado, lastMonth: lastMonth, casillas: l.count))
        }
        cats.sort { $0.planned > $1.planned }
        let total = redondo(manualAssigned + commitmentsAssigned)
        return PresupuestoMes(mes: mes, salary: redondo(salary), contributions: redondo(contributions), income: income,
                              manualAssigned: manualAssigned, commitmentsAssigned: commitmentsAssigned, totalAssigned: total,
                              remaining: redondo(income - total), categories: cats, commitments: compromisos, recorded: recorded != nil)
    }

    private static func planParaVer(mes: String, perfil: [String: JSONValue]) -> [String: JSONValue] {
        let planes = perfil["budgetPlans"]?.objeto ?? [:]
        if let p = planes[mes]?.objeto { return p }
        let anterior = mesOffset(mes, -1)
        if let p = planes[anterior]?.objeto {
            var copia = p
            let al = (p["allocations"]?.lista ?? []).filter { $0["auto"]?.texto == nil || (Dinero.decimal($0["amount"]) ?? 0) > 0 }
            copia["allocations"] = .array(al)
            return copia
        }
        return ["salary": .number("0"), "contributions": .number("0"), "allocations": .array([])]
    }

    private static func categoryExpense(catId: String, mes: String, pro: [String: JSONValue]) -> Decimal {
        (pro["transactions"]?.lista ?? []).reduce(Decimal(0)) { s, t in
            guard let o = t.objeto, o["type"]?.texto == "expense", o["category"]?.texto == catId, (o["date"]?.texto ?? "").hasPrefix(mes),
                  o["viaje"]?.booleano != true, !fueraDeCategoria(o) else { return s }
            return s + (Dinero.decimal(o["amount"]) ?? 0)
        }
    }
    private static func categoryRefunds(catId: String, mes: String, pro: [String: JSONValue]) -> Decimal {
        (pro["transactions"]?.lista ?? []).reduce(Decimal(0)) { s, t in
            guard let o = t.objeto, o["type"]?.texto == "income", o["category"]?.texto == catId, (o["date"]?.texto ?? "").hasPrefix(mes),
                  o["viaje"]?.booleano != true, !fueraDeCategoria(o) else { return s }
            return s + (Dinero.decimal(o["amount"]) ?? 0)
        }
    }
    private static func fueraDeCategoria(_ o: [String: JSONValue]) -> Bool {
        o["ahorro"]?.booleano == true || o["ajuste"]?.booleano == true || (o["id"]?.comoId ?? "").hasPrefix("ptx_adj_")
    }
    private static func cargoAuto(tipo: String, mes: String, pro: [String: JSONValue]) -> Decimal {
        (pro["transactions"]?.lista ?? []).reduce(Decimal(0)) { s, t in
            guard let o = t.objeto, o["type"]?.texto == "expense", (o["date"]?.texto ?? "").hasPrefix(mes),
                  o["ajuste"]?.booleano != true, (o["id"]?.comoId ?? "").hasPrefix("ptx_adj_") == false else { return s }
            let auto = esAuto(o) ? "subscription" : (o["programadoId"] != nil && o["programadoId"] != .null ? "fixed_expense" : nil)
            return auto == tipo ? s + (Dinero.decimal(o["amount"]) ?? 0) : s
        }
    }
    private static func esAuto(_ o: [String: JSONValue]) -> Bool {
        if o["recurringEntryId"] != nil && o["recurringEntryId"] != .null { return true }
        return (o["id"]?.comoId ?? "").hasPrefix("ptx_auto_")
    }
    private static func estadoRecurrenteMes(_ e: JSONValue, mes: String) -> String {
        return e["mesesPagados"]?[mes]?["estado"]?.texto ?? "no_cobrado"
    }

    // --- suscripciones ---
    static func leerSuscripciones(entries: [JSONValue], pro: [String: JSONValue], hoy: LocalDay) -> [SuscripcionVista] {
        let subs = entries.filter { $0["type"]?.texto == "subscription" }
        var res: [SuscripcionVista] = []
        for e in subs {
            let o = e.objeto ?? [:]
            let id = o["id"]?.comoId ?? UUID().uuidString
            let titulo = o["title"]?.texto ?? ""
            let importe = Dinero.decimal(o["amount"]) ?? 0
            let renewalDay = max(1, NSDecimalNumber(decimal: Dinero.decimal(o["renewalDay"]) ?? 1).intValue)
            let activa = suscripcionVigente(o, fecha: hoy.iso) && o["active"]?.booleano != false
            let proxima = proximaFechaSuscripcion(renewalDay: renewalDay, activa: o["active"]?.booleano != false && suscripcionVigente(o, fecha: hoy.iso), hoy: hoy)
            let logo = o["logo"]?.texto.flatMap { $0.hasPrefix("data:image/") ? $0 : nil }
            let cobros = suscripcionBajaAbierta(o) != nil ? cobrosTrasBaja(o, pro: pro).count : 0
            res.append(SuscripcionVista(id: id, titulo: titulo, importe: redondo(importe), renewalDay: renewalDay, activa: activa,
                                        frecuencia: "mensual", proximaFecha: proxima, equivalenteMensual: redondo(importe),
                                        cobrosTrasBaja: cobros, logoData: logo))
        }
        res.sort { a, b in
            if a.activa != b.activa { return a.activa }
            return (a.proximaFecha ?? "9999") < (b.proximaFecha ?? "9999")
        }
        return res
    }

    static func suscripcionVigente(_ o: [String: JSONValue], fecha: String) -> Bool {
        if let alta = o["altaDesde"]?.texto, !alta.isEmpty, fecha < alta { return false }
        let bajas = o["bajas"]?.lista ?? []
        if bajas.contains(where: { b in
            guard let desde = b["desde"]?.texto, fecha >= desde else { return false }
            let hasta = b["hasta"]?.texto
            return hasta == nil || hasta!.isEmpty || fecha < hasta!
        }) { return false }
        if o["active"]?.booleano == false, !bajas.contains(where: { ($0["hasta"]?.texto ?? "").isEmpty && $0["desde"] != nil }) { return false }
        return true
    }
    static func suscripcionBajaAbierta(_ o: [String: JSONValue]) -> JSONValue? {
        (o["bajas"]?.lista ?? []).first { ($0["hasta"]?.texto ?? "").isEmpty && $0["desde"] != nil }
    }
    private static func proximaFechaSuscripcion(renewalDay: Int, activa: Bool, hoy: LocalDay) -> String? {
        guard activa else { return nil }
        let ym = YearMonth(year: hoy.year, month: hoy.month)!
        for k in 0..<2 {
            var y = ym.year, m = ym.month + k
            while m > 12 { m -= 12; y += 1 }
            let siguienteY = m == 12 ? y + 1 : y
            let siguienteM = m == 12 ? 1 : m + 1
            let diasMes = LocalDay(year: siguienteY, month: siguienteM, day: 1)!.sumando(dias: -1).day
            if let d = LocalDay(year: y, month: m, day: min(renewalDay, diasMes)), d.iso >= hoy.iso { return d.iso }
        }
        return nil
    }
    private static func cobrosTrasBaja(_ o: [String: JSONValue], pro: [String: JSONValue]) -> [String] {
        guard let baja = suscripcionBajaAbierta(o)?.objeto, let desde = baja["desde"]?.texto else { return [] }
        let vistos = Set((o["cobrosVistos"]?.lista ?? []).compactMap { $0.comoId ?? $0.texto })
        let importe = Dinero.decimal(o["amount"]) ?? 0
        let margen = max(Decimal(string: "1")!, importe * Decimal(string: "0.15")!)
        return (pro["transactions"]?.lista ?? []).compactMap { t -> String? in
            guard let x = t.objeto, x["type"]?.texto == "expense", let fecha = x["date"]?.texto, fecha >= desde, let id = x["id"]?.comoId, !vistos.contains(id),
                  x["ajuste"]?.booleano != true, (x["id"]?.comoId ?? "").hasPrefix("ptx_adj_") == false else { return nil }
            let amt = Dinero.decimal(x["amount"]) ?? 0
            let diff = amt > importe ? amt - importe : importe - amt
            guard diff <= margen else { return nil }
            // coincidencia laxa por id enlazado o por nota/título - suficiente para aviso de lectura
            if x["recurringEntryId"]?.comoId == o["id"]?.comoId { return id }
            let nota = normalizarBusqueda([x["note"], x["bankNote"], x["description"]].compactMap { $0?.texto }.joined(separator: " "))
            let titulo = normalizarBusqueda(o["title"]?.texto ?? "")
            return !titulo.isEmpty && nota.contains(String(titulo.prefix(min(8, titulo.count)))) ? id : nil
        }
    }

    // --- patrimonio ---
    static func leerPatrimonio(cuentas: [CuentaSaldo], perfil: [String: JSONValue], invData: JSONValue?, invertido: Decimal, emergencia: Decimal, vacaciones: Decimal, aMano: Decimal, liquido: Decimal) -> PatrimonioVista {
        var activos: [ActivoPatrimonio] = []
        // cuentas líquidas: variación 30 días no es trivial sin histórico completo por día/cuenta aquí; usamos "en directo"
        for c in cuentas { activos.append(ActivoPatrimonio(id: "c_" + c.id, nombre: c.nombre.lowercased(), valor: c.saldo, nota: "en directo.", porcentajeTexto: "", clase: "neutra")) }
        let invAccounts = perfil["investmentAccounts"]?.lista ?? []
        if !invAccounts.isEmpty {
            for a in invAccounts {
                let nombre = a["name"]?.texto ?? "inversión"
                let conValor = (a["contributions"]?.lista ?? []).filter { $0["value"] != nil && $0["value"] != .null && ($0["value"]?.texto ?? "x") != "" }
                    .sorted { ($0["month"]?.texto ?? "") < ($1["month"]?.texto ?? "") }
                let valor = conValor.last.flatMap { Dinero.decimal($0["value"]) } ?? (a["contributions"]?.lista ?? []).reduce(Decimal(0)) { $0 + (Dinero.decimal($1["amount"]) ?? 0) }
                let aportado = (a["contributions"]?.lista ?? []).reduce(Decimal(0)) { $0 + (Dinero.decimal($1["amount"]) ?? 0) }
                let (texto, clase) = porcentajePatrimonio(valor: valor, base: aportado, notaBase: "rentabilidad")
                activos.append(ActivoPatrimonio(id: a["id"]?.comoId ?? nombre, nombre: nombre.lowercased(), valor: redondo(valor), nota: aportado > 0 ? "rentabilidad." : "último mes.", porcentajeTexto: texto, clase: clase))
            }
        } else if invertido > 0 {
            activos.append(ActivoPatrimonio(id: "inv", nombre: "inversión", valor: invertido, nota: "", porcentajeTexto: "sin base comparable", clase: "neutra"))
        }
        if emergencia > 0 {
            let hist = (perfil["history"]?.lista ?? []).filter { ($0["month"]?.texto ?? "") < YearMonth(year: CalendarioBitacora.madrid.dia(de: Date()).year, month: CalendarioBitacora.madrid.dia(de: Date()).month)!.description && (Dinero.decimal($0["emergency"]) ?? 0) > 0 }
                .sorted { ($0["month"]?.texto ?? "") > ($1["month"]?.texto ?? "") }
            let prev = hist.first.flatMap { Dinero.decimal($0["emergency"]) }
            let (texto, clase) = porcentajePatrimonio(valor: emergencia, base: prev ?? 0, notaBase: "último mes")
            activos.append(ActivoPatrimonio(id: "emergencia", nombre: "fondo de emergencia", valor: emergencia, nota: "último mes.", porcentajeTexto: texto, clase: clase))
        }
        let total = redondo(liquido + invertido + emergencia + vacaciones + aMano)
        return PatrimonioVista(cuentas: cuentas, activos: activos, invertido: invertido, emergencia: emergencia, vacaciones: vacaciones, aMano: aMano, totalActivos: total)
    }

    private static func porcentajePatrimonio(valor: Decimal, base: Decimal, notaBase: String) -> (String, String) {
        guard base >= 50 else {
            let cambio = valor - base
            if abs(NSDecimalNumber(decimal: cambio).doubleValue) < 0.5 { return ("", "neutra") }
            let txt = Dinero.formato(cambio >= 0 ? cambio : -cambio)
            return ((cambio >= 0 ? "+" : "−") + txt, cambio >= 0 ? "sube" : "baja")
        }
        let pct = NSDecimalNumber(decimal: (valor - base) / base * 100).doubleValue
        if !pct.isFinite { return ("sin base comparable", "neutra") }
        let clase = abs(pct) < 0.05 ? "neutra" : (pct > 0 ? "sube" : "baja")
        let txt = String(format: "%@%.1f %%", pct > 0 ? "+" : (pct < 0 ? "−" : ""), abs(pct)).replacingOccurrences(of: ".", with: ",")
        return (txt, clase)
    }

    // --- utilidades compartidas ---
    static func leerCategorias(_ pro: [String: JSONValue]) -> [CategoriaFin] {
        (pro["categories"]?.lista ?? []).compactMap { c -> CategoriaFin? in
            guard let id = c["id"]?.comoId else { return nil }
            return CategoriaFin(id: id, nombre: c["name"]?.texto ?? id, tipo: c["type"]?.texto)
        }
    }

    static func valorCartera(_ datos: JSONValue?) -> Decimal {
        (datos?["funds"]?.lista ?? []).reduce(Decimal(0)) { total, f in
            let vals = (f["valuations"]?.lista ?? []).sorted { ($0["date"]?.texto ?? "") < ($1["date"]?.texto ?? "") }
            if let ultima = vals.last { return total + (Dinero.decimal(ultima["value"]) ?? 0) }
            return total + (f["contributions"]?.lista ?? []).reduce(Decimal(0)) { $0 + (Dinero.decimal($1["amount"]) ?? 0) }
        }
    }

    static func claveDia(_ o: [String: JSONValue]) -> String {
        if let h = o["hora"]?.texto, !h.isEmpty { return h }
        guard let orden = o["orden"], orden != .null, let n = Dinero.decimal(orden) else { return "" }
        let txt = NSDecimalNumber(decimal: n).stringValue
        return "o" + String(repeating: "0", count: max(0, 6 - txt.count)) + txt
    }

    static func neutro(_ o: [String: JSONValue], _ nombres: [String: String]) -> Bool {
        if o["ahorro"]?.booleano == true || o["ajuste"]?.booleano == true || (o["id"]?.comoId ?? "").hasPrefix("ptx_adj_") { return true }
        let cat = o["category"]?.texto ?? ""
        if cat == "cat_inversion_gasto" || cat == "cat_inversion_ing" { return true }
        let nombre = (nombres[cat] ?? "").folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES"))
        return nombre.trimmingCharacters(in: .whitespaces) == "inversiones"
    }

    static func redondo(_ d: Decimal) -> Decimal { Dinero.redondeado(d) }

    static func normalizarBusqueda(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
