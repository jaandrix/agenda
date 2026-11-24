import SwiftUI

// renderMobileMenu: los apartados en cuatro grupos (general, desarrollo, otros, sistema) con la visibilidad de
// `apartadosConfig`. Lo nativo se abre aquí; lo demás, en su página de la web, marcado con «web».
struct MenuMas: Sendable, Equatable {
    var grupos: [Grupo] = []
    var cuentas: [String: Int] = [:]
    var estudios = "studies"
    struct Grupo: Sendable, Equatable { let nombre: String; let apartados: [Apartado] }

    static func desde(_ doc: DocumentoBitacora) -> MenuMas {
        var m = MenuMas(grupos: Apartados.visibles(doc).map { Grupo(nombre: $0.0, apartados: $0.1) })
        m.estudios = Apartados.destinoEstudios(doc)
        // mobileCuentaMenu: lo que queda por hacer hoy en plan y rutinas y los envíos en camino.
        let plan = LecturaPlanificador.vista(doc)
        m.cuentas["planner"] = plan.tareas.filter { !$0.hecha }.count + plan.recurrentes.filter { !$0.hecha }.count
        let hoy = CalendarioBitacora.madrid.dia(de: Date()).iso
        m.cuentas["habits"] = (((try? doc.valor(de: "habits")) ?? nil)?.lista ?? []).filter {
            $0["activo"]?.booleano != false && $0["completadas"]?[hoy]?.booleano != true }.count
        m.cuentas["listas"] = VistaListas.desde(doc).pendientes
        m.cuentas["actualizaciones"] = (((try? doc.valor(de: "pedidos")) ?? nil)?.lista ?? []).filter { $0["estado"]?.texto != "entregado" }.count
        return m
    }

    // Todos los apartados visibles en el orden del menú, con «estudios» ya apuntando a su primera pestaña encendida.
    var todos: [Apartado] {
        grupos.flatMap(\.apartados).map { $0.vista == "studies" ? Apartado(vista: estudios, nombre: $0.nombre) : $0 }
    }

    // Filtro del buscador del menú: por nombre, sin tildes ni mayúsculas.
    func filtrados(_ texto: String) -> [Apartado] {
        let q = LecturaBusqueda.plegar(texto.trimmingCharacters(in: .whitespacesAndNewlines))
        guard !q.isEmpty else { return [] }
        return todos.filter { LecturaBusqueda.plegar($0.nombre).contains(q) }
    }
}

