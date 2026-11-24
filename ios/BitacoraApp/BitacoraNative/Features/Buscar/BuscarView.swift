import SwiftUI

// Búsqueda global, solo en la copia local (sin red): apartados, eventos, tareas, notas, asignaturas y Ocio. Lo de un
// apartado oculto no sale. Cada resultado abre su sitio con `abrirApartado`.
struct ResultadoBusqueda: Sendable, Identifiable, Equatable {
    let id: String
    let titulo: String
    let detalle: String
    let vista: String
}

enum LecturaBusqueda {
    static func plegar(_ s: String) -> String { s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES")) }

    static func resultados(_ doc: DocumentoBitacora, _ texto: String, limite: Int = 60) -> [ResultadoBusqueda] {
        let q = plegar(texto.trimmingCharacters(in: .whitespacesAndNewlines))
        guard q.count >= 2 else { return [] }
        let ve = { (v: String) in Apartados.enMenu(v, doc) }
        let casa = { (s: String?) in s.map { plegar($0).contains(q) } ?? false }
        var r: [ResultadoBusqueda] = []
        for a in Apartados.visibles(doc).flatMap(\.1) where casa(a.nombre) {
            r.append(.init(id: "a:" + a.vista, titulo: a.nombre + ".", detalle: "apartado", vista: a.vista == "studies" ? Apartados.destinoEstudios(doc) : a.vista))
        }
        let tipos = ["book": "libro", "series": "serie", "movie": "película", "game": "videojuego"]
        for e in ((try? doc.valor(de: "entries")) ?? nil)?.lista ?? [] {
            guard let id = e["id"]?.comoId, e["calendarLog"]?.booleano != true, !id.hasPrefix("planner_done_"), !id.hasPrefix("recurring_done_") else { continue }
            let t = e["type"]?.texto ?? ""
            guard casa(e["title"]?.texto) || casa(e["author"]?.texto) || casa(e["place"]?.texto) else { continue }
            if let n = tipos[t], ve("culture") {
                r.append(.init(id: "o:" + id, titulo: e["title"]?.texto ?? "", detalle: n + (e["author"]?.texto.map { ", " + $0 } ?? ""), vista: "culture"))
            } else if ["event", "birthday", "travel"].contains(t), ve("calendar") {
                r.append(.init(id: "e:" + id, titulo: e["title"]?.texto ?? "", detalle: (e["date"]?.texto ?? "") + (e["time"]?.texto.map { $0.isEmpty ? "" : ", " + $0 } ?? ""), vista: "calendar"))
            } else if t == "project", ve("projects") {
                r.append(.init(id: "p:" + id, titulo: e["title"]?.texto ?? "", detalle: "proyecto", vista: "projects"))
            }
        }
        let p = AplicarOperaciones.planificador((try? doc.valor(de: "dayPlanner")) ?? nil)
        var tareas: [(String, JSONValue)] = (p["backlog"]?.lista ?? []).map { ("sin día", $0) }
        for (d, l) in p["days"]?.objeto ?? [:] { tareas += (l.lista ?? []).map { (d, $0) } }
        for (d, t) in tareas where casa(t["title"]?.texto) {
            r.append(.init(id: "t:" + (t["id"]?.comoId ?? UUID().uuidString), titulo: t["title"]?.texto ?? "", detalle: "tarea, " + d, vista: "planner"))
        }
        if ve("notes") {
            for n in ((try? doc.valor(de: "notes")) ?? nil)?.lista ?? [] {
                let txt = n["content"]?.texto ?? n["text"]?.texto ?? n["title"]?.texto ?? ""
                if casa(txt) { r.append(.init(id: "n:" + (n["id"]?.comoId ?? UUID().uuidString), titulo: String(txt.prefix(80)), detalle: "nota", vista: "notes")) }
            }
        }
        if ve("studies") {
            for s in ((try? doc.valor(de: "studies")) ?? nil)?["subjects"]?.lista ?? [] where casa(s["name"]?.texto) {
                r.append(.init(id: "s:" + (s["id"]?.comoId ?? UUID().uuidString), titulo: s["name"]?.texto ?? "", detalle: "asignatura", vista: "studies"))
            }
        }
        return Array(r.prefix(limite))
    }
}

// Buscar 2.0: el buscador en cápsula grande arriba, con foco al entrar, y los resultados en tarjetas blancas agrupadas
// por tipo (apartados, eventos, tareas…), cada fila con su IconoCuadrado.
struct BuscarView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    var inicial = ""
    @State private var texto = ""
    @State private var resultados: [ResultadoBusqueda] = []
    @State private var empezado = false
    @FocusState private var foco: Bool

