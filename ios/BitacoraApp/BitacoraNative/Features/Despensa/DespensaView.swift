import SwiftUI

private enum PestanaDespensa: Hashable { case lista, recetas, plan }
private enum ModalDespensa: Identifiable {
    case item(ItemDespensa?), receta(RecetaDespensa?), terminar, plato(String), pasar(RecetaDespensa)
    var id: String { switch self { case .item(let x): return "item-\(x?.id ?? "nuevo")"; case .receta(let x): return "receta-\(x?.id ?? "nueva")"; case .terminar: return "terminar"; case .plato(let d): return "plato-\(d)"; case .pasar(let r): return "pasar-\(r.id)" } }
}

// Despensa 2.0 (foto 4: secciones plegables y casillas cuadradas): «despensa.» con el recuento, los segmentos
// lista / recetas / planificación, el campo para añadir arriba, «lo de siempre» en chips y cada sección del súper en su
// tarjeta blanca. Lo marcado baja con un muelle a «en la cesta.», tachado en gris.
struct DespensaView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var vista: VistaDespensa?
    @State private var pestana: PestanaDespensa = .lista
    @State private var modal: ModalDespensa?
    @State private var textoRapido = ""
    @State private var mostrarNuevaLista = false
    @State private var nombreLista = ""
    @State private var listaEditando: ListaDespensa?
    // Agrupado al cargar y al marcar, no en cada pintado: cambiar de hoja no recalcula la lista.
    @State private var grupos: [GrupoDespensa] = []
    @State private var enCarro: [ItemDespensa] = []
    @State private var listaPintada: String?
    // Lo marcado aquí que la lista recargada aún no trae (MarcasDespensa) y la cadena que manda las marcas en orden.
    @State private var marcas = MarcasDespensa()
    @State private var cadena: Task<Void, Never>?
    @State private var cargas = 0
    @State private var ultimaCarga = 0
    @FocusState private var escribiendo: Bool
    // Lo que se acaba de pasar a la cesta, unos segundos.
    @State private var hecho: String?
    // Lo último quitado, unos segundos, para deshacerlo (0.22).
    @State private var quitado: (item: ItemDespensa, listaId: String)?
    @State private var listaABorrar: ListaDespensa?
    @State private var recetaABorrar: RecetaDespensa?
    @State private var plegadas: Set<String> = []
    @State private var verHistorial = false

    private static let claveCesta = "__cesta"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "despensa.", subtitulo: subtitulo) { menuListas }
                    .padding(.bottom, Medida.xxs)
                SegmentoCapsula(opciones: [.init(valor: PestanaDespensa.lista, titulo: "lista"),
                                           .init(valor: PestanaDespensa.recetas, titulo: "recetas"),
                                           .init(valor: PestanaDespensa.plan, titulo: "planificación")],
                                elegido: $pestana, sobreBlanco: false)
                avisos
                if let v = vista {
                    Group {
                        switch pestana {
                        case .lista: lista(v)
                        case .recetas: recetas(v)
                        case .plan: plan(v)
                        }
                    }
                    .id(pestana)
                    .transition(.opacity)
                } else {
                    ProgressView().tint(Lienzo.tintaTerciaria).frame(maxWidth: .infinity).padding(.top, Medida.xl)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: hecho)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: quitado?.item.id)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
        .refreshable { await c.sincronizar() }.task(id: c.revision) { await cargar() }
        .alert(listaEditando == nil ? "nueva lista." : "editar lista.", isPresented: $mostrarNuevaLista) {
            TextField("nombre.", text: $nombreLista)
            Button(listaEditando == nil ? "crear." : "guardar.") { Task { await guardarLista() } }.disabled(nombreLista.trimmingCharacters(in: .whitespaces).isEmpty)
            Button("cancelar.", role: .cancel) { listaEditando = nil }
        }
        .confirmationDialog("¿eliminar la lista «\(listaABorrar?.nombre.lowercased() ?? "")» con lo que tiene?",
                            isPresented: Binding(get: { listaABorrar != nil }, set: { if !$0 { listaABorrar = nil } }), titleVisibility: .visible) {
            Button("eliminar lista.", role: .destructive) { if let l = listaABorrar { Task { await c.guardar(.borrarListaCompra(id: l.id)) } } }
            Button("cancelar.", role: .cancel) {}
        }
        .confirmationDialog("¿eliminar la receta «\(recetaABorrar?.nombre.lowercased() ?? "")»?",
                            isPresented: Binding(get: { recetaABorrar != nil }, set: { if !$0 { recetaABorrar = nil } }), titleVisibility: .visible) {
            Button("eliminar receta.", role: .destructive) { if let r = recetaABorrar { Task { await c.guardar(.borrarRecetaCompra(id: r.id)) } } }
            Button("cancelar.", role: .cancel) {}
        }
        .hoja(item: $modal) { m in
            switch m {
            case .item(let item): EditorItemDespensa(item: item, seccionInicial: item?.seccion ?? "otros") { texto, cantidad, seccion, precio in
                Task { await guardarItem(item, texto, cantidad, seccion, precio) }
            }
            case .receta(let receta): EditorRecetaDespensa(receta: receta) { nombre, raciones, ingredientes, pasos, notas in
                Task { await guardarReceta(receta, nombre, raciones, ingredientes, pasos, notas) }
            }
            case .terminar: TerminarCompraView { tienda, total in Task { await terminar(tienda, total) } }
            case .plato(let dia): EditorPlatoView(dia: dia, recetas: vista?.recetas ?? []) { momento, nombre, receta in
                Task { await guardarPlato(dia, momento, nombre, receta) }
            }
            case .pasar(let r):
                if let l = vista?.listaActual { PasarRecetaView(receta: r, lista: l) { elegidos in Task { await pasarReceta(r, elegidos, a: l) } } }
            }
        }
    }

    // MARK: - Cabecera

    private var porComprar: Int { grupos.reduce(0) { $0 + $1.items.count } }

    private var subtitulo: String? {
        guard let v = vista, let l = v.listaActual else { return vista == nil ? nil : "sin lista todavía." }
        let n = porComprar, k = enCarro.count
        if n == 0 && k == 0 { return "la lista está vacía." }
        var t = (n == 1 ? "1 cosa" : "\(n) cosas") + ", \(k) en la cesta."
        let estimado = LecturaDespensa.estimado(l)
        if estimado > 0 { t += " unos \(Dinero.formato(estimado))." }
        return v.listas.count > 1 ? l.nombre.lowercased() + ". " + t : t
    }

    private var menuListas: some View {
        MenuRedondoDespensa(etiqueta: "listas y acciones") {
            Button("añadir con detalles.") { modal = .item(nil) }
            Button("nueva lista.") { listaEditando = nil; nombreLista = ""; mostrarNuevaLista = true }
            if let actual = vista?.listaActual {
                Button("renombrar «\(actual.nombre.lowercased())».") { listaEditando = actual; nombreLista = actual.nombre; mostrarNuevaLista = true }
                if (vista?.listas.count ?? 0) > 1 { Button("eliminar lista.", role: .destructive) { listaABorrar = actual } }
            }
        }
    }

    // Lo recién hecho y el deshacer, en una tarjeta oscura que entra y sale sola.
    @ViewBuilder private var avisos: some View {
        if let hecho {
            TarjetaOscura {
                Text(hecho).font(Letra.detalle).foregroundStyle(Lienzo.sobreOscuro)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .accessibilityAddTraits(.updatesFrequently)
            .transition(.opacity.combined(with: .offset(y: -6)))
        }
        if let q = quitado {
            TarjetaOscura {
                HStack(spacing: Medida.xs) {
                    Text("quitado «\(q.item.texto.lowercased())».").font(Letra.detalle).foregroundStyle(Lienzo.sobreOscuro).lineLimit(2)
                    Spacer(minLength: Medida.xs)
                    Button("deshacer.") { reponer() }
                        .font(Letra.pieFuerte).foregroundStyle(Lienzo.naranja)
                        .frame(minHeight: Medida.toque)
                        .buttonStyle(.pulsable(0.94))
                }
            }
            .transition(.opacity.combined(with: .offset(y: -6)))
        }
    }

    // MARK: - Lista

    private func lista(_ v: VistaDespensa) -> some View {
        VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
            if v.listas.count > 1 { selectorListas(v) }
            if let l = v.listaActual {
                CampoAnadirDespensa(texto: $textoRapido, placeholder: "añadir: leche, 2 tomates…", foco: $escribiendo) {
                    Task { await anadirRapido() }
                }
                siempre(v)
                if l.items.isEmpty {
                    TarjetaInvitacion(frase: "la lista está vacía.", destacado: "apunta lo que falta.", boton: "añadir.") { escribiendo = true }
                        .transition(.opacity)
                }
                ForEach(grupos, id: \.seccion) { g in
                    tarjetaSeccion(titulo: (LecturaDespensa.nombres[g.seccion] ?? g.seccion) + ".", clave: g.seccion, items: g.items, lista: l)
                        .transition(.opacity.combined(with: .scale(scale: 0.98, anchor: .top)))
                }
                if !enCarro.isEmpty { cesta(l).transition(.opacity.combined(with: .offset(y: 8))) }
                if !v.historial.isEmpty { historial(v) }
            } else {
                TarjetaInvitacion(frase: "aún no tienes ninguna lista.", destacado: "empieza por la de casa.", boton: "crear lista.") {
                    listaEditando = nil; nombreLista = "Casa"; mostrarNuevaLista = true
                }
            }
        }
    }

    private func selectorListas(_ v: VistaDespensa) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Medida.xs) {
                ForEach(v.listas) { l in
                    let on = v.listaActual?.id == l.id
                    Button {
                        guard !on else { return }
                        Haptica.ligera()
                        Task { await c.guardar(.elegirListaCompra(id: l.id)) }
                    } label: {
                        Chip(texto: l.nombre.lowercased() + ".", tono: on ? .oscuro : .blanco)
                            .frame(minHeight: Medida.toque).contentShape(Rectangle())
                    }
                    .buttonStyle(.pulsable(0.94))
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
    }

    // «lo de siempre»: lo frecuente que no está ya por comprar. Un toque lo añade sin tocar lo que estés escribiendo.
    @ViewBuilder private func siempre(_ v: VistaDespensa) -> some View {
        let pendientes = Set(grupos.flatMap { $0.items.map { RecetaALista.clave($0.texto) } })
        let chips = v.frecuentes.filter { !pendientes.contains(RecetaALista.clave($0.texto)) }
        if !chips.isEmpty {
            VStack(alignment: .leading, spacing: Medida.xxs) {
                EtiquetaSeccion(texto: "lo de siempre")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Medida.xs) {
                        ForEach(chips) { f in
                            Button { Task { await anadir(f.texto) } } label: {
                                Chip(texto: "+ " + f.texto.lowercased(), tono: .blanco)
                                    .overlay(Capsule().strokeBorder(Lienzo.filo))
                                    .frame(minHeight: Medida.toque).contentShape(Rectangle())
                            }
                            .buttonStyle(.pulsable(0.92))
                            .accessibilityLabel("añadir \(f.texto)")
                            .transition(.scale(scale: 0.6).combined(with: .opacity))
                        }
                    }
                    .padding(.horizontal, Medida.xxs)
                }
                .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: chips.map(\.id))
            }
        }
    }

    private func abierta(_ clave: String) -> Binding<Bool> {
        Binding(get: { !plegadas.contains(clave) }, set: { if $0 { plegadas.remove(clave) } else { plegadas.insert(clave) } })
    }

    private func tarjetaSeccion(titulo: String, clave: String, items: [ItemDespensa], lista: ListaDespensa) -> some View {
        SeccionPlegable(titulo: titulo, detalle: "\(items.count)", abierta: abierta(clave)) {
            filas(items, lista: lista)
        }
        .tarjeta(relleno: Medida.s)
    }

    private func filas(_ items: [ItemDespensa], lista: ListaDespensa) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { k, i in
                VStack(spacing: 0) {
                    if k > 0 { SeparadorFila(sangria: Medida.toque) }
                    filaItem(i, lista: lista)
                }
                .transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: -10)), removal: .opacity.combined(with: .scale(scale: 0.96))))
            }
        }
    }

    private func cesta(_ l: ListaDespensa) -> some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            SeccionPlegable(titulo: "en la cesta.", detalle: "\(enCarro.count)", abierta: abierta(Self.claveCesta)) {
                filas(enCarro, lista: l)
            }
            Button("terminar la compra.") { modal = .terminar }
                .buttonStyle(.capsula(.oscuro, ancho: true))
        }
        .tarjeta(relleno: Medida.s)
    }

    private func filaItem(_ item: ItemDespensa, lista: ListaDespensa) -> some View {
        let hecho = marcas.hecho(item)
        let detalle = [item.cantidad, item.recetas.isEmpty ? "" : "para " + item.recetas.joined(separator: ", ")].filter { !$0.isEmpty }.joined(separator: ". ")
        return HStack(spacing: Medida.xxs) {
            CasillaMarcar(hecha: hecho) { marcar(item, en: lista) }
            Button { modal = .item(item) } label: {
                HStack(alignment: .firstTextBaseline, spacing: Medida.xs) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.texto).font(Letra.cuerpo)
                            .foregroundStyle(hecho ? Lienzo.tintaTerciaria : Lienzo.tinta)
                            .strikethrough(hecho, color: Lienzo.tintaTerciaria)
                            .multilineTextAlignment(.leading)
                        if !detalle.isEmpty {
                            Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(2)
                                .opacity(hecho ? 0.6 : 1)
                        }
                    }
                    Spacer(minLength: Medida.xs)
                    if let p = item.precio {
                        Text("≈ " + Dinero.formato(p)).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit()
                    }
                }
                .padding(.vertical, Medida.xs)
                .frame(minHeight: Medida.toque)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pulsable(0.98))
        }
        .contextMenu {
            Button(hecho ? "sacar de la cesta." : "a la cesta.") { marcar(item, en: lista) }
            Button("editar.") { modal = .item(item) }
            Button("eliminar.", role: .destructive) { borrar(item, de: lista) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel([item.texto, detalle, item.precio.map { "unos " + Dinero.formato($0) } ?? ""].filter { !$0.isEmpty }.joined(separator: ", "))
        .accessibilityValue(hecho ? "en la cesta" : "por comprar")
        .accessibilityAction(named: hecho ? "sacar de la cesta" : "a la cesta") { marcar(item, en: lista) }
        .accessibilityAction(named: "editar") { modal = .item(item) }
        .accessibilityAction(named: "eliminar") { borrar(item, de: lista) }
    }

    // Marcar: se ve al momento (MarcasDespensa), las operaciones salen en el orden de los toques y solo cambian `hecho`.
    private func marcar(_ visto: ItemDespensa, en listaVista: ListaDespensa) {
        // El producto y su lista, frescos por id: la fila pudo pintarse con una foto anterior.
        let lista = vista?.listas.first { $0.items.contains { $0.id == visto.id } } ?? listaVista
        let item = lista.items.first { $0.id == visto.id } ?? visto
        // Al sacar de la cesta también hay respuesta (marcar ya la tiene en CasillaMarcar).
        if marcas.hecho(item) { Haptica.seleccion() }
        let nuevo = marcas.tocar(item)
        reagrupar(animar: true)
        let op = OperacionesDespensa.marcarOp(listaId: lista.id, id: item.id, hecho: nuevo)
        let previa = cadena
        cadena = Task {
            await previa?.value
            do {
                try await c.encolar(op)
                let r = await c.revisionSync()
                marcas.confirmar(item.id, hecho: nuevo, revision: r)
                marcas.cargado(revision: ultimaCarga)
            } catch {
                marcas.fallo(item.id, hecho: nuevo)
                hecho = "no se pudo guardar en este iPhone."
            }
            reagrupar()
        }
    }

    // Con un toque, o cuando llega un producto nuevo a la misma lista, el cambio va con muelle; al cargar o cambiar de
    // lista, sin animación (las filas no deben bailar).
    private func reagrupar(animar: Bool = false) {
        let actual = vista?.listaActual
        let g = LecturaDespensa.agrupar(actual?.items ?? [], hecho: { marcas.hecho($0) })
        let antes = Set(grupos.flatMap { $0.items.map(\.id) } + enCarro.map(\.id))
        let llegaAlgo = !antes.isEmpty && listaPintada == actual?.id && g.secciones.contains { $0.items.contains { !antes.contains($0.id) } }
        var t = Transaction()
        if animar || llegaAlgo { t.animation = Muelle.o(animar ? Muelle.expandir : Muelle.entrada, reducido: sinMovimiento) } else { t.disablesAnimations = true }
        withTransaction(t) { grupos = g.secciones; enCarro = g.carro; listaPintada = actual?.id }
    }

    private func historial(_ v: VistaDespensa) -> some View {
        SeccionPlegable(titulo: "compras pasadas.", detalle: "\(v.historial.count)", abierta: $verHistorial) {
            VStack(spacing: 0) {
                ForEach(Array(v.historial.enumerated()), id: \.element.id) { k, x in
                    if k > 0 { SeparadorFila(sangria: 0) }
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(x.tienda.isEmpty ? "compra." : x.tienda.lowercased() + ".").font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                            Spacer()
                            Text(Dinero.formato(x.total)).font(Letra.numero).foregroundStyle(Lienzo.tinta)
                        }
                        Text("\(Self.fechaCorta(x.fecha)), \(x.productos) productos, \(x.fuente == "ticket" ? "con ticket" : "a mano")" + (x.sinComprar.isEmpty ? "." : ", \(x.sinComprar.count) faltaron."))
                            .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    }
                    .padding(.vertical, Medida.s)
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .tarjeta(relleno: Medida.s)
    }

    // MARK: - Recetas

    @ViewBuilder private func recetas(_ v: VistaDespensa) -> some View {
        VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
            if v.recetas.isEmpty {
                TarjetaInvitacion(frase: "aún no hay recetas.", destacado: "guárdalas y pasa sus ingredientes en un toque.", boton: "nueva receta.") { modal = .receta(nil) }
            } else {
                EtiquetaSeccion(texto: v.recetas.count == 1 ? "1 receta" : "\(v.recetas.count) recetas", accion: (titulo: "+ receta.", hacer: { modal = .receta(nil) }))
                let precios = DespensaCoste.precios(v.listas)
                ForEach(Array(v.recetas.enumerated()), id: \.element.id) { n, r in
                    tarjetaReceta(r, v, precios: precios).entradaEscalonada(n)
                }
            }
        }
    }

    private func tarjetaReceta(_ r: RecetaDespensa, _ v: VistaDespensa, precios: [String: Decimal]) -> some View {
        let ya = RecetaALista.yaEsta(r, en: v.listaActual).count
        let coste = DespensaCoste.receta(r, precios: precios)
        let meta = "\(r.raciones) \(r.raciones == 1 ? "ración" : "raciones"), \(r.ingredientes.count) ingredientes" + (ya > 0 ? ", \(ya) ya en la lista." : ".")
        return VStack(alignment: .leading, spacing: Medida.s) {
            HStack(alignment: .top, spacing: Medida.xs) {
                Button { modal = .receta(r) } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.nombre.lowercased() + ".").font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta).multilineTextAlignment(.leading)
                        Text(meta).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    }
                    .frame(maxWidth: .infinity, minHeight: Medida.toque, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.pulsable(0.98))
                MenuRedondoDespensa(etiqueta: "acciones para \(r.nombre)", suelto: true) {
                    Button("editar.") { modal = .receta(r) }
                    Button("eliminar receta.", role: .destructive) { recetaABorrar = r }
                }
            }
            if !r.ingredientes.isEmpty {
                Text(r.ingredientes.map { [$0.cantidad, $0.texto].filter { !$0.isEmpty }.joined(separator: " ") }.joined(separator: ", "))
                    .font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(2)
            }
            HStack(alignment: .center, spacing: Medida.s) {
                if let coste {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("COSTE").font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.tintaTerciaria)
                        Text("≈ " + Dinero.formato(coste.total)).font(Letra.numero).foregroundStyle(Lienzo.tinta)
                        if coste.conPrecio < Set(r.ingredientes.map { RecetaALista.clave($0.texto) }).count {
                            Text("con \(coste.conPrecio) precios apuntados.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
                Spacer(minLength: Medida.xs)
                Button("a la lista.") { modal = .pasar(r) }
                    .buttonStyle(.capsula)
                    .disabled(r.ingredientes.isEmpty || v.listaActual == nil)
            }
        }
        .tarjeta()
    }

    // MARK: - Planificación

    private func plan(_ v: VistaDespensa) -> some View {
        let hoy = CalendarioBitacora.madrid.dia(de: Date())
        let semana = semanaActual()
        let hayIngredientes = semana.contains { !(v.plan[$0.iso] ?? []).flatMap(\.ingredientes).isEmpty }
        return VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
            EtiquetaSeccion(texto: "de lunes a domingo")
            ForEach(Array(semana.enumerated()), id: \.element) { n, dia in
                tarjetaDia(dia, platos: v.plan[dia.iso] ?? [], esHoy: dia == hoy).entradaEscalonada(n)
            }
            Button("pasar lo que falta a la lista.") { Task { await planALista(v) } }
                .buttonStyle(.capsula(.oscuro, ancho: true))
                .disabled(v.listaActual == nil || !hayIngredientes)
                .padding(.top, Medida.xs)
        }
    }

    private func tarjetaDia(_ dia: LocalDay, platos: [PlatoPlan], esHoy: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: Medida.xs) {
                Text(etiquetaDia(dia)).font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta)
                if esHoy { Chip(texto: "hoy", tono: .naranja) }
                Spacer()
                Button("+ plato.") { modal = .plato(dia.iso) }
                    .font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
                    .frame(minHeight: Medida.toque)
                    .buttonStyle(.pulsable(0.94))
                    .accessibilityLabel("añadir plato el \(etiquetaDia(dia))")
            }
            ForEach(platos) { p in
                SeparadorFila(sangria: 0)
                HStack(spacing: Medida.xs) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.nombre).font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                        if !p.momento.isEmpty { Text(p.momento + ".").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) }
                    }
                    Spacer()
                    Button { Task { await c.guardar(.borrarPlatoCompra(dia: dia.iso, id: p.id)) } } label: {
                        Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Lienzo.tintaTerciaria)
                            .frame(width: Medida.toque, height: Medida.toque).contentShape(Rectangle())
                    }
                    .buttonStyle(.pulsable(0.85))
                    .accessibilityLabel("quitar \(p.nombre)")
                }
                .padding(.vertical, Medida.xxs)
            }
        }
        .tarjeta(relleno: Medida.s)
    }

    // MARK: - Datos (igual que antes)

    private func cargar() async {
        cargas += 1
        let n = cargas
        let (d, rev) = await c.documentoVisibleConRevision()
        let v = await Task.detached { d.map { LecturaDespensa.vista($0) } }.value
        // Una carga más nueva ya salió: esta trae datos de antes y no debe pisarla.
        guard n == cargas, !Task.isCancelled else { return }
        vista = v
        ultimaCarga = rev
        marcas.cargado(revision: rev)
        reagrupar()
    }
    private func guardarLista() async { let n = nombreLista, previa = listaEditando; nombreLista = ""; listaEditando = nil; if !(await c.guardar(.guardarListaCompra(id: previa?.id ?? OperacionBitacora.nuevoIdProyecto("lista"), nombre: n))) { nombreLista = n; listaEditando = previa } }
    @discardableResult private func anadir(_ t: String) async -> Bool {
        guard let l = vista?.listaActual, !t.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        let ok = await c.guardar(.anadirCompra(listaId: l.id, textos: [t], ids: [OperacionBitacora.nuevoIdProyecto("cmp")]))
        if ok { Haptica.ligera() }
        return ok
    }
    // El tick del teclado añade y cierra el teclado (0.22: antes volvía a enfocar el campo y no se cerraba).
    private func anadirRapido() async { let t = textoRapido; textoRapido = ""; if !(await anadir(t)), textoRapido.isEmpty { textoRapido = t } }
    private func guardarItem(_ previo: ItemDespensa?, _ texto: String, _ cantidad: String, _ seccion: String, _ precio: String) async { guard let l = vista?.listaActual else { return }; await c.guardar(OperacionesDespensa.editarOp(listaId: l.id, id: previo?.id ?? OperacionBitacora.nuevoIdProyecto("cmp"), texto: texto, cantidad: cantidad, seccion: seccion, precio: precio.isEmpty ? nil : precio)) }
    private func borrar(_ item: ItemDespensa, de lista: ListaDespensa) {
        quitado = (item, lista.id)
        Task {
            guard await c.guardar(.borrarItemCompra(listaId: lista.id, id: item.id)) else { if quitado?.item.id == item.id { quitado = nil }; return }
            try? await Task.sleep(for: .seconds(6))
            if quitado?.item.id == item.id { quitado = nil }
        }
    }
    // Vuelve con su id, cantidad, precio, recetas y marca.
    private func reponer() {
        guard let q = quitado else { return }
        quitado = nil
        let i = q.item
        Task { await c.guardar(.guardarItemCompra(listaId: q.listaId, id: i.id, texto: i.texto, cantidad: i.cantidad, seccion: i.seccion,
                                                       precio: i.precio.map { NSDecimalNumber(decimal: $0).stringValue }, hecho: i.hecho, recetas: i.recetas)) }
    }
    private func guardarReceta(_ r: RecetaDespensa?, _ nombre: String, _ raciones: Int, _ ingredientes: [String], _ pasos: [String], _ notas: String) async { await c.guardar(.guardarRecetaCompra(id: r?.id ?? OperacionBitacora.nuevoIdProyecto("rec"), nombre: nombre, raciones: raciones, ingredientes: ingredientes, pasos: pasos, notas: notas)) }
    private func pasarReceta(_ r: RecetaDespensa, _ elegidos: [IngredienteReceta], a l: ListaDespensa) async {
        let ya = RecetaALista.yaEsta(r, en: l)
        let nuevos = elegidos.filter { !ya.contains($0.texto) }, anotados = elegidos.filter { ya.contains($0.texto) }
        do {
            try await c.encolar(RecetaALista.operacion(listaId: l.id, receta: r, elegidos: elegidos))
            var t = nuevos.isEmpty ? "ya tenías todo en la lista." : "\(nuevos.count) \(nuevos.count == 1 ? "ingrediente" : "ingredientes") a «\(l.nombre.lowercased())»: \(nuevos.map { $0.texto.lowercased() }.joined(separator: ", "))."
            if !anotados.isEmpty && !nuevos.isEmpty { t += " ya estaban: \(anotados.map { $0.texto.lowercased() }.joined(separator: ", "))." }
            hecho = t
            Haptica.exito()
            try? await Task.sleep(for: .seconds(5))
            if hecho == t { hecho = nil }
        } catch { hecho = "no se pudo guardar en este iPhone." }
    }
    static func fechaCorta(_ iso: String) -> String {
        guard let d = LocalDay(iso: iso) else { return iso }
        return "\(d.day) " + ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.month - 1]
    }
    private func guardarPlato(_ dia: String, _ momento: String, _ nombre: String, _ receta: RecetaDespensa?) async { await c.guardar(.guardarPlatoCompra(dia: dia, id: OperacionBitacora.nuevoIdProyecto("plato"), momento: momento, nombre: nombre, recetaId: receta?.id, ingredientes: receta?.ingredientes.map(\.texto) ?? [])) }
    // 3.2: la Despensa nunca toca Finanzas (pedido de Alejandro): terminar la compra guarda el historial y nada más; el
    // gasto llega con el extracto del banco.
    private func terminar(_ tienda: String, _ total: String) async { guard let l = vista?.listaActual else { return }; let id = OperacionBitacora.nuevoIdProyecto("compra"); let hoy = CalendarioBitacora.madrid.dia(de: Date()).iso; await c.guardar(.terminarCompra(listaId: l.id, compraId: id, fecha: hoy, tienda: tienda, total: total, txId: nil)) }
    private func planALista(_ v: VistaDespensa) async { guard let l = v.listaActual else { return }; let textos = semanaActual().flatMap { v.plan[$0.iso] ?? [] }.flatMap(\.ingredientes); let presentes = Set(l.items.filter { !$0.hecho }.map { RecetaALista.clave($0.texto) }); var vistos = Set<String>(); let faltan = textos.filter { let k = RecetaALista.clave($0); return !presentes.contains(k) && vistos.insert(k).inserted }; await c.guardar(.anadirCompra(listaId: l.id, textos: faltan, ids: faltan.map { _ in OperacionBitacora.nuevoIdProyecto("cmp") })) }
    private func semanaActual() -> [LocalDay] { CalendarioBitacora.madrid.dia(de: Date()).semanaLunesDomingo }
    private func etiquetaDia(_ d: LocalDay) -> String { let n = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]; return n[d.indiceSemanaLunes] + " \(d.day)." }
}

