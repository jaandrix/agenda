import SwiftUI

// Rutinas 2.0: resumen del día con el anillo y las rutinas de hoy por momento, cada una con su semana en puntitos.
// Marcar es toggleHabitToday (.marcarRutina), como antes; la lectura es LecturaRutinas.
struct RutinasView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var vista: VistaRutinas?
    @State private var aviso: String?
    @State private var plegados: Set<MomentoRutina> = []
    @State private var celebrar = 0

    // CasillaMarcar (Tarjetas.swift) dibuja un cuadrado de 22 dentro de un área de 44: se corre para alinearlo.
    private let ladoCasilla: CGFloat = 22
    private var sangriaCasilla: CGFloat { (Medida.toque - ladoCasilla) / 2 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "rutinas.", subtitulo: subtitulo)
                    .padding(.bottom, Medida.xs)
                if let aviso {
                    Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.negativo)
                        .transition(.opacity)
                }
                if let v = vista {
                    if v.rutinas.isEmpty {
                        vacio(v).entradaEscalonada(0)
                    } else {
                        resumen(v).entradaEscalonada(0)
                        ForEach(Array(MomentoRutina.allCases.filter { !v.de($0).isEmpty }.enumerated()), id: \.element) { i, m in
                            seccion(m, v.de(m)).entradaEscalonada(i + 1)
                        }
                    }
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .task(id: c.revision) {
            let doc = await c.documentoVisible()
            guard let nuevo = await ultimaGana({ doc.map { LecturaRutinas.vista($0) } }) else { return }
            vista = nuevo
        }
    }

    private var subtitulo: String? {
        guard let v = vista else { return nil }
        return v.rutinas.isEmpty ? "ninguna hoy." : "\(v.hechas) de \(v.rutinas.count) hoy."
    }

    // MARK: - Resumen

    private func resumen(_ v: VistaRutinas) -> some View {
        HStack(spacing: Medida.s) {
            AnilloProgreso(progreso: v.progreso, celebrar: celebrar)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: Medida.xxs) {
                    Text("\(v.hechas)").font(Letra.numero).foregroundStyle(Lienzo.tinta)
                        .contentTransition(.numericText())
                    Text("de \(v.rutinas.count)").font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                }
                Text(frase(v)).font(Letra.pie).foregroundStyle(v.completa ? Lienzo.naranjaProfundo : Lienzo.tintaSecundaria)
                    .contentTransition(.opacity)
            }
            Spacer(minLength: Medida.xs)
            if let r = v.mejorRacha {
                VStack(alignment: .trailing, spacing: 2) {
                    Text("MEJOR RACHA").font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.tintaTerciaria)
                    Text(textoRacha(r)).font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta).monospacedDigit()
                        .contentTransition(.numericText())
                }
            }
        }
        .tarjeta()
        .accessibilityElement(children: .combine)
    }

    private func frase(_ v: VistaRutinas) -> String {
        if v.completa { return "todo hecho hoy." }
        let quedan = v.rutinas.count - v.hechas
        return quedan == 1 ? "te queda una." : "te quedan \(quedan)."
    }

    private func textoRacha(_ r: RutinaHoy) -> String {
        if case .semana = r.frecuencia { return "\(r.racha) semanas" }
        return "\(r.racha) días"
    }

    // MARK: - Secciones

    private func seccion(_ m: MomentoRutina, _ lista: [RutinaHoy]) -> some View {
        let abierta = Binding(
            get: { !plegados.contains(m) },
            set: { if $0 { plegados.remove(m) } else { plegados.insert(m) } })
        return SeccionPlegable(titulo: m.titulo, detalle: "\(lista.filter(\.hecha).count) de \(lista.count)", abierta: abierta) {
            VStack(spacing: 0) {
                ForEach(Array(lista.enumerated()), id: \.element.id) { i, r in
                    if i > 0 { SeparadorFila(sangria: ladoCasilla + Medida.s) }
                    fila(r)
                }
            }
        }
        .padding(.vertical, -Medida.xxs)
        .tarjeta(relleno: Medida.s)
    }

    private func fila(_ r: RutinaHoy) -> some View {
        HStack(alignment: .center, spacing: Medida.s - sangriaCasilla) {
            CasillaMarcar(hecha: r.hecha) { marcar(r) }
                .padding(.leading, -sangriaCasilla)
                .padding(.vertical, -Medida.xxs)
            VStack(alignment: .leading, spacing: 6) {
                Text(r.texto).font(Letra.cuerpoFuerte)
                    .foregroundStyle(r.hecha ? Lienzo.tintaSecundaria : Lienzo.tinta)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                HStack(spacing: Medida.xs) {
                    PuntosSemana(dias: r.semana)
                    Spacer(minLength: Medida.xs)
                    if let d = r.detalle {
                        Text(d).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit().lineLimit(1)
                            .contentTransition(.numericText())
                    }
                }
            }
            .padding(.vertical, Medida.s)
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: - Vacío

    @ViewBuilder private func vacio(_ v: VistaRutinas) -> some View {
        if v.activas == 0 {
            TarjetaInvitacion(frase: "aún no tienes rutinas.", destacado: "créalas en la web y aparecerán aquí.")
        } else {
            TarjetaInvitacion(frase: "hoy no toca ninguna rutina.", destacado: "día libre.")
        }
    }

    // MARK: - Marcar

    private func marcar(_ r: RutinaHoy) {
        guard var v = vista, let i = v.rutinas.firstIndex(where: { $0.id == r.id }) else { return }
        let estaba = v.completa
        let hecha = !v.rutinas[i].hecha
        v.rutinas[i].marcar(hecha)
        withAnimation(Muelle.o(Muelle.expandir, reducido: sinMovimiento)) { vista = v; aviso = nil }
        if v.completa && !estaba {
            Task {
                try? await Task.sleep(for: .milliseconds(260))
                Haptica.suave()
                celebrar += 1
            }
        }
        Task {
            do { try await c.encolar(.marcarRutina(id: r.id, dia: CalendarioBitacora.madrid.dia(de: Date()).iso, hecha: hecha)) } catch {
                if var w = vista, let j = w.rutinas.firstIndex(where: { $0.id == r.id }) {
                    w.rutinas[j].marcar(!hecha)
                    withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { vista = w }
                }
                withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { aviso = "no se pudo guardar en este iPhone." }
                Haptica.error()
            }
        }
    }
}
