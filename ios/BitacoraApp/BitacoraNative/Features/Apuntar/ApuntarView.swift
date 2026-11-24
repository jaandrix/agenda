import SwiftUI

// «apuntar.» (openApuntar en js/apuntar.js), desde la 2.0 en el modal flotante oscuro: una línea que entiende varias cosas, la vista previa de cada
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
    @State private var leyendo = false
    @State private var error: String?
    @State private var verRecientes = false
    @State private var cargado = false
    @State private var hechos = 0
    @State private var hayRecientes = false
    @FocusState private var escribiendo: Bool
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    private var uid: String { c.sesion?.userId ?? "" }
    private var hoy: LocalDay { CalendarioBitacora.madrid.dia(de: Date()) }
    private var vacio: Bool { texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    // 2.0: el modal flotante oscuro (foto 1). Banda naranja con «apuntar.» y el estado vivo; debajo, el campo, lo que se
    // va a apuntar y la acción. Sube con el teclado y se cierra arrastrando la banda hacia abajo.
    var body: some View {
        ModalFlotante(titulo: tituloBanda, cerrar: { c.modal = nil }) {
            estadoBanda
        } contenido: {
            VStack(alignment: .leading, spacing: Medida.s) {
                campo
                if deBorrador && !vacio {
                    HStack(spacing: 6) {
                        Text("lo que dejaste a medias.").font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave)
                        Button("descartar.") { withAnimation(Muelle.rapido) { descartar() } }
                            .font(Letra.pieFuerte).foregroundStyle(Lienzo.sobreOscuro)
                            .buttonStyle(.pulsable(0.92))
                    }
                    .transition(.opacity)
                }
                vistaPrevia
                if let error {
                    Text(error).font(Letra.pie).foregroundStyle(Lienzo.naranja)
                        .fixedSize(horizontal: false, vertical: true)
                        .transition(.opacity)
                }
                acciones
            }
            .padding(.horizontal, Medida.m)
            .padding(.top, Medida.s)
            .padding(.bottom, Medida.m)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: items.count)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: error)
        }
        .sensoryFeedback(.success, trigger: hechos)
        .hoja(isPresented: $verRecientes) {
            NavigationStack {
                RecientesApuntarView(cambiar: { t in verRecientes = false; texto = t; escribiendo = true })
            }
            .presentationDetents([.medium, .large])
        }
        .task {
            if !inicial.texto.isEmpty { texto = inicial.texto } else {
                let b = BorradorApuntar.leer(uid)
                if !b.isEmpty { texto = b; deBorrador = true }
            }
            cargado = true
            await Medidas.terminarAlPintar("apuntar: abrir la hoja")
            // El teclado cuando el modal ya ha subido: así no compiten la entrada y el teclado en el mismo fotograma.
            try? await Task.sleep(for: .milliseconds(140))
            escribiendo = true
            if let doc = await c.documentoVisible() {
                contexto = ContextoApuntar.desde(doc, uid: uid)
                hayRecientes = !((((try? doc.valor(de: "apuntesRecientes")) ?? nil)?.lista ?? []).isEmpty)
            }
        }
        .task(id: "\(texto)|\(contexto.ocultos.count)|\(contexto.asignaturas.count)") {
            guard cargado else { return }
            elegidos = [:]
            // Espera breve: al escribir rápido no se interpreta ni se guarda el borrador en cada letra.
            try? await Task.sleep(for: .milliseconds(150))
            guard !Task.isCancelled else { return }
            BorradorApuntar.guardar(texto, uid)
            let t = texto
            guard !t.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { items = []; return }
            let base = inicial.fechaBase.flatMap { $0 == hoy ? nil : $0.iso }
            let t0 = Medidas.ahora
            leyendo = true
            defer { leyendo = false }
            let r = (try? await InterpreteApuntar.compartido.interpretar(t, fechaBase: base, contexto: contexto)) ?? []
            guard !Task.isCancelled else { return }
            await Medidas.anotar("apuntar: interpretar", desde: t0)
            items = r
        }
    }

    private var tituloBanda: String {
        guard let d = inicial.fechaBase, d != hoy else { return "apuntar." }
        return "apuntar para el \(d.day)/\(d.month)."
    }

    // A la derecha de la banda, el estado vivo: leyendo lo escrito, cuántas cosas saldrán o el borrador.
    @ViewBuilder private var estadoBanda: some View {
        HStack(spacing: 6) {
            if guardando {
                PuntoVivo()
                Text("apuntando")
            } else if leyendo {
                PuntoVivo()
                Text("leyendo")
            } else if !items.isEmpty {
                PuntoVivo(activo: false)
                Text(items.count == 1 ? "1 cosa" : "\(items.count) cosas").contentTransition(.numericText())
            } else if deBorrador {
                Text("borrador")
            }
        }
        .animation(Muelle.rapido, value: items.count)
    }

    private var campo: some View {
        TextField("", text: $texto, prompt: Text("¿qué quieres apuntar?").foregroundColor(Lienzo.sobreOscuroTenue), axis: .vertical)
            .lineLimit(1...5)
            .font(Tipo.poppins(15, .regular, estilo: .body))
            .foregroundStyle(Lienzo.sobreOscuro)
            .tint(Lienzo.naranja)
            .focused($escribiendo)
            .submitLabel(.done)
            .padding(.vertical, Medida.s)
            .accessibilityLabel("qué quieres apuntar")
    }

    // BARRA_PISTA (js/barra.js): con el campo vacío, ejemplos que se prueban tocándolos.
    private static let pistas = [("cena con marta el viernes a las 21", "un evento"), ("gasté 12 en gasolina", "un gasto"),
                                 ("dentista mañana a las 5 y comprar pan", "dos cosas"), ("nota: idea para el viaje", "una nota")]

    @ViewBuilder private var vistaPrevia: some View {
        if items.isEmpty {
            if vacio {
                ScrollView(.horizontal) {
                    HStack(spacing: Medida.xs) {
                        ForEach(Self.pistas, id: \.0) { t, q in
                            Button {
                                texto = t
                                escribiendo = true
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(q + ".").font(Letra.etiqueta).foregroundStyle(Lienzo.sobreOscuroSuave)
                                    Text(t).font(Letra.pie).foregroundStyle(Lienzo.sobreOscuro).lineLimit(1)
                                }
                                .padding(.horizontal, 14).padding(.vertical, 9)
                                .background(Lienzo.oscuroElevado, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
                            }
                            .buttonStyle(.pulsable(0.95))
                            .accessibilityLabel("ejemplo, \(q): \(t)")
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .transition(.opacity)
            }
        } else {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(items.enumerated()), id: \.offset) { k, it in
                    fila(k, it).entradaEscalonada(k)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(items.count == 1 ? "1 cosa interpretada" : "\(items.count) cosas interpretadas")
            .transition(.opacity.combined(with: .offset(y: 6)))
        }
    }

    private func fila(_ k: Int, _ it: ApunteInterpretado) -> some View {
        let tipo = elegidos[k] ?? it.tipo
        let d = it.describir[tipo]
        let falta = !(d?.falta ?? "").isEmpty
        let nota = falta ? (d?.falta ?? "") + "." : (elegidos[k] == nil && it.nada ? "sin fecha ni hora: irá como tarea para hoy." : "")
        return HStack(alignment: .center, spacing: Medida.s) {
            IconoCuadrado(id: Self.iconoCatalogo(tipo), tono: falta ? .naranja : .translucido, tamano: 32)
            VStack(alignment: .leading, spacing: 1) {
                Text(d?.texto ?? it.texto).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.sobreOscuro)
                    .fixedSize(horizontal: false, vertical: true)
                Text(((TipoApunte.nombre[tipo] ?? tipo) + ".") + (nota.isEmpty ? "" : " " + nota))
                    .font(Letra.pie).foregroundStyle(falta ? Lienzo.naranja : Lienzo.sobreOscuroSuave)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Menu {
                Section("es un…") {
                    ForEach(TipoApunte.disponibles(contexto), id: \.0) { v, nombre in
                        Button { withAnimation(Muelle.rapido) { elegidos[k] = v } } label: {
                            if v == tipo { Label(nombre, systemImage: "checkmark") } else { Text(nombre) }
                        }
                    }
                }
                if items.count > 1 {
                    Button("quitar de lo que se apunta.", role: .destructive) { quitarTrozo(it.texto) }
                }
            } label: {
                Text("cambiar").font(Letra.pieFuerte).foregroundStyle(Lienzo.sobreOscuro)
                    .padding(.horizontal, 12).frame(height: 30)
                    .background(Color.white.opacity(0.1), in: Capsule())
                    .frame(minHeight: Medida.toque)
            }
            .accessibilityLabel("cambiar el tipo: \(TipoApunte.nombre[tipo] ?? tipo)")
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(Lienzo.oscuroElevado, in: RoundedRectangle(cornerRadius: Medida.radioFila, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    // Abajo: «lo último.» a la izquierda y la acción naranja a la derecha.
    private var acciones: some View {
        HStack(spacing: Medida.xs) {
            if hayRecientes {
                Button { verRecientes = true } label: {
                    Text("lo último").font(Letra.pieFuerte).foregroundStyle(Lienzo.sobreOscuroSuave)
                        .padding(.horizontal, 14).frame(height: 36)
                        .background(Color.white.opacity(0.08), in: Capsule())
                }
                .buttonStyle(.pulsable(0.93))
            }
            Spacer()
            Button { Task { await guardar() } } label: {
                HStack(spacing: 6) {
                    Text(guardando ? "apuntando" : "apuntar")
                    Image(systemName: "arrow.up").font(.system(size: 13, weight: .heavy))
                }
                .font(Letra.boton)
                .foregroundStyle(Lienzo.sobreNaranja)
                .padding(.horizontal, 18).frame(height: 40)
                .background(Lienzo.naranja, in: Capsule())
                .shadow(color: Lienzo.naranjaBrillo, radius: vacio ? 0 : 10, x: 0, y: 4)
            }
            .buttonStyle(.pulsable(0.92))
            .disabled(guardando || vacio)
            .animation(Muelle.rapido, value: vacio)
        }
        .padding(.top, 2)
    }

    // El tipo de apunte → el icono del catálogo común (mismos dibujos que el menú).
    static func iconoCatalogo(_ tipo: String) -> String {
        switch tipo {
        case "evento", "cumple": return "calendario"
        case "examen", "clase": return "estudios"
        case "gasto", "ingreso": return "finanzas"
        case "compra": return "despensa"
        case "nota": return "notas"
        case "viaje": return "viajes"
        case "recurrente": return "rutinas"
        default: return "plan"
        }
    }

    private func quitarTrozo(_ trozo: String) {
        if let r = texto.range(of: trozo) {
            texto = texto.replacingCharacters(in: r, with: "").trimmingCharacters(in: CharacterSet(charactersIn: " ,;.").union(.newlines))
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
// «lo que has apuntado.» 2.0 (24-11): las cosas en una tarjeta blanca de filas, cada una con el icono de su tipo;
// «cambiar.» y «deshacer.» en pequeño a la derecha. Deshacer sigue siendo .deshacerApunte.
struct RecientesApuntarView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    let cambiar: (String) -> Void
    @State private var lista: [JSONValue] = []
    @State private var aviso: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "lo que has apuntado.",
                               subtitulo: "en cualquier dispositivo. deshacer. lo borra de donde se guardó; cambiar. lo borra y te lo deja escrito.")
                    .padding(.bottom, Medida.xs)
                if let aviso {
                    HStack(spacing: Medida.xs) {
                        Puntito(color: Lienzo.naranja, tamano: 6)
                        Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.tinta)
                    }
                    .padding(.horizontal, Medida.xxs)
                    .transition(.opacity.combined(with: .offset(y: -4)))
                }
                if lista.isEmpty {
                    EstadoVacio(texto: "nada todavía.", icono: "apuntar").tarjeta()
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(lista.enumerated()), id: \.offset) { n, a in
                            if n > 0 { SeparadorFila(sangria: Medida.rellenoTarjeta + Medida.icono + Medida.s) }
                            fila(a)
                        }
                    }
                    .padding(.vertical, Medida.xxs)
                    .tarjeta(relleno: 0)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.m)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: aviso)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .task(id: c.revision) { await leer() }
    }

    private func leer() async {
        lista = ((try? await c.documentoVisible()?.valor(de: "apuntesRecientes")) ?? nil)?.lista ?? []
    }

    private func fila(_ a: JSONValue) -> some View {
        let id = a["id"]?.comoId ?? ""
        let deshecho = a["deshecho"]?.booleano == true
        let deLaWeb = a["deshacer"]?["tipo"]?.texto == "conector"
        let tipoClave = a["tipo"]?.texto ?? ""
        let tipo = TipoApunte.nombre[tipoClave] ?? tipoClave
        return HStack(alignment: .top, spacing: Medida.s) {
            IconoCuadrado(id: ApuntarView.iconoCatalogo(tipoClave), tono: .claro)
                .opacity(deshecho ? 0.5 : 1)
            VStack(alignment: .leading, spacing: 3) {
                Text(a["texto"]?.texto ?? "").font(Letra.cuerpoFuerte)
                    .foregroundStyle(deshecho ? Lienzo.tintaTerciaria : Lienzo.tinta)
                    .strikethrough(deshecho)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(tipo), \(cuando(a["cuando"]?.texto))\(deshecho ? ", deshecho" : "")").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                if !deshecho {
                    if deLaWeb {
                        Text("se deshace desde la web.").font(Letra.pie).foregroundStyle(Lienzo.tintaTerciaria)
                    } else {
                        HStack(spacing: Medida.l) {
                            Button("cambiar.") { Task { await deshacer(id, cambiando: a["texto"]?.texto) } }
                            Button("deshacer.") { Haptica.ligera(); Task { await deshacer(id, cambiando: nil) } }
                        }
                        .font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta)
                        .buttonStyle(.pulsable(0.92))
                        .frame(minHeight: Medida.toque)
                        .contentShape(Rectangle())
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Medida.rellenoTarjeta)
        .padding(.vertical, Medida.s)
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

// APUNTAR_ICONO_DE (js/apuntar.js): el dibujo de cada tipo en la vista previa.
extension TipoApunte {
    static func icono(_ tipo: String) -> String {
        switch tipo {
        case "evento", "cumple", "examen", "clase": return "evento"
        case "gasto": return "gasto"
        case "compra": return "compra"
        case "nota": return "nota"
        case "viaje": return "viaje"
        case "recurrente": return "rutina"
        default: return "tarea"
        }
    }
}
