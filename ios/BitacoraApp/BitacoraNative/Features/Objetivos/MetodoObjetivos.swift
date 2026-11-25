import SwiftUI

// 0.24: el método de los objetivos (js/bajo-demanda/metodo.js) y el tablero. En el propio objetivo: `mandala`
// ({ pilares: 8 × { texto, acciones: 8 } }) y `kaizenHabitId`, la rutina diaria del paso kaizen en `habits`
// ({ id, texto, activo, completadas, objetivoId, kaizen }). El tablero mueve `status`. «Para qué», hansei y pasar
// una acción del mandala a rutina siguen en la web.

struct PilarMandala: Sendable, Equatable {
    let texto: String
    let acciones: [String]
    var hechas: Int { acciones.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.count }
}

struct KaizenObjetivo: Sendable, Equatable {
    let id, texto: String
    let hechos: Set<String>

    // Días seguidos hasta hoy (si hoy aún no, hasta ayer).
    func racha(hoy: LocalDay) -> Int {
        var d = hechos.contains(hoy.iso) ? hoy : hoy.sumando(dias: -1)
        var n = 0
        while hechos.contains(d.iso) && n < 3660 { n += 1; d = d.sumando(dias: -1) }
        return n
    }
}

enum LecturaMetodo {
    static func pilares(_ o: [String: JSONValue]) -> [PilarMandala] {
        let lista = o["mandala"]?["pilares"]?.lista ?? []
        return (0..<8).map { i in
            let p = lista[safe: i]?.objeto
            let acciones = p?["acciones"]?.lista ?? []
            return PilarMandala(texto: p?["texto"]?.texto ?? "", acciones: (0..<8).map { acciones[safe: $0]?.texto ?? "" })
        }
    }

    static func kaizen(_ o: [String: JSONValue], habits: [JSONValue]) -> KaizenObjetivo? {
        guard let hid = o["kaizenHabitId"]?.comoId,
              let h = habits.first(where: { $0["id"]?.comoId == hid })?.objeto, h["activo"]?.booleano != false else { return nil }
        let hechos = Set((h["completadas"]?.objeto ?? [:]).filter { $0.value != .bool(false) && $0.value != .null }.keys)
        return KaizenObjetivo(id: hid, texto: h["texto"]?.texto ?? h["name"]?.texto ?? "", hechos: hechos)
    }
}

enum MetodoOp {
    static let kaizen = "kaizenObjetivo"
    static let quitarKaizen = "quitarKaizenObjetivo"
    static let pilar = "pilarObjetivo"
    static let estado = "estadoObjetivo"
    static let tipos: Set<String> = [kaizen, quitarKaizen, pilar, estado]

    static func claves(_ tipo: String) -> [String] { tipo == pilar || tipo == estado ? ["entries"] : ["entries", "habits"] }

    static func opKaizen(objetivo: String, habito: String, texto: String) -> OperacionBitacora {
        OperacionesExtra.op(kaizen, ["id": .string(objetivo), "habito": .string(habito), "texto": .string(texto)])
    }
    static func opQuitarKaizen(objetivo: String) -> OperacionBitacora { OperacionesExtra.op(quitarKaizen, ["id": .string(objetivo)]) }
    static func opPilar(objetivo: String, indice: Int, texto: String, acciones: [String]) -> OperacionBitacora {
        OperacionesExtra.op(pilar, ["id": .string(objetivo), "i": .number(String(indice)), "texto": .string(texto), "acciones": .array(acciones.map { .string($0) })])
    }
    static func opEstado(objetivo: String, estado e: String) -> OperacionBitacora { OperacionesExtra.op(estado, ["id": .string(objetivo), "estado": .string(e)]) }

