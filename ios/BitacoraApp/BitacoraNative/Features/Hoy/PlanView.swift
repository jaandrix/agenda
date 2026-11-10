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
        ScrollView {
            PlanCuerpo(
                carga: modelo.carga, desplazamiento: $modelo.desplazamiento, estado: c.informe.estado,
                pendientes: c.informe.pendientes, aviso: modelo.aviso,
                acciones: PlanCuerpo.Acciones(
                    marcar: { t, sinDia in Task { await modelo.marcar(t, enSinDia: sinDia, c) } },
                    marcarRecurrente: { r in Task { await modelo.marcar(r, c) } },
                    abrir: { t, dia in
                        c.modal = .tarea(EditorTarea(id: t.id, nueva: false, dia: dia, titulo: t.titulo, hora: t.hora, notas: t.notas, deTrabajo: t.deTrabajo, prioridad: t.prioridad))
                    },
                    mover: { t, dia in Task { await modelo.guardar(.moverTarea(id: t.id, dia: dia?.iso), c) } },
                    borrar: { t in Task { await modelo.guardar(.borrarTarea(id: t.id), c) } },
                    prioridad: { t, p in Task { await modelo.guardar(.parcharTarea(id: t.id, campos: ["prioridad": p ?? ""]), c) } },
                    nueva: { dia in
                        c.modal = .tarea(EditorTarea(id: OperacionBitacora.nuevoIdTarea(sinDia: dia == nil), nueva: true, dia: dia))
                    }
                )
            )
            .padding(.horizontal, Espacio.l - 4)
            .padding(.bottom, Espacio.xl)
        }
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar() }
        .task(id: "\(c.informe.revision)-\(modelo.desplazamiento)") { await modelo.cargar(c) }
    }
}

// La pantalla sin estado propio: recibe lo que pinta y qué hacer. Así se puede dibujar igual en las capturas del CI.
struct PlanCuerpo: View {
    struct Acciones {
        var marcar: (TareaPlan, Bool) -> Void = { _, _ in }
        var marcarRecurrente: (RecurrenteHoy) -> Void = { _ in }
        var abrir: (TareaPlan, LocalDay?) -> Void = { _, _ in }
        var mover: (TareaPlan, LocalDay?) -> Void = { _, _ in }
        var borrar: (TareaPlan) -> Void = { _ in }
        var prioridad: (TareaPlan, String?) -> Void = { _, _ in }
        var nueva: (LocalDay?) -> Void = { _ in }
    }