// Menú 2.0: la marca arriba, el buscador en cápsula (filtra apartados al escribir; con «buscar en todo.» lleva a la
// búsqueda global), «más usados.» en una rejilla de squircles grandes y los grupos en tarjetas blancas.
struct MasView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var menu: MenuMas?
    @State private var usados: [Apartado] = []
    @State private var filtro = ""
    @FocusState private var focoFiltro: Bool

    // Lo que ya es nativo: o una pestaña de la barra, o una página dentro de «más.».
    static let pestanas: [String: Pestana] = ["calendar": .calendario, "planner": .plan, "finances": .finanzas]
    static let paginas: Set<String> = ["listas", "habits", "notes", "studies", "projects", "settings", "events", "transporte", "home", "compra", "culture", "travels", "work", "goals", "links", "actualizaciones", "documents", "bandeja",
                                          // 3.1: ya nativos (antes abrían la web).
                                          "friends", "collectibles", "tags", "graph", "profesorado", "suggestions"]

    var body: some View {
        ScrollViewReader { lector in
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                CabeceraMarca {
                    NavigationLink(value: "settings") {
                        IconoCuadrado(id: "ajustes", tono: .blanco)
                            .frame(minWidth: Medida.toque, minHeight: Medida.toque)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.pulsable(0.9))
                    .simultaneousGesture(TapGesture().onEnded { c.anotarUso("settings") })
                    .accessibilityLabel("ajustes")
                }
                .id("arriba")
                Text("menú.").font(Letra.titulo).foregroundStyle(Lienzo.tinta).kerning(-0.4)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.top, Medida.s)
                BuscadorCapsula(texto: $filtro, placeholder: "buscar un apartado", enfocar: $focoFiltro)
                    .padding(.top, Medida.s)
                if let menu {
                    if filtro.trimmingCharacters(in: .whitespaces).isEmpty {
                        contenido(menu)
                            .transition(.opacity)
                    } else {
                        filtrado(menu)
                            .transition(.opacity)
                    }
                } else {
                    ProgressView().tint(Lienzo.tintaSecundaria).frame(maxWidth: .infinity).padding(.top, Medida.xl)
                }
            }
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: filtro.isEmpty)
            .padding(.horizontal, Medida.margen)
            .padding(.bottom, Medida.entreSecciones)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: c.subir[.mas]) { lector.scrollTo("arriba", anchor: .top) }
        }
        .fondoLienzo()
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar() }
        // Toda pantalla que se abre desde el menú lleva la barra del sistema (transparente): su botón de volver, con
        // «menú» de título, y el gesto de volver desde el borde. Ocultarla quitaba las dos cosas (Documentos, 0.17).
        .navigationTitle("menú")
        .navigationDestination(for: String.self) { destino($0).huecoDeBarra().toolbar(.visible, for: .navigationBar).navigationBarTitleDisplayMode(.inline) }
        .onChange(of: c.rutaMas) { if !c.rutaMas.isEmpty { focoFiltro = false } }
        .task(id: c.revision) {
            let t0 = Medidas.ahora
            let doc = await c.documentoVisible()
            guard let nuevo = await ultimaGana({ doc.map { MenuMas.desde($0) } }) else { return }
            menu = nuevo
            if let nuevo { usados = masUsados(nuevo) }
            await Medidas.anotar("pestaña menú (cargar)", desde: t0)
        }
        .onAppear { if let menu { usados = masUsados(menu) } }
    }

    // MARK: contenido

    @ViewBuilder private func contenido(_ menu: MenuMas) -> some View {
        if !usados.isEmpty {
            EtiquetaSeccion(texto: "más usados")
                .padding(.top, Medida.entreSecciones).padding(.bottom, Medida.xs)
            RejillaUsados(apartados: usados, cuentas: menu.cuentas, web: { esWeb($0) }) { abrir($0) }
        }
        ForEach(Array(menu.grupos.enumerated()), id: \.element.nombre) { i, g in
            GrupoMenu(titulo: g.nombre + ".") {
                ForEach(Array(g.apartados.enumerated()), id: \.element.id) { n, a in
                    if n > 0 { SeparadorMenu() }
                    fila(a.vista == "studies" ? Apartado(vista: menu.estudios, nombre: a.nombre) : a, cuenta: menu.cuentas[a.vista] ?? 0)
                }
            }
            .entradaEscalonada(i + 1)
        }
        GrupoMenu(titulo: "este iphone.") {
            NavigationLink(value: "estado") { FilaMenu(nombre: "estado de la sincronización", inicial: "estado") }.buttonStyle(EstiloFila())
            SeparadorMenu()
            Button { c.web = Config.webURL } label: { FilaMenu(nombre: "bitácora web", inicial: "web", web: true) }.buttonStyle(EstiloFila())
        }
        .entradaEscalonada(menu.grupos.count + 1)
    }

    @ViewBuilder private func filtrado(_ menu: MenuMas) -> some View {
        let lista = menu.filtrados(filtro)
        TarjetaFilas {
            if lista.isEmpty {
                EstadoVacio(texto: "ningún apartado con «\(filtro)».", icono: "buscar")
            } else {
                ForEach(Array(lista.enumerated()), id: \.element.id) { n, a in
                    if n > 0 { SeparadorMenu() }
                    fila(a, cuenta: menu.cuentas[a.vista == menu.estudios ? "studies" : a.vista] ?? 0)
                }
            }
        }
        .padding(.top, Medida.m)
        NavigationLink(value: "buscar") {
            Text("buscar «\(filtro)» en todo.")
        }
        .buttonStyle(.capsula(.oscuro, ancho: true))
        .padding(.top, Medida.s)
        .accessibilityHint("busca también en eventos, tareas, notas, asignaturas y ocio")
    }

    // MARK: navegación (la de siempre: pestaña, página nativa o web)

    private func esWeb(_ vista: String) -> Bool { Self.pestanas[vista] == nil && !Self.paginas.contains(vista) }

    private func abrir(_ vista: String) {
        if let p = Self.pestanas[vista] { c.anotarUso(vista); c.pestana = p }
        else if Self.paginas.contains(vista) { c.anotarUso(vista); c.rutaMas.append(vista) }
        else { c.anotarUso(vista); c.web = Apartados.webURL(vista) }
    }

    // Los ocho más usados de este iphone (UsoApartados), sin plan ni ajustes; si aún no hay uso, el orden del menú.
    private func masUsados(_ menu: MenuMas) -> [Apartado] {
        let todos = menu.todos
        let ids = c.uso.ranking(candidatos: todos.map(\.vista), excluir: ["planner", "settings"], cuantos: 8)
        return ids.compactMap { id in todos.first { $0.vista == id } }
    }

    @ViewBuilder private func fila(_ a: Apartado, cuenta: Int) -> some View {
        let inicial = a.vista
        if let p = Self.pestanas[a.vista] {
            Button { c.anotarUso(a.vista); c.pestana = p } label: { FilaMenu(nombre: a.nombre, inicial: inicial, cuenta: cuenta) }.buttonStyle(EstiloFila())
        } else if Self.paginas.contains(a.vista) {
            NavigationLink(value: a.vista) { FilaMenu(nombre: a.nombre, inicial: inicial, cuenta: cuenta) }.buttonStyle(EstiloFila())
                .simultaneousGesture(TapGesture().onEnded { c.anotarUso(a.vista) })
        } else {
            Button { c.anotarUso(a.vista); c.web = Apartados.webURL(a.vista) } label: { FilaMenu(nombre: a.nombre, inicial: inicial, cuenta: cuenta, web: true) }.buttonStyle(EstiloFila())
        }
    }

    @ViewBuilder private func destino(_ vista: String) -> some View {
        switch vista {
        case "habits": RutinasView()
        case "notes": NotasView()
        case "studies": EstudiosView()
        case "projects": ProyectosView()
        case "settings": AjustesView()
        case "events": EventosView()
        case "transporte": TransporteView()
        case "compra": DespensaView()
        case "culture": OcioView()
        case "travels": ViajesView()
        case "work": EmpleoView()
        case "goals": ObjetivosView()
        case "links": EnlacesView()
        case "actualizaciones": EnviosView()
        case "documents": DocumentosView()
        case "bandeja": BandejaView()
        case "estado": EstadoView()
        case "buscar": BuscarView(inicial: filtro)
        case "home": PanoramaView()
        case "listas": ListasView()
        case "friends": SocialView()
        case "collectibles": ColeccionablesView()
        case "tags": EtiquetasView()
        case "graph": ConexionesView()
        case "profesorado": ProfesoradoView()
        case "suggestions": SugerenciasView()
        default: Color.clear.onAppear { c.rutaMas = []; c.web = Apartados.webURL(vista) }
        }
    }
}

