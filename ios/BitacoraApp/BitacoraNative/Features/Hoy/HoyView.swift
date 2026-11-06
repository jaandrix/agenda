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

    // Solo decodifica `dayPlanner`, y fuera del hilo principal.
    func cargar(almacen: AlmacenLocal, uid: String) async {
        let datos = await almacen.leerBase(uid: uid)
        let vista: VistaHoy? = await Task.detached(priority: .userInitiated) {
            guard let datos, let doc = try? DocumentoBitacora(datos: datos) else { return nil }
            return LecturaPlanificador.hoy(doc)
        }.value
        if let vista { carga = .lista(vista) } else if case .cargando = carga { carga = .vacia }
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
                    IndicadorSync(estado: c.informe.estado)
                }
                .listRowBackground(Color.clear)
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
                    ForEach(v.tareas) { t in FilaTarea(tarea: t) }
                } header: {
                    Text(resumen(v)).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).textCase(nil)
                } footer: {
                    Text("solo lectura. para marcar o cambiar algo, usa la web.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                }
                if v.sinDia > 0 {
                    Section {
                        LabeledContent { Text("\(v.sinDia)").font(Tipo.cuerpoFuerte) } label: {
                            Text("pendientes sin día.").font(Tipo.cuerpo)
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Paleta.fondo)
        .navigationTitle("hoy.")
        .refreshable { await c.sincronizar() }
        .task(id: c.informe.revision) {
            guard let uid = c.sesion?.userId else { return }
            await modelo.cargar(almacen: c.entorno.almacen, uid: uid)
        }
    }

    private var fechaLarga: String {
        let d = CalendarioBitacora.madrid.diaLogico(Date())
        var comp = DateComponents()
        comp.year = d.year; comp.month = d.month; comp.day = d.day; comp.hour = 12
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        guard let fecha = cal.date(from: comp) else { return d.iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.timeZone = cal.timeZone
        f.dateFormat = "EEEE d 'de' MMMM"
        return f.string(from: fecha) + "."
    }

    private func resumen(_ v: VistaHoy) -> String {
        let hechas = v.tareas.filter(\.hecha).count
        let pendientes = v.tareas.count - hechas
        return "\(pendientes) pendientes, \(hechas) hechas"
    }
}

private struct FilaTarea: View {
    let tarea: TareaHoy

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Espacio.m) {
            Text(tarea.hora ?? "")
                .font(Tipo.mono)
                .foregroundStyle(Paleta.textoSecundario)
                .frame(width: 44, alignment: .leading)
            Image(systemName: tarea.hecha ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(tarea.hecha ? Paleta.textoSecundario : (tarea.arrastrada ? Paleta.acento : Paleta.texto))
                .accessibilityHidden(true)
            Text(tarea.titulo)
                .font(Tipo.cuerpo)
                .foregroundStyle(tarea.hecha ? Paleta.textoSecundario : (tarea.arrastrada ? Paleta.acento : Paleta.texto))
                .strikethrough(tarea.hecha)
        }
        .frame(minHeight: 44)
        .listRowBackground(Paleta.superficie)
        .accessibilityElement(children: .combine)
        .accessibilityValue(tarea.hecha ? "hecha" : (tarea.arrastrada ? "de días anteriores" : "pendiente"))
    }
}
