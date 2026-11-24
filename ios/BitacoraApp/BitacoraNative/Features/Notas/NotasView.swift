import SwiftUI
import UIKit

// Notas 2.0 (foto 2, «Vorb»): la marca arriba sobre el degradado, «tus notas.», un buscador en cápsula, la nota rápida
// y las tarjetas, que se amplían en su sitio al tocarlas.
struct NotasView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var notas: [FichaNota]?
    @State private var buscar = ""
    @State private var nota = ""
    @State private var idNota = OperacionBitacora.nuevoIdNota()
    @State private var guardando = false
    @State private var abierta: String?
    @State private var recien: String?
    @State private var primeraCarga = true
    @FocusState private var escribiendo: Bool
    @Namespace private var espacio

    private var consulta: [String] {
        LecturaNotas.normalizar(buscar).split(whereSeparator: \.isWhitespace).map(String.init)
    }
    private var filtradas: [FichaNota] {
        let q = consulta
        guard !q.isEmpty else { return notas ?? [] }
        return (notas ?? []).filter { n in q.allSatisfy { n.clave.contains($0) } }
    }
    private var notaVacia: Bool { nota.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraMarca()
                cabecera
                    .padding(.bottom, Medida.xxs)
                BuscadorCapsula(texto: $buscar, placeholder: "buscar en tus notas")
                campoNota
                    .padding(.bottom, Medida.xs)
                lista
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xxs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: buscar)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .cabeceraPortada(alto: Medida.portadaCorta, aSangre: true)
        .fondoLienzo()
        .toolbarBackground(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: c.revision) {
            let doc = await c.documentoVisible()
            guard let nuevo = await ultimaGana({ doc.map { LecturaNotas.fichas($0) } }) else { return }
            recibir(nuevo)
        }
    }

    // MARK: - Cabecera

    private var cabecera: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("tus notas.").font(Letra.titulo).foregroundStyle(Lienzo.tinta).kerning(-0.4)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: Medida.xs)
            if let recuento {
                Text(recuento).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit()
                    .contentTransition(.numericText())
                    .animation(Muelle.rapido, value: recuento)
            }
        }
    }

    private var recuento: String? {
        guard let notas else { return nil }
        if consulta.isEmpty { return notas.count == 1 ? "1 nota." : "\(notas.count) notas." }
        return "\(filtradas.count) de \(notas.count)."
    }

    // MARK: - Nota rápida

    private var campoNota: some View {
        let abierto = escribiendo || !notaVacia
        return VStack(alignment: .leading, spacing: Medida.s) {
            TextField("", text: $nota, prompt: Text("escribe una nota.").foregroundColor(Lienzo.tintaTerciaria), axis: .vertical)
                .font(Letra.cuerpo)
                .foregroundStyle(Lienzo.tinta)
                .lineLimit(abierto ? 3...10 : 1...10)
                .focused($escribiendo)
                .accessibilityLabel("nota rápida")
            if abierto {
                HStack(spacing: Medida.xs) {
                    Text("se guarda en hoy.").font(Letra.pie).foregroundStyle(Lienzo.tintaTerciaria)
                    Spacer(minLength: Medida.xs)
                    Button("guardar.") { guardarNota() }
                        .buttonStyle(.capsula)
                        .disabled(notaVacia || guardando)
                }
                .transition(.opacity.combined(with: .offset(y: -6)))
            }
        }
        .tarjeta(relleno: 14)
        .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        .onTapGesture { escribiendo = true }
        .animation(Muelle.o(Muelle.expandir, reducido: sinMovimiento), value: abierto)
    }

    // MARK: - Lista

    private enum Fila: Identifiable {
        case mes(String)
        case nota(FichaNota, Int)
        var id: String {
            switch self {
            case .mes(let m): return "mes-" + m
            case .nota(let n, _): return n.id
            }
        }
    }

    // Con muchas notas, una etiqueta por mes; con pocas, la lista seguida.
    private var filas: [Fila] {
        let lista = filtradas
        let agrupar = lista.count > 8
        var r: [Fila] = []
        var mes = ""
        for (i, n) in lista.enumerated() {
            if agrupar && n.mes != mes { mes = n.mes; r.append(.mes(mes)) }
            r.append(.nota(n, i))
        }
        return r
    }

    @ViewBuilder private var lista: some View {
        if let notas {
            if notas.isEmpty {
                TarjetaInvitacion(frase: "aún no has escrito nada.", destacado: "una frase basta.", boton: "escribir.") {
                    escribiendo = true
                }
                .transition(.opacity)
            } else if filtradas.isEmpty {
                TarjetaInvitacion(frase: "ninguna nota dice", destacado: "«\(buscar.trimmingCharacters(in: .whitespaces))».",
                                  boton: "borrar búsqueda.") {
                    Haptica.ligera()
                    buscar = ""
                }
                .transition(.opacity.combined(with: .scale(scale: 0.98)))
            } else {
                ForEach(filas) { f in
                    switch f {
                    case .mes(let m):
                        EtiquetaSeccion(texto: LecturaNotas.nombreMes(m))
                            .padding(.top, Medida.s)
                            .transition(.opacity)
                    case .nota(let n, let i):
                        tarjetaNota(n)
                            .modifier(EntradaNota(indice: i, activa: primeraCarga && i < 10))
                            .transition(.asymmetric(
                                insertion: .opacity.combined(with: .offset(y: -10)).combined(with: .scale(scale: 0.97, anchor: .top)),
                                removal: .opacity.combined(with: .scale(scale: 0.97))))
                    }
                }
            }
        }
    }

    @ViewBuilder private func tarjetaNota(_ n: FichaNota) -> some View {
        Group {
            if abierta == n.id {
                NotaAbierta(nota: n) { alternar(n) }
            } else {
                TarjetaNota(titulo: n.titulo, extracto: n.extracto, dato: n.dato, fecha: n.fecha) { alternar(n) }
            }
        }
        .matchedGeometryEffect(id: n.id, in: espacio)
        .overlay {
            RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous)
                .strokeBorder(Lienzo.naranjaBrillo, lineWidth: 1.5)
                .opacity(recien == n.id ? 1 : 0)
                .allowsHitTesting(false)
        }
    }

    // MARK: - Acciones

    private func alternar(_ n: FichaNota) {
        Haptica.ligera()
        escribiendo = false
        withAnimation(Muelle.o(Muelle.expandir, reducido: sinMovimiento)) { abierta = abierta == n.id ? nil : n.id }
    }

    private func recibir(_ nuevo: [FichaNota]?) {
        guard let anterior = notas else {
            notas = nuevo
            Task {
                try? await Task.sleep(for: .seconds(1))
                primeraCarga = false
            }
            return
        }
        if anterior.map(\.id) == nuevo?.map(\.id) {
            notas = nuevo
        } else {
            withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento)) { notas = nuevo }
        }
    }

    private func guardarNota() {
        let texto = String(nota.trimmingCharacters(in: .whitespacesAndNewlines).prefix(5000))
        guard !texto.isEmpty, !guardando else { return }
        let id = idNota
        guardando = true
        // El texto se queda en el campo hasta que la cola lo tiene guardado.
        Task {
            let ok = await c.guardar(.crearNota(id: id, dia: CalendarioBitacora.madrid.dia(de: Date()).iso, texto: texto,
                                                creada: ISO8601DateFormatter().string(from: Date())))
            guardando = false
            guard ok else { Haptica.error(); return }
            Haptica.exito()
            if nota.trimmingCharacters(in: .whitespacesAndNewlines) == texto { nota = "" }
            idNota = OperacionBitacora.nuevoIdNota()
            escribiendo = false
            recien = id
            try? await Task.sleep(for: .seconds(1.8))
            if recien == id { withAnimation(Muelle.o(Muelle.suave, reducido: sinMovimiento)) { recien = nil } }
        }
    }
}

