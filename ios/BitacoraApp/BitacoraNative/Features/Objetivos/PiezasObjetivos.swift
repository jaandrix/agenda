import SwiftUI

// Piezas de Objetivos y Proyectos 3.0. Candidatas a DesignSystem/V2: `BarraFinaObjetivos` (barra de avance que se llena
// con muelle) y `CampoObjetivos` (campo de alta con botón en cápsula sobre una tarjeta blanca).

extension Objetivo {
    // El avance que se dibuja: la cifra si es numérico; si no, los hitos hechos.
    var avance: Double? {
        if let p = porcentaje { return Double(p) / 100 }
        guard !hitos.isEmpty else { return nil }
        return Double(hitos.filter(\.hecho).count) / Double(hitos.count)
    }

    var avanceTexto: String? {
        if let p = porcentaje { return "\(p) %" }
        guard !hitos.isEmpty else { return nil }
        return "\(hitos.filter(\.hecho).count)/\(hitos.count)"
    }

    var siguienteHito: HitoObjetivo? { hitos.first { !$0.hecho } }
    var cumplido: Bool { estado == "Completado" }
}

/// Barra de avance de 4 pt: raíl gris y relleno naranja que se llena con un muelle al aparecer y al cambiar. Solo anima
/// la escala horizontal (transformación), nunca el ancho.
struct BarraFinaObjetivos: View {
    let valor: Double
    var sobreOscuro = false
    @State private var visible = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    private var fraccion: CGFloat { CGFloat(min(max(valor, 0), 1)) }

    var body: some View {
        Capsule()
            .fill(sobreOscuro ? Lienzo.filoOscuro : Lienzo.sutil)
            .overlay(alignment: .leading) {
                Capsule().fill(Lienzo.naranja)
                    .scaleEffect(x: visible || sinMovimiento ? fraccion : 0.001, y: 1, anchor: .leading)
            }
            .frame(height: 4)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: valor)
            .onAppear {
                withAnimation(Muelle.o(Muelle.entrada, reducido: sinMovimiento).delay(0.08)) { visible = true }
            }
            .accessibilityElement()
            .accessibilityLabel("avance")
            .accessibilityValue("\(Int((fraccion * 100).rounded())) %")
    }
}

/// Campo de alta: texto en gris sutil y botón en cápsula oscura. Va dentro de una tarjeta blanca.
struct CampoObjetivos: View {
    @Binding var texto: String
    let sugerencia: String
    var boton = "añadir."
    var decimal = false
    var multilinea = false
    let accion: () -> Void

    private var vacio: Bool { texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        HStack(spacing: Medida.xs) {
            TextField("", text: $texto, prompt: Text(sugerencia).foregroundColor(Lienzo.tintaTerciaria), axis: multilinea ? .vertical : .horizontal)
                .font(Letra.cuerpo)
                .foregroundStyle(Lienzo.tinta)
                .lineLimit(1...4)
                .keyboardType(decimal ? .decimalPad : .default)
                .submitLabel(.done)
                .onSubmit(accion)
                .padding(.horizontal, Medida.s)
                .padding(.vertical, Medida.xs + 2)
                .frame(minHeight: Medida.alturaControl)
                .background(Lienzo.sutil, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
            Button(boton, action: accion)
                .buttonStyle(.capsula)
                .disabled(vacio)
        }
    }
}

/// Mandala Harada en rejilla de 3 × 3 squircles: el objetivo en el centro, en negro, y los ocho pilares alrededor.
struct MandalaObjetivo: View {
    let titulo: String
    let pilares: [PilarMandala]
    let abrir: (Int) -> Void

    private let columnas = Array(repeating: GridItem(.flexible(), spacing: Medida.xs), count: 3)
    // Casilla de la rejilla → pilar; la del centro (nil) es el objetivo.
    private static let orden: [Int?] = [0, 1, 2, 3, nil, 4, 5, 6, 7]

    var body: some View {
        LazyVGrid(columns: columnas, spacing: Medida.xs) {
            ForEach(0..<9, id: \.self) { n in
                if let i = Self.orden[n] { casilla(i).entradaEscalonada(n) } else { centro.entradaEscalonada(n) }
            }
        }
    }

    private var centro: some View {
        RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous)
            .fill(Lienzo.oscuro)
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                Text(titulo.lowercased() + ".")
                    .font(Letra.pieFuerte).foregroundStyle(Lienzo.sobreOscuro)
                    .multilineTextAlignment(.center).lineLimit(4).minimumScaleFactor(0.8)
                    .padding(Medida.xs)
            }
            .accessibilityElement(children: .combine)
    }

    private func casilla(_ i: Int) -> some View {
        let p = pilares[safe: i] ?? PilarMandala(texto: "", acciones: Array(repeating: "", count: 8))
        let vacio = p.texto.trimmingCharacters(in: .whitespaces).isEmpty
        let lleno = !vacio && p.hechas == 8
        return Button {
            Haptica.ligera()
            abrir(i)
        } label: {
            RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous)
                .fill(lleno ? Lienzo.naranjaSuave : vacio ? Lienzo.sutilSuave : Lienzo.sutil)
                .aspectRatio(1, contentMode: .fit)
                .overlay(alignment: vacio ? .center : .topLeading) {
                    if vacio {
                        Image(systemName: "plus").font(.system(size: 13, weight: .bold)).foregroundStyle(Lienzo.tintaTerciaria)
                    } else {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(p.texto.lowercased())
                                .font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta)
                                .multilineTextAlignment(.leading).lineLimit(3).minimumScaleFactor(0.85)
                            Spacer(minLength: 0)
                            Text("\(p.hechas)/8").font(Letra.hora)
                                .foregroundStyle(lleno ? Lienzo.naranjaProfundo : Lienzo.tintaSecundaria)
                        }
                        .padding(Medida.xs + 2)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    }
                }
                .contentShape(RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
        }
        .buttonStyle(Pulsable(escala: 0.94, haptica: false))
        .accessibilityLabel(vacio ? "pilar \(i + 1), vacío" : "pilar \(i + 1), \(p.texto)")
        .accessibilityValue(vacio ? "" : "\(p.hechas) de 8 acciones")
        .accessibilityHint(vacio ? "añadir un pilar" : "editar el pilar")
    }
}
