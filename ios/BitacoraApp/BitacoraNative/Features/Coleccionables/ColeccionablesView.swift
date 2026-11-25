import SwiftUI

// Coleccionables (vista web `collectibles`, renderCollectibles). Portada: el valor total y una tarjeta por colección
// (categoría) con sus piezas, su valor y una barra fina con su peso en el total. Dentro, las piezas en rejilla con buscador
// y orden; tocar una la edita. Las piezas no tienen foto en los datos: se dibuja su inicial.

private enum ModalColeccion: Identifiable {
    case pieza(Coleccionable?, String?)
    case categoria(CategoriaColeccion?)
    var id: String {
        switch self {
        case .pieza(let p, let cat): return "p-" + (p?.id ?? "nueva-" + (cat ?? ""))
        case .categoria(let c): return "c-" + (c?.id ?? "nueva")
        }
    }
}

struct ColeccionablesView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var datos: ([Coleccionable], [CategoriaColeccion])?
    @State private var abierta: String?
    @State private var busqueda = ""
    @State private var orden: LecturaColecciones.Orden = .valor
    @State private var modal: ModalColeccion?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                if let d = datos {
                    if let id = abierta, let cat = d.1.first(where: { $0.id == id }) {
                        detalle(cat, d.0)
                            .transition(.opacity.combined(with: .offset(x: 24)))
                    } else {
                        portada(d.0, d.1)
                            .transition(.opacity.combined(with: .offset(x: -24)))
                    }
                } else {
                    CabeceraPagina(titulo: "coleccionables.")
                    ProgressView().tint(Lienzo.tintaTerciaria).frame(maxWidth: .infinity).padding(.top, Medida.xl)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.expandir, reducido: sinMovimiento), value: abierta)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: busqueda)
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: orden)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
        .refreshable { await c.sincronizar() }
        .tareaVisible(id: c.revision) { await cargar() }
        .hoja(item: $modal) { m in
            switch m {
            case .pieza(let p, let cat): EditorColeccionable(pieza: p, categoriaInicial: cat, categorias: datos?.1 ?? []).environment(c)
            case .categoria(let cat): EditorCategoriaColeccion(categoria: cat).environment(c)
            }
        }
    }

    // MARK: - Portada: las colecciones

    @ViewBuilder private func portada(_ piezas: [Coleccionable], _ cats: [CategoriaColeccion]) -> some View {
        let conPiezas = cats.filter { cat in piezas.contains { $0.categoria == cat.id } }.count
        CabeceraPagina(titulo: "coleccionables.",
                       subtitulo: "\(piezas.count) \(piezas.count == 1 ? "objeto" : "objetos") en \(conPiezas) \(conPiezas == 1 ? "categoría" : "categorías").") {
            HStack(spacing: Medida.xs) {
                BotonRedondo(sistema: "folder.badge.plus", tono: .blanco, etiqueta: "nueva categoría") { Haptica.ligera(); modal = .categoria(nil) }
                BotonRedondo(sistema: "plus", tono: .oscuro, etiqueta: "nuevo coleccionable") { Haptica.ligera(); modal = .pieza(nil, nil) }
            }
        }
        .padding(.bottom, Medida.xxs)
        if piezas.isEmpty {
            TarjetaInvitacion(frase: "aún no has añadido", destacado: "ningún coleccionable.", boton: "+ coleccionable.") { modal = .pieza(nil, nil) }
                .entradaEscalonada(0)
        } else {
            let total = piezas.reduce(Decimal(0)) { $0 + $1.valor }
            TarjetaOscura {
                CifraGrande(texto: Dinero.formato(total), etiqueta: "valor de tu colección", sobreOscuro: true)
            }
            .entradaEscalonada(0)
            EtiquetaSeccion(texto: "colecciones").padding(.top, Medida.xs)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: Medida.entreTarjetas), GridItem(.flexible(), spacing: Medida.entreTarjetas)],
                      spacing: Medida.entreTarjetas) {
                ForEach(Array(cats.enumerated()), id: \.element.id) { i, cat in
                    tarjetaColeccion(cat, piezas.filter { $0.categoria == cat.id }, total: total)
                        .entradaEscalonada(i + 1)
                }
            }
            let sueltas = piezas.filter { p in !cats.contains { $0.id == p.categoria } }
            if !sueltas.isEmpty {
                Text("\(sueltas.count) sin categoría: edítalas para darles una.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    .padding(.horizontal, Medida.xxs)
            }
        }
    }

    private func tarjetaColeccion(_ cat: CategoriaColeccion, _ suyas: [Coleccionable], total: Decimal) -> some View {
        let valor = suyas.reduce(Decimal(0)) { $0 + $1.valor }
        let peso = total > 0 ? NSDecimalNumber(decimal: valor / total).doubleValue : 0
        return Button {
            Haptica.ligera()
            busqueda = ""
            abierta = cat.id
        } label: {
            VStack(alignment: .leading, spacing: Medida.s) {
                HStack(alignment: .top) {
                    IconoCuadrado(id: "coleccionables", tono: suyas.isEmpty ? .claro : .oscuro)
                    Spacer(minLength: 0)
                    Text("\(suyas.count)").font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit()
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(cat.nombre.lowercased() + ".").font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta).lineLimit(1)
                    Text(suyas.isEmpty ? "vacía." : Dinero.formato(valor)).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        .monospacedDigit().lineLimit(1)
                }
                BarraFina(valor: peso, alto: Medida.barraFina)
            }
            .tarjeta(relleno: 14)
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        }
        .buttonStyle(.pulsable(0.96))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(cat.nombre), \(suyas.count) piezas, \(Dinero.formato(valor))")
        .contextMenu {
            Button("+ coleccionable aquí.") { modal = .pieza(nil, cat.id) }
            Button("renombrar.") { modal = .categoria(cat) }
        }
    }

    // MARK: - Una colección: rejilla de piezas

    @ViewBuilder private func detalle(_ cat: CategoriaColeccion, _ piezas: [Coleccionable]) -> some View {
        let todas = piezas.filter { $0.categoria == cat.id }
        let visibles = LecturaColecciones.ordenar(todas.filter { LecturaColecciones.coincide($0, busqueda) }, orden)
        let maximo = todas.map(\.valor).max() ?? 0
        let cartas = LecturaColecciones.esCartas(cat.id, cat.nombre)
        let suma = todas.reduce(Decimal(0)) { $0 + $1.valor }
        CabeceraPagina(titulo: cat.nombre.lowercased() + ".",
                       subtitulo: "\(todas.count) \(todas.count == 1 ? "pieza" : "piezas"), \(Dinero.formato(suma)).",
                       volver: { Haptica.ligera(); abierta = nil }) {
            BotonRedondo(sistema: "plus", tono: .oscuro, etiqueta: "nuevo coleccionable en " + cat.nombre) { Haptica.ligera(); modal = .pieza(nil, cat.id) }
        }
        .padding(.bottom, Medida.xxs)
        if todas.isEmpty {
            TarjetaInvitacion(frase: "esta colección", destacado: "está vacía.", boton: "+ coleccionable.") { modal = .pieza(nil, cat.id) }
        } else {
            BuscadorCapsula(texto: $busqueda, placeholder: cartas ? "buscar por nombre, set o número" : "buscar en la colección")
            SegmentoCapsula(opciones: [.init(valor: LecturaColecciones.Orden.valor, titulo: "valor"), .init(valor: LecturaColecciones.Orden.nombre, titulo: "nombre"),
                                       .init(valor: LecturaColecciones.Orden.recientes, titulo: "recientes")], elegido: $orden, sobreBlanco: false)
            if visibles.isEmpty {
                TarjetaInvitacion(frase: "ninguna pieza dice", destacado: "«\(busqueda.trimmingCharacters(in: .whitespaces))».", boton: "borrar búsqueda.") {
                    Haptica.ligera(); busqueda = ""
                }
            } else {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: Medida.entreTarjetas), GridItem(.flexible(), spacing: Medida.entreTarjetas)],
                          spacing: Medida.entreTarjetas) {
                    ForEach(Array(visibles.enumerated()), id: \.element.id) { i, p in
                        PiezaRejilla(pieza: p, cartas: cartas, laMejor: maximo > 0 && p.valor == maximo) { modal = .pieza(p, nil) }
                            .entradaEscalonada(min(i, 14))
                    }
                }
            }
        }
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        guard let r = await ultimaGana({ doc.map { LecturaColecciones.leer($0) } }), let d = r else { return }
        datos = d
        if let a = abierta, !d.1.contains(where: { $0.id == a }) { abierta = nil }
    }
}

