import Foundation

// Cuentas del carrusel de semanas de Inicio, aparte de la vista para poder probarlas.
// El fallo de la 0.19: el paso se calculaba desde el día que traía Inicio, que llega tarde (se recarga en segundo
// plano). Dos deslizamientos seguidos pedían dos veces la misma semana y, al llegar la recarga, el carrusel soltaba
// su centro y volvía a la semana de antes. Ahora el paso sale de la semana que se ve y se recuerda lo pedido.
struct EstadoCarrusel: Equatable {
    // Lunes de la semana centrada mientras Inicio no la confirma; nil sigue a la semana de Inicio.
    var centro: LocalDay?
    // Lo último pedido a Inicio y lo pedido antes (respuestas que pueden llegar tarde).
    var pedido: LocalDay?
    var anteriores: Set<LocalDay> = []

    func lunesVisible(semanaInicio: LocalDay) -> LocalDay { centro ?? semanaInicio.inicioSemanaLunes }

    // Día marcado: lo pedido manda hasta que Inicio lo confirma.
    func diaMarcado(dia: LocalDay) -> LocalDay { pedido ?? dia }

    // Tras un paso de ±7 desde la semana que se ve: la nueva semana centrada y el mismo día de la semana en ella.
    mutating func paso(_ dias: Int, semanaInicio: LocalDay, dia: LocalDay) -> LocalDay {
        let lunes = lunesVisible(semanaInicio: semanaInicio).sumando(dias: dias)
        let nuevo = lunes.sumando(dias: diaMarcado(dia: dia).indiceSemanaLunes)
        centro = lunes
        if let p = pedido { anteriores.insert(p) }
        pedido = nuevo
        return nuevo
    }

    // 0.23: el carrusel es un ScrollView paginado; al asentarse en otra semana pide el mismo día de la semana en ella.
    // nil si la semana ya es la que se ve (el scroll avisa también cuando lo recoloca Inicio).
    mutating func irA(lunes: LocalDay, semanaInicio: LocalDay, dia: LocalDay) -> LocalDay? {
        guard lunes != lunesVisible(semanaInicio: semanaInicio) else { return nil }
        let nuevo = lunes.sumando(dias: diaMarcado(dia: dia).indiceSemanaLunes)
        centro = lunes
        if let p = pedido { anteriores.insert(p) }
        pedido = nuevo
        return nuevo
    }

    // Las páginas del carrusel: cinco años antes y después de hoy, siempre las mismas (el id de cada página es su
    // lunes y nada se recentra). Solo si la semana que se ve se acerca al borde, la lista se rehace alrededor de ella.
    static let alcance = 260
    static func semanas(hoy: LocalDay, visible: LocalDay) -> [LocalDay] {
        let h = hoy.inicioSemanaLunes, v = visible.inicioSemanaLunes
        let centro = abs(h.dias(hasta: v)) > 7 * (alcance - 10) ? v : h
        let desde = centro.sumando(dias: -7 * alcance)
        let hasta = centro.sumando(dias: 7 * alcance)
        var r: [LocalDay] = [], l = desde
        while l <= hasta { r.append(l); l = l.sumando(dias: 7) }
        return r
    }

    // Tocar un día de la semana que se ve.
    mutating func tocar(_ d: LocalDay) {
        if let p = pedido { anteriores.insert(p) }
        pedido = d
        centro = d.inicioSemanaLunes
    }

    // Llega un día de Inicio. Si es lo último pedido, la semana de Inicio ya es la centrada. Si es una respuesta
    // vieja, se ignora. Si es otra cosa (hoy a las 4:00, «ir a hoy.»), manda Inicio.
    mutating func llega(_ dia: LocalDay) {
        if let p = pedido, dia != p, anteriores.contains(dia) { return }
        self = EstadoCarrusel()
    }
}
