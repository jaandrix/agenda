import SwiftUI
import UIKit

// Lo que pinta la portada, sacado de lo que ya leen Plan y Calendario (sin cálculos nuevos sobre los datos).
struct VistaInicio: Equatable {
    struct Cosa: Equatable, Identifiable {
        let id: String
        let hora: String?
        let titulo: String
        let notas: String
        let hecha: Bool
        let acento: Bool
        let tarea: TareaPlan?
        var suave = false
        var entradas = 0
        var evento: EventoDia?
    }
    let hoy: LocalDay
    let semana: [LocalDay]
    let conCosas: Set<LocalDay>
    var agenda: [Cosa]
    let sinDia: [TareaPlan]
    let pendientes: Int
    let hechas: Int
    var ciudad: Ciudad = .defecto
    // mobileBusPoste: la primera parada de bus guardada, si Transporte está a la vista.
    var poste: String?
    var lineas: [String] = []
    // El día elegido en la semana (mobileElegirDia); nil es hoy.
    var elegido: LocalDay?
    var dia: LocalDay { elegido ?? hoy }

    static func desde(_ doc: DocumentoBitacora, ahora: Date = Date(), elegido: LocalDay? = nil) -> VistaInicio {
        let hoy = CalendarioBitacora.madrid.diaLogico(ahora)
        let plan = LecturaPlanificador.vista(doc, desplazamiento: elegido.map { hoy.dias(hasta: $0) } ?? 0, ahora: ahora)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let semanaDe = cal.component(.weekday, from: cal.date(from: DateComponents(year: hoy.year, month: hoy.month, day: hoy.day, hour: 12))!)
        let lunes = hoy.sumando(dias: -((semanaDe + 5) % 7))
        let semana = (0..<7).map { lunes.sumando(dias: $0) }
        var meses = [hoy.yearMonth]
        if let ultimo = semana.last, ultimo.yearMonth != hoy.yearMonth { meses.append(ultimo.yearMonth) }
        if let primero = semana.first, primero.yearMonth != hoy.yearMonth { meses.append(primero.yearMonth) }
        var porDia: [LocalDay: [EventoDia]] = [:]
        for m in meses { porDia.merge(LecturaCalendario.mes(doc, m).porDia) { a, _ in a } }
        // renderMobileDiaPanel: lo apuntado como evento y como tarea a la misma hora se queda solo como tarea.
        let clave = { (t: String, h: String?) in "\(t.trimmingCharacters(in: .whitespaces).lowercased())|\(h ?? "")" }
        let enPlan = Set(plan.tareas.map { clave($0.titulo, $0.hora) })
        let eventos = (porDia[plan.dia] ?? []).filter { $0.tipo == "birthday" || !enPlan.contains(clave($0.titulo, $0.hora)) }.map {
            Cosa(id: "e" + $0.id, hora: $0.hora, titulo: $0.titulo, notas: $0.meta, hecha: false, acento: false, tarea: nil,
                 suave: $0.suave, entradas: $0.entradas, evento: $0)
        }
        let tareas = plan.tareas.map { Cosa(id: "t" + $0.id, hora: $0.hora, titulo: $0.titulo, notas: $0.notas, hecha: $0.hecha, acento: $0.arrastrada, tarea: $0) }
        let agenda = (eventos + tareas).sorted { ($0.hora ?? "") < ($1.hora ?? "") }
        let hechas = plan.tareas.filter(\.hecha).count
        var v = VistaInicio(hoy: hoy, semana: semana, conCosas: Set(semana.filter { !(porDia[$0] ?? []).isEmpty }),
                            agenda: agenda, sinDia: plan.dia == hoy ? plan.sinDia : [], pendientes: plan.tareas.count - hechas, hechas: hechas)
        v.elegido = plan.dia == hoy ? nil : plan.dia
        if let c = (try? doc.valor(de: "ciudadTiempo")) ?? nil, let n = c["nombre"]?.texto,
           let la = Dinero.decimal(c["lat"]), let lo = Dinero.decimal(c["lon"]) {
            v.ciudad = Ciudad(nombre: n, lat: NSDecimalNumber(decimal: la).doubleValue, lon: NSDecimalNumber(decimal: lo).doubleValue)
        }
        let tr = ((try? doc.valor(de: "servicios")) ?? nil)?["transporte"]
        if Apartados.visible("transporte", doc), let fav = tr?["favoritos"]?.lista?.compactMap(\.texto).first(where: { $0.hasPrefix("bus:") }) {
            v.poste = String(fav.dropFirst(4))
            v.lineas = tr?["lineas"]?[fav]?.lista?.compactMap(\.texto) ?? []
        }
        return v
    }
}

