import SwiftUI
import UIKit

// 3.2: piezas de Panorama que aún no están en DesignSystem/V2 (para subirlas si gustan): los tonos palo de las
// tarjetas, el rótulo de sección sin mayúsculas, el macro resumen de la cuenta y la gráfica pequeña del saldo.

// Tonos palo y crudo para fondos de tarjeta. Todos dejan leer `Lienzo.tinta` (≥ 15:1) y `Lienzo.tintaSecundaria`
// (≥ 4,7:1); no sirven para texto naranja ni rojo (≈ 3:1), que sobre ellos va en tinta.
enum TonoPanorama {
    private static func c(_ v: UInt32) -> Color { Color(uiColor: UIColor(rgb: v)) }
    static let crudo = c(0xF6F1E7)
    static let arena = c(0xF3EADB)
    static let salvia = c(0xE6EEE4)
    static let niebla = c(0xE5ECF4)
    static let rosa = c(0xF6E6E4)
    static let lavanda = c(0xECE8F4)
    static let mantequilla = c(0xF7F0D9)
    static let melocoton = c(0xFBE9DD)
}

// Fondo de tarjeta como `.tarjeta()`, pero con un tono propio (el filete y la sombra iguales).
extension View {
    func tarjetaTono(_ fondo: Color, relleno: CGFloat = Medida.rellenoTarjeta, radio: CGFloat = Medida.radioTarjeta) -> some View {
        padding(relleno)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fondo, in: RoundedRectangle(cornerRadius: radio, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radio, style: .continuous).strokeBorder(Lienzo.filo))
            .sombra(.suave)
    }
}

// Rótulo de sección en tipo frase («Relacionados.»), no en mayúsculas espaciadas: se lee mejor y VoiceOver no deletrea.
struct RotuloPanorama: View {
    let texto: String
    var detalle: String?

    static func frase(_ t: String) -> String {
        let limpio = t.trimmingCharacters(in: .whitespaces)
        guard let primera = limpio.first else { return "" }
        let conPunto = limpio.hasSuffix(".") || limpio.hasSuffix("…") ? limpio : limpio + "."
        return String(primera).uppercased() + conPunto.dropFirst()
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(Self.frase(texto)).font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            if let detalle {
                Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit().lineLimit(1)
            }
        }
        .padding(.horizontal, Medida.xxs)
    }
}

// MARK: - Macro resumen (solo lectura, nada privado: recuentos, ni importes ni nombres)

struct MacroPanorama: Sendable, Equatable {
    var diasEnBitacora = 0
    var hechasSemana = 0
    var eventosMes = 0
    var viajesAnio = 0
    var rutinasActivas = 0

