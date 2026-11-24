import SwiftUI

// Acceso 2.0 (24-11): la b. grande sobre el degradado de portada, campos en cápsulas blancas y «entrar.» en cápsula negra.
// La lógica de entrar (AppCoordinator.entrar y sus errores) no cambia.
struct LoginView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    let aviso: String?

    @State private var email = ""
    @State private var contrasena = ""
    @State private var enviando = false
    @State private var error: String?
    @State private var aparecido = false
    @FocusState private var campo: Campo?

    private enum Campo { case email, contrasena }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreSecciones) {
                portada
                    .padding(.top, Medida.xxl * 2)

                if let aviso {
                    lineaAviso(aviso).entradaEscalonada(1)
                }

                VStack(spacing: Medida.xs) {
                    TextField("", text: $email, prompt: Text("correo.").foregroundColor(Lienzo.tintaTerciaria))
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($campo, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { campo = .contrasena }
                        .modifier(CampoCapsulaLogin(enfocado: campo == .email))
                    SecureField("", text: $contrasena, prompt: Text("contraseña.").foregroundColor(Lienzo.tintaTerciaria))
                        .textContentType(.password)
                        .focused($campo, equals: .contrasena)
                        .submitLabel(.go)
                        .onSubmit { Task { await entrar() } }
                        .modifier(CampoCapsulaLogin(enfocado: campo == .contrasena))
                }
                .entradaEscalonada(2)

                VStack(alignment: .leading, spacing: Medida.s) {
                    if let error {
                        lineaAviso(error)
                            .accessibilityAddTraits(.updatesFrequently)
                            .transition(.opacity.combined(with: .offset(y: -4)))
                    }

                    Button {
                        Task { await entrar() }
                    } label: {
                        ZStack {
                            Text("entrar.").opacity(enviando ? 0 : 1)
                            if enviando {
                                ProgressView().tint(Lienzo.sobreOscuro).transition(.opacity)
                            }
                        }
                    }
                    .buttonStyle(.capsula(.oscuro, ancho: true))
                    .disabled(enviando || email.isEmpty || contrasena.isEmpty)
                    .accessibilityLabel(enviando ? "entrando" : "entrar")

                    Link("crear una cuenta en appbitacora.es.", destination: Config.webURL)
                        .font(Letra.pie)
                        .foregroundStyle(Lienzo.tintaSecundaria)
                        .frame(maxWidth: .infinity, minHeight: Medida.toque)
                        .buttonStyle(.pulsable(0.96))
                }
                .entradaEscalonada(3)
            }
            .padding(.horizontal, Medida.xl)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: error)
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: enviando)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .background(alignment: .top) { Lienzo.degradadoCabecera.frame(height: 360).ignoresSafeArea() }
        .fondoLienzo()
        .sensoryFeedback(.error, trigger: error) { _, nuevo in nuevo != nil }
        .onAppear {
            withAnimation(Muelle.o(Muelle.entrada, reducido: sinMovimiento)) { aparecido = true }
        }
    }

    // La b. entra con un muelle (escala y fundido); el nombre y la frase la siguen.
    private var portada: some View {
        VStack(alignment: .leading, spacing: Medida.m) {
            LogoB(tamano: 76)
                .sombra(.oscura)
                .scaleEffect(aparecido || sinMovimiento ? 1 : 0.78, anchor: .bottomLeading)
                .opacity(aparecido ? 1 : 0)
            VStack(alignment: .leading, spacing: Medida.xs) {
                (Text("bitácora").foregroundColor(Lienzo.tinta) + Text(".").foregroundColor(Lienzo.naranjaProfundo))
                    .font(Letra.portada)
                    .kerning(-0.4)
                    .accessibilityLabel("bitácora")
                    .accessibilityAddTraits(.isHeader)
                Text("tu día, calendario y finanzas esenciales, también sin conexión. algunos apartados avanzados siguen en la web.")
                    .font(Letra.detalle)
                    .foregroundStyle(Lienzo.tintaSecundaria)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .entradaEscalonada(1)
        }
    }

    // Errores y avisos amables: un puntito y una línea pequeña, sin rojo a toda la frase.
    private func lineaAviso(_ texto: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Medida.xs) {
            Puntito(color: Lienzo.negativo, tamano: 6).alignmentGuide(.firstTextBaseline) { $0[.bottom] - 1 }
            Text(texto).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, Medida.xxs)
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

// Campo de acceso en cápsula blanca; con el foco, el filete se marca un poco más.
private struct CampoCapsulaLogin: ViewModifier {
    let enfocado: Bool

    func body(content: Content) -> some View {
        content
            .font(Letra.cuerpo)
            .foregroundStyle(Lienzo.tinta)
            .tint(Lienzo.naranjaProfundo)
            .padding(.horizontal, Medida.l)
            .frame(minHeight: Medida.alturaControl + Medida.xs)
            .background(Lienzo.tarjeta, in: Capsule())
            .overlay(Capsule().strokeBorder(enfocado ? Lienzo.filoFuerte : Lienzo.filo, lineWidth: enfocado ? 1.5 : 1))
            .sombra(.suave)
            .animation(Muelle.rapido, value: enfocado)
    }
}
