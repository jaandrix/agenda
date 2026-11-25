import SwiftUI

// Profesorado en el iPhone: el día y la semana (sesiones de cada clase, marcar, nota del día, entregas), lo que quedó sin
// dar y las clases con su avance. Sustituye a la vista web `profesorado`; el cuadrante entero sigue en la web.

private enum ModalProfe: Identifiable {
    case clase(String)
    case nota(clase: String, fecha: String)
    var id: String {
        switch self {
        case .clase(let id): return "clase-" + id
        case .nota(let c, let f): return "nota-\(c)-\(f)"
        }
    }
}

struct ProfesoradoView: View {
    @Environment(AppCoordinator.self) private var c
    @State private var vista: VistaProfesorado?
    @State private var elegido: String = CalendarioBitacora.madrid.dia(de: Date()).iso
    @State private var modal: ModalProfe?
    @State private var verPendientes = false
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    private var hoy: String { CalendarioBitacora.madrid.dia(de: Date()).iso }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                CabeceraPagina(titulo: "profesorado.", subtitulo: subtitulo)
                    .padding(.bottom, Medida.xxs)
                if let v = vista {
                    if v.clases.isEmpty {
                        TarjetaInvitacion(frase: "todavía no tienes clases.", destacado: "el cuadrante del curso se monta en la web.",
                                          boton: "abrir en la web.") { abrirWeb() }
                            .entradaEscalonada(0)
                    } else {
                        contenido(v)
                    }
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, Medida.xl)
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.xs)
            .padding(.bottom, Medida.xl)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .refreshable { await c.sincronizar() }
        .tareaVisible(id: c.revision) { await cargar() }
        .hoja(item: $modal) { m in
            switch m {
            case .clase(let id): FichaClaseProfe(claseId: id, vista: vista ?? VistaProfesorado(), hoy: hoy) { modal = .nota(clase: id, fecha: $0) }.environment(c)
            case .nota(let cid, let f): EditorNotaProfe(clase: vista?.clase(cid), fecha: f, texto: vista?.nota(cid, f) ?? "").environment(c)
            }
        }
    }

    private var subtitulo: String? {
        guard let v = vista, !v.clases.isEmpty else { return nil }
        let n = v.clases.reduce(0) { $0 + v.sesiones($1.id, hoy).count }
        return v.esFestivo(hoy) ? "hoy no hay clase." : n == 0 ? "hoy no tienes nada planificado." : n == 1 ? "una cosa para hoy." : "\(n) cosas para hoy."
    }

    private func abrirWeb() { c.web = Apartados.webURL("profesorado") }

    @ViewBuilder private func contenido(_ v: VistaProfesorado) -> some View {
        SemanaProfe(vista: v, hoy: hoy, elegido: $elegido).entradaEscalonada(0)
        pendientes(v)
        dia(v)
        clases(v)
        Button("abrir en la web.") { abrirWeb() }
            .buttonStyle(.capsula(.blanco, ancho: true))
            .padding(.top, Medida.s)
            .accessibilityHint("el cuadrante, arrastrar, correr el temario y exportar están en la web")
    }

    // MARK: Lo que no se pudo dar

    @ViewBuilder private func pendientes(_ v: VistaProfesorado) -> some View {
        let lista = v.pendientes(hoy: hoy)
        if !lista.isEmpty {
            TarjetaOscura {
                VStack(alignment: .leading, spacing: Medida.s) {
                    Button {
                        Haptica.ligera()
                        withAnimation(Muelle.o(Muelle.expandir, reducido: sinMovimiento)) { verPendientes.toggle() }
                    } label: {
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("SIN DAR").font(Letra.etiqueta).tracking(Letra.espaciado).foregroundStyle(Lienzo.sobreOscuroSuave)
                                Text(lista.count == 1 ? "una tarea no se pudo dar." : "\(lista.count) tareas no se pudieron dar.")
                                    .font(Letra.tituloTarjeta).foregroundStyle(Lienzo.sobreOscuro).multilineTextAlignment(.leading)
                            }
                            Spacer()
                            Image(systemName: "chevron.down").font(.system(size: 12, weight: .bold))
                                .rotationEffect(.degrees(verPendientes ? 180 : 0))
                                .foregroundStyle(Lienzo.sobreOscuroSuave)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(Pulsable(escala: 0.98, haptica: false))
                    if verPendientes {
                        ForEach(lista) { s in
                            HStack(spacing: Medida.xs) {
                                CuadroClaseProfe(clase: v.clase(s.claseId), tamano: Medida.iconoPequeno)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(s.titulo).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.sobreOscuro).lineLimit(2)
                                    Text("era para el \(TextoProfe.dia(s.fecha)).").font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave)
                                }
                                Spacer(minLength: Medida.xs)
                                Button("ya está.") { marcar(s, true) }
                                    .font(Letra.pieFuerte).estiloEnlace(sobreOscuro: true)
                                    .frame(minHeight: Medida.toque)
                                    .buttonStyle(.pulsable(0.92))
                            }
                            .transition(.opacity)
                        }
                        Text("para ponerlas en otro día o correr el temario, abre la web.")
                            .font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave)
                    }
                }
            }
            .entradaEscalonada(1)
        }
    }

    // MARK: El día elegido

    @ViewBuilder private func dia(_ v: VistaProfesorado) -> some View {
        let enDia = v.clases.filter { v.esLectivo($0, elegido) || !v.sesiones($0.id, elegido).isEmpty || !v.entregas($0, elegido).isEmpty }
        EtiquetaSeccion(texto: TextoProfe.cuando(elegido, hoy: hoy))
            .padding(.top, Medida.s).entradaEscalonada(2)
        if v.esFestivo(elegido) {
            let nombre = v.nombresFestivos[elegido] ?? ""
            FilaTarjeta(icono: "profesorado", titulo: "no lectivo.", detalle: nombre.isEmpty ? "ese día no hay clase." : nombre.lowercased() + ".")
                .tarjeta(relleno: Medida.s)
                .entradaEscalonada(3)
        }
        if enDia.isEmpty && !v.esFestivo(elegido) {
            EstadoVacio(texto: "ese día no tienes clase.").tarjeta(relleno: Medida.xs).entradaEscalonada(3)
        }
        ForEach(Array(enDia.enumerated()), id: \.element.id) { n, clase in
            TarjetaDiaProfe(clase: clase, vista: v, fecha: elegido, hoy: hoy,
                            marcar: { marcar($0, $1) },
                            nota: { modal = .nota(clase: clase.id, fecha: elegido) },
                            abrir: { modal = .clase(clase.id) })
                .entradaEscalonada(n + 3)
        }
    }

    // MARK: Mis clases

    @ViewBuilder private func clases(_ v: VistaProfesorado) -> some View {
        TarjetaSeccion(titulo: "mis clases", detalle: "\(v.clases.count)", enTarjeta: false) {
            TarjetaFilas {
                ForEach(Array(v.clases.enumerated()), id: \.element.id) { i, clase in
                    if i > 0 { SeparadorFila(sangria: Medida.rellenoTarjeta + Medida.icono + Medida.s) }
                    let av = v.avance(clase, hoy: hoy)
                    Button { modal = .clase(clase.id) } label: {
                        HStack(spacing: Medida.s) {
                            CuadroClaseProfe(clase: clase)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(clase.nombre.lowercased() + ".").font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).lineLimit(1)
                                Text([clase.materia.lowercased(), av.estado].filter { !$0.isEmpty }.joined(separator: ", "))
                                    .font(Letra.pie).foregroundStyle(av.atrasadas > 0 ? Lienzo.naranjaProfundo : Lienzo.tintaSecundaria).lineLimit(1)
                                BarraFina(valor: Double(av.pct) / 100, color: Color(hexWeb: clase.color), alto: Medida.barraFina)
                            }
                            Text("\(av.pct) %").font(Letra.numero).foregroundStyle(Lienzo.tinta)
                            FlechaFila()
                        }
                        .padding(.horizontal, Medida.rellenoTarjeta)
                        .padding(.vertical, Medida.s)
                    }
                    .buttonStyle(EstiloFila())
                    .accessibilityLabel("\(clase.nombre), \(av.pct) por ciento del temario, \(av.estado)")
                }
            }
        }
        .entradaEscalonada(4)
    }

    private func marcar(_ s: SesionProfe, _ hecha: Bool) {
        Task {
            if await c.guardar(ProfeOp.opHecha(sesion: s.id, hecha: hecha)), hecha { Haptica.exito() }
        }
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        guard let r = await ultimaGana({ doc.map { LecturaProfesorado.vista($0) } }), let nueva = r else { return }
        vista = nueva
    }
}

