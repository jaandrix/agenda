import SwiftUI

private struct GrupoDespensa: Sendable { let seccion: String; let items: [ItemDespensa] }
private enum PestanaDespensa: String, CaseIterable, Identifiable { case lista, historial, recetas, plan; var id: String { rawValue } }
private enum ModalDespensa: Identifiable {
    case item(ItemDespensa?), receta(RecetaDespensa?), terminar, plato(String), pasar(RecetaDespensa)
    var id: String { switch self { case .item(let x): return "item-\(x?.id ?? "nuevo")"; case .receta(let x): return "receta-\(x?.id ?? "nueva")"; case .terminar: return "terminar"; case .plato(let d): return "plato-\(d)"; case .pasar(let r): return "pasar-\(r.id)" } }
}

struct DespensaView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaDespensa?
    @State private var pestana: PestanaDespensa = .lista
    @State private var modal: ModalDespensa?
    @State private var textoRapido = ""
    @State private var mostrarNuevaLista = false
    @State private var nombreLista = ""
    @State private var listaEditando: ListaDespensa?
    // Agrupado una vez por versión de los datos, no en cada pintado: cambiar de hoja no recalcula la lista.
    @State private var grupos: [GrupoDespensa] = []
    @State private var enCarro: [ItemDespensa] = []
    @FocusState private var escribiendo: Bool
    // Lo que se acaba de pasar a la cesta, unos segundos.
    @State private var hecho: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                CabeceraContexto(titulo: "despensa", detalle: detalleCabecera) {
                    if let l = vista?.listaActual {
                        Text(l.nombre.lowercased() + ".").font(Tipo.poppins(24, .bold, estilo: .title3)).foregroundStyle(Paleta.sobreContexto)
                        Text("\(l.items.filter { !$0.hecho }.count) por comprar. aprox. \(Dinero.formato(LecturaDespensa.estimado(l)))")
                            .font(Tipo.pie).foregroundStyle(Paleta.sobreContextoSuave).padding(.top, 2)
                    }
                }
                LazyVStack(alignment: .leading, spacing: 0) {
                    selector
                    if let hecho {
                        Text(hecho).font(Tipo.pie).foregroundStyle(Paleta.texto)
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Paleta.tinteAcento, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .padding(.bottom, Espacio.s)
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                    if let v = vista {
                        switch pestana {
                        case .lista: lista(v)
                        case .historial: historial(v)
                        case .recetas: recetas(v)
                        case .plan: plan(v)
                        }
                    } else { ProgressView().frame(maxWidth: .infinity).padding(.top, Espacio.xl) }
                }.modifier(HojaContenido())
            }
        }
        .background(Paleta.fondo.ignoresSafeArea()).scrollIndicators(.hidden)
        .refreshable { await c.sincronizar() }.task(id: c.informe.revision) { await cargar() }
        .alert(listaEditando == nil ? "nueva lista." : "editar lista.", isPresented: $mostrarNuevaLista) {
            TextField("nombre.", text: $nombreLista)
            Button(listaEditando == nil ? "crear." : "guardar.") { Task { await guardarLista() } }.disabled(nombreLista.trimmingCharacters(in: .whitespaces).isEmpty)
            Button("cancelar.", role: .cancel) { listaEditando = nil }
        }
        .sheet(item: $modal) { m in
            switch m {
            case .item(let item): EditorItemDespensa(item: item, seccionInicial: item?.seccion ?? "otros") { texto, cantidad, seccion, precio in
                Task { await guardarItem(item, texto, cantidad, seccion, precio) }
            }
            case .receta(let receta): EditorRecetaDespensa(receta: receta) { nombre, raciones, ingredientes, pasos, notas in
                Task { await guardarReceta(receta, nombre, raciones, ingredientes, pasos, notas) }
            }
            case .terminar: TerminarCompraView { tienda, total, finanzas in Task { await terminar(tienda, total, finanzas) } }
            case .plato(let dia): EditorPlatoView(dia: dia, recetas: vista?.recetas ?? []) { momento, nombre, receta in
                Task { await guardarPlato(dia, momento, nombre, receta) }
            }
            case .pasar(let r):
                if let l = vista?.listaActual { PasarRecetaView(receta: r, lista: l) { elegidos in Task { await pasarReceta(r, elegidos, a: l) } } }
        }
        }
    }

    private var detalleCabecera: String? { vista.map { "\($0.listas.count) listas. \($0.recetas.count) recetas." } }
    // Las cuatro hojas a todo el ancho, de 44 pt y sin animación: el cambio es inmediato.
    private var selector: some View {
        HStack(spacing: 4) {
            ForEach(PestanaDespensa.allCases) { p in
                Button { var t = Transaction(); t.disablesAnimations = true; withTransaction(t) { pestana = p } } label: {
                    Text(p.rawValue + ".").font(Tipo.poppins(14, pestana == p ? .semibold : .medium, estilo: .footnote))
                        .lineLimit(1).minimumScaleFactor(0.8)
                        .foregroundStyle(pestana == p ? Paleta.sobreAcento : Paleta.texto)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(pestana == p ? Paleta.acento : Color.clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(pestana == p ? [.isSelected] : [])
            }
        }
        .padding(4)
        .background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.vertical, Espacio.s)
    }

    private func lista(_ v: VistaDespensa) -> some View {
        LazyVStack(alignment: .leading, spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: Espacio.xs) {
                ForEach(v.listas) { l in Button { Task { try? await c.encolar(.elegirListaCompra(id: l.id)) } } label: {
                    Text(l.nombre.lowercased() + ".").font(Tipo.pie).padding(.horizontal, 12).frame(minHeight: 44)
                        .foregroundStyle(v.listaActual?.id == l.id ? Paleta.texto : Paleta.textoSecundario)
                        .background(v.listaActual?.id == l.id ? Paleta.tinteTexto : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .contentShape(Rectangle()) }.buttonStyle(.plain) }
                Button("+ lista.") { listaEditando = nil; nombreLista = ""; mostrarNuevaLista = true }.font(Tipo.pie).buttonStyle(.plain).foregroundStyle(Paleta.acento).frame(minHeight: 44)
                if let actual = v.listaActual {
                    Menu("acciones.") {
                        Button("renombrar.") { listaEditando = actual; nombreLista = actual.nombre; mostrarNuevaLista = true }
                        if v.listas.count > 1 { Button("eliminar lista.", role: .destructive) { Task { try? await c.encolar(.borrarListaCompra(id: actual.id)) } } }
                    }.font(Tipo.pie)
                }
            } }
            HStack(spacing: Espacio.s) {
                TextField("añadir a la lista.", text: $textoRapido, prompt: Text("añadir a la lista: leche, 2 tomates…").foregroundColor(Paleta.textoSecundario))
                    .font(Tipo.cuerpo).foregroundStyle(Paleta.texto).submitLabel(.done).focused($escribiendo)
                    .onSubmit { Task { await anadirRapido(); escribiendo = true } }
                    .campoCasa(activo: escribiendo)
                Button { Task { await anadirRapido() } } label: {
                    Text("añadir.").font(Tipo.poppins(14, .semibold, estilo: .footnote)).foregroundStyle(Paleta.sobreAcento)
                        .padding(.horizontal, 14).frame(minHeight: 48)
                        .background(Paleta.acento, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(textoRapido.trimmingCharacters(in: .whitespaces).isEmpty)
                .opacity(textoRapido.trimmingCharacters(in: .whitespaces).isEmpty ? 0.5 : 1)
            }.padding(.vertical, Espacio.s)
            if !v.frecuentes.isEmpty {
                CabeceraSeccion(titulo: "lo de siempre.")
                ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: Espacio.xs) { ForEach(v.frecuentes) { f in
                    Button { textoRapido = f.texto; Task { await anadirRapido() } } label: {
                        Text("+ " + f.texto.lowercased()).font(Tipo.pie).foregroundStyle(Paleta.texto)
                            .padding(.horizontal, 12).frame(minHeight: 40)
                            .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Paleta.borde, lineWidth: 1))
                    }.buttonStyle(.plain).accessibilityLabel("añadir \(f.texto)")
                } }.padding(.vertical, 2) }
            }
            if let l = v.listaActual {
                ForEach(grupos, id: \.seccion) { g in
                    CabeceraSeccion(titulo: (LecturaDespensa.nombres[g.seccion] ?? g.seccion) + ".")
                    ForEach(g.items) { filaItem($0, lista: l) }
                }
                let hechos = enCarro
                if !hechos.isEmpty { CabeceraSeccion(titulo: "en el carro.", detalle: "\(hechos.count)")
                    ForEach(hechos) { filaItem($0, lista: l) }
                    Button("terminar la compra.") { modal = .terminar }.buttonStyle(BotonPrincipal()).padding(.top, Espacio.m)
                }
                if l.items.isEmpty { Text("apunta lo que falta. se ordenará por secciones.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.l) }
            }
        }
    }

    private func filaItem(_ item: ItemDespensa, lista: ListaDespensa) -> some View {
        HStack(spacing: Espacio.s) {
            BitacoraCheck(hecho: item.hecho) { Task { try? await c.encolar(.guardarItemCompra(listaId: lista.id, id: item.id, texto: item.texto, cantidad: item.cantidad, seccion: item.seccion, precio: item.precio.map { NSDecimalNumber(decimal: $0).stringValue }, hecho: !item.hecho, recetas: item.recetas)) } }
            Button { modal = .item(item) } label: { VStack(alignment: .leading, spacing: 2) {
                Text(item.texto).font(Tipo.cuerpoFuerte).foregroundStyle(item.hecho ? Paleta.textoSecundario : Paleta.texto).strikethrough(item.hecho)
                Text([item.cantidad, item.recetas.isEmpty ? nil : "para " + item.recetas.joined(separator: ", ")].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ". "))
                    .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
            }.frame(maxWidth: .infinity, alignment: .leading) }.buttonStyle(.plain)
            if let p = item.precio { Text("≈ " + Dinero.formato(p)).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
            Menu {
                Button("editar.") { modal = .item(item) }
                Button("eliminar.", role: .destructive) { borrar(item, de: lista) }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Paleta.textoSecundario)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("acciones para \(item.texto)")
        }.frame(minHeight: 52).overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
            .contextMenu {
                Button("editar.") { modal = .item(item) }
                Button("eliminar.", role: .destructive) { borrar(item, de: lista) }
            }
            .accessibilityAction(named: "eliminar") { borrar(item, de: lista) }
    }

    private func historial(_ v: VistaDespensa) -> some View { LazyVStack(alignment: .leading, spacing: 0) {
        CabeceraSeccion(titulo: "historial.", detalle: "\(v.historial.count)")
        if v.historial.isEmpty { Text("aquí aparecerán las compras terminadas y los tickets.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.l) }
        ForEach(v.historial) { x in VStack(alignment: .leading, spacing: 3) { HStack { Text(x.tienda.isEmpty ? "compra." : x.tienda.lowercased() + ".").font(Tipo.cuerpoFuerte); Spacer(); Text(Dinero.formato(x.total)).font(Tipo.cuerpoFuerte).monospacedDigit() }
            Text("\(Self.fechaCorta(x.fecha)), \(x.productos) productos, \(x.fuente == "ticket" ? "con ticket" : "a mano")" + (x.sinComprar.isEmpty ? "." : ", \(x.sinComprar.count) faltaron."))
                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }.padding(.vertical, 10).overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) } }
    } }

    private func recetas(_ v: VistaDespensa) -> some View { LazyVStack(alignment: .leading, spacing: 0) {
        HStack { CabeceraSeccion(titulo: "recetas.", detalle: "\(v.recetas.count)"); Spacer(); AccionTexto(texto: "+ receta.") { modal = .receta(nil) } }
        if v.recetas.isEmpty { Text("guarda tus recetas y pasa sus ingredientes a la cesta en un toque.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.l) }
        ForEach(v.recetas) { r in
            let ya = RecetaALista.yaEsta(r, en: v.listaActual).count
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Button { modal = .receta(r) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.nombre.lowercased() + ".").font(Tipo.poppins(17, .semibold, estilo: .body)).foregroundStyle(Paleta.texto)
                            Text("\(r.raciones) raciones, \(r.ingredientes.count) ingredientes" + (ya > 0 ? ", \(ya) ya en la lista." : "."))
                                .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario)
                        }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                    }.buttonStyle(.plain)
                    Menu {
                        Button("editar.") { modal = .receta(r) }
                        Button("eliminar receta.", role: .destructive) { Task { try? await c.encolar(.borrarRecetaCompra(id: r.id)) } }
                    } label: { Image(systemName: "ellipsis").font(.system(size: 17, weight: .semibold)).foregroundStyle(Paleta.textoSecundario).frame(width: 44, height: 44) }
                    .accessibilityLabel("acciones para \(r.nombre)")
                }
                Text(r.ingredientes.map { [$0.cantidad, $0.texto].filter { !$0.isEmpty }.joined(separator: " ") }.joined(separator: ", "))
                    .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).lineLimit(3)
                Button { modal = .pasar(r) } label: {
                    Text("pasar a la cesta.").font(Tipo.poppins(14, .semibold, estilo: .footnote)).foregroundStyle(Paleta.acento)
                        .padding(.horizontal, 12).frame(minHeight: 40)
                        .background(Paleta.tinteAcento, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }.buttonStyle(.plain).disabled(r.ingredientes.isEmpty || v.listaActual == nil)
            }
            .padding(14)
            .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Paleta.borde, lineWidth: 1))
            .padding(.vertical, 5)
        }
    } }

    private func plan(_ v: VistaDespensa) -> some View { VStack(alignment: .leading, spacing: 0) {
        CabeceraSeccion(titulo: "planificación.", detalle: "lunes a domingo")
        ForEach(semanaActual(), id: \.self) { dia in VStack(alignment: .leading, spacing: 4) { HStack { Text(etiquetaDia(dia)).font(Tipo.cuerpoFuerte); Spacer(); Button("+ plato.") { modal = .plato(dia.iso) }.font(Tipo.pie).buttonStyle(.plain) }
            ForEach(v.plan[dia.iso] ?? []) { p in HStack { VStack(alignment: .leading) { Text(p.nombre).font(Tipo.cuerpo); if !p.momento.isEmpty { Text(p.momento).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) } }; Spacer(); Button(role: .destructive) { Task { try? await c.encolar(.borrarPlatoCompra(dia: dia.iso, id: p.id)) } } label: { Image(systemName: "trash") }.buttonStyle(.plain) } }
        }.padding(.vertical, 8).overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) } }
        Button("pasar ingredientes que faltan a la lista.") { Task { await planALista(v) } }.buttonStyle(BotonPrincipal()).padding(.top, Espacio.m)
    } }

    private func cargar() async {
        let d = await c.documentoVisible()
        let (v, g, h) = await Task.detached { () -> (VistaDespensa?, [GrupoDespensa], [ItemDespensa]) in
            guard let v = d.map({ LecturaDespensa.vista($0) }) else { return (nil, [], []) }
            let items = v.listaActual?.items ?? []
            var porSeccion: [String: [ItemDespensa]] = [:]
            for i in items where !i.hecho { porSeccion[i.seccion.isEmpty ? "otros" : i.seccion, default: []].append(i) }
            let g = LecturaDespensa.secciones.compactMap { s in porSeccion[s].map { GrupoDespensa(seccion: s, items: $0) } }
                + porSeccion.keys.filter { !LecturaDespensa.secciones.contains($0) }.sorted().map { GrupoDespensa(seccion: $0, items: porSeccion[$0]!) }
            return (v, g, items.filter(\.hecho))
        }.value
        vista = v; grupos = g; enCarro = h
    }
    private func guardarLista() async { let n = nombreLista, previa = listaEditando; nombreLista = ""; listaEditando = nil; try? await c.encolar(.guardarListaCompra(id: previa?.id ?? OperacionBitacora.nuevoIdProyecto("lista"), nombre: n)) }
    private func anadirRapido() async { guard let l = vista?.listaActual else { return }; let t = textoRapido; textoRapido = ""; try? await c.encolar(.anadirCompra(listaId: l.id, textos: [t], ids: [OperacionBitacora.nuevoIdProyecto("cmp")])) }
    private func guardarItem(_ previo: ItemDespensa?, _ texto: String, _ cantidad: String, _ seccion: String, _ precio: String) async { guard let l = vista?.listaActual else { return }; try? await c.encolar(.guardarItemCompra(listaId: l.id, id: previo?.id ?? OperacionBitacora.nuevoIdProyecto("cmp"), texto: texto, cantidad: cantidad, seccion: seccion, precio: precio.isEmpty ? nil : precio, hecho: previo?.hecho ?? false, recetas: previo?.recetas ?? [])) }
    private func borrar(_ item: ItemDespensa, de lista: ListaDespensa) {
        Task { try? await c.encolar(.borrarItemCompra(listaId: lista.id, id: item.id)) }
    }
    private func guardarReceta(_ r: RecetaDespensa?, _ nombre: String, _ raciones: Int, _ ingredientes: [String], _ pasos: [String], _ notas: String) async { try? await c.encolar(.guardarRecetaCompra(id: r?.id ?? OperacionBitacora.nuevoIdProyecto("rec"), nombre: nombre, raciones: raciones, ingredientes: ingredientes, pasos: pasos, notas: notas)) }
    private func pasarReceta(_ r: RecetaDespensa, _ elegidos: [IngredienteReceta], a l: ListaDespensa) async {
        let ya = RecetaALista.yaEsta(r, en: l)
        let nuevos = elegidos.filter { !ya.contains($0.texto) }, anotados = elegidos.filter { ya.contains($0.texto) }
        do {
            try await c.encolar(RecetaALista.operacion(listaId: l.id, receta: r, elegidos: elegidos))
            var t = nuevos.isEmpty ? "ya tenías todo en la lista." : "\(nuevos.count) \(nuevos.count == 1 ? "ingrediente" : "ingredientes") a «\(l.nombre.lowercased())»: \(nuevos.map { $0.texto.lowercased() }.joined(separator: ", "))."
            if !anotados.isEmpty && !nuevos.isEmpty { t += " ya estaban: \(anotados.map { $0.texto.lowercased() }.joined(separator: ", "))." }
            hecho = t
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            try? await Task.sleep(for: .seconds(5))
            if hecho == t { hecho = nil }
        } catch { hecho = "no se pudo guardar en este iPhone." }
    }
    static func fechaCorta(_ iso: String) -> String {
        guard let d = LocalDay(iso: iso) else { return iso }
        return "\(d.day) " + ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.month - 1]
    }
    private func guardarPlato(_ dia: String, _ momento: String, _ nombre: String, _ receta: RecetaDespensa?) async { try? await c.encolar(.guardarPlatoCompra(dia: dia, id: OperacionBitacora.nuevoIdProyecto("plato"), momento: momento, nombre: nombre, recetaId: receta?.id, ingredientes: receta?.ingredientes.map(\.texto) ?? [])) }
    private func terminar(_ tienda: String, _ total: String, _ finanzas: Bool) async { guard let l = vista?.listaActual else { return }; let id = OperacionBitacora.nuevoIdProyecto("compra"), tx = finanzas ? OperacionBitacora.nuevoIdMovimiento() : nil; let hoy = CalendarioBitacora.madrid.dia(de: Date()).iso; try? await c.encolar(.terminarCompra(listaId: l.id, compraId: id, fecha: hoy, tienda: tienda, total: total, txId: tx)); if let tx, let d = Dinero.decimal(texto: total), d > 0 { try? await c.encolar(.crearMovimiento(id: tx, tipo: "expense", importe: NSDecimalNumber(decimal: d).stringValue, cuenta: "bancos", categoria: nil, fecha: hoy, hora: "", concepto: tienda.isEmpty ? "compra" : tienda)) } }
    private func planALista(_ v: VistaDespensa) async { guard let l = v.listaActual else { return }; let textos = semanaActual().flatMap { v.plan[$0.iso] ?? [] }.flatMap(\.ingredientes); let presentes = Set(l.items.filter { !$0.hecho }.map { RecetaALista.clave($0.texto) }); var vistos = Set<String>(); let faltan = textos.filter { let k = RecetaALista.clave($0); return !presentes.contains(k) && vistos.insert(k).inserted }; try? await c.encolar(.anadirCompra(listaId: l.id, textos: faltan, ids: faltan.map { _ in OperacionBitacora.nuevoIdProyecto("cmp") })) }
    private func semanaActual() -> [LocalDay] { CalendarioBitacora.madrid.dia(de: Date()).semanaLunesDomingo }
    private func etiquetaDia(_ d: LocalDay) -> String { let n = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]; return n[d.indiceSemanaLunes] + " \(d.day)." }
}

