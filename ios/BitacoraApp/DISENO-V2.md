# Bitácora 2.0 — reglas del rediseño (contrato para cada apartado)

Rediseño completo de la app nativa (`BitacoraNative`), iniciado el 23-11-2026 en la rama `rediseno/v2`.
Referencias: barra y semana flotantes, inicio limpio y curado, notas en tarjetas con buscador, modal de apuntar
flotante y oscuro con banda naranja, iconos cuadrados. Colores de partida: blanco, carbón `#111315` y naranja coral.

## Fuente única de verdad: `BitacoraNative/DesignSystem/V2/`
- `Lienzo.swift` — colores (`Lienzo.*`, `Lienzo.Punto.*`), medidas (`Medida.*`), letra (`Letra.*`), sombras (`.sombra(_)`),
  `.tarjeta()`, `.fondoLienzo()`, `Lienzo.degradadoCabecera`.
- `Movimiento.swift` — muelles (`Muelle.rapido/toque/soltar/modal/expandir/suave/entrada`), `Muelle.o(_, reducido:)`,
  `Haptica.*`, `Elastico` (rubber-banding y proyección de velocidad), `.entradaEscalonada(i)`.
- `Piezas.swift` — `Pulsable` (`.buttonStyle(.pulsable)`), `EstiloCapsula` (`.capsula`, `.capsula(.claro|.naranja|.blanco)`),
  `BotonRedondo`, `IconoCuadrado`, `LogoB`, `CabeceraMarca`, `CabeceraPagina`, `EtiquetaSeccion`, `Chip`, `Puntito`.
- `Tarjetas.swift` — `BuscadorCapsula`, `TarjetaNota`, `SegmentoCapsula`, `SeccionPlegable`, `FilaTarjeta`, `FlechaFila`,
  `SeparadorFila`, `CasillaMarcar`, `TarjetaInvitacion`, `EstadoVacio`, `TarjetaOscura`.
- `FechasV2.swift` (3.0) — `BloqueFecha` (día y mes en squircle; tonos naranja/claro/oscuro/apagado, `grande`),
  `CuentaAtras` (`texto(dias:)`, `chip(dias:)`, `texto(_:hora:hoy:ahora:)` con «en 40 min.»), `TipoPunto` (tipo de
  EventoDia → `Lienzo.Punto`) y `LocalDay.dias(hasta:)`.
- `Indicadores.swift` (3.0) — `BarraFina` (avance con muelle y tramo `falta`), `AnilloProgreso` (con `celebrar`),
  `ChipCifra` (variación ↑↓), `CifraGrande` (cifra con etiqueta, punto y variación), `MarcaPrioridad`, `InicialCuadrada`,
  `LineaSerie`/`AreaSerie` (formas de una serie 0…1).
- `FilasV2.swift` (3.0) — `TarjetaSeccion` (etiqueta + tarjeta), `TarjetaLista` (filas con separadores), `TarjetaFilas`
  (filas a todo el ancho) con `EstiloFila` (velo al pulsar una fila), `FilaDato` («etiqueta …… valor»), `FilaImporte`
  (icono, concepto, detalle y cifra con signo).
- `ControlesV2.swift` (3.0) — `ChipsEleccion` (chips elegibles), `InterruptorCasa` (ToggleStyle naranja con muelle),
  `MenuRedondo` (Menu en círculo blanco), `BotonCompartirRedondo` (ShareLink en círculo).
- `Lienzo.swift` (3.0) — tokens nuevos: `Medida.bloqueFecha/bloqueFechaGrande/portada/portadaCorta/sobrePortada/barra/
  barraFina`, `Letra.dia/diaBloque/diaBloqueGrande/mesBloque/cuentaAtras/mono` y `.cabeceraPortada(alto:sobreBorde:aSangre:)`
  (el degradado de portada; nunca `Lienzo.degradadoCabecera` a mano).
- `SemanaFlotante.swift`, `BarraFlotante.swift`, `BotonApuntar.swift`, `ModalFlotante.swift` (+ `.capaFlotante`, `PuntoVivo`).
- `GaleriaV2.swift` — ejemplo de composición con todo junto (`#Preview`).