// MARK: - Semana

// Los días lectivos de la semana del día elegido: el elegido en negro, hoy en naranja, lo no lectivo tachado y un punto
// si hay algo ese día. Flechas para cambiar de semana.
private struct SemanaProfe: View {
    let vista: VistaProfesorado
    let hoy: String
    @Binding var elegido: String
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    private var lunes: LocalDay { (LocalDay(iso: elegido) ?? CalendarioBitacora.madrid.dia(de: Date())).inicioSemanaLunes }

    private var dias: [LocalDay] {
        let semana = lunes.semanaLunesDomingo
        return semana.enumerated().filter { i, d in i < 5 || vista.sesiones.contains { $0.fecha == d.iso } }.map(\.element)
    }

    var body: some View {
        VStack(spacing: Medida.xs) {
            HStack {
                BotonRedondo(sistema: "chevron.left", tono: .sutil, tamano: 32, etiqueta: "semana anterior") { mover(-7) }
                Spacer()
                Text(rango).font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
                Spacer()
                BotonRedondo(sistema: "chevron.right", tono: .sutil, tamano: 32, etiqueta: "semana siguiente") { mover(7) }
            }
            HStack(spacing: 4) {
                ForEach(dias, id: \.iso) { d in boton(d) }
            }
            if elegido != hoy {
                Button("volver a hoy.") { elegir(hoy) }
                    .font(Letra.pieFuerte).estiloEnlace()
                    .buttonStyle(.pulsable(0.94))
            }
        }
        .tarjeta(relleno: Medida.s)
    }

