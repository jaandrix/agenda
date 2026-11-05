# Prompt para DeepSeek: casos de prueba de la barra de apuntar

Copia todo lo que hay debajo de la línea en DeepSeek (mejor con el modo de razonamiento activado). Devuelve un JSON;
guárdalo como `pruebas/casos-barra.json` y con él se montan las pruebas automáticas de la barra (cada caso se pasa
por el intérprete real de Bitácora y se compara con lo que DeepSeek dice que debería salir).

---

Eres un probador de software. Vas a escribir casos de prueba para la barra de «apuntar» de Bitácora, una agenda
personal en español de España. En esa barra la persona escribe una frase como habla y la app decide qué crear, o
busca en sus datos si la frase empieza por «busca:». Necesito frases realistas y el resultado exacto que debería dar
la app, para comparar con lo que da de verdad.

## Fecha de referencia

Hoy es jueves 5 de noviembre de 2026, son las 16:00 y la persona vive en Zaragoza. Todas las fechas relativas
(«mañana», «el viernes», «el 12», «la semana que viene») se resuelven desde ahí:
- «el viernes» es el próximo viernes (2026-11-06); «el jueves» sin más es el de la semana que viene (2026-11-12).
- «el 3» es el día 3 del mes siguiente si ya pasó en este (2026-12-03).
- Las horas de 1 a 7 sin «de la mañana» son de la tarde («a las 5» = 17:00). De 8 a 11 sin más son de la mañana, salvo
  que el plan sea nocturno (cena, copas, concierto, cine, fiesta): entonces de la noche («cena a las 9» = 21:00).
- Sin fecha ni hora, una tarea es para hoy.

## Qué puede crear la barra (tipos)

| tipo | cuándo |
|---|---|
| tarea | algo que hacer: «llamar al banco», «mañana recoger el paquete» |
| evento | algo con hora o con gente: «cena con Marta el viernes a las 9», «dentista el 12 a las 10:30» |
| gasto | dinero que sale o entra con importe: «gasté 12 en gasolina», «me han pagado 300», «20 € de cena» (ingreso: true si entra) |
| compra | a la lista de la compra: «comprar leche y huevos», «falta pan» |
| nota | empieza por «nota:», «idea:» |
| cumple | «cumpleaños de Lucía el 14 de marzo» |
| examen / trabajo | de una asignatura que existe: «examen de Estadística el 20», «entrega de Historia el viernes» |
| recurrente | se repite: «sacar la basura todos los martes», «regar las plantas cada 3 días» |
| clase | clase fija en el horario: «clase de inglés lunes y miércoles a las 18» |
| viaje | «viaje a Lisboa del 3 al 7 de diciembre» |
| libro / serie / peli / juego | la primera palabra lo dice: «serie Los Soprano», «libro El infinito en un junco» |

Una frase puede tener varias cosas, separadas por «y», comas o punto y coma cuando cada parte tiene su propia fecha,
hora, importe o verbo: «dentista mañana a las 5 y comprar pan» son dos (evento y compra).

Asignaturas que existen: Estadística, Historia del Arte, Inglés B2.

## Datos de la persona (para las búsquedas)

```json
[
  {"tipo": "evento", "titulo": "Dentista", "fecha": "2026-11-05", "hora": "18:30"},
  {"tipo": "evento", "titulo": "Revisión con el médico de cabecera", "fecha": "2026-11-08", "hora": "10:00"},
  {"tipo": "evento", "titulo": "Fisio", "fecha": "2026-10-31", "hora": "17:00"},
  {"tipo": "evento", "titulo": "Cena con Marta", "fecha": "2026-11-06", "hora": "21:00"},
  {"tipo": "evento", "titulo": "Partido de pádel", "fecha": "2026-11-10", "hora": "19:00"},
  {"tipo": "evento", "titulo": "Concierto de Vetusta Morla", "fecha": "2026-11-21", "hora": "21:30"},
  {"tipo": "cumple", "titulo": "cumpleaños de Lucía", "fecha": "2026-11-09"},
  {"tipo": "tarea", "titulo": "Llamar al banco", "fecha": "2026-11-05"},
  {"tipo": "tarea", "titulo": "Renovar el DNI", "fecha": ""},
  {"tipo": "tarea", "titulo": "Pedir cita en el oculista", "fecha": "2026-11-12"},
  {"tipo": "examen", "titulo": "Examen de Estadística", "fecha": "2026-11-20", "hora": "09:00"},
  {"tipo": "gasto", "titulo": "Clínica dental", "fecha": "2026-11-03", "importe": -42.5},
  {"tipo": "gasto", "titulo": "Gasolina Repsol", "fecha": "2026-11-04", "importe": -55},
  {"tipo": "gasto", "titulo": "Mercadona", "fecha": "2026-11-02", "importe": -63.2},
  {"tipo": "gasto", "titulo": "Nómina", "fecha": "2026-10-31", "importe": 1650},
  {"tipo": "nota", "titulo": "Ideas para el regalo de Lucía: libro de cocina, entradas de teatro", "fecha": "2026-11-01"}
]
```

