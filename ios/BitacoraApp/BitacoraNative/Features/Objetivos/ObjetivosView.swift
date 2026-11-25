import SwiftUI

// Objetivos (renderGoals en js/notas-objetivos.js, saveEntry type goal en js/entradas.js): entradas `type: goal` con plazo,
// estado, hitos y, si son numéricos, valor actual, meta y unidad. Desde la 0.24, el mandala Harada, el paso kaizen y el
// tablero por estado (MetodoObjetivos.swift); «para qué» (`proposito`) solo se lee; escribirlo y el hansei siguen en la web.

struct HitoObjetivo: Sendable, Identifiable, Equatable { let texto: String; let hecho: Bool; var id: String { texto } }

struct Objetivo: Sendable, Identifiable, Equatable {
    let id, titulo, plazo, estado, unidad, notas: String
    let numerico: Bool
    let actual, meta: Decimal
    let hitos: [HitoObjetivo]
    var pilares: [PilarMandala] = []
    var kaizen: KaizenObjetivo?
    var proposito = ""

    // goalProgressPct: solo los numéricos con meta.
    var porcentaje: Int? {
        guard numerico, meta > 0 else { return nil }
        let p = NSDecimalNumber(decimal: actual / meta * 100).doubleValue
        return max(0, min(100, Int(p.rounded())))
    }
}

enum LecturaObjetivos {
    static let plazos: [(String, String)] = [("short", "corto plazo"), ("medium", "medio plazo"), ("long", "largo plazo")]
    static let estados = ["Pendiente", "En progreso", "Completado"]

