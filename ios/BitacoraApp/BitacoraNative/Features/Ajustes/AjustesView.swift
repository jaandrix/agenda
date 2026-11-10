import SwiftUI

struct AjustesView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.openURL) private var abrir
    @State private var confirmarSalida = false
    @State private var avisos = AvisosLocales.activos
    @AppStorage(Vidrio.clave) private var vidrio = false

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
                SelectorTema()
                    .listRowBackground(Paleta.superficie)
                Picker("tamaño de letra.", selection: Binding(get: { c.letra }, set: { c.ponerLetra($0) })) {
                    ForEach(EscalaLetra.allCases) { Text($0.nombre).tag($0) }
                }
                .frame(minHeight: 44)
                .listRowBackground(Paleta.superficie)
                Toggle("glass (prueba).", isOn: $vidrio)
                    .frame(minHeight: 44)
                    .listRowBackground(Paleta.superficie)
                    .accessibilityHint("barra translúcida y fondo con el color del tema, solo en este iphone")
                Button("restablecer apariencia.") { c.ponerLetra(.normal); c.ponerTema(.sistema); vidrio = false }
                    .frame(minHeight: 44)
                    .disabled(c.letra == .normal && c.tema == .sistema && !vidrio)
                    .listRowBackground(Paleta.superficie)
                Toggle("pedir \(Biometria.nombre) al abrir.", isOn: Binding(get: { c.bloqueoActivo }, set: { v in Task { await c.activarBloqueo(v) } }))
                    .disabled(!Biometria.disponible)
                    .listRowBackground(Paleta.superficie)
                Toggle("avisos de eventos.", isOn: Binding(get: { avisos }, set: { v in Task { avisos = await AvisosLocales.activar(v); if avisos { c.reconciliarAvisos() } } }))
                    .listRowBackground(Paleta.superficie)
            } header: {
                Text("en este iPhone.")
            } footer: {
                Text("el tamaño de letra se suma al de iOS (Dynamic Type). el bloqueo solo protege la app en este iPhone; tu cuenta sigue con su contraseña. los avisos llegan una hora antes de cada evento con hora; si ya te llegan los de la web, no los actives.")
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
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("¿cerrar sesión?", isPresented: $confirmarSalida, titleVisibility: .visible) {
            Button("cerrar sesión.", role: .destructive) { Task { await c.salir() } }
            Button("cancelar.", role: .cancel) {}
        } message: {
            Text("se borra la copia de tus datos de este iPhone. en la nube no cambia nada.")
        }
    }
}

// renderSelectorTema: una muestra por tema (fondo, acento y tinta) con su nombre. Solo los que esta cuenta puede usar.
struct SelectorTema: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.colorScheme) private var esquema

    var body: some View {
        VStack(alignment: .leading, spacing: Espacio.s) {
            Text("tema.").font(Tipo.cuerpo).foregroundStyle(Paleta.texto)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 10)], spacing: 10) {
                ForEach(TemaElegido.allCases.filter { $0.permitido(c.permisosTemas) }) { t in
                    let k = TemaTokens.de(t, sistemaOscuro: esquema == .dark)
                    let on = t == c.tema
                    Button { c.ponerTema(t) } label: {
                        VStack(spacing: 6) {
                            HStack(spacing: -6) {
                                ForEach([k.fondo, k.acento, k.texto], id: \.self) { v in
                                    Circle().fill(Color(uiColor: UIColor(rgb: v))).frame(width: 22, height: 22)
                                        .overlay(Circle().stroke(Paleta.bordeFuerte, lineWidth: 1))
                                }
                            }
                            Text(t.nombre).font(Tipo.poppins(13, on ? .bold : .medium, estilo: .footnote)).foregroundStyle(Paleta.texto)
                        }
                        .frame(maxWidth: .infinity, minHeight: 64)
                        .background(on ? Paleta.tinteAcento : Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Radio.control, style: .continuous).stroke(on ? Paleta.acento : .clear, lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("tema \(t.nombre.dropLast())")
                    .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
                }
            }
        }
        .padding(.vertical, 6)
    }
}
