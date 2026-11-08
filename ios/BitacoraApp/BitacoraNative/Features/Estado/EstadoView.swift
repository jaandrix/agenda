import SwiftUI

// Diagnóstico de la fase 1: qué hay en la copia local y si volver a escribirla conservaría todas las claves.
// Enseña nombres de bloques, tamaños y recuentos; nunca contenido.
struct EstadoView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var conserva: Bool?

    var body: some View {
        List {
            Section("nube.") {
                fila("estado.", valor: textoEstado)
                fila("última vez.", valor: c.informe.ultimaSincronizacion.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? "nunca")
                fila("cambio en la nube.", valor: c.informe.actualizadoNube.map(Self.fechaNube) ?? "sin datos")
                Button("sincronizar ahora.") { Task { await c.sincronizar() } }
                    .font(Tipo.cuerpoFuerte)
                    .frame(minHeight: 44)
            }
            if let r = c.informe.resumen {
                Section {
                    fila("tamaño.", valor: ByteCountFormatter.string(fromByteCount: Int64(r.bytes), countStyle: .file))
                    fila("bloques.", valor: "\(r.bloques.count)")
                    fila("se conserva todo.", valor: conserva.map { $0 ? "sí" : "no" } ?? "comprobando", alerta: conserva == false)
                    if !r.desconocidas.isEmpty {
                        fila("bloques que esta versión no conoce.", valor: r.desconocidas.joined(separator: ", "))
                    }
                    if !r.ausentes.isEmpty {
                        fila("bloques que aún no existen en tu cuenta.", valor: "\(r.ausentes.count)")
                    }
                } header: {
                    Text("copia en este iPhone.")
                } footer: {
                    Text("«se conserva todo» comprueba que, al reescribir tu copia, cada bloque sale idéntico, también los que esta versión no entiende. es la condición para que la app escriba.")
                }
                Section("bloques.") {
                    ForEach(r.bloques) { b in
                        HStack {
                            Text(b.id).font(Tipo.mono).foregroundStyle(b.conocida ? Paleta.texto : Paleta.acento)
                            Spacer()
                            Text(detalle(b)).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            Section("en cola.") {
                fila("enlaces recibidos sin atender.", valor: "\(c.intenciones.count)")
                if let aviso = c.avisoCola { fila("aviso.", valor: aviso, alerta: true) }
                fila("cambios por subir.", valor: "\(c.informe.pendientes)")
                if let protegida = c.informe.escrituraProtegida {
                    fila("escritura protegida.", valor: protegida ? "sí" : "no, falta el sql del servidor", alerta: !protegida)
                }
            }
        }
        .font(Tipo.cuerpo)
        .scrollContentBackground(.hidden)
        .background(Paleta.fondo)
        .navigationTitle("estado.")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await c.sincronizar() }
        .task(id: c.informe.revision) { conserva = await c.comprobarConservacion() }
    }

    private var textoEstado: String {
        switch c.informe.estado {
        case .reposo: return "al día."
        case .trayendo: return "sincronizando."
        case .sinConexion: return "sin conexión, usando la copia."
        case .error(let m): return m
        }
    }

    private func fila(_ etiqueta: String, valor: String, alerta: Bool = false) -> some View {
        LabeledContent {
            Text(valor).foregroundStyle(alerta ? Paleta.error : Paleta.textoSecundario).multilineTextAlignment(.trailing)
        } label: {
            Text(etiqueta).foregroundStyle(Paleta.texto)
        }
        .listRowBackground(Paleta.superficie)
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
