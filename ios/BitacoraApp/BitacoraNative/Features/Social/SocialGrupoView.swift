import SwiftUI

// Un grupo de gastos (renderGrupoGastos en js/social.js): tu saldo, lo que has gastado, el total, los gastos por día y los
// saldos con «cómo saldar.» (el mínimo de pagos; «pagado.» apunta la transferencia como marcarPagoSaldado).
struct SocialGrupoView: View {
    let id: String
    let estado: SocialEstado
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    @State private var vista: Vista = .gastos
    @State private var edicion: Edicion?
    @State private var editarGrupo = false
    @State private var salir: SocialGrupo?
    @State private var borrar: SocialGrupo?
    @State private var pago: CuentasSocial.Pago?

    enum Vista: Hashable { case gastos, saldos }
    struct Edicion: Identifiable { let id = UUID(); let gasto: SocialGasto? }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                if let d = estado.datos, let g = estado.grupo(id) {
                    contenido(g, d)
                } else {
                    EstadoVacio(texto: "este grupo ya no está.", icono: "social").padding(.top, Medida.xl)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
            .animation(Muelle.o(Muelle.suave, reducido: sinMovimiento), value: vista)
            .animation(Muelle.o(Muelle.rapido, reducido: sinMovimiento), value: estado.aviso)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .refreshable { await estado.recargar() }
        .hoja(item: $edicion) { e in
            if let g = estado.grupo(id), let d = estado.datos {
                SocialEditorGasto(estado: estado, grupo: g, datos: d, gasto: e.gasto).environment(c)
            }
        }
        .hoja(isPresented: $editarGrupo) {
            if let g = estado.grupo(id) { SocialEditorGrupo(estado: estado, grupo: g).environment(c) }
        }
        .confirmarBorrado($salir, titulo: { _ in "¿salir del grupo? si apareces en algún gasto, seguirás saliendo con tu nombre para que las cuentas cuadren." },
                          boton: "salir.") { g in
            Task { if await estado.hacer("no se pudo salir del grupo.", { try await $0.salirGrupo(g.id) }) { cerrar() } }
        }
        .confirmarBorrado($borrar, titulo: { _ in "¿borrar el grupo y todos sus gastos para todos sus miembros?" }) { g in
            Task { if await estado.hacer("no se pudo borrar el grupo.", { try await $0.borrarGrupo(g.id) }) { cerrar() } }
        }
        .confirmarBorrado($pago, titulo: { p in pregunta(p) }, boton: "pagado.") { p in
            let fila = SocialFilaGasto(grupoId: id, tipo: "transferencia", titulo: "Pago para saldar", centimos: p.centimos, pagadoPor: p.de, modo: "importes",
                                       reparto: [SocialParte(miembro: p.a, centimos: p.centimos)], fecha: SocialTexto.hoy(), categoria: nil)
            Task { if await estado.hacer("no se pudo apuntar el pago.", { try await $0.guardarGasto(fila, id: nil) }) { Haptica.exito() } }
        }
    }

    private func nombre(_ g: SocialGrupo, _ d: SocialDatos, _ m: String?) -> String { CuentasSocial.nombre(g, m, yo: d.yo, amigos: d.amigos) }

    private func pregunta(_ p: CuentasSocial.Pago) -> String {
        guard let d = estado.datos, let g = estado.grupo(id) else { return "¿ya está pagado?" }
        return "¿\(nombre(g, d, p.de)) ya ha pagado \(CuentasSocial.dinero(p.centimos)) a \(nombre(g, d, p.a))?"
    }