private struct EditorItemDespensa: View {
    @Environment(\.dismiss) private var cerrar; let guardar: (String, String, String, String) -> Void
    @State private var texto: String; @State private var cantidad: String; @State private var seccion: String; @State private var precio: String
    init(item: ItemDespensa?, seccionInicial: String, guardar: @escaping (String, String, String, String) -> Void) { self.guardar = guardar; _texto = State(initialValue: item?.texto ?? ""); _cantidad = State(initialValue: item?.cantidad ?? ""); _seccion = State(initialValue: seccionInicial); _precio = State(initialValue: item?.precio.map { NSDecimalNumber(decimal: $0).stringValue } ?? "") }
    var body: some View { NavigationStack { FormCasa { TextField("producto.", text: $texto); TextField("cantidad.", text: $cantidad); Picker("sección.", selection: $seccion) { ForEach(LecturaDespensa.secciones, id: \.self) { Text((LecturaDespensa.nombres[$0] ?? $0) + ".").tag($0) } }; TextField("precio estimado.", text: $precio).keyboardType(.decimalPad) }.formularioCasa().navigationTitle("producto.").toolbar { ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }; ToolbarItem(placement: .confirmationAction) { Button("guardar.") { guardar(texto, cantidad, seccion, precio); cerrar() }.disabled(texto.trimmingCharacters(in: .whitespaces).isEmpty) } } } }
}
private struct EditorRecetaDespensa: View {
    @Environment(\.dismiss) private var cerrar; let guardar: (String, Int, [String], [String], String) -> Void
    @State private var nombre: String; @State private var raciones: Int; @State private var ingredientes: String; @State private var pasos: String; @State private var notas: String
    @State private var descartar = false
    private let original: String
    init(receta: RecetaDespensa?, guardar: @escaping (String, Int, [String], [String], String) -> Void) {
        self.guardar = guardar
        let n = receta?.nombre ?? "", r = receta?.raciones ?? 2, p = receta?.pasos.joined(separator: "\n") ?? "", no = receta?.notas ?? ""
        let i = receta?.ingredientes.map { $0.cantidad + "|" + $0.texto }.joined(separator: "\n") ?? ""
        _nombre = State(initialValue: n); _raciones = State(initialValue: r); _ingredientes = State(initialValue: i); _pasos = State(initialValue: p); _notas = State(initialValue: no)
        original = Self.clave(n, r, i, p, no)
    }
    private static func clave(_ n: String, _ r: Int, _ i: String, _ p: String, _ no: String) -> String { [n, String(r), i, p, no].joined(separator: "\u{1}") }
    // B10: el borrador frente a la receta que se abrió.
    private var cambiado: Bool { Self.clave(nombre, raciones, ingredientes, pasos, notas) != original }
    var body: some View {
        NavigationStack {
            FormCasa { TextField("nombre.", text: $nombre); Stepper("\(raciones) raciones.", value: $raciones, in: 1...24); Section("ingredientes, uno por línea.") { TextEditor(text: $ingredientes).editorCasa(alto: 130) }; Section("pasos, uno por línea.") { TextEditor(text: $pasos).editorCasa(alto: 110) }; TextField("notas.", text: $notas, axis: .vertical) }
                .formularioCasa().navigationTitle("receta.")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { if cambiado { descartar = true } else { cerrar() } } }; ToolbarItem(placement: .confirmationAction) { Button("guardar.") { guardar(nombre, raciones, ingredientes.components(separatedBy: .newlines).filter { !$0.isEmpty }, pasos.components(separatedBy: .newlines).filter { !$0.isEmpty }, notas); cerrar() }.disabled(nombre.isEmpty) } }
                .preguntarAlDescartar(cambiado, preguntar: $descartar) { cerrar() }
        }
    }
}
private struct TerminarCompraView: View {
    @Environment(\.dismiss) private var cerrar; let guardar: (String, String) -> Void; @State private var tienda = ""; @State private var total = ""
    var body: some View { NavigationStack { FormCasa { TextField("tienda.", text: $tienda); TextField("total real.", text: $total).keyboardType(.decimalPad) }.formularioCasa().navigationTitle("terminar compra.").toolbar { ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }; ToolbarItem(placement: .confirmationAction) { Button("terminar.") { guardar(tienda, total); cerrar() } } } } }
}
private struct EditorPlatoView: View {
    @Environment(\.dismiss) private var cerrar; let dia: String; let recetas: [RecetaDespensa]; let guardar: (String, String, RecetaDespensa?) -> Void; @State private var momento = "comida"; @State private var nombre = ""; @State private var recetaId = ""
    var body: some View { NavigationStack { FormCasa { Picker("momento.", selection: $momento) { ForEach(["desayuno", "comida", "merienda", "cena"], id: \.self) { Text($0 + ".").tag($0) } }; if !recetas.isEmpty { Picker("receta.", selection: $recetaId) { Text("escrito a mano.").tag(""); ForEach(recetas) { Text($0.nombre).tag($0.id) } }.onChange(of: recetaId) { _, id in if let r = recetas.first(where: { $0.id == id }) { nombre = r.nombre } } }; TextField("plato.", text: $nombre) }.formularioCasa().navigationTitle(dia).toolbar { ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }; ToolbarItem(placement: .confirmationAction) { Button("guardar.") { guardar(momento, nombre, recetas.first { $0.id == recetaId }); cerrar() }.disabled(nombre.isEmpty) } } } }
}