// «tu bus.»: el próximo de cada línea (las elegidas, si hay), del que llega antes al que más tarda, cuatro como mucho.
enum ResumenBus {
    static func lineas(_ t: TiemposParada, mias: [String]) -> [(String, Int)] {
        var vistas = Set<String>(), r: [(String, Int)] = []
        for x in t.llegadas.filter({ $0.minutos != nil && (mias.isEmpty || mias.contains($0.linea)) }).sorted(by: { $0.minutos! < $1.minutos! })
        where !vistas.contains(x.linea) {
            vistas.insert(x.linea)
            r.append((x.linea, x.minutos!))
        }
        return Array(r.prefix(4))
    }

    static func texto(_ t: TiemposParada?, mias: [String]) -> Text {
        guard let t else { return Text("mirando el próximo…") }
        let l = lineas(t, mias: mias)
        if l.isEmpty {
            if t.error != nil && t.llegadas.isEmpty && t.error != "El servicio de Avanza no responde" { return Text("sin datos ahora.") }
            return Text(mias.isEmpty ? "sin buses previstos ahora." : "bus \(mias.joined(separator: ", ")), sin buses previstos ahora.")
        }
        var r = Text("")
        for (i, (linea, m)) in l.enumerated() {
            if i > 0 { r = r + Text("; ") }
            r = r + Text("bus ") + Text(linea).fontWeight(.bold).foregroundColor(Paleta.texto) + Text(", ")
                + (m == 0 ? Text("ya").fontWeight(.bold).foregroundColor(Paleta.texto) : Text("en ") + Text("\(m) min").fontWeight(.bold).foregroundColor(Paleta.texto))
        }
        return r + Text(".")
    }
}