// MARK: - Nota ampliada

// La tarjeta abierta: el título recoge, el texto entero se puede seleccionar y abajo van copiar y compartir.
// (No hay operación de borrar notas en la app nativa, así que no se ofrece.)
struct NotaAbierta: View {
    let nota: FichaNota
    let recoger: () -> Void
    @State private var copiada = false

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            Button(action: recoger) {
                HStack(alignment: .firstTextBaseline, spacing: Medida.xs) {
                    Text(nota.titulo).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: Medida.xs)
                    Image(systemName: "chevron.up").font(.system(size: 11, weight: .bold)).foregroundStyle(Lienzo.tintaTerciaria)
                        .accessibilityHidden(true)
                }
                .frame(minHeight: Medida.toque - Medida.xs)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pulsable(0.98))
            .accessibilityHint("toca para recoger")

            if !nota.cuerpo.isEmpty {
                Text(nota.cuerpo).font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                    .lineSpacing(3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }

            if nota.etiquetas.count > 1 {
                HStack(spacing: Medida.xxs + 2) {
                    ForEach(nota.etiquetas.prefix(4), id: \.self) { Chip(texto: "#" + $0) }
                }
            }

            HStack {
                if let dato = nota.dato { Text(dato).font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta).monospacedDigit() }
                Spacer()
                Text(nota.fecha).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit()
            }
            .padding(.top, Medida.xxs)

            SeparadorFila(sangria: 0)

            HStack(spacing: Medida.xs) {
                Button(action: copiar) {
                    HStack(spacing: 6) {
                        Image(systemName: copiada ? "checkmark" : "doc.on.doc").font(.system(size: 12, weight: .semibold))
                            .contentTransition(.symbolEffect(.replace))
                        Text(copiada ? "copiada." : "copiar.")
                    }
                }
                .buttonStyle(.capsula(.claro))
                .accessibilityLabel(copiada ? "nota copiada" : "copiar la nota")
                ShareLink(item: nota.completo) {
                    HStack(spacing: 6) {
                        Image(systemName: "square.and.arrow.up").font(.system(size: 12, weight: .semibold))
                        Text("compartir.")
                    }
                }
                .buttonStyle(.capsula(.claro))
                Spacer(minLength: 0)
            }
        }
        .tarjeta()
    }

    private func copiar() {
        UIPasteboard.general.string = nota.completo
        Haptica.ligera()
        withAnimation(Muelle.rapido) { copiada = true }
        Task {
            try? await Task.sleep(for: .seconds(1.6))
            withAnimation(Muelle.rapido) { copiada = false }
        }
    }
}