    @ViewBuilder private func contenido(_ g: SocialGrupo, _ d: SocialDatos) -> some View {
        let t = CuentasSocial.totales(g, yo: d.yo)
        let sub = [g.descripcion ?? "", SocialTexto.cuenta(g.miembros.count, "persona", "personas")].filter { !$0.isEmpty }.joined(separator: ", ")
        CabeceraPagina(titulo: g.nombre.lowercased() + ".", subtitulo: sub + ".") {
            MenuRedondo(etiqueta: "opciones del grupo") {
                Button("editar.") { editarGrupo = true }
                Button("salir del grupo.") { salir = g }
                if g.creadorId == d.yo { Button("borrar grupo para todos.", role: .destructive) { borrar = g } }
            }
        }
        .padding(.bottom, Medida.xxs)
        if let aviso = estado.aviso {
            Text(aviso).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).padding(.horizontal, Medida.xxs)
        }
        TarjetaOscura {
            VStack(alignment: .leading, spacing: Medida.s) {
                CifraGrande(texto: (t.saldo > 0 ? "+" : "") + CuentasSocial.dinero(t.saldo), etiqueta: "mi saldo, " + CuentasSocial.textoSaldo(t.saldo),
                            punto: t.saldo == 0 ? nil : Lienzo.naranja, sobreOscuro: true)
                HStack(spacing: Medida.l) {
                    cifraPequena("mis gastos.", t.mio)
                    cifraPequena("total del grupo.", t.total)
                }
            }
        }
        Button { Haptica.ligera(); edicion = Edicion(gasto: nil) } label: { Label("apuntar un gasto.", systemImage: "plus") }
            .buttonStyle(.capsula(.naranja, ancho: true))
        SegmentoCapsula(opciones: [.init(valor: Vista.gastos, titulo: "gastos."), .init(valor: Vista.saldos, titulo: "saldos.")], elegido: $vista)
            .padding(.top, Medida.xxs)
        switch vista {
        case .gastos: gastos(g, d)
        case .saldos: saldos(g, d)
        }
    }

    private func cifraPequena(_ etiqueta: String, _ c: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(etiqueta).font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave)
            Text(CuentasSocial.dinero(c)).font(Letra.numero).foregroundStyle(Lienzo.sobreOscuro)
        }
    }

    @ViewBuilder private func gastos(_ g: SocialGrupo, _ d: SocialDatos) -> some View {
        if g.gastos.isEmpty {
            EstadoVacio(texto: "apunta el primer gasto con «apuntar un gasto.».", icono: "finanzas")
        } else {
            let mi = CuentasSocial.miMiembro(g, yo: d.yo)?.id
            let porFecha = Dictionary(grouping: g.gastos, by: \.fecha)
            ForEach(porFecha.keys.sorted(by: >), id: \.self) { f in
                TarjetaSeccion(titulo: SocialTexto.fecha(f), arriba: Medida.s, enTarjeta: false) {
                    TarjetaLista(elementos: porFecha[f] ?? []) { x in
                        Button { edicion = Edicion(gasto: x) } label: { filaGasto(x, g, d, mi) }.buttonStyle(EstiloFila())
                    }
                }
            }
        }
    }

    private func filaGasto(_ x: SocialGasto, _ g: SocialGrupo, _ d: SocialDatos, _ mi: String?) -> some View {
        let quien = nombre(g, d, x.pagadoPor)
        var detalle = x.tipo == "transferencia"
            ? "\(quien) → \(nombre(g, d, x.reparto.first?.miembro))"
            : "\(x.tipo == "ingreso" ? "recibido por" : "pagado por") \(quien == "tú" ? "ti" : quien)" + (x.categoria.map { ", \($0)" } ?? "")
        if x.tipo != "transferencia", let p = x.reparto.first(where: { $0.miembro == mi }) { detalle += ". tu parte \(CuentasSocial.dinero(p.centimos))" }
        return FilaImporte(titulo: x.titulo, detalle: detalle, cifra: (x.tipo == "ingreso" ? "−" : "") + CuentasSocial.dinero(x.centimos),
                           tono: x.tipo == "transferencia" ? Lienzo.tintaSecundaria : Lienzo.tinta)
    }

    @ViewBuilder private func saldos(_ g: SocialGrupo, _ d: SocialDatos) -> some View {
        let s = CuentasSocial.saldos(g)
        let pagos = CuentasSocial.comoSaldar(g)
        TarjetaSeccion(titulo: "saldos.", arriba: Medida.s) {
            ForEach(Array(g.miembros.enumerated()), id: \.element.id) { i, m in
                let v = s[m.id] ?? 0
                FilaDato(etiqueta: nombre(g, d, m.id), valor: (v > 0 ? "+" : "") + CuentasSocial.dinero(v),
                         tono: v > 0 ? Lienzo.positivo : v < 0 ? Lienzo.negativo : Lienzo.tintaSecundaria, separador: i < g.miembros.count - 1)
            }
        }
        TarjetaSeccion(titulo: "cómo saldar.", arriba: Medida.s) {
            if pagos.isEmpty {
                EstadoVacio(texto: "todo saldado.")
            } else {
                ForEach(Array(pagos.enumerated()), id: \.element.id) { i, p in
                    if i > 0 { SeparadorFila(sangria: 0) }
                    HStack(spacing: Medida.s) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(frase(g, d, p)).font(Letra.cuerpo).foregroundStyle(Lienzo.tinta).lineLimit(2)
                            Text(CuentasSocial.dinero(p.centimos)).font(Letra.numero).foregroundStyle(Lienzo.tinta)
                        }
                        Spacer(minLength: Medida.xs)
                        Button("pagado.") { pago = p }.buttonStyle(.capsula(.claro))
                    }
                    .frame(minHeight: 56)
                }
            }
        }
    }

    // fraseSaldar.
    private func frase(_ g: SocialGrupo, _ d: SocialDatos, _ p: CuentasSocial.Pago) -> String {
        let yo = CuentasSocial.miMiembro(g, yo: d.yo)?.id
        if p.de == yo { return "tú pagas a \(nombre(g, d, p.a))." }
        if p.a == yo { return "\(nombre(g, d, p.de)) te paga." }
        return "\(nombre(g, d, p.de)) paga a \(nombre(g, d, p.a))."
    }
}

