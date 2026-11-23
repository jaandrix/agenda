import SwiftUI

// Rutinas de hoy (toggleHabitToday): la página del apartado.
struct RutinasView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaMas?
    @State private var aviso: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                CabeceraApartado(titulo: "rutinas", contexto: vista.map { $0.rutinas.isEmpty ? "ninguna hoy." : "\($0.rutinas.filter(\.hecha).count) de \($0.rutinas.count) hoy." }) { EmptyView() }
                if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.error).padding(.top, Espacio.s) }
                CabeceraSeccion(titulo: "hoy.")
                ForEach(vista?.rutinas ?? []) { r in
                    FilaAgenda(hora: nil, titulo: r.texto, notas: "\(r.semana) esta semana" + (r.momento.isEmpty ? "" : ", \(r.momento)"),
                               hecho: r.hecha, mostrarHora: false) { marcar(r) }
                }
            }
            .padding(.horizontal, 20).padding(.bottom, Espacio.xl)
        }
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .task(id: c.revision) {
            let doc = await c.documentoVisible()
            guard let nuevo = await ultimaGana({ doc.map { LecturaMas.vista($0) } }) else { return }
            vista = nuevo
        }
    }

    private func marcar(_ r: Rutina) {
        guard var v = vista, let i = v.rutinas.firstIndex(where: { $0.id == r.id }) else { return }
        v.rutinas[i].hecha.toggle()
        vista = v
        let hecha = v.rutinas[i].hecha
        Task {
            do { try await c.encolar(.marcarRutina(id: r.id, dia: CalendarioBitacora.madrid.dia(de: Date()).iso, hecha: hecha)); aviso = nil } catch {
                if var w = vista, let j = w.rutinas.firstIndex(where: { $0.id == r.id }) { w.rutinas[j].hecha = !hecha; vista = w }
                aviso = "no se pudo guardar en este iPhone."
            }
        }
    }
}

