import SwiftUI

// 3.2: «cambiar portada.» desde la ficha. Busca sola al abrirse con el título (y el autor en libros) en la función
// `portadas`, y la búsqueda se puede corregir a mano por si el escáner trajo un título raro. Si el libro tiene ISBN, la
// portada de esa edición va la primera. Al tocar una se guarda (sustituye la anterior) y la hoja se cierra.
struct CambiarPortadaOcio: View {
    @Environment(\.dismiss) private var cerrar
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    let entrada: EntradaOcio
    let actual: String
    let elegir: (String) -> Void

    @State private var consulta: String
    @State private var candidatas: [CandidataPortada] = []
    @State private var deISBN: CandidataPortada?
    @State private var buscando = false
    // Solo vale la última búsqueda: si se lanza otra antes de que acabe, la anterior se descarta.
    @State private var turno = 0
    @State private var comprobando: String?
    @State private var aviso: String?

    private let columnas = Array(repeating: GridItem(.flexible(), spacing: Medida.s, alignment: .top), count: 3)

    init(entrada: EntradaOcio, actual: String, elegir: @escaping (String) -> Void) {
        self.entrada = entrada; self.actual = actual; self.elegir = elegir
        _consulta = State(initialValue: Self.consultaInicial(entrada))
    }

    nonisolated static func consultaInicial(_ e: EntradaOcio) -> String {
        e.tipo == "book" && !e.autor.isEmpty ? e.titulo + " " + e.autor : e.titulo
    }

    // La del ISBN primero y, después, las de la búsqueda sin repetirla. Solo las https: `datosOcio` no guarda otras.
    nonisolated static func ordenadas(isbn: CandidataPortada?, _ r: [CandidataPortada]) -> [CandidataPortada] {
        let todas = (isbn.map { [$0] } ?? []) + r
        var vistas = Set<String>(), salida: [CandidataPortada] = []
        for k in todas where k.imagen.hasPrefix("https://") {
            if vistas.insert(k.imagen).inserted { salida.append(k) }
        }
        return salida
    }

    private var lista: [CandidataPortada] { Self.ordenadas(isbn: deISBN, candidatas) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.m) {
                HStack(alignment: .center) {
                    Text(actual.isEmpty ? "añadir portada." : "cambiar portada.")
                        .font(Letra.titulo).foregroundStyle(Lienzo.tinta).kerning(-0.4)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    BotonRedondo(sistema: "xmark", tono: .sutil, etiqueta: "cerrar") { cerrar() }
                }
                HStack(spacing: Medida.xs) {
                    BuscadorCapsula(texto: $consulta, placeholder: "título.")
                        .onSubmit { Task { await buscar() } }
                        .submitLabel(.search)
                    Button("buscar.") { Task { await buscar() } }
                        .buttonStyle(.capsula(.oscuro))
                        .disabled(buscando || consulta.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                if let aviso {
                    Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.negativo)
                }
                resultados
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: buscando)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
        .task { await abrir() }
    }

    @ViewBuilder private var resultados: some View {
        if buscando && lista.isEmpty {
            HStack(spacing: Medida.xs) {
                ProgressView().tint(Lienzo.tintaTerciaria)
                Text("buscando.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, Medida.l)
        } else if lista.isEmpty {
            Text("no hay portadas para esa búsqueda.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                .frame(maxWidth: .infinity)
                .padding(.top, Medida.l)
        } else {
            LazyVGrid(columns: columnas, spacing: Medida.m) {
                ForEach(lista) { k in celda(k) }
            }
            .opacity(buscando ? 0.5 : 1)
        }
    }

    private func celda(_ k: CandidataPortada) -> some View {
        let elegida = actual == k.imagen
        let esISBN = deISBN?.imagen == k.imagen
        return Button {
            // 3.3 («a veces no se aplica»): se guarda solo si la imagen carga. Algunas candidatas (la vertical de Steam
            // de un juego que no la tiene, un enlace caducado) dan error y dejaban la portada en blanco.
            guard comprobando == nil else { return }
            comprobando = k.imagen
            aviso = nil
            Task {
                let vale = await BuscarPortadas.cargaBien(k.imagen)
                comprobando = nil
                guard vale else { Haptica.error(); aviso = "esa portada no se puede cargar. prueba otra."; return }
                Haptica.exito()
                elegir(k.imagen)
                cerrar()
            }
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                PortadaOcio(url: k.imagen, titulo: k.titulo.isEmpty ? entrada.titulo : k.titulo, ancho: nil)
                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .strokeBorder(elegida ? Lienzo.naranja : .clear, lineWidth: 2.5))
                Text(esISBN ? "esta edición." : MayusculaOcio.inicial(k.titulo))
                    .font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta).lineLimit(2)
                if !esISBN, !k.anio.isEmpty || !k.autor.isEmpty {
                    Text([k.autor, k.anio].filter { !$0.isEmpty }.joined(separator: ", "))
                        .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.pulsable(0.95))
        .disabled(elegida)
        .accessibilityLabel(esISBN ? "portada de esta edición" : "portada de \(k.titulo)" + (k.anio.isEmpty ? "" : ", \(k.anio)") + (elegida ? ", la actual" : ""))
    }

    // Al abrir: la del ISBN (si lo hay) y la búsqueda por título a la vez.
    private func abrir() async {
        let isbn = entrada.tipo == "book" ? OcioDatosOp.isbnLimpio(entrada.isbn) : ""
        async let porISBN = Self.portadaISBN(isbn)
        await buscar()
        if let img = await porISBN {
            deISBN = CandidataPortada(titulo: entrada.titulo, anio: entrada.anio, autor: entrada.autor, imagen: img)
        }
    }

    nonisolated private static func portadaISBN(_ isbn: String) async -> String? {
        isbn.isEmpty ? nil : await BuscarISBN.portada(isbn)
    }

    private func buscar() async {
        let q = consulta.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        turno += 1
        let mio = turno
        buscando = true
        // El año solo ayuda si se busca lo que ya estaba apuntado.
        let anio = (entrada.tipo == "movie" || entrada.tipo == "series") && q == Self.consultaInicial(entrada) ? entrada.anio : ""
        let r = await BuscarPortadas.buscar(c, tipo: entrada.tipo, q: q, anio: anio)
        guard mio == turno else { return }
        candidatas = r
        buscando = false
    }
}
