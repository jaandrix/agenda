import Foundation
import Darwin
import QuartzCore

// 0.24: lo que tarda la app en el iPhone de verdad, para comparar con la tabla de CI (RendimientoAppTests, en el
// simulador). Cada medida guarda sus últimos valores en este iPhone; Ajustes → avanzado → «medidas.» las enseña y las
// copia. Los nombres coinciden con los de la prueba donde mide lo mismo. Nada sale del iPhone.
@MainActor
enum Medidas {
    private static let clave = "bitacora.medidas"
    private static let maximo = 12
    private static var abiertas: [String: UInt64] = [:]
    private static var inicioApp: UInt64?
    private static var arranqueHecho = false
    static private(set) var valores: [String: [Double]] = {
        (UserDefaults.standard.dictionary(forKey: clave) as? [String: [Double]]) ?? [:]
    }()

    static var ahora: UInt64 { DispatchTime.now().uptimeNanoseconds }
    static func ms(desde t0: UInt64) -> Double { Double(ahora &- t0) / 1_000_000 }

    static func anotar(_ nombre: String, ms: Double) {
        guard ms.isFinite, ms >= 0 else { return }
        var l = valores[nombre] ?? []
        l.append((ms * 10).rounded() / 10)
        if l.count > maximo { l.removeFirst(l.count - maximo) }
        valores[nombre] = l
        UserDefaults.standard.set(valores, forKey: clave)
    }

    static func anotar(_ nombre: String, desde t0: UInt64) { anotar(nombre, ms: ms(desde: t0)) }

    static func empezar(_ nombre: String) { abiertas[nombre] = ahora }

    // Termina una medida abierta (si no lo está, no hace nada).
    static func terminar(_ nombre: String) {
        guard let t0 = abiertas.removeValue(forKey: nombre) else { return }
        anotar(nombre, desde: t0)
    }

    // Cuando lo que se acaba de poner en pantalla se ha pintado: al empezar el fotograma siguiente.
    static func terminarAlPintar(_ nombres: String...) {
        let abiertos = nombres.filter { abiertas[$0] != nil }
        guard !abiertos.isEmpty else { return }
        TrasFotograma.esperar { for n in abiertos { terminar(n) } }
    }

    static func cambioDePestana(_ p: Pestana) {
        let n = "pestaña \(nombre(p)) (cambiar)"
        empezar(n)
        terminarAlPintar(n)
    }

    static func nombre(_ p: Pestana) -> String {
        switch p {
        case .inicio: return "inicio"
        case .plan: return "plan"
        case .calendario: return "calendario"
        case .finanzas: return "finanzas"
        case .mas: return "menú"
        }
    }

    static func abrirApp() { if inicioApp == nil { inicioApp = ahora } }

    // La primera vez que Inicio tiene datos en este arranque: desde que el sistema creó el proceso (sin el arranque
    // previo de iOS, que no lo ve la persona) y desde que empezó la app.
    static func inicioConDatos() {
        guard !arranqueHecho else { return }
        arranqueHecho = true
        let app = inicioApp
        TrasFotograma.esperar {
            if let app { anotar("arranque hasta Inicio (desde la app)", desde: app) }
            if ProcessInfo.processInfo.environment["ActivePrewarm"] != "1", let p = msDesdeProceso() {
                anotar("arranque hasta Inicio (desde el proceso)", ms: p)
            }
        }
    }

    private static func msDesdeProceso() -> Double? {
        var info = kinfo_proc()
        var tam = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        guard sysctl(&mib, u_int(mib.count), &info, &tam, nil, 0) == 0 else { return nil }
        let t = info.kp_proc.p_un.__p_starttime
        let inicio = Double(t.tv_sec) + Double(t.tv_usec) / 1_000_000
        let ms = (Date().timeIntervalSince1970 - inicio) * 1000
        return ms > 0 && ms < 120_000 ? ms : nil
    }

    static func borrar() {
        valores = [:]
        UserDefaults.standard.removeObject(forKey: clave)
    }

    // Una línea por medida: mediana, mínimo, máximo y cuántas veces, como «MEDIDA|…» de la prueba para pegarlo igual.
    static func texto(extra: [String: Double] = [:], cabecera: String) -> String {
        var lineas = [cabecera]
        for k in valores.keys.sorted() {
            guard let l = valores[k]?.sorted(), !l.isEmpty else { continue }
            lineas.append(String(format: "MEDIDA|%@|%.1f|%.1f|%.1f", k, l[l.count / 2], l.first!, l.last!) + "|\(l.count)")
        }
        for k in extra.keys.sorted() {
            lineas.append(String(format: "MOTOR|%@|%.1f", k, extra[k] ?? 0))
        }
        return lineas.joined(separator: "\n")
    }
}

// Un CADisplayLink de un solo disparo: llama al empezar el siguiente fotograma (lo pendiente ya está en pantalla).
@MainActor
final class TrasFotograma: NSObject {
    private var enlace: CADisplayLink?
    private let hecho: () -> Void

    private init(_ hecho: @escaping () -> Void) {
        self.hecho = hecho
        super.init()
        let e = CADisplayLink(target: self, selector: #selector(tic))
        e.add(to: .main, forMode: .common)
        enlace = e
    }

    static func esperar(_ hecho: @escaping () -> Void) { _ = TrasFotograma(hecho) }

    @objc private func tic() {
        enlace?.invalidate()
        enlace = nil
        hecho()
    }
}
