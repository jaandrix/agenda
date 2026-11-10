import SwiftUI

// renderMobileMenu: los apartados en cuatro grupos (general, desarrollo, otros, sistema) con la visibilidad de
// `apartadosConfig`. Lo nativo se abre aquí; lo demás, en su página de la web, marcado con «web.».
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
        m.cuentas["actualizaciones"] = (((try? doc.valor(de: "pedidos")) ?? nil)?.lista ?? []).filter { $0["estado"]?.texto != "entregado" }.count
        return m
    }
}

struct MasView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var menu: MenuMas?

    // Lo que ya es nativo: o una pestaña de la barra, o una página dentro de «más.».
    static let pestanas: [String: Pestana] = ["calendar": .calendario, "planner": .plan, "finances": .finanzas]
    static let paginas: Set<String> = ["habits", "notes", "studies", "projects", "settings", "events", "transporte", "home", "compra", "culture", "travels", "work", "goals"]

    var body: some View {
        ScrollViewReader { lector in
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                CabeceraApartado(titulo: "menú", contexto: nil) { EmptyView() }.id("arriba")
                NavigationLink(value: "buscar") {
                    HStack(spacing: Espacio.s) {
                        Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .semibold))
                        Text("buscar en bitácora.").font(Tipo.cuerpo)
                        Spacer()
                    }
                    .foregroundStyle(Paleta.textoSecundario)
                    .padding(.horizontal, 14).frame(minHeight: 46)
                    .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: Radio.control, style: .continuous))
                }
                .buttonStyle(.plain).padding(.top, Espacio.m)
                .accessibilityLabel("buscar")
                if let menu {
                    ForEach(menu.grupos, id: \.nombre) { g in
                        GrupoMenu(titulo: g.nombre + ".") {
                            ForEach(Array(g.apartados.enumerated()), id: \.element.id) { n, a in
                                if n > 0 { SeparadorMenu() }
                                fila(a.vista == "studies" ? Apartado(vista: menu.estudios, nombre: a.nombre) : a, cuenta: menu.cuentas[a.vista] ?? 0)
                            }
                        }
                    }
                } else {
                    ProgressView().tint(Paleta.textoSecundario).frame(maxWidth: .infinity).padding(.top, Espacio.xl)
                }
                GrupoMenu(titulo: "este iphone.") {
                    NavigationLink(value: "estado") { FilaMenu(nombre: "estado de la sincronización", inicial: "s") }.buttonStyle(.plain)
                    SeparadorMenu()
                    Button { c.web = Config.webURL } label: { FilaMenu(nombre: "bitácora web", inicial: "w", web: true) }.buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, Espacio.xl)
        }
        .scrollIndicators(.hidden)
        .onChange(of: c.subir[.mas]) { lector.scrollTo("arriba", anchor: .top) }
        }
        .background(Paleta.fondo.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar() }
        .navigationDestination(for: String.self) { destino($0) }
        .task(id: c.informe.revision) {
            let doc = await c.documentoVisible()
            menu = await Task.detached(priority: .userInitiated) { doc.map { MenuMas.desde($0) } }.value
        }
    }

    @ViewBuilder private func fila(_ a: Apartado, cuenta: Int) -> some View {
        let inicial = String(a.nombre.prefix(1))
        if let p = Self.pestanas[a.vista] {
            Button { c.anotarUso(a.vista); c.pestana = p } label: { FilaMenu(nombre: a.nombre, inicial: inicial, cuenta: cuenta) }.buttonStyle(.plain)
        } else if Self.paginas.contains(a.vista) {
            NavigationLink(value: a.vista) { FilaMenu(nombre: a.nombre, inicial: inicial, cuenta: cuenta) }.buttonStyle(.plain)
                .simultaneousGesture(TapGesture().onEnded { c.anotarUso(a.vista) })
        } else {
            Button { c.anotarUso(a.vista); c.web = Apartados.webURL(a.vista) } label: { FilaMenu(nombre: a.nombre, inicial: inicial, cuenta: cuenta, web: true) }.buttonStyle(.plain)
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
        case "estado": EstadoView()
        case "buscar": BuscarView()
        case "home": PanoramaView()
        default: Color.clear.onAppear { c.rutaMas = []; c.web = Apartados.webURL(vista) }
        }
    }
}

// .m-menu-grupo (13, negrita, gris) sobre una .m-mtarjeta (radio 22, color de superficie).
struct GrupoMenu<Contenido: View>: View {
    let titulo: String
    @ViewBuilder var contenido: () -> Contenido

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(titulo).font(Tipo.poppins(13, .bold, estilo: .footnote)).foregroundStyle(Paleta.textoSecundario)
                .padding(.horizontal, 6).padding(.top, 22).padding(.bottom, 8)
                .accessibilityAddTraits(.isHeader)
            VStack(spacing: 0) { contenido() }
                .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }
}

// .m-mfila + .m-mfila::before: el filete empieza a 62, después del icono.
struct SeparadorMenu: View {
    var body: some View { Rectangle().fill(Paleta.borde).frame(height: 1).padding(.leading, 62) }
}