    static func aplicar(_ tipo: String, _ d: [String: JSONValue], _ valores: [String: JSONValue?]) -> [String: JSONValue?] {
        guard let gid = d["id"]?.texto, var lista = (valores["entries"] ?? nil)?.lista,
              let n = lista.firstIndex(where: { $0["id"]?.comoId == gid && $0["type"]?.texto == "goal" }), var g = lista[n].objeto else { return valores }
        var r = valores
        var habits = (valores["habits"] ?? nil)?.lista ?? []
        switch tipo {
        case estado:
            guard let e = d["estado"]?.texto, LecturaObjetivos.estados.contains(e), g["status"]?.texto != e else { return valores }
            g["status"] = .string(e)
        case pilar:
            guard case .number(let s)? = d["i"], let i = Int(s), (0..<8).contains(i) else { return valores }
            var m = g["mandala"]?.objeto ?? [:]
            var pilares = m["pilares"]?.lista ?? []
            while pilares.count < 8 { pilares.append(.object(["texto": .string(""), "acciones": .array(Array(repeating: .string(""), count: 8))])) }
            let acciones = (0..<8).map { k -> JSONValue in .string(String(((d["acciones"]?.lista ?? [])[safe: k]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))) }
            var p = pilares[i].objeto ?? [:]
            p["texto"] = .string(String((d["texto"]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(200)))
            p["acciones"] = .array(acciones)
            pilares[i] = .object(p)
            m["pilares"] = .array(pilares)
            g["mandala"] = .object(m)
        case kaizen:
            let texto = String((d["texto"]?.texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))
            guard let hid = d["habito"]?.texto, !texto.isEmpty else { return valores }
            if !habits.contains(where: { $0["id"]?.comoId == hid }) {
                habits.append(.object(["id": .string(hid), "texto": .string(texto), "activo": .bool(true), "completadas": .object([:]),
                                       "objetivoId": .string(gid), "kaizen": .bool(true)]))
                r["habits"] = .some(.array(habits))
            }
            g["kaizenHabitId"] = .string(hid)
        case quitarKaizen:
            guard let hid = g["kaizenHabitId"]?.comoId else { return valores }
            if let m = habits.firstIndex(where: { $0["id"]?.comoId == hid }), var h = habits[m].objeto {
                h["activo"] = .bool(false)
                habits[m] = .object(h)
                r["habits"] = .some(.array(habits))
            }
            g.removeValue(forKey: "kaizenHabitId")
        default:
            return valores
        }
        lista[n] = .object(g)
        r["entries"] = .some(.array(lista))
        return r
    }
}

// openPilar: qué necesitas para el objetivo y ocho acciones concretas.
struct EditorPilar: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let objetivoId: String
    let objetivo: String
    let indice: Int
    @State private var texto: String
    @State private var acciones: [String]
    @State private var descartar = false
    private let original: [String]

    init(objetivoId: String, objetivo: String, indice: Int, pilar: PilarMandala) {
        self.objetivoId = objetivoId; self.objetivo = objetivo; self.indice = indice
        _texto = State(initialValue: pilar.texto)
        _acciones = State(initialValue: pilar.acciones)
        original = [pilar.texto] + pilar.acciones
    }

    private var cambiado: Bool { ([texto] + acciones).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) } != original.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) } }

    var body: some View {
        NavigationStack {
            FormCasa {
                Section {
                    TextField("forma física, constancia, dinero…", text: $texto)
                } header: { Text("qué necesitas para «\(objetivo.lowercased())».") }
                Section("ocho acciones concretas.") {
                    ForEach(0..<8, id: \.self) { k in
                        TextField("acción \(k + 1).", text: $acciones[k], axis: .vertical).lineLimit(1...3)
                    }
                }
            }
            .navigationTitle("pilar.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { if cambiado { descartar = true } else { cerrar() } } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        Task { if await c.guardar(MetodoOp.opPilar(objetivo: objetivoId, indice: indice, texto: texto, acciones: acciones)) { cerrar() } }
                    }
                }
            }
            .preguntarAlDescartar(cambiado, preguntar: $descartar) { cerrar() }
        }
    }
}

// El paso kaizen y el mandala dentro de la ficha del objetivo: dos tarjetas blancas; el mandala, en rejilla de squircles.
struct MetodoSecciones: View {
    @Environment(AppCoordinator.self) private var c
    let objetivo: Objetivo
    @State private var nuevoPaso = ""
    @State private var cambiarPaso = false
    @State private var pilar: Int?

    private var hoy: LocalDay { CalendarioBitacora.madrid.dia(de: Date()) }

    var body: some View {
        VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
            kaizen
            VStack(alignment: .leading, spacing: Medida.s) {
                VStack(alignment: .leading, spacing: 2) {
                    EtiquetaSeccion(texto: "mandala")
                    Text("ocho pilares, ocho acciones cada uno.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        .padding(.horizontal, Medida.xxs)
                }
                MandalaObjetivo(titulo: objetivo.titulo, pilares: objetivo.pilares) { pilar = $0 }
            }
            .tarjeta()
        }
        .confirmationDialog("¿cambiar el paso kaizen?", isPresented: $cambiarPaso, titleVisibility: .visible) {
            Button("cambiar.", role: .destructive) { Task { await c.guardar(MetodoOp.opQuitarKaizen(objetivo: objetivo.id)) } }
            Button("cancelar.", role: .cancel) {}
        } message: { Text("la rutina actual se pausa; su historial se conserva.") }
        .hoja(item: Binding(get: { pilar.map(PilarAbierto.init) }, set: { pilar = $0?.id })) { a in
            EditorPilar(objetivoId: objetivo.id, objetivo: objetivo.titulo, indice: a.id,
                        pilar: objetivo.pilares[safe: a.id] ?? PilarMandala(texto: "", acciones: Array(repeating: "", count: 8))).environment(c)
        }
    }

