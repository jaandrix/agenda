import SwiftUI

@MainActor
@Observable
final class CalendarioModel {
    var mes: YearMonth
    var elegido: LocalDay
    private(set) var vista: VistaMes?

    init() {
        let hoy = CalendarioBitacora.madrid.dia(de: Date())
        mes = hoy.yearMonth
        elegido = hoy
    }

    func cargar(_ c: AppCoordinator) async {
        let doc = await c.documentoVisible()
        let m = mes
        let v: VistaMes? = await Task.detached(priority: .userInitiated) {
            doc.map { LecturaCalendario.mes($0, m) }
        }.value
        if m == mes { vista = v }
    }

    func moverMes(_ n: Int) {
        var y = mes.year, m = mes.month + n
        while m < 1 { m += 12; y -= 1 }
        while m > 12 { m -= 12; y += 1 }
        mes = YearMonth(year: y, month: m)!
        elegido = LocalDay(year: y, month: m, day: 1)!
    }
}

struct CalendarioView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var modelo = CalendarioModel()
    @State private var borrando: EventoDia?
    @State private var aviso: String?

    private let hoy = CalendarioBitacora.madrid.dia(de: Date())
    private let columnas = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)

    var body: some View {
        List {
            Section {
                VStack(spacing: Espacio.s) {
                    HStack {
                        Button { modelo.moverMes(-1) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                            .accessibilityLabel("mes anterior")
                        Spacer()
                        Text(nombreMes).font(Tipo.subtitulo).foregroundStyle(Paleta.texto)
                        Spacer()
                        Button { modelo.moverMes(1) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }
                            .accessibilityLabel("mes siguiente")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Paleta.texto)
                    LazyVGrid(columns: columnas, spacing: 4) {
                        ForEach(["l", "m", "x", "j", "v", "s", "d"], id: \.self) { Text($0).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario) }
                        ForEach(0..<huecoInicial, id: \.self) { _ in Color.clear.frame(height: 44) }
                        ForEach(diasDelMes, id: \.self) { d in celda(d) }
                    }
                }
                .listRowBackground(Color.clear)
            }
            if let aviso { Section { Text(aviso).foregroundStyle(Paleta.error) } }
            Section {
                let eventos = modelo.vista?.porDia[modelo.elegido] ?? []
                if eventos.isEmpty {
                    Text("nada este día.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).listRowBackground(Paleta.superficie)
                }
                ForEach(eventos) { e in
                    Button { abrir(e) } label: {
                        HStack(alignment: .firstTextBaseline, spacing: Espacio.m) {
                            Text(e.hora ?? "").font(Tipo.mono).foregroundStyle(Paleta.textoSecundario).frame(width: 44, alignment: .leading)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.titulo).font(Tipo.cuerpo).foregroundStyle(Paleta.texto)
                                let meta = [e.lugar, e.notas].filter { !$0.isEmpty }.joined(separator: ", ")
                                if !meta.isEmpty { Text(meta).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).lineLimit(2) }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(Paleta.superficie)
                    .swipeActions(edge: .trailing) {
                        if e.editable {
                            Button("borrar.", role: .destructive) { borrando = e }
                        }
                    }
                }
                Button {
                    c.modal = .evento(EditorEvento(id: OperacionBitacora.nuevoIdEntrada(), nuevo: true, fecha: modelo.elegido))
                } label: {
                    Text("+ evento.").font(Tipo.cuerpoFuerte).foregroundStyle(Paleta.acento).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }
                .listRowBackground(Paleta.superficie)
            } header: {
                Text(nombreDia(modelo.elegido)).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).textCase(nil)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Paleta.fondo)
        .navigationTitle("calendario.")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("hoy.") { modelo.mes = hoy.yearMonth; modelo.elegido = hoy }
            }
        }
        .refreshable { await c.sincronizar() }
        .task(id: "\(c.informe.revision)-\(modelo.mes.iso)") { await modelo.cargar(c) }
        .confirmationDialog("¿borrar este evento?", isPresented: Binding(get: { borrando != nil }, set: { if !$0 { borrando = nil } }), titleVisibility: .visible) {
            Button("borrar.", role: .destructive) {
                guard let e = borrando else { return }
                Task {
                    do { try await c.encolar(.borrarEntrada(id: e.id)); aviso = nil } catch { aviso = "no se pudo borrar en este iPhone." }
                }
            }
            Button("cancelar.", role: .cancel) {}
        }
    }

    private func celda(_ d: LocalDay) -> some View {
        let n = modelo.vista?.porDia[d]?.count ?? 0
        let elegido = d == modelo.elegido
        return Button { modelo.elegido = d } label: {
            VStack(spacing: 3) {
                Text("\(d.day)")
                    .font(d == hoy ? Tipo.cuerpoFuerte : Tipo.cuerpo)
                    .foregroundStyle(elegido ? Paleta.sobreAcento : (d == hoy ? Paleta.acento : Paleta.texto))
                    .frame(width: 34, height: 34)
                    .background(elegido ? Paleta.acento : Color.clear, in: Circle())
                HStack(spacing: 2) {
                    ForEach(0..<min(n, 3), id: \.self) { _ in Circle().fill(Paleta.acento).frame(width: 4, height: 4) }
                }
                .frame(height: 4)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(d.day)" + (n > 0 ? ", \(n) cosas" : ""))
    }

    private func abrir(_ e: EventoDia) {
        guard e.editable else { return }
        c.modal = .evento(EditorEvento(id: e.id, nuevo: false, fecha: modelo.elegido, hora: e.hora, titulo: e.titulo, lugar: e.lugar, notas: e.notas))
    }

    private var diasDelMes: [LocalDay] {
        var r: [LocalDay] = []
        var d = LocalDay(year: modelo.mes.year, month: modelo.mes.month, day: 1)!
        while d.yearMonth == modelo.mes { r.append(d); d = d.sumando(dias: 1) }
        return r
    }

    // Semanas que empiezan en lunes.
    private var huecoInicial: Int {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let f = cal.date(from: DateComponents(year: modelo.mes.year, month: modelo.mes.month, day: 1, hour: 12))!
        return (cal.component(.weekday, from: f) + 5) % 7
    }

    private var nombreMes: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "LLLL yyyy"
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        f.timeZone = cal.timeZone
        return f.string(from: cal.date(from: DateComponents(year: modelo.mes.year, month: modelo.mes.month, day: 1, hour: 12))!) + "."
    }

    private func nombreDia(_ d: LocalDay) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "EEEE d 'de' MMMM"
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        f.timeZone = cal.timeZone
        return f.string(from: cal.date(from: DateComponents(year: d.year, month: d.month, day: d.day, hour: 12))!)
    }
}
