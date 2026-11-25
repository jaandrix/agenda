import SwiftUI

// La semana semi flotante (foto 4): una tarjeta blanca de esquinas generosas, con el mes arriba y los siete días; se pasa
// de semana deslizando (paginado nativo, conserva la inercia del dedo). El día elegido lleva una placa gris que se desliza
// de un día a otro; hoy va en naranja; debajo de cada número, hasta tres puntitos de color (Lienzo.Punto) con lo que hay.
struct SemanaFlotante: View {
    let hoy: LocalDay
    let elegido: LocalDay
    /// Los colores de los puntitos de un día (se pintan tres como mucho). Debe ser barato: se llama al pintar.
    let puntos: (LocalDay) -> [Color]
    let elegir: (LocalDay) -> Void
    /// Semanas navegables a cada lado de hoy.
    var alcance = 26
    /// Lo que va a la derecha del mes (por ejemplo, un botón para ver el mes entero).
    var accesorio: AnyView?

    @State private var visible: LocalDay?
    @Namespace private var espacio
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    private static let abreviaturas = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
    private static let nombres = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    private static let meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
                                "octubre", "noviembre", "diciembre"]

    private var lunesDeHoy: LocalDay { hoy.inicioSemanaLunes }
    private var lunes: [LocalDay] { (-alcance...alcance).map { lunesDeHoy.sumando(dias: $0 * 7) } }
    private var semanaVisible: LocalDay { visible ?? elegido.inicioSemanaLunes }

    var body: some View {
        VStack(spacing: Medida.xs) {
            cabecera
            ScrollView(.horizontal) {
                LazyHStack(spacing: 0) {
                    ForEach(lunes, id: \.self) { l in
                        semana(l).containerRelativeFrame(.horizontal)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $visible)
            .scrollIndicators(.hidden)
            .frame(height: 74)
        }
        .padding(.top, Medida.s)
        .padding(.bottom, Medida.xs)
        .padding(.horizontal, 6)
        .fondoConSombra(Lienzo.tarjeta, en: RoundedRectangle(cornerRadius: Medida.radioTarjeta + 2, style: .continuous),
                        sombra: .flotante, filo: Lienzo.filo)
        .onAppear { visible = elegido.inicioSemanaLunes }
        .onChange(of: elegido) { _, nuevo in
            let l = nuevo.inicioSemanaLunes
            if l != visible { withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { visible = l } }
        }
        .sensoryFeedback(.selection, trigger: visible)
        .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: elegido)
    }

    private var cabecera: some View {
        HStack(alignment: .center, spacing: Medida.xs) {
            Text(tituloMes(semanaVisible))
                .font(Letra.seccion).foregroundStyle(Lienzo.tinta)
                .contentTransition(.numericText())
                .animation(Muelle.rapido, value: semanaVisible)
            Spacer()
            if elegido != hoy || semanaVisible != lunesDeHoy {
                Button {
                    elegir(hoy)
                    withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { visible = lunesDeHoy }
                } label: {
                    // 3.2: 44 de toque sin cambiar el alto de la cabecera (28).
                    Chip(texto: "hoy", tono: .naranja).padding(10).contentShape(Rectangle())
                }
                .buttonStyle(.pulsable(0.9))
                .padding(-10)
                .transition(.scale(scale: 0.7).combined(with: .opacity))
                .accessibilityLabel("volver a hoy")
            }
            if let accesorio { accesorio }
        }
        .padding(.horizontal, 10)
        .frame(height: 28)
        .animation(Muelle.rapido, value: elegido != hoy || semanaVisible != lunesDeHoy)
    }

    private func semana(_ l: LocalDay) -> some View {
        HStack(spacing: 2) {
            ForEach(0..<7, id: \.self) { i in
                dia(l.sumando(dias: i), indice: i)
            }
        }
    }

    private func dia(_ d: LocalDay, indice: Int) -> some View {
        let on = d == elegido
        let esHoy = d == hoy
        let colores = Array(puntos(d).prefix(3))
        return Button {
            guard d != elegido else { return }
            Haptica.ligera()
            elegir(d)
        } label: {
            VStack(spacing: 5) {
                Text(Self.abreviaturas[indice])
                    .font(Tipo.poppins(11, .medium, estilo: .caption))
                    .foregroundStyle(on ? Lienzo.sobreOscuroSuave : Lienzo.tintaTerciaria)
                Text("\(d.day)")
                    .font(Tipo.poppins(16, on || esHoy ? .semibold : .regular, estilo: .headline).monospacedDigit())
                    .foregroundStyle(on ? (esHoy ? Lienzo.hoySobreOscuro : Lienzo.sobreOscuro)
                                     : (esHoy ? Lienzo.naranjaProfundo : (d < hoy ? Lienzo.tintaSecundaria : Lienzo.tinta)))
                HStack(spacing: 3) {
                    ForEach(Array(colores.enumerated()), id: \.offset) { _, c in Puntito(color: on && c == Lienzo.tinta ? Lienzo.sobreOscuro : c, tamano: 4.5) }
                }
                .frame(height: 5)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background {
                if on {
                    RoundedRectangle(cornerRadius: Medida.radioFila, style: .continuous)
                        .fill(Lienzo.placaElegido)
                        .matchedGeometryEffect(id: "elegido", in: espacio)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(Pulsable(escala: 0.9, haptica: false))
        .accessibilityLabel("\(Self.nombres[indice]) \(d.day) de \(Self.meses[d.month - 1])\(esHoy ? ", hoy" : "")")
        .accessibilityValue(colores.isEmpty ? "sin nada" : "con cosas")
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    // El mes del jueves de la semana (como la ISO): «noviembre» o «noviembre 2027» si no es este año.
    private func tituloMes(_ l: LocalDay) -> String {
        let j = l.sumando(dias: 3)
        let mes = Self.meses[j.month - 1]
        return j.year == hoy.year ? mes : "\(mes) \(j.year)"
    }
}