// openGrupoGastos / guardarGrupoGastos: nombre, descripción, amigos de bitácora y gente sin cuenta. Al editar, los que ya
// están no se quitan (para eso cada uno sale del grupo).
struct SocialEditorGrupo: View {
    let estado: SocialEstado
    let grupo: SocialGrupo?
    @Environment(\.dismiss) private var cerrar
    @State private var nombre: String
    @State private var descripcion: String
    @State private var elegidos: Set<String> = []
    @State private var invitados: [String] = []
    @State private var invitado = ""
    @State private var guardando = false

    init(estado: SocialEstado, grupo: SocialGrupo?) {
        self.estado = estado
        self.grupo = grupo
        _nombre = State(initialValue: grupo?.nombre ?? "")
        _descripcion = State(initialValue: grupo?.descripcion ?? "")
    }

    var body: some View {
        let d = estado.datos
        let dentro = Set((grupo?.miembros ?? []).compactMap(\.userId))
        let libres = (d?.amigos ?? []).filter { !dentro.contains($0.friendId) }
        NavigationStack {
            FormCasa {
                Section {
                    TextField("viaje a lisboa, piso, cena de navidad…", text: $nombre)
                    TextField("descripción (opcional).", text: $descripcion)
                }
                Section("quién está.") {
                    if let grupo, let d {
                        ForEach(grupo.miembros) { m in
                            HStack {
                                Text(CuentasSocial.nombre(grupo, m.id, yo: d.yo, amigos: d.amigos))
                                Spacer()
                                if m.userId == nil { Text("sin cuenta.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria) }
                            }
                        }
                    } else {
                        Text("tú")
                    }
                    ForEach(libres) { a in
                        Toggle(a.nombre, isOn: Binding(get: { elegidos.contains(a.friendId) },
                                                       set: { if $0 { elegidos.insert(a.friendId) } else { elegidos.remove(a.friendId) } }))
                            .toggleStyle(InterruptorCasa())
                    }
                    if (d?.amigos ?? []).isEmpty {
                        Text("aún no tienes amigos en bitácora: añádelos en «amigos.» o apunta aquí a la gente sin cuenta.")
                            .font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                    }
                }
                Section("alguien sin bitácora.") {
                    ForEach(Array(invitados.enumerated()), id: \.offset) { i, n in
                        HStack {
                            Text(n)
                            Spacer()
                            Button { invitados.remove(at: i) } label: { Image(systemName: "xmark").font(.system(size: 12, weight: .bold)) }
                                .buttonStyle(.pulsable).accessibilityLabel("quitar a \(n)")
                        }
                    }
                    HStack {
                        TextField("nombre.", text: $invitado).submitLabel(.done).onSubmit(anadirInvitado)
                        Button("añadir.", action: anadirInvitado).disabled(invitado.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .navigationTitle(grupo == nil ? "nuevo grupo." : "grupo.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") { guardar(libres) }
                        .disabled(guardando || nombre.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func anadirInvitado() {
        let n = invitado.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty else { return }
        invitados.append(n)
        invitado = ""
    }

    private func guardar(_ libres: [SocialAmigo]) {
        let n = nombre.trimmingCharacters(in: .whitespaces)
        let desc = descripcion.trimmingCharacters(in: .whitespaces)
        var nuevos: [(userId: String?, nombre: String)] = []
        for a in libres where elegidos.contains(a.friendId) { nuevos.append((userId: a.friendId, nombre: a.nombre)) }
        for i in invitados { nuevos.append((userId: nil, nombre: i)) }
        let id = grupo?.id
        let miNombre = estado.datos?.miNombre ?? ""
        guardando = true
        Task {
            defer { guardando = false }
            let ok = await estado.hacer("no se pudo guardar el grupo.") {
                _ = try await $0.guardarGrupo(id: id, nombre: n, descripcion: desc.isEmpty ? nil : desc, nuevos: nuevos, miNombre: miNombre)
            }
            if ok { Haptica.exito(); cerrar() }
        }
    }
}

// openGastoCompartido / guardarGastoCompartido: gasto, transferencia o ingreso; a partes iguales, por partes o por importes.
struct SocialEditorGasto: View {
    let estado: SocialEstado
    let grupo: SocialGrupo
    let datos: SocialDatos
    let gasto: SocialGasto?
    @Environment(\.dismiss) private var cerrar
    @State private var tipo: String
    @State private var titulo: String
    @State private var importe: String
    @State private var fecha: Date
    @State private var pagadoPor: String
    @State private var categoria: String
    @State private var modo: String
    @State private var marcados: Set<String>
    @State private var valores: [String: String]
    @State private var para: String
    @State private var guardando = false
    @State private var borrar: SocialGasto?
    @State private var fallo: String?

    init(estado: SocialEstado, grupo: SocialGrupo, datos: SocialDatos, gasto: SocialGasto?) {
        self.estado = estado; self.grupo = grupo; self.datos = datos; self.gasto = gasto
        let yo = CuentasSocial.miMiembro(grupo, yo: datos.yo)?.id ?? grupo.miembros.first?.id ?? ""
        _tipo = State(initialValue: gasto?.tipo ?? "gasto")
        _titulo = State(initialValue: gasto?.titulo ?? "")
        _importe = State(initialValue: gasto.map { Self.euros($0.centimos) } ?? "")
        var cal = Calendar(identifier: .gregorian); cal.timeZone = CalendarioBitacora.madrid.zona
        let dia = gasto.flatMap { LocalDay(iso: $0.fecha) }
        _fecha = State(initialValue: dia.flatMap { cal.date(from: DateComponents(year: $0.year, month: $0.month, day: $0.day, hour: 12)) } ?? Date())
        _pagadoPor = State(initialValue: gasto?.pagadoPor ?? yo)
        _categoria = State(initialValue: gasto?.categoria ?? "")
        let modo = gasto?.tipo == "transferencia" ? "igual" : (gasto?.modo ?? "igual")
        _modo = State(initialValue: modo)
        let ids = grupo.miembros.map(\.id)
        _marcados = State(initialValue: Set(gasto.map { g in g.reparto.map(\.miembro) } ?? ids))
        var v: [String: String] = [:]
        for r in gasto?.reparto ?? [] {
            v[r.miembro] = modo == "importes" ? Self.euros(r.centimos) : r.partes.map { Self.numero($0) } ?? "1"
        }
        _valores = State(initialValue: v)
        _para = State(initialValue: gasto?.tipo == "transferencia" ? (gasto?.reparto.first?.miembro ?? "") : (grupo.miembros.first { $0.id != yo }?.id ?? ""))
    }

    private static func euros(_ c: Int) -> String { String(format: "%ld.%02ld", c / 100, abs(c % 100)) }
    private static func numero(_ x: Double) -> String { x == x.rounded() ? String(Int(x)) : String(x) }
    private static func leer(_ t: String?) -> Double { Double((t ?? "").replacingOccurrences(of: ",", with: ".")) ?? 0 }

    private var centimos: Int { CuentasSocial.centimos(importe) ?? 0 }

    private var reparto: [SocialParte] {
        if tipo == "transferencia" { return para.isEmpty ? [] : [SocialParte(miembro: para, centimos: centimos)] }
        var v: [String: Double] = [:]
        for m in grupo.miembros { v[m.id] = modo == "igual" ? (marcados.contains(m.id) ? 1 : 0) : Self.leer(valores[m.id]) }
        return CuentasSocial.reparto(miembros: grupo.miembros, modo: modo, valores: v, centimos: centimos)
    }

    private func nombre(_ id: String) -> String { CuentasSocial.nombre(grupo, id, yo: datos.yo, amigos: datos.amigos) }

    var body: some View {
        let r = reparto
        NavigationStack {
            FormCasa {
                Section {
                    Picker("tipo.", selection: $tipo) {
                        Text("gasto.").tag("gasto"); Text("transferencia.").tag("transferencia"); Text("ingreso.").tag("ingreso")
                    }
                    .pickerStyle(.segmented)
                    TextField("cena, gasolina, supermercado…", text: $titulo)
                    TextField("importe (€).", text: $importe).keyboardType(.decimalPad)
                    DatePicker("fecha.", selection: $fecha, displayedComponents: .date)
                    Picker(tipo == "transferencia" ? "de." : tipo == "ingreso" ? "recibido por." : "pagado por.", selection: $pagadoPor) {
                        ForEach(grupo.miembros) { m in Text(nombre(m.id)).tag(m.id) }
                    }
                    if tipo == "transferencia" {
                        Picker("para.", selection: $para) { ForEach(grupo.miembros) { m in Text(nombre(m.id)).tag(m.id) } }
                    } else {
                        Picker("categoría.", selection: $categoria) {
                            Text("sin categoría.").tag("")
                            ForEach(CuentasSocial.categorias, id: \.self) { Text($0 + ".").tag($0) }
                        }
                    }
                }
                if tipo != "transferencia" {
                    Section("para quién.") {
                        Picker("reparto.", selection: Binding(get: { modo }, set: cambiarModo)) {
                            Text("a partes iguales.").tag("igual"); Text("por partes.").tag("partes"); Text("por importes.").tag("importes")
                        }
                        ForEach(grupo.miembros) { m in filaReparto(m, r) }
                        if modo == "importes", centimos > 0 {
                            let suma = r.reduce(0) { $0 + $1.centimos }
                            if suma != centimos {
                                Text(suma < centimos ? "faltan \(CuentasSocial.dinero(centimos - suma)) por repartir." : "te pasas \(CuentasSocial.dinero(suma - centimos)).")
                                    .font(Letra.pie).foregroundStyle(Lienzo.negativo)
                            }
                        }
                    }
                }
                if let fallo {
                    Section { Text(fallo).font(Letra.pie).foregroundStyle(Lienzo.negativo) }
                }
                if let gasto {
                    Section { Button("borrar.", role: .destructive) { borrar = gasto } }
                }
            }
            .environment(\.locale, Locale(identifier: "es_ES"))
            .navigationTitle(gasto == nil ? "nuevo gasto." : "gasto.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) { Button("guardar.", action: guardar).disabled(guardando) }
            }
            .confirmarBorrado($borrar, titulo: { _ in "¿borrar este gasto para todo el grupo?" }) { x in
                Task { if await estado.hacer("no se pudo borrar.", { try await $0.borrarGasto(x.id) }) { cerrar() } }
            }
        }
    }

    @ViewBuilder private func filaReparto(_ m: SocialMiembro, _ r: [SocialParte]) -> some View {
        let parte = r.first { $0.miembro == m.id }.map { CuentasSocial.dinero($0.centimos) } ?? "—"
        if modo == "igual" {
            Toggle(isOn: Binding(get: { marcados.contains(m.id) }, set: { if $0 { marcados.insert(m.id) } else { marcados.remove(m.id) } })) {
                HStack {
                    Text(nombre(m.id))
                    Spacer()
                    Text(parte).font(Letra.numero).foregroundStyle(Lienzo.tintaSecundaria).padding(.trailing, Medida.xs)
                }
            }
            .toggleStyle(InterruptorCasa())
        } else {
            HStack {
                Text(nombre(m.id))
                Spacer()
                TextField("0", text: Binding(get: { valores[m.id] ?? "" }, set: { valores[m.id] = $0 }))
                    .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(maxWidth: 70)
                Text(parte).font(Letra.numero).foregroundStyle(Lienzo.tintaSecundaria).frame(minWidth: 80, alignment: .trailing)
            }
        }
    }

    // cambiarModoReparto: a importes, con lo que tocaba a cada uno; a los otros, marcado quien tenía algo.
    private func cambiarModo(_ nuevo: String) {
        guard nuevo != modo else { return }
        let actual = reparto
        if nuevo == "importes" {
            valores = Dictionary(uniqueKeysWithValues: grupo.miembros.map { m in (m.id, actual.first { $0.miembro == m.id }.map { Self.euros($0.centimos) } ?? "") })
        } else {
            let con = modo == "igual" ? marcados : Set(grupo.miembros.map(\.id).filter { Self.leer(valores[$0]) > 0 })
            marcados = con
            valores = Dictionary(uniqueKeysWithValues: grupo.miembros.map { ($0.id, con.contains($0.id) ? "1" : "") })
        }
        Haptica.seleccion()
        modo = nuevo
    }

    private func guardar() {
        let t = titulo.trimmingCharacters(in: .whitespaces)
        let tit = t.isEmpty && tipo == "transferencia" ? "Transferencia" : t
        let r = reparto
        if tit.isEmpty { fallo = "ponle un título."; return }
        if centimos <= 0 { fallo = "escribe el importe."; return }
        if r.isEmpty { fallo = "elige para quién es."; return }
        if tipo == "transferencia" && r.first?.miembro == pagadoPor { fallo = "una transferencia va de una persona a otra distinta."; return }
        if modo == "importes" && tipo != "transferencia" && r.reduce(0, { $0 + $1.centimos }) != centimos { fallo = "los importes no suman el total."; return }
        let fila = SocialFilaGasto(grupoId: grupo.id, tipo: tipo, titulo: tit, centimos: centimos, pagadoPor: pagadoPor,
                                   modo: tipo == "transferencia" ? "importes" : modo, reparto: r,
                                   fecha: CalendarioBitacora.madrid.dia(de: fecha).iso,
                                   categoria: tipo == "transferencia" || categoria.isEmpty ? nil : categoria)
        let id = gasto?.id
        fallo = nil
        guardando = true
        Task {
            defer { guardando = false }
            if await estado.hacer("no se pudo guardar el gasto.", { try await $0.guardarGasto(fila, id: id) }) {
                Haptica.exito()
                cerrar()
            } else {
                fallo = estado.aviso
            }
        }
    }
}
