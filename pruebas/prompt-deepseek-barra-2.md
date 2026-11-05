# Prompts 2 y 3 para DeepSeek: más casos para la barra de apuntar

Pégalos **en la misma conversación** de DeepSeek donde usaste `prompt-deepseek-barra.md` (así conserva la fecha de
referencia, los tipos y los datos de la persona). Guarda cada respuesta como se indica.

---

## Prompt 2: los casos donde la barra más falla → guardar como `pruebas/casos-barra-2.json`

Gracias. Con tus casos he medido la barra: acierta el 66 % al apuntar. Ahora necesito **70 casos nuevos de apuntar**,
con el mismo formato JSON de antes (solo la clave `"apuntar"`), concentrados en lo que más falla. Repártelos así:

1. **Importes sin verbo ni símbolo** (12 casos): «12,50 de cena», «nómina 1650», «mercado 63,20», «taxi 18», «8 pavos
   de copas», «me han cobrado 30 de luz», «me han devuelto 20 de la compra», «Bizum de 15 de Ana» (ingreso), «comisión
   del banco 2,50». Incluye ingresos y gastos.
2. **Varios gastos en una frase** (10 casos): «gasté 15 en cine y 20 en cena», «pagar luz 45 y agua 30», «café 2,20,
   bocadillo 4 y agua 1», «12 de gasolina y 30 de super». Cada importe es una cosa.
3. **Clases del horario** (8 casos): «clase de inglés lunes y miércoles a las 18», «yoga martes y jueves a las 7»,
   «clase de piano los viernes a las 5». Tipo `clase`, fecha = la primera vez, hora en 24 h.
4. **Recurrentes** (8 casos): «todos los martes», «cada lunes», «los jueves», «cada 2 semanas», «el día 1 de cada
   mes», «todos los días a las 8». Fecha = la primera vez que toca (si hoy no toca, la próxima).
5. **Evento o tarea** (14 casos): con hora y algo que pasa en un sitio o con alguien → evento («recoger el traje el
   viernes a las 18», «llamar a María a las 5», «cena con Marta» sin hora); recados y pagos sin importe → tarea
   («pagar la luz el 15», «pagar el alquiler el 1», «renovar el DNI el lunes»). Explica en `por_que` el criterio.
6. **Compras con fecha** (6 casos): «comprar pan el lunes y leche el martes», «el sábado comprar carbón».
7. **Horas difíciles** (8 casos): «a mediodía» (12:00), «a la hora de comer» (14:00), «por la tarde» (sin hora),
   «a las 10 de la noche», «a las 8 y cuarto», «a las 9 menos cuarto», «de 5 a 7», «cine el sábado a las 10» (22:00).
8. **Prefijos que mandan** (4 casos): «tarea: …», «evento: …», «nota: …», «compra: …» con «y» dentro: una sola cosa
   del tipo del prefijo, salvo «compra:», que mete cada producto.

Devuelve solo el JSON, sin texto alrededor.

---

## Prompt 3: preguntas sobre tus datos → guardar como `pruebas/casos-preguntas.json`

La barra también responde preguntas con los datos de la persona (los del primer mensaje). Escribe **30 preguntas**
realistas, como las haría alguien en el móvil, con la respuesta exacta que debería dar la app. Mezcla:

- dinero: «¿cuánto gasté en gasolina este mes?», «¿cuánto llevo gastado en noviembre?», «¿cuánto me ingresaron en
  octubre?», «¿puedo permitirme 200 €?» (sin datos suficientes, la respuesta debe decirlo);
- fechas: «¿cuándo es el examen de estadística?», «¿cuándo fue la última vez que fui al fisio?», «¿cuándo es el
  cumpleaños de Lucía?», «¿qué tengo mañana?»;
- conteos: «¿cuántas veces fui al médico este año?», «¿cuántos eventos tengo esta semana?»;
- y 5 que no se pueden responder con esos datos (la respuesta esperada es que no hay datos).

Formato:

```json
{
  "preguntas": [
    {
      "frase": "¿cuánto gasté en gasolina este mes?",
      "respuesta_esperada": "55,00 € en gasolina este mes (1 movimiento).",
      "datos_clave": ["55", "gasolina", "1 movimiento"],
      "por_que": "Solo el movimiento Gasolina Repsol del 4 de noviembre."
    }
  ]
}
```

`datos_clave` son las cifras o palabras que tienen que aparecer sí o sí en la respuesta (se comprueban esas, no la
frase exacta). Devuelve solo el JSON.
