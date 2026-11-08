import SwiftUI

// La hoja de «apuntar.» (openApuntar en js/apuntar.js): una línea que entiende varias cosas, la vista previa de cada
// una con su tipo, «apuntar.» y los accesos. Abre al 56 % y se puede ampliar. El botón central, Siri, los enlaces y
// «Abrir en» llegan aquí con el texto puesto. Lo escrito queda como borrador en este iPhone (3 días, por cuenta) hasta
// que se apunta o se descarta: cerrar la hoja no lo pierde.
struct ApuntarInicial: Identifiable, Equatable {
    let id = UUID().uuidString
    var texto = ""
    var fechaBase: LocalDay?
    var intencion: IntencionEntrante?
}

enum BorradorApuntar {
    private static func clave(_ uid: String) -> String { "bitacora.apuntar.borrador.\(uid)" }
    static func leer(_ uid: String) -> String {
        guard let d = UserDefaults.standard.dictionary(forKey: clave(uid)), let t = d["texto"] as? String,
              let cuando = d["actualizado"] as? Double, Date().timeIntervalSince1970 - cuando < 3 * 86400 else {
            UserDefaults.standard.removeObject(forKey: clave(uid))
            return ""
        }
        return t
    }
    static func guardar(_ texto: String, _ uid: String) {
        if texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { UserDefaults.standard.removeObject(forKey: clave(uid)); return }
        UserDefaults.standard.set(["texto": texto, "actualizado": Date().timeIntervalSince1970], forKey: clave(uid))
    }
    static func quitar(_ uid: String) { UserDefaults.standard.removeObject(forKey: clave(uid)) }
}

struct ApuntarView: View {
    @Environment(AppCoordinator.self) private var c
    let inicial: ApuntarInicial
    @State private var texto = ""
    @State private var deBorrador = false
    @State private var items: [ApunteInterpretado] = []
    @State private var elegidos: [Int: String] = [:]
    @State private var contexto = ContextoApuntar()
    @State private var guardando = false
    @State private var error: String?
    @State private var detente: PresentationDetent = .fraction(0.56)
    @State private var ruta: [String] = []
    @State private var cargado = false
    @State private var hechos = 0
    @State private var hayRecientes = false
    @FocusState private var escribiendo: Bool
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    private var uid: String { c.sesion?.userId ?? "" }
    private var hoy: LocalDay { CalendarioBitacora.madrid.dia(de: Date()) }

