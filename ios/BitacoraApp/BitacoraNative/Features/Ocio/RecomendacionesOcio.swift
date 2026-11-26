import SwiftUI

// 3.4 (petición de Alejandro): recomendar cualquier cosa de Ocio a un amigo desde el iPhone, y recibir las suyas en la
// biblioteca. Son las mismas recomendaciones de la web (tabla `recomendaciones`): lo mandado desde una se ve en la otra.

struct RecomendarOcioView: View {
    @Environment(\.dismiss) private var cerrar
    @Environment(AppCoordinator.self) private var c
    let entrada: EntradaOcio
    let portada: String

    @State private var amigos: [SocialAmigo]?
    @State private var elegido: String?
    @State private var nota = ""
    @State private var enviando = false
    @State private var aviso: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.m) {
                HStack {
                    Text("recomendar.").font(Letra.titulo).foregroundStyle(Lienzo.tinta).accessibilityAddTraits(.isHeader)
                    Spacer()
                    BotonRedondo(sistema: "xmark", tono: .sutil, etiqueta: "cerrar") { cerrar() }
                }
                Text("«\(MayusculaOcio.inicial(entrada.titulo))» llegará a su biblioteca, con la portada y tu nota.")
                    .font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                    .fixedSize(horizontal: false, vertical: true)
                if let amigos {
                    if amigos.isEmpty {
                        TarjetaInvitacion(frase: "aún no tienes amigos en bitácora.", destacado: "añádelos desde social con su código.")
                    } else {
                        EtiquetaSeccion(texto: "a quién.")
                        VStack(spacing: 0) {
                            ForEach(amigos) { a in
                                Button { Haptica.seleccion(); elegido = a.friendId } label: {
                                    HStack {
                                        Text(a.nombre).font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                                        Spacer()
                                        if elegido == a.friendId {
                                            Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(Lienzo.tinta)
                                        }
                                    }
                                    .frame(minHeight: Medida.toque)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.pulsable(0.98))
                                .accessibilityAddTraits(elegido == a.friendId ? .isSelected : [])
                                if a.id != amigos.last?.id { SeparadorFila(sangria: 0) }
                            }
                        }
                        .tarjeta()
                        EtiquetaSeccion(texto: "nota, si quieres.")
                        TextField("por qué se lo recomiendas.", text: $nota, axis: .vertical)
                            .font(Letra.cuerpo).lineLimit(2...5)
                            .padding(Medida.s)
                            .background(Lienzo.tarjeta, in: RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous))
                        if let aviso { Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.negativo) }
                        Button(enviando ? "enviando." : "enviar.") { Task { await enviar() } }
                            .buttonStyle(.capsula(.oscuro, ancho: true))
                            .disabled(elegido == nil || enviando)
                    }
                } else {
                    ProgressView().tint(Lienzo.tintaTerciaria).frame(maxWidth: .infinity).padding(.top, Medida.l)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .fondoLienzo()
        .task {
            let repo = RepositorioSocial(cliente: c.entorno.cliente, auth: c.entorno.auth)
            amigos = (try? await repo.listaAmigos()) ?? []
            if amigos?.count == 1 { elegido = amigos?.first?.friendId }
        }
    }

    private func enviar() async {
        guard let elegido else { return }
        enviando = true
        aviso = nil
        defer { enviando = false }
        do {
            let repo = RepositorioSocial(cliente: c.entorno.cliente, auth: c.entorno.auth)
            try await repo.recomendar(a: elegido, tipo: entrada.tipo, titulo: entrada.titulo, autor: entrada.autor,
                                      portada: portada, anio: entrada.anio, nota: nota)
            Haptica.exito()
            cerrar()
        } catch {
            Haptica.error()
            aviso = "no se pudo enviar. mira la conexión y vuelve a probar."
        }
    }
}

// Lo que te han recomendado de este tipo, arriba de la biblioteca: portada, quién y su nota, «añadir.» o «no me interesa.».
struct FranjaRecomendacionesOcio: View {
    let lista: [RecomendacionOcio]
    let anadir: (RecomendacionOcio) -> Void
    let descartar: (RecomendacionOcio) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            EtiquetaSeccion(texto: lista.count == 1 ? "te han recomendado." : "te han recomendado \(lista.count).")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: Medida.s) {
                    ForEach(lista) { r in tarjeta(r) }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private func tarjeta(_ r: RecomendacionOcio) -> some View {
        HStack(alignment: .top, spacing: Medida.s) {
            PortadaOcio(url: r.portada, titulo: r.titulo, ancho: 54, radio: Medida.radioIcono)
            VStack(alignment: .leading, spacing: 3) {
                Text(MayusculaOcio.inicial(r.titulo)).font(Letra.pieFuerte).foregroundStyle(Lienzo.tinta).lineLimit(2)
                Text("de \(r.de).").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                if !r.nota.isEmpty {
                    Text("«\(r.nota)»").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(2)
                }
                HStack(spacing: Medida.s) {
                    Button("añadir.") { anadir(r) }.font(Letra.pieFuerte).estiloEnlace()
                    Button("no me interesa.") { descartar(r) }.font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                }
                .padding(.top, 2)
            }
            .frame(width: 170, alignment: .leading)
        }
        .tarjeta(relleno: Medida.s, radio: Medida.radioFila)
        .accessibilityElement(children: .contain)
    }
}
