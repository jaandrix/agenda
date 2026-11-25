import SwiftUI

// Etiquetas (vista web `tags`, renderTagsView en js/ajustes.js): todas las etiquetas de `entries` con su recuento y,
// al tocar una, lo que la lleva agrupado por tipo. «padre/hija» se agrupa bajo el padre. Renombrar, eliminar y quitar
// de una entrada como la web; tocar una entrada abre su apartado.

private struct RenombrarEtiqueta: Identifiable { let ruta: String; var id: String { ruta } }

struct EtiquetasView: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var entradas: [EntradaSuelta]?
    @State private var busqueda = ""
    @State private var elegida: String?
    @State private var renombrar: RenombrarEtiqueta?
    @State private var aEliminar: RenombrarEtiqueta?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                if let l = entradas {
                    if let ruta = elegida {
                        detalle(ruta, l).transition(.opacity.combined(with: .offset(x: 24)))
                    } else {
                        lista(l).transition(.opacity.combined(with: .offset(x: -24)))
                    }
                } else {
                    CabeceraPagina(titulo: "etiquetas.")
                    ProgressView().tint(Lienzo.tintaTerciaria).frame(maxWidth: .infinity).padding(.top, Medida.xl)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.expandir, reducido: sinMovimiento), value: elegida)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: busqueda)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
        .refreshable { await c.sincronizar() }
        .tareaVisible(id: c.revision) { await cargar() }
        .hoja(item: $renombrar) { r in
            EditorNombreEtiqueta(ruta: r.ruta) { nueva in elegida = nueva }.environment(c)
        }
        .confirmarBorrado($aEliminar, titulo: { r in
            let n = LecturaEtiquetas.conPrefijo(r.ruta, entradas ?? []).filter { $0.etiquetas.contains(r.ruta) }.count
            return "¿quitar #\(r.ruta) de \(n) \(n == 1 ? "entrada" : "entradas")? las entradas no se borran."
        }, boton: "eliminar.") { r in
            elegida = nil
            Task { await c.guardar(EtiquetasOp.eliminar(r.ruta)) }
        }
    }

    // MARK: - Todas las etiquetas

    @ViewBuilder private func lista(_ l: [EntradaSuelta]) -> some View {
        let todas = LecturaEtiquetas.grupos(l)
        let etiquetadas = l.filter { !$0.etiquetas.isEmpty }.count
        let distintas = Set(l.flatMap(\.etiquetas)).count
        CabeceraPagina(titulo: "etiquetas.", subtitulo: distintas == 0 ? nil
                       : "\(distintas) \(distintas == 1 ? "etiqueta" : "etiquetas") en \(etiquetadas) \(etiquetadas == 1 ? "entrada" : "entradas").")
            .padding(.bottom, Medida.xxs)
        if todas.isEmpty {
            TarjetaInvitacion(frase: "todavía no has etiquetado", destacado: "nada.")
                .entradaEscalonada(0)
            Text("al crear o editar un libro, un viaje o un evento, escribe etiquetas en su campo «etiquetas» y aquí verás juntas las que comparten una. usa padre/hija (viaje/japón) para agruparlas.")
                .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).padding(.horizontal, Medida.xxs)
        } else {
            BuscadorCapsula(texto: $busqueda, placeholder: "buscar etiqueta")
            let grupos = LecturaEtiquetas.grupos(l, busqueda: busqueda)
            if grupos.isEmpty {
                TarjetaInvitacion(frase: "ninguna etiqueta dice", destacado: "«\(busqueda.trimmingCharacters(in: .whitespaces))».", boton: "borrar búsqueda.") {
                    Haptica.ligera(); busqueda = ""
                }
                .transition(.opacity)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(grupos.enumerated()), id: \.element.id) { i, g in
                        if i > 0 { SeparadorFila(sangria: 0) }
                        filaGrupo(g)
                    }
                }
                .padding(.horizontal, Medida.rellenoTarjeta)
                .padding(.vertical, Medida.xxs)
                .tarjeta(relleno: 0)
                .entradaEscalonada(1)
            }
        }
    }

    private func filaGrupo(_ g: GrupoEtiqueta) -> some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            Button { abrir(g.ruta) } label: {
                HStack(spacing: Medida.s) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("#" + g.nombre).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).lineLimit(1)
                        Text(TipoEntrada.desglose(g.entradas)).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                    }
                    Spacer(minLength: Medida.xs)
                    Chip(texto: "\(g.entradas.count)")
                    FlechaFila()
                }
                .frame(minHeight: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pulsable(0.98))
            .accessibilityElement(children: .combine)
            if !g.hijas.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: 6) {
                        ForEach(g.hijas, id: \.self) { h in
                            Button { abrir(h) } label: {
                                Chip(texto: "/" + (LecturaEtiquetas.partes(h).last ?? h), tono: .blanco)
                                    .overlay(Capsule().strokeBorder(Lienzo.filo))
                                    .frame(minHeight: Medida.toque)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.pulsable(0.92))
                            .accessibilityLabel("#" + h)
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .scrollClipDisabled()
                .padding(.top, -Medida.xs)
                .padding(.bottom, Medida.xxs)
            }
        }
    }

    // MARK: - Una etiqueta

    @ViewBuilder private func detalle(_ ruta: String, _ l: [EntradaSuelta]) -> some View {
        let suyas = LecturaEtiquetas.conPrefijo(ruta, l)
        let tipos = suyas.reduce(into: [String]()) { if !$0.contains($1.tipo) { $0.append($1.tipo) } }
        CabeceraPagina(titulo: "#" + ruta,
                       subtitulo: "\(suyas.count) \(suyas.count == 1 ? "entrada" : "entradas"), \(TipoEntrada.desglose(suyas)).",
                       volver: { Haptica.ligera(); elegida = nil }) {
            MenuRedondo(etiqueta: "opciones de la etiqueta") {
                Button("renombrar.") { renombrar = RenombrarEtiqueta(ruta: ruta) }
                Button("eliminar.", role: .destructive) { aEliminar = RenombrarEtiqueta(ruta: ruta) }
            }
        }
        .padding(.bottom, Medida.xxs)
        if suyas.isEmpty {
            TarjetaInvitacion(frase: "ya no queda nada con", destacado: "#\(ruta).", boton: "ver etiquetas.") { Haptica.ligera(); elegida = nil }
        }
        ForEach(Array(tipos.enumerated()), id: \.element) { i, tipo in
            let grupo = suyas.filter { $0.tipo == tipo }
            TarjetaSeccion(titulo: TipoEntrada.plural(tipo), detalle: "\(grupo.count)", arriba: i == 0 ? Medida.xs : Medida.m, enTarjeta: false) {
                TarjetaLista(elementos: grupo) { e in filaEntrada(e, ruta) }
            }
            .entradaEscalonada(i)
        }
    }

    private func filaEntrada(_ e: EntradaSuelta, _ ruta: String) -> some View {
        let otras = e.etiquetas.filter { $0 != ruta }.prefix(3).map { "#" + $0 }.joined(separator: " ")
        return Button { Haptica.ligera(); c.abrirApartado(TipoEntrada.vista(e.tipo)) } label: {
            HStack(spacing: Medida.s) {
                IconoCuadrado(id: TipoEntrada.icono(e.tipo))
                VStack(alignment: .leading, spacing: 2) {
                    Text(e.titulo.isEmpty ? "sin título." : e.titulo).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    if !otras.isEmpty {
                        Text(otras).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                    }
                }
                Spacer(minLength: Medida.xs)
                FlechaFila()
            }
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pulsable(0.98))
        .accessibilityElement(children: .combine)
        .accessibilityHint("abre " + TipoEntrada.plural(e.tipo))
        .contextMenu {
            if e.etiquetas.contains(ruta) {
                Button("quitar #\(ruta) de esta entrada.", role: .destructive) {
                    Task { await c.guardar(EtiquetasOp.quitar(ruta, de: e.id)) }
                }
            }
        }
    }

    private func abrir(_ ruta: String) {
        Haptica.ligera()
        busqueda = ""
        elegida = ruta
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        guard let r = await ultimaGana({ doc.map { EntradaSuelta.leer($0) } }), let l = r else { return }
        entradas = l
    }
}

private struct EditorNombreEtiqueta: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let ruta: String
    let hecho: (String) -> Void
    @State private var nombre: String

    init(ruta: String, hecho: @escaping (String) -> Void) {
        self.ruta = ruta; self.hecho = hecho
        _nombre = State(initialValue: ruta)
    }

    var body: some View {
        NavigationStack {
            FormCasa {
                TextField("nuevo nombre.", text: $nombre).textInputAutocapitalization(.never)
            }
            .navigationTitle("renombrar etiqueta.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        let n = nombre.trimmingCharacters(in: .whitespacesAndNewlines)
                        Task { if await c.guardar(EtiquetasOp.renombrar(ruta, a: n)) { hecho(n); cerrar() } }
                    }
                    .disabled(nombre.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || nombre.trimmingCharacters(in: .whitespacesAndNewlines) == ruta)
                }
            }
        }
    }
}
