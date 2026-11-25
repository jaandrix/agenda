# API-001 Guía 3.2: Despensa y suscripciones como funcionan ahora

- Tipo: implementación (solo textos)
- Modelo: Gemini o Sonnet. Esfuerzo: bajo o medio
- Tope: 15 turnos
- Rama: `claude/api-001-guia-32`, creada desde `rediseno/v32` (no desde `main`: los cambios que hay que documentar
  solo están en la rama de integración). Worktree: `.claude/worktrees/api-001-guia-32`.
- Archivos permitidos:
  - `js/bajo-demanda/guia.js`
  - `js/bajo-demanda/guia-ia.js`
  - `js/landing.js` (solo el array `NOVEDADES`; en esta tanda este encargo es su único dueño)
- Archivos compartidos que posee en esta tanda: `js/landing.js` (`NOVEDADES`).
- Todo lo demás está prohibido, incluido `index.html` (no subas `?v=`).
- Terminal: PowerShell en Windows. Nada de heredocs ni sintaxis Bash.

## Objetivo

La guía de la app, la guía para tu IA y «actualizaciones.» cuentan cómo funcionan desde la 3.2 la Despensa y las
suscripciones, sin restos del comportamiento anterior.

## Punto de partida

Qué cambió en la 3.2 (commit `df1e163`, ya en `rediseno/v32`):

1. **La Despensa nunca apunta gastos en Finanzas.** «terminar la compra.» ya no tiene la casilla «apuntar también el
   gasto en finanzas.»; solo guarda la compra en el historial con su tienda. El ticket del conector tampoco crea gasto,
   aunque llegue con `gasto: true`. El gasto real llega con el extracto del banco. Código: `js/compra.js`.
2. **Una suscripción o un gasto fijo ya no se apunta solo como gasto el día de cargo.** Cuenta cuando llega su cargo del
   banco (pendiente o cobrado) o cuando lo apuntas a mano. Hasta entonces es un cargo previsto: sale en
   «próximos cargos.» y en la previsión de fin de mes, pero no suma como gasto. Los provisionales viejos del mes en curso
   y del anterior se quitan solos. Código: `js/finanzas-pro.js` (`prepararFinanzas`), `js/suscripciones.js`
   (`suscripcionEsProvisional`, `suscripcionesPrevistas`, `suscripcionesPorCobrarMes`).
3. El cambio de `js/enlaces-proyectos.js` (`limpiarCopiasDeTrabajos`) es interno: quita copias duplicadas de la tarea de
   un trabajo entre dispositivos. **No necesita texto en la guía**, aunque `comprobar.mjs` avise por él.

Textos que hoy dicen lo contrario o se quedan cortos (comprueba los números de línea con Grep, pueden moverse):

- `guia.js` ~212: el botón «terminar la compra.» habla de la casilla que ya no existe.
- `guia.js` ~285 («recurrentes.» de Finanzas): no dice que el gasto cuenta cuando llega el cargo del banco.
- `guia-ia.js` ~116, receta «Dar de alta una suscripción o un gasto fijo»: falta el paso que explica lo mismo.
- `guia-ia.js` ~173 (receta de la compra): revisa que no prometa nada de Finanzas.
- `guia-ia.js` `GUIA_IA_PROBLEMAS` (~215): añade un problema «Una suscripción no cuenta como gasto este mes» con la
  respuesta: es un cargo previsto hasta que llega del banco; importa el extracto o apúntalo a mano.
- `landing.js` `NOVEDADES` (~198): una entrada nueva arriba del todo, `fecha: '2026-11-25'`, `rama: 'todos'`, con el
  mismo formato que las demás (nombre, para quién y una línea de texto) que cuente los puntos 1 y 2.

## Criterios de aceptación

- [ ] Ningún texto de `guia.js` ni de `guia-ia.js` menciona «apuntar también el gasto en finanzas» ni que una
      suscripción se apunte sola el día de cargo (comprobar con Grep y pegar el resultado vacío).
- [ ] Los cuatro sitios de la lista explican el comportamiento nuevo, en el estilo de la casa: frases cortas, botones en
      minúscula con punto final, sin «·», sin «—», sin emojis.
- [ ] `NOVEDADES` tiene la entrada del 2026-11-25 la primera.
- [ ] `node pruebas/comprobar.mjs` termina en «Comprobación correcta» y ya no sale el aviso «cambia ... y la guía no»
      (desaparece en cuanto `guia.js` cambia respecto a `origin/main`; no lo des por bueno solo por eso, cuenta los
      criterios de arriba).
- [ ] `node --test pruebas/*.mjs` sin fallos (di el número).
- [ ] Un solo commit en `claude/api-001-guia-32`. Sin push: no hay Swift, así que no hace falta CI.

## Fuera de alcance

Cambiar código que no sea texto, otros apartados de la guía, la app iOS y la guía del móvil.

## Preguntas para Alejandro

Ninguna. Si al leer el código el comportamiento no coincide con lo que dice esta ficha, para y pregunta antes de
escribirlo.

## Entrega

Formato de `REGLAS.md` §6, en el chat. Sin archivos de informe.
