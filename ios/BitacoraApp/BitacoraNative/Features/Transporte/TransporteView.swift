import SwiftUI

// js/bajo-demanda/transporte.js: tus paradas guardadas arriba con sus tiempos (las líneas que elegiste delante), la
// búsqueda por número, calle o línea, y recarga sola cada 30 s mientras se ve. Favoritas y líneas se guardan en
// `servicios.transporte` con operaciones propias; las paradas y los tiempos nunca entran en el documento.
struct TransporteView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var paradas: [Parada]?
    @State private var favoritas: [String] = []
    @State private var lineas: [String: [String]] = [:]
    @State private var tiempos: [String: TiemposParada] = [:]
    @State private var cargando: Set<String> = []
    @State private var busqueda = ""
    @State private var abierta: String?
    @State private var verTodas: Set<String> = []
    @State private var aviso: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                CabeceraApartado(titulo: "transporte", contexto: "el bus de zaragoza, en directo.") {
                    Button { Task { await recargar(forzar: true) } } label: {
                        Image(systemName: "arrow.clockwise").font(.system(size: 17, weight: .semibold)).foregroundStyle(Paleta.texto).frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain).accessibilityLabel("recargar")
                }
                if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.error).padding(.top, Espacio.s) }
                ForEach(favoritas, id: \.self) { clave in
                    if let p = parada(clave) { tarjeta(p) }
                }
                TextField("número, calle o línea", text: $busqueda)
                    .font(Tipo.cuerpo).textInputAutocapitalization(.never).autocorrectionDisabled().submitLabel(.search)
                    .padding(.horizontal, 14).frame(minHeight: 48)
                    .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: Radio.control))
                    .padding(.top, Espacio.l)
                if paradas == nil {
                    Text("cargando las paradas…").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.m)
                } else if paradas?.isEmpty == true {
                    Text("no se pudieron cargar las paradas. prueba a recargar.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.m)
                } else if busqueda.trimmingCharacters(in: .whitespaces).isEmpty {
                    Text("busca tu parada por su número (está en el poste), por la calle o por la línea. guárdala con la estrella y saldrá arriba con sus tiempos.")
                        .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.m)
                } else {
                    let r = resultados
                    if r.isEmpty { Text("no hay ninguna parada con eso.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.m) }
                    ForEach(r) { resultado($0) }
                }
                Text("tiempos de avanza y paradas del ayuntamiento de zaragoza. son estimaciones y pueden cambiar con el tráfico.")
                    .font(Tipo.pie).foregroundStyle(Paleta.textoApagado).padding(.top, Espacio.l)
            }
            .padding(.horizontal, 20).padding(.bottom, Espacio.xl)
        }
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .scrollDismissesKeyboard(.interactively)
        .task(id: c.informe.revision) { await leerDocumento() }
        .task { paradas = await c.entorno.servicios.transporte.paradas() }
        .task {
            while !Task.isCancelled {
                await recargar(forzar: false)
                try? await Task.sleep(for: .seconds(30))
            }
        }
    }

    private func parada(_ clave: String) -> Parada? {
        if let p = paradas?.first(where: { $0.clave == clave }) { return p }
        let partes = clave.split(separator: ":")
        guard partes.count == 2 else { return nil }
        return Parada(tipo: String(partes[0]), id: "", numero: String(partes[1]), nombre: "parada", lineas: [], lat: nil, lon: nil)
    }

    // trResultados: por número (empieza por) o línea exacta; si no, por nombre sin acentos. 30 como mucho.
    private var resultados: [Parada] {
        let q = busqueda.trimmingCharacters(in: .whitespaces).lowercased().folding(options: .diacriticInsensitive, locale: nil)
        guard let todas = paradas, !q.isEmpty else { return [] }
        let numero = q.allSatisfy(\.isNumber)
        return todas.filter { p in
            numero ? p.numero.hasPrefix(q) || p.lineas.contains { $0.lowercased() == q }
                : p.nombre.lowercased().folding(options: .diacriticInsensitive, locale: nil).contains(q) || p.lineas.contains { $0.lowercased() == q }
        }
        .sorted { ($0.numero == q ? 0 : 1, Int($0.numero) ?? 0) < ($1.numero == q ? 0 : 1, Int($1.numero) ?? 0) }
        .prefix(30).map { $0 }
    }

    private func leerDocumento() async {
        guard let doc = await c.documentoVisible() else { return }
        let tr = ((try? doc.valor(de: "servicios")) ?? nil)?["transporte"]
        favoritas = tr?["favoritos"]?.lista?.compactMap(\.texto) ?? []
        lineas = (tr?["lineas"]?.objeto ?? [:]).mapValues { $0.lista?.compactMap(\.texto) ?? [] }
    }

    private func recargar(forzar: Bool) async {
        let claves = Set(favoritas + (abierta.map { [$0] } ?? []))
        await withTaskGroup(of: Void.self) { g in
            for clave in claves where clave.hasPrefix("bus:") { g.addTask { await cargar(clave, forzar: forzar) } }
        }
    }

    private func cargar(_ clave: String, forzar: Bool) async {
        let poste = String(clave.dropFirst(4))
        cargando.insert(clave)
        tiempos[clave] = await c.entorno.servicios.transporte.tiempos(poste: poste, forzar: forzar)
        cargando.remove(clave)
    }

    // .tr-fav: cabecera con icono, nombre y poste; las llegadas por línea y destino; la hora de la lectura y «quitar.».
    private func tarjeta(_ p: Parada) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            cabecera(p, estrella: false)
            llegadas(p, compacto: true)
            HStack {
                Text(pie(p)).font(Tipo.pie).foregroundStyle(Paleta.textoApagado)
                Spacer()
                Button("quitar.") { favorita(p.clave, false) }.font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).frame(minHeight: 44)
            }
        }
        .padding(.horizontal, 16).padding(.top, 12)
        .background(Paleta.superficie, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .padding(.top, Espacio.m)
    }

    private func resultado(_ p: Parada) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                abierta = abierta == p.clave ? nil : p.clave
                if abierta != nil, p.tipo == "bus" { Task { await cargar(p.clave, forzar: false) } }
            } label: { cabecera(p, estrella: true) }
            .buttonStyle(.plain)
            if abierta == p.clave {
                llegadas(p, compacto: false)
                Text(pie(p)).font(Tipo.pie).foregroundStyle(Paleta.textoApagado).padding(.bottom, Espacio.s)
            }
        }
        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
    }

    private func cabecera(_ p: Parada, estrella: Bool) -> some View {
        HStack(spacing: 12) {
            Group {
                if p.tipo == "tram" { Image(systemName: "tram.fill").font(.system(size: 18)) } else { IconoBus().frame(width: 22, height: 22) }
            }
            .foregroundStyle(Paleta.texto).frame(width: 36, height: 36).background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 1) {
                Text(p.nombre.lowercased()).font(Tipo.poppins(16, .semibold, estilo: .body)).foregroundStyle(Paleta.texto).lineLimit(2)
                Text("\(p.tipo == "tram" ? "tranvía" : "poste") \(p.numero)" + (p.lineas.isEmpty ? "" : ", \(p.lineas.count == 1 ? "línea" : "líneas") \(p.lineas.joined(separator: ", "))"))
                    .font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if estrella {
                let fav = favoritas.contains(p.clave)
                Button { favorita(p.clave, !fav) } label: {
                    Image(systemName: fav ? "star.fill" : "star").font(.system(size: 18)).foregroundStyle(fav ? Paleta.acento : Paleta.textoSecundario).frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(fav ? "quitar de tus paradas" : "guardar en tus paradas")
            }
        }
        .frame(minHeight: 56)
        .contentShape(Rectangle())
    }

    // trTiemposHtml: por línea y destino, el primero grande y el siguiente al lado. En las guardadas, solo las líneas
    // elegidas (tocar una línea la elige o la quita) y «+ n líneas más.».
    @ViewBuilder private func llegadas(_ p: Parada, compacto: Bool) -> some View {
        if p.tipo != "bus" {
            Text("el tranvía no publica sus tiempos ahora mismo.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s)
        } else if let t = tiempos[p.clave] {
            let grupos = Self.agrupar(t.llegadas)
            let mias = lineas[p.clave] ?? []
            let todas = !compacto || mias.isEmpty || verTodas.contains(p.clave)
            let vis = todas ? grupos : grupos.filter { mias.contains($0.linea) }
            if grupos.isEmpty {
                Text((t.error ?? "ahora no hay buses previstos en esta parada.").lowercased()).font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s)
            } else if vis.isEmpty {
                Text("\(mias.count == 1 ? "el" : "las líneas") \(mias.joined(separator: ", ")) sin buses previstos ahora.").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s)
            }
            ForEach(vis, id: \.clave) { g in
                HStack(spacing: 12) {
                    let suya = mias.contains(g.linea)
                    Button { if compacto { linea(p.clave, g.linea, !suya) } } label: {
                        Text(g.linea).font(Tipo.poppins(14, .bold, estilo: .footnote)).monospacedDigit()
                            .foregroundStyle(suya ? Paleta.sobreAcento : Paleta.texto)
                            .frame(minWidth: 40, minHeight: 30)
                            .background(suya ? Paleta.acento : Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    .disabled(!compacto)
                    .accessibilityLabel("línea \(g.linea)" + (compacto ? (suya ? ", elegida" : "") : ""))
                    Text(g.destino.lowercased()).font(Tipo.poppins(14, .regular, estilo: .footnote)).foregroundStyle(Paleta.textoSecundario).lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(Self.minutos(g.min.first ?? nil)).font(Tipo.poppins(17, .bold, estilo: .body)).monospacedDigit()
                            .foregroundStyle(g.min.first == 0 ? Paleta.acento : Paleta.texto)
                        if g.min.count > 1 { Text("luego \(Self.minutos(g.min[1]))").font(Tipo.poppins(11, .regular, estilo: .caption2)).foregroundStyle(Paleta.textoSecundario) }
                    }
                }
                .frame(minHeight: 44)
            }
            if compacto && !mias.isEmpty && grupos.count > vis.count {
                Button("+ \(grupos.count - vis.count) \(grupos.count - vis.count == 1 ? "línea" : "líneas") más.") { verTodas.insert(p.clave) }
                    .font(Tipo.pie).foregroundStyle(Paleta.acento).frame(minHeight: 36)
            } else if compacto && !mias.isEmpty && verTodas.contains(p.clave) {
                Button("solo las tuyas.") { verTodas.remove(p.clave) }.font(Tipo.pie).foregroundStyle(Paleta.acento).frame(minHeight: 36)
            } else if compacto && mias.isEmpty && grupos.count > 1 {
                Text("toca una línea para ver solo esa.").font(Tipo.pie).foregroundStyle(Paleta.textoApagado).padding(.top, 4)
            }
        } else {
            Text("mirando los tiempos…").font(Tipo.pie).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s)
        }
    }

    private func pie(_ p: Parada) -> String {
        if cargando.contains(p.clave) { return "actualizando…" }
        guard let t = tiempos[p.clave] else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "HH:mm"
        return "a las \(f.string(from: t.hora))."
    }

    struct Grupo { let linea: String; let destino: String; var min: [Int?]; var clave: String { linea + "|" + destino } }
    static func agrupar(_ l: [Llegada]) -> [Grupo] {
        var g: [Grupo] = []
        for x in l {
            if let i = g.firstIndex(where: { $0.linea == x.linea && $0.destino == x.destino }) { g[i].min.append(x.minutos) }
            else { g.append(Grupo(linea: x.linea, destino: x.destino, min: [x.minutos])) }
        }
        return g.sorted { (($0.min.first ?? nil) ?? 999) < (($1.min.first ?? nil) ?? 999) }
    }
    static func minutos(_ m: Int?) -> String { m.map { $0 == 0 ? "ya" : "\($0) min" } ?? "sin hora" }

    private func favorita(_ clave: String, _ activa: Bool) {
        let antes = favoritas
        favoritas = activa ? favoritas + [clave] : favoritas.filter { $0 != clave }
        Task {
            do {
                try await c.encolar(.transporteFavorita(clave: clave, activa: activa))
                aviso = nil
                if activa { await cargar(clave, forzar: false) }
            } catch {
                favoritas = antes
                aviso = "no se pudo guardar en este iPhone."
            }
        }
    }

    private func linea(_ clave: String, _ l: String, _ activa: Bool) {
        let antes = lineas
        var actuales = lineas[clave] ?? []
        if activa { actuales.append(l) } else { actuales.removeAll { $0 == l } }
        lineas[clave] = actuales
        verTodas.remove(clave)
        Task {
            do { try await c.encolar(.transporteLinea(clave: clave, linea: l, activa: activa)); aviso = nil } catch {
                lineas = antes
                aviso = "no se pudo guardar en este iPhone."
            }
        }
    }
}
