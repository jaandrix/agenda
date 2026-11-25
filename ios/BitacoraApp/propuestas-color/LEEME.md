# Propuestas de color para la 3.2

Dos propuestas para dar «un pelín más de color» a la app nativa sin tocar la identidad: Poppins, carbón `#111315`,
naranja coral `#FF6B4A`, minúsculas con punto, tarjeta oscura «ahora.» y botón de apuntar negro. **No se ha aplicado
nada**: esto es solo para elegir.

Imágenes (iPhone de 390 pt de ancho, a 2×; Calendario va algo más alta para que se vea la agenda entera):

| | Inicio | Calendario |
|---|---|---|
| 3.1 de ahora (referencia) | `actual-inicio.png` | `actual-calendario.png` |
| A, «marfil.» | `a-inicio.png` | `a-calendario.png` |
| B, «pastel.» | `b-inicio.png` | `b-calendario.png` |

`maqueta.html` reproduce las dos pantallas (`?p=actual|a|b&s=inicio|calendario`) y `sh render.sh` vuelve a sacar los PNG
con Chrome sin ventana.

## A, «marfil.»: lienzo cálido, el color en piezas pequeñas

El gris frío pasa a un marfil cálido y los grises de texto y filetes se calientan con él. Cada tipo (evento, estudio,
cumple, viaje, dinero) gana su tinte pastel, que aparece en piezas pequeñas: el cuadradito de la fila de Inicio (en vez
del punto), el bloque de hora y el icono del Calendario. El día elegido se marca en melocotón en lugar de gris, y el fin
de semana del mes lleva un fondo apenas más claro. Las tarjetas siguen blancas: es el cambio más discreto.

Tokens en `Lienzo.Hex`:

| token | ahora | A |
|---|---|---|
| `fondo` | `#F2F3F5` | `#F6F1EA` |
| `sutil` | `#E8E9EC` | `#EEE7DE` |
| `tintaSecundaria` | `#5F6672` | `#635E58` |
| `tintaTerciaria` | `#9AA0AA` | `#A29B92` |
| `filo` / `filoFuerte` | carbón al 6 % / 12 % | `#3C2814` al 7 % / 14 % |
| `azul` | `#4A72E8` | `#5B7FE6` |
| `ambar` | `#E9A21F` | `#E3A23A` |
| `violeta` | `#8A63D2` | `#9070D6` |
| `verde` | `#23986A` | `#2E9E72` |

Nuevos: `Lienzo.Tinte` (fondo pastel por tipo) `evento #FFE9E1`, `tarea #EFEAE3`, `estudio #E6ECFC`, `cumple #FBF0D7`,
`viaje #EFE8FA`, `dinero #E0F2E8`; `Lienzo.seleccion #FFE9E1` (día elegido en la semana y el mes) y
`Lienzo.finde #FAF6F1` (sábado y domingo en el mes). Degradado de portada: `#FF6B4A` 95 % → `#FFAA80` 60 % (36 %) →
`#FFD6BA` 35 % (62 %) → lienzo.

Piezas que cambiarían: `SemanaCarrusel` y `MesFlotanteCalendario` (placa del día elegido, finde), `FilaEventoInicio`
(cuadradito tintado con el icono del tipo en vez del puntito) y `BloqueHoraCalendario` / icono de la tarjeta (tinte
sólido del tipo en vez del 13 %).

## B, «pastel.»: tarjetas rellenas por tipo

El lienzo se queda neutro y un poco más luminoso, y el color ocupa superficie: cada evento va en una tarjeta rellena del
pastel de su tipo (melocotón, cielo, mantequilla, lila, menta) con la segunda línea en un tono oscuro del mismo color;
las tareas siguen blancas (o discontinuas en Calendario), así que de un vistazo se separa lo que tienes de lo que
haces. Por contraste, el día elegido pasa a una placa carbón (como el segmento «mes / semana»), y la pestaña activa de
la barra se tiñe de coral. Es la propuesta con más personalidad.

Tokens en `Lienzo.Hex`:

| token | ahora | B |
|---|---|---|
| `fondo` | `#F2F3F5` | `#F3F4F7` |
| `sutil` | `#E8E9EC` | `#E9EBEF` |
| `tintaSecundaria` | `#5F6672` | `#5D6470` |
| `ambar` | `#E9A21F` | `#E3A21F` |

Nuevos: `Lienzo.Relleno` (fondo de tarjeta, tinta de su detalle) `evento #FFE9E2 / #A8401F`,
`estudio #E3EAFF / #2F4FA8`, `cumple #FFF2D1 / #80590A`, `viaje #EEE7FF / #5B3FA0`, `dinero #DDF3E7 / #1C6E4D`
(todas ≥ 4,5:1); dentro, el bloque de hora y los iconos van en blanco al 75 %. `Lienzo.pildoraActiva #FFE4DB` con texto
`#C2441F` (barra flotante). Día elegido: `Lienzo.oscuro` con el número en `#FF8A6E` y el punto de tarea en blanco.
Degradado de portada: `#FF6B4A` 92 % → `#FFA082` 55 % (34 %) → `#FFCDBE` 30 % (58 %) → lienzo.

Piezas que cambiarían: `FilaEventoInicio` y la tarjeta de evento de `CalendarioView` (relleno por tipo),
`BloqueHoraCalendario`, `SemanaCarrusel` y `MesFlotanteCalendario` (placa carbón) y `BarraFlotante` (píldora coral).

## Cómo se aplicaría

Todo pasa por `DesignSystem/V2/Lienzo.swift` (tokens) y las cinco piezas citadas; ningún apartado usa hex sueltos, así
que el resto de pantallas hereda el lienzo y los tintes solo. `TemaTokens.bitacora` (Tema.swift) lee los mismos
`Lienzo.Hex`, así que lo que aún usa `Paleta` también cambiaría.