struct InicioView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaInicio?
    @State private var aviso: String?
    @State private var enVuelo = Set<String>()
    @State private var foto: Data?
    @State private var tiempo: Tiempo?
    @State private var bus: TiemposParada?
    @State private var elegido: LocalDay?

    var body: some View {
        ScrollView {
            TimelineView(.periodic(from: .now, by: 30)) { reloj in
                VStack(alignment: .leading, spacing: 0) {
                    InicioCuerpo(vista: vista, ahora: reloj.date, estado: c.informe.estado,
                                 marcar: { t in marcar(t) },
                                 abrir: { t in c.modal = .tarea(EditorTarea(id: t.id, nueva: false, dia: vista?.dia, titulo: t.titulo, hora: t.hora, notas: t.notas, deTrabajo: t.deTrabajo)) },
                                 irA: { c.pestana = $0 },
                                 foto: foto, tiempo: tiempo, bus: bus,
                                 abrirEvento: { e in if let d = vista?.dia { c.modal = .ficha(e, dia: d) } },
                                 elegir: { d in elegido = d == vista?.hoy ? nil : d },
                                 abrirPerfil: { c.web = Apartados.webURL("friends") },
                                 abrirTiempo: { c.modal = .tiempo },
                                 abrirBus: { c.pestana = .mas; c.rutaMas = ["transporte"] },
                                 aviso: aviso)
                }
                // Al cruzar las 4:00 cambia el día lógico: se vuelve a leer.
                .task(id: CalendarioBitacora.madrid.diaLogico(reloj.date)) { await cargar() }
                // El bus se pide como mucho cada 30 s y solo mientras se ve la portada (como la web).
                .task(id: "\(vista?.poste ?? "")-\(Int(reloj.date.timeIntervalSince1970 / 30))") { await cargarBus() }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, Espacio.xl)
        }
        .scrollIndicators(.hidden)
        .background(Paleta.fondo.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await c.sincronizar(); await cargarServicios(forzar: true) }
        .task(id: "\(c.informe.revision)-\(elegido?.iso ?? "")") { await cargar() }
        .task(id: vista?.ciudad.clave) { await cargarServicios(forzar: false) }
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        guard var v = await Task.detached(priority: .userInitiated, operation: { [elegido] in doc.map { VistaInicio.desde($0, elegido: elegido) } }).value, let doc else { vista = nil; return }
        vista = v
        // Los partidos de tus equipos (srv_p_) llegan de la red: se añaden después, sin esperar a pintar.
        let partidos = await c.entorno.servicios.deportes.eventos(doc, desde: v.dia, dias: 1)[v.dia] ?? []
        guard !partidos.isEmpty else { return }
        v.agenda = (v.agenda + partidos.map { VistaInicio.Cosa(id: "e" + $0.id, hora: $0.hora, titulo: $0.titulo, notas: $0.meta, hecha: false, acento: false, tarea: nil, evento: $0) })
            .sorted { ($0.hora ?? "") < ($1.hora ?? "") }
        if vista?.dia == v.dia { vista = v }
    }

    // Cada pieza por su lado: si una falla, las demás siguen.
    private func cargarServicios(forzar: Bool) async {
        let s = c.entorno.servicios
        let ciudad = vista?.ciudad ?? .defecto
        if tiempo == nil { tiempo = s.tiempo.guardado(ciudad) }
        let uid = c.sesion?.userId
        if let uid, foto == nil { foto = s.perfil.guardada(uid) }
        async let t = s.tiempo.actual(ciudad, forzar: forzar)
        if let uid { foto = await s.perfil.foto(uid) }
        if let nuevo = await t { tiempo = nuevo }
    }

    private func cargarBus() async {
        guard let poste = vista?.poste else { bus = nil; return }
        bus = await c.entorno.servicios.transporte.tiempos(poste: poste)
    }

    // Como Plan: un toque a la vez por tarea y, si la cola no se puede guardar, aviso (la vista se rehace con lo real).
    private func marcar(_ t: TareaPlan) {
        guard !enVuelo.contains(t.id) else { return }
        enVuelo.insert(t.id)
        Task {
            defer { enVuelo.remove(t.id) }
            do {
                try await c.encolar(.marcarTarea(id: t.id, hecha: !t.hecha, momentoMs: Int64(Date().timeIntervalSince1970 * 1000)))
                aviso = nil
            } catch {
                aviso = "no se pudo guardar el cambio en este iPhone."
                await cargar()
            }
        }
    }
}

// La portada de la PWA (renderMobileTopbar + .m-home-editorial): foto, marca centrada y tiempo arriba; la semana;
// «ahora.» como único bloque con relieve, con el bus debajo; «hoy.» con su rayita, la agenda entera del día y los
// pendientes sin día resumidos.
struct InicioCuerpo: View {
    let vista: VistaInicio?
    let ahora: Date
    let estado: EstadoSync
    var marcar: (TareaPlan) -> Void = { _ in }
    var abrir: (TareaPlan) -> Void = { _ in }
    var irA: (Pestana) -> Void = { _ in }
    var foto: Data?
    var tiempo: Tiempo?
    var bus: TiemposParada?
    var abrirEvento: (EventoDia) -> Void = { _ in }
    var abrirPerfil: () -> Void = {}
    var abrirTiempo: () -> Void = {}
    var abrirBus: () -> Void = {}
    var elegir: (LocalDay) -> Void = { _ in }
    var aviso: String?

