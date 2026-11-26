import SwiftUI

// 3.4 (petición de Alejandro): el QR de un evento se abre desde su tarjeta en Inicio y en Calendario, sin entrar en la
// ficha, como ya pasaba en Eventos. Es la misma pastilla de antes («qr.»), ahora pulsable; si ninguna entrada se puede
// leer, abre la ficha, que es donde se ven y se vuelven a añadir.
struct BotonQRDirecto: View {
    @Environment(AppCoordinator.self) private var c
    let evento: EventoDia
    let dia: LocalDay
    let texto: String
    let tono: Chip.Tono
    @State private var abierto: QREventoAbierto?

    var body: some View {
        Button { abrir() } label: {
            Chip(texto: texto, tono: tono, icono: "qrcode")
                .padding(.vertical, 8)
                .contentShape(Rectangle())
        }
        .buttonStyle(.pulsable(0.92))
        .accessibilityLabel(evento.entradas == 1 ? "enseñar la entrada" : "enseñar las entradas")
        .accessibilityHint("abre el código qr a pantalla completa")
        .fullScreenCover(item: $abierto) { q in
            EntradaPantallaCompleta(titulo: q.titulo, detalle: q.detalle, entradas: q.entradas, indice: 0)
        }
    }

    private func abrir() {
        Haptica.ligera()
        Task { @MainActor in
            guard let doc = await c.documentoVisible() else { return }
            let lista = ((try? doc.valor(de: "entries")) ?? nil)?.lista?.first { $0["id"]?.comoId == evento.id }?["entradas"]?.lista ?? []
            let entradas = lista.compactMap(EntradaQR.desde)
            guard !entradas.isEmpty else { c.modal = .ficha(evento, dia: dia); return }
            abierto = QREventoAbierto(id: evento.id, titulo: evento.titulo, detalle: evento.meta, entradas: entradas)
        }
    }
}
