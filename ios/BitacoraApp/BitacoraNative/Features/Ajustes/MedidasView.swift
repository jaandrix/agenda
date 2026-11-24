import SwiftUI
import UIKit

// Ajustes → avanzado → «medidas.» (0.24): lo que anota Medidas en este iPhone y lo último del motor de Finanzas, con
// un botón que lo copia tal cual para mandarlo (mismo formato «MEDIDA|nombre|mediana|mín|máx|veces» que CI).
struct MedidasView: View {
    @State private var valores: [String: [Double]] = [:]
    @State private var motor: [String: Double] = [:]
    @State private var copiado = false
    @State private var confirmarBorrar = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                Text("en milisegundos: la mediana de las últimas veces y, debajo, la más rápida y la más lenta. para medir, usa la app un rato como siempre (abrirla, cada pestaña, finanzas, apuntar, marcar, deslizar la semana) y vuelve aquí.")
                    .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 6).padding(.top, Medida.m)
                GrupoMenu(titulo: "en este iphone.") {
                    if valores.isEmpty {
                        Text("aún no hay medidas.").font(Letra.cuerpo).foregroundStyle(Lienzo.tintaSecundaria).padding(Medida.rellenoTarjeta)
                    }
                    ForEach(Array(valores.keys.sorted().enumerated()), id: \.element) { n, k in
                        if n > 0 { SeparadorMenu() }
                        fila(k, valores[k] ?? [])
                    }
                }
                if !motor.isEmpty {
                    GrupoMenu(titulo: "motor de finanzas (la última vez).") {
                        ForEach(Array(motor.keys.sorted().enumerated()), id: \.element) { n, k in
                            if n > 0 { SeparadorMenu() }
                            HStack {
                                Text(k + ".").font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                                Spacer()
                                Text(Self.cifra(motor[k] ?? 0)).font(Letra.cuerpo.monospacedDigit()).foregroundStyle(Lienzo.tinta)
                            }
                            .padding(.horizontal, Medida.rellenoTarjeta).frame(minHeight: 48)
                        }
                    }
                }
                GrupoMenu(titulo: "enviar.") {
                    Button { copiar() } label: {
                        FilaAjuste(icono: "datos", titulo: copiado ? "copiado." : "copiar las medidas.", detalle: "para pegarlas en un mensaje.") { EmptyView() }
                    }.buttonStyle(EstiloFila())
                    SeparadorMenu()
                    Button { confirmarBorrar = true } label: {
                        FilaAjuste(icono: "borrar", titulo: "empezar de cero.", detalle: "borra las medidas de este iphone.", peligro: true) { EmptyView() }
                    }.buttonStyle(EstiloFila())
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.bottom, Medida.entreSecciones)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .navigationTitle("medidas.")
        .task { await leer() }
        .refreshable { await leer() }
        .confirmationDialog("¿borrar las medidas?", isPresented: $confirmarBorrar, titleVisibility: .visible) {
            Button("borrar.", role: .destructive) { Medidas.borrar(); valores = [:] }
            Button("cancelar.", role: .cancel) {}
        }
    }

    private func fila(_ k: String, _ l: [Double]) -> some View {
        let o = l.sorted()
        let mediana = o.isEmpty ? 0 : o[o.count / 2]
        return HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(k + ".").font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                Text("\(o.count) veces, de \(Self.cifra(o.first ?? 0)) a \(Self.cifra(o.last ?? 0)).")
                    .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
            }
            Spacer()
            Text(Self.cifra(mediana)).font(Letra.cuerpoFuerte.monospacedDigit()).foregroundStyle(Lienzo.tinta)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }

    static func cifra(_ ms: Double) -> String { ms >= 100 ? "\(Int(ms.rounded())) ms" : String(format: "%.1f ms", ms) }

    private func leer() async {
        valores = Medidas.valores
        motor = await MotorFinanzas.compartido.ultimaMedida
    }

    private func copiar() {
        let modelo = UIDevice.current.model + " " + UIDevice.current.systemVersion
        UIPasteboard.general.string = Medidas.texto(extra: motor, cabecera: "bitácora \(Config.version), \(modelo)")
        copiado = true
    }
}
