import SwiftUI

// «listas.» (js/listas.js): cajas con su título y tareas en árbol de hasta cuatro niveles. En la web se escribe en línea con
// el teclado (Enter, Tab, Mayús+Tab); en el iPhone, lo que en la PWA hace la barra de herramientas de la fila va en su
// menú «···» (y al mantener pulsado), y se añade siempre desde el campo de abajo de cada caja, que dice dónde entra
// («dentro de…», «después de…»). Así el campo no cambia de sitio al guardar y el teclado no se cierra entre tarea y tarea.
// Cada cambio es una operación de `ListasOp` sobre `listasPanorama`: nunca se reescribe una caja o una tarea no tocada.
struct DeshacerListas: Equatable {
    let id = UUID()
    let texto: String
    let ops: [OperacionBitacora]
}

struct ListasSeccion: View {
    @Environment(AppCoordinator.self) private var c
    var cabecera = true
    @Binding var deshacer: DeshacerListas?
    @State private var vista: VistaListas?
    @State private var enfocar: String?
    @State private var cajaABorrar: CajaLista?

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
            HStack(alignment: .center, spacing: Medida.xs) {
                if cabecera { Text("listas.").font(Letra.seccion).foregroundStyle(Lienzo.tinta).accessibilityAddTraits(.isHeader) }
                if let v = vista, v.pendientes > 0 {
                    Chip(texto: "\(v.pendientes) por hacer").contentTransition(.numericText())
                }
                Spacer()
                Button("+ nueva lista.", action: nuevaCaja).buttonStyle(.capsula(.blanco))
            }
            .padding(.horizontal, Medida.xxs)
            if let v = vista {
                if v.cajas.isEmpty {
                    TarjetaInvitacion(frase: "cajas de tareas con subtareas, para organizarte.", destacado: "se ven igual en el ordenador.",
                                      boton: "nueva lista.", accion: nuevaCaja)
                        .entradaEscalonada(0)
                }
                ForEach(Array(v.cajas.enumerated()), id: \.element.id) { i, caja in
                    CajaListaView(caja: caja, posicion: i, cuantas: v.cajas.count,
                                  otras: v.cajas.filter { $0.id != caja.id }, enHoy: v.enHoy, hoy: v.hoy, enfocar: $enfocar,
                                  ofrecer: { deshacer = DeshacerListas(texto: $0, ops: $1) },
                                  pedirBorrar: { cajaABorrar = $0 })
                        .entradaEscalonada(i)
                }
            } else {
                ProgressView().tint(Lienzo.tintaSecundaria).frame(maxWidth: .infinity).padding(.vertical, Medida.l)
            }
        }
        .animation(Muelle.suave, value: vista?.cajas.map(\.id))
        .tareaVisible(id: c.revision) {
            let doc = await c.documentoVisible()
            guard let nueva = await ultimaGana({ doc.map { VistaListas.desde($0) } }) else { return }
            vista = nueva
        }
        .confirmarBorrado($cajaABorrar, titulo: Self.preguntaBorrar, boton: "eliminar.") { caja in Task { await borrarCaja(caja) } }
    }

    static func preguntaBorrar(_ caja: CajaLista) -> String {
        let nombre = caja.titulo.isEmpty ? "sin nombre" : caja.titulo
        let cuantas = caja.total == 1 ? "su tarea" : "sus \(caja.total) tareas"
        return "¿eliminar «\(nombre)» con \(cuantas)?"
    }

    private func nuevaCaja() {
        let id = ListasOp.nuevoId("lst")
        enfocar = id
        Task { await c.guardar(ListasOp.op(["accion": .string("crear_lista"), "id": .string(id), "titulo": .string("")])) }
    }

    func borrarCaja(_ caja: CajaLista) async {
        let doc = await c.documentoVisible()
        let valor: JSONValue? = (try? doc?.valor(de: "listasPanorama")) ?? nil
        let listas = valor?.lista ?? []
        guard let i = listas.firstIndex(where: { $0["id"]?.comoId == caja.id }) else { return }
        let ok = await c.guardar(ListasOp.op(["accion": .string("borrar_lista"), "lista": .string(caja.id)]))
        if ok {
            deshacer = DeshacerListas(texto: "lista «\(caja.titulo.isEmpty ? "sin nombre" : caja.titulo)» eliminada.",
                                      ops: [ListasOp.op(["accion": .string("restaurar_lista"), "caja": listas[i], "indice": .number(String(i))])])
        }
    }
}

