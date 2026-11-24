import SwiftUI

// Piezas propias de Viajes en Bitácora 2.0. Candidatas a subir a DesignSystem/V2 (anotado en el informe del rediseño):
// la cuenta atrás grande, el campo de añadir en línea y los chips de reservas.

enum LetraViajes {
    static var cuentaAtras: Font { Tipo.poppins(34, .semibold, estilo: .largeTitle).monospacedDigit() }
}

enum MedidaViajes {
    static let mapa: CGFloat = 220
    static let hora: CGFloat = 46
}

// Fechas y cuenta atrás de un viaje, compartidas por la lista y la ficha.
enum TextoViajes {
    private static let meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

    static func fechaCorta(_ iso: String, hoy: LocalDay) -> String {
        guard let d = LocalDay(iso: iso) else { return iso }
        return "\(d.day) \(meses[d.month - 1])" + (d.year != hoy.year ? " \(d.year)" : "")
    }

    static func fechas(_ v: Viaje, hoy: LocalDay) -> String {
        if v.inicio.isEmpty { return "sin fecha" }
        if v.fin.isEmpty || v.fin == v.inicio { return fechaCorta(v.inicio, hoy: hoy) }
        return fechaCorta(v.inicio, hoy: hoy) + " → " + fechaCorta(v.fin, hoy: hoy)
    }

    /// «en 12 días.», «mañana.», «hoy.», «día 2 de 5.» durante el viaje y «hace 3 días.» al acabar.
    static func cuentaAtras(_ v: Viaje, hoy: LocalDay) -> String {
        guard let a = LocalDay(iso: v.inicio) else { return "sin fecha." }
        let n = hoy.dias(hasta: a)
        if n > 1 { return "en \(n) días." }
        if n == 1 { return "mañana." }
        let b = LocalDay(iso: v.fin) ?? a
        let fin = hoy.dias(hasta: b)
        if fin < 0 { return fin == -1 ? "ayer." : "hace \(-fin) días." }
        if a == b { return "hoy." }
        return "día \(-n + 1) de \(a.dias(hasta: b) + 1)."
    }

    static func titulo(_ v: Viaje) -> String { (v.titulo.isEmpty ? (v.destino.isEmpty ? "viaje" : v.destino) : v.titulo).lowercased() + "." }

    // Tipo de transporte (EditorReservaViaje.tipos) → nombre corto, plural y símbolo del chip.
    static func clase(_ tipo: String) -> (uno: String, varios: String, simbolo: String) {
        switch tipo {
        case "avion": ("vuelo", "vuelos", "airplane")
        case "tren": ("tren", "trenes", "tram.fill")
        case "bus": ("bus", "buses", "bus.fill")
        case "coche": ("coche", "coches", "car.fill")
        case "barco": ("barco", "barcos", "ferry.fill")
        default: ("transporte", "transportes", "arrow.left.arrow.right")
        }
    }
}

/// Chips de lo reservado: «vuelo», «2 trenes», «hotel». Sobre negro, blancos; sobre blanco, grises.
struct ChipsReservasViaje: View {
    let viaje: Viaje
    var sobreOscuro = false

    private var chips: [(String, String)] {
        var orden: [String] = []
        var cuenta: [String: Int] = [:]
        for r in viaje.transportes {
            let t = r["tipo"].isEmpty ? "otro" : r["tipo"]
            if cuenta[t] == nil { orden.append(t) }
            cuenta[t, default: 0] += 1
        }
        var r = orden.map { t -> (String, String) in
            let c = TextoViajes.clase(t), n = cuenta[t] ?? 1
            return (n == 1 ? c.uno : "\(n) \(c.varios)", c.simbolo)
        }
        let n = viaje.alojamientos.count
        if n > 0 { r.append((n == 1 ? "hotel" : "\(n) hoteles", "bed.double.fill")) }
        return r
    }

    var body: some View {
        let lista = chips
        if !lista.isEmpty {
            HStack(spacing: Medida.xxs + 2) {
                ForEach(Array(lista.enumerated()), id: \.offset) { _, c in Chip(texto: c.0, tono: sobreOscuro ? .blanco : .sutil, icono: c.1) }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("reservas: " + lista.map(\.0).joined(separator: ", "))
        }
    }
}

/// Campo de añadir en línea dentro de una tarjeta: texto en gris sutil y botón negro en cápsula.
struct CampoAnadirViaje: View {
    let placeholder: String
    @Binding var texto: String
    var boton = "añadir."
    let accion: () -> Void

    private var vacio: Bool { texto.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        HStack(spacing: Medida.xs) {
            TextField("", text: $texto, prompt: Text(placeholder).foregroundColor(Lienzo.tintaTerciaria))
                .font(Letra.cuerpo)
                .foregroundStyle(Lienzo.tinta)
                .submitLabel(.done)
                .onSubmit { if !vacio { accion() } }
                .padding(.horizontal, Medida.s)
                .frame(height: Medida.alturaControl)
                .background(Lienzo.sutil, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
            Button(boton) { Haptica.ligera(); accion() }
                .buttonStyle(.capsula(.oscuro))
                .disabled(vacio)
        }
    }
}
