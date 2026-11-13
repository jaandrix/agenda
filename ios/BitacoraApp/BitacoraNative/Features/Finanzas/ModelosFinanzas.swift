import Foundation

// Lo que devuelve finanzas-puente.js para cada pestaña. Las cifras son las de la web (Number de JavaScript): solo se
// enseñan. Nada de lo que se escribe pasa por aquí (las escrituras van por CambioFinanzas, con el JSON tal cual).

enum PestanaFinanzas: String, CaseIterable, Identifiable {
    // El orden de las pestañas de la PWA (renderMobileFinances): cuentas, planificación, movimientos, resumen.
    case cuentas, planificacion, movimientos, resumen
    var id: String { rawValue }
    var titulo: String { self == .planificacion ? "planificación." : rawValue + "." }
}

struct PuntoSerie: Decodable, Equatable {
    let fecha: String
    let valor: Double
    init(from d: Decoder) throws {
        var c = try d.unkeyedContainer()
        fecha = try c.decode(String.self)
        valor = try c.decode(Double.self)
    }
}

struct FilaMov: Decodable, Identifiable, Equatable {
    let id, fecha, dia, tipo, titulo, meta, cifra, cuenta, destino, categoria, nota, hora, icono, color, categoriaNombre: String
    let pendiente, futuro, neutro, revisar: Bool
    let importe: Double

    // Para el editor de movimientos (que escribe con su propia operación).
    var movimiento: Movimiento {
        Movimiento(id: id, fecha: fecha, hora: hora, concepto: nota, categoria: "", tipo: tipo,
                   importe: Decimal(string: cifra, locale: Locale(identifier: "en_US_POSIX")) ?? 0, cuenta: cuenta, cuentaNombre: "",
                   destino: destino, destinoNombre: "", futuro: futuro, pendienteIngreso: pendiente && tipo == "income", neutro: neutro,
                   claveDia: hora, categoriaId: categoria)
    }
}

struct PorAjustar: Decodable, Equatable {
    struct Incidencia: Decodable, Equatable { let nota, motivo: String }
    let n: Int
    let incidencias: [Incidencia]
}

struct GraficaFin: Decodable, Equatable {
    struct Rango: Decodable, Equatable, Identifiable { let key, corto, largo: String; var id: String { key } }
    let rango: String
    let rangos: [Rango]
    let extras, tieneExtras: Bool
    let inversionDesde, titulo, sub, periodo: String
    let total, cambio: Double
    let serie: [PuntoSerie]
}

struct ModeloCuentas: Decodable, Equatable {
    struct Aviso: Decodable, Equatable { let nombre: String; let pct: Int; let queda: Double; let dias: Int }
    struct SigueCobrando: Decodable, Equatable, Identifiable { let id, titulo, desde, fecha: String; let n: Int; let importe: Double }
    struct Propuesta: Decodable, Equatable, Identifiable { let clave, nombre: String; let importe: Double; let dia, meses: Int; var id: String { clave } }
    struct Detectadas: Decodable, Equatable { let siguenCobrando: [SigueCobrando]; let propuestas: [Propuesta] }
    struct Ritmo: Decodable, Equatable { let gasto, antes, dif: Double; let dia: Int; let mesPasado: String; let previsto: Double? }
    struct Cuenta: Decodable, Equatable, Identifiable { let id, nombre: String; let saldo: Double }
    struct Cargo: Decodable, Equatable, Identifiable { let id, titulo, cuando: String; let importe: Double }
    struct Cargos: Decodable, Equatable { let total: Double; let lista: [Cargo] }
    let grafica: GraficaFin
    let porAjustar: PorAjustar
    let avisosPresupuesto: [Aviso]
    let detectadas: Detectadas
    let ingresos, gastos, ratio: Double
    let ritmo: Ritmo?
    let cuentas: [Cuenta]
    let cargos: Cargos
    let ultimos: [FilaMov]
}

struct ModeloMovimientos: Decodable, Equatable {
    let total: Int
    let porAjustar: PorAjustar
    let filas: [FilaMov]
    let anioActual: Int
}

struct ModeloPlanificacion: Decodable, Equatable {
    struct Categoria: Decodable, Equatable, Identifiable {
        let id, nombre, status, estado, color, icono: String
        let planned, spent, available, refunded, lastMonth, percentage, remaining: Double
        let casillas: Int
    }
    struct Otro: Decodable, Equatable { let label: String; let amount: Double }
    let ingresos: Double
    let categorias: [Categoria]
    let otros: [Otro]
}

