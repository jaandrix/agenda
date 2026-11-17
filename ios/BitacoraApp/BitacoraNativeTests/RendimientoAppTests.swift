import XCTest
import SwiftUI
import UIKit
@testable import BitacoraNative

// 0.22: medidas repetibles de lo que nota Alejandro en el iPhone, con un documento grande y realista generado aquí
// (6.000 movimientos, 600 eventos, unas 500 tareas, la despensa llena). Cada medida se imprime como
// «MEDIDA|nombre|mediana ms|mín|máx» y el workflow las publica en su resumen (paso «Rendimiento», en Release).
// En Debug corren una vez, solo para comprobar que todo funciona: los números que valen son los de Release.
@MainActor
final class RendimientoAppTests: XCTestCase {
    #if DEBUG
    static let vueltas = 1
    #else
    static let vueltas = 7
    #endif

    // MARK: documento

    static func documentoGrande(movimientos: Int = 6000, hoy: LocalDay = CalendarioBitacora.madrid.diaLogico(Date())) -> Data {
        var g = SystemRandomNumberGenerator()
        func al(_ n: Int) -> Int { Int.random(in: 0..<n, using: &g) }
        let cuentas = ["efectivo", "bancos", "online"]
        let cats = (0..<24).map { #"{"id":"cat_\#($0)","name":"categoría \#($0)","type":"\#($0 < 4 ? "income" : "expense")"}"# }
        let tx = (0..<movimientos).map { n -> String in
            let d = hoy.sumando(dias: -(n * 400 / movimientos))
            let tipo = n % 9 == 0 ? "income" : "expense"
            return #"{"id":"ptx_\#(n)","date":"\#(d.iso)","account":"\#(cuentas[n % 3])","type":"\#(tipo)","amount":\#(al(9000) / 100 + 1).\#(al(99)),"note":"movimiento \#(n) en la tienda \#(n % 140)","category":"cat_\#(n % 24)","banco":"COMPRA TARJ \#(n % 140)","claveImport":"k\#(n)"}"#
        }
        let financePro = #"{"accounts":{"efectivo":{"name":"Efectivo","balance0":120},"bancos":{"name":"Ibercaja","balance0":2400},"online":{"name":"Revolut","balance0":300}},"categories":[\#(cats.joined(separator: ","))],"transactions":[\#(tx.joined(separator: ","))],"rules":[]}"#
        var entries: [String] = []
        for n in 0..<600 {
            let d = hoy.sumando(dias: n % 240 - 120)
            let hora = String(format: "%02d:%02d", 8 + n % 13, (n % 4) * 15)
            entries.append(#"{"id":"e\#(n)","type":"\#(["event", "social", "futbol", "cita"][n % 4])","title":"evento \#(n) con gente","date":"\#(d.iso)","time":"\#(hora)","location":"sitio \#(n % 30)","notes":"notas del evento \#(n)"}"#)
        }
        for n in 0..<120 { entries.append(#"{"id":"b\#(n)","type":"birthday","title":"cumple \#(n)","birthDate":"19\#(70 + n % 30)-\#(String(format: "%02d", n % 12 + 1))-\#(String(format: "%02d", n % 28 + 1))"}"#) }
        for n in 0..<25 { entries.append(#"{"id":"sub_\#(n)","type":"subscription","title":"suscripción \#(n)","amount":\#(5 + n).99,"renewalDay":\#(n % 28 + 1),"active":true}"#) }
        var dias: [String] = []
        for k in -90..<30 {
            let d = hoy.sumando(dias: k)
            let tareas = (0..<4).map { i in #"{"id":"t\#(k)_\#(i)","title":"tarea \#(i) del \#(d.iso)","time":"\#(i % 2 == 0 ? String(format: "%02d:00", 9 + i * 2) : "")","notes":"","done":\#(k < 0 && i != 3)}"# }
            dias.append(#""\#(d.iso)":[\#(tareas.joined(separator: ","))]"#)
        }
        let backlog = (0..<40).map { #"{"id":"bl\#($0)","title":"pendiente sin día \#($0)","done":false,"prioridad":"\#(["alta", "media", "baja", ""][$0 % 4])"}"# }
        let recurrentes = (0..<20).map { #"{"id":"r\#($0)","texto":"recurrente \#($0)","activo":true,"frecuencia":"diaria","completadas":{}}"# }
        let items = { (l: Int) in (0..<90).map { #"{"id":"i\#(l)_\#($0)","texto":"producto \#($0) \#(["leche", "tomates", "pan", "arroz", "detergente", "pollo"][$0 % 6])","cantidad":"\#($0 % 3 + 1)","hecho":\#($0 % 5 == 0)}"# }.joined(separator: ",") }
        let listas = (0..<3).map { #"{"id":"l\#($0)","nombre":"lista \#($0)","items":[\#(items($0))]}"# }
        let lineasTicket = (0..<15).map { #"{"texto":"producto \#($0)","precio":\#($0 + 1).2,"clave":"producto \#($0)"}"# }.joined(separator: ",")
        let historial = (0..<150).map { n in #"{"id":"h\#(n)","fecha":"\#(hoy.sumando(dias: -n * 2).iso)","tienda":"tienda \#(n % 5)","total":\#(20 + n % 60).5,"items":[\#(lineasTicket)]}"# }
        let ingredientes = (0..<8).map { #"{"texto":"ingrediente \#($0)","cantidad":"1"}"# }.joined(separator: ",")
        let recetas = (0..<30).map { n in #"{"id":"rc\#(n)","nombre":"receta \#(n)","raciones":2,"ingredientes":[\#(ingredientes)],"pasos":["uno","dos"],"notas":""}"# }
        let listaCompra = #"{"actual":"l0","listas":[\#(listas.joined(separator: ","))],"historial":[\#(historial.joined(separator: ","))],"recetas":[\#(recetas.joined(separator: ","))],"aprendido":{},"frecuentes":{}}"#
        let examenes = { (s: Int) in (0..<4).map { #"{"id":"ex\#(s)_\#($0)","title":"parcial \#($0)","date":"\#(hoy.sumando(dias: $0 * 20 - 30).iso)"}"# }.joined(separator: ",") }
        let practicas = { (s: Int) in (0..<8).map { #"{"id":"as\#(s)_\#($0)","title":"práctica \#($0)","date":"\#(hoy.sumando(dias: $0 * 9 - 40).iso)","done":\#($0 < 4)}"# }.joined(separator: ",") }
        let subjects = (0..<8).map { s in #"{"id":"s\#(s)","name":"asignatura \#(s)","exams":[\#(examenes(s))],"assignments":[\#(practicas(s))]}"# }
        let fechasRutina = (0..<60).map { "\"" + hoy.sumando(dias: -$0).iso + "\"" }.joined(separator: ",")
        let habits = (0..<15).map { #"{"id":"hab\#($0)","name":"rutina \#($0)","completedDates":[\#(fechasRutina)]}"# }
        let notas = (0..<200).map { #"{"id":"n\#($0)","title":"nota \#($0)","content":"\#(String(repeating: "texto de la nota ", count: 20))","updatedAt":"2026-10-01T10:00:00Z"}"# }
        let texto = #"{"financePro":\#(financePro),"financeProfile":{},"investmentData":{},"entries":[\#(entries.joined(separator: ","))],"categories":[],"dayPlanner":{"days":{\#(dias.joined(separator: ","))},"backlog":[\#(backlog.joined(separator: ","))]},"recurringTasks":[\#(recurrentes.joined(separator: ","))],"listaCompra":\#(listaCompra),"studies":{"subjects":[\#(subjects.joined(separator: ","))]},"habits":[\#(habits.joined(separator: ","))],"notes":[\#(notas.joined(separator: ","))],"apartadosConfig":{"perfil":"ambos"},"claveDelFuturo":{"x":[1,2,3]}}"#
        return Data(texto.utf8)
    }

    // MARK: medir

    private static var resultados: [String: [Double]] = [:]
    private static var memoriaMaxima = 0.0

    static func memoriaMB() -> Double {
        var info = task_vm_info_data_t()
        var n = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
        let r = withUnsafeMutablePointer(to: &info) { $0.withMemoryRebound(to: integer_t.self, capacity: Int(n)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &n) } }
        return r == KERN_SUCCESS ? Double(info.phys_footprint) / 1_048_576 : 0
    }

    private func anotar(_ nombre: String, _ ms: Double) {
        Self.resultados[nombre, default: []].append(ms)
        Self.memoriaMaxima = max(Self.memoriaMaxima, Self.memoriaMB())
    }

    private func reloj<T>(_ f: () async throws -> T) async rethrows -> (T, Double) {
        let t0 = DispatchTime.now().uptimeNanoseconds
        let r = try await f()
        return (r, Double(DispatchTime.now().uptimeNanoseconds - t0) / 1_000_000)
    }

    private func reloj0(_ f: () -> Void) -> Double {
        let t0 = DispatchTime.now().uptimeNanoseconds
        f()
        return Double(DispatchTime.now().uptimeNanoseconds - t0) / 1_000_000
    }

    private func publicar(_ nombre: String) {
        guard let v = Self.resultados[nombre]?.sorted(), !v.isEmpty else { return }
        print(String(format: "MEDIDA|%@|%.1f|%.1f|%.1f", nombre, v[v.count / 2], v.first!, v.last!))
    }

    // MARK: pintar

    private var ventana: UIWindow?
    private var pantallas: [String: UIHostingController<AnyView>] = [:]

    // Pinta una vista en una ventana de 390 × 844 y fuerza el diseño y el dibujo. Con `en`, la pantalla ya existe y solo
    // se cambia su contenido (como en la app al marcar o deslizar); sin él, se crea entera (como al arrancar).
    private func pintar<V: View>(_ v: V, en clave: String? = nil) {
        let w = ventana ?? UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        ventana = w
        let raiz = AnyView(v.environment(\.colorScheme, .light))
        let h: UIHostingController<AnyView>
        if let clave, let existente = pantallas[clave] {
            existente.rootView = raiz
            h = existente
        } else {
            h = UIHostingController(rootView: raiz)
            if let clave { pantallas[clave] = h }
        }
        if w.rootViewController !== h { w.rootViewController = h }
        w.isHidden = false
        h.view.setNeedsLayout()
        h.view.layoutIfNeeded()
        CATransaction.flush()
    }

    // Deja que lo que la vista deja para el siguiente ciclo (onChange del carrusel, su posición) se haga fuera de la
    // medida, para que no caiga en la siguiente.
    private func asentar() async {
        try? await Task.sleep(for: .milliseconds(30))
        ventana?.rootViewController?.view.layoutIfNeeded()
        CATransaction.flush()
    }

    private func inicio(_ v: VistaInicio) -> some View {
        ScrollView { InicioCuerpo(vista: v, ahora: Date(), estado: .reposo) }
    }

    // MARK: entorno

    private func entorno(_ datos: Data, raiz: URL) async throws -> (AlmacenLocal, SyncEngine) {
        let almacen = AlmacenLocal(raiz: raiz)
        try await almacen.guardarBase(datos, uid: "A")
        return (almacen, SyncEngine(auth: AuthFalsa(nil), remoto: RemotoFalso("{}"), almacen: almacen))
    }

    // MARK: pruebas

    func testRendimientoCompleto() async throws {
        let datos = Self.documentoGrande()
        print(String(format: "MEDIDA|documento (KB)|%.0f|%.0f|%.0f", Double(datos.count) / 1024, Double(datos.count) / 1024, Double(datos.count) / 1024))
        let raiz = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        _ = try await entorno(datos, raiz: raiz)
        Self.memoriaMaxima = Self.memoriaMB()

        // Arranque: almacén y motor nuevos, la copia del disco, el documento visible, Inicio calculado y pintado.
        for vuelta in 0..<(Self.vueltas + 1) {
            let (_, ms) = try await reloj { () async throws -> Void in
                let almacen = AlmacenLocal(raiz: raiz)
                let sync = SyncEngine(auth: AuthFalsa(nil), remoto: RemotoFalso("{}"), almacen: almacen)
                await sync.iniciar(uid: "A")
                let quiza = await sync.documentoVisible()
                let doc = try XCTUnwrap(quiza)
                let v = await Task.detached { VistaInicio.desde(doc) }.value
                pintar(inicio(v))
            }
            anotar(vuelta == 0 ? "arranque en frío hasta Inicio" : "arranque en caliente hasta Inicio", ms)
        }

        let (almacen, sync) = try await entorno(datos, raiz: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        _ = almacen
        await sync.iniciar(uid: "A")
        let primero = await sync.documentoVisible()
        var doc = try XCTUnwrap(primero)
        let motor = MotorFinanzas()

        for vuelta in 0..<Self.vueltas {
            // Cada pestaña: lo que hace su `.task` con el documento ya visible, y el pintado cuando hay cuerpo propio.
            let d = doc
            anotar("pestaña plan", try await reloj {
                let v = await Task.detached { LecturaPlanificador.vista(d) }.value
                pintar(PlanCuerpo(carga: .lista(v), desplazamiento: .constant(0), estado: .reposo, pendientes: 0, aviso: nil), en: "plan")
            }.1)
            anotar("pestaña calendario (cálculo)", await reloj {
                await Task.detached { LecturaCalendario.mes(d, CalendarioBitacora.madrid.diaLogico(Date()).yearMonth) }.value
            }.1)
            anotar("pestaña menú (cálculo)", await reloj {
                await Task.detached { (MenuMas.desde(d), LecturaMas.vista(d)) }.value
            }.1)
            anotar("despensa (cálculo)", await reloj { await Task.detached { LecturaDespensa.vista(d) }.value }.1)
            if vuelta == 0 {
                anotar("finanzas primera vez (motor + resumen)", try await reloj {
                    try await motor.cargar(d)
                    _ = try await motor.pestana("resumen", como: ModeloResumen.self)
                }.1)
            }
            anotar("pestaña finanzas (resumen ya cargado)", try await reloj {
                try await motor.cargar(d)
                _ = try await motor.pestana("resumen", como: ModeloResumen.self)
            }.1)

            // Carrusel: elegir otro día de la semana y la semana siguiente rehace la portada.
            let hoy = CalendarioBitacora.madrid.diaLogico(Date())
            for (k, paso) in [1, 7].enumerated() {
                let elegido = hoy.sumando(dias: paso + vuelta)
                let (v, calculo) = await reloj { await Task.detached { VistaInicio.desde(d, elegido: elegido) }.value }
                anotar(k == 0 ? "carrusel: otro día (cálculo)" : "carrusel: otra semana (cálculo)", calculo)
                anotar(k == 0 ? "carrusel: otro día (pintar)" : "carrusel: otra semana (pintar)", reloj0 { pintar(inicio(v), en: "inicio") })
                await asentar()
            }

            // 0.24: hasta la 0.23, «marcar» empezaba con Inicio en otra semana y medía también el salto del carrusel a
            // hoy, que en la app no pasa al marcar. Ahora el salto se mide aparte y marcar sale de Inicio en hoy.
            let vHoy = await Task.detached { VistaInicio.desde(d) }.value
            anotar("carrusel: volver a hoy (pintar)", reloj0 { pintar(inicio(vHoy), en: "inicio") })
            await asentar()

            // Marcar una tarea: la cola, el documento visible y la portada otra vez.
            let tarea = "t0_\(vuelta % 4)"
            anotar("marcar tarea hasta Inicio", try await reloj {
                try await sync.encolar(.marcarTarea(id: tarea, hecha: vuelta % 2 == 0, momentoMs: 1))
                let quiza = await sync.documentoVisible()
                let nuevo = try XCTUnwrap(quiza)
                let v = await Task.detached { VistaInicio.desde(nuevo) }.value
                pintar(inicio(v), en: "inicio")
            }.1)
            anotar("Inicio (cálculo)", await reloj { await Task.detached { VistaInicio.desde(d) }.value }.1)
            anotar("marcar despensa hasta la lista", try await reloj {
                try await sync.encolar(OperacionesDespensa.marcarOp(listaId: "l0", id: "i0_\(vuelta + 1)", hecho: true))
                let quiza = await sync.documentoVisible()
                let nuevo = try XCTUnwrap(quiza)
                _ = await Task.detached { LecturaDespensa.vista(nuevo) }.value
            }.1)

            // Guardar un movimiento como el editor: datos del motor, guardar, cola y Finanzas otra vez.
            let otro = await sync.documentoVisible()
            doc = try XCTUnwrap(otro)
            let actual = doc
            anotar("guardar movimiento hasta Finanzas", try await reloj {
                try await motor.cargar(actual)
                var b = try await motor.llamar("movimientoDatos", ["", "expense"], como: EditorMovimientoView.Borrador.self)
                b.id = "ptx_q_rend\(vuelta)"; b.importe = "3,20"; b.nota = "café \(vuelta)"
                if b.cuenta.isEmpty { b.cuenta = "bancos" }
                let r = try await motor.crudo("guardarMovimiento", [String(data: try JSONEncoder().encode(b), encoding: .utf8) ?? "{}"])
                let cambios = try XCTUnwrap(LectorJSON.valor(r)["cambios"])
                let op = try XCTUnwrap(CambioFinanzas.operacion(cambios, sobre: actual))
                try await sync.encolar(op)
                let quiza = await sync.documentoVisible()
                let nuevo = try XCTUnwrap(quiza)
                try await motor.cargar(nuevo)
                _ = try await motor.pestana("resumen", como: ModeloResumen.self)
            }.1)
            let despues = await sync.documentoVisible()
            doc = try XCTUnwrap(despues)
        }

        // Una sincronización que trae cambios de otro dispositivo: 40 movimientos y un día del plan nuevos.
        for vuelta in 0..<Self.vueltas {
            let raizS = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            let almacenS = AlmacenLocal(raiz: raizS)
            try await almacenS.guardarBase(datos, uid: "A")
            let base = try DocumentoBitacora(datos: datos)
            var fp = try XCTUnwrap(base.valor(de: "financePro")?.objeto)
            var txs = fp["transactions"]?.lista ?? []
            for n in 0..<40 { txs.append(.object(["id": .string("otro_\(vuelta)_\(n)"), "date": .string("2026-11-10"), "account": .string("bancos"), "type": .string("expense"), "amount": .number("4.5")])) }
            fp["transactions"] = .array(txs)
            let nube = base.aplicandoParche(["financePro": .object(fp)]).serializado()
            let remoto = RemotoFalso(String(decoding: nube, as: UTF8.self))
            let syncS = SyncEngine(auth: AuthFalsa(sesion("A")), remoto: remoto, almacen: almacenS)
            await syncS.iniciar(uid: "A")
            let quizaPrevio = await syncS.documentoVisible()
            let previo = try XCTUnwrap(quizaPrevio)
            _ = await Task.detached { VistaInicio.desde(previo) }.value
            anotar("sincronización que trae cambios hasta Inicio", try await reloj {
                await syncS.sincronizar()
                let quiza = await syncS.documentoVisible()
                let nuevo = try XCTUnwrap(quiza)
                let v = await Task.detached { VistaInicio.desde(nuevo) }.value
                pintar(inicio(v), en: "inicio")
            }.1)
            anotar("sincronización sin cambios hasta Inicio", try await reloj {
                await syncS.sincronizar()
                let quiza = await syncS.documentoVisible()
                let nuevo = try XCTUnwrap(quiza)
                let v = await Task.detached { VistaInicio.desde(nuevo) }.value
                pintar(inicio(v), en: "inicio")
            }.1)
            try? FileManager.default.removeItem(at: raizS)
        }

        for n in Self.resultados.keys.sorted() { publicar(n) }
        print(String(format: "MEDIDA|memoria máxima (MB)|%.0f|%.0f|%.0f", Self.memoriaMaxima, Self.memoriaMaxima, Self.memoriaMaxima))
        try? FileManager.default.removeItem(at: raiz)
    }

    // Las métricas de XCTest para el camino de arranque: tiempo, CPU y memoria (salen como «measured [...]» en el registro).
    func testMetricasArranque() throws {
        let datos = Self.documentoGrande()
        let raiz = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let carpeta = raiz.appendingPathComponent("A", isDirectory: true)
        try FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
        try datos.write(to: carpeta.appendingPathComponent("base.json"))
        let opciones = XCTMeasureOptions()
        opciones.iterationCount = Self.vueltas
        measure(metrics: [XCTClockMetric(), XCTCPUMetric(), XCTMemoryMetric()], options: opciones) {
            let hecho = expectation(description: "arranque")
            Task { @MainActor in
                let almacen = AlmacenLocal(raiz: raiz)
                let sync = SyncEngine(auth: AuthFalsa(nil), remoto: RemotoFalso("{}"), almacen: almacen)
                await sync.iniciar(uid: "A")
                if let doc = await sync.documentoVisible() {
                    let v = await Task.detached { VistaInicio.desde(doc) }.value
                    self.pintar(self.inicio(v))
                }
                hecho.fulfill()
            }
            wait(for: [hecho], timeout: 60)
        }
        try? FileManager.default.removeItem(at: raiz)
    }
}