Cómo busca la barra: filtra por tipo si la frase lo dice («eventos», «tareas», «gastos», «cumpleaños», «exámenes»), por
fecha si la dice («hoy», «mañana», «esta semana» = lunes 2 a domingo 8, «la semana que viene» = 9 a 15, «este mes»,
«en octubre») y por palabras, que deben aparecer todas; cada palabra vale también por sus sinónimos (médico encuentra
dentista, fisio, oculista, clínica; comida encuentra cena, restaurante; deporte encuentra pádel, gimnasio; super encuentra
Mercadona). Lo que no tiene fecha (tareas pendientes) solo sale si no se pide fecha.

## Lo que necesito

Escribe **80 casos de apuntar** y **30 casos de búsqueda**, variados y difíciles a propósito: con faltas de ortografía
y sin tildes, mayúsculas raras, horas como «a las 5 y media», «a mediodía», «de 10 a 12», importes como «doce euros»,
«12,50», «12€», varias cosas en una frase, frases que parecen una cosa y son otra («cena con Marta» es evento aunque no
tenga hora; «pagar la luz el 15» es tarea, no gasto, porque no dice importe), y algunas ambiguas de verdad. En las
búsquedas, mezcla tipos, fechas y sinónimos, y pon algunas que no deberían encontrar nada.

Devuelve **solo** un JSON válido con esta forma, sin texto alrededor:

```json
{
  "apuntar": [
    {
      "frase": "dentista mañana a las 5 y comprar pan",
      "cosas": [
        {"tipo": "evento", "titulo": "Dentista", "fecha": "2026-11-06", "hora": "17:00", "hora_fin": null, "importe": null, "ingreso": false, "lugar": null},
        {"tipo": "compra", "titulo": "pan", "fecha": "2026-11-05", "hora": null, "hora_fin": null, "importe": null, "ingreso": false, "lugar": null}
      ],
      "dificultad": "facil | media | dificil",
      "por_que": "una línea: qué pone a prueba este caso"
    }
  ],
  "buscar": [
    {
      "frase": "busca: médico esta semana",
      "tipos": [],
      "desde": "2026-11-02",
      "hasta": "2026-11-08",
      "palabras": ["medico"],
      "debe_encontrar": ["Revisión con el médico de cabecera", "Dentista", "Clínica dental"],
      "no_debe_encontrar": ["Fisio"],
      "por_que": "una línea"
    }
  ]
}
```

Reglas para los campos:
- `titulo`: el título limpio, como lo guardaría una persona, con la primera letra en mayúscula y sin la fecha, la hora
  ni el importe («Cena con Marta», no «cena con marta el viernes a las 9»). En compra, solo lo que se compra.
- `fecha`: AAAA-MM-DD. En gastos sin fecha, hoy. En recurrentes, la fecha de la primera vez.
- `hora` y `hora_fin`: HH:MM en 24 h, o null.
- `importe`: número positivo (12.5), o null. `ingreso`: true solo si el dinero entra.
- `palabras` (búsqueda): las palabras con significado, en minúsculas y sin tildes, sin las de fecha ni las de tipo.
- Si un caso es ambiguo de verdad, elige lo que haría una persona razonable y explícalo en `por_que`.