    private var kaizen: some View {
        VStack(alignment: .leading, spacing: Medida.xs) {
            EtiquetaSeccion(texto: "paso kaizen")
            if let k = objetivo.kaizen {
                let hecho = k.hechos.contains(hoy.iso)
                let racha = k.racha(hoy: hoy)
                HStack(spacing: Medida.xxs) {
                    CasillaMarcar(hecha: hecho) { marcar(k, !hecho) }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(k.texto).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta)
                        Text(hecho ? "hecho hoy." : "hoy todavía no.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    }
                    Spacer(minLength: Medida.xs)
                    if racha > 0 { Chip(texto: "\(racha) \(racha == 1 ? "día" : "días").", tono: .naranja) }
                }
                .padding(.leading, -Medida.s)
                .accessibilityElement(children: .combine)
                .accessibilityValue(hecho ? "hecho hoy" : "pendiente hoy")
                .accessibilityAction { marcar(k, !hecho) }
                Button("cambiar el paso.") { cambiarPaso = true }
                    .font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
                    .frame(minHeight: Medida.toque)
                    .contentShape(Rectangle())
                    .buttonStyle(.pulsable(0.94))
                    .padding(.horizontal, Medida.xxs)
            } else {
                Text("el gesto más pequeño que te acerca a esto, tan fácil que puedas hacerlo hasta el peor día: «ponerme las zapatillas», «leer una página».")
                    .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, Medida.xxs)
                CampoObjetivos(texto: $nuevoPaso, sugerencia: "mi paso de cada día.", boton: "empezar.", accion: empezar)
            }
        }
        .tarjeta()
    }

    private func marcar(_ k: KaizenObjetivo, _ hecha: Bool) {
        let dia = hoy.iso
        Task { await c.guardar(.marcarRutina(id: k.id, dia: dia, hecha: hecha)) }
    }

    private func empezar() {
        let t = nuevoPaso.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        let hid = "habit_\(Int64(Date().timeIntervalSince1970 * 1000))_" + String(UUID().uuidString.prefix(5)).lowercased()
        Task { if await c.guardar(MetodoOp.opKaizen(objetivo: objetivo.id, habito: hid, texto: t)) { nuevoPaso = "" } }
    }
}

struct PilarAbierto: Identifiable { let id: Int }

// El tablero de la web (goalViewMode 'kanban'): una columna por estado. En el iPhone no se arrastra: cada tarjeta
// pasa al estado siguiente con su flecha o a cualquiera con su menú (mantener pulsado).
struct TableroObjetivos: View {
    let objetivos: [Objetivo]
    let abrir: (Objetivo) -> Void
    let mover: (Objetivo, String) -> Void

    var body: some View {
        ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: Medida.s) {
                ForEach(Array(LecturaObjetivos.estados.enumerated()), id: \.element) { n, e in columna(e).entradaEscalonada(n) }
            }
            .padding(.vertical, Medida.xxs)
        }
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
    }

    private func columna(_ e: String) -> some View {
        let grupo = objetivos.filter { (LecturaObjetivos.estados.contains($0.estado) ? $0.estado : "Pendiente") == e }
        return VStack(alignment: .leading, spacing: Medida.xs) {
            HStack(alignment: .firstTextBaseline) {
                Text(e.lowercased() + ".").font(Letra.seccion).foregroundStyle(Lienzo.tinta)
                Spacer()
                Text("\(grupo.count)").font(Letra.hora).foregroundStyle(Lienzo.tintaSecundaria)
            }
            .padding(.horizontal, Medida.xxs)
            if grupo.isEmpty {
                Text("nada.").font(Letra.pie).foregroundStyle(Lienzo.tintaTerciaria)
                    .frame(maxWidth: .infinity, minHeight: 64)
                    .overlay(RoundedRectangle(cornerRadius: Medida.radioFila, style: .continuous).strokeBorder(Lienzo.filoFuerte))
            }
            ForEach(grupo) { g in tarjeta(g, e) }
        }
        .frame(width: 250, alignment: .topLeading)
    }

    private func tarjeta(_ g: Objetivo, _ e: String) -> some View {
        let siguiente = LecturaObjetivos.estados.firstIndex(of: e).flatMap { LecturaObjetivos.estados[safe: $0 + 1] }
        return HStack(alignment: .center, spacing: Medida.xs) {
            Button { abrir(g) } label: {
                VStack(alignment: .leading, spacing: 6) {
                    Text(g.titulo.lowercased() + ".").font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).multilineTextAlignment(.leading)
                    if let a = g.avance { BarraFinaObjetivos(valor: a) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pulsable(0.97))
            if let siguiente {
                BotonRedondo(sistema: "arrow.right", tono: .sutil, tamano: 32, etiqueta: "pasar a " + siguiente.lowercased()) {
                    Haptica.ligera()
                    mover(g, siguiente)
                }
            }
        }
        .tarjeta(relleno: Medida.s, radio: Medida.radioFila)
        .contextMenu {
            ForEach(LecturaObjetivos.estados.filter { $0 != e }, id: \.self) { otro in
                Button("pasar a " + otro.lowercased() + ".") { mover(g, otro) }
            }
        }
    }
}
