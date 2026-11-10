import SwiftUI

// Objetivos (renderGoals en js/notas-objetivos.js, saveEntry type goal en js/entradas.js): entradas `type: goal` con plazo,
// estado, hitos y, si son numéricos, valor actual, meta y unidad. El método Harada, el kaizen y el kanban arrastrable
// siguen en la web: PLAN-0.17.md.

struct HitoObjetivo: Sendable, Identifiable, Equatable { let texto: String; let hecho: Bool; var id: String { texto } }

struct Objetivo: Sendable, Identifiable, Equatable {
    let id, titulo, plazo, estado, unidad, notas: String
    let numerico: Bool
    let actual, meta: Decimal
    let hitos: [HitoObjetivo]

    // goalProgressPct: solo los numéricos con meta.
    var porcentaje: Int? {
        guard numerico, meta > 0 else { return nil }
        let p = NSDecimalNumber(decimal: actual / meta * 100).doubleValue
        return max(0, min(100, Int(p.rounded())))
    }
}

enum LecturaObjetivos {
    static let plazos: [(String, String)] = [("short", "corto plazo"), ("medium", "medio plazo"), ("long", "largo plazo")]
    static let estados = ["Pendiente", "En progreso", "Completado"]

    static func normal(_ t: String) -> String {
        t.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES")).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func objetivos(_ doc: DocumentoBitacora) -> [Objetivo] {
        (((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []).compactMap { x -> Objetivo? in
            guard let o = x.objeto, o["type"]?.texto == "goal", let id = o["id"]?.comoId else { return nil }
            let hitos = (o["milestones"]?.lista ?? []).compactMap { h -> HitoObjetivo? in
                guard let t = h["text"]?.texto, !t.isEmpty else { return nil }
                return HitoObjetivo(texto: t, hecho: h["done"]?.booleano == true)
            }
            return Objetivo(id: id, titulo: o["title"]?.texto ?? "", plazo: o["term"]?.texto ?? "short", estado: o["status"]?.texto ?? "Pendiente",
                            unidad: o["unit"]?.texto ?? "", notas: o["notes"]?.texto ?? "", numerico: o["goalType"]?.texto == "numeric",
                            actual: Dinero.decimal(o["currentValue"]) ?? 0, meta: Dinero.decimal(o["targetValue"]) ?? 0, hitos: hitos)
        }
    }

    // goalNumber: hasta dos decimales, con la coma.
    static func cifra(_ d: Decimal) -> String {
        let f = NumberFormatter(); f.locale = Locale(identifier: "es_ES"); f.maximumFractionDigits = 2; f.numberStyle = .decimal
        return f.string(from: NSDecimalNumber(decimal: d)) ?? "\(d)"
    }
}

private struct ObjetivoAbierto: Identifiable { let id: String }
private struct EdicionObjetivo: Identifiable { let objetivo: Objetivo?; var id: String { objetivo?.id ?? "nuevo" } }

struct ObjetivosView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var objetivos: [Objetivo]?
    @State private var abierto: ObjetivoAbierto?
    @State private var edicion: EdicionObjetivo?

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                CabeceraContexto(titulo: "objetivos", detalle: objetivos.map { "\($0.filter { $0.estado == "Completado" }.count) de \($0.count) cumplidos." }) {
                    Text("lo que persigues.").font(Tipo.poppins(24, .bold, estilo: .title3)).foregroundStyle(Paleta.sobreContexto)
                    Text("hitos y progreso.").font(Tipo.pie).foregroundStyle(Paleta.sobreContextoSuave)
                }
                VStack(alignment: .leading, spacing: 0) {
                    HStack { Spacer(); AccionTexto(texto: "+ objetivo.") { edicion = EdicionObjetivo(objetivo: nil) } }.padding(.vertical, Espacio.xs)
                    if let objetivos {
                        if objetivos.isEmpty { Text("ningún objetivo todavía.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.l) }
                        ForEach(LecturaObjetivos.plazos, id: \.0) { plazo in
                            let grupo = objetivos.filter { $0.plazo == plazo.0 }
                            if !grupo.isEmpty {
                                CabeceraSeccion(titulo: plazo.1 + ".", detalle: "\(grupo.count)")
                                ForEach(grupo) { fila($0) }
                            }
                        }
                    } else { ProgressView().frame(maxWidth: .infinity).padding(.top, Espacio.xl) }
                }.modifier(HojaContenido())
            }
        }
        .background(Paleta.fondo.ignoresSafeArea()).scrollIndicators(.hidden)
        .refreshable { await c.sincronizar() }.task(id: c.informe.revision) { await cargar() }
        .sheet(item: $abierto) { a in FichaObjetivo(id: a.id).environment(c) }
        .sheet(item: $edicion) { e in EditorObjetivo(objetivo: e.objetivo).environment(c) }
    }

