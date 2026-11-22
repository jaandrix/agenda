import XCTest
@testable import BitacoraNative

// Listas de Panorama (0.27): las mismas acciones que listasAplicarOp en js/listas.js, idempotentes y sin tocar lo ajeno.
final class ListasTests: XCTestCase {
    private func doc(_ json: String) throws -> DocumentoBitacora { try DocumentoBitacora(datos: Data(json.utf8)) }
    private func op(_ d: [String: JSONValue]) -> OperacionBitacora { ListasOp.op(d) }
    private func listas(_ d: DocumentoBitacora) -> [JSONValue] { (((try? d.valor(de: "listasPanorama")) ?? nil)?.lista) ?? [] }

    private let base = #"{"listasPanorama":[{"id":"c1","titulo":"casa","tareas":[{"id":"a","texto":"pintar","hecha":false,"hijos":[{"id":"a1","texto":"comprar pintura","hecha":false,"hijos":[]},{"id":"a2","texto":"lijar","hecha":true,"hechaEn":"2026-11-01T10:00:00.000Z","hijos":[]}]},{"id":"b","texto":"llamar","hecha":false,"hijos":[],"otro":"se conserva"}]},{"id":"c2","titulo":"otra","tareas":[]}],"dayPlanner":{"days":{},"backlog":[]}}"#

    func testLecturaContadoresYNiveles() throws {
        let v = VistaListas.desde(try doc(base))
        XCTAssertEqual(v.cajas.map(\.id), ["c1", "c2"])
        let c = v.cajas[0]
        XCTAssertEqual(c.total, 4)
        XCTAssertEqual(c.hechas, 1)
        XCTAssertEqual(c.filas.map(\.id), ["a", "a1", "a2", "b"])
        let a = c.filas[0]
        XCTAssertEqual(a.hijas, 2)
        XCTAssertEqual(a.hijasHechas, 1)
        XCTAssertEqual(a.pendientesDebajo, 1)
        XCTAssertEqual(c.filas[1].nivel, 1)
        XCTAssertEqual(c.filas[1].padreId, "a")
        XCTAssertEqual(c.filas[3].previaId, "a")
        XCTAssertEqual(v.pendientes, 3)
    }

    func testAnadirMarcarConSubtareasYEsIdempotente() throws {
        let d = try doc(base)
        let anadir = op(["accion": .string("anadir"), "lista": .string("c1"), "padre": .string("b"), "tareas": .array([ListasOp.nodo("b1", "número")])])
        let marcar = op(["accion": .string("editar"), "lista": .string("c1"), "id": .string("a"), "hecha": .bool(true), "conSubtareas": .bool(true),
                         "cuando": .string("2026-11-22T10:00:00.000Z")])
        let (r, parche) = AplicarOperaciones.sobre(d, [anadir, marcar])
        XCTAssertEqual(Array(parche.keys), ["listasPanorama"])
        let c = VistaListas.desde(r).cajas[0]
        XCTAssertEqual(c.filas.first { $0.id == "b1" }?.padreId, "b")
        XCTAssertTrue(c.filas.filter { ["a", "a1", "a2"].contains($0.id) }.allSatisfy(\.hecha))
        // La que ya estaba hecha conserva su hechaEn.
        let a2 = ListasOp.ruta("a2", listas(r)[0]["tareas"]?.lista ?? []).flatMap { ListasOp.nodo(listas(r)[0]["tareas"]?.lista ?? [], $0) }
        XCTAssertEqual(a2?["hechaEn"]?.texto, "2026-11-01T10:00:00.000Z")
        XCTAssertEqual(listas(r)[0]["tareas"]?.lista?[1]["otro"]?.texto, "se conserva")
        XCTAssertTrue(AplicarOperaciones.sobre(r, [anadir, marcar]).1.isEmpty)
    }

