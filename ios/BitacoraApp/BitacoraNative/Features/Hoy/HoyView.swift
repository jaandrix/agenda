import SwiftUI

enum Carga<T: Equatable>: Equatable {
    case cargando
    case lista(T)
    case vacia
    case fallo(String)
}

@MainActor
@Observable
final class HoyModel {
    private(set) var carga: Carga<VistaHoy> = .cargando
    private(set) var aviso: String?
    private(set) var marcadas = 0
    @ObservationIgnored private var enVuelo = Set<String>()

    // Solo decodifica `dayPlanner`, y fuera del hilo principal.
    func cargar(_ c: AppCoordinator) async {
        let doc = await c.documentoVisible()
        let vista: VistaHoy? = await Task.detached(priority: .userInitiated) {
            guard let doc else { return nil }
            return LecturaPlanificador.hoy(doc)
        }.value
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
    func marcar(_ t: TareaHoy, _ c: AppCoordinator) async {
        guard !enVuelo.contains(t.id), case .lista(var v) = carga, let i = v.tareas.firstIndex(where: { $0.id == t.id }) else { return }
        let hecha = !v.tareas[i].hecha
        enVuelo.insert(t.id)
        v.tareas[i].hecha = hecha
        carga = .lista(v)
        if hecha { marcadas += 1 }
        aviso = nil
        defer { enVuelo.remove(t.id) }
        do {
            try await c.encolar(.marcarTarea(id: t.id, hecha: hecha, momentoMs: Int64(Date().timeIntervalSince1970 * 1000)))
        } catch {
            if case .lista(var w) = carga, let j = w.tareas.firstIndex(where: { $0.id == t.id }) {
                w.tareas[j].hecha = !hecha
                carga = .lista(w)
            }
            aviso = "no se pudo guardar el cambio en este iPhone."
        }
    }
}

struct HoyView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var modelo = HoyModel()

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: Espacio.xs) {
                    Text(fechaLarga).font(Tipo.subtitulo).foregroundStyle(Paleta.texto)
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
            case .fallo(let m):
                Section { Text(m).font(Tipo.cuerpo).foregroundStyle(Paleta.error) }
            case .lista(let v):
                Section {
                    if v.tareas.isEmpty {
                        Text("nada para hoy.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario)
                    }
                    ForEach(v.tareas) { t in
                        FilaTarea(tarea: t) { Task { await modelo.marcar(t, c) } }
                    }
                    Button {
                        c.modal = .nuevaTarea(dia: v.dia)
                    } label: {
                        Text("+ tarea.").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.acento).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .listRowBackground(Paleta.superficie)
                } header: {
                    Text(resumen(v)).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).textCase(nil)
                }
                if v.sinDia > 0 {
                    Section {
                        LabeledContent { Text("\(v.sinDia)").font(Tipo.cuerpoFuerte) } label: {
                            Text("pendientes sin día.").font(Tipo.cuerpo)
                        }
                        .listRowBackground(Paleta.superficie)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Paleta.fondo)
        .navigationTitle("hoy.")
        .refreshable { await c.sincronizar() }
        .sensoryFeedback(.success, trigger: modelo.marcadas)
        .task(id: c.informe.revision) { await modelo.cargar(c) }
    }

    private var fechaLarga: String {
        let d = CalendarioBitacora.madrid.diaLogico(Date())
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        guard let fecha = cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12)) else { return d.iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.timeZone = cal.timeZone
        f.dateFormat = "EEEE d 'de' MMMM"
        return f.string(from: fecha) + "."
    }

    private func resumen(_ v: VistaHoy) -> String {
        let hechas = v.tareas.filter(\.hecha).count
        return "\(v.tareas.count - hechas) pendientes, \(hechas) hechas"
    }
}

private struct FilaTarea: View {
    let tarea: TareaHoy
    let marcar: () -> Void

    var body: some View {
        Button(action: marcar) {
            HStack(alignment: .firstTextBaseline, spacing: Espacio.m) {
                Text(tarea.hora ?? "")
                    .font(Tipo.mono)
                    .foregroundStyle(Paleta.textoSecundario)
                    .frame(width: 44, alignment: .leading)
                Image(systemName: tarea.hecha ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(tarea.hecha ? Paleta.textoSecundario : color)
                    .contentTransition(.symbolEffect(.replace))
                Text(tarea.titulo)
                    .font(Tipo.cuerpo)
                    .foregroundStyle(tarea.hecha ? Paleta.textoSecundario : color)
                    .strikethrough(tarea.hecha)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .animation(.easeOut(duration: 0.15), value: tarea.hecha)
        .listRowBackground(Paleta.superficie)
        .accessibilityLabel(tarea.titulo)
        .accessibilityValue(tarea.hecha ? "hecha" : (tarea.arrastrada ? "de días anteriores, pendiente" : "pendiente"))
        .accessibilityHint(tarea.hecha ? "toca para desmarcar" : "toca para marcar como hecha")
    }

    private var color: Color { tarea.arrastrada ? Paleta.acento : Paleta.texto }
}
