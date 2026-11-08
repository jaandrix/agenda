import SwiftUI

enum Carga<T: Equatable>: Equatable {
    case cargando
    case lista(T)
    case vacia
}

@MainActor
@Observable
final class PlanModel {
    private(set) var carga: Carga<VistaPlan> = .cargando
    private(set) var aviso: String?
    private(set) var marcadas = 0
    var desplazamiento = 0
    @ObservationIgnored private var enVuelo = Set<String>()

    // Solo decodifica `dayPlanner` y `recurringTasks`, fuera del hilo principal.
    func cargar(_ c: AppCoordinator) async {
        let doc = await c.documentoVisible()
        let d = desplazamiento
        let vista: VistaPlan? = await Task.detached(priority: .userInitiated) {
            guard let doc else { return nil }
            return LecturaPlanificador.vista(doc, desplazamiento: d)
        }.value
        guard d == desplazamiento else { return }
        if var vista {
            // Lo que se está guardando ahora mismo conserva el estado que ya se ve.
            if case .lista(let antes) = carga {
                for i in vista.tareas.indices where enVuelo.contains(vista.tareas[i].id) {
                    if let t = antes.tareas.first(where: { $0.id == vista.tareas[i].id }) { vista.tareas[i].hecha = t.hecha }
                }
            }
            carga = .lista(vista)
        } else if case .cargando = carga {
            carga = .vacia
        }
    }

    // Se ve al momento; el cambio va a la cola en disco y, si eso falla, vuelve atrás y avisa.
    func marcar(_ t: TareaPlan, enSinDia: Bool, _ c: AppCoordinator) async {
        guard !enVuelo.contains(t.id), case .lista(var v) = carga else { return }
        let hecha = !t.hecha
        if enSinDia { v.sinDia.removeAll { $0.id == t.id } } else if let i = v.tareas.firstIndex(where: { $0.id == t.id }) { v.tareas[i].hecha = hecha }
        enVuelo.insert(t.id)
        carga = .lista(v)
        if hecha { marcadas += 1 }
        defer { enVuelo.remove(t.id) }
        await guardar(.marcarTarea(id: t.id, hecha: hecha, momentoMs: Self.ahoraMs), c)
    }

    func marcar(_ r: RecurrenteHoy, _ c: AppCoordinator) async {
        guard !enVuelo.contains(r.id), case .lista(var v) = carga, let i = v.recurrentes.firstIndex(where: { $0.id == r.id }) else { return }
        v.recurrentes[i].hecha.toggle()
        let hecha = v.recurrentes[i].hecha
        enVuelo.insert(r.id)
        carga = .lista(v)
        if hecha { marcadas += 1 }
        defer { enVuelo.remove(r.id) }
        await guardar(.marcarRecurrente(id: r.id, dia: v.hoyCivil.iso, hecha: hecha, momentoMs: Self.ahoraMs), c)
    }

    func guardar(_ op: OperacionBitacora, _ c: AppCoordinator) async {
        aviso = nil
        do { try await c.encolar(op) } catch {
            aviso = "no se pudo guardar el cambio en este iPhone."
            await cargar(c)
        }
    }

    static var ahoraMs: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
}

