import SwiftUI

struct AjustesView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.openURL) private var abrir
    @State private var confirmarSalida = false

    var body: some View {
        List {
            Section("cuenta.") {
                LabeledContent("correo.", value: c.sesion?.email ?? "")
                    .listRowBackground(Paleta.superficie)
                Button("cerrar sesión.", role: .destructive) { confirmarSalida = true }
                    .frame(minHeight: 44)
                    .listRowBackground(Paleta.superficie)
            }
            Section {
                Picker("tema.", selection: Binding(get: { c.tema }, set: { c.ponerTema($0) })) {
                    ForEach(TemaElegido.allCases) { Text($0.nombre).tag($0) }
                }
                .listRowBackground(Paleta.superficie)
                Toggle("pedir \(Biometria.nombre) al abrir.", isOn: Binding(get: { c.bloqueoActivo }, set: { v in Task { await c.activarBloqueo(v) } }))
                    .disabled(!Biometria.disponible)
                    .listRowBackground(Paleta.superficie)
            } header: {
                Text("en este iPhone.")
            } footer: {
                Text("el bloqueo solo protege la app en este iPhone; tu cuenta sigue con su contraseña.")
            }
            Section {
                Button("abrir la web.") { abrir(Config.webURL) }
                    .frame(minHeight: 44)
                    .listRowBackground(Paleta.superficie)
            } footer: {
                Text("lo que aún no está en la app nativa sigue en appbitacora.es.")
            }
            Section {
                LabeledContent("versión.", value: Config.version)
                LabeledContent("contrato de datos.", value: "v\(ContratoDatos.version)")
            }
            .listRowBackground(Paleta.superficie)
        }
        .font(Tipo.cuerpo)
        .scrollContentBackground(.hidden)
        .background(Paleta.fondo)
        .navigationTitle("ajustes.")
        .confirmationDialog("¿cerrar sesión?", isPresented: $confirmarSalida, titleVisibility: .visible) {
            Button("cerrar sesión.", role: .destructive) { Task { await c.salir() } }
            Button("cancelar.", role: .cancel) {}
        } message: {
            Text("se borra la copia de tus datos de este iPhone. en la nube no cambia nada.")
        }
    }
}