// «más usados.»: rejilla de cuatro columnas con squircles grandes (blancos sobre el lienzo; el primero, oscuro) y el
// nombre debajo en pequeño. El recuento va en un puntito naranja con la cifra en la esquina.
struct RejillaUsados: View {
    let apartados: [Apartado]
    let cuentas: [String: Int]
    let web: (String) -> Bool
    let abrir: (String) -> Void

    private let columnas = Array(repeating: GridItem(.flexible(), spacing: Medida.xs, alignment: .top), count: 4)

    var body: some View {
        LazyVGrid(columns: columnas, spacing: Medida.m) {
            ForEach(Array(apartados.enumerated()), id: \.element.id) { i, a in
                Button { abrir(a.vista) } label: {
                    VStack(spacing: Medida.xs) {
                        IconoCuadrado(id: a.vista, tono: i == 0 ? .oscuro : .blanco, tamano: AccesoGrande.lado)
                            .sombra(.suave)
                            .overlay(alignment: .topTrailing) {
                                let n = cuentas[a.vista] ?? 0
                                if n > 0 { ContadorEsquina(cifra: n).offset(x: Medida.xxs, y: -Medida.xxs) }
                            }
                        Text(a.nombre + ".").font(Letra.pie).foregroundStyle(Lienzo.tinta).lineLimit(1).minimumScaleFactor(0.85)
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.pulsable(0.92))
                .accessibilityLabel(a.nombre + ((cuentas[a.vista] ?? 0) > 0 ? ", \(cuentas[a.vista] ?? 0) pendientes" : ""))
                .accessibilityHint(web(a.vista) ? "se abre en la web" : "")
                .entradaEscalonada(i)
            }
        }
    }
}

// Lado del acceso grande de «más usados.» (entre iconoGrande y el ancho de una cuarta de pantalla).
enum AccesoGrande {
    static let lado: CGFloat = 60
}

// Cifra pequeña en un círculo naranja, para la esquina de un acceso grande.
struct ContadorEsquina: View {
    let cifra: Int
    var body: some View {
        Text("\(cifra)").font(Letra.etiqueta).monospacedDigit().foregroundStyle(Lienzo.sobreNaranja)
            .padding(.horizontal, 5)
            .frame(minWidth: 20, minHeight: 20)
            .background(Lienzo.naranja, in: Capsule())
            .overlay(Capsule().strokeBorder(Lienzo.fondo, lineWidth: 2))
            .accessibilityHidden(true)
    }
}

// Grupo del menú y de Ajustes: etiqueta en mayúsculas pequeñas y una tarjeta blanca con las filas.
struct GrupoMenu<Contenido: View>: View {
    let titulo: String
    @ViewBuilder var contenido: () -> Contenido

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            EtiquetaSeccion(texto: titulo.hasSuffix(".") ? String(titulo.dropLast()) : titulo)
            TarjetaFilas { contenido() }
        }
        .padding(.top, Medida.entreSecciones)
    }
}

// Filete entre filas: empieza después del icono cuadrado, como SeparadorFila, con el relleno lateral de la fila.
struct SeparadorMenu: View {
    var body: some View { SeparadorFila(sangria: Medida.rellenoTarjeta + Medida.icono + Medida.s) }
}

// Fila de apartado: FilaTarjeta con su IconoCuadrado del catálogo, «web» discreto, el recuento en un Chip naranja y la
// flecha.
struct FilaMenu: View {
    let nombre: String
    let inicial: String
    var cuenta = 0
    var web = false

    var body: some View {
        FilaTarjeta(icono: inicial, titulo: nombre + ".") {
            HStack(spacing: Medida.xs) {
                if web { Text("web").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) }
                if cuenta > 0 { Chip(texto: "\(cuenta)", tono: .naranja).monospacedDigit() }
                FlechaFila()
            }
        }
        .padding(.horizontal, Medida.rellenoTarjeta)
        .accessibilityHint(web ? "se abre en la web" : "")
    }
}