    static func normal(_ t: String) -> String {
        t.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES")).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func objetivos(_ doc: DocumentoBitacora) -> [Objetivo] {
        let habits = ((try? doc.valor(de: "habits")) ?? nil)?.lista ?? []
        return (((try? doc.valor(de: "entries")) ?? nil)?.lista ?? []).compactMap { x -> Objetivo? in
            guard let o = x.objeto, o["type"]?.texto == "goal", let id = o["id"]?.comoId else { return nil }
            let hitos = (o["milestones"]?.lista ?? []).compactMap { h -> HitoObjetivo? in
                guard let t = h["text"]?.texto, !t.isEmpty else { return nil }
                return HitoObjetivo(texto: t, hecho: h["done"]?.booleano == true)
            }
            var g = Objetivo(id: id, titulo: o["title"]?.texto ?? "", plazo: o["term"]?.texto ?? "short", estado: o["status"]?.texto ?? "Pendiente",
                            unidad: o["unit"]?.texto ?? "", notas: o["notes"]?.texto ?? "", numerico: o["goalType"]?.texto == "numeric",
                            actual: Dinero.decimal(o["currentValue"]) ?? 0, meta: Dinero.decimal(o["targetValue"]) ?? 0, hitos: hitos,
                            pilares: LecturaMetodo.pilares(o), kaizen: LecturaMetodo.kaizen(o, habits: habits))
            g.proposito = (o["proposito"]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return g
        }
    }

    // goalNumber: hasta dos decimales, con la coma. Un solo formateador (crearlo en cada tarjeta pesaba al pintar).
    private static let formatoCifra: NumberFormatter = {
        let f = NumberFormatter(); f.locale = Locale(identifier: "es_ES"); f.maximumFractionDigits = 2; f.numberStyle = .decimal
        return f
    }()

    static func cifra(_ d: Decimal) -> String { formatoCifra.string(from: NSDecimalNumber(decimal: d)) ?? "\(d)" }
}

private struct ObjetivoAbierto: Identifiable { let id: String }
private struct EdicionObjetivo: Identifiable { let objetivo: Objetivo?; var id: String { objetivo?.id ?? "nuevo" } }

enum FiltroObjetivos: String { case enCurso, cumplidos, tablero }

// Objetivos 3.0: el principal en negro con su barra y el siguiente hito; el resto, en tarjetas blancas por plazo con los
// hitos marcables; «cumplidos.» y el tablero en el segmento.
struct ObjetivosView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var leida: PantallaObjetivos?
    @State private var abierto: ObjetivoAbierto?
    @State private var edicion: EdicionObjetivo?
    @AppStorage("bitacora.objetivos.filtro") private var filtro: FiltroObjetivos = .enCurso

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "objetivos.", subtitulo: subtitulo) {
                    BotonRedondo(sistema: "plus", tono: .oscuro, etiqueta: "nuevo objetivo") { nuevo() }
                }
                .padding(.bottom, Medida.xxs)
                if let pantalla {
                    if pantalla.todos.isEmpty {
                        TarjetaInvitacion(frase: "aún no persigues nada aquí.", destacado: "empieza por uno pequeño.", boton: "nuevo objetivo.") { nuevo() }
                            .entradaEscalonada(0)
                    } else {
                        SegmentoCapsula(opciones: [.init(valor: FiltroObjetivos.enCurso, titulo: "en curso"),
                                                   .init(valor: FiltroObjetivos.cumplidos, titulo: "cumplidos"),
                                                   .init(valor: FiltroObjetivos.tablero, titulo: "tablero")],
                                        elegido: $filtro, sobreBlanco: false)
                        Group {
                            switch filtro {
                            case .enCurso: enCurso(pantalla)
                            case .cumplidos: cumplidos(pantalla)
                            case .tablero:
                                TableroObjetivos(objetivos: pantalla.todos, abrir: { abrir($0) },
                                                 mover: { g, e in Task { await c.guardar(MetodoOp.opEstado(objetivo: g.id, estado: e)) } })
                            }
                        }
                        .id(filtro)
                        .transition(.opacity)
                    }
                } else {
                    ProgressView().tint(Lienzo.tintaSecundaria).frame(maxWidth: .infinity).padding(.top, Medida.xl)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: pantalla)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .refreshable { await c.sincronizar() }
        .task(id: c.revision) { await cargar() }
        .hoja(item: $abierto) { a in FichaObjetivo(id: a.id).environment(c) }
        .hoja(item: $edicion) { e in EditorObjetivo(objetivo: e.objetivo).environment(c) }
    }

    // Lo leído y, mientras llega, lo último que se leyó de esta cuenta: se pinta al momento, sin spinner.
    private var pantalla: PantallaObjetivos? { leida ?? MemoriaObjetivos.valor(MemoriaObjetivos.objetivos, uid: c.sesion?.userId) }

    private var subtitulo: String? {
        guard let pantalla else { return nil }
        return pantalla.todos.isEmpty ? "lo que persigues." : "\(pantalla.cumplidos.count) de \(pantalla.todos.count) cumplidos."
    }

    // MARK: - En curso

    @ViewBuilder private func enCurso(_ pantalla: PantallaObjetivos) -> some View {
        if let p = pantalla.principal {
            principal(p).entradaEscalonada(0)
            ForEach(pantalla.grupos, id: \.plazo) { grupo in
                EtiquetaSeccion(texto: grupo.titulo).padding(.top, Medida.s)
                ForEach(Array(grupo.objetivos.enumerated()), id: \.element.id) { n, g in
                    tarjeta(g).entradaEscalonadaCorta(grupo.desde + n + 1)
                }
            }
        } else {
            TarjetaInvitacion(frase: "todo lo que perseguías, cumplido.", destacado: "¿a por el siguiente?", boton: "nuevo objetivo.") { nuevo() }
                .entradaEscalonada(0)
        }
    }

    private func principal(_ g: Objetivo) -> some View {
        TarjetaOscura {
            VStack(alignment: .leading, spacing: Medida.s) {
                Button { abrir(g) } label: {
                    VStack(alignment: .leading, spacing: Medida.s) {
                        HStack(alignment: .firstTextBaseline) {
                            Text("el principal.").font(Letra.pieFuerte).foregroundStyle(Lienzo.sobreOscuroSuave)
                            Spacer()
                            Text(plazo(g)).font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave)
                        }
                        Text(g.titulo.lowercased() + ".").font(Letra.tituloTarjeta).foregroundStyle(Lienzo.sobreOscuro)
                            .multilineTextAlignment(.leading)
                        if let a = g.avance {
                            HStack(spacing: Medida.s) {
                                BarraFinaObjetivos(valor: a, sobreOscuro: true)
                                if let t = g.avanceTexto { Text(t).font(Letra.hora).foregroundStyle(Lienzo.naranja) }
                            }
                        }
                        if g.numerico {
                            Text(cifras(g)).font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave)
                        }
                        if !g.proposito.isEmpty {
                            Text("para qué. " + g.proposito).font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave).lineLimit(3)
                                .multilineTextAlignment(.leading)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.pulsable(0.98))
                .accessibilityHint("abre el objetivo")
                if let h = g.siguienteHito {
                    Rectangle().fill(Lienzo.filoOscuro).frame(height: 1)
                    HStack(spacing: Medida.xxs) {
                        CasillaMarcar(hecha: false) { marcarHito(g, h) }
                        VStack(alignment: .leading, spacing: 1) {
                            Text("siguiente hito.").font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave)
                            Text(h.texto).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.sobreOscuro).lineLimit(2)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.leading, -Medida.s)
                    .accessibilityElement(children: .combine)
                    .accessibilityValue("pendiente")
                    .accessibilityAction { marcarHito(g, h) }
                }
            }
        }
        .contextMenu { menu(g) }
    }

    private func tarjeta(_ g: Objetivo) -> some View {
        VStack(alignment: .leading, spacing: Medida.xxs) {
            Button { abrir(g) } label: {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: Medida.xs) {
                        Text(g.titulo.lowercased() + ".").font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: Medida.xs)
                        Chip(texto: g.estado.lowercased() + ".", tono: g.estado == "En progreso" ? .oscuro : .sutil)
                    }
                    Text(detalle(g)).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    if let a = g.avance { BarraFinaObjetivos(valor: a).padding(.vertical, 2) }
                    if !g.proposito.isEmpty {
                        Text("para qué. " + g.proposito).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pulsable(0.98))
            .accessibilityHint("abre el objetivo")
            let pendientes = Array(g.hitos.filter { !$0.hecho }.prefix(3))
            if !pendientes.isEmpty {
                VStack(spacing: 0) {
                    ForEach(pendientes) { h in filaHito(g, h) }
                }
            }
        }
        .tarjeta()
        .contextMenu { menu(g) }
    }

    private func filaHito(_ g: Objetivo, _ h: HitoObjetivo) -> some View {
        HStack(spacing: Medida.xxs) {
            CasillaMarcar(hecha: h.hecho) { marcarHito(g, h) }
            Text(h.texto).font(Letra.cuerpo).foregroundStyle(h.hecho ? Lienzo.tintaSecundaria : Lienzo.tinta)
                .strikethrough(h.hecho, color: Lienzo.tintaTerciaria).lineLimit(2)
            Spacer(minLength: 0)
        }
        .padding(.leading, -Medida.s)
        .accessibilityElement(children: .combine)
        .accessibilityValue(h.hecho ? "hecho" : "pendiente")
        .accessibilityAction { marcarHito(g, h) }
    }

    // MARK: - Cumplidos

    @ViewBuilder private func cumplidos(_ pantalla: PantallaObjetivos) -> some View {
        let hechos = pantalla.cumplidos
        if hechos.isEmpty {
            EstadoVacio(texto: "aún ninguno cumplido. el primero llegará.").tarjeta(relleno: Medida.xs).entradaEscalonada(0)
        }
        ForEach(Array(hechos.enumerated()), id: \.element.id) { n, g in
            Button { abrir(g) } label: {
                HStack(spacing: Medida.s) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(g.titulo.lowercased() + ".").font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tintaSecundaria)
                            .multilineTextAlignment(.leading)
                        Text(plazo(g)).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    }
                    Spacer(minLength: Medida.xs)
                    Chip(texto: "cumplido.", tono: .verde)
                }
                .tarjeta(relleno: Medida.s)
                .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
            }
            .buttonStyle(.pulsable(0.97))
            .contextMenu { menu(g) }
            .entradaEscalonadaCorta(n)
        }
    }

    // MARK: - Acciones

    @ViewBuilder private func menu(_ g: Objetivo) -> some View {
        Button("editar.") { edicion = EdicionObjetivo(objetivo: g) }
        Button("eliminar.", role: .destructive) { Task { await c.guardar(.borrarEntrada(id: g.id)) } }
    }

    private func nuevo() { edicion = EdicionObjetivo(objetivo: nil) }

    private func abrir(_ g: Objetivo) {
        Haptica.ligera()
        abierto = ObjetivoAbierto(id: g.id)
    }

    private func marcarHito(_ g: Objetivo, _ h: HitoObjetivo) {
        Task { await c.guardar(.cambiarObjetivo(objetivoId: g.id, cambio: .hitoHecho(texto: h.texto, hecho: !h.hecho))) }
    }

    private func plazo(_ g: Objetivo) -> String { (LecturaObjetivos.plazos.first { $0.0 == g.plazo }?.1 ?? g.plazo) + "." }

    private func cifras(_ g: Objetivo) -> String {
        "\(LecturaObjetivos.cifra(g.actual)) de \(LecturaObjetivos.cifra(g.meta))\(g.unidad.isEmpty ? "" : " " + g.unidad)."
    }

    private func detalle(_ g: Objetivo) -> String {
        var partes = [String(plazo(g).dropLast())]
        if g.numerico { partes.append(String(cifras(g).dropLast())) }
        if !g.hitos.isEmpty { partes.append("\(g.hitos.filter(\.hecho).count) de \(g.hitos.count) hitos") }
        return partes.joined(separator: ", ") + "."
    }

    private func cargar() async {
        let uid = c.sesion?.userId ?? ""
        let r = c.revision
        if let m = MemoriaObjetivos.valor(MemoriaObjetivos.objetivos, uid: uid, revision: r) {
            if leida != m { leida = m }
            return
        }
        let doc = await c.documentoVisible()
        guard let nuevo = await ultimaGana({ doc.map { PantallaObjetivos(LecturaObjetivos.objetivos($0)) } }) else { return }
        if let nuevo { MemoriaObjetivos.objetivos = MemoriaObjetivos.Hueco(uid: uid, revision: r, valor: nuevo) }
        // Solo si cambió: cada revisión (de cualquier apartado) repintaba la pantalla entera.
        if leida != nuevo || leida == nil { leida = nuevo }
    }
}

