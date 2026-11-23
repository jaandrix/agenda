import SwiftUI

// El botón de apuntar: un óvalo tumbado negro con un «+» gordo de puntas redondas. Es la pieza más tocada de la app, así
// que tiene que sentirse física:
//  · Detecta el dedo: al apoyar se hunde (aplasta un poco más en vertical que en horizontal), se inclina hacia donde
//    está el dedo (rotación 3D de hasta 9°) y un brillo radial sigue la yema mientras se mueve.
//  · Al apoyar da un golpe medio; al soltar, uno suave, una onda naranja sale desde el punto exacto del toque y el «+»
//    gira un cuarto de vuelta con rebote.
//  · Si el dedo sale del botón antes de soltar, se cancela (como un botón de iOS) y vuelve sin abrir nada.
//  · Interrumpible: todo son muelles, se puede tocar otra vez a mitad de la animación.
struct BotonApuntar: View {
    var ancho: CGFloat = Medida.anchoApuntar
    var alto: CGFloat = Medida.alturaBarra
    let accion: () -> Void

    @State private var presionado = false
    @State private var dedo: CGPoint?
    @State private var giro: Double = 0
    @State private var ondas: [Onda] = []
    @Environment(\.accessibilityReduceMotion) private var sinMovimiento

    private struct Onda: Identifiable {
        let id = UUID()
        let centro: CGPoint
        var abierta = false
    }

    var body: some View {
        let tamano = CGSize(width: ancho, height: alto)
        ZStack {
            Capsule().fill(Lienzo.oscuro)
            // El brillo que sigue la yema.
            if let dedo, presionado {
                RadialGradient(colors: [Color.white.opacity(0.22), Color.white.opacity(0)], center: .init(x: dedo.x / ancho, y: dedo.y / alto),
                               startRadius: 0, endRadius: ancho * 0.6)
                    .clipShape(Capsule())
                    .transition(.opacity)
            }
            // Las ondas naranjas desde el punto del toque.
            ZStack {
                ForEach(ondas) { o in
                    Circle()
                        .fill(Lienzo.naranja.opacity(o.abierta ? 0 : 0.55))
                        .frame(width: ancho * 2.2, height: ancho * 2.2)
                        .scaleEffect(o.abierta ? 1 : 0.05)
                        .position(o.centro)
                }
            }
            .frame(width: ancho, height: alto)
            .clipShape(Capsule())
            .allowsHitTesting(false)
            // Filo superior de luz: da volumen al óvalo.
            Capsule().strokeBorder(LinearGradient(colors: [Color.white.opacity(0.16), .clear], startPoint: .top, endPoint: .center), lineWidth: 1)
            MasGordo(tamano: alto * 0.38)
                .rotationEffect(.degrees(giro))
                .scaleEffect(presionado ? 0.86 : 1)
        }
        .frame(width: ancho, height: alto)
        .compositingGroup()
        .scaleEffect(x: presionado && !sinMovimiento ? 0.95 : 1, y: presionado && !sinMovimiento ? 0.9 : 1)
        .rotation3DEffect(.degrees(inclinacion.angulo), axis: (x: inclinacion.x, y: inclinacion.y, z: 0), perspective: 0.6)
        .shadow(color: Sombra.oscura.color.opacity(presionado ? 0.6 : 1), radius: presionado ? 6 : Sombra.oscura.radio,
                x: 0, y: presionado ? 3 : Sombra.oscura.y)
        .animation(presionado ? Muelle.toque : Muelle.soltar, value: presionado)
        .animation(.spring(response: 0.18, dampingFraction: 0.8), value: dedo)
        .contentShape(Capsule())
        .gesture(
            DragGesture(minimumDistance: 0, coordinateSpace: .local)
                .onChanged { g in
                    let dentro = Self.dentro(g.location, tamano, holgura: 14)
                    if !presionado && dentro && dedo == nil { Haptica.media() }
                    if dentro != presionado { presionado = dentro }
                    dedo = g.location
                }
                .onEnded { g in
                    let dentro = Self.dentro(g.location, tamano, holgura: 14)
                    presionado = false
                    dedo = nil
                    guard dentro else { return }
                    Haptica.suave()
                    soltar(en: g.location)
                    accion()
                }
        )
        .accessibilityElement()
        .accessibilityLabel("apuntar")
        .accessibilityHint("abre el campo para apuntar cualquier cosa")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { accion() }
        .onAppear { Haptica.preparar() }
    }

    // Inclinación hacia el dedo: el lado que se pulsa se hunde.
    private var inclinacion: (angulo: Double, x: CGFloat, y: CGFloat) {
        guard presionado, let dedo, !sinMovimiento else { return (0, 0, 1) }
        let dx = (dedo.x - ancho / 2) / (ancho / 2)
        let dy = (dedo.y - alto / 2) / (alto / 2)
        let dxl = max(-1, min(1, dx)), dyl = max(-1, min(1, dy))
        let fuerza = min(1, sqrt(dxl * dxl + dyl * dyl))
        return (Double(fuerza) * 9, -dyl, dxl)
    }

    private func soltar(en punto: CGPoint) {
        guard !sinMovimiento else { return }
        withAnimation(.spring(response: 0.42, dampingFraction: 0.52)) { giro += 90 }
        let onda = Onda(centro: punto)
        ondas.append(onda)
        DispatchQueue.main.async {
            withAnimation(.easeOut(duration: 0.55)) {
                if let i = ondas.firstIndex(where: { $0.id == onda.id }) { ondas[i].abierta = true }
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { ondas.removeAll { $0.id == onda.id } }
    }

    private static func dentro(_ p: CGPoint, _ s: CGSize, holgura: CGFloat) -> Bool {
        p.x >= -holgura && p.y >= -holgura && p.x <= s.width + holgura && p.y <= s.height + holgura
    }
}

/// El «+» gordo de puntas redondas.
struct MasGordo: View {
    var tamano: CGFloat = 22
    var color: Color = Lienzo.sobreOscuro

    var body: some View {
        let grosor = tamano * 0.24
        ZStack {
            Capsule().frame(width: tamano, height: grosor)
            Capsule().frame(width: grosor, height: tamano)
        }
        .foregroundStyle(color)
        .accessibilityHidden(true)
    }
}
