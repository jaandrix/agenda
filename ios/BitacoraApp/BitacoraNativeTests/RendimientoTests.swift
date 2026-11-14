import XCTest
@testable import BitacoraNative

// 0.21: documentoVisible aplica solo lo nuevo de la cola. Comprueba que da lo mismo que aplicar la cola entera sobre la
// base y deja la medida en el registro de la compilación (una línea «warning: BitacoraNative medida»).
final class RendimientoTests: XCTestCase {
    private func baseGrande(movimientos: Int) -> String {
        let tx = (0..<movimientos).map { n in
            #"{"id":"ptx_\#(n)","date":"2026-\#(String(format: "%02d", n % 12 + 1))-10","account":"bancos","type":"expense","amount":\#(n % 90 + 1).5,"note":"compra \#(n)","category":"cat_comida"}"#
        }.joined(separator: ",")
        let items = (0..<60).map { #"{"id":"i\#($0)","texto":"producto \#($0)","hecho":false}"# }.joined(separator: ",")
        return #"{"financePro":{"accounts":[],"transactions":[\#(tx)]},"listaCompra":{"actual":"l1","listas":[{"id":"l1","nombre":"Casa","items":[\#(items)]}]},"dayPlanner":{"days":{},"backlog":[]},"ajeno":{"x":[1,2,3]}}"#
    }

    private func movimiento(_ n: Int) -> OperacionBitacora {
        .crearMovimiento(id: "ptx_q_\(n)", tipo: "expense", importe: "3.20", cuenta: "bancos", categoria: nil, fecha: "2026-11-14", hora: "", concepto: "café \(n)")
    }

    private func medir(_ f: () -> Void) -> Double {
        let t0 = DispatchTime.now().uptimeNanoseconds
        f()
        return Double(DispatchTime.now().uptimeNanoseconds - t0) / 1_000_000
    }

    func testColaIncrementalIgualQueEntera() async throws {
        let almacen = almacenTemporal()
        try await almacen.guardarBase(Data(baseGrande(movimientos: 3000).utf8), uid: "A")
        let sync = SyncEngine(auth: AuthFalsa(nil), remoto: RemotoFalso("{}"), almacen: almacen)
        await sync.iniciar(uid: "A")
        var ops: [OperacionBitacora] = []
        for n in 0..<30 { ops.append(movimiento(n)) }
        try await sync.encolar(ops)
        _ = await sync.documentoVisible()
        // Toques en Despensa con 30 movimientos en cola.
        var incremental: [Double] = []
        for n in 0..<10 {
            let op = OperacionesDespensa.marcarOp(listaId: "l1", id: "i\(n)", hecho: true)
            try await sync.encolar(op)
            ops.append(op)
            let t0 = DispatchTime.now().uptimeNanoseconds
            _ = await sync.documentoVisible()
            incremental.append(Double(DispatchTime.now().uptimeNanoseconds - t0) / 1_000_000)
        }
        let quizaVisible = await sync.documentoVisible()
        let visible = try XCTUnwrap(quizaVisible)
        let datosBase = await almacen.leerBase(uid: "A")
        let base = try DocumentoBitacora(datos: XCTUnwrap(datosBase))
        var entera = base
        let tEntera = medir { entera = AplicarOperaciones.sobre(base, ops).0 }
        for k in ["financePro", "listaCompra", "dayPlanner", "ajeno"] {
            XCTAssertEqual(try visible.valor(de: k), try entera.valor(de: k), k)
        }
        XCTAssertEqual(visible.bytes(de: "ajeno"), base.bytes(de: "ajeno"))
        let media = incremental.reduce(0, +) / Double(incremental.count)
        print(String(format: "::warning title=medida::warning: BitacoraNative medida documentoVisible con 3000 movimientos y 40 en cola: cola entera %.1f ms, solo lo nuevo %.1f ms de media", tEntera, media))
    }
}