// .m-mfila: 56 de alto, la inicial en un cuadrado de 32 con radio 10, el nombre a 17 seminegrita, el contador en una
// bola del acento y la flecha.
struct FilaMenu: View {
    let nombre: String
    let inicial: String
    var cuenta = 0
    var web = false

    var body: some View {
        HStack(spacing: 14) {
            Text(inicial).font(Tipo.poppins(15, .bold, estilo: .body)).foregroundStyle(Paleta.texto)
                .frame(width: 32, height: 32).background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            Text(nombre).font(Tipo.poppins(17, .semibold, estilo: .body)).kerning(-0.17).foregroundStyle(Paleta.texto)
                .frame(maxWidth: .infinity, alignment: .leading)
            if web { Text("web.").font(Tipo.pie).foregroundStyle(Paleta.textoApagado) }
            if cuenta > 0 {
                Text("\(cuenta)").font(Tipo.poppins(12, .bold, estilo: .caption)).foregroundStyle(Paleta.sobreAcento)
                    .padding(.horizontal, 7).frame(minWidth: 24, minHeight: 24).background(Paleta.acento, in: Capsule())
            }
            Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Paleta.textoApagado)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 56)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint(web ? "se abre en la web" : "")
    }
}

// Rutinas de hoy (toggleHabitToday): la página del apartado.
struct RutinasView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaMas?
    @State private var aviso: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                CabeceraApartado(titulo: "rutinas", contexto: vista.map { $0.rutinas.isEmpty ? "ninguna hoy." : "\($0.rutinas.filter(\.hecha).count) de \($0.rutinas.count) hoy." }) { EmptyView() }
                if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.error).padding(.top, Espacio.s) }
                CabeceraSeccion(titulo: "hoy.")
                ForEach(vista?.rutinas ?? []) { r in
                    FilaAgenda(hora: nil, titulo: r.texto, notas: "\(r.semana) esta semana" + (r.momento.isEmpty ? "" : ", \(r.momento)"),
                               hecho: r.hecha, mostrarHora: false) { marcar(r) }
                }
            }
            .padding(.horizontal, 20).padding(.bottom, Espacio.xl)
        }
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .task(id: c.informe.revision) {
            let doc = await c.documentoVisible()
            vista = await Task.detached(priority: .userInitiated) { doc.map { LecturaMas.vista($0) } }.value
        }
    }

    private func marcar(_ r: Rutina) {
        guard var v = vista, let i = v.rutinas.firstIndex(where: { $0.id == r.id }) else { return }
        v.rutinas[i].hecha.toggle()
        vista = v
        let hecha = v.rutinas[i].hecha
        Task {
            do { try await c.encolar(.marcarRutina(id: r.id, dia: CalendarioBitacora.madrid.dia(de: Date()).iso, hecha: hecha)); aviso = nil } catch {
                if var w = vista, let j = w.rutinas.firstIndex(where: { $0.id == r.id }) { w.rutinas[j].hecha = !hecha; vista = w }
                aviso = "no se pudo guardar en este iPhone."
            }
        }
    }
}

// Notas: la nota rápida arriba y las últimas debajo.
struct NotasView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaMas?
    @State private var nota = ""
    @State private var idNota = OperacionBitacora.nuevoIdNota()
    @State private var aviso: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                CabeceraApartado(titulo: "notas", contexto: vista.map { "\($0.notas.count) notas." }) { EmptyView() }
                if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.error).padding(.top, Espacio.s) }
                HStack(alignment: .bottom) {
                    TextField("nota rápida.", text: $nota, axis: .vertical)
                        .font(Tipo.cuerpo).foregroundStyle(Paleta.texto)
                        .padding(.vertical, 12)
                    AccionTexto(texto: "guardar.") { guardarNota() }
                        .disabled(nota.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(.top, Espacio.m)
                .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                ForEach(vista?.notas ?? []) { n in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(n.texto).font(Tipo.cuerpo).foregroundStyle(Paleta.texto).lineLimit(8)
                        Text(n.fecha).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 10)
                    .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
                    .textSelection(.enabled)
                }
            }
            .padding(.horizontal, 20).padding(.bottom, Espacio.xl)
        }
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .task(id: c.informe.revision) {
            let doc = await c.documentoVisible()
            vista = await Task.detached(priority: .userInitiated) { doc.map { LecturaMas.vista($0) } }.value
        }
    }

    private func guardarNota() {
        let texto = String(nota.trimmingCharacters(in: .whitespacesAndNewlines).prefix(5000))
        guard !texto.isEmpty else { return }
        let id = idNota
        // El texto se queda en el campo hasta que la cola lo tiene guardado.
        Task {
            do {
                try await c.encolar(.crearNota(id: id, dia: CalendarioBitacora.madrid.dia(de: Date()).iso, texto: texto,
                                               creada: ISO8601DateFormatter().string(from: Date())))
                if nota.trimmingCharacters(in: .whitespacesAndNewlines) == texto { nota = "" }
                idNota = OperacionBitacora.nuevoIdNota()
                aviso = nil
            } catch {
                aviso = "no se pudo guardar la nota en este iPhone."
            }
        }
    }
}
