import SwiftUI

// Galería de Bitácora 2.0: todas las piezas juntas, con datos de mentira, para probar movimiento y estética en el
// lienzo de Xcode (y como ejemplo de composición para cada apartado). No la usa la app.
struct GaleriaV2: View {
    @State private var dia = CalendarioBitacora.madrid.dia(de: Date())
    @State private var pestana = "inicio"
    @State private var segmento = 0
    @State private var buscar = ""
    @State private var manana = true
    @State private var hechas: Set<Int> = [1]
    @State private var expandida: Int?
    @State private var modal = false
    @State private var texto = ""
    @State private var prioridad = "media"
    @State private var aviso = true

    private var hoy: LocalDay { CalendarioBitacora.madrid.dia(de: Date()) }

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .leading, spacing: Medida.m) {
                    CabeceraMarca { BotonRedondo(sistema: "gearshape", tono: .blanco, tamano: 36, etiqueta: "ajustes") {} }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("hola, alejandro.").font(Letra.portada).foregroundStyle(Lienzo.tinta)
                        Text("lo de hoy, en orden.").font(Letra.detalle).foregroundStyle(Lienzo.tintaSecundaria)
                    }
                    SemanaFlotante(hoy: hoy, elegido: dia, puntos: { d in
                        switch d.day % 4 {
                        case 0: [Lienzo.Punto.evento, Lienzo.Punto.tarea]
                        case 1: [Lienzo.Punto.estudio]
                        case 2: [Lienzo.Punto.evento, Lienzo.Punto.rutina, Lienzo.Punto.tarea]
                        default: []
                        }
                    }, elegir: { dia = $0 })
                    SegmentoCapsula(opciones: [.init(valor: 0, titulo: "por hacer"), .init(valor: 1, titulo: "hechas"), .init(valor: 2, titulo: "pendientes")],
                                    elegido: $segmento, sobreBlanco: false)
                    VStack(alignment: .leading, spacing: 0) {
                        SeccionPlegable(titulo: "mañana", detalle: "2", abierta: $manana) {
                            ForEach(0..<2, id: \.self) { i in
                                HStack(spacing: 4) {
                                    CasillaMarcar(hecha: hechas.contains(i)) { if hechas.contains(i) { hechas.remove(i) } else { hechas.insert(i) } }
                                    Text(["despertar a tiempo", "gimnasio"][i]).font(Letra.cuerpo)
                                        .foregroundStyle(hechas.contains(i) ? Lienzo.tintaTerciaria : Lienzo.tinta)
                                        .strikethrough(hechas.contains(i), color: Lienzo.tintaTerciaria)
                                    Spacer()
                                }
                            }
                        }
                    }
                    .tarjeta(relleno: 12)
                    EtiquetaSeccion(texto: "notas", accion: ("ver todas", {}))
                    BuscadorCapsula(texto: $buscar, placeholder: "buscar en tus notas")
                    ForEach(0..<2, id: \.self) { i in
                        TarjetaNota(titulo: ["estrategia del trimestre", "planificación del sprint"][i],
                                    extracto: "alineadas las prioridades y los hitos clave para el próximo trimestre, con fechas y responsables.",
                                    dato: ["01:12", "00:48"][i], fecha: ["14.10.2026", "13.10.2026"][i], expandida: expandida == i) {
                            withAnimation(Muelle.expandir) { expandida = expandida == i ? nil : i }
                        }
                    }
                    VStack(spacing: 0) {
                        FilaTarjeta(icono: "transporte", titulo: "bus 4", detalle: "parada plaza mayor") { Chip(texto: "3 min", tono: .naranja) }
                        SeparadorFila()
                        FilaTarjeta(icono: "finanzas", tonoIcono: .oscuro, titulo: "finanzas", detalle: "este mes") { FlechaFila() }
                    }
                    .tarjeta(relleno: 12)
                    // Piezas comunes de la 3.0
                    TarjetaOscura {
                        HStack(spacing: Medida.s) {
                            BloqueFecha(dia: hoy.sumando(dias: 3), tono: .naranja)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(CuentaAtras.texto(dias: 3)).font(Letra.cuentaAtras).foregroundStyle(Lienzo.tinta)
                                Text("concierto en el auditorio.").font(Letra.pie).foregroundStyle(Lienzo.sobreOscuroSuave)
                            }
                        }
                    }
                    HStack(alignment: .top) {
                        CifraGrande(texto: "1.240 €", etiqueta: "gastos.", punto: Lienzo.naranja, variacion: (texto: "−8 %", signo: -1))
                        Spacer()
                        AnilloProgreso(progreso: 0.6)
                    }
                    .tarjeta()
                    TarjetaSeccion(titulo: "asignaturas", detalle: "2") {
                        HStack(spacing: Medida.s) {
                            InicialCuadrada(nombre: "historia")
                            VStack(alignment: .leading, spacing: Medida.xs) {
                                Text("historia.").font(Letra.cuerpoFuerte)
                                BarraFina(valor: 0.4, color: Lienzo.tinta, alto: Medida.barraFina)
                            }
                            MarcaPrioridad(prioridad: "alta")
                        }
                        FilaDato(etiqueta: "media", valor: "7,8", separador: false)
                    }
                    VStack(spacing: 0) {
                        FilaImporte(titulo: "mercado", detalle: "hoy, comida", cifra: "−23,40 €") { IconoCuadrado(id: "finanzas") }
                        SeparadorFila()
                        FilaImporte(titulo: "nómina", detalle: "ayer", cifra: "+1.800 €", tono: Lienzo.positivo, aviso: true) { IconoCuadrado(id: "finanzas") }
                    }
                    .padding(.horizontal, Medida.rellenoTarjeta).tarjeta(relleno: 0)
                    ChipsEleccion(opciones: [(valor: "alta", titulo: "alta"), (valor: "media", titulo: "media"), (valor: "baja", titulo: "baja")], elegido: $prioridad)
                    TarjetaFilas {
                        Toggle(isOn: $aviso) { Text("avisos.").font(Letra.cuerpoFuerte) }
                            .toggleStyle(InterruptorCasa())
                            .padding(.horizontal, Medida.rellenoTarjeta).frame(minHeight: 52)
                        SeparadorFila(sangria: Medida.rellenoTarjeta)
                        Button {} label: { FilaTarjeta(icono: "calendario", titulo: "calendario.") { FlechaFila() }.padding(.horizontal, Medida.rellenoTarjeta) }
                            .buttonStyle(EstiloFila())
                    }
                    TarjetaInvitacion(frase: "¿buscas algo más?", destacado: "inspiración.", boton: "inspírame") {}
                    HStack { Button("reflexionar") {}.buttonStyle(.capsula); Button("personalizar") {}.buttonStyle(.capsula(.claro)) }
                }
                .padding(.horizontal, Medida.margen)
                .padding(.bottom, 120)
            }
            .cabeceraPortada(alto: Medida.portadaCorta, aSangre: true)
            .fondoLienzo()

            BarraFlotante(pestanas: [.init(id: "inicio", titulo: "inicio", icono: "inicio"), .init(id: "plan", titulo: "plan", icono: "plan"),
                                     .init(id: "calendario", titulo: "calendario", icono: "calendario"), .init(id: "mas", titulo: "menú", icono: "menu")],
                          activa: pestana, elegir: { pestana = $0 }, apuntar: { modal = true })
                .padding(.bottom, 8)
        }
        .capaFlotante(presentado: modal, cerrar: { modal = false }) {
            ModalFlotante(titulo: "apuntar.", cerrar: { modal = false }) {
                HStack(spacing: 6) { PuntoVivo(); Text("leyendo") }
            } contenido: {
                VStack(alignment: .leading, spacing: Medida.s) {
                    TextField("", text: $texto, prompt: Text("¿qué quieres apuntar?").foregroundColor(Lienzo.sobreOscuroTenue))
                        .font(Letra.cuerpo).foregroundStyle(Lienzo.sobreOscuro).padding(.vertical, Medida.s)
                    HStack { Spacer(); Button("apuntar") { modal = false }.buttonStyle(.capsula(.naranja)) }
                }
                .padding(Medida.m)
            }
        }
    }
}

#Preview("Bitácora 2.0") {
    GaleriaV2()
}
