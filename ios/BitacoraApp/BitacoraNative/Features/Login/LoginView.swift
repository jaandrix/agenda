import SwiftUI

struct LoginView: View {
    @Environment(AppCoordinator.self) private var c
    let aviso: String?

    @State private var email = ""
    @State private var contrasena = ""
    @State private var enviando = false
    @State private var error: String?
    @FocusState private var campo: Campo?

    private enum Campo { case email, contrasena }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Espacio.l) {
                VStack(alignment: .leading, spacing: Espacio.s) {
                    Marca()
                    Text("la app nativa, en pruebas. de momento solo lee tus datos: lo que cambies se hace en la web.")
                        .font(Tipo.cuerpo)
                        .foregroundStyle(Paleta.textoSecundario)
                }
                .padding(.top, Espacio.xl)

                if let aviso {
                    Text(aviso).font(Tipo.cuerpo).foregroundStyle(Paleta.error)
                }

                VStack(spacing: Espacio.s) {
                    TextField("correo.", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($campo, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { campo = .contrasena }
                        .modifier(Campo_())
                    SecureField("contraseña.", text: $contrasena)
                        .textContentType(.password)
                        .focused($campo, equals: .contrasena)
                        .submitLabel(.go)
                        .onSubmit { Task { await entrar() } }
                        .modifier(Campo_())
                }

                if let error {
                    Text(error).font(Tipo.cuerpo).foregroundStyle(Paleta.error).accessibilityAddTraits(.updatesFrequently)
                }

                Button {
                    Task { await entrar() }
                } label: {
                    if enviando { ProgressView().tint(Paleta.sobreAcento) } else { Text("entrar.") }
                }
                .buttonStyle(BotonPrincipal())
                .disabled(enviando || email.isEmpty || contrasena.isEmpty)

                Link("crear una cuenta en appbitacora.es.", destination: Config.webURL)
                    .font(Tipo.pie)
                    .foregroundStyle(Paleta.textoSecundario)
                    .frame(minHeight: 44)
            }
            .padding(.horizontal, Espacio.l)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func entrar() async {
        guard !enviando, !email.isEmpty, !contrasena.isEmpty else { return }
        enviando = true
        error = nil
        defer { enviando = false }
        do {
            try await c.entrar(email: email.trimmingCharacters(in: .whitespaces), contrasena: contrasena)
            contrasena = ""
        } catch let e as ErrorAuth {
            error = e.mensaje
        } catch ErrorRed.sinConexion {
            error = "sin conexión. para entrar la primera vez hace falta red."
        } catch {
            self.error = "no se pudo entrar. inténtalo otra vez."
        }
    }
}

private struct Campo_: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(Tipo.cuerpo)
            .foregroundStyle(Paleta.texto)
            .padding(.horizontal, Espacio.m)
            .frame(minHeight: 50)
            .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: Radio.control))
            .overlay(RoundedRectangle(cornerRadius: Radio.control).stroke(Paleta.borde))
    }
}
