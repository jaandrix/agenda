# Plan de la 0.24 (para esta noche, cuando Alejandro dé la orden)

Claude dirige y GPT audita. Una sola subida al final, como en la 0.22 y la 0.23.

## 1. Apuntar fiable en el iPhone y en el PC (lo principal)

El 17-11 «tarea Organización de Viajeros - PE 3 hoy a las 16,30h» tomaba el «3» como hora y dejaba «,30h» en el
título (arreglado en c01457d). Hoy el banco acierta 60 de 91 (66 %). El motor es el mismo `js/apuntar.js` en las dos
apps, así que cada arreglo vale para el PC y para el iPhone.

1. **Banco más grande y realista.** Partir de `pruebas/casos-barra.json` (91 casos) y sumar unas 80 frases como las
   que escribe Alejandro, con códigos, guiones, mayúsculas, horas en todas sus formas («16,30h», «16.30», «a las 4 y
   media», «16h»), «tarea …», «evento …», lugares y títulos con números. Guardarlas en `pruebas/casos-barra-2.json`.
2. **Agrupar los fallos por causa** con `node pruebas/barra.mjs`: hora, fecha, tipo, título que se come palabras,
   importes, trocear de más o de menos.
3. **Arreglar por grupos**, de más a menos frecuente. Cada arreglo con su caso en el banco y sin bajar ninguno de los
   que ya aciertan (`barra.mjs`, `apuntar-p0.mjs` y `apuntar-casos.mjs` en verde).
4. **Regla de oro del título:** lo que no se reconoce como fecha, hora, importe o lugar se queda en el título tal cual
   (con sus números y guiones). Nada de recortes a medias como «,30h».
5. **Objetivo:** al menos 85 % en el banco ampliado. Medir antes y después y apuntarlo aquí.
6. Llevar a `js/apuntar.js` los validadores P0 que hoy solo están en el puente del iPhone (`apuntar-puente.js`), y
   quitarlos del puente para no validar dos veces.
7. Subir la versión `?v=` de `js/apuntar.js` en `index.html` sin arrastrar los cambios de la PWA que siguen en espera
   (commit con índice temporal).

## 2. Lo que quedó de las auditorías

- **B10:** los formularios que se cierran con un gesto deben preguntar si hay cambios (editor de tarea, evento,
  movimiento, receta, viaje…). Un modificador común que compare el borrador con el original.
- **A16:** símbolos del binario (P3, solo si sobra tiempo).
- **Servidor:** probar el borrado de cuenta con una cuenta de prueba, nunca con la de Alejandro.

## 3. Lo que sigue en la web dentro de apartados ya nativos

- Viajes: reservas, listas, mapa y Destino.
- Empleo: fichas de empleo y vida laboral.
- Objetivos: Harada, kaizen y tablero.
Por valor de uso diario; lo que no entre, se queda para la 0.25.

## 4. Medir en el iPhone

Preparar una pantalla de medidas en Ajustes → avanzado (arranque, cada pestaña, Finanzas y Apuntar) para que
Alejandro mande los números reales; la tabla de CI ya compara versiones.

## Decisión pendiente de Alejandro

- Los cambios de la PWA en espera (barra de abajo un poco más grande, «más usados» animado, transiciones con escala):
  subirlos o descartarlos. Están en la copia de trabajo y en el stash «pwa-nav-ui-sin-commitear-10-11».

## Qué probar al terminar

Se escribirá al cerrar la versión, con frases concretas para Apuntar en el PC y en el iPhone.
