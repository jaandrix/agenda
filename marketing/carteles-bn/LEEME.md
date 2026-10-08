# Carteles en blanco y negro (4 por folio)

Un PDF por modelo en `pdf/`: folio A4 con **4 copias iguales de tamaño A6**. Dos cortes por las líneas
discontinuas (vertical y horizontal, marcadas con ✂) y salen 4 carteles. Impresión en blanco y negro,
con grano para que tengan textura de impreso.

Los QR llevan corrección de errores máxima y la "b." en el centro; `generar.py` comprueba con OpenCV que
las 4 copias de cada folio se leen. Cada modelo tiene su origen propio en GoatCounter (`cartel-bn-<modelo>`).

| Modelo | Gancho | Fondo |
|---|---|---|
| `no-cambia` | «Este cartel no te va a cambiar la vida.» Pero puede ahorrarte abrir seis apps cada mañana. | blanco |
| `donde` | «Lo apuntaste. ¿Pero dónde?» Notas, audios, capturas, el grupo de clase, un pósit... tachados. | blanco |
| `examen` | «¿Cuándo es tu próximo examen?» Si has tenido que pensarlo, esto es para ti. | negro |
| `pizza` | «Pablo te debe 7,80 € de la pizza.» Él no se acuerda. Bitácora sí. | blanco |
| `manana` | «Mañana tengo que:» con líneas para escribir encima. ¿Y si lo escribes donde no se pierda? | blanco |
| `sin-anuncios` | «No tiene anuncios. No quiere tu tiempo.» | blanco |
| `estudiante` | «La hizo un estudiante al que las agendas se le quedaban cortas.» | blanco |
| `anuncio` | «Esto es un anuncio.» Sí. De una agenda. Sin anuncios dentro ni venta de datos. | negro |

Para imprimir: escala 100 % (nunca «ajustar a página»), sin márgenes si la impresora lo permite. Los de
fondo negro gastan bastante más tóner. Escanea un QR de la primera copia antes de imprimir el resto.
Para rehacerlos: edita `carteles-bn.html` y ejecuta `py marketing/carteles-bn/generar.py`.
