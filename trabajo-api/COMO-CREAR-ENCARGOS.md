# Cómo convertir una petición en un encargo

Alejandro suele pedir las cosas en una frase («que Finanzas cargue más rápido», «arregla el escáner», «revisa Ocio»).
Antes de tocar código, conviértela en una ficha `API-NNN` con `PLANTILLA-ENCARGO.md`. La ficha es lo que evita gastar
saldo en adivinar: fija qué se cambia, dónde, cómo se comprueba y cuándo se para.

## Procedimiento (en este orden)

1. **Número.** Mira `cola/` y usa el siguiente `API-NNN` libre. Nombre del archivo: `cola/API-NNN-<tema-corto>.md`.
2. **Reconocimiento barato (máx. 10 llamadas, sin editar).** Con `Grep`/`Glob` localiza las funciones, vistas y
   pruebas implicadas. Lee solo esos tramos. Anota rutas exactas y nombres reales: la ficha no puede inventarlos.
3. **Tipo.** Elige uno solo:
   - `implementación`: algo nuevo o cambiado que la persona notará.
   - `corrección`: un fallo con reproducción o prueba que falla.
   - `auditoría`: revisar código ya escrito. Solo lectura más arreglos de fallos demostrados (`REGLAS.md` §4). Nunca
     funciones nuevas.
   - `investigación`: responder una pregunta. Sin editar código; la respuesta va en la entrega.
4. **Tamaño.** Un encargo cabe en una sesión: como guía, **hasta 6 archivos y unas 400 líneas** de cambio. Si es más,
   pártelo en varios encargos independientes (cada uno compila y pasa pruebas por sí solo) y di en qué orden van.
   Nunca un encargo «revisa los 8 worktrees» o «haz toda la 3.3».
5. **Archivos.** Lista cerrada de permitidos (rutas exactas). Todo lo demás está prohibido. Si necesita un archivo
   compartido (`REGLAS.md` §2), dilo y avisa de que en esa tanda nadie más puede tenerlo.
6. **Criterios de aceptación.** Cada uno observable y comprobable por otra persona: «al abrir Movimientos con 300
   filas no se crean las 300 tarjetas», no «mejorar el rendimiento». Al menos uno debe ser una prueba automática (Node
   o XCTest) nueva o existente.
7. **Modelo y presupuesto.** Sonnet u Opus según `REGLAS.md` §7, y un tope de turnos (orientativo: 25 para
   implementación, 15 para corrección o auditoría). Si se alcanza, se entrega como «bloqueado» con lo hecho.
8. **Dudas de producto.** Si la petición deja abierta una decisión que es de Alejandro (textos, qué se ve, si algo se
   borra), escríbela en «Preguntas» y **no la decidas tú**. Pregunta en el chat antes de empezar.
9. **Confirmación.** Enseña la ficha en el chat (resumida en 6-8 líneas) y espera el «sí». Luego guárdala en `cola/`
   y empieza el ciclo de `LEEME.md`.

## Cómo partir una tanda paralela

Cuando Alejandro quiera varias sesiones a la vez:

- Un encargo por apartado (Finanzas, Ocio, Estudios...). Dos encargos no comparten archivos.
- Los archivos compartidos tienen un solo dueño por tanda. Si dos encargos necesitan `OperacionesExtra`, uno lo tiene
  en «permitidos» y el otro deja su línea en la entrega para el coordinador.
- Nada de encargos de «auditoría de todo» después. Lo que audita de verdad es CI más la prueba en el iPhone. Si hace
  falta una revisión, que sea un encargo `auditoría` de una sola rama ya en verde, con Sonnet.
- Escribe al final de la tanda una línea por encargo en `cola/TANDA-<fecha>.md` con su orden de integración. Es el
  único documento de resumen permitido.

## Ejemplo

Petición: «La lista de movimientos de Finanzas en el iPhone da tirones al hacer scroll.»

Ficha resultante, resumida:

```
API-004 Finanzas iOS: Movimientos sin tirones. Tipo: implementación. Modelo: Opus. Tope: 25 turnos.
Permitidos: Features/Finanzas/FinanzasView.swift, Features/Finanzas/PiezasFinanzas.swift
Aceptación:
- La lista de días es perezosa (LazyVStack); solo escalonan las 8 primeras.
- La sombra se dibuja en el fondo de la tarjeta, no sobre su contenido.
- Escribir en otro apartado no reevalúa FinanzasView entera (revisión vigilada aparte).
- node --test pruebas/finanzas-ios.mjs y CI de rediseno/api-004-finanzas-scroll en verde.
Fuera de alcance: cambiar cifras, textos o el puente JS.
Preguntas: ninguna.
```

Contraejemplo (lo que no hay que hacer): «Audita Finanzas, Ocio y Panorama, corrige lo que veas y documenta todo». Sin
archivos, sin criterio de terminado y con tres apartados: así salieron en la 3.2 dos ramas que no compilaban y nueve
informes que se contradecían.