// La ficha: cabecera en negro, «para qué», el progreso, los hitos y el método.
private struct FichaObjetivo: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    let id: String
    @State private var leido: Objetivo?
    @State private var nuevoHito = ""
    @State private var actual = ""
    @State private var editando = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                    if let g = objetivo {
                        cabecera(g).entradaEscalonada(0)
                        if !g.proposito.isEmpty || !g.notas.isEmpty { texto(g).entradaEscalonada(1) }
                        if g.numerico { progreso(g).entradaEscalonada(2) }
                        hitos(g).entradaEscalonada(3)
                        MetodoSecciones(objetivo: g).entradaEscalonada(4)
                    } else {
                        ProgressView().tint(Lienzo.tintaSecundaria).frame(maxWidth: .infinity).padding(.top, Medida.xl)
                    }
                }
                .padding(.horizontal, Medida.margen)
                .padding(.top, Medida.xs)
                .padding(.bottom, Medida.xl)
                .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: objetivo)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .fondoLienzo()
            .navigationTitle("objetivo.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cerrar.") { cerrar() } }
                ToolbarItem(placement: .primaryAction) { Button("editar.") { editando = true }.disabled(objetivo == nil) }
            }
            .hoja(isPresented: $editando) { EditorObjetivo(objetivo: objetivo).environment(c) }
            .task(id: c.revision) { await cargar() }
        }
    }

    // Lo leído o, mientras llega, el de la lista ya leída: la ficha se abre con todo pintado.
    private var objetivo: Objetivo? {
        leido ?? MemoriaObjetivos.valor(MemoriaObjetivos.objetivos, uid: c.sesion?.userId)?.todos.first { $0.id == id }
    }

    private func cabecera(_ g: Objetivo) -> some View {
        TarjetaOscura {
            VStack(alignment: .leading, spacing: Medida.s) {
                HStack(alignment: .firstTextBaseline) {
                    Text(g.estado.lowercased() + ".").font(Letra.pieFuerte)
                        .foregroundStyle(g.cumplido ? Lienzo.naranja : Lienzo.sobreOscuroSuave)
                    Spacer()
                    Text((LecturaObjetivos.plazos.first { $0.0 == g.plazo }?.1 ?? g.plazo) + ".").font(Letra.pie)
                        .foregroundStyle(Lienzo.sobreOscuroSuave)
                }
                Text(g.titulo.lowercased() + ".").font(Letra.titulo).foregroundStyle(Lienzo.sobreOscuro).kerning(-0.4)
                    .accessibilityAddTraits(.isHeader)
                if let a = g.avance {
                    HStack(spacing: Medida.s) {
                        BarraFinaObjetivos(valor: a, sobreOscuro: true)
                        if let t = g.avanceTexto { Text(t).font(Letra.hora).foregroundStyle(Lienzo.naranja) }
                    }
                }
            }
        }
    }

    private func texto(_ g: Objetivo) -> some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            if !g.proposito.isEmpty {
                VStack(alignment: .leading, spacing: Medida.xxs) {
                    EtiquetaSeccion(texto: "para qué")
                    Text(g.proposito).font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if !g.notas.isEmpty {
                VStack(alignment: .leading, spacing: Medida.xxs) {
                    EtiquetaSeccion(texto: "notas")
                    Text(g.notas).font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tarjeta()
    }

    private func progreso(_ g: Objetivo) -> some View {
        VStack(alignment: .leading, spacing: Medida.s) {
            HStack(alignment: .firstTextBaseline) {
                EtiquetaSeccion(texto: "progreso")
                Text("\(LecturaObjetivos.cifra(g.actual)) de \(LecturaObjetivos.cifra(g.meta))\(g.unidad.isEmpty ? "" : " " + g.unidad).")
                    .font(Letra.numero).foregroundStyle(Lienzo.tinta)
            }
            CampoObjetivos(texto: $actual, sugerencia: "nuevo valor.", boton: "apuntar.", decimal: true) {
                let v = actual.replacingOccurrences(of: ",", with: ".")
                guard Dinero.decimal(texto: v) != nil else { return }
                enviar(.progreso(actual: v)); actual = ""
            }
        }
        .tarjeta()
    }

    private func hitos(_ g: Objetivo) -> some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            HStack(alignment: .firstTextBaseline) {
                EtiquetaSeccion(texto: "hitos")
                if !g.hitos.isEmpty {
                    Text("\(g.hitos.filter(\.hecho).count)/\(g.hitos.count)").font(Letra.hora).foregroundStyle(Lienzo.tintaSecundaria)
                }
            }
            if g.hitos.isEmpty {
                Text("los pasos que te dicen que vas bien.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    .padding(.horizontal, Medida.xxs)
            }
            VStack(spacing: 0) {
                ForEach(Array(g.hitos.enumerated()), id: \.element.id) { n, h in
                    if n > 0 { SeparadorFila(sangria: Medida.toque - Medida.s) }
                    let alternar = { enviar(.hitoHecho(texto: h.texto, hecho: !h.hecho)) }
                    HStack(spacing: Medida.xxs) {
                        CasillaMarcar(hecha: h.hecho, marcar: alternar)
                        Text(h.texto).font(Letra.cuerpo).foregroundStyle(h.hecho ? Lienzo.tintaSecundaria : Lienzo.tinta)
                            .strikethrough(h.hecho, color: Lienzo.tintaTerciaria)
                        Spacer(minLength: 0)
                    }
                    .padding(.leading, -Medida.s)
                    .contentShape(Rectangle())
                    .contextMenu { Button("borrar.", role: .destructive) { enviar(.quitarHito(texto: h.texto)) } }
                    .accessibilityElement(children: .combine)
                    .accessibilityValue(h.hecho ? "hecho" : "pendiente")
                    .accessibilityAction { alternar() }
                    .accessibilityAction(named: "borrar") { enviar(.quitarHito(texto: h.texto)) }
                }
            }
            CampoObjetivos(texto: $nuevoHito, sugerencia: "un hito.", boton: "añadir.", accion: anadirHito)
        }
        .tarjeta()
    }

    private func anadirHito() {
        let t = nuevoHito.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        enviar(.hito(texto: t)); nuevoHito = ""
    }

    private func enviar(_ cambio: CambioObjetivo) { Task { await c.guardar(.cambiarObjetivo(objetivoId: id, cambio: cambio)) } }

    private func cargar() async {
        let uid = c.sesion?.userId ?? ""
        let r = c.revision
        let gid = id
        if let m = MemoriaObjetivos.valor(MemoriaObjetivos.objetivos, uid: uid, revision: r) {
            let g = m.todos.first { $0.id == gid }
            if leido != g || leido == nil { leido = g }
            return
        }
        let doc = await c.documentoVisible()
        guard let nuevo = await ultimaGana({ doc.map { PantallaObjetivos(LecturaObjetivos.objetivos($0)) } }) else { return }
        if let nuevo { MemoriaObjetivos.objetivos = MemoriaObjetivos.Hueco(uid: uid, revision: r, valor: nuevo) }
        let g = nuevo?.todos.first { $0.id == gid }
        if leido != g || leido == nil { leido = g }
    }
}

private struct EditorObjetivo: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let objetivo: Objetivo?
    @State private var titulo: String
    @State private var plazo: String
    @State private var estado: String
    @State private var numerico: Bool
    @State private var actual: String
    @State private var meta: String
    @State private var unidad: String
    @State private var notas: String
    @State private var id: String
    @State private var confirmarBorrado = false
    @State private var descartar = false
    @State private var original: [String]?

    // B10: el borrador frente a lo que había al abrir (`original` se toma al aparecer).
    private var clave: [String] { [titulo, plazo, estado, numerico ? "1" : "", actual, meta, unidad, notas].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) } }
    private var cambiado: Bool { original.map { $0 != clave } ?? false }

    init(objetivo: Objetivo?) {
        self.objetivo = objetivo
        _titulo = State(initialValue: objetivo?.titulo ?? ""); _plazo = State(initialValue: objetivo?.plazo ?? "short")
        _estado = State(initialValue: objetivo?.estado ?? "Pendiente"); _numerico = State(initialValue: objetivo?.numerico ?? false)
        _actual = State(initialValue: objetivo.map { NSDecimalNumber(decimal: $0.actual).stringValue } ?? "")
        _meta = State(initialValue: objetivo.map { NSDecimalNumber(decimal: $0.meta).stringValue } ?? "")
        _unidad = State(initialValue: objetivo?.unidad ?? ""); _notas = State(initialValue: objetivo?.notas ?? "")
        _id = State(initialValue: objetivo?.id ?? OperacionBitacora.nuevoIdEntrada())
    }

    var body: some View {
        NavigationStack {
            FormCasa {
                TextField("qué quieres conseguir.", text: $titulo)
                Picker("plazo.", selection: $plazo) { ForEach(LecturaObjetivos.plazos, id: \.0) { p in Text(p.1 + ".").tag(p.0) } }
                Picker("estado.", selection: $estado) { ForEach(LecturaObjetivos.estados, id: \.self) { e in Text(e.lowercased() + ".").tag(e) } }
                Toggle("con una cifra.", isOn: $numerico)
                if numerico {
                    TextField("llevas.", text: $actual).keyboardType(.decimalPad)
                    TextField("meta.", text: $meta).keyboardType(.decimalPad)
                    TextField("unidad (libros, €, km).", text: $unidad)
                }
                Section("notas.") { TextEditor(text: $notas).frame(minHeight: 80) }
                if objetivo != nil { Section { Button("eliminar objetivo.", role: .destructive) { confirmarBorrado = true } } }
            }
            .navigationTitle(objetivo == nil ? "nuevo objetivo." : "objetivo.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { if cambiado { descartar = true } else { cerrar() } } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        // «1.234,5» (como lo enseña cifra) o «12.5»: con coma, el punto es de miles.
                        let num = { (t: String) in t.contains(",") ? t.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".") : t }
                        Task { if await c.guardar(.guardarObjetivo(id: id, titulo: titulo, plazo: plazo, numerico: numerico, actual: num(actual), meta: num(meta),
                                                                       unidad: unidad, estado: estado, notas: notas.trimmingCharacters(in: .whitespacesAndNewlines))) { cerrar() } }
                    }.disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .confirmationDialog("¿eliminar este objetivo?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("eliminar.", role: .destructive) { Task { if await c.guardar(.borrarEntrada(id: id)) { cerrar() } } }
                Button("cancelar.", role: .cancel) {}
            }
            .onAppear { if original == nil { original = clave } }
            .preguntarAlDescartar(cambiado, preguntar: $descartar) { cerrar() }
        }
    }
}
