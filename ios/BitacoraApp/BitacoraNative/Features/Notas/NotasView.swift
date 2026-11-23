import SwiftUI

// Notas: la nota rápida arriba y las últimas debajo.
struct NotasView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaMas?
    @State private var nota = ""
    @State private var idNota = OperacionBitacora.nuevoIdNota()
    @State private var aviso: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                CabeceraApartado(titulo: "notas", contexto: vista.map { "\($0.notas.count) notas." }) { EmptyView() }
                if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.error).padding(.top, Espacio.s) }
                HStack(alignment: .bottom) {
                    TextField("nota rápida.", text: $nota, axis: .vertical)
                        .font(Tipo.cuerpo).foregroundStyle(Paleta.texto)
                        .padding(.vertical, 12)
                    AccionTexto(texto: "guardar.") { guardarNota() }
                        .disabled(nota.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(.top, Espacio.m)
                .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                ForEach(vista?.notas ?? []) { n in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(n.texto).font(Tipo.cuerpo).foregroundStyle(Paleta.texto).lineLimit(8)
                        Text(n.fecha).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 10)
                    .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                    .textSelection(.enabled)
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

    private func guardarNota() {
        let texto = String(nota.trimmingCharacters(in: .whitespacesAndNewlines).prefix(5000))
        guard !texto.isEmpty else { return }
        let id = idNota
        // El texto se queda en el campo hasta que la cola lo tiene guardado.
        Task {
            do {
                try await c.encolar(.crearNota(id: id, dia: CalendarioBitacora.madrid.dia(de: Date()).iso, texto: texto,
                                               creada: ISO8601DateFormatter().string(from: Date())))
                if nota.trimmingCharacters(in: .whitespacesAndNewlines) == texto { nota = "" }
                idNota = OperacionBitacora.nuevoIdNota()
                aviso = nil
            } catch {
                aviso = "no se pudo guardar la nota en este iPhone."
            }
        }
    }
}