    func testMeterSacarYLimiteDeNiveles() throws {
        let d = try doc(base)
        // meter «b» dentro de «a» (su anterior), al final.
        let (r, _) = AplicarOperaciones.sobre(d, [op(["accion": .string("mover"), "lista": .string("c1"), "id": .string("b"), "padre": .string("a")])])
        XCTAssertEqual(VistaListas.desde(r).cajas[0].filas.map(\.id), ["a", "a1", "a2", "b"])
        XCTAssertEqual(VistaListas.desde(r).cajas[0].filas.last?.padreId, "a")
        // sacarla: detrás de su madre.
        let (r2, _) = AplicarOperaciones.sobre(r, [op(["accion": .string("mover"), "lista": .string("c1"), "id": .string("b"), "indice": .number("1")])])
        XCTAssertEqual(VistaListas.desde(r2).cajas[0].filas.map { "\($0.id):\($0.nivel)" }, ["a:0", "a1:1", "a2:1", "b:0"])
        // Una rama de tres niveles no cabe dentro de una tarea de nivel 2.
        let tres = ListasOp.nodo("x", "x")
        var conHijos = tres.objeto!
        conHijos["hijos"] = .array([.object(["id": .string("y"), "texto": .string("y"), "hecha": .bool(false), "hijos": .array([ListasOp.nodo("z", "z")])])])
        let (r3, _) = AplicarOperaciones.sobre(d, [op(["accion": .string("anadir"), "lista": .string("c1"), "tareas": .array([.object(conHijos)])])])
        let (r4, p4) = AplicarOperaciones.sobre(r3, [op(["accion": .string("mover"), "lista": .string("c1"), "id": .string("x"), "padre": .string("a1")])])
        XCTAssertTrue(p4.isEmpty)
        XCTAssertEqual(VistaListas.desde(r4).cajas[0].filas.first { $0.id == "x" }?.nivel, 0)
        // No se puede meter una tarea dentro de su propia rama.
        XCTAssertTrue(AplicarOperaciones.sobre(d, [op(["accion": .string("mover"), "lista": .string("c1"), "id": .string("a"), "padre": .string("a1")])]).1.isEmpty)
    }

    func testOtraCajaOrdenarYDeshacerBorrados() throws {
        let d = try doc(base)
        let (r, _) = AplicarOperaciones.sobre(d, [op(["accion": .string("mover"), "lista": .string("c1"), "id": .string("b"), "aLista": .string("c2")]),
                                                 op(["accion": .string("mover_lista"), "lista": .string("c2"), "indice": .number("0")])])
        let v = VistaListas.desde(r)
        XCTAssertEqual(v.cajas.map(\.id), ["c2", "c1"])
        XCTAssertEqual(v.cajas[0].filas.map(\.id), ["b"])
        // Borrar una caja y restaurarla en su sitio, con todo lo que tenía.
        let caja = listas(r)[1]
        let (sin, _) = AplicarOperaciones.sobre(r, [op(["accion": .string("borrar_lista"), "lista": .string("c1")])])
        XCTAssertEqual(VistaListas.desde(sin).cajas.map(\.id), ["c2"])
        let restaurar = op(["accion": .string("restaurar_lista"), "caja": caja, "indice": .number("1")])
        let (otra, _) = AplicarOperaciones.sobre(sin, [restaurar])
        XCTAssertEqual(listas(otra), listas(r))
        XCTAssertTrue(AplicarOperaciones.sobre(otra, [restaurar]).1.isEmpty)
        // Borrar una tarea y volver a ponerla en su sitio.
        let tareas = listas(d)[0]["tareas"]?.lista ?? []
        let (sinA, _) = AplicarOperaciones.sobre(d, [op(["accion": .string("borrar"), "lista": .string("c1"), "id": .string("a")])])
        let (conA, _) = AplicarOperaciones.sobre(sinA, [op(["accion": .string("anadir"), "lista": .string("c1"), "indice": .number("0"), "tareas": .array([tareas[0]])])])
        XCTAssertEqual(listas(conA), listas(d))
    }

    func testQuitarHechasOcultarYPlegar() throws {
        let d = try doc(base)
        let (r, _) = AplicarOperaciones.sobre(d, [op(["accion": .string("lista"), "lista": .string("c1"), "ocultarHechas": .bool(true), "color": .string("menta")]),
                                                 op(["accion": .string("plegar_todo"), "lista": .string("c1"), "plegada": .bool(true)])])
        let c = VistaListas.desde(r).cajas[0]
        XCTAssertEqual(c.color, "menta")
        XCTAssertEqual(c.filas.map(\.id), ["a", "b"], "plegada: sus hijas no se ven")
        let (q, _) = AplicarOperaciones.sobre(d, [op(["accion": .string("quitar_hechas"), "lista": .string("c1")])])
        XCTAssertEqual(VistaListas.desde(q).cajas[0].total, 3)
    }

