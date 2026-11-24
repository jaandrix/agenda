import SwiftUI

// Piezas propias del Plan (MarcaPrioridad, ChipsEleccion y BotonCompartirRedondo viven ya en DesignSystem/V2). Solo
// presentación: no leen ni escriben datos.

/// Los puntitos de la semana del Plan: qué días tienen algo en `dayPlanner.days`. Se calcula una vez al cargar.
struct MarcasPlan: Sendable, Equatable {
    var pendientes: Set<LocalDay> = []
    var deTrabajo: Set<LocalDay> = []
    var hechas: Set<LocalDay> = []

    static func de(_ doc: DocumentoBitacora) -> MarcasPlan {
        let planner = (try? doc.valor(de: "dayPlanner")) ?? nil
        var m = MarcasPlan()
        for (clave, lista) in planner?["days"]?.objeto ?? [:] {
            guard let d = LocalDay(iso: clave) else { continue }
            for x in lista.lista ?? [] {
                guard let o = x.objeto else { continue }
                if o["done"]?.booleano == true { m.hechas.insert(d) }
                else if o["linkedAssignmentId"] != nil || o["proyectoTareaId"] != nil { m.deTrabajo.insert(d) }
                else { m.pendientes.insert(d) }
            }
        }
        return m
    }

    // Lo pendiente de días pasados se ve hoy como arrastrado: su día ya no lleva punto de tarea.
    func colores(_ d: LocalDay, hoy: LocalDay) -> [Color] {
        var r: [Color] = []
        let pasado = d < hoy
        if !pasado && pendientes.contains(d) { r.append(Lienzo.Punto.tarea) }
        if !pasado && deTrabajo.contains(d) { r.append(Lienzo.Punto.estudio) }
        if hechas.contains(d) && r.isEmpty { r.append(Lienzo.Punto.otro) }
        return r
    }
}

/// Fila de tarea de la foto 4: casilla cuadrada, título, debajo la hora pequeña y la nota, y a la derecha las subtareas
/// «2/5» y la prioridad. La casilla marca; el resto de la fila abre (si hay `abrir`).
struct FilaTareaV2: View {
    let titulo: String
    var hora: String?
    var notas = ""
    let hecha: Bool
    var arrastrada = false
    var prioridad: String?
    var subtareas = 0
    var subHechas = 0
    let marcar: () -> Void
    var abrir: (() -> Void)?

    var body: some View {
        HStack(spacing: 2) {
            CasillaMarcar(hecha: hecha, marcar: marcar)
                .padding(.leading, -Medida.xs)
            if let abrir {
                Button(action: abrir) { contenido }
                    .buttonStyle(Pulsable(escala: 0.98, haptica: false))
                    .accessibilityLabel(etiquetaAccesible)
                    .accessibilityHint("abrir la tarea")
            } else {
                contenido
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(etiquetaAccesible)
            }
        }
        .frame(minHeight: Medida.toque + 6)
    }

    private var contenido: some View {
        HStack(alignment: .center, spacing: Medida.xs) {
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo)
                    .font(Letra.cuerpo)
                    .foregroundStyle(hecha ? Lienzo.tintaTerciaria : Lienzo.tinta)
                    .strikethrough(hecha, color: Lienzo.tintaTerciaria)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if tieneDetalle {
                    HStack(spacing: 6) {
                        if let hora {
                            Text(hora).font(Letra.hora)
                                .foregroundStyle(arrastrada && !hecha ? Lienzo.naranjaProfundo : Lienzo.tintaSecundaria)
                        }
                        if arrastrada && !hecha {
                            Text("de otro día").font(Letra.pie).foregroundStyle(Lienzo.naranjaProfundo)
                        }
                        if !notas.isEmpty {
                            Text(notas).font(Letra.pie).foregroundStyle(Lienzo.tintaSecundaria).lineLimit(1)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
            if subtareas > 0 {
                Text("\(subHechas)/\(subtareas)")
                    .font(Letra.pieFuerte).monospacedDigit()
                    .foregroundStyle(subHechas == subtareas ? Lienzo.positivo : Lienzo.tintaSecundaria)
                    .contentTransition(.numericText())
            }
            if let prioridad, !hecha { MarcaPrioridad(prioridad: prioridad) }
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, minHeight: Medida.toque, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var tieneDetalle: Bool { hora != nil || (arrastrada && !hecha) || !notas.isEmpty }

    private var etiquetaAccesible: String {
        var p = [titulo]
        if let hora { p.append("a las \(hora)") }
        if arrastrada && !hecha { p.append("de otro día") }
        if let prioridad { p.append("prioridad \(prioridad)") }
        if subtareas > 0 { p.append("\(subHechas) de \(subtareas) subtareas") }
        if !notas.isEmpty { p.append(notas) }
        return p.joined(separator: ", ")
    }
}
