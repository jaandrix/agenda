import SwiftUI

// Sugerencias (vista web `suggestions`, js/ajustes.js): la tabla `sugerencias` de Supabase (supabase/sql/sugerencias.sql).
// Cada uno crea y ve solo las suyas (RLS). No vive en la fila de `bitacora`, así que va por REST y no por operaciones.

struct SugerenciaEnviada: Sendable, Identifiable, Equatable {
    let id: String
    let texto: String
    let creado: String
}

enum ServidorSugerencias {
    static let maximo = 2000

    // loadMySuggestions: las suyas, de la más nueva a la más vieja.
    @MainActor static func leer(_ c: AppCoordinator) async throws -> [SugerenciaEnviada] {
        let s = try await c.entorno.auth.sesionValida()
        let cl = c.entorno.cliente
        let (d, codigo) = try await cl.enviar(cl.peticion("rest/v1/sugerencias", consulta: [
            URLQueryItem(name: "select", value: "id,texto,creado_en"),
            URLQueryItem(name: "user_id", value: "eq.\(s.userId)"),
            URLQueryItem(name: "order", value: "creado_en.desc")], token: s.accessToken))
        guard codigo == 200 else { throw ErrorRed.servidor(codigo) }
        return (try LectorJSON.valor(d).lista ?? []).compactMap { f in
            guard let id = f["id"]?.comoId, let texto = f["texto"]?.texto else { return nil }
            return SugerenciaEnviada(id: id, texto: texto, creado: f["creado_en"]?.texto ?? "")
        }
    }

    // submitSuggestion: insert con su user_id (la política exige que sea el suyo).
    @MainActor static func enviar(_ texto: String, _ c: AppCoordinator) async throws {
        let s = try await c.entorno.auth.sesionValida()
        let cl = c.entorno.cliente
        let cuerpo = EscritorJSON.datos(.object(["user_id": .string(s.userId), "texto": .string(String(texto.prefix(maximo)))]))
        var r = cl.peticion("rest/v1/sugerencias", metodo: "POST", token: s.accessToken, cuerpo: cuerpo)
        r.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        let (_, codigo) = try await cl.enviar(r)
        guard (200..<300).contains(codigo) else { throw ErrorRed.servidor(codigo) }
    }

    // «24 de noviembre de 2026», como toLocaleDateString('es-ES', { day, month: 'long', year }).
    static func fecha(_ creado: String) -> String {
        guard let d = LocalDay(iso: String(creado.prefix(10))) else { return "" }
        let meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        return "\(d.day) de \(meses[(d.month - 1) % 12]) de \(d.year)"
    }
}

struct SugerenciasView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var texto = ""
    @State private var enviadas: [SugerenciaEnviada]?
    @State private var enviando = false
    @State private var error: String?
    @State private var gracias = false
    @FocusState private var foco: Bool
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    private var limpio: String { texto.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "sugerencias.", subtitulo: "¿qué le falta a bitácora?")
                    .padding(.bottom, Medida.xxs)
                formulario.entradaEscalonada(0)
                anteriores
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
        .refreshable { await cargar() }
        .task { await cargar() }
    }

    private var formulario: some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            Text("algo que eches en falta, algo que cambiarías o algo que no funciona. lo leemos todo, una a una.")
                .font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
            TextField("", text: $texto, prompt: Text("escribe aquí…").foregroundColor(Lienzo.tintaTerciaria), axis: .vertical)
                .font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                .lineLimit(4...12)
                .focused($foco)
                .padding(Medida.s)
                .background(Lienzo.sutilSuave, in: RoundedRectangle(cornerRadius: Medida.concentrico(Medida.radioTarjeta, relleno: Medida.rellenoTarjeta), style: .continuous))
                .onChange(of: texto) { _, nuevo in
                    if nuevo.count > ServidorSugerencias.maximo { texto = String(nuevo.prefix(ServidorSugerencias.maximo)) }
                    if gracias { gracias = false }
                }
                .accessibilityLabel("tu sugerencia")
            if let error {
                Text(error).font(Letra.pie).foregroundStyle(Lienzo.negativo)
            }
            if gracias {
                Text("enviada. ¡gracias!").font(Letra.pieFuerte).foregroundStyle(Lienzo.positivo)
                    .transition(.opacity)
            }
            Button(enviando ? "enviando…" : "enviar.") { Task { await enviar() } }
                .buttonStyle(.capsula(.naranja, ancho: true))
                .disabled(limpio.isEmpty || enviando)
        }
        .tarjeta()
        .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: gracias)
    }

    @ViewBuilder private var anteriores: some View {
        if let enviadas {
            EtiquetaSeccion(texto: "tus sugerencias").padding(.top, Medida.s).entradaEscalonada(1)
            if enviadas.isEmpty {
                TarjetaInvitacion(frase: "todavía no has enviado ninguna.", destacado: "la primera idea suele ser la buena.")
                    .entradaEscalonada(2)
            } else {
                ForEach(Array(enviadas.enumerated()), id: \.element.id) { n, s in
                    TarjetaNota(titulo: ServidorSugerencias.fecha(s.creado), extracto: s.texto, expandida: true)
                        .entradaEscalonada(n + 2)
                }
            }
        }
    }

    private func cargar() async {
        if let lista = try? await ServidorSugerencias.leer(c) {
            withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento)) { enviadas = lista }
        }
    }

    private func enviar() async {
        let t = limpio
        guard !t.isEmpty, !enviando else { return }
        enviando = true
        error = nil
        defer { enviando = false }
        do {
            try await ServidorSugerencias.enviar(t, c)
            Haptica.exito()
            texto = ""
            foco = false
            gracias = true
            await cargar()
        } catch ErrorRed.sinConexion {
            Haptica.error()
            error = "sin conexión. tu texto sigue aquí: envíalo cuando vuelva la red."
        } catch {
            Haptica.error()
            self.error = "no se pudo enviar la sugerencia."
        }
    }
}