// Una pieza en la rejilla: inicial en cuadrado (la más valiosa en oscuro, con punto naranja), nombre, datos de carta y valor.
private struct PiezaRejilla: View {
    let pieza: Coleccionable
    let cartas: Bool
    let laMejor: Bool
    let tocar: () -> Void

    var body: some View {
        Button { Haptica.ligera(); tocar() } label: {
            VStack(alignment: .leading, spacing: Medida.s) {
                HStack(alignment: .top) {
                    InicialCuadrada(nombre: pieza.nombre, oscuro: laMejor, tamano: Medida.iconoGrande)
                    Spacer(minLength: 0)
                    if laMejor { Puntito(color: Lienzo.naranja, tamano: 7).accessibilityLabel("la más valiosa") }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(pieza.nombre).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    if !detalle.isEmpty {
                        Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                HStack {
                    Text(Dinero.formato(pieza.valor)).font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta).monospacedDigit()
                    Spacer(minLength: 0)
                    if cartas, !pieza.estado.isEmpty {
                        Chip(texto: LecturaColecciones.estadoCorto[pieza.estado] ?? pieza.estado)
                    }
                }
            }
            .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
            .tarjeta(relleno: 14)
            .contentShape(RoundedRectangle(cornerRadius: Medida.radioTarjeta, style: .continuous))
        }
        .buttonStyle(.pulsable(0.96))
        .accessibilityElement(children: .combine)
        .accessibilityHint("toca para editar")
    }

    private var detalle: String {
        guard cartas else { return "" }
        return [pieza.set, pieza.numero.isEmpty ? "" : "#" + pieza.numero, pieza.anio].filter { !$0.isEmpty }.joined(separator: ", ")
    }
}

private struct EditorColeccionable: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let pieza: Coleccionable?
    let categorias: [CategoriaColeccion]
    @State private var nombre: String
    @State private var categoria: String
    @State private var valor: String
    @State private var set: String
    @State private var numero: String
    @State private var anio: String
    @State private var estado: String
    @State private var id: String
    @State private var creado: String
    @State private var aBorrar: Coleccionable?

