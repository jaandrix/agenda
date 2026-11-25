import SwiftUI
import PhotosUI

// «mi perfil.» (openMiPerfil en perfil.js): la foto que ven tus amigos y una frase sobre ti, en `perfiles_fotos`.
// La foto se procesa aquí antes de subirla (ProcesoFotoPerfil) y se enseña como vista previa hasta guardar.
// 3.2: también cómo te llamamos (`userName`, el del saludo de Inicio y la web) y tu cumpleaños (`perfilPersonal`), que
// viven en la fila de `bitacora` y se guardan sin red (PerfilPersonalOp). El nombre visible para tus amigos
// (perfiles_publicos) se sigue cambiando en la web.
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

    @State private var personal = PerfilPersonalOp.Lectura()
    @State private var nombre = ""
    @State private var cumple: LocalDay?
    @State private var sinAnio = false

    private var uid: String? { c.sesion?.userId }
    private var cambiada: Bool { foto != original.foto }
    private var cambiosRemotos: Bool {
        cambiada || descripcion.trimmingCharacters(in: .whitespacesAndNewlines) != original.descripcion
    }
    private var nombreLimpio: String { nombre.trimmingCharacters(in: .whitespacesAndNewlines) }
    // Sin año se guarda 2000, como los cumpleaños de `entries`.
    private var cumpleGuardable: LocalDay? {
        cumple.flatMap { sinAnio ? LocalDay(year: 2000, month: $0.month, day: $0.day) : $0 }
    }
    private var nombreCambiado: Bool { nombreLimpio != personal.nombre.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var cumpleCambiado: Bool { cumpleGuardable != personal.cumple || (cumple != nil && sinAnio != personal.sinAnio) }
    private var hayCambios: Bool { cambiosRemotos || nombreCambiado || cumpleCambiado }

    var body: some View {
        ScrollView {
            VStack(spacing: Medida.entreSecciones) {
                HStack(alignment: .center) {
                    Text("mi perfil.").font(Letra.titulo).foregroundStyle(Lienzo.tinta).kerning(-0.4)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    BotonRedondo(sistema: "xmark", tono: .blanco, etiqueta: "cerrar") { cerrar() }
                        .frame(minWidth: Medida.toque, minHeight: Medida.toque)
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
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(procesando ? "preparando la foto" : foto == nil ? "sin foto de perfil" : cambiada ? "foto de perfil nueva, sin guardar" : "foto de perfil")

                    if cambiada && foto != nil {
                        Chip(texto: "vista previa.", tono: .naranja)
                            .transition(.opacity.combined(with: .scale(scale: 0.9)))
                            .accessibilityHidden(true)
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

                    Text("todas las fotos de perfil de bitácora pasan a blanco y negro con grano, para que vayan en sintonía. solo la ven tus amigos.")
                        .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, Medida.m)
                }

                seccionNombre
                seccionCumple
                seccionSobreTi

                if let error {
                    Text(error).font(Letra.detalle).foregroundStyle(Lienzo.negativo)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .transition(.opacity)
                }

                Button(guardando ? "guardando…" : "guardar.") { guardar() }
                    .buttonStyle(.capsula(.naranja, ancho: true))
                    .disabled(!hayCambios || guardando || procesando || (cambiosRemotos && uid == nil))
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
        .animation(Muelle.o(Muelle.expandir, reducido: sinMovimiento), value: cumple == nil)
        .presentationDetents([.large])
        .interactiveDismissDisabled(guardando)
        .task { await cargar() }
        .onChange(of: descripcion) { _, nuevo in
            if nuevo.count > PerfilPropio.maxDescripcion { descripcion = String(nuevo.prefix(PerfilPropio.maxDescripcion)) }
        }
        .onChange(of: nombre) { _, nuevo in
            if nuevo.count > PerfilPersonalOp.maxNombre { nombre = String(nuevo.prefix(PerfilPersonalOp.maxNombre)) }
        }
        .onChange(of: elegida) { _, item in
            guard let item else { return }
            Task { await procesar(item) }
        }
    }

    // MARK: - Secciones

    private var seccionNombre: some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            TituloSeccion(texto: "cómo te llamamos.")
            TextField("tu nombre", text: $nombre)
                .font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                .textContentType(.givenName)
                .submitLabel(.done)
                .frame(minHeight: Medida.toque)
                .padding(.horizontal, Medida.rellenoTarjeta)
                .tarjeta(relleno: 0)
                .accessibilityLabel("cómo te llamamos")
            Text("es el saludo de inicio. el nombre que ven tus amigos se cambia en la web.")
                .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                .padding(.horizontal, Medida.xxs)
        }
    }

    private var seccionCumple: some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            TituloSeccion(texto: "tu cumpleaños.", accion: accionQuitarCumple)
            if cumple == nil {
                Button("añadir cumpleaños.") {
                    Haptica.ligera()
                    cumple = LocalDay(year: 2000, month: 1, day: 1)
                }
                .buttonStyle(.capsula(.claro, ancho: true))
                .transition(.opacity)
            } else {
                VStack(spacing: 0) {
                    HStack(spacing: Medida.s) {
                        Text("día.").font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                        Spacer(minLength: Medida.xs)
                        DatePicker("fecha de tu cumpleaños", selection: fechaCumple, in: ...Date(), displayedComponents: .date)
                            .labelsHidden()
                            .tint(Lienzo.naranja)
                            .environment(\.locale, Locale(identifier: "es_ES"))
                    }
                    .frame(minHeight: 52)
                    SeparadorFila(sangria: 0)
                    Toggle(isOn: $sinAnio) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("sin año.").font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                            Text("no se guarda el año ni se cuenta la edad.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        }
                        .padding(.trailing, Medida.xs)
                    }
                    .toggleStyle(InterruptorCasa())
                    .frame(minHeight: 52)
                }
                .padding(.horizontal, Medida.rellenoTarjeta)
                .tarjeta(relleno: 0)
                .transition(.opacity)
            }
            Text("ese día, inicio te felicita. no se lo enseña a nadie.")
                .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                .padding(.horizontal, Medida.xxs)
        }
    }

    private var seccionSobreTi: some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            TituloSeccion(texto: "sobre ti.")
            VStack(alignment: .trailing, spacing: Medida.xs) {
                TextField("Estudio Psicología en Valencia, corro los domingos y siempre llego tarde.", text: $descripcion, axis: .vertical)
                    .font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                    .lineLimit(3...6)
                    .disabled(!cargado)
                    .accessibilityLabel("sobre ti")
                    .accessibilityHint("una frase que ven tus amigos")
                Text("\(descripcion.count)/\(PerfilPropio.maxDescripcion)")
                    .font(Letra.pie).monospacedDigit().foregroundStyle(Lienzo.tintaSecundaria)
                    .accessibilityLabel("\(descripcion.count) de \(PerfilPropio.maxDescripcion) caracteres")
            }
            .tarjeta()
        }
    }

    private var accionQuitarCumple: (titulo: String, hacer: () -> Void)? {
        guard cumple != nil else { return nil }
        return (titulo: "quitar.", hacer: quitarCumple)
    }

    private func quitarCumple() {
        Haptica.ligera()
        cumple = nil
        sinAnio = false
    }

    // El DatePicker trabaja con Date; el cumpleaños es un día civil (mediodía local, sin saltos de hora).
    private var fechaCumple: Binding<Date> {
        Binding(
            get: {
                let d = cumple ?? LocalDay(year: 2000, month: 1, day: 1)!
                return Calendar.current.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12)) ?? Date()
            },
            set: { nueva in
                let p = Calendar.current.dateComponents([.year, .month, .day], from: nueva)
                if let y = p.year, let m = p.month, let dia = p.day { cumple = LocalDay(year: y, month: m, day: dia) }
            }
        )
    }

    // MARK: - Datos

    private func cargar() async {
        // Lo del documento primero: está en la copia local y no necesita red.
        if let doc = await c.documentoVisible() {
            let p = PerfilPersonalOp.leer(doc)
            personal = p
            nombre = p.nombre
            cumple = p.cumple
            sinAnio = p.sinAnio && p.cumple != nil
        }
        guard let uid else { cargado = true; return }
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
            error = "sin conexión: puedes cambiar tu nombre y tu cumpleaños, pero la foto y la frase necesitan red."
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

    // Primero lo del documento (va a la cola y se sube solo); después la foto y la frase, que necesitan red. Si lo
    // segundo falla, lo primero ya queda guardado y la hoja sigue abierta con el aviso.
    private func guardar() {
        guard hayCambios, !guardando else { return }
        guardando = true
        error = nil
        let foto = foto, texto = descripcion, remotos = cambiosRemotos
        let cambioCumple: LocalDay?? = cumpleCambiado ? .some(cumpleGuardable) : .none
        let op: OperacionBitacora? = nombreCambiado || cumpleCambiado
            ? PerfilPersonalOp.op(nombre: nombreCambiado ? nombreLimpio : nil, cumple: cambioCumple, sinAnio: sinAnio)
            : nil
        let nuevoPersonal = PerfilPersonalOp.Lectura(nombre: nombreLimpio, cumple: cumpleGuardable, sinAnio: cumpleGuardable != nil && sinAnio)
        Task {
            defer { guardando = false }
            if let op {
                guard await c.guardar(op) else { Haptica.error(); return }
                personal = nuevoPersonal
            }
            if remotos {
                guard let uid else { return }
                do {
                    try await c.entorno.servicios.perfil.guardar(uid, foto: foto, descripcion: texto)
                    original = PerfilPropio(foto: foto, descripcion: texto.trimmingCharacters(in: .whitespacesAndNewlines))
                } catch ErrorRed.sinConexion {
                    error = op == nil ? "sin conexión. la foto y la frase no se han guardado: prueba cuando vuelva la red."
                        : "tu nombre y tu cumpleaños están guardados; la foto y la frase, no: hace falta red."
                    Haptica.error()
                    return
                } catch ErrorPerfil.demasiadoGrande {
                    error = "la foto es demasiado grande. prueba con otra."
                    Haptica.error()
                    return
                } catch {
                    self.error = "no se pudo guardar la foto ni la frase. prueba otra vez."
                    Haptica.error()
                    return
                }
            }
            Haptica.exito()
            c.avisar("perfil guardado.")
            cerrar()
        }
    }
}