Antes de crear una pieza en tu carpeta, busca aquí: fecha en bloque, cuenta atrás, barra de avance, cifra con variación,
fila de importe, sección con tarjeta, chips elegibles e interruptor ya existen. Nombres retirados en la 3.0 (no usarlos):
`BloqueFechaEvento`, `BarraCapsula`, `BarraProgresoEstudio`, `EstiloFilaMenu`, `LetraInicio`, `TextoEventos.cuentaAtras`,
`CuentaEstudios.cuentaAtras/chip`, `MedidaInicio.degradado/sobreBorde`.

## Reglas estrictas
1. **Nada suelto**: prohibido `Color(hex/rgb)`, `Paleta.*` en vistas nuevas, radios, tamaños de letra, sombras o
   animaciones fuera de `Lienzo`/`Medida`/`Letra`/`Sombra`/`Muelle`. Si falta un token o un componente, NO lo inventes en tu
   pantalla: créalo en tu carpeta con un nombre propio y anótalo en tu informe final para subirlo a `DesignSystem/V2/`.
2. **Un solo tema, claro**: lienzo `Lienzo.fondo`, tarjetas blancas `.tarjeta()`, lo destacado en `TarjetaOscura` o
   `Lienzo.oscuro`. El naranja es escaso: indicadores, lo activo, una acción principal por pantalla, el día de hoy.
3. **Letra pequeña y curada**: cuerpo 13–15 (`Letra.cuerpo`, `.detalle`), metadatos 11–12 (`.pie`, `.etiqueta` en MAYÚSCULAS
   con `.tracking(Letra.espaciado)`), títulos de página `Letra.titulo` (22). Todo en minúscula con punto final («notas.»)
   como siempre en Bitácora, salvo etiquetas en mayúsculas.
4. **Geometría**: siempre `RoundedRectangle(cornerRadius:, style: .continuous)` o `Capsule`. Nunca `.cornerRadius()`.
   Radios concéntricos: `Medida.concentrico(exterior, relleno:)`. Márgenes laterales `Medida.margen` (16).
5. **Iconos**: `IconoCuadrado(id:)` con los ids del catálogo `Icono` (Iconos.swift). SF Symbols solo para controles
   (chevron, xmark, lupa…), nunca para representar un apartado.
6. **Movimiento**: todo lo que toca el dedo, muelles (`Muelle.*`), nunca `.linear`/`.easeInOut` lentos. Anima solo
   transformaciones (escala, desplazamiento, opacidad). Todo botón con `.pulsable`, `.capsula` o `BotonRedondo` (nunca
   `.plain` sin estado de pulsado). Respeta `accessibilityReduceMotion` con `Muelle.o(_, reducido:)`.
7. **Háptica**: `.ligera()` al cambiar de día/pestaña/filtro, `.media()` en acciones fuertes, `.exito()` al completar,
   `.seleccion()` en segmentos. No en cada fila.
8. **Barra flotante**: el armazón ya reserva su hueco abajo en cada `NavigationStack` (`.reservaBarra`). No añadas
   relleno inferior propio para ella. Hojas a pantalla completa con scroll: `.huecoBarra()` solo si la barra se ve encima.
9. **Hojas**: usa `.hoja(...)` (Hojas.swift), nunca `.sheet(`. El modal flotante (`ModalFlotante` + `.capaFlotante`) es para
   capturas rápidas; los editores largos siguen en hojas.
10. **Datos intactos**: no cambies lecturas, operaciones ni el contrato (`DataContract/`, `Core/`). Solo presentación.
    Guarda con `c.guardar`/`c.encolar` como hoy (nunca `try? await c.encolar`).
11. **Accesibilidad**: etiquetas en español, áreas táctiles ≥ 44, Dynamic Type (la letra pasa por `Tipo.poppins`).

## Qué toca cada chat
Solo los archivos de su apartado (su carpeta en `Features/`) y las pruebas que pinten sus vistas. Prohibido editar
`DesignSystem/`, `App/`, `Core/`, `DataContract/`, `project.yml`, el workflow u otros apartados. Windows no compila Swift:
revisa a mano con cuidado (tipos, `import`, cierres de llaves) y deja el resto a `ios-nativa.yml` en macOS.