struct PlanView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var modelo = PlanModel()

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: Espacio.s) {
                    Picker("día.", selection: $modelo.desplazamiento) {
                        Text("hoy.").tag(0)
                        Text("mañana.").tag(1)
                        Text("pasado.").tag(2)
                    }
                    .pickerStyle(.segmented)
                    HStack(spacing: Espacio.s) {
                        IndicadorSync(estado: c.informe.estado)
                        if c.informe.pendientes > 0 {
                            Text("\(c.informe.pendientes) por subir.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        }
                    }
                }
                .listRowBackground(Color.clear)
            }
            if let aviso = modelo.aviso {
                Section { Text(aviso).font(Tipo.cuerpo).foregroundStyle(Paleta.error) }
            }
            switch modelo.carga {
            case .cargando:
                Section { ProgressView().frame(maxWidth: .infinity) }.listRowBackground(Color.clear)
            case .vacia:
                Section {
                    Text("aún no hay copia de tus datos en este iPhone. se traerá en cuanto haya red.")
                        .font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario)
                }
            case .lista(let v):
                dia(v)
                if !v.recurrentes.isEmpty {
                    Section {
                        ForEach(v.recurrentes) { r in
                            Fila(titulo: r.texto, hora: nil, hecha: r.hecha, acento: false) { Task { await modelo.marcar(r, c) } }
                        }
                    } header: { cabecera("recurrentes de hoy.") }
                }
                sinDia(v)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Paleta.fondo)
        .navigationTitle(titulo)
        .toolbar {
            if case .lista(let v) = modelo.carga, !v.tareas.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: texto(v)) { Image(systemName: "square.and.arrow.up") }.accessibilityLabel("compartir el día")
                }
            }
        }
        .refreshable { await c.sincronizar() }
        .sensoryFeedback(.success, trigger: modelo.marcadas)
        .task(id: "\(c.informe.revision)-\(modelo.desplazamiento)") { await modelo.cargar(c) }
    }

    @ViewBuilder private func dia(_ v: VistaPlan) -> some View {
        Section {
            if v.tareas.isEmpty {
                Text("nada todavía.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).listRowBackground(Paleta.superficie)
            }
            ForEach(v.tareas) { t in
                Fila(titulo: t.titulo, hora: t.hora, hecha: t.hecha, acento: t.arrastrada, notas: t.notas) {
                    Task { await modelo.marcar(t, enSinDia: false, c) }
                } abrir: { editar(t, dia: v.dia) }
                .swipeActions(edge: .trailing) {
                    if !t.deTrabajo {
                        Button("borrar.", role: .destructive) { Task { await modelo.guardar(.borrarTarea(id: t.id), c) } }
                        Button("sin día.") { Task { await modelo.guardar(.moverTarea(id: t.id, dia: nil), c) } }
                    }
                }
                .swipeActions(edge: .leading) {
                    if !t.deTrabajo { Button(modelo.desplazamiento == 0 ? "mañana." : "hoy.") {
                        let destino = modelo.desplazamiento == 0 ? v.dia.sumando(dias: 1) : v.dia.sumando(dias: -modelo.desplazamiento)
                        Task { await modelo.guardar(.moverTarea(id: t.id, dia: destino.iso), c) }
                    }
                    .tint(Paleta.acento) }
                }
            }
            botonNueva("+ tarea.") { c.modal = .tarea(EditorTarea(id: OperacionBitacora.nuevoIdTarea(), nueva: true, dia: v.dia)) }
        } header: {
            let hechas = v.tareas.filter(\.hecha).count
            cabecera("\(v.tareas.count - hechas) pendientes, \(hechas) hechas")
        }
    }

    @ViewBuilder private func sinDia(_ v: VistaPlan) -> some View {
        Section {
            ForEach(v.sinDia) { t in
                Fila(titulo: t.titulo, hora: nil, hecha: t.hecha, acento: false, notas: t.notas) {
                    Task { await modelo.marcar(t, enSinDia: true, c) }
                } abrir: { editar(t, dia: nil) }
                .swipeActions(edge: .trailing) {
                    Button("borrar.", role: .destructive) { Task { await modelo.guardar(.borrarTarea(id: t.id), c) } }
                }
                .swipeActions(edge: .leading) {
                    Button("hoy.") {
                        let hoy = v.dia.sumando(dias: -modelo.desplazamiento)
                        Task { await modelo.guardar(.moverTarea(id: t.id, dia: hoy.iso), c) }
                    }
                    .tint(Paleta.acento)
                }
            }
            botonNueva("+ sin día.") { c.modal = .tarea(EditorTarea(id: OperacionBitacora.nuevoIdTarea(sinDia: true), nueva: true, dia: nil)) }
        } header: { cabecera("pendientes sin día.") }
    }

    private func texto(_ v: VistaPlan) -> String {
        ([titulo] + v.tareas.map { ($0.hecha ? "[x] " : "[ ] ") + ($0.hora.map { $0 + " " } ?? "") + $0.titulo }).joined(separator: "\n")
    }

    private func editar(_ t: TareaPlan, dia: LocalDay?) {
        c.modal = .tarea(EditorTarea(id: t.id, nueva: false, dia: dia, titulo: t.titulo, hora: t.hora, notas: t.notas, deTrabajo: t.deTrabajo))
    }

    private func botonNueva(_ texto: String, _ accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            Text(texto).font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.acento).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        }
        .listRowBackground(Paleta.superficie)
    }

    private func cabecera(_ t: String) -> some View {
        Text(t).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).textCase(nil)
    }

    private var titulo: String {
        let d = CalendarioBitacora.madrid.diaLogico(Date(), desplazamiento: modelo.desplazamiento)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        guard let fecha = cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12)) else { return d.iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.timeZone = cal.timeZone
        f.dateFormat = "EEEE d."
        return f.string(from: fecha)
    }
}

private struct Fila: View {
    let titulo: String
    let hora: String?
    let hecha: Bool
    let acento: Bool
    var notas = ""
    let marcar: () -> Void
    var abrir: (() -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Espacio.m) {
            if let hora { Text(hora).font(Tipo.mono).foregroundStyle(Paleta.textoSecundario).frame(width: 44, alignment: .leading) }
            Button(action: marcar) {
                Image(systemName: hecha ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(hecha ? Paleta.textoSecundario : color)
                    .contentTransition(.symbolEffect(.replace))
                    .frame(minWidth: 44, minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(hecha ? "desmarcar \(titulo)" : "marcar \(titulo)")
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo).font(Tipo.cuerpo).foregroundStyle(hecha ? Paleta.textoSecundario : color).strikethrough(hecha)
                if !notas.isEmpty { Text(notas).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).lineLimit(2) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture { (abrir ?? marcar)() }
        }
        .animation(.easeOut(duration: 0.15), value: hecha)
        .listRowBackground(Paleta.superficie)
    }

    private var color: Color { acento ? Paleta.acento : Paleta.texto }
}
