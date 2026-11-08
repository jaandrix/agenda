import Foundation

struct CuentaSaldo: Sendable, Identifiable, Equatable {
    let id: String
    let nombre: String
    let saldo: Decimal
}

struct Movimiento: Sendable, Identifiable, Equatable {
    let id: String
    let fecha: String
    let concepto: String
    let categoria: String
    let tipo: String
    let importe: Decimal
    let cuenta: String
    let futuro: Bool
}

struct CategoriaFin: Sendable, Identifiable, Equatable, Hashable {
    let id: String
    let nombre: String
    let tipo: String?
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
}

// Mismas reglas que js/finanzas.js y finanzas-pro.js (financeProSaldos, financeProCuentaEnSaldo, financeProNeutro,
// saldoLiquido, patrimonioOperativo, activosTotales). Solo lee: no materializa cargos ni programados (eso es
// prepararFinanzas en la web). Diferencia conocida: si `financeProfile.invested` es 0, la web lo rellena en memoria con
// el valor de la cartera; aquí cuenta 0.
enum LecturaFinanzas {
    static let cuentasFijas = ["efectivo", "bancos", "online"]

    static func vista(_ doc: DocumentoBitacora, hoy: LocalDay = CalendarioBitacora.madrid.dia(de: Date())) -> VistaFinanzas {
        let pro = ((try? doc.valor(de: "financePro")) ?? nil)?.objeto ?? [:]
        let perfil = ((try? doc.valor(de: "financeProfile")) ?? nil)?.objeto ?? [:]
        let cuentasJSON = pro["accounts"]?.objeto ?? [:]
        var claves = cuentasFijas
        for k in cuentasJSON.keys.sorted() where !claves.contains(k) { claves.append(k) }
        var saldos: [String: Decimal] = [:]
        for k in claves { saldos[k] = Dinero.decimal(cuentasJSON[k]?["balance0"]) ?? 0 }

        let categorias = (pro["categories"]?.lista ?? []).compactMap { c -> CategoriaFin? in
            guard let id = c["id"]?.comoId else { return nil }
            return CategoriaFin(id: id, nombre: c["name"]?.texto ?? id, tipo: c["type"]?.texto)
        }
        let nombreCat = Dictionary(categorias.map { ($0.id, $0.nombre) }, uniquingKeysWith: { a, _ in a })
        let mes = String(hoy.iso.prefix(7))
        var ingresos: Decimal = 0, gastos: Decimal = 0
        var movimientos: [Movimiento] = []

        for t in pro["transactions"]?.lista ?? [] {
            guard let o = t.objeto, let importe = Dinero.decimal(o["amount"]) else { continue }
            let tipo = o["type"]?.texto ?? ""
            let fecha = o["date"]?.texto ?? ""
            let cuenta = o["account"]?.texto ?? ""
            let futuro = !fecha.isEmpty && fecha > hoy.iso
            let enSaldo = !futuro && !(o["pendiente"]?.booleano == true && tipo == "income")
            if enSaldo {
                if tipo == "transfer" {
                    if saldos[cuenta] != nil { saldos[cuenta]! -= importe }
                    if let destino = o["transferTo"]?.texto, saldos[destino] != nil { saldos[destino]! += importe }
                } else if saldos[cuenta] != nil {
                    saldos[cuenta]! += tipo == "income" ? importe : -importe
                }
            }
            if fecha.hasPrefix(mes), enSaldo, (tipo == "income" || tipo == "expense"), !neutro(o, nombreCat) {
                if tipo == "income" { ingresos += importe } else { gastos += importe }
            }
            let catId = o["category"]?.texto ?? ""
            let concepto = [o["note"], o["description"], o["concepto"]].compactMap { $0?.texto }.first { !$0.isEmpty } ?? ""
            movimientos.append(Movimiento(id: o["id"]?.comoId ?? UUID().uuidString, fecha: fecha, concepto: concepto,
                                          categoria: nombreCat[catId] ?? "", tipo: tipo, importe: importe, cuenta: cuenta, futuro: futuro))
        }
        movimientos.sort { $0.fecha > $1.fecha }

        let cuentas = claves.map { k in
            CuentaSaldo(id: k, nombre: cuentasJSON[k]?["name"]?.texto ?? k.prefix(1).uppercased() + String(k.dropFirst()), saldo: redondo(saldos[k] ?? 0))
        }
        let liquido = redondo(saldos.values.reduce(0, +))
        let invertido = redondo(Dinero.decimal(perfil["invested"]) ?? 0)
        let emergencia = redondo(Dinero.decimal(perfil["emergency"]) ?? 0)
        let vacaciones = redondo(Dinero.decimal(perfil["vacation"]) ?? 0)
        let aMano = (perfil["customAccounts"]?.lista ?? []).reduce(Decimal(0)) { $0 + redondo(Dinero.decimal($1["balance"]) ?? 0) }
        let operativo = redondo(liquido + invertido + emergencia)
        return VistaFinanzas(cuentas: cuentas, saldoLiquido: liquido, patrimonioOperativo: operativo,
                             activosTotales: redondo(operativo + vacaciones + aMano), ingresosMes: redondo(ingresos), gastosMes: redondo(gastos),
                             movimientos: Array(movimientos.prefix(60)), categorias: categorias,
                             ocultar: ((try? doc.valor(de: "blurFinances")) ?? nil)?.booleano == true)
    }

    // financeProNeutro: ahorro, ajuste de saldo o la categoría «Inversiones» no son ingreso ni gasto.
    static func neutro(_ o: [String: JSONValue], _ nombres: [String: String]) -> Bool {
        if o["ahorro"]?.booleano == true || o["ajuste"]?.booleano == true || (o["id"]?.comoId ?? "").hasPrefix("ptx_adj_") { return true }
        let cat = o["category"]?.texto ?? ""
        if cat == "cat_inversion_gasto" || cat == "cat_inversion_ing" { return true }
        let nombre = (nombres[cat] ?? "").folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES"))
        return nombre.trimmingCharacters(in: .whitespaces) == "inversiones"
    }

    // finRedondo: céntimos, la mitad hacia arriba.
    static func redondo(_ d: Decimal) -> Decimal {
        var x = d, r = Decimal()
        NSDecimalRound(&r, &x, 2, .plain)
        return r
    }
}
