import SwiftUI

// La ficha de una clase (openFichaClaseProfe) en lectura: avance del temario, entregas con quién las ha entregado,
// esta semana y la siguiente, lo ya dado, alumnos, horario y notas del día. El cuaderno de notas, editar la clase,
// repartir, copiar y exportar siguen en la web.
struct FichaClaseProfe: View {
    @Environment(AppCoordinator.self) private var c
    @Environment(\.dismiss) private var cerrar
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento
    let claseId: String
    let hoy: String
    let abrirNota: (String) -> Void
    @State private var vista: VistaProfesorado
    @State private var deberAbierto: String?
    @State private var verDadas = false
    @State private var verAlumnos = false

    init(claseId: String, vista: VistaProfesorado, hoy: String, abrirNota: @escaping (String) -> Void) {
        self.claseId = claseId; self.hoy = hoy; self.abrirNota = abrirNota
        _vista = State(initialValue: vista)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Medida.entreTarjetas) {
                HStack {
                    Spacer()
                    BotonRedondo(sistema: "xmark", tono: .sutil, etiqueta: "cerrar") { cerrar() }
                }
                if let clase = vista.clase(claseId) {
                    contenido(clase)
                } else {
                    EstadoVacio(texto: "esta clase ya no existe.")
                }
            }
            .padding(.horizontal, Medida.margen)
            .padding(.top, Medida.s)
            .padding(.bottom, Medida.xl)
        }
        .scrollIndicators(.hidden)
        .fondoLienzo()
        .tareaVisible(id: c.revision) { await cargar() }
    }

    @ViewBuilder private func contenido(_ clase: ClaseProfe) -> some View {
        let av = vista.avance(clase, hoy: hoy)
        let tinta = Color(hexWeb: clase.color)
        HStack(spacing: Medida.s) {
            CuadroClaseProfe(clase: clase, tamano: Medida.iconoGrande)
            VStack(alignment: .leading, spacing: 2) {
                Text(clase.nombre.lowercased() + ".").font(Letra.titulo).foregroundStyle(Lienzo.tinta).accessibilityAddTraits(.isHeader)
                Text(subtitulo(clase)).font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
            }
        }
        .entradaEscalonada(0)

        VStack(alignment: .leading, spacing: Medida.s) {
            HStack(alignment: .bottom) {
                CifraGrande(texto: "\(av.pct) %", etiqueta: "del temario hecho", punto: tinta)
                Spacer()
                Text("\(av.dadas) de \(av.total)").font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria)
            }
            BarraFina(valor: Double(av.pct) / 100, color: tinta)
            Text("avance del temario: \(av.estado)" + (av.porDar > 0 && av.clases > 0 ? " te quedan \(av.porDar) tareas por dar y \(av.clases) clases." : ""))
                .font(Letra.detalle).foregroundStyle(av.atrasadas > 0 ? Lienzo.naranjaProfundo : Lienzo.tintaSecundaria)
            SeparadorFila(sangria: 0)
            FilaDato(etiqueta: "sin dar", valor: "\(av.atrasadas)", tono: av.atrasadas > 0 ? Lienzo.naranjaProfundo : Lienzo.tinta)
            FilaDato(etiqueta: "por dar", valor: "\(av.porDar)")
            FilaDato(etiqueta: "clases hasta el \(TextoProfe.corta(av.fin))", valor: "\(av.clases)", separador: false)
        }
        .tarjeta()
        .entradaEscalonada(1)

        entregas(clase).entradaEscalonada(2)
        semanas(clase).entradaEscalonada(3)
        alumnos(clase).entradaEscalonada(4)
        horario(clase).entradaEscalonada(5)
        notas(clase).entradaEscalonada(6)
    }

    private func subtitulo(_ clase: ClaseProfe) -> String {
        let n = clase.alumnos.count
        let dias = clase.dias.isEmpty ? "de lunes a viernes" : clase.dias.sorted { ($0 + 6) % 7 < ($1 + 6) % 7 }
            .map { ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][$0 % 7] }.joined(separator: ", ")
        return [clase.materia.isEmpty ? "sin materia" : clase.materia.lowercased(), "\(n) \(n == 1 ? "alumno" : "alumnos")", dias].joined(separator: ", ") + "."
    }

    // MARK: Entregas

    @ViewBuilder private func entregas(_ clase: ClaseProfe) -> some View {
        let proximos = clase.deberes.filter { $0.entrega >= hoy }.sorted { $0.entrega < $1.entrega }
        if !proximos.isEmpty {
            TarjetaSeccion(titulo: "próximas entregas", enTarjeta: false) {
                TarjetaLista(elementos: proximos) { d in deber(d, clase) }
            }
        }
    }

    @ViewBuilder private func deber(_ d: DeberProfe, _ clase: ClaseProfe) -> some View {
        let abierto = deberAbierto == d.id
        let hechos = clase.alumnos.filter { d.entregados.contains($0.id) }.count
        VStack(alignment: .leading, spacing: 0) {
            Button {
                Haptica.ligera()
                withAnimation(Muelle.o(Muelle.expandir, reducido: sinMovimiento)) { deberAbierto = abierto ? nil : d.id }
            } label: {
                HStack(spacing: Medida.s) {
                    Text(TextoProfe.corta(d.entrega)).font(Letra.hora).foregroundStyle(Lienzo.tintaSecundaria).frame(width: 74, alignment: .leading)
                    Text(d.titulo).font(Letra.cuerpoFuerte).foregroundStyle(Lienzo.tinta).lineLimit(2).multilineTextAlignment(.leading)
                    Spacer(minLength: Medida.xs)
                    if !clase.alumnos.isEmpty {
                        Text("\(hechos)/\(clase.alumnos.count)").font(Letra.pieFuerte).foregroundStyle(Lienzo.tintaSecundaria).monospacedDigit()
                    }
                }
                .frame(minHeight: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(Pulsable(escala: 0.98, haptica: false))
            .accessibilityValue(abierto ? "abierta" : "plegada")
            if abierto {
                if clase.alumnos.isEmpty {
                    Text("añade alumnos en la web para marcar quién lo entrega.").font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria)
                        .padding(.bottom, Medida.s)
                } else {
                    ForEach(clase.alumnos.sorted { $0.nombre.localizedCompare($1.nombre) == .orderedAscending }) { a in
                        let entregado = d.entregados.contains(a.id)
                        HStack(spacing: Medida.xxs) {
                            CasillaMarcar(hecha: entregado) {
                                Task { await c.guardar(ProfeOp.opEntregado(clase: clase.id, deber: d.id, alumno: a.id, marcado: !entregado)) }
                            }
                            Text(a.nombre).font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                            Spacer(minLength: 0)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("\(a.nombre), \(entregado ? "entregado" : "sin entregar")")
                    }
                    .transition(.opacity)
                }
            }
        }
    }

    // MARK: Semanas

    @ViewBuilder private func semanas(_ clase: ClaseProfe) -> some View {
        let lunes = (LocalDay(iso: hoy) ?? CalendarioBitacora.madrid.dia(de: Date())).inicioSemanaLunes
        let domingo = lunes.sumando(dias: 6).iso
        let siguiente = lunes.sumando(dias: 13).iso
        let todas = vista.sesiones.filter { $0.claseId == clase.id }.sorted { ($0.fecha, $0.orden) < ($1.fecha, $1.orden) }
        let semana = todas.filter { $0.fecha >= lunes.iso && $0.fecha <= domingo }
        let otra = todas.filter { $0.fecha > domingo && $0.fecha <= siguiente }
        let dadas = Array(todas.filter { $0.hecha == true }.reversed())
        TarjetaSeccion(titulo: "esta semana", enTarjeta: false) {
            if semana.isEmpty {
                EstadoVacio(texto: "nada planificado esta semana.").tarjeta(relleno: Medida.xs)
            } else {
                TarjetaLista(elementos: semana) { fila($0) }
            }
        }
        if !otra.isEmpty {
            TarjetaSeccion(titulo: "la semana que viene", enTarjeta: false) {
                TarjetaLista(elementos: otra) { fila($0) }
            }
        }
        if !dadas.isEmpty {
            SeccionPlegable(titulo: "lo que ya has dado.", detalle: "\(dadas.count)", abierta: $verDadas) {
                TarjetaLista(elementos: dadas) { fila($0) }.padding(.top, Medida.xxs)
            }
            .padding(.horizontal, Medida.xxs)
        }
    }

    private func fila(_ s: SesionProfe) -> some View {
        let pendiente = vista.esPendiente(s, hoy: hoy)
        let estado = s.descartada ? "descartada" : s.hecha == true ? "hecha" : s.hecha == nil ? "" : pendiente ? "sin dar" : "por hacer"
        return HStack(spacing: Medida.s) {
            Text(TextoProfe.corta(s.fecha)).font(Letra.hora).foregroundStyle(Lienzo.tintaSecundaria).frame(width: 74, alignment: .leading)
            Text(s.titulo).font(Letra.cuerpo)
                .strikethrough(s.descartada, color: Lienzo.tintaTerciaria)
                .foregroundStyle(s.hecha == true || s.descartada ? Lienzo.tintaSecundaria : Lienzo.tinta)
                .lineLimit(2)
            Spacer(minLength: Medida.xs)
            Text(estado).font(Letra.pie).foregroundStyle(pendiente ? Lienzo.naranjaProfundo : Lienzo.tintaTerciaria)
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }

    // MARK: Alumnos, horario y notas

    @ViewBuilder private func alumnos(_ clase: ClaseProfe) -> some View {
        if !clase.alumnos.isEmpty {
            SeccionPlegable(titulo: "alumnos.", detalle: "\(clase.alumnos.count)", abierta: $verAlumnos) {
                TarjetaLista(elementos: clase.alumnos.sorted { $0.nombre.localizedCompare($1.nombre) == .orderedAscending }) { a in
                    Text(a.nombre).font(Letra.cuerpo).foregroundStyle(Lienzo.tinta)
                        .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
                }
                .padding(.top, Medida.xxs)
            }
            .padding(.horizontal, Medida.xxs)
        }
    }

    @ViewBuilder private func horario(_ clase: ClaseProfe) -> some View {
        let franjas = clase.horario.sorted { (($0.dia + 6) % 7, $0.inicio) < (($1.dia + 6) % 7, $1.inicio) }
        if !franjas.isEmpty {
            TarjetaSeccion(titulo: "horario") {
                ForEach(Array(franjas.enumerated()), id: \.offset) { i, h in
                    FilaDato(etiqueta: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][h.dia % 7] + (h.aula.isEmpty ? "" : ", \(h.aula)"),
                             valor: [h.inicio, h.fin].filter { !$0.isEmpty }.joined(separator: "–"), separador: i < franjas.count - 1)
                }
            }
        }
    }

    @ViewBuilder private func notas(_ clase: ClaseProfe) -> some View {
        let lista = vista.notas(de: clase.id)
        TarjetaSeccion(titulo: "notas", accion: (titulo: "+ nota de hoy.", hacer: { abrirNota(hoy) }), enTarjeta: false) {
            if lista.isEmpty {
                EstadoVacio(texto: "sin notas todavía.").tarjeta(relleno: Medida.xs)
            } else {
                ForEach(lista, id: \.fecha) { n in
                    TarjetaNota(titulo: TextoProfe.dia(n.fecha), extracto: n.texto) { abrirNota(n.fecha) }
                }
            }
        }
    }

    private func cargar() async {
        let doc = await c.documentoVisible()
        guard let r = await ultimaGana({ doc.map { LecturaProfesorado.vista($0) } }), let nueva = r else { return }
        vista = nueva
    }
}