    var body: some View {
        NavigationStack(path: $ruta) {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: Espacio.m) {
                        cabecera
                        campo
                        if deBorrador {
                            HStack(spacing: 6) {
                                Text("lo que dejaste a medias.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                                Button("descartar.") { descartar() }.font(Tipo.poppins(13, .semibold, estilo: .footnote)).foregroundStyle(Paleta.texto)
                            }
                        }
                        vistaPrevia
                        if let error { Text(error).font(Tipo.pie).foregroundStyle(Paleta.error) }
                        accesos
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, Espacio.m)
                    .padding(.bottom, Espacio.l)
                }
                .scrollDismissesKeyboard(.interactively)
                Button { Task { await guardar() } } label: { Text(guardando ? "apuntando." : "apuntar.") }
                    .buttonStyle(BotonPrincipal())
                    .disabled(guardando || texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(Paleta.fondo)
            }
            .background(Paleta.fondo)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { _ in RecientesApuntarView(cambiar: { t in ruta = []; texto = t }) }
        }
        .presentationDetents([.fraction(0.56), .large], selection: $detente)
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(.scrolls)
        .sensoryFeedback(.success, trigger: hechos)
        .task {
            if !inicial.texto.isEmpty { texto = inicial.texto } else {
                let b = BorradorApuntar.leer(uid)
                if !b.isEmpty { texto = b; deBorrador = true }
            }
            cargado = true
            escribiendo = true
            if let doc = await c.documentoVisible() {
                contexto = ContextoApuntar.desde(doc, uid: uid)
                hayRecientes = !((((try? doc.valor(de: "apuntesRecientes")) ?? nil)?.lista ?? []).isEmpty)
            }
        }
        .task(id: "\(texto)|\(contexto.ocultos.count)|\(contexto.asignaturas.count)") {
            guard cargado else { return }
            elegidos = [:]
            BorradorApuntar.guardar(texto, uid)
            let t = texto
            guard !t.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { items = []; return }
            let base = inicial.fechaBase.flatMap { $0 == hoy ? nil : $0.iso }
            let r = (try? await InterpreteApuntar.compartido.interpretar(t, fechaBase: base, contexto: contexto)) ?? []
            guard !Task.isCancelled else { return }
            items = r
            if r.count > 3, detente != .large { detente = .large }
        }
    }

    private var cabecera: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("apuntar\(inicial.fechaBase.map { $0 == hoy ? "" : " para \($0.iso)" } ?? "").")
                .font(Tipo.poppins(20, .bold, estilo: .title3)).foregroundStyle(Paleta.texto)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            if hayRecientes {
                NavigationLink(value: "recientes") { Text("lo último.").font(Tipo.poppins(13, .semibold, estilo: .footnote)) }
                    .foregroundStyle(Paleta.textoSecundario)
            }
        }
    }

    private var campo: some View {
        TextField("dentista mañana a las 5 y comprar pan...", text: $texto, axis: .vertical)
            .lineLimit(2...4)
            .font(Tipo.cuerpo)
            .foregroundStyle(Paleta.texto)
            .focused($escribiendo)
            .submitLabel(.done)
            .padding(14)
            .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityLabel("qué quieres apuntar")
    }

    @ViewBuilder private var vistaPrevia: some View {
        if items.isEmpty {
            Text("escribe como hablas: «cena con marta el viernes a las 9», «serie los hombres de paco», «gasté 12 en gasolina».")
                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                if items.count > 1 {
                    Text("\(items.count) cosas.").font(Tipo.poppins(13, .bold, estilo: .footnote)).foregroundStyle(Paleta.textoSecundario)
                        .padding(.bottom, 6)
                }
                ForEach(Array(items.enumerated()), id: \.offset) { k, it in
                    if k > 0 { Rectangle().fill(Paleta.borde).frame(height: 1) }
                    fila(k, it)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(items.count == 1 ? "1 cosa interpretada" : "\(items.count) cosas interpretadas")
        }
    }

    private func fila(_ k: Int, _ it: ApunteInterpretado) -> some View {
        let tipo = elegidos[k] ?? it.tipo
        let d = it.describir[tipo]
        let nota = !(d?.falta ?? "").isEmpty ? (d?.falta ?? "") + "." : (elegidos[k] == nil && it.nada ? "sin fecha ni hora: irá como tarea para hoy." : "")
        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(d?.texto ?? it.texto).font(Tipo.cuerpo).foregroundStyle(Paleta.texto).fixedSize(horizontal: false, vertical: true)
                if !nota.isEmpty { Text(nota).font(Tipo.pie).foregroundStyle(!(d?.falta ?? "").isEmpty ? Paleta.error : Paleta.textoSecundario) }
            }
            Spacer(minLength: 0)
            Menu {
                ForEach(TipoApunte.disponibles(contexto), id: \.0) { v, nombre in
                    Button { elegidos[k] = v } label: { if v == tipo { Label(nombre, systemImage: "checkmark") } else { Text(nombre) } }
                }
            } label: {
                Text((TipoApunte.nombre[tipo] ?? tipo) + ".")
                    .font(Tipo.poppins(13, .semibold, estilo: .footnote))
                    .foregroundStyle(Paleta.texto)
                    .padding(.horizontal, 10).frame(minHeight: 32)
                    .background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
            }
            .accessibilityLabel("tipo: \(TipoApunte.nombre[tipo] ?? tipo). cambiar")
        }
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }

    private var accesos: some View {
        let lista: [(String, String, () -> Void)] = [
            ("tarea.", "tarea", { c.modal = .tarea(EditorTarea(id: OperacionBitacora.nuevoIdTarea(), nueva: true, dia: inicial.fechaBase ?? CalendarioBitacora.madrid.diaLogico(Date()))) }),
            ("evento.", "evento", { c.modal = .evento(EditorEvento(id: OperacionBitacora.nuevoIdEntrada(), nuevo: true, fecha: inicial.fechaBase ?? hoy)) }),
            ("gasto.", "gasto", { c.modal = .movimiento(OperacionBitacora.nuevoIdMovimiento(), tipo: "expense") }),
            ("nota.", "nota", { if !texto.lowercased().hasPrefix("nota:") { texto = "nota: " + texto } ; escribiendo = true }),
            ("compra.", "compra", { c.modal = nil; c.web = Apartados.webURL("compra") }),
            ("rutina.", "rutina", { c.modal = nil; c.web = Apartados.webURL("habits") }),
            ("ocio.", "ocio", { c.modal = nil; c.web = Apartados.webURL("culture") }),
            ("viaje.", "viaje", { c.modal = nil; c.web = Apartados.webURL("travels") }),
        ].filter { $0.1 != "compra" || !contexto.ocultos.contains("compra") }
        return VStack(alignment: .leading, spacing: Espacio.s) {
            Text("o elige qué quieres apuntar").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                ForEach(lista, id: \.1) { t, icono, accion in
                    Button(action: accion) {
                        VStack(spacing: 6) {
                            IconoApunte(tipo: icono).frame(width: 22, height: 22)
                            Text(t).font(Tipo.poppins(12, .semibold, estilo: .caption))
                        }
                        .foregroundStyle(Paleta.texto)
                        .frame(maxWidth: .infinity, minHeight: 64)
                        .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func descartar() {
        BorradorApuntar.quitar(uid)
        texto = ""
        deBorrador = false
        elegidos = [:]
    }

    // guardarApunte: todo lo que se puede crear va en un solo lote; lo que no, se dice y se queda escrito.
    private func guardar() async {
        guard !guardando, let doc = await c.documentoVisible() else { return }
        guardando = true
        defer { guardando = false }
        let actuales = items.isEmpty
            ? ((try? await InterpreteApuntar.compartido.interpretar(texto, fechaBase: inicial.fechaBase.flatMap { $0 == hoy ? nil : $0.iso }, contexto: contexto)) ?? [])
            : items
        var ops: [OperacionBitacora] = []
        var avisos: [String] = [], fallos: [String] = [], quedan: [String] = []
        let ahora = Date()
        for (k, it) in actuales.enumerated() {
            let tipo = elegidos[k] ?? it.tipo
            switch CrearApunte.crear(it, tipo: tipo, doc: doc, ahora: ahora.addingTimeInterval(Double(k) / 1000)) {
            case .success(let a): ops += a.ops; avisos.append(a.aviso)
            case .failure(let e): fallos.append("«\(it.texto)»: \(e.motivo)"); quedan.append(it.texto)
            }
        }
        guard !ops.isEmpty else { error = fallos.first ?? "no he podido apuntarlo."; return }
        do {
            try await c.encolar(ops)
        } catch {
            self.error = "no se pudo guardar en este iPhone. lo escrito sigue aquí."
            return
        }
        hechos += 1
        if quedan.isEmpty {
            BorradorApuntar.quitar(uid)
            c.avisar(avisos.count == 1 ? avisos[0] : "\(avisos.count) cosas apuntadas.")
            if let i = inicial.intencion { c.resolverIntencion(i) } else { c.modal = nil }
        } else {
            texto = quedan.joined(separator: "\n")
            error = "apuntado: \(avisos.count). sin apuntar: " + fallos.joined(separator: "; ")
        }
    }
}

// lo que has apuntado. (openApuntesRecientes): deshacer quita solo lo que creó ese apunte; cambiar lo deshace y lo
// devuelve a la hoja para elegir otro tipo.
struct RecientesApuntarView: View {
    @Environment(AppCoordinator.self) private var c
    let cambiar: (String) -> Void
    @State private var lista: [JSONValue] = []
    @State private var aviso: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                Text("lo que has apuntado.").font(Tipo.poppins(20, .bold, estilo: .title3)).foregroundStyle(Paleta.texto).padding(.bottom, 4)
                Text("en cualquier dispositivo. deshacer. lo borra de donde se guardó; cambiar. lo borra y te lo deja escrito.")
                    .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.bottom, Espacio.m)
                if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.texto).padding(.bottom, Espacio.s) }
                if lista.isEmpty { Text("nada todavía.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario) }
                ForEach(Array(lista.enumerated()), id: \.offset) { n, a in
                    if n > 0 { Rectangle().fill(Paleta.borde).frame(height: 1) }
                    fila(a)
                }
            }
            .padding(20)
        }
        .background(Paleta.fondo)
        .task(id: c.informe.revision) { await leer() }
    }

    private func leer() async {
        lista = ((try? await c.documentoVisible()?.valor(de: "apuntesRecientes")) ?? nil)?.lista ?? []
    }

    private func fila(_ a: JSONValue) -> some View {
        let id = a["id"]?.comoId ?? ""
        let deshecho = a["deshecho"]?.booleano == true
        let deLaWeb = a["deshacer"]?["tipo"]?.texto == "conector"
        let tipo = TipoApunte.nombre[a["tipo"]?.texto ?? ""] ?? (a["tipo"]?.texto ?? "")
        return VStack(alignment: .leading, spacing: 6) {
            Text(a["texto"]?.texto ?? "").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.texto)
            Text("\(tipo), \(cuando(a["cuando"]?.texto))\(deshecho ? ", deshecho" : "")").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            if !deshecho {
                if deLaWeb {
                    Text("se deshace desde la web.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                } else {
                    HStack(spacing: Espacio.m) {
                        Button("cambiar.") { Task { await deshacer(id, cambiando: a["texto"]?.texto) } }
                        Button("deshacer.") { Task { await deshacer(id, cambiando: nil) } }
                    }
                    .font(Tipo.poppins(13, .semibold, estilo: .footnote)).foregroundStyle(Paleta.texto)
                }
            }
        }
        .padding(.vertical, 12)
    }

    private func cuando(_ iso: String?) -> String {
        guard let iso, let d = ISO8601DateFormatter.conMs.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.timeZone = CalendarioBitacora.madrid.zona
        f.dateFormat = CalendarioBitacora.madrid.dia(de: d) == CalendarioBitacora.madrid.dia(de: Date()) ? "HH:mm" : "d MMM"
        return f.string(from: d)
    }

    private func deshacer(_ id: String, cambiando: String?) async {
        guard let doc = await c.documentoVisible() else { return }
        let (_, parche) = AplicarOperaciones.sobre(doc, [.deshacerApunte(id: id)])
        do { try await c.encolar(.deshacerApunte(id: id)) } catch { aviso = "no se pudo guardar en este iPhone."; return }
        let estaba = parche.keys.contains { $0 != "apuntesRecientes" }
        if let t = cambiando { cambiar(t); return }
        aviso = estaba ? "deshecho." : "ya no estaba: lo habrías borrado o cambiado antes."
        await leer()
    }
}