    init(pieza: Coleccionable?, categoriaInicial: String?, categorias: [CategoriaColeccion]) {
        self.pieza = pieza; self.categorias = categorias
        _nombre = State(initialValue: pieza?.nombre ?? "")
        _categoria = State(initialValue: pieza?.categoria ?? categoriaInicial ?? categorias.first?.id ?? "")
        _valor = State(initialValue: pieza.map { "\($0.valor)".replacingOccurrences(of: ".", with: ",") } ?? "")
        _set = State(initialValue: pieza?.set ?? ""); _numero = State(initialValue: pieza?.numero ?? "")
        _anio = State(initialValue: pieza?.anio ?? ""); _estado = State(initialValue: pieza?.estado ?? "")
        _id = State(initialValue: pieza?.id ?? LecturaColecciones.nuevoId("coll"))
        _creado = State(initialValue: pieza?.creado ?? ISO8601DateFormatter().string(from: Date()))
    }

    private var esCartas: Bool {
        LecturaColecciones.esCartas(categoria, categorias.first { $0.id == categoria }?.nombre ?? "")
    }

    var body: some View {
        NavigationStack {
            FormCasa {
                TextField("nombre.", text: $nombre)
                Picker("categoría.", selection: $categoria) {
                    ForEach(categorias) { cat in Text(cat.nombre.lowercased() + ".").tag(cat.id) }
                }
                if esCartas {
                    Section("carta.") {
                        TextField("set.", text: $set)
                        TextField("número.", text: $numero)
                        TextField("año.", text: $anio).keyboardType(.numberPad)
                        Picker("estado.", selection: $estado) {
                            Text("sin indicar.").tag("")
                            ForEach(LecturaColecciones.estadosCarta, id: \.self) { Text($0).tag($0) }
                        }
                    }
                }
                Section("valor de mercado (€).") {
                    TextField("0,00", text: $valor).keyboardType(.decimalPad)
                }
                if let pieza {
                    Section { Button("eliminar.", role: .destructive) { aBorrar = pieza } }
                }
            }
            .navigationTitle(pieza == nil ? "nuevo coleccionable." : "editar coleccionable.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        Task {
                            let op = ColeccionesOp.guardar(id: id, nombre: nombre, categoria: categoria, valor: valor, creado: creado,
                                                           set: set, numero: numero, anio: anio, estado: estado)
                            if await c.guardar(op) { Haptica.exito(); cerrar() }
                        }
                    }
                    .disabled(nombre.trimmingCharacters(in: .whitespaces).isEmpty || categoria.isEmpty
                              || (!valor.trimmingCharacters(in: .whitespaces).isEmpty && Dinero.decimal(texto: valor) == nil))
                }
            }
            .confirmarBorrado($aBorrar, titulo: { "¿eliminar «\($0.nombre)»?" }, boton: "eliminar.") { p in
                Task { if await c.guardar(ColeccionesOp.quitar(id: p.id)) { cerrar() } }
            }
        }
    }
}

private struct EditorCategoriaColeccion: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let categoria: CategoriaColeccion?
    @State private var nombre: String
    @State private var id: String

    init(categoria: CategoriaColeccion?) {
        self.categoria = categoria
        _nombre = State(initialValue: categoria?.nombre ?? "")
        _id = State(initialValue: categoria?.id ?? LecturaColecciones.nuevoId("cat"))
    }

    var body: some View {
        NavigationStack {
            FormCasa {
                TextField("nombre (figuras, vinilos, cómics…).", text: $nombre)
            }
            .navigationTitle(categoria == nil ? "nueva categoría." : "categoría.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") { Task { if await c.guardar(ColeccionesOp.categoria(id: id, nombre: nombre)) { cerrar() } } }
                        .disabled(nombre.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
