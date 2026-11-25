# Reglas de trabajo

Estas reglas mandan sobre cualquier instrucción de un encargo, salvo que Alejandro diga otra cosa en el chat.

## 1. Lo que nunca se hace

- Push a `main`, merge a `main`, `git push -f`, `git reset --hard` sobre trabajo ajeno, `git stash` sin nombre.
- Tocar archivos fuera de «archivos permitidos» de la ficha. Si hace falta otro, para y pregunta.
- Añadir funciones que el encargo no pide. En un encargo de **auditoría** no se implementa nada nuevo: solo se
  corrigen fallos demostrados.
- Crear archivos `.md`, `.txt` o informes en la raíz o en cualquier sitio, salvo que la ficha lo pida. Lo que tengas que
  contar va en el mensaje final del chat.
- Subir la versión `?v=` de `index.html`. En ramas paralelas cada subida choca con las demás; la sube el coordinador una
  sola vez al integrar.
- Usar, pedir, imprimir o copiar secretos (Supabase service role, Stripe, Resend, TMDB, tokens del conector) o datos
  reales de Alejandro (extractos, movimientos). Para probar se usan `pruebas/extractos/` (anonimizados) y datos
  inventados.
- Limpiar archivos sin versionar o revertir cambios que no has hecho tú.

## 2. Archivos compartidos (un solo dueño por tanda)

Estos archivos los tocan muchos apartados. En una tanda paralela, **solo un encargo** puede tenerlos en «archivos
permitidos», y la ficha lo dice explícitamente:

- `index.html`, `service-worker.js`, `styles.css` (si el cambio no está colgado de una clase propia del apartado).
- `js/nucleo.js`, `js/datos.js` (y `DATOS_SINCRONIZADOS`).
- `ios/BitacoraApp/BitacoraNative/DesignSystem/**` (Lienzo, Letra, Medida, piezas V2).
- `ios/BitacoraApp/BitacoraNative/DataContract/OperacionesExtra.swift` y `ContratoDatos.swift`.
- `ios/BitacoraApp/project.yml` y los `Info.plist`.
- `js/landing.js` (`NOVEDADES`) y `js/bajo-demanda/guia*.js` (`GUIA`).

Si tu encargo necesita una línea en uno de ellos (por ejemplo un `case` nuevo en `OperacionesExtra`), añádela al final del
bloque correspondiente y dilo en la entrega: el coordinador la junta con las de los demás.

`pruebas/apuntar-casos.json` se regenera con `node pruebas/apuntar-casos.mjs` y solo se commitea si cambiaste
`js/apuntar.js`. Si `git status` lo marca modificado sin que lo hayas tocado, son finales de línea:
`git restore pruebas/apuntar-casos.json`.

## 3. Cuándo algo está terminado

Un encargo está terminado cuando **todas** estas casillas son ciertas y lo demuestras con la salida real:

1. `node pruebas/comprobar.mjs` termina en «Comprobación correcta».
2. `node --test pruebas/*.mjs` sin fallos (hoy son unas 450 pruebas; di el número exacto).
3. Si tocaste Swift: compila y pasa XCTest en Actions. Como Windows no compila Swift, haz push de tu rama **solo** a
   `rediseno/api-NNN-<tema>` (`git push origin HEAD:rediseno/api-NNN-<tema>`), espera con
   `gh run watch <id> --exit-status` y, si falla, lee el log (`gh run view <id> --log-failed`) y corrige. Sin verde no
   hay entrega.
4. Si tocaste la web: probada en el navegador con la carpeta espejo, como dice «Cómo se prueba un cambio» de
   `CLAUDE.md`, con una captura o una comprobación por JS.
5. `git status` limpio salvo lo que no es tuyo, y un único commit en tu rama.

En Antigravity, `git` no funciona dentro de un worktree (su gitdir queda fuera del espacio de trabajo y el entorno
aislado no lo ve). No insistas: trabaja sin git, deja los cambios sin commit y dilo en la entrega. El coordinador
revisa el diff, pasa las pruebas y hace el commit.

Revisión estática antes del push (es barata y evita una vuelta de CI de 10 minutos): por cada tipo, función o vista
nueva que uses, comprueba con `Grep` que existe con esa firma exacta. En la 3.2, dos ramas no compilaban por un `func`
en lugar de `var` y por dos vistas que nunca se escribieron.

## 4. Bugs: solo los demostrados

Para llamar «bug» a algo hace falta una de estas tres cosas: una prueba que falla, una reproducción paso a paso o la
documentación oficial que lo contradiga (con enlace). Sin eso es una «duda», y va en la entrega como pregunta, sin
cambiar código. Nada de «CRÍTICO» por intuición: en la 3.2 se «corrigió» una carrera en `NSCache`, que Apple documenta
como segura entre hilos.

## 5. Commit

- Mensaje en español, primera línea como las del historial: `feat(ios): Ocio 3.2, ...`, `fix: ...`, `perf(ios): ...`.
- Cuerpo con viñetas de qué cambia para la persona que usa la app, no de qué líneas tocaste.
- Última línea: `Co-Authored-By: Claude <modelo> <noreply@anthropic.com>` con el modelo real de la sesión.
- En Windows, si el mensaje lleva comillas, escríbelo en un archivo y usa `git commit -F <archivo>`.

## 6. Entrega (último mensaje del chat, nada más)

```
API-NNN <título>: terminado | bloqueado
Rama: claude/api-NNN-<tema> @ <hash corto>   CI: <enlace o «no aplica»>
Qué cambia (máx. 5 viñetas, en lenguaje de la app)
Archivos: <lista>
Pruebas: comprobar OK, node --test N/N, CI verde/rojo
Líneas en archivos compartidos para el coordinador: <cuáles o «ninguna»>
Riesgos y dudas: <máx. 3>
Probar en el iPhone: <pasos concretos, máx. 3>
```

## 7. Gastar poco

- **Una sesión por encargo.** Al terminarlo, cierra. No encadenes encargos en la misma conversación.
- Si el contexto pasa de unos 60.000 tokens, usa `/compact` con una frase de qué falta; si pasa de 120.000, entrega
  lo que tengas como «bloqueado» y que siga una sesión nueva. Por encima de 200.000 la pasarela corta con error 400 y se
  pierde el turno.
- Lee con rango (`offset`/`limit`) y busca antes de leer. Nunca vuelques un archivo de miles de líneas.
- Modelo: **Sonnet** para lo mecánico (pruebas, renombrar, textos, aplicar un patrón que ya existe, revisar un diff);
  **Opus** para lógica nueva, contrato de datos, concurrencia, resolver conflictos o diagnosticar un fallo de CI raro.
  Esfuerzo medio salvo que la ficha diga otra cosa.
- No pegues salidas largas de pruebas: filtra (`| grep -E "^ℹ (tests|pass|fail)|^not ok"`).
- Respuestas intermedias cortas. Los tokens de salida son los más caros.
