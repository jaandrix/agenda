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

struct BuscarView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var texto = ""
    @State private var resultados: [ResultadoBusqueda] = []
    @FocusState private var foco: Bool

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                CabeceraApartado(titulo: "buscar", contexto: nil) { EmptyView() }
                TextField("eventos, tareas, notas, asignaturas, ocio.", text: $texto)
                    .font(Tipo.cuerpo).foregroundStyle(Paleta.texto).focused($foco)
                    .textInputAutocapitalization(.never).autocorrectionDisabled().submitLabel(.search)
                    .padding(.horizontal, 14).frame(minHeight: 48)
                    .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
                    .padding(.top, Espacio.m)
                if texto.count >= 2 && resultados.isEmpty {
                    Text("nada con «\(texto)».").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.top, Espacio.l)
                }
                ForEach(resultados) { r in
                    Button { c.abrirApartado(r.vista) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.titulo).font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto).lineLimit(2)
                            Text(r.detalle).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        }
                        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                        .contentShape(Rectangle())
                        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20).padding(.bottom, Espacio.xl)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .background(Paleta.fondo.ignoresSafeArea())
        .onAppear { foco = true }
        .task(id: texto) {
            try? await Task.sleep(for: .milliseconds(150))
            guard !Task.isCancelled else { return }
            let doc = await c.documentoVisible(), q = texto
            resultados = await Task.detached(priority: .userInitiated) { doc.map { LecturaBusqueda.resultados($0, q) } ?? [] }.value
        }
    }
}
