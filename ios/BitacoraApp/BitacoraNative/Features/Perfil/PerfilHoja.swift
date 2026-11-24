import SwiftUI
import PhotosUI

// «mi perfil.» (openMiPerfil en perfil.js): la foto que ven tus amigos y una frase sobre ti, en `perfiles_fotos`.
// La foto se procesa aquí antes de subirla (ProcesoFotoPerfil) y se enseña como vista previa hasta guardar.
// El nombre visible (perfiles_publicos) se sigue cambiando en la web.
struct PerfilHoja: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    @State private var foto: Data?
    @State private var descripcion = ""
    @State private var original = PerfilPropio(foto: nil, descripcion: "")
    @State private var cargado = false
    @State private var elegida: PhotosPickerItem?
    @State private var procesando = false
    @State private var guardando = false
    @State private var error: String?

    private var uid: String? { c.sesion?.userId }
    private var cambiada: Bool { foto != original.foto }
    private var hayCambios: Bool {
        cambiada || descripcion.trimmingCharacters(in: .whitespacesAndNewlines) != original.descripcion
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Medida.entreSecciones) {
                HStack(alignment: .center) {
                    Text("mi perfil.").font(Letra.titulo).foregroundStyle(Lienzo.tinta).kerning(-0.4)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    BotonRedondo(sistema: "xmark", tono: .blanco, etiqueta: "cerrar") { cerrar() }
                }

                VStack(spacing: Medida.m) {
                    ZStack {
                        Avatar(foto: foto, tamano: 168, fondo: Lienzo.sutil, icono: Lienzo.tintaTerciaria)
                            .overlay(Circle().strokeBorder(Lienzo.filo))
                            .sombra(.suave)
                            .opacity(procesando ? 0.5 : 1)
                        if procesando { ProgressView().tint(Lienzo.tinta) }
                    }
                    .scaleEffect(procesando ? 0.97 : 1)
                    .accessibilityLabel(foto == nil ? "sin foto de perfil" : "foto de perfil")

                    if cambiada && foto != nil {
                        Chip(texto: "vista previa.", tono: .naranja)
                            .transition(.opacity.combined(with: .scale(scale: 0.9)))
                    }

                    HStack(spacing: Medida.xs) {
                        PhotosPicker(selection: $elegida, matching: .images) {
                            Text(foto == nil ? "añadir foto." : "cambiar foto.")
                        }
                        .buttonStyle(.capsula(.claro))
                        .disabled(procesando || guardando)
                        if foto != nil {
                            Button("quitar foto.") {
                                Haptica.ligera()
                                foto = nil
                                error = nil
                            }
                            .buttonStyle(.capsula(.blanco))
                            .disabled(procesando || guardando)
                        }
                    }

                    Text("Todas las fotos de perfil de bitácora pasan a blanco y negro con grano, para que vayan en sintonía. Solo la ven tus amigos.")
                        .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, Medida.m)
                }

                VStack(alignment: .leading, spacing: Medida.xs) {
                    EtiquetaSeccion(texto: "sobre ti")
                    VStack(alignment: .trailing, spacing: Medida.xs) {
                        TextField("Estudio Psicología en Valencia, corro los domingos y siempre llego tarde.", text: $descripcion, axis: .vertical)
                            .font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                            .lineLimit(3...6)
                            .disabled(!cargado)
                        Text("\(descripcion.count)/\(PerfilPropio.maxDescripcion)")
                            .font(Letra.pie).monospacedDigit().foregroundStyle(Lienzo.tintaTerciaria)
                    }
                    .tarjeta()
                }

                if let error {
                    Text(error).font(Letra.detalle).foregroundStyle(Lienzo.negativo)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .transition(.opacity)
                }

                Button(guardando ? "guardando…" : "guardar.") { guardar() }
                    .buttonStyle(.capsula(.naranja, ancho: true))
                    .disabled(!hayCambios || guardando || procesando || uid == nil)
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.l)
            .padding(.bottom, Medida.xxl)
        }
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
        .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: foto)
        .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: procesando)
        .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: error)
        .presentationDetents([.large])
        .interactiveDismissDisabled(guardando)
        .task { await cargar() }
        .onChange(of: descripcion) { _, nuevo in
            if nuevo.count > PerfilPropio.maxDescripcion { descripcion = String(nuevo.prefix(PerfilPropio.maxDescripcion)) }
        }
        .onChange(of: elegida) { _, item in
            guard let item else { return }
            Task { await procesar(item) }
        }
    }

    private func cargar() async {
        guard let uid else { return }
        let perfil = c.entorno.servicios.perfil
        if foto == nil, let guardada = perfil.guardada(uid) {
            foto = guardada
            original.foto = guardada
        }
        do {
            let p = try await perfil.propio(uid)
            if !cambiada { foto = p.foto }
            if descripcion.isEmpty { descripcion = p.descripcion }
            original = p
        } catch ErrorRed.sinConexion {
            error = "sin conexión: puedes ver tu foto, pero para cambiarla hace falta red."
        } catch {
            self.error = "no se pudo leer tu perfil. prueba otra vez en un momento."
        }
        cargado = true
    }

    private func procesar(_ item: PhotosPickerItem) async {
        procesando = true
        error = nil
        defer { procesando = false; elegida = nil }
        guard let datos = try? await item.loadTransferable(type: Data.self) else {
            error = "esa imagen no se pudo abrir. prueba con otra."
            Haptica.error()
            return
        }
        let resultado = await Task.detached(priority: .userInitiated) { () -> Result<Data, Error> in
            Result(catching: { try ProcesoFotoPerfil.procesar(datos) })
        }.value
        switch resultado {
        case .success(let jpeg):
            Haptica.ligera()
            foto = jpeg
        case .failure(let e as ErrorPerfil) where e == .demasiadoGrande:
            error = "esa foto ocupa demasiado incluso reducida. prueba con otra."
            Haptica.error()
        case .failure:
            error = "esa imagen no se pudo leer. prueba con otra."
            Haptica.error()
        }
    }

    private func guardar() {
        guard let uid, hayCambios, !guardando else { return }
        guardando = true
        error = nil
        let foto = foto, texto = descripcion
        Task {
            defer { guardando = false }
            do {
                try await c.entorno.servicios.perfil.guardar(uid, foto: foto, descripcion: texto)
                Haptica.exito()
                c.avisar("perfil guardado.")
                cerrar()
            } catch ErrorRed.sinConexion {
                error = "sin conexión. tu perfil no se ha guardado: prueba cuando vuelva la red."
                Haptica.error()
            } catch ErrorPerfil.demasiadoGrande {
                error = "la foto es demasiado grande. prueba con otra."
                Haptica.error()
            } catch {
                self.error = "no se pudo guardar el perfil. prueba otra vez."
                Haptica.error()
            }
        }
    }
}
