import SwiftUI
import UIKit

// 3.1: el icono de la app, a elegir entre el principal y tres alternativos (ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES
// en project.yml). Las miniaturas son imagesets aparte: un appiconset no se puede leer con UIImage(named:).
struct IconoAppSelector: View {
    private struct Opcion: Identifiable {
        let nombre: String?        // nil = el principal
        let muestra: String
        let titulo: String
        var id: String { nombre ?? "principal" }
    }

    private static let opciones = [
        Opcion(nombre: nil, muestra: "MuestraIconoElegido", titulo: "bitácora."),
        Opcion(nombre: "IconoCristal", muestra: "MuestraIconoCristal", titulo: "cristal."),
        Opcion(nombre: "IconoArcilla", muestra: "MuestraIconoArcilla", titulo: "arcilla."),
        Opcion(nombre: "IconoClaro", muestra: "MuestraIconoClaro", titulo: "claro."),
    ]

    @State private var actual: String? = UIApplication.shared.alternateIconName
    @State private var cambiando = false
    @State private var error: String?
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            HStack(spacing: Medida.s) {
                IconoFila(id: "apartados")
                VStack(alignment: .leading, spacing: 2) {
                    Text("icono de la app.").font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                    Text("el que verás en la pantalla de inicio.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                }
            }
            HStack(spacing: Medida.s) {
                ForEach(Self.opciones) { o in
                    let elegido = o.nombre == actual
                    Button { elegir(o.nombre) } label: {
                        VStack(spacing: 6) {
                            Image(o.muestra)
                                .resizable()
                                .interpolation(.high)
                                .aspectRatio(1, contentMode: .fit)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .strokeBorder(elegido ? Lienzo.naranja : Lienzo.filo, lineWidth: elegido ? 2.5 : 1)
                                }
                                .padding(3)
                                .scaleEffect(elegido && !sinMovimiento ? 1.04 : 1)
                            Text(o.titulo).font(Letra.pieFuerte)
                                .foregroundStyle(elegido ? Lienzo.tinta : Lienzo.tintaSecundaria)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.pulsable(0.94))
                    .disabled(cambiando)
                    .accessibilityLabel("icono " + o.titulo)
                    .accessibilityAddTraits(elegido ? .isSelected : [])
                }
            }
            .animation(Muelle.o(Muelle.toque, reducido: sinMovimiento), value: actual)
            if let error {
                Text(error).font(Letra.pie).foregroundStyle(Lienzo.negativo).transition(.opacity)
            }
        }
        .padding(Medida.rellenoTarjeta)
        .onAppear { actual = UIApplication.shared.alternateIconName }
    }

    private func elegir(_ nombre: String?) {
        guard nombre != actual, !cambiando else { return }
        guard UIApplication.shared.supportsAlternateIcons else {
            error = "este iphone no deja cambiar el icono."
            return
        }
        cambiando = true
        Haptica.ligera()
        UIApplication.shared.setAlternateIconName(nombre) { fallo in
            DispatchQueue.main.async {
                cambiando = false
                if fallo == nil {
                    actual = nombre
                    error = nil
                    Haptica.exito()
                } else {
                    error = "no se ha podido cambiar el icono."
                }
            }
        }
    }
}