    private var rango: String {
        let fin = lunes.sumando(dias: 6)
        return "\(TextoProfe.corta(lunes.iso)) – \(TextoProfe.corta(fin.iso))"
    }

    private func boton(_ d: LocalDay) -> some View {
        let on = d.iso == elegido
        let esHoy = d.iso == hoy
        let libre = vista.esFestivo(d.iso)
        let algo = vista.sesiones.contains { $0.fecha == d.iso && !$0.descartada }
        let letra = LecturaProfesorado.letras[(d.indiceSemanaLunes + 1) % 7]
        return Button { elegir(d.iso) } label: {
            VStack(spacing: 3) {
                Text(letra).font(Letra.etiqueta)
                    .foregroundStyle(on ? Lienzo.sobreOscuroSuave : Lienzo.tintaTerciaria)
                Text("\(d.day)").font(on ? Letra.numero : Letra.dia)
                    .strikethrough(libre)
                    .foregroundStyle(on ? Lienzo.sobreOscuro : esHoy ? Lienzo.naranjaProfundo : libre ? Lienzo.tintaTerciaria : Lienzo.tinta)
                Puntito(color: algo ? (on ? Lienzo.naranja : Lienzo.tintaSecundaria) : .clear)
            }
            .frame(maxWidth: .infinity, minHeight: 64)
            .background {
                if on { RoundedRectangle(cornerRadius: Medida.radioControl, style: .continuous).fill(Lienzo.oscuro) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(Pulsable(escala: 0.92, haptica: false))
        .accessibilityLabel(TextoProfe.dia(d.iso) + (libre ? ", no lectivo" : "") + (algo ? ", con clases" : ""))
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func mover(_ n: Int) {
        guard let d = LocalDay(iso: elegido) else { return }
        elegir(d.sumando(dias: n).inicioSemanaLunes.iso)
    }

    private func elegir(_ iso: String) {
        guard iso != elegido else { return }
        Haptica.ligera()
        withAnimation(Muelle.o(Muelle.rapido, reducido: sinMovimiento)) { elegido = iso }
    }
}

// MARK: - Tarjeta de una clase en un día

private struct TarjetaDiaProfe: View {
    let clase: ClaseProfe
    let vista: VistaProfesorado
    let fecha: String
    let hoy: String
    let marcar: (SesionProfe, Bool) -> Void
    let nota: () -> Void
    let abrir: () -> Void

    var body: some View {
        let sesiones = vista.sesiones(clase.id, fecha)
        let franjas = vista.franjas(clase, fecha)
        let entregas = vista.entregas(clase, fecha)
        let textoNota = vista.nota(clase.id, fecha)
        VStack(alignment: .leading, spacing: Medida.xs) {
            Button(action: abrir) {
                HStack(spacing: Medida.s) {
                    CuadroClaseProfe(clase: clase)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(clase.nombre.lowercased() + ".").font(Letra.tituloTarjeta).foregroundStyle(Lienzo.tinta).lineLimit(1)
                        let detalle = ([clase.materia.lowercased()] + franjas.map { [$0.inicio, $0.aula].filter { !$0.isEmpty }.joined(separator: ", ") })
                            .filter { !$0.isEmpty }.joined(separator: ", ")
                        if !detalle.isEmpty { Text(detalle).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1) }
                    }
                    Spacer(minLength: Medida.xs)
                    FlechaFila()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.pulsable(0.98))
            .accessibilityHint("abre la ficha de la clase")

            ForEach(entregas) { d in
                Chip(texto: "entrega: " + d.titulo.lowercased(), tono: .naranja)
            }

            if sesiones.isEmpty {
                Text(vista.esLectivo(clase, fecha) ? "nada planificado." : "no hay clase.")
                    .font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                    .padding(.vertical, Medida.xxs)
            }
            ForEach(sesiones) { s in
                SeparadorFila(sangria: 0)
                fila(s)
            }

            SeparadorFila(sangria: 0)
            Button(action: nota) {
                HStack(alignment: .top, spacing: Medida.xs) {
                    Image(systemName: textoNota == nil ? "plus" : "text.alignleft").font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Lienzo.tintaTerciaria).frame(width: 22, height: 20)
                    Text(textoNota ?? "nota de la clase.")
                        .font(Letra.detalle)
                        .foregroundStyle(textoNota == nil ? Lienzo.tintaSecundaria : Lienzo.tinta)
                        .lineLimit(3).multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                }
                .frame(minHeight: Medida.toque - 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pulsable(0.98))
            .accessibilityLabel(textoNota.map { "nota: \($0)" } ?? "añadir nota de la clase")
        }
        .tarjeta()
    }

    @ViewBuilder private func fila(_ s: SesionProfe) -> some View {
        let pendiente = vista.esPendiente(s, hoy: hoy)
        HStack(spacing: Medida.xxs) {
            if s.conCasilla && !s.descartada {
                CasillaMarcar(hecha: s.hecha == true) { marcar(s, s.hecha != true) }
            } else {
                Puntito(color: Color(hexWeb: clase.color), tamano: 6).frame(width: Medida.toque, height: Medida.toque)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(s.titulo)
                    .font(Letra.cuerpo)
                    .strikethrough(s.descartada || s.hecha == true, color: Lienzo.tintaTerciaria)
                    .foregroundStyle(s.descartada || s.hecha == true ? Lienzo.tintaSecundaria : Lienzo.tinta)
                    .lineLimit(3)
                if s.descartada || pendiente {
                    Text(s.descartada ? "descartada." : "sin dar.").font(Letra.pie)
                        .foregroundStyle(pendiente ? Lienzo.naranjaProfundo : Lienzo.tintaTerciaria)
                }
            }
            Spacer(minLength: 0)
        }
        .animation(Muelle.toque, value: s.hecha)
    }
}

// MARK: - Squircle de la clase

// El color de la clase (el que se eligió en la web) en un squircle, con el curso dentro («1º»).
struct CuadroClaseProfe: View {
    let clase: ClaseProfe?
    var tamano: CGFloat = Medida.icono

    var body: some View {
        RoundedRectangle(cornerRadius: tamano * 0.3, style: .continuous)
            .fill(clase.map { Color(hexWeb: $0.color) } ?? Lienzo.sutil)
            .overlay {
                Text(clase.map { String(LecturaProfesorado.partir($0.nombre).curso.prefix(3)) } ?? "")
                    .font(tamano < Medida.icono ? Letra.etiqueta : Letra.pieFuerte)
                    .foregroundStyle(Lienzo.sobreOscuro)
                    .lineLimit(1).minimumScaleFactor(0.6)
                    .padding(2)
            }
            .frame(width: tamano, height: tamano)
            .accessibilityHidden(true)
    }
}

// MARK: - Nota del día

// guardarNotaDiaProfe: la nota de una clase en un día; vacía, se borra.
private struct EditorNotaProfe: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    let clase: ClaseProfe?
    let fecha: String
    let original: String
    @State private var texto: String
    @State private var descartar = false

    init(clase: ClaseProfe?, fecha: String, texto: String) {
        self.clase = clase; self.fecha = fecha; original = texto
        _texto = State(initialValue: texto)
    }

    private var cambiado: Bool { texto.trimmingCharacters(in: .whitespacesAndNewlines) != original.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            FormCasa {
                Section {
                    TextField("cómo fue la clase, qué repetir, quién faltó, qué quedó a medias…", text: $texto, axis: .vertical)
                        .lineLimit(5...14)
                } header: {
                    Text("\((clase?.nombre ?? "").lowercased()), \(TextoProfe.dia(fecha)).")
                } footer: {
                    if !original.isEmpty { Text("déjala vacía para borrarla.") }
                }
            }
            .navigationTitle("nota.").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("cancelar.") { if cambiado { descartar = true } else { cerrar() } } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("guardar.") {
                        guard let id = clase?.id else { cerrar(); return }
                        Task { @MainActor in
                            if await c.guardar(ProfeOp.opNota(clase: id, fecha: fecha, texto: texto)) { Haptica.exito(); cerrar() }
                        }
                    }
                    .disabled(!cambiado)
                }
            }
            .preguntarAlDescartar(cambiado, preguntar: $descartar) { cerrar() }
        }
    }
}
