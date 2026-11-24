import SwiftUI

// Ajustes (2.0): parte de Bitácora y no un Form gris. Cabecera de cuenta con la b. (o tu foto) y el correo pequeño,
// apariencia (un solo tema, «bitácora.», y el tamaño de letra) y los grupos de la PWA (js/ajustes.js, AJUSTES_GRUPOS): apartados, avisos, conexiones, cuenta, datos y ayuda. Lo que vive
// en la fila de `bitacora` se escribe por operaciones; lo del servidor, con las mismas RPC y funciones que la web.
struct AjustesView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var lectura = OperacionesAjustes.Lectura()
    @State private var suscripcion: Suscripcion?
    @State private var foto: UIImage?
    @State private var avisosIphone = AvisosLocales.activos
    @State private var confirmarSalida = false
    @State private var exportado: URL?
    @State private var exportando = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                Text("ajustes.").font(Letra.titulo).foregroundStyle(Lienzo.tinta).kerning(-0.4)
                    .accessibilityAddTraits(.isHeader)
                CabeceraPerfil(nombre: lectura.nombre, correo: c.sesion?.email ?? "", foto: foto, resumen: resumenCuenta)
                    .padding(.top, Medida.s)
                    .entradaEscalonada(0)
                apariencia.entradaEscalonada(1)
                GrupoMenu(titulo: "apartados.") {
                    VStack(alignment: .leading, spacing: Medida.xs) {
                        Text("eres.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        OpcionesAjuste(opciones: [("estudiante", "estudiante."), ("trabajador", "trabajo."), ("ambos", "las dos.")],
                                 elegida: lectura.perfil) { p in ponerPerfil(p) }
                    }
                    .padding(Medida.rellenoTarjeta)
                    SeparadorMenu()
                    NavigationLink { AjustesApartadosView().huecoDeBarra() } label: {
                        FilaAjuste(icono: "apartados", titulo: "apartados opcionales.", detalle: "qué sale en el menú.")
                    }.buttonStyle(EstiloFila())
                }
                .entradaEscalonada(2)
                GrupoMenu(titulo: "avisos.") {
                    NavigationLink { AjustesAvisosView().huecoDeBarra() } label: {
                        FilaAjuste(icono: "avisos", titulo: "avisos automáticos.", detalle: detalleAvisos)
                    }.buttonStyle(EstiloFila())
                    SeparadorMenu()
                    FilaInterruptor(icono: "eventos", titulo: "avisos de eventos en este iphone.", detalle: "una hora antes de cada evento con hora.",
                                    activo: Binding(get: { avisosIphone }, set: { v in cambiarAvisosIphone(v) }))
                }
                .entradaEscalonada(3)
                GrupoMenu(titulo: "seguridad.") {
                    FilaInterruptor(icono: "candado", titulo: "pedir \(Biometria.nombre) al abrir.", detalle: "solo en este iphone; tu cuenta sigue con su contraseña.",
                                    activo: Binding(get: { c.bloqueoActivo }, set: { v in Task { await c.activarBloqueo(v) } }),
                                    deshabilitado: !Biometria.disponible)
                }
                .entradaEscalonada(4)
                conexiones.entradaEscalonada(5)
                cuenta.entradaEscalonada(6)
                datos.entradaEscalonada(7)
                avanzado.entradaEscalonada(8)
                ayuda.entradaEscalonada(9)
            }
            .padding(.horizontal, Medida.margen)
            .padding(.bottom, Medida.entreSecciones)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        // El título va en la cabecera grande; la barra solo lo lleva para el botón de volver de las páginas.
        .navigationTitle("ajustes")
        .toolbar { ToolbarItem(placement: .principal) { EmptyView() } }
        .task(id: c.revision) { await cargarDocumento() }
        .task { await cargarRemoto() }
        .confirmationDialog("¿cerrar sesión?", isPresented: $confirmarSalida, titleVisibility: .visible) {
            Button("cerrar sesión.", role: .destructive) { Task { await c.salir() } }
            Button("cancelar.", role: .cancel) {}
        } message: {
            Text("se borra la copia de tus datos de este iphone. en la nube no cambia nada.")
        }
        .hoja(item: Binding(get: { exportado.map(ArchivoExportado.init) }, set: { if $0 == nil { ArchivosTemporales.borrar(exportado) }; exportado = $0?.url })) { a in
            HojaCompartir(elementos: [a.url]).presentationDetents([.medium, .large])
        }
    }

    // MARK: grupos

    // Un solo tema por ahora: el coordinador fuerza «bitácora.» (TemaElegido.unico), así que aquí solo se informa.
    // «restablecer apariencia.» vuelve a la letra normal.
    private var apariencia: some View {
        GrupoMenu(titulo: "apariencia.") {
            FilaAjuste(icono: "tema", titulo: "tema.", detalle: "blanco, carbón y naranja coral. más temas, próximamente.") {
                Chip(texto: TemaElegido.unico.nombre, tono: .naranja)
            }
            .accessibilityElement(children: .combine)
            SeparadorMenu()
            IconoAppSelector()
            SeparadorMenu()
            VStack(alignment: .leading, spacing: Medida.s) {
                HStack(spacing: Medida.s) {
                    IconoFila(id: "letra")
                    VStack(alignment: .leading, spacing: 2) {
                        Text("tamaño de letra.").font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                        Text("se suma al tamaño de ios (dynamic type).").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    }
                }
                OpcionesAjuste(opciones: EscalaLetra.allCases.map { ($0, $0.nombre) }, elegida: c.letra) { c.ponerLetra($0) }
            }
            .padding(Medida.rellenoTarjeta)
            if c.letra != .normal {
                SeparadorMenu()
                Button {
                    Haptica.ligera()
                    c.ponerLetra(.normal)
                } label: {
                    FilaAjuste(icono: "letra", titulo: "restablecer apariencia.", detalle: "vuelve a la letra normal.") { EmptyView() }
                }
                .buttonStyle(EstiloFila())
                .transition(.opacity)
            }
        }
        .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: c.letra)
    }

    private var conexiones: some View {
        GrupoMenu(titulo: "conexiones.") {
            NavigationLink { AjustesConectorView().huecoDeBarra() } label: {
                FilaAjuste(icono: "conexiones", titulo: "claude y chatgpt.", detalle: "tu bitácora en tu ia.")
            }.buttonStyle(EstiloFila())
            SeparadorMenu()
            NavigationLink { AjustesAtajoView(tipo: .siri, token: lectura.siriToken).huecoDeBarra() } label: {
                FilaAjuste(icono: "voz", titulo: "siri.", detalle: lectura.siriToken == nil ? "apunta sin abrir la app." : "conectado.")
            }.buttonStyle(EstiloFila())
            SeparadorMenu()
            NavigationLink { AjustesAtajoView(tipo: .correo, token: lectura.correoToken).huecoDeBarra() } label: {
                FilaAjuste(icono: "correo", titulo: "tu correo.", detalle: lectura.correoToken == nil ? "reenvía reservas y pedidos." : "dirección creada.")
            }.buttonStyle(EstiloFila())
            SeparadorMenu()
            NavigationLink { AjustesCalendarioView(version: lectura.feedVersion).huecoDeBarra() } label: {
                FilaAjuste(icono: "calendario", titulo: "calendario en otras apps.", detalle: "google, iphone u outlook (.ics).")
            }.buttonStyle(EstiloFila())
            SeparadorMenu()
            CorreoSemanalFila()
        }
    }

    private var cuenta: some View {
        GrupoMenu(titulo: "cuenta.") {
            NavigationLink { AjustesCuentaView(suscripcion: suscripcion).huecoDeBarra() } label: {
                FilaAjuste(icono: "suscripcion", titulo: "suscripción.", detalle: resumenCuenta)
            }.buttonStyle(EstiloFila())
            SeparadorMenu()
            NavigationLink { AjustesInvitarView().huecoDeBarra() } label: {
                FilaAjuste(icono: "invitar", titulo: "invitar a un amigo.", detalle: "tu código y tu enlace.")
            }.buttonStyle(EstiloFila())
            SeparadorMenu()
            Button { confirmarSalida = true } label: {
                FilaAjuste(icono: "salir", titulo: "cerrar sesión.", detalle: c.sesion?.email) { EmptyView() }
            }.buttonStyle(EstiloFila())
            SeparadorMenu()
            NavigationLink { AjustesEliminarView(exportar: exportar).huecoDeBarra() } label: {
                FilaAjuste(icono: "borrar", titulo: "eliminar mi cuenta.", peligro: true)
            }.buttonStyle(EstiloFila())
        }
    }

    private var datos: some View {
        GrupoMenu(titulo: "datos.") {
            Button { exportar() } label: {
                FilaAjuste(icono: "datos", titulo: "descargar mis datos.", detalle: "una copia completa en json; la web la importa.") {
                    if exportando { ProgressView().tint(Lienzo.tintaSecundaria) }
                }
            }.buttonStyle(EstiloFila()).disabled(exportando)
            SeparadorMenu()
            NavigationLink(value: "estado") {
                FilaAjuste(icono: "estado", titulo: "estado de la sincronización.", detalle: c.pendientes > 0 ? "\(c.pendientes) cambios por subir." : "todo subido.")
            }.buttonStyle(EstiloFila())
        }
    }

    private var avanzado: some View {
        GrupoMenu(titulo: "avanzado.") {
            NavigationLink { MedidasView().huecoDeBarra() } label: {
                FilaAjuste(icono: "estado", titulo: "medidas.", detalle: "lo que tarda la app en este iphone, para copiarlo.")
            }.buttonStyle(EstiloFila())
        }
    }

    private var ayuda: some View {
        VStack(alignment: .leading, spacing: 0) {
            GrupoMenu(titulo: "ayuda.") {
                // 0.23 (auditoría): eran dos filas que abrían lo mismo; la web aún no tiene un enlace a cada guía.
                Button { c.web = URL(string: "https://appbitacora.es/#settings")! } label: {
                    FilaAjuste(icono: "ayuda", titulo: "guías.", detalle: "la de bitácora y la de tu ia, en ajustes de la web.", web: true)
                }.buttonStyle(EstiloFila())
                SeparadorMenu()
                Button { c.web = Config.webURL } label: {
                    FilaAjuste(icono: "web", titulo: "novedades y la web.", detalle: "lo nuevo está en la portada, «actualizaciones.».", web: true)
                }.buttonStyle(EstiloFila())
            }
            PieGrupo(texto: "versión \(Config.version), contrato de datos v\(ContratoDatos.version). la guía y la guía para tu ia están en ajustes de la web.")
        }
    }

    // MARK: lógica

    private var resumenCuenta: String? {
        guard let s = suscripcion else { return nil }
        return AjustesCuentaView.resumen(s)
    }

    private var detalleAvisos: String {
        let n = OperacionesAjustes.avisos.count
        let on = n - OperacionesAjustes.avisos.filter { lectura.avisosApagados.contains($0.tipo) }.count
        return on == n ? "todos los tipos encendidos." : "\(on) de \(n) tipos encendidos."
    }

    private func cargarDocumento() async {
        guard let doc = await c.documentoVisible() else { return }
        guard let nuevo = await ultimaGana({ OperacionesAjustes.leer(doc) }) else { return }
        lectura = nuevo
    }

    private func cargarRemoto() async {
        guard let uid = c.sesion?.userId else { return }
        let perfil = c.entorno.servicios.perfil
        if let d = perfil.guardada(uid) { foto = UIImage(data: d) }
        let servidor = ServidorAjustes(cliente: c.entorno.cliente, auth: c.entorno.auth)
        async let s = servidor.suscripcion(uid)
        async let f = perfil.foto(uid)
        suscripcion = await s
        if let d = await f { foto = UIImage(data: d) }
    }

    private func ponerPerfil(_ p: String) {
        let antes = lectura.perfil
        lectura.perfil = p
        Task {
            if !(await c.ponerAjuste("perfil", [.ponerPerfil(perfil: p)])) { lectura.perfil = antes }
        }
    }

    private func cambiarAvisosIphone(_ v: Bool) {
        Task {
            avisosIphone = await AvisosLocales.activar(v)
            if avisosIphone { c.reconciliarAvisos() }
        }
    }

    private func exportar() {
        guard !exportando else { return }
        exportando = true
        Task {
            defer { exportando = false }
            guard let doc = await c.documentoVisible() else { c.avisar("aún no hay datos en este iphone."); return }
            let ahora = Date()
            let url = await Task.detached(priority: .userInitiated) { () -> URL? in
                let f = DateFormatter()
                f.locale = Locale(identifier: "en_US_POSIX")
                f.dateFormat = "yyyy-MM-dd"
                let datos = doc.aplicandoParche(["exportedAt": .string(ISO8601DateFormatter().string(from: ahora))]).serializado()
                return try? ArchivosTemporales.escribir(datos, como: "bitacora_\(f.string(from: ahora)).json")
            }.value
            if let url { exportado = url } else { c.avisar("no se pudo preparar la copia.") }
        }
    }
}

struct ArchivoExportado: Identifiable {
    let url: URL
    var id: String { url.path }
}

// Cabecera de cuenta: la b. de la marca (o tu foto de `perfiles_fotos`, en blanco y negro como la web), el nombre, el
// correo pequeño y, si lo hay, el resumen de la suscripción en un chip.
struct CabeceraPerfil: View {
    let nombre: String
    let correo: String
    let foto: UIImage?
    let resumen: String?

    private var lado: CGFloat { Medida.iconoGrande + Medida.xs }

    var body: some View {
        HStack(spacing: Medida.s) {
            Group {
                if let foto {
                    Image(uiImage: foto).resizable().scaledToFill().enGrises()
                        .frame(width: lado, height: lado)
                        .clipShape(RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
                } else {
                    LogoB(tamano: lado)
                }
            }
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(nombre.isEmpty ? "tú." : nombre.lowercased() + ".")
                    .font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta).lineLimit(1)
                Text(correo).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1).truncationMode(.middle)
                if let resumen {
                    Chip(texto: resumen, tono: .naranja).padding(.top, Medida.xxs)
                }
            }
            Spacer(minLength: 0)
        }
        .tarjeta()
        .accessibilityElement(children: .combine)
    }
}