    private var hora: String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = CalendarioBitacora.madrid.zona
        let c = cal.dateComponents([.hour, .minute], from: ahora)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            barra
            if let aviso { Text(aviso).font(Tipo.pie).foregroundStyle(Paleta.error).padding(.top, Espacio.s) }
            if let v = vista {
                semana(v)
                bloqueAhora(v)
                cabeceraDia(v)
                if v.agenda.isEmpty {
                    Text(v.dia == v.hoy ? "nada para hoy." : "nada este día.").font(Tipo.cuerpo).foregroundStyle(Paleta.textoSecundario).padding(.vertical, Espacio.s)
                }
                ForEach(v.agenda) { cosa in
                    if let t = cosa.tarea {
                        FilaAgenda(hora: cosa.hora, titulo: cosa.titulo, notas: cosa.notas, hecho: cosa.hecha, acento: cosa.acento) {
                            marcar(t)
                        } abrir: { abrir(t) }
                    } else if let e = cosa.evento {
                        FilaEvento(hora: cosa.hora, titulo: cosa.titulo, detalle: cosa.notas, suave: cosa.suave, entradas: cosa.entradas) { abrirEvento(e) }
                    }
                }
                if !v.sinDia.isEmpty {
                    CabeceraSeccion(titulo: "pendientes sin día.", detalle: "\(v.sinDia.count)")
                    if let t = v.sinDia.first {
                        FilaAgenda(hora: nil, titulo: t.titulo, notas: t.notas, hecho: t.hecha, mostrarHora: false) { marcar(t) } abrir: { abrir(t) }
                    }
                    if v.sinDia.count > 1 { AccionTexto(texto: "ver todas.") { irA(.plan) } }
                }
            } else {
                ProgressView().tint(Paleta.textoSecundario).frame(maxWidth: .infinity).padding(.top, Espacio.xl)
            }
        }
    }

    // .m-topbar (60 de alto): la foto de 36 a la izquierda, «bitácora.» centrada a 19 y el tiempo a la derecha; mientras
    // la nube trabaja, su estado ocupa el sitio del tiempo.
    private var barra: some View {
        ZStack {
            (Text("bitácora").foregroundColor(Paleta.texto) + Text(".").foregroundColor(Paleta.acento))
                .font(Tipo.poppins(19, .bold, estilo: .title3)).kerning(-0.4)
                .accessibilityAddTraits(.isHeader)
            HStack {
                Button(action: abrirPerfil) { Avatar(foto: foto, tamano: 36) }
                    .buttonStyle(.plain).frame(width: 44, height: 44, alignment: .leading)
                    .accessibilityLabel("mi perfil")
                Spacer()
                if estado != .reposo {
                    IndicadorSync(estado: estado)
                } else if let t = tiempo {
                    Button(action: abrirTiempo) {
                        HStack(spacing: 7) {
                            Image(systemName: Tiempo.simbolo[t.tipo] ?? "cloud.fill").font(.system(size: 17)).foregroundStyle(Paleta.texto)
                            Text("\(Int(t.temp.rounded()))°").font(Tipo.poppins(15, .semibold)).foregroundStyle(Paleta.texto).monospacedDigit()
                            if let s = t.sensacion {
                                Text("(\(Int(s.rounded()))°)").font(Tipo.poppins(12, .medium, estilo: .caption)).foregroundStyle(Paleta.textoSecundario)
                            }
                        }
                        .frame(minWidth: 44, minHeight: 44, alignment: .trailing)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(vista?.ciudad.nombre ?? ""): \(Tiempo.texto[t.tipo] ?? ""), \(Int(t.temp.rounded())) grados")
                }
            }
        }
        .frame(minHeight: 60)
    }

    // La semana plana: inicial del día y número; hoy en el acento, punto bajo los días con algo en el calendario.
    private func semana(_ v: VistaInicio) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(v.semana.enumerated()), id: \.offset) { n, d in
                let sel = d == v.dia
                Button { elegir(d) } label: {
                    VStack(spacing: 6) {
                        Text(["L", "M", "X", "J", "V", "S", "D"][n]).font(Tipo.poppins(12, .medium, estilo: .caption))
                            .foregroundStyle(sel ? Paleta.texto : Paleta.textoSecundario)
                        Text("\(d.day)")
                            .font(Tipo.poppins(17, sel || d == v.hoy ? .bold : .medium, estilo: .body)).monospacedDigit()
                            .foregroundStyle(sel ? Paleta.sobreAcento : (d < v.hoy ? Paleta.textoSecundario : Paleta.texto))
                            .frame(width: 38, height: 38)
                            .background(sel ? Paleta.acento : .clear, in: Circle())
                            .overlay(Circle().strokeBorder(d == v.hoy && !sel ? Paleta.texto : .clear, lineWidth: 1.5))
                        Circle().fill(v.conCosas.contains(d) ? Paleta.acento : .clear).frame(width: 5, height: 5)
                    }
                    .padding(.top, 6).padding(.bottom, 8)
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(sel ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(.top, Espacio.s)
    }

    // .m-ahora-bloque: margen 22/6, relleno 18 18 16, radio 20. «ahora.» a 22, la hora a 64, «siguiente,» a 17 y,
    // tras una raya del acento al 18 %, el bus.
    // .m-dia-titulo 34 con .m-dia-sub 16 debajo y la rayita del acento (28 × 3, a 12).
    private func cabeceraDia(_ v: VistaInicio) -> some View {
        let n = v.hoy.dias(hasta: v.dia)
        let titulo = n == 0 ? "hoy." : n == 1 ? "mañana." : n == -1 ? "ayer." : FichaEventoView.fecha(v.dia) + "."
        let total = v.pendientes + v.hechas
        return VStack(alignment: .leading, spacing: 0) {
            Text(titulo).font(Tipo.poppins(34, .bold, estilo: .title)).kerning(-1.2).foregroundStyle(Paleta.texto)
                .accessibilityAddTraits(.isHeader)
            Text(total == 0 ? "libre." : "\(v.pendientes) pendientes, \(v.hechas) hechas").font(Tipo.poppins(16, .regular, estilo: .body))
                .foregroundStyle(Paleta.textoSecundario).padding(.top, 2)
            RoundedRectangle(cornerRadius: 2).fill(Paleta.acento).frame(width: 28, height: 3).padding(.top, 12)
        }
        .padding(.top, Espacio.l).padding(.bottom, Espacio.s)
    }

    @ViewBuilder private func bloqueAhora(_ v: VistaInicio) -> some View {
        if v.dia > v.hoy {
            // renderMobileAhora con otro día por venir: «lo próximo.» y lo primero con hora.
            let p = v.agenda.first { !$0.hecha && $0.hora != nil }
            VStack(alignment: .leading, spacing: 0) {
                Text("lo próximo.").font(Tipo.poppins(22, .bold, estilo: .title2)).kerning(-0.66).foregroundStyle(Paleta.texto)
                if let p, let h = p.hora {
                    Text(h).font(Tipo.poppins(64, .bold, estilo: .largeTitle)).kerning(-2.5).foregroundStyle(Paleta.texto).monospacedDigit()
                        .padding(.top, 4).padding(.bottom, 10).lineLimit(1).minimumScaleFactor(0.6)
                    Text(p.titulo).font(Tipo.poppins(17, .medium, estilo: .body)).foregroundStyle(Paleta.texto).lineLimit(3)
                } else {
                    Text("nada con hora.").font(Tipo.poppins(17, .medium, estilo: .body)).foregroundStyle(Paleta.textoSecundario).padding(.top, 6)
                }
            }
            .modifier(BloqueAhora())
        } else if v.dia == v.hoy {
            bloqueHoy(v)
        }
    }

    private func bloqueHoy(_ v: VistaInicio) -> some View {
        let siguiente = v.agenda.first { !$0.hecha && ($0.hora ?? "") > hora }
        return VStack(alignment: .leading, spacing: 0) {
            Text("ahora.").font(Tipo.poppins(22, .bold, estilo: .title2)).kerning(-0.66).foregroundStyle(Paleta.texto)
            Text(hora).font(Tipo.poppins(64, .bold, estilo: .largeTitle)).kerning(-2.5).foregroundStyle(Paleta.texto).monospacedDigit()
                .padding(.top, 4).padding(.bottom, 10).lineLimit(1).minimumScaleFactor(0.6)
            Group {
                if let s = siguiente, let h = s.hora {
                    Text("siguiente,").fontWeight(.semibold).foregroundColor(Paleta.textoSecundario)
                        + Text(" \(h) ").fontWeight(.bold).foregroundColor(Paleta.texto) + Text(s.titulo).foregroundColor(Paleta.texto)
                } else {
                    Text("nada más con hora.").foregroundColor(Paleta.textoSecundario)
                }
            }
            .font(Tipo.poppins(17, .medium, estilo: .body)).lineSpacing(2).lineLimit(3)
            if v.poste != nil {
                Rectangle().fill(Paleta.acento.opacity(0.18)).frame(height: 1).padding(.top, 14).padding(.bottom, 2)
                Button(action: abrirBus) {
                    HStack(alignment: .center, spacing: 12) {
                        IconoBus().fill(Paleta.texto).frame(width: 24, height: 24)
                        ResumenBus.texto(bus, mias: v.lineas).font(Tipo.poppins(17, .regular, estilo: .body)).foregroundColor(Paleta.textoSecundario)
                            .frame(maxWidth: .infinity, alignment: .leading).multilineTextAlignment(.leading)
                    }
                    .padding(.top, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("tu bus")
            }
        }
        .modifier(BloqueAhora())
    }
}

// .m-ahora-bloque: margen 22/6, relleno 18 18 16, radio 20, acento al 7 % con filo al 16 %.
struct BloqueAhora: ViewModifier {
    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 18).padding(.top, 18).padding(.bottom, 16)
            .background(Paleta.tinteAcento, in: RoundedRectangle(cornerRadius: Radio.bloque))
            .overlay(RoundedRectangle(cornerRadius: Radio.bloque).strokeBorder(Paleta.filoAcento, lineWidth: 1))
            .padding(.top, 22).padding(.bottom, 6)
            .accessibilityElement(children: .contain)
    }
}

// avatarHtml (perfil.js): la foto en un círculo; sin foto, un círculo vacío del tono de las tarjetas.
struct Avatar: View {
    let foto: Data?
    var tamano: CGFloat = 36

    var body: some View {
        Group {
            if let foto, let img = UIImage(data: foto) {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Image(systemName: "person.fill").font(.system(size: tamano * 0.45)).foregroundStyle(Paleta.textoSecundario)
                    .frame(maxWidth: .infinity, maxHeight: .infinity).background(Paleta.superficie)
            }
        }
        .frame(width: tamano, height: tamano)
        .clipShape(Circle())
    }
}

// M_BUS_ICONO (nucleo.js), en su caja de 100.
struct IconoBus: Shape {
    func path(in r: CGRect) -> Path {
        let s = min(r.width, r.height) / 100
        var p = Path()
        p.addRoundedRect(in: CGRect(x: 10, y: 10, width: 80, height: 75), cornerSize: CGSize(width: 14, height: 14))
        p.addRoundedRect(in: CGRect(x: 15, y: 75, width: 10, height: 20), cornerSize: CGSize(width: 5, height: 5))
        p.addRoundedRect(in: CGRect(x: 75, y: 75, width: 10, height: 20), cornerSize: CGSize(width: 5, height: 5))
        var huecos = Path()
        huecos.addRect(CGRect(x: 22, y: 26, width: 56, height: 22))
        huecos.addEllipse(in: CGRect(x: 20, y: 62, width: 12, height: 12))
        huecos.addEllipse(in: CGRect(x: 68, y: 62, width: 12, height: 12))
        return p.subtracting(huecos).applying(CGAffineTransform(scaleX: s, y: s).translatedBy(x: (r.width / s - 100) / 2, y: (r.height / s - 100) / 2))
    }
}

// .m-fila de un evento: la hora en su columna, una bola del acento donde las tareas llevan el círculo, el título y su
// meta (lugar, categoría, importe). Con entrada, «qr.»; los pagos van suaves.
struct FilaEvento: View {
    let hora: String?
    let titulo: String
    var detalle = ""
    var suave = false
    var entradas = 0
    var abrir: (() -> Void)?

    var body: some View {
        Button { abrir?() } label: {
            HStack(spacing: Espacio.s) {
                Text(hora ?? "").font(Tipo.poppins(14, .semibold, estilo: .footnote)).monospacedDigit()
                    .foregroundStyle(Paleta.textoSecundario).frame(width: 46, alignment: .leading)
                Circle().fill(suave ? Paleta.bordeFuerte : Paleta.acento).frame(width: 12, height: 12).frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(titulo).font(Tipo.poppins(16.5, .semibold, estilo: .body))
                        .foregroundStyle(suave ? Paleta.textoSecundario : Paleta.texto).multilineTextAlignment(.leading)
                    if !detalle.isEmpty { Text(detalle).font(Tipo.poppins(13.5, .regular, estilo: .footnote)).foregroundStyle(Paleta.textoSecundario).lineLimit(2) }
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                if entradas > 0 {
                    Label("qr.", systemImage: "qrcode").font(Tipo.poppins(13, .semibold, estilo: .footnote)).foregroundStyle(Paleta.texto)
                        .padding(.horizontal, 10).frame(minHeight: 32)
                        .background(Paleta.tinteTexto, in: RoundedRectangle(cornerRadius: Radio.control))
                }
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(abrir == nil)
        .overlay(alignment: .bottom) { Rectangle().fill(Paleta.borde).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }
}