    static func desde(_ doc: DocumentoBitacora, hoy: LocalDay = CalendarioBitacora.madrid.dia(de: Date())) -> MacroPanorama {
        var m = MacroPanorama()
        let entries = ((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []
        let notas = ((try? doc.valor(de: "notes")) ?? nil)?.lista ?? []
        let movs = ((try? doc.valor(de: "financePro")) ?? nil)?["transactions"]?.lista ?? []
        let lunes = hoy.inicioSemanaLunes.iso
        let mes = String(hoy.iso.prefix(7))
        let anio = String(hoy.year)
        var primero: Int64?
        for x in entries + notas + movs {
            if let id = x["id"]?.comoId, let ms = marcaTiempo(id), ms < (primero ?? .max) { primero = ms }
        }
        for x in entries {
            guard let o = x.objeto, let id = o["id"]?.comoId else { continue }
            if id.hasPrefix("planner_done_") {
                if let d = o["completedDate"]?.texto, d >= lunes, d <= hoy.iso { m.hechasSemana += 1 }
                continue
            }
            switch o["type"]?.texto {
            case "event":
                if (o["date"]?.texto ?? "").hasPrefix(mes), !LecturaCalendario.esMarca(o, id: id) { m.eventosMes += 1 }
            case "travel":
                if ((o["startDate"]?.texto ?? o["date"]?.texto) ?? "").hasPrefix(anio) { m.viajesAnio += 1 }
            default: break
            }
        }
        m.rutinasActivas = (((try? doc.valor(de: "habits")) ?? nil)?.lista ?? []).filter { $0["activo"]?.booleano != false }.count
        if let ms = primero {
            let desde = CalendarioBitacora.madrid.dia(de: Date(timeIntervalSince1970: TimeInterval(ms) / 1000))
            m.diasEnBitacora = max(1, desde.dias(hasta: hoy) + 1)
        }
        return m
    }

    // Los ids de la web llevan la hora de creación en milisegundos («evt_1730000000000_ab12»). Fuera lo anterior a 2020
    // y lo futuro: son ids importados o a mano, no el uso real.
    static func marcaTiempo(_ id: String) -> Int64? {
        let ahora = Int64(Date().timeIntervalSince1970 * 1000)
        for trozo in id.split(separator: "_") where trozo.count == 13 {
            if let ms = Int64(trozo), ms >= 1_577_836_800_000, ms <= ahora { return ms }
        }
        return nil
    }
}

// MARK: - Saldo de los últimos meses

// La serie diaria de Finanzas (`LecturaFinanzas.serieDiaria`, Swift puro, sin motor JS), reducida a un punto por semana.
// Se calcula fuera del hilo principal y se guarda por revisión y día: volver a Panorama no la recalcula.
struct SaldoPanorama: Sendable, Equatable {
    static let meses = 6
    var puntos: [Double] = []      // 0…1, para LineaSerie/AreaSerie
    var inicio: Decimal = 0
    var actual: Decimal = 0
    var ocultar = false

    var variacion: Int? {
        guard inicio != 0 else { return nil }
        let v = NSDecimalNumber(decimal: (actual - inicio) / abs(inicio) * 100).doubleValue
        return Int(v.rounded())
    }

    static func desde(_ doc: DocumentoBitacora, hoy: LocalDay = CalendarioBitacora.madrid.dia(de: Date())) -> SaldoPanorama? {
        guard Apartados.visible("finances", doc) else { return nil }
        let movs = ((try? doc.valor(de: "financePro")) ?? nil)?["transactions"]?.lista ?? []
        guard !movs.isEmpty else { return nil }
        let serie = LecturaFinanzas.serieDiaria(doc: doc, meses: meses, conExtras: false, hoy: hoy)
        guard serie.count > 1, let ultimo = serie.last, let primero = serie.first else { return nil }
        var semanal = stride(from: 0, to: serie.count, by: 7).map { serie[$0] }
        if semanal.last?.fecha != ultimo.fecha { semanal.append(ultimo) }
        let valores = semanal.map { NSDecimalNumber(decimal: $0.valor).doubleValue }
        guard let lo = valores.min(), let hi = valores.max() else { return nil }
        let rango = hi - lo
        var s = SaldoPanorama()
        // Una línea plana va a media altura: sin movimiento no hay nada que exagerar.
        s.puntos = valores.map { rango > 0 ? ($0 - lo) / rango * 0.86 + 0.07 : 0.5 }
        s.inicio = primero.valor
        s.actual = ultimo.valor
        s.ocultar = ((try? doc.valor(de: "blurFinances")) ?? nil)?.booleano == true
        return s
    }
}

// Un solo hueco: la última serie pedida, con su clave (revisión y día). Se lee y escribe desde la vista.
enum CacheSaldoPanorama {
    private static let cerrojo = NSLock()
    nonisolated(unsafe) private static var guardado: (clave: String, saldo: SaldoPanorama?)?

    static func leer(_ clave: String) -> SaldoPanorama?? {
        cerrojo.lock(); defer { cerrojo.unlock() }
        guard let g = guardado, g.clave == clave else { return nil }
        return .some(g.saldo)
    }

    static func guardar(_ clave: String, _ s: SaldoPanorama?) {
        cerrojo.lock(); defer { cerrojo.unlock() }
        guardado = (clave, s)
    }
}

// Sobria: el área en salvia, la línea en tinta y el punto de hoy. Las cifras se ocultan si Finanzas las oculta.
struct GraficaSaldoPanorama: View {
    let saldo: SaldoPanorama
    var abrir: () -> Void
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var visto = false

    var body: some View {
        Button(action: abrir) {
            VStack(alignment: .leading, spacing: Medida.s) {
                HStack(alignment: .center, spacing: Medida.xs) {
                    IconoCuadrado(id: "finances", tono: .claro, tamano: Medida.iconoPequeno)
                    Text("Saldo, últimos \(SaldoPanorama.meses) meses.").font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
                    Spacer()
                    FlechaFila()
                }
                HStack(alignment: .firstTextBaseline, spacing: Medida.xs) {
                    Text(saldo.ocultar ? "•••" : Dinero.formato(saldo.actual))
                        .font(Letra.numero).foregroundStyle(Lienzo.tinta)
                        .contentTransition(.numericText())
                    if let v = saldo.variacion {
                        Text(v == 0 ? "igual que hace \(SaldoPanorama.meses) meses." : "\(v > 0 ? "+" : "")\(v) % desde entonces.")
                            .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    }
                }
                ZStack {
                    AreaSerie(puntos: saldo.puntos).fill(TonoPanorama.salvia)
                    LineaSerie(puntos: saldo.puntos)
                        .trim(from: 0, to: visto ? 1 : 0)
                        .stroke(Lienzo.tinta, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                }
                .frame(height: MedidaPanorama.altoGrafica)
                .accessibilityHidden(true)
            }
            .tarjeta()
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        }
        .buttonStyle(.pulsable(0.98))
        .onAppear { withAnimation(Muelle.o(Muelle.entrada, reducido: sinMovimiento)) { visto = true } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("saldo de los últimos \(SaldoPanorama.meses) meses")
        .accessibilityValue(saldo.ocultar ? "cifras ocultas" : Dinero.formato(saldo.actual) + (saldo.variacion.map { ", \($0) por ciento desde entonces" } ?? ""))
        .accessibilityHint("abre finanzas")
        .accessibilityAddTraits(.isButton)
    }
}

// Cuatro cifras de la cuenta en una tarjeta crudo: lo que se puede contar sin enseñar nada privado.
struct TarjetaMacroPanorama: View {
    let m: MacroPanorama

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            Text(m.diasEnBitacora > 0 ? "Tu bitácora, \(m.diasEnBitacora) \(m.diasEnBitacora == 1 ? "día" : "días")." : "Tu bitácora.")
                .font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
                .accessibilityAddTraits(.isHeader)
            HStack(alignment: .top, spacing: Medida.xs) {
                cifra(m.hechasSemana, m.hechasSemana == 1 ? "tarea hecha esta semana." : "tareas hechas esta semana.")
                cifra(m.eventosMes, m.eventosMes == 1 ? "evento este mes." : "eventos este mes.")
                cifra(m.viajesAnio, m.viajesAnio == 1 ? "viaje este año." : "viajes este año.")
                cifra(m.rutinasActivas, m.rutinasActivas == 1 ? "rutina activa." : "rutinas activas.")
            }
        }
        .tarjetaTono(TonoPanorama.crudo)
    }

    private func cifra(_ n: Int, _ texto: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(n)").font(Letra.numero).foregroundStyle(Lienzo.tinta).contentTransition(.numericText())
            Text(texto).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                .lineLimit(3).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .combine)
    }
}