    private func fila(_ g: Objetivo) -> some View {
        Button { abierto = ObjetivoAbierto(id: g.id) } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(g.titulo.lowercased() + ".").font(Tipo.cuerpoFuerte).foregroundStyle(g.estado == "Completado" ? Paleta.textoSecundario : Paleta.texto)
                    .strikethrough(g.estado == "Completado", color: Paleta.textoSecundario)
                Text(detalle(g)).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                if let p = g.porcentaje { BarraObjetivo(porcentaje: p) }
            }.frame(maxWidth: .infinity, minHeight: 56, alignment: .leading).padding(.vertical, 6)
                .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
        }.buttonStyle(.plain)
        .contextMenu {
            Button("editar.") { edicion = EdicionObjetivo(objetivo: g) }
            Button("eliminar.", role: .destructive) { Task { try? await c.encolar(.borrarEntrada(id: g.id)) } }
        }
    }

    private func detalle(_ g: Objetivo) -> String {
        var partes = [g.estado.lowercased()]
        if g.numerico { partes.append("\(LecturaObjetivos.cifra(g.actual)) de \(LecturaObjetivos.cifra(g.meta))\(g.unidad.isEmpty ? "" : " " + g.unidad)") }
        if !g.hitos.isEmpty { partes.append("\(g.hitos.filter(\.hecho).count) de \(g.hitos.count) hitos") }
        return partes.joined(separator: ", ") + "."
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        objetivos = await Task.detached(priority: .userInitiated) { doc.map { LecturaObjetivos.objetivos($0) } }.value
    }
}

private struct BarraObjetivo: View {
    let porcentaje: Int
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Paleta.borde)
                Capsule().fill(Paleta.acento).frame(width: g.size.width * CGFloat(porcentaje) / 100)
            }
        }.frame(height: 6)
        .accessibilityElement().accessibilityLabel("progreso").accessibilityValue("\(porcentaje) %")
    }
}

private struct FichaObjetivo: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let id: String
    @State private var objetivo: Objetivo?
    @State private var nuevoHito = ""
    @State private var actual = ""
    @State private var editando = false

    var body: some View {
        NavigationStack {
            List {
                if let g = objetivo {
                    Section {
                        LabeledContent("estado.", value: g.estado.lowercased())
                        LabeledContent("plazo.", value: LecturaObjetivos.plazos.first { $0.0 == g.plazo }?.1 ?? g.plazo)
                        if !g.notas.isEmpty { Text(g.notas).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
                    }
                    if g.numerico {
                        Section("progreso.") {
                            LabeledContent("llevas.", value: "\(LecturaObjetivos.cifra(g.actual)) de \(LecturaObjetivos.cifra(g.meta))\(g.unidad.isEmpty ? "" : " " + g.unidad)")
                            if let p = g.porcentaje { BarraObjetivo(porcentaje: p) }
                            HStack {
                                TextField("nuevo valor.", text: $actual).keyboardType(.decimalPad)
                                Button("apuntar.") {
                                    let v = actual.replacingOccurrences(of: ",", with: ".")
                                    guard Dinero.decimal(texto: v) != nil else { return }
                                    enviar(.progreso(actual: v)); actual = ""
                                }.disabled(Dinero.decimal(texto: actual.replacingOccurrences(of: ",", with: ".")) == nil)
                            }
                        }
                    }
                    Section("hitos.") {
                        ForEach(g.hitos) { h in
                            Button { enviar(.hitoHecho(texto: h.texto, hecho: !h.hecho)) } label: {
                                Label(h.texto, systemImage: h.hecho ? "checkmark.circle.fill" : "circle").foregroundStyle(h.hecho ? Paleta.textoSecundario : Paleta.texto)
                            }
                            .accessibilityValue(h.hecho ? "hecho" : "pendiente")
                            .swipeActions { Button("borrar", role: .destructive) { enviar(.quitarHito(texto: h.texto)) } }
                        }
                        HStack {
                            TextField("un hito.", text: $nuevoHito).submitLabel(.done).onSubmit(anadirHito)
                            Button("añadir.", action: anadirHito).disabled(nuevoHito.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                    }
                } else { ProgressView() }
            }
            .font(Tipo.cuerpo)
            .navigationTitle((objetivo?.titulo ?? "objetivo").lowercased() + ".").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } }
                ToolbarItem(placement: .primaryAction) { Button("editar.") { editando = true }.disabled(objetivo == nil) }
            }
            .sheet(isPresented: $editando) { EditorObjetivo(objetivo: objetivo).environment(c) }
            .task(id: c.informe.revision) { await cargar() }
        }
    }

    private func anadirHito() {
        let t = nuevoHito.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        enviar(.hito(texto: t)); nuevoHito = ""
    }

    private func enviar(_ cambio: CambioObjetivo) { Task { try? await c.encolar(.cambiarObjetivo(objetivoId: id, cambio: cambio)) } }

    private func cargar() async {
        let doc = await c.documentoVisible()
        let gid = id
        objetivo = await Task.detached(priority: .userInitiated) { doc.flatMap { LecturaObjetivos.objetivos($0).first { $0.id == gid } } }.value
    }
}