    let carga: Carga<VistaPlan>
    @Binding var desplazamiento: Int
    let estado: EstadoSync
    let pendientes: Int
    let aviso: String?
    var acciones = Acciones()
    @State var verTodasSinDia = false

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 0) {
            CabeceraApartado(titulo: "plan", contexto: contexto) {
                if case .lista(let v) = carga, !v.tareas.isEmpty {
                    ShareLink(item: textoCompartir(v)) {
                        Image(systemName: "square.and.arrow.up").font(.system(size: 17, weight: .semibold)).foregroundStyle(Paleta.textoSecundario)
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("compartir el día")
                }
            }
            selectorDia
            if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.error).padding(.top, Espacio.s) }
            switch carga {
            case .cargando:
                ProgressView().tint(Paleta.textoSecundario).frame(maxWidth: .infinity).padding(.top, Espacio.xl)
            case .vacia:
                Text("aún no hay copia de tus datos en este iPhone. se traerá en cuanto haya red.")
                    .font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.top, Espacio.l)
            case .lista(let v):
                agenda(v)
                if !v.recurrentes.isEmpty { recurrentes(v) }
                sinDia(v)
            }
        }
    }

    // hoy. / mañana. / pasado.: texto, la activa en tinta con la raya del acento debajo; nada de control segmentado.
    private var selectorDia: some View {
        HStack(spacing: Espacio.l) {
            ForEach([(0, "hoy."), (1, "mañana."), (2, "pasado.")], id: \.0) { n, nombre in
                Button { desplazamiento = n } label: {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(nombre).font(Tipo.poppins(17, desplazamiento == n ? .semibold : .regular, estilo: .headline))
                            .foregroundStyle(desplazamiento == n ? Paleta.texto : Paleta.textoSecundario)
                        Capsule().fill(desplazamiento == n ? Paleta.acento : .clear).frame(width: 22, height: 3)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(desplazamiento == n ? [.isSelected, .isButton] : .isButton)
            }
            Spacer()
        }
        .padding(.top, Espacio.m)
    }

    private func agenda(_ v: VistaPlan) -> some View {
        let hechas = v.tareas.filter(\.hecha).count
        return VStack(alignment: .leading, spacing: 0) {
            CabeceraSeccion(titulo: desplazamiento == 0 ? "hoy." : (desplazamiento == 1 ? "mañana." : "pasado mañana."),
                            detalle: "\(v.tareas.count - hechas) pendientes, \(hechas) hechas", raya: true)
            if v.tareas.isEmpty {
                Text("nada todavía.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s)
            }
            ForEach(v.tareas) { t in
                FilaAgenda(hora: t.hora, titulo: t.titulo, notas: t.notas, hecho: t.hecha, acento: t.arrastrada, prioridad: t.prioridad) {
                    acciones.marcar(t, false)
                } abrir: { acciones.abrir(t, v.dia) }
                .contextMenu { menu(t, v, enSinDia: false) }
            }
            AccionTexto(texto: "+ tarea.") { acciones.nueva(v.dia) }.padding(.top, Espacio.xs)
        }
    }

    private func recurrentes(_ v: VistaPlan) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            CabeceraSeccion(titulo: "recurrentes.", detalle: "\(v.recurrentes.filter(\.hecha).count) de \(v.recurrentes.count)")
            ForEach(v.recurrentes) { r in
                FilaAgenda(hora: nil, titulo: r.texto, hecho: r.hecha, mostrarHora: false) { acciones.marcarRecurrente(r) }
            }
        }
    }

    // Como en el inicio de la PWA: con contador y solo las primeras, salvo «ver todas».
    private func sinDia(_ v: VistaPlan) -> some View {
        let visibles = verTodasSinDia ? v.sinDia : Array(v.sinDia.prefix(3))
        return VStack(alignment: .leading, spacing: 0) {
            CabeceraSeccion(titulo: "pendientes sin día.", detalle: v.sinDia.isEmpty ? nil : "\(v.sinDia.count)")
            ForEach(visibles) { t in
                FilaAgenda(hora: nil, titulo: t.titulo, notas: t.notas, hecho: t.hecha, mostrarHora: false, prioridad: t.prioridad) {
                    acciones.marcar(t, true)
                } abrir: { acciones.abrir(t, nil) }
                .contextMenu { menu(t, v, enSinDia: true) }
            }
            HStack(spacing: Espacio.l) {
                AccionTexto(texto: "+ sin día.") { acciones.nueva(nil) }
                if v.sinDia.count > 3 {
                    Button(verTodasSinDia ? "ver menos." : "ver todas.") { verTodasSinDia.toggle() }
                        .font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).frame(minHeight: 44)
                }
            }
            .padding(.top, Espacio.xs)
        }
    }

    // Lo que antes eran gestos laterales: mantener pulsado, y también por VoiceOver.
    @ViewBuilder private func menu(_ t: TareaPlan, _ v: VistaPlan, enSinDia: Bool) -> some View {
        if !t.deTrabajo {
            let hoy = v.dia.sumando(dias: -desplazamiento)
            if enSinDia || desplazamiento != 0 { Button("pasar a hoy.") { acciones.mover(t, hoy) } }
            if !enSinDia && desplazamiento == 0 { Button("pasar a mañana.") { acciones.mover(t, hoy.sumando(dias: 1)) } }
            if !enSinDia { Button("dejar sin día.") { acciones.mover(t, nil) } }
            Menu("prioridad.") {
                ForEach(["alta", "media", "baja", ""], id: \.self) { k in
                    let nombre = k.isEmpty ? "ninguna." : k + "."
                    Button { acciones.prioridad(t, k.isEmpty ? nil : k) } label: {
                        if (t.prioridad ?? "") == k { Label(nombre, systemImage: "checkmark") } else { Text(nombre) }
                    }
                }
            }
            Button("borrar.", role: .destructive) { acciones.borrar(t) }
        }
    }

    private var contexto: String {
        var partes = [fecha]
        switch estado {
        case .sinConexion: partes.append("sin conexión")
        case .error: partes.append("error al sincronizar")
        case .trayendo: partes.append("sincronizando")
        case .reposo: break
        }
        if pendientes > 0 { partes.append("\(pendientes) por subir") }
        return partes.joined(separator: ", ") + "."
    }

    private var fecha: String {
        let d = CalendarioBitacora.madrid.diaLogico(Date(), desplazamiento: desplazamiento)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        guard let f = cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12)) else { return d.iso }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "es_ES")
        fmt.timeZone = cal.timeZone
        fmt.dateFormat = "EEEE d 'de' MMMM"
        return fmt.string(from: f)
    }

    private func textoCompartir(_ v: VistaPlan) -> String {
        ([fecha + "."] + v.tareas.map { ($0.hecha ? "[x] " : "[ ] ") + ($0.hora.map { $0 + " " } ?? "") + $0.titulo }).joined(separator: "\n")
    }
}