// MARK: - Entrada de la lista

// Como `.entradaEscalonada`, pero solo en la primera carga: las filas que la lista perezosa crea al hacer scroll
// aparecen ya puestas, sin el retraso del escalón.
private struct EntradaNota: ViewModifier {
    let indice: Int
    let activa: Bool
    @State private var visible = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    func body(content: Content) -> some View {
        let puesta = visible || !activa
        content
            .opacity(puesta ? 1 : 0)
            .offset(y: puesta || sinMovimiento ? 0 : 8)
            .onAppear {
                guard activa, !visible else { return }
                withAnimation(Muelle.o(Muelle.entrada, reducido: sinMovimiento).delay(Double(indice) * Muelle.escalon)) { visible = true }
            }
    }
}

#Preview("nota ampliada") {
    let n = FichaNota(id: "n1", titulo: "estrategia del trimestre", extracto: "alineadas las prioridades y los hitos clave.",
                      cuerpo: "alineadas las prioridades y los hitos clave para el próximo trimestre,\ncon fechas y responsables.",
                      completo: "estrategia del trimestre\nalineadas las prioridades.", dia: "2026-11-24", creada: "",
                      hora: "10:12", etiquetas: [], clave: "")
    return ScrollView {
        VStack(spacing: Medida.entreTarjetas) {
            NotaAbierta(nota: n) {}
            TarjetaNota(titulo: n.titulo, extracto: n.extracto, dato: n.dato, fecha: n.fecha) {}
        }
        .padding(Medida.margen)
    }
    .fondoLienzo()
}