    // Tipo de cada resultado por el prefijo de su id (lo pone LecturaBusqueda), en el orden en que se enseñan.
    static let grupos: [(prefijo: String, titulo: String, icono: String)] = [
        ("a:", "apartados", "menu"), ("e:", "eventos", "eventos"), ("t:", "tareas", "tarea"), ("n:", "notas", "notas"),
        ("s:", "asignaturas", "estudios"), ("p:", "proyectos", "proyectos"), ("o:", "ocio", "ocio"),
    ]

    struct Grupo: Identifiable {
        let titulo: String
        let icono: String
        let filas: [ResultadoBusqueda]
        var id: String { titulo }
    }

    static func agrupados(_ r: [ResultadoBusqueda]) -> [Grupo] {
        grupos.compactMap { g -> Grupo? in
            let filas = r.filter { $0.id.hasPrefix(g.prefijo) }
            return filas.isEmpty ? nil : Grupo(titulo: g.titulo, icono: g.icono, filas: filas)
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                Text("buscar.").font(Letra.titulo).foregroundStyle(Lienzo.tinta).kerning(-0.4)
                    .accessibilityAddTraits(.isHeader)
                BuscadorCapsula(texto: $texto, placeholder: "eventos, tareas, notas, asignaturas, ocio", enfocar: $foco)
                    .sombra(.suave)
                    .padding(.top, Medida.s)
                if texto.trimmingCharacters(in: .whitespaces).count < 2 {
                    EstadoVacio(texto: "escribe dos letras o más. se busca en la copia de este iphone, sin conexión.", icono: "buscar")
                        .padding(.top, Medida.l)
                        .transition(.opacity)
                } else if resultados.isEmpty {
                    EstadoVacio(texto: "nada con «\(texto)».", icono: "buscar")
                        .padding(.top, Medida.l)
                        .transition(.opacity)
                }
                ForEach(Array(Self.agrupados(resultados).enumerated()), id: \.element.id) { i, g in
                    VStack(alignment: .leading, spacing: Medida.xs) {
                        HStack {
                            EtiquetaSeccion(texto: g.titulo)
                            Chip(texto: "\(g.filas.count)").monospacedDigit()
                        }
                        TarjetaFilas {
                            ForEach(Array(g.filas.enumerated()), id: \.element.id) { n, r in
                                if n > 0 { SeparadorMenu() }
                                Button { foco = false; c.abrirApartado(r.vista) } label: {
                                    FilaTarjeta(icono: g.titulo == "apartados" ? r.vista : g.icono, titulo: r.titulo, detalle: r.detalle) { FlechaFila() }
                                        .padding(.horizontal, Medida.rellenoTarjeta)
                                }
                                .buttonStyle(EstiloFilaMenu())
                            }
                        }
                    }
                    .padding(.top, Medida.entreSecciones)
                    .entradaEscalonada(i)
                }
            }
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: resultados)
            .padding(.horizontal, Medida.margen).padding(.bottom, Medida.entreSecciones)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
        .onAppear {
            if !empezado { empezado = true; texto = inicial }
            foco = true
        }
        .task(id: texto) {
            try? await Task.sleep(for: .milliseconds(150))
            guard !Task.isCancelled else { return }
            let doc = await c.documentoVisible(), q = texto
            guard let nuevo = await ultimaGana({ doc.map { LecturaBusqueda.resultados($0, q) } ?? [] }) else { return }
            resultados = nuevo
        }
    }
}