private struct EditorObjetivo: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let objetivo: Objetivo?
    @State private var titulo: String
    @State private var plazo: String
    @State private var estado: String
    @State private var numerico: Bool
    @State private var actual: String
    @State private var meta: String
    @State private var unidad: String
    @State private var notas: String
    @State private var id: String
    @State private var confirmarBorrado = false

    init(objetivo: Objetivo?) {
        self.objetivo = objetivo
        _titulo = State(initialValue: objetivo?.titulo ?? ""); _plazo = State(initialValue: objetivo?.plazo ?? "short")
        _estado = State(initialValue: objetivo?.estado ?? "Pendiente"); _numerico = State(initialValue: objetivo?.numerico ?? false)
        _actual = State(initialValue: objetivo.map { NSDecimalNumber(decimal: $0.actual).stringValue } ?? "")
        _meta = State(initialValue: objetivo.map { NSDecimalNumber(decimal: $0.meta).stringValue } ?? "")
        _unidad = State(initialValue: objetivo?.unidad ?? ""); _notas = State(initialValue: objetivo?.notas ?? "")
        _id = State(initialValue: objetivo?.id ?? OperacionBitacora.nuevoIdEntrada())
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("qué quieres conseguir.", text: $titulo)
                Picker("plazo.", selection: $plazo) { ForEach(LecturaObjetivos.plazos, id: \.0) { p in Text(p.1 + ".").tag(p.0) } }
                Picker("estado.", selection: $estado) { ForEach(LecturaObjetivos.estados, id: \.self) { e in Text(e.lowercased() + ".").tag(e) } }
                Toggle("con una cifra.", isOn: $numerico)
                if numerico {
                    TextField("llevas.", text: $actual).keyboardType(.decimalPad)
                    TextField("meta.", text: $meta).keyboardType(.decimalPad)
                    TextField("unidad (libros, €, km).", text: $unidad)
                }
                Section("notas.") { TextEditor(text: $notas).frame(minHeight: 80) }
                if objetivo != nil { Section { Button("eliminar objetivo.", role: .destructive) { confirmarBorrado = true } } }
            }
            .navigationTitle(objetivo == nil ? "nuevo objetivo." : "objetivo.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        // «1.234,5» (como lo enseña cifra) o «12.5»: con coma, el punto es de miles.
                        let num = { (t: String) in t.contains(",") ? t.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".") : t }
                        Task { try? await c.encolar(.guardarObjetivo(id: id, titulo: titulo, plazo: plazo, numerico: numerico, actual: num(actual), meta: num(meta),
                                                                       unidad: unidad, estado: estado, notas: notas.trimmingCharacters(in: .whitespacesAndNewlines))) }
                        cerrar()
                    }.disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .confirmationDialog("¿eliminar este objetivo?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("eliminar.", role: .destructive) { Task { try? await c.encolar(.borrarEntrada(id: id)) }; cerrar() }
                Button("cancelar.", role: .cancel) {}
            }
        }
    }
}