// La barra de deshacer, abajo de la pantalla y siete segundos, como .lst-deshacer.
struct BarraDeshacerListas: View {
    @Environment(AppCoordinator.self) private var c
    @Binding var deshacer: DeshacerListas?

    var body: some View {
        if let d = deshacer {
            HStack(spacing: Medida.s) {
                Text(d.texto).font(Letra.pie).foregroundStyle(Lienzo.sobreOscuro).lineLimit(2)
                Spacer()
                Button("deshacer.") {
                    Haptica.media()
                    deshacer = nil
                    Task { await c.guardar(d.ops) }
                }
                .font(Letra.boton).estiloEnlace(sobreOscuro: true).buttonStyle(.pulsable(0.94)).frame(minHeight: Medida.toque)
            }
            .padding(.horizontal, Medida.m)
            .background(Lienzo.oscuro, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
            .sombra(.oscura)
            .padding(.horizontal, Medida.margen).padding(.bottom, Medida.s)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .accessibilityElement(children: .contain)
            .task(id: d.id) {
                try? await Task.sleep(nanoseconds: 7_000_000_000)
                if deshacer?.id == d.id { deshacer = nil }
            }
        }
    }
}

// Página propia, desde el menú.
struct ListasView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var deshacer: DeshacerListas?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "listas.", subtitulo: "cajas de tareas con subtareas.")
                ListasSeccion(cabecera: false, deshacer: $deshacer)
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
        .safeAreaInset(edge: .bottom) { BarraDeshacerListas(deshacer: $deshacer) }
        .animation(Muelle.modal, value: deshacer?.id)
        .refreshable { await c.sincronizar() }
    }
}

struct CajaListaView: View {
    @Environment(AppCoordinator.self) private var c
    let caja: CajaLista
    let posicion: Int
    let cuantas: Int
    let otras: [CajaLista]
    let enHoy: [String: VistaListas.EnHoy]
    let hoy: String
    @Binding var enfocar: String?
    let ofrecer: (String, [OperacionBitacora]) -> Void
    let pedirBorrar: (CajaLista) -> Void

    // Dónde entra lo que se escribe abajo: nil, al final de la caja.
    struct Destino: Equatable { var padre: String?; var indice: Int?; var nivel: Int; var etiqueta: String }

    enum Campo: Hashable { case titulo, fila(String), anadir }
    @FocusState private var foco: Campo?
    @State private var titulo = ""
    @State private var editando: String?
    @State private var borrador = ""
    @State private var texto = ""
    @State private var destino: Destino?
    @State private var preguntar: FilaLista?

