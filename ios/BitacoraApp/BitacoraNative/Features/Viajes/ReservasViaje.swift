import SwiftUI

// 0.24: reservas de un viaje (openAddTransporte / openAddAlojamiento en js/viajes.js). Las fechas van como en la web,
// «AAAA-MM-DDTHH:MM» sin zona (datetime-local); aquí se leen y se escriben en la hora de Madrid para que el texto no
// cambie al ir y volver.
struct ReservaEditando: Identifiable {
    let lista: String
    let reserva: ReservaViaje?
    var id: String { lista + (reserva?.id ?? "nueva") }
}

struct EditorReservaViaje: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let viajeId: String
    let editando: ReservaEditando
    @State private var campos: [String: String]
    @State private var id: String
    @State private var descartar = false
    @State private var confirmarBorrado = false
    private let original: [String: String]
    static let tipos: [(String, String)] = [("avion", "avión."), ("tren", "tren."), ("bus", "autobús."), ("coche", "coche."), ("barco", "barco."), ("otro", "otro.")]

    init(viajeId: String, editando: ReservaEditando) {
        self.viajeId = viajeId
        self.editando = editando
        var inicial = editando.reserva?.campos ?? [:]
        if editando.lista == "transportes", (inicial["tipo"] ?? "").isEmpty { inicial["tipo"] = "avion" }
        _campos = State(initialValue: inicial)
        original = inicial
        _id = State(initialValue: editando.reserva?.id ?? LecturaViajes.nuevoId(editando.lista == "transportes" ? "tr" : "al"))
    }

    private var transporte: Bool { editando.lista == "transportes" }
    private func campo(_ k: String) -> Binding<String> { Binding(get: { campos[k] ?? "" }, set: { campos[k] = $0 }) }
    private var cambiado: Bool { campos.filter { !$0.value.isEmpty } != original.filter { !$0.value.isEmpty } }
    private var valido: Bool {
        let t = { (k: String) in (campos[k] ?? "").trimmingCharacters(in: .whitespaces).isEmpty == false }
        return transporte ? (t("origen") || t("destino")) : t("nombre")
    }

    var body: some View {
        NavigationStack {
            FormCasa {
                if transporte {
                    Section {
                        Picker("tipo.", selection: campo("tipo")) { ForEach(Self.tipos, id: \.0) { Text($0.1).tag($0.0) } }
                        TextField("compañía (iberia, renfe…).", text: campo("compania"))
                        TextField("origen.", text: campo("origen"))
                        TextField("destino.", text: campo("destino"))
                    }
                    Section {
                        CampoFechaHora(titulo: "salida.", texto: campo("salida"))
                        CampoFechaHora(titulo: "llegada.", texto: campo("llegada"))
                    }
                    Section {
                        TextField("nº de vuelo o tren.", text: campo("numero"))
                        TextField("reserva (localizador).", text: campo("reserva"))
                        TextField("asiento.", text: campo("asiento"))
                    }
                } else {
                    Section {
                        TextField("nombre (hotel, apartamento…).", text: campo("nombre"))
                        TextField("dirección.", text: campo("direccion"))
                    }
                    Section {
                        CampoFechaHora(titulo: "entrada.", texto: campo("entrada"))
                        CampoFechaHora(titulo: "salida.", texto: campo("salida"))
                    }
                    Section { TextField("reserva (nº de confirmación).", text: campo("reserva")) }
                }
                Section { TextField(transporte ? "notas (terminal, equipaje, puerta…)." : "notas (check-in, desayuno, contacto…).", text: campo("notas"), axis: .vertical).lineLimit(1...5) }
                if editando.reserva != nil {
                    Section { Button("eliminar la reserva.", role: .destructive) { confirmarBorrado = true } }
                }
            }
            .navigationTitle(transporte ? "transporte." : "alojamiento.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { if cambiado { descartar = true } else { cerrar() } } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        let cambio = CambioViaje.reserva(lista: editando.lista, id: id, campos: campos)
                        Task { if await c.guardar(.cambiarViaje(viajeId: viajeId, cambio: cambio)) { cerrar() } }
                    }.disabled(!valido)
                }
            }
            .confirmationDialog("¿eliminar esta reserva?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("eliminar.", role: .destructive) {
                    Task { if await c.guardar(.cambiarViaje(viajeId: viajeId, cambio: .quitarReserva(lista: editando.lista, id: id))) { cerrar() } }
                }
                Button("cancelar.", role: .cancel) {}
            }
            .preguntarAlDescartar(cambiado, preguntar: $descartar) { cerrar() }
        }
    }
}

// Un «AAAA-MM-DDTHH:MM» opcional: interruptor y selector de día y hora.
struct CampoFechaHora: View {
    let titulo: String
    @Binding var texto: String

    private static let formato: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = CalendarioBitacora.madrid.zona; f.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return f
    }()

    static func fecha(_ t: String) -> Date? {
        if let d = formato.date(from: String(t.prefix(16))) { return d }
        guard let d = LocalDay(iso: String(t.prefix(10))) else { return nil }
        return formato.date(from: d.iso + "T12:00")
    }

    var body: some View {
        Toggle(titulo, isOn: Binding(get: { !texto.isEmpty }, set: { texto = $0 ? Self.formato.string(from: Self.fecha(texto) ?? Date()) : "" }))
        if !texto.isEmpty {
            DatePicker(titulo, selection: Binding(get: { Self.fecha(texto) ?? Date() }, set: { texto = Self.formato.string(from: $0) }),
                       displayedComponents: [.date, .hourAndMinute])
                .labelsHidden()
                .environment(\.timeZone, CalendarioBitacora.madrid.zona)
                .environment(\.locale, Locale(identifier: "es_ES"))
        }
    }
}