struct ModeloResumen: Decodable, Equatable {
    struct Mes: Decodable, Equatable { let nombre: String; let entra, sale, sueldo, falta: Double }
    struct MesAhorro: Decodable, Equatable { let nombre: String; let anio: Int; let tasa: Double? }
    struct Ahorro: Decodable, Equatable { let meses: [MesAhorro]; let media: Double?; let enCurso: MesAhorro; let anioActual: Int }
    struct Objetivo: Decodable, Equatable {
        let puntos: [PuntoSerie]
        let actual, ritmo, objetivo: Double
        let mesesHasta: Int?
        let conseguido: Bool
        let fecha: String
    }
    struct Activo: Decodable, Equatable { let nombre, ficha: String; let valor: Double; let pct, cambio: Double? }
    struct Sub: Decodable, Equatable, Identifiable { let id, titulo: String; let importe: Double; let dia, faltan: Int }
    struct Prevision: Decodable, Equatable {
        let fin, fijos, variable, porEntrar: Double
        let ultimoDia: Int
        let colchon: Double?
        let top: String
    }
    let esteMes, mesAnterior: Mes
    let ahorro: Ahorro
    let objetivo: Objetivo
    let activos: [Activo]
    let suscripciones: [Sub]
    let prevision: Prevision
}

struct ModeloGestor: Decodable, Equatable {
    struct Activa: Decodable, Equatable, Identifiable { let id, titulo: String; let importe: Double; let dia, faltan: Int }
    struct Cobro: Decodable, Equatable { let importe: Double; let fecha: String }
    struct Baja: Decodable, Equatable, Identifiable { let id, titulo, desde: String; let importe: Double; let cobro: Cobro? }
    let activas: [Activa]
    let deBaja: [Baja]
}

struct ModeloBusqueda: Decodable, Equatable {
    struct Grupo: Decodable, Equatable, Identifiable { let mes, titulo: String; let neto: Double; let filas: [FilaMov]; let mas: Int; var id: String { mes } }
    let total: Int
    let vacio: String
    struct Opcion: Decodable, Equatable, Identifiable { let id, nombre: String }
    let anios: [String]
    let cuentas: [Opcion]
    let categorias: [Opcion]
    let grupos: [Grupo]
}

struct VistaImportacion: Decodable, Equatable {
    struct Cuenta: Decodable, Equatable, Identifiable { let id, nombre: String }
    struct Fila: Decodable, Equatable, Identifiable { let fila: Int; let fecha, dia, concepto, fuera: String; let importe: Double?; let ya, marcada: Bool; var id: Int { fila } }
    let cuenta: String
    let cuentaDetectada, confirmada, conSaldo: Bool
    let cuentas: [Cuenta]
    let nuevas, ya, fuera, total: Int
    let boton: String
    let filas: [Fila]
}

struct ResultadoImportacion: Decodable, Equatable {
    struct Sobra: Decodable, Equatable, Identifiable { let id, dia, concepto, tipo: String; let importe: Double }
    struct Falta: Decodable, Equatable { let dia, concepto: String; let importe: Double }
    struct Detalle: Decodable, Equatable { let desde, hasta: String; let sobran: [Sobra]; let faltan: [Falta] }
    struct Cuadre: Decodable, Equatable { let cuadra: Bool; let esperado, actual, diff, retenido: Double; let saldoBanco: Double?; let cuenta: String; let detalle: Detalle? }
    let nuevos: Int
    let texto: String
    let quitados: Int
    let cuadre: Cuadre?
}

struct Permitir: Decodable, Equatable {
    let saldo, resto, cargos, programado, queda, tras, colchon: Double
    let veredicto: String
    let suficiente: Bool
    let quedanDias: Int
}

struct FiltroBusqueda: Equatable {
    var search = "", account = "", month = "", year = "", category = ""
    var json: String {
        let d = ["search": search, "account": account, "month": month, "year": year, "category": category]
        return String(data: (try? JSONSerialization.data(withJSONObject: d)) ?? Data("{}".utf8), encoding: .utf8) ?? "{}"
    }
}

enum FormatoFin {
    // financeMoney: «1.234,56 €» con el signo menos tipográfico.
    static func dinero(_ v: Double) -> String {
        let d = Decimal(string: String(format: "%.2f", v), locale: Locale(identifier: "en_US_POSIX")) ?? Decimal(v)
        return Dinero.formato(d)
    }
    static func pct(_ v: Double) -> String {
        (v > 0 ? "+" : v < 0 ? "−" : "") + String(format: "%.1f", abs(v)).replacingOccurrences(of: ".", with: ",") + " %"
    }
}