private struct EditorItemDespensa: View {
    @Environment(\.dismiss) private var cerrar; let guardar: (String, String, String, String) -> Void
    @State private var texto: String; @State private var cantidad: String; @State private var seccion: String; @State private var precio: String
    init(item: ItemDespensa?, seccionInicial: String, guardar: @escaping (String, String, String, String) -> Void) { self.guardar = guardar; _texto = State(initialValue: item?.texto ?? ""); _cantidad = State(initialValue: item?.cantidad ?? ""); _seccion = State(initialValue: seccionInicial); _precio = State(initialValue: item?.precio.map { NSDecimalNumber(decimal: $0).stringValue } ?? "") }
    var body: some View { NavigationStack { Form { TextField("producto.", text: $texto); TextField("cantidad.", text: $cantidad); Picker("sección.", selection: $seccion) { ForEach(LecturaDespensa.secciones, id: \.self) { Text((LecturaDespensa.nombres[$0] ?? $0) + ".").tag($0) } }; TextField("precio estimado.", text: $precio).keyboardType(.decimalPad) }.formularioCasa().navigationTitle("producto.").toolbar { ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }; ToolbarItem(placement: .confirmationAction) { Button("guardar.") { guardar(texto, cantidad, seccion, precio); cerrar() }.disabled(texto.trimmingCharacters(in: .whitespaces).isEmpty) } } } }
}
private struct EditorRecetaDespensa: View {
    @Environment(\.dismiss) private var cerrar; let guardar: (String, Int, [String], [String], String) -> Void
    @State private var nombre: String; @State private var raciones: Int; @State private var ingredientes: String; @State private var pasos: String; @State private var notas: String
    init(receta: RecetaDespensa?, guardar: @escaping (String, Int, [String], [String], String) -> Void) { self.guardar = guardar; _nombre = State(initialValue: receta?.nombre ?? ""); _raciones = State(initialValue: receta?.raciones ?? 2); _ingredientes = State(initialValue: receta?.ingredientes.map { $0.cantidad + "|" + $0.texto }.joined(separator: "\n") ?? ""); _pasos = State(initialValue: receta?.pasos.joined(separator: "\n") ?? ""); _notas = State(initialValue: receta?.notas ?? "") }
    var body: some View { NavigationStack { Form { TextField("nombre.", text: $nombre); Stepper("\(raciones) raciones.", value: $raciones, in: 1...24); Section("ingredientes, uno por línea.") { TextEditor(text: $ingredientes).editorCasa(alto: 130) }; Section("pasos, uno por línea.") { TextEditor(text: $pasos).editorCasa(alto: 110) }; TextField("notas.", text: $notas, axis: .vertical) }.formularioCasa().navigationTitle("receta.").toolbar { ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }; ToolbarItem(placement: .confirmationAction) { Button("guardar.") { guardar(nombre, raciones, ingredientes.components(separatedBy: .newlines).filter { !$0.isEmpty }, pasos.components(separatedBy: .newlines).filter { !$0.isEmpty }, notas); cerrar() }.disabled(nombre.isEmpty) } } } }
}
private struct TerminarCompraView: View {
    @Environment(\.dismiss) private var cerrar; let guardar: (String, String, Bool) -> Void; @State private var tienda = ""; @State private var total = ""; @State private var finanzas = true
    var body: some View { NavigationStack { Form { TextField("tienda.", text: $tienda); TextField("total real.", text: $total).keyboardType(.decimalPad); Toggle("registrar gasto en Finanzas.", isOn: $finanzas) }.formularioCasa().navigationTitle("terminar compra.").toolbar { ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }; ToolbarItem(placement: .confirmationAction) { Button("terminar.") { guardar(tienda, total, finanzas); cerrar() } } } } }
}
private struct EditorPlatoView: View {
    @Environment(\.dismiss) private var cerrar; let dia: String; let recetas: [RecetaDespensa]; let guardar: (String, String, RecetaDespensa?) -> Void; @State private var momento = "comida"; @State private var nombre = ""; @State private var recetaId = ""
    var body: some View { NavigationStack { Form { Picker("momento.", selection: $momento) { ForEach(["desayuno", "comida", "merienda", "cena"], id: \.self) { Text($0 + ".").tag($0) } }; if !recetas.isEmpty { Picker("receta.", selection: $recetaId) { Text("escrito a mano.").tag(""); ForEach(recetas) { Text($0.nombre).tag($0.id) } }.onChange(of: recetaId) { _, id in if let r = recetas.first(where: { $0.id == id }) { nombre = r.nombre } } }; TextField("plato.", text: $nombre) }.formularioCasa().navigationTitle(dia).toolbar { ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }; ToolbarItem(placement: .confirmationAction) { Button("guardar.") { guardar(momento, nombre, recetas.first { $0.id == recetaId }); cerrar() }.disabled(nombre.isEmpty) } } } }
}
