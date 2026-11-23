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
                    TarjetaInvitacion(frase: "¿buscas algo más?", destacado: "inspiración.", boton: "inspírame") {}
                    HStack { Button("reflexionar") {}.buttonStyle(.capsula); Button("personalizar") {}.buttonStyle(.capsula(.claro)) }
                }
                .padding(.horizontal, Medida.margen)
                .padding(.bottom, 120)
            }
            .background(alignment: .top) { Lienzo.degradadoCabecera.frame(height: 260).ignoresSafeArea() }
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
