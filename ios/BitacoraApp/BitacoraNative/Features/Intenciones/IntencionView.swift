import SwiftUI
import UIKit

// Lo que llega por bitacora://apuntar, bitacora://quick o «Abrir en». Mientras la app no escriba, se ofrece copiarlo
// o abrir la web; no se pierde hasta que se elige algo.
struct IntencionView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.openURL) private var abrir
    let intencion: IntencionEntrante

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Espacio.m) {
                Text(explicacion).font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario)
                if case .apuntar(let texto, let url) = intencion {
                    VStack(alignment: .leading, spacing: Espacio.s) {
                        if !texto.isEmpty { Text(texto).font(Tipo.cuerpo).foregroundStyle(Paleta.texto) }
                        if let url { Text(url).font(Tipo.pie).foregroundStyle(Paleta.acento) }
                    }
                    .padding(Espacio.m)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: Radio.control))
                    .textSelection(.enabled)
                    Button("copiar y abrir la web.") {
                        UIPasteboard.general.string = [texto, url].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "\n")
                        abrir(Config.webURL)
                        c.resolverIntencion(intencion)
                    }
                    .buttonStyle(BotonPrincipal())
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
        case .apuntar: return "esta versión aún no apunta por sí sola. cópialo y pégalo en «apuntar.» de la web."
        case .rapido: return "los movimientos llegarán a la app nativa más adelante. de momento, en la web."
        }
    }
}
