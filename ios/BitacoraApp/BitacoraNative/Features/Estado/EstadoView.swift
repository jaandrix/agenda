import SwiftUI

// Diagnóstico de la fase 1: qué hay en la copia local y si volver a escribirla conservaría todas las claves.
// Enseña nombres de bloques, tamaños y recuentos; nunca contenido.
// Estado 2.0 (24-11): grupos en tarjetas blancas de filas; lo que está en marcha (sincronizar, subir cambios,
// comprobar la copia) lleva un punto que late.
struct EstadoView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var conserva: Bool?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "estado.", subtitulo: textoEstado)
                    .padding(.bottom, Medida.xs)

                EtiquetaSeccion(texto: "nube")
                grupo {
                    fila("estado.", icono: "estado", valor: textoEstado, vivo: c.estadoSync == .trayendo, alerta: enError)
                    SeparadorFila(sangria: Medida.rellenoTarjeta + Medida.icono + Medida.s)
                    fila("última vez.", icono: "datos", valor: c.informe.ultimaSincronizacion.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? "nunca")
                    SeparadorFila(sangria: Medida.rellenoTarjeta + Medida.icono + Medida.s)
                    fila("cambio en la nube.", icono: "web", valor: c.informe.actualizadoNube.map(Self.fechaNube) ?? "sin datos")
                }
                Button {
                    Haptica.ligera()
                    Task { await c.sincronizar() }
                } label: {
                    HStack(spacing: Medida.xs) {
                        if c.estadoSync == .trayendo { PuntoVivo(color: Lienzo.naranja).transition(.scale.combined(with: .opacity)) }
                        Text(c.estadoSync == .trayendo ? "sincronizando." : "sincronizar ahora.")
                    }
                }
                .buttonStyle(.capsula(.oscuro, ancho: true))

                if let r = c.informe.resumen {
                    EtiquetaSeccion(texto: "copia en este iphone")
                        .padding(.top, Medida.entreSecciones - Medida.entreTarjetas)
                    grupo {
                        fila("tamaño.", valor: ByteCountFormatter.string(fromByteCount: Int64(r.bytes), countStyle: .file))
                        SeparadorFila(sangria: 0)
                        fila("bloques.", valor: "\(r.bloques.count)")
                        SeparadorFila(sangria: 0)
                        fila("se conserva todo.", valor: conserva.map { $0 ? "sí" : "no" } ?? "comprobando", vivo: conserva == nil, alerta: conserva == false)
                        if !r.desconocidas.isEmpty {
                            SeparadorFila(sangria: 0)
                            filaLarga("bloques que esta versión no conoce.", r.desconocidas.joined(separator: ", "))
                        }
                        if !r.ausentes.isEmpty {
                            SeparadorFila(sangria: 0)
                            fila("bloques que aún no existen en tu cuenta.", valor: "\(r.ausentes.count)")
                        }
                    }
                    Text("«se conserva todo» comprueba que, al reescribir tu copia, cada bloque sale idéntico, también los que esta versión no entiende. es la condición para que la app escriba.")
                        .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        .padding(.horizontal, Medida.xxs)
                        .fixedSize(horizontal: false, vertical: true)

                    EtiquetaSeccion(texto: "bloques")
                        .padding(.top, Medida.entreSecciones - Medida.entreTarjetas)
                    grupo {
                        ForEach(Array(r.bloques.enumerated()), id: \.element.id) { i, b in
                            if i > 0 { SeparadorFila(sangria: 0) }
                            HStack(spacing: Medida.s) {
                                Text(b.id).font(Tipo.mono).foregroundStyle(b.conocida ? Lienzo.tinta : Lienzo.naranjaProfundo)
                                    .lineLimit(1)
                                Spacer(minLength: Medida.xs)
                                Text(detalle(b)).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit()
                            }
                            .padding(.horizontal, Medida.rellenoTarjeta)
                            .frame(minHeight: Medida.toque)
                            .accessibilityElement(children: .combine)
                        }
                    }
                }

                EtiquetaSeccion(texto: "en cola")
                    .padding(.top, Medida.entreSecciones - Medida.entreTarjetas)
                grupo {
                    fila("enlaces recibidos sin atender.", valor: "\(c.intenciones.count)", vivo: !c.intenciones.isEmpty)
                    if let aviso = c.avisoCola {
                        SeparadorFila(sangria: 0)
                        filaLarga("aviso.", aviso, alerta: true)
                    }
                    SeparadorFila(sangria: 0)
                    fila("cambios por subir.", valor: "\(c.pendientes)", vivo: c.pendientes > 0)
                    if let protegida = c.informe.escrituraProtegida {
                        SeparadorFila(sangria: 0)
                        fila("escritura protegida.", valor: protegida ? "sí" : "no, falta el sql del servidor", alerta: !protegida)
                    }
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: c.estadoSync)
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: conserva)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await c.sincronizar() }
        .tareaVisible(id: c.revision) { conserva = await c.comprobarConservacion() }
    }

    private var enError: Bool {
        if case .error = c.estadoSync { return true }
        return false
    }

    private var textoEstado: String {
        switch c.estadoSync {
        case .reposo: return "al día."
        case .trayendo: return "sincronizando."
        case .sinConexion: return "sin conexión, usando la copia."
        case .error(let m): return m
        }
    }

    // Tarjeta blanca sin relleno: las filas llevan el suyo y los separadores llegan al borde.
    private func grupo<C: View>(@ViewBuilder _ contenido: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 0) { contenido() }
            .padding(.vertical, Medida.xxs)
            .tarjeta(relleno: 0)
    }

    // Fila con el dato a la derecha. `vivo`: está en marcha (punto que late); `alerta`: el dato en rojo.
    private func fila(_ etiqueta: String, icono: String? = nil, valor: String, vivo: Bool = false, alerta: Bool = false) -> some View {
        FilaTarjeta(icono: icono, titulo: etiqueta) {
            HStack(spacing: Medida.xs) {
                if vivo { PuntoVivo(color: Lienzo.naranja).transition(.scale.combined(with: .opacity)) }
                Text(valor).font(Letra.pie).foregroundStyle(alerta ? Lienzo.negativo : Lienzo.tintaSecundaria)
                    .multilineTextAlignment(.trailing)
                    .contentTransition(.opacity)
            }
        }
        .padding(.horizontal, Medida.rellenoTarjeta)
    }

    // Para datos largos (listas de bloques, avisos): el dato debajo de la etiqueta.
    private func filaLarga(_ etiqueta: String, _ valor: String, alerta: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(etiqueta).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
            Text(valor).font(Letra.pie).foregroundStyle(alerta ? Lienzo.negativo : Lienzo.tintaSecundaria)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Medida.rellenoTarjeta)
        .padding(.vertical, Medida.s)
        .accessibilityElement(children: .combine)
    }

    private func detalle(_ b: ResumenBloque) -> String {
        let tam = ByteCountFormatter.string(fromByteCount: Int64(b.bytes), countStyle: .file)
        if let n = b.elementos { return "\(b.tipo), \(n), \(tam)" }
        return "\(b.tipo), \(tam)"
    }

    private static func fechaNube(_ s: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let g = ISO8601DateFormatter()
        guard let d = f.date(from: s) ?? g.date(from: s) else { return s }
        return d.formatted(date: .abbreviated, time: .shortened)
    }
}