    func testAHoyYMarcarEnElPlanMarcaLaLista() throws {
        let d = try doc(base)
        let hoy = "2026-11-22"
        let aHoy = OperacionesExtra.op(ListasOp.aHoy, ["lista": .string("c1"), "id": .string("b"), "idTarea": .string("planner_1_x"), "dia": .string(hoy), "titulo": .string("casa: llamar")])
        let (r, parche) = AplicarOperaciones.sobre(d, [aHoy])
        XCTAssertEqual(Array(parche.keys), ["dayPlanner"])
        let t = (((try? r.valor(de: "dayPlanner")) ?? nil)?["days"]?[hoy]?.lista ?? []).first
        XCTAssertEqual(t?["listaTareaId"]?.texto, "b")
        XCTAssertEqual(t?["title"]?.texto, "casa: llamar")
        // Otra vez (o con otro id para la misma tarea de la lista): no se repite.
        let otra = OperacionesExtra.op(ListasOp.aHoy, ["lista": .string("c1"), "id": .string("b"), "idTarea": .string("planner_2_y"), "dia": .string(hoy), "titulo": .string("x")])
        XCTAssertTrue(AplicarOperaciones.sobre(r, [aHoy, otra]).1.isEmpty)
        // listaTareaDesdePlanner: marcar en el plan la marca en la lista; desmarcar la desmarca.
        let (m, p2) = AplicarOperaciones.sobre(r, [.marcarTarea(id: "planner_1_x", hecha: true, momentoMs: 1_763_800_000_000)])
        XCTAssertNotNil(p2["listasPanorama"])
        XCTAssertTrue(VistaListas.desde(m).cajas[0].filas.first { $0.id == "b" }?.hecha == true)
        let (n, _) = AplicarOperaciones.sobre(m, [.marcarTarea(id: "planner_1_x", hecha: false, momentoMs: 1_763_800_100_000)])
        XCTAssertTrue(VistaListas.desde(n).cajas[0].filas.first { $0.id == "b" }?.hecha == false)
    }

    func testIdRepetidoSeQuedaEnSuPrimerSitio() throws {
        let d = try doc(#"{"listasPanorama":[{"id":"c","titulo":"","tareas":[{"id":"t","texto":"uno","hecha":false,"hijos":[]},{"id":"p","texto":"dos","hecha":false,"hijos":[{"id":"t","texto":"uno bis","hecha":false,"hijos":[]}]}]}]}"#)
        XCTAssertEqual(VistaListas.desde(d).cajas[0].filas.map(\.texto), ["uno", "dos"])
    }

    func testLimpiarVinetasAlPegar() {
        XCTAssertEqual(CajaListaView.limpiar("- leche"), "leche")
        XCTAssertEqual(CajaListaView.limpiar("2) pan  de   molde"), "pan de molde")
        XCTAssertEqual(CajaListaView.limpiar("[x] hecho"), "hecho")
    }

    func testRecuerdosDeEsteDia() throws {
        let d = try doc(#"{"entries":[{"id":"e1","type":"travel","destination":"Roma","date":"2024-11-22"},{"id":"planner_done_1","title":"Completado: x","date":"2025-11-22"},{"id":"e2","type":"event","title":"hoy","date":"2026-11-22"}],"notes":[{"id":"n1","date":"2025-11-22","title":""}]}"#)
        let r = Recuerdo.deHoy(d, hoy: LocalDay(iso: "2026-11-22")!)
        XCTAssertEqual(r.map(\.id), ["n1", "e1"])
        XCTAssertEqual(r.last?.titulo, "Roma")
        XCTAssertEqual(r.last?.vista, "travels")
        XCTAssertEqual(r.first?.titulo, "#22/11/2025")
    }

    func testNombreDeArchivoComoLaWeb() {
        XCTAssertEqual(DocumentosView.nombreLimpio("Póliza del coche (2026).PDF"), "Poliza_del_coche_2026.pdf")
        XCTAssertEqual(DocumentosView.nombreLimpio("¿?.pdf"), "archivo.pdf")
    }
}
