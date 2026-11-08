import SwiftUI
import UIKit

// Lo que llega por bitacora://apuntar, bitacora://quick o «Abrir en». Apuntar crea una tarea; los movimientos aún van a
// la web. No se pierde hasta que se elige algo.
struct IntencionView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.openURL) private var abrir
    let intencion: IntencionEntrante
    @State private var id = OperacionBitacora.nuevoIdTarea()
    @State private var guardando = false
    @State private var error: String?

    // La tarea lleva el texto; si solo llegó un enlace, el enlace es el título. Con los dos, el enlace va en las notas.
    private func apuntar(texto: String, url: String?, hoy: Bool) async {
        guard !guardando else { return }
        guardando = true
        defer { guardando = false }
        let titulo = String((texto.isEmpty ? (url ?? "") : texto).prefix(500))
        let dia = hoy ? CalendarioBitacora.madrid.diaLogico(Date()).iso : nil
        do {
            var ops: [OperacionBitacora] = [.crearTarea(id: id, dia: dia, titulo: titulo, hora: nil)]
            if let url, !texto.isEmpty { ops.append(.parcharTarea(id: id, campos: ["notes": url])) }
            try await c.encolar(ops)
            c.resolverIntencion(intencion)
        } catch {
            UIPasteboard.general.string = titulo
            error = "no se pudo guardar en este iPhone. el texto está copiado."
        }
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Espacio.m) {
                Text(explicacion).font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario)
                if let error { Text(error).font(Tipo.cuerpo).foregroundStyle(Paleta.error) }
                if case .apuntar(let texto, let url) = intencion {
                    VStack(alignment: .leading, spacing: Espacio.s) {
                        if !texto.isEmpty { Text(texto).font(Tipo.cuerpo).foregroundStyle(Paleta.texto) }
                        if let url { Text(url).font(Tipo.pie).foregroundStyle(Paleta.acento) }
                    }
                    .padding(Espacio.m)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: Radio.control))
                    .textSelection(.enabled)
                    Button("apuntar para hoy.") { Task { await apuntar(texto: texto, url: url, hoy: true) } }
                        .buttonStyle(BotonPrincipal())
                        .disabled(guardando)
                    Button("apuntar sin día.") { Task { await apuntar(texto: texto, url: url, hoy: false) } }
                        .buttonStyle(BotonSecundario())
                        .disabled(guardando)
                } else {
                    Button("abrir la web.") {
                        abrir(Config.webURL)
                        c.resolverIntencion(intencion)
                    }
                    .buttonStyle(BotonPrincipal())
                }
                Button("descartar.") { c.resolverIntencion(intencion) }
                    .buttonStyle(BotonSecundario())
                Spacer()
            }
            .padding(Espacio.l)
            .background(Paleta.fondo)
            .navigationTitle(titulo)
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }

    private var titulo: String {
        switch intencion {
        case .apuntar: return "apuntar."
        case .rapido(.expense): return "nuevo gasto."
        case .rapido(.income): return "nuevo ingreso."
        }
    }

    private var explicacion: String {
        switch intencion {
        case .apuntar: return "se guarda como tarea. sin red, se sube en cuanto vuelva."
        case .rapido: return "los movimientos llegarán a la app nativa más adelante. de momento, en la web."
        }
    }
}