    private static let sangria: CGFloat = 20

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            cabeceraCaja
            ForEach(caja.filas) { f in fila(f) }
            if caja.filas.isEmpty && !(caja.ocultarHechas && caja.hechas > 0) {
                Text("vacía. escribe abajo la primera tarea.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).padding(.vertical, Medida.s)
            }
            if caja.ocultarHechas && caja.hechas > 0 {
                Button { guardar(op("lista", ["ocultarHechas": .bool(false)])) } label: {
                    Text((caja.hechas == 1 ? "1 hecha oculta" : "\(caja.hechas) hechas ocultas") + ". ver.")
                        .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).frame(minHeight: Medida.toque)
                }
                .buttonStyle(.pulsable(0.96))
            }
            campoAnadir.padding(.top, Medida.xs)
        }
        .padding(.horizontal, Medida.s).padding(.top, Medida.xxs).padding(.bottom, Medida.s)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Lienzo.tarjeta, in: RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous).strokeBorder(Lienzo.filo))
        .sombra(.suave)
        .animation(Muelle.suave, value: caja.filas.map(\.id))
        .onAppear {
            titulo = caja.titulo
            if enfocar == caja.id { enfocar = nil; foco = .titulo }
        }
        .onChange(of: caja.titulo) { _, nuevo in if foco != .titulo { titulo = nuevo } }
        .onChange(of: foco) { antes, ahora in
            if antes == .titulo, ahora != .titulo { renombrar() }
            if case let .fila(id)? = antes, ahora != antes, editando == id, let f = caja.filas.first(where: { $0.id == id }) { confirmar(f, siguiente: false) }
        }
        .confirmationDialog(tituloPregunta, isPresented: Binding(get: { preguntar != nil }, set: { if !$0 { preguntar = nil } }),
                            titleVisibility: .visible, presenting: preguntar) { f in
            Button(Self.marcarTodas(f)) { marcar(f, true, conSubtareas: true) }
            Button("marcar solo esta.") { marcar(f, true, conSubtareas: false) }
            Button("cancelar.", role: .cancel) {}
        }
    }

    private var tituloPregunta: String {
        guard let f = preguntar else { return "" }
        let n = f.pendientesDebajo == 1 ? "una subtarea sin hacer" : "\(f.pendientesDebajo) subtareas sin hacer"
        return "«\(f.texto)» tiene \(n)."
    }

    static func marcarTodas(_ f: FilaLista) -> String {
        f.pendientesDebajo == 1 ? "marcar también su subtarea." : "marcar también sus \(f.pendientesDebajo) subtareas."
    }

    // MARK: piezas

    private var cabeceraCaja: some View {
        HStack(alignment: .center, spacing: Medida.xs) {
            IconoCuadrado(id: "listas", tono: caja.total > 0 && caja.hechas == caja.total ? .oscuro : .claro, tamano: Medida.iconoPequeno)
            TextField("sin nombre.", text: $titulo)
                .font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta)
                .focused($foco, equals: .titulo)
                .submitLabel(.next)
                .onSubmit { renombrar(); foco = .anadir }
                .background(alignment: .bottomLeading) { subrayado }
                .accessibilityLabel("nombre de la lista")
            if caja.total > 0 {
                Chip(texto: "\(caja.hechas)/\(caja.total)", tono: caja.hechas == caja.total ? .oscuro : .sutil)
                    .contentTransition(.numericText())
                    .animation(Muelle.rapido, value: caja.hechas)
                    .accessibilityLabel("\(caja.hechas) de \(caja.total) hechas")
            }
            Menu { menuCaja } label: {
                Image(systemName: "ellipsis").font(.system(size: 16, weight: .semibold)).foregroundStyle(Lienzo.tintaSecundaria)
                    .frame(width: Medida.toque, height: Medida.toque).contentShape(Rectangle())
            }
            .accessibilityLabel("opciones de la lista")
        }
        .frame(minHeight: 52)
    }

    // El color del título es un subrayado de rotulador muy suave (más tenue en los temas oscuros, como en la web). En
    // tinta, su gris (Color.deUsuario).
    @ViewBuilder private var subrayado: some View {
        if let hex = ListasOp.colores.first(where: { $0.0 == caja.color })?.1, !titulo.isEmpty {
            Text(titulo).font(Letra.tituloTarjeta).foregroundStyle(.clear).lineLimit(1)
                .background(alignment: .bottom) {
                    Rectangle().fill(Color.deUsuario(hex).opacity(Paleta.mono ? 0.25 : 0.55)).frame(height: MedidaPanorama.subrayado).offset(y: -MedidaPanorama.subrayado / 3)
                }
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder private var menuCaja: some View {
        Menu("color del título.") {
            ForEach(ListasOp.colores.map { $0.0 }, id: \.self) { nombre in
                Button { guardar(op("lista", ["color": .string(nombre)])) } label: {
                    if caja.color == nombre { Label(nombre + ".", systemImage: "checkmark") } else { Text(nombre + ".") }
                }
            }
            Button("sin color.") { guardar(op("lista", ["color": .string("")])) }
        }
        Button(caja.ocultarHechas ? "mostrar las hechas." : "ocultar las hechas.") { guardar(op("lista", ["ocultarHechas": .bool(!caja.ocultarHechas)])) }
        if caja.hayHijas {
            Button("plegar todo.") { guardar(op("plegar_todo", ["plegada": .bool(true)])) }
            Button("desplegar todo.") { guardar(op("plegar_todo", ["plegada": .bool(false)])) }
        }
        if caja.hechas > 0 { Button("quitar las hechas.") { Task { await quitarHechas() } } }
        if posicion > 0 { Button("mover antes.") { guardar(op("mover_lista", ["indice": .number(String(posicion - 1))])) } }
        if posicion < cuantas - 1 { Button("mover después.") { guardar(op("mover_lista", ["indice": .number(String(posicion + 1))])) } }
        Button("eliminar lista.", role: .destructive) { pedirBorrar(caja) }
    }

    @ViewBuilder private func fila(_ f: FilaLista) -> some View {
        HStack(alignment: .primeraLinea, spacing: 0) {
            Color.clear.frame(width: CGFloat(f.nivel) * Self.sangria, height: 1)
            if f.hijas > 0 {
                Button {
                    Haptica.ligera()
                    guardar(op("editar", ["id": .string(f.id), "plegada": .bool(!f.plegada)]))
                } label: {
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(Lienzo.tintaTerciaria)
                        .rotationEffect(.degrees(f.plegada ? 0 : 90))
                        .animation(Muelle.expandir, value: f.plegada)
                        .frame(width: MedidaPanorama.anchoPlegar, height: Medida.toque).contentShape(Rectangle())
                }
                .buttonStyle(Pulsable(escala: 0.85, haptica: false))
                .accessibilityLabel(f.plegada ? "desplegar" : "plegar")
            } else {
                Color.clear.frame(width: MedidaPanorama.anchoPlegar, height: 1)
            }
            // Sin enPrimeraLinea: una vista sin texto alinea su centro, que cae en el de la primera línea (fila de 44).
            CasillaMarcar(hecha: f.hecha) { tocarCheck(f) }
                .accessibilityValue(f.hecha ? "sí" : "no")
            if editando == f.id {
                TextField("escribe.", text: $borrador, axis: .vertical)
                    .font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                    .focused($foco, equals: .fila(f.id))
                    .padding(.vertical, 11)
                    .onChange(of: borrador) { _, nuevo in escribiendo(f, nuevo) }
                    .enPrimeraLinea(16)
            } else {
                Button { empezar(f) } label: {
                    Text(f.texto.isEmpty ? "sin texto." : f.texto)
                        .font(Letra.cuerpo).foregroundStyle(f.hecha || f.texto.isEmpty ? Lienzo.tintaTerciaria : Lienzo.tinta)
                        .strikethrough(f.hecha, color: Lienzo.tintaTerciaria)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, minHeight: Medida.toque, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.pulsable(0.98))
                .enPrimeraLinea(16)
                .accessibilityHint("toca para editarla")
            }
            if f.hijas > 0 {
                Text("\(f.hijasHechas)/\(f.hijas)").font(f.hijasHechas == f.hijas ? Letra.pieFuerte : Letra.pie).monospacedDigit()
                    .foregroundStyle(f.hijasHechas == f.hijas ? Lienzo.tinta : Lienzo.tintaSecundaria)
                    .padding(.leading, Medida.xxs)
                    .enPrimeraLinea(12)
                    .accessibilityLabel("\(f.hijasHechas) de \(f.hijas) subtareas hechas")
            }
            if !f.hecha && enHoy[f.id] != nil {
                Chip(texto: "en hoy.", tono: .naranja)
                    .padding(.leading, Medida.xxs)
            }
            Menu { menuFila(f) } label: {
                Image(systemName: "ellipsis").font(.system(size: 14, weight: .semibold)).foregroundStyle(Lienzo.tintaTerciaria)
                    .frame(width: MedidaPanorama.anchoMenuFila, height: Medida.toque).contentShape(Rectangle())
            }
            .accessibilityLabel("opciones de «\(f.texto)»")
        }
        .overlay(alignment: .bottom) { Rectangle().fill(Lienzo.filo).frame(height: 1).padding(.leading, CGFloat(f.nivel) * Self.sangria + MedidaPanorama.anchoPlegar) }
        .contextMenu { menuFila(f) }
    }

    @ViewBuilder private func menuFila(_ f: FilaLista) -> some View {
        if f.nivel < ListasOp.niveles - 1 {
            Button("+ subtarea.") { apuntarDentro(f) }
        }
        if !f.hecha && enHoy[f.id] == nil { Button("→ hoy.") { aHoy(f) } }
        Button("editar.") { empezar(f) }
        if f.previaId != nil { Button("meter.") { meter(f) } }
        if f.nivel > 0 { Button("sacar.") { sacar(f) } }
        if f.indice > 0 { Button("subir.") { mover(f, padre: f.padreId, indice: f.indice - 1) } }
        if f.indice < f.hermanas - 1 { Button("bajar.") { mover(f, padre: f.padreId, indice: f.indice + 1) } }
        if !otras.isEmpty {
            Menu("a otra lista.") {
                ForEach(otras) { o in
                    Button(o.titulo.isEmpty ? "sin nombre." : o.titulo + ".") {
                        guardar(op("mover", ["id": .string(f.id), "aLista": .string(o.id)]))
                    }
                }
            }
        }
        Button("borrar.", role: .destructive) { Task { await borrar(f) } }
    }

    private var campoAnadir: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let d = destino {
                HStack(spacing: Medida.xxs) {
                    Chip(texto: d.etiqueta)
                    Button { withAnimation(Muelle.rapido) { destino = nil } } label: {
                        Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Lienzo.tintaSecundaria)
                            .frame(width: Medida.toque, height: Medida.toque).contentShape(Rectangle())
                    }
                    .buttonStyle(.pulsable(0.85))
                    .accessibilityLabel("añadir al final")
                }
                .padding(.leading, CGFloat(destino?.nivel ?? 0) * Self.sangria)
                .transition(.opacity.combined(with: .offset(y: 4)))
            }
            HStack(spacing: Medida.xs) {
                Image(systemName: "plus").font(.system(size: 13, weight: .bold)).foregroundStyle(foco == .anadir ? Lienzo.tinta : Lienzo.tintaTerciaria)
                    .accessibilityHidden(true)
                TextField((destino?.nivel ?? 0) > 0 ? "añadir subtarea." : "añadir tarea.", text: $texto, axis: .vertical)
                    .font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                    .lineLimit(1...4)
                    .focused($foco, equals: .anadir)
                    .onChange(of: texto) { _, nuevo in anadiendo(nuevo) }
                    .accessibilityLabel("añadir tarea a \(caja.titulo.isEmpty ? "la lista" : caja.titulo)")
            }
            .padding(.horizontal, Medida.m).padding(.vertical, Medida.xs)
            .frame(minHeight: Medida.alturaControl)
            .background(Lienzo.sutil, in: Capsule())
            .padding(.leading, CGFloat(destino?.nivel ?? 0) * Self.sangria)
        }
        .animation(Muelle.rapido, value: destino)
    }

    // MARK: acciones

    private func op(_ accion: String, _ d: [String: JSONValue] = [:]) -> OperacionBitacora {
        var x = d
        x["accion"] = .string(accion)
        x["lista"] = .string(caja.id)
        return ListasOp.op(x)
    }

    private func guardar(_ ops: OperacionBitacora...) { Task { await c.guardar(ops) } }

    private func renombrar() {
        let t = titulo.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        guard t != caja.titulo else { return }
        guardar(op("lista", ["titulo": .string(t)]))
    }

    private func tocarCheck(_ f: FilaLista) {
        if !f.hecha && f.pendientesDebajo > 0 { preguntar = f } else { marcar(f, !f.hecha, conSubtareas: false) }
    }

    // listaAplicarMarca: la tarea (y sus subtareas si se pide) y, si alguna está en el plan de hoy, también allí.
    private func marcar(_ f: FilaLista, _ hecha: Bool, conSubtareas: Bool) {
        var ops = [op("editar", ["id": .string(f.id), "hecha": .bool(hecha), "conSubtareas": .bool(conSubtareas), "cuando": .string(ListasOp.ahoraISO)])]
        let ahora = Int64(Date().timeIntervalSince1970 * 1000)
        for id in [f.id] + (conSubtareas ? f.debajo : []) {
            if let e = enHoy[id], e.hecha != hecha { ops.append(.marcarTarea(id: e.tarea, hecha: hecha, momentoMs: ahora)) }
        }
        Task { await c.guardar(ops) }
    }

    private func empezar(_ f: FilaLista) {
        borrador = f.texto
        editando = f.id
        foco = .fila(f.id)
    }

    // Return (o pegar varias líneas) en el texto de una tarea: la primera línea es la tarea; las demás entran detrás.
    private func escribiendo(_ f: FilaLista, _ nuevo: String) {
        guard nuevo.contains("\n") else { return }
        let lineas = nuevo.components(separatedBy: .newlines)
        borrador = lineas[0]
        let resto = lineas.dropFirst().map(Self.limpiar).filter { !$0.isEmpty }
        confirmar(f, siguiente: resto.isEmpty)
        guard !resto.isEmpty else { return }
        guardar(op("anadir", ["padre": f.padreId.map(JSONValue.string) ?? .null, "indice": .number(String(f.indice + 1)),
                              "tareas": .array(resto.map { ListasOp.nodo(ListasOp.nuevoId("lt"), $0) })]))
    }

    // Una tarea que se deja vacía y sin subtareas se borra (con deshacer), como al salir de ella en la web.
    private func confirmar(_ f: FilaLista, siguiente: Bool) {
        guard editando == f.id else { return }
        editando = nil
        let t = Self.limpiar(borrador)
        if t.isEmpty && f.hijas == 0 {
            Task { await borrar(f) }
            return
        }
        if !t.isEmpty && t != f.texto { guardar(op("editar", ["id": .string(f.id), "texto": .string(t)])) }
        if siguiente {
            destino = Destino(padre: f.padreId, indice: f.indice + 1, nivel: f.nivel, etiqueta: "después de «\(t.isEmpty ? f.texto : t)».")
            foco = .anadir
        } else if foco == .fila(f.id) {
            foco = nil
        }
    }

    private func apuntarDentro(_ f: FilaLista) {
        destino = Destino(padre: f.id, indice: nil, nivel: f.nivel + 1, etiqueta: "dentro de «\(f.texto)».")
        foco = .anadir
    }

    // El campo de abajo: Return añade y deja el campo abierto para la siguiente. Return con el campo vacío sube un nivel
    // (como Enter en una tarea vacía con sangría) y, arriba del todo, cierra el teclado.
    private func anadiendo(_ nuevo: String) {
        guard nuevo.contains("\n") else { return }
        let lineas = nuevo.components(separatedBy: .newlines).map(Self.limpiar).filter { !$0.isEmpty }
        texto = ""
        guard !lineas.isEmpty else {
            if let d = destino, let p = d.padre {
                let padre = caja.filas.first { $0.id == p }
                destino = padre.map { Destino(padre: $0.padreId, indice: $0.indice + 1, nivel: $0.nivel, etiqueta: "después de «\($0.texto)».") }
            } else {
                destino = nil
                foco = nil
            }
            return
        }
        let nodos = lineas.map { ListasOp.nodo(ListasOp.nuevoId("lt"), $0) }
        var d: [String: JSONValue] = ["tareas": .array(nodos)]
        if let p = destino?.padre { d["padre"] = .string(p) }
        if let i = destino?.indice { d["indice"] = .number(String(i)); destino?.indice = i + nodos.count }
        guardar(op("anadir", d))
    }

    private func meter(_ f: FilaLista) {
        guard let previa = f.previaId else { return }
        guard f.nivel + 1 + f.altura <= ListasOp.niveles else { c.avisar("como mucho, \(ListasOp.niveles) niveles."); return }
        guardar(op("mover", ["id": .string(f.id), "padre": .string(previa)]))
    }

    private func sacar(_ f: FilaLista) {
        guard let p = f.padreId, let padre = caja.filas.first(where: { $0.id == p }) else { return }
        mover(f, padre: padre.padreId, indice: padre.indice + 1)
    }

    private func mover(_ f: FilaLista, padre: String?, indice: Int) {
        var d: [String: JSONValue] = ["id": .string(f.id), "indice": .number(String(indice))]
        if let padre { d["padre"] = .string(padre) }
        guardar(op("mover", d))
    }

    private func aHoy(_ f: FilaLista) {
        let t = f.texto.trimmingCharacters(in: .whitespaces)
        let nombre = t.isEmpty ? "tarea" : t
        let titulo = caja.titulo.isEmpty ? nombre : "\(caja.titulo): \(nombre)"
        Task {
            let ok = await c.guardar(OperacionesExtra.op(ListasOp.aHoy, ["lista": .string(caja.id), "id": .string(f.id), "idTarea": .string(OperacionBitacora.nuevoIdTarea()),
                                                                        "dia": .string(hoy), "titulo": .string(titulo)]))
            if ok { c.avisar("añadida a hoy en el plan.") }
        }
    }

    private func crudas() async -> [JSONValue] {
        let doc = await c.documentoVisible()
        let valor: JSONValue? = (try? doc?.valor(de: "listasPanorama")) ?? nil
        let suya = (valor?.lista ?? []).first(where: { $0["id"]?.comoId == caja.id })
        return suya?["tareas"]?.lista ?? []
    }

    private func borrar(_ f: FilaLista) async {
        let tareas = await crudas()
        guard let r = ListasOp.ruta(f.id, tareas), let nodo = ListasOp.nodo(tareas, r) else { return }
        guard await c.guardar(op("borrar", ["id": .string(f.id)])) else { return }
        let sub = ListasOp.todas(ListasOp.hijos(nodo)).count
        var d: [String: JSONValue] = ["indice": .number(String(r.last ?? 0)), "tareas": .array([nodo])]
        if let p = f.padreId { d["padre"] = .string(p) }
        let nombre = String((f.texto.isEmpty ? "sin texto" : f.texto).prefix(40))
        ofrecer("borrada «\(nombre)»" + (sub == 0 ? "." : sub == 1 ? " y su subtarea." : " y sus \(sub) subtareas."), [op("anadir", d)])
    }

    private func quitarHechas() async {
        let tareas = await crudas()
        guard await c.guardar(op("quitar_hechas")) else { return }
        let n = caja.hechas
        ofrecer(n == 1 ? "quitada 1 tarea hecha." : "quitadas \(n) tareas hechas.", [op("reponer_tareas", ["tareas": .array(tareas)])])
    }

    // Quita viñetas al pegar una lista («- », «* », «1. », «[ ] »), como listaPegarNueva.
    static func limpiar(_ s: String) -> String {
        var t = s.trimmingCharacters(in: .whitespaces)
        if let r = t.range(of: #"^(?:[-*•]|\d+[.)]|\[[ xX]\])\s*"#, options: .regularExpression) { t.removeSubrange(r) }
        return t.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }
}
