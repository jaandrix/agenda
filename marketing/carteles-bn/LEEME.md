# Carteles en blanco y negro (4 por folio)

Un PDF por modelo en `pdf/`: folio A4 con **4 copias iguales de tamaño A6**. Dos cortes por las líneas
discontinuas (vertical y horizontal, marcadas con ✂) y salen 4 carteles. Impresión en blanco y negro,
con grano para que tengan textura de impreso.

Los QR llevan corrección de errores máxima y la "b." en el centro; `generar.py` comprueba con OpenCV que
las 4 copias de cada folio se leen. Cada modelo tiene su origen propio en GoatCounter (`cartel-bn-<modelo>`).

Dos familias: **carteles con gancho** y **flyers útiles**, pensados para que quien los coja se los quede.

| Modelo | Qué es | Fondo |
|---|---|---|
| `no-cambia` | «Este cartel no te va a cambiar la vida.» Pero puede ahorrarte abrir seis apps cada mañana. | blanco |
| `donde` | «Lo apuntaste. ¿Pero dónde?» Notas, audios, capturas, el grupo de clase, un pósit... tachados. | blanco |
| `examen` | «¿Cuándo es tu próximo examen?» Si has tenido que pensarlo, esto es para ti. | negro |
| `pizza` | «Pablo te debe 7,80 € de la pizza.» Él no se acuerda. Bitácora sí. | blanco |
| `manana` | «Mañana tengo que:» con líneas para escribir encima. | blanco |
| `sin-anuncios` | «No tiene anuncios. No quiere tu tiempo.» | blanco |
| `anuncio` | «Esto es un anuncio.» Sí. De una agenda. Sin anuncios dentro ni venta de datos. | negro |
| `semana` | **Útil.** Planificador semanal para rellenar (lunes a domingo). | blanco |
| `cuatri-1` | **Útil.** Calendario del 1er cuatrimestre 2026/27 (septiembre a enero). | blanco |
| `cuatri-2` | **Útil.** Calendario del 2º cuatrimestre (febrero a junio de 2027). | blanco |
| `examenes` | **Útil.** Tabla de exámenes: asignatura, fecha y nota. | blanco |
| `habitos` | **Útil.** 5 hábitos con un círculo por cada día del mes. | blanco |
| `cuentas` | **Útil.** «¿Quién debe a quién?»: quién, qué, cuánto y si ya está pagado. | blanco |

Para imprimir: escala 100 % (nunca «ajustar a página»), sin márgenes si la impresora lo permite. Los de
fondo negro gastan bastante más tóner. Escanea un QR de la primera copia antes de imprimir el resto.
Para rehacerlos: edita `carteles-bn.html` y ejecuta `py marketing/carteles-bn/generar.py`.
