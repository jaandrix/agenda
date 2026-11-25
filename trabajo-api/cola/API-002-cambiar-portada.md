# API-002 Ocio iOS: cambiar o añadir la portada de un libro desde su ficha

- Tipo: implementación
- Modelo: Opus (o el mejor disponible en Antigravity). Esfuerzo: medio
- Tope: 25 turnos
- Carpeta de trabajo: `C:\Users\jandr\Documents\GitHub\agenda\.claude\worktrees\api-002-portada` (rama
  `claude/api-002-portada`, creada desde `rediseno/v32`, NO desde `main`: la 3.2 aún no está en main). En Antigravity git
  no funciona dentro del worktree: no hagas commit, deja los cambios sin commit y dilo en la entrega.
- Archivos permitidos (rutas exactas, desde `ios/BitacoraApp/BitacoraNative/`):
  - `Features/Ocio/OcioView.swift`: solo `FichaOcio` (sus acciones) y, si hace falta, el `ModalOcio` y su `switch` de
    hojas. No toques `acciones` de la cabecera (el botón «escáner.»): lo cambia el coordinador en esta misma tanda.
  - `Features/Ocio/OperacionesOcio.swift`
  - `Features/Ocio/PiezasOcio.swift`
  - `Features/Ocio/CambiarPortadaOcio.swift` (nuevo)
  - `BitacoraNativeTests/` : un archivo de prueba nuevo, `PortadaOcioTests.swift`
- Archivos compartidos que posee en esta tanda: ninguno.
- Todo lo demás está prohibido.

## Objetivo

Al tocar un libro (y de paso película, serie o juego) en Ocio del iPhone se abre su ficha; ahí, una acción
«cambiar portada.» (o «añadir portada.» si no tiene) abre una hoja que busca portadas en internet por título y autor,
enseña las candidatas en rejilla y, al tocar una, la guarda como portada de esa entrada. La búsqueda se puede corregir a
mano (campo de texto con el título) por si el escáner trajo un título raro.

## Punto de partida

- `FichaOcio` (OcioView.swift, ~línea 591): portada grande, nota y `acciones` («editar.», «abrir enlace.», «eliminar.»).
- `BuscarPortadas.buscar(c, tipo:, q:, anio:)` y `BuscarPortadas.mejor(...)` en PiezasOcio.swift: llaman a la función
  `portadas` (TMDB, Open Library, Google Books, Steam). Devuelven `[CandidataPortada]` (titulo, anio, autor, imagen).
- `BuscarISBN.portada(isbn)` en EscanerISBNOcio.swift: portada de esa edición por ISBN (pruébala primero si la entrada
  tiene `isbn`, y ponla la primera de la rejilla).
- `EditorOcio` (OcioView.swift, ~línea 711) ya pinta candidatas (`candidatas`): reutiliza su forma de pintar si encaja.
- `OcioDatosOp.op(id:portadaSiFalta:)` (OperacionesOcio.swift) solo pone portada si falta (`soloSiFalta`). Para cambiarla
  hace falta otra variante que la sustituya siempre (por ejemplo `portada:` además de `portadaSiFalta:`), que también quite
  `portadaPendiente`, como ya hace la rama `soloSiFalta` en `aplicar`.
- Guardar: `c.guardar(op)` como en `anadirEscaneado` / `rellenarPortadas` (OcioView.swift, ~líneas 511-545).
- Estilo de la app: textos en minúscula con punto final, sin emojis ni «·» ni «—». Botones con `.capsula(...)`.

## Criterios de aceptación

- [ ] En la ficha de una entrada hay «cambiar portada.» (o «añadir portada.» si `portada` está vacía).
- [ ] La hoja busca sola al abrirse con el título (y autor en libros); hay un campo para cambiar la búsqueda y un estado
      «buscando.» y otro «no hay portadas para esa búsqueda.».
- [ ] Si el libro tiene ISBN, la portada de esa edición sale la primera.
- [ ] Al elegir una, se guarda (sustituye la anterior), la hoja se cierra y la ficha y la rejilla muestran la nueva.
- [ ] Prueba XCTest nueva en `PortadaOcioTests.swift`: `OcioDatosOp.aplicar` con la variante nueva sustituye una portada
      existente y quita `portadaPendiente`; la de `soloSiFalta` sigue sin pisarla.
- [ ] `node pruebas/comprobar.mjs` y `node --test pruebas/*.mjs` sin fallos.
- [ ] Revisión estática: cada tipo, función o vista que uses existe con esa firma (Grep). El coordinador lanza la CI.

## Fuera de alcance

Subir una foto propia como portada, la web (`js/ocio.js`), cambiar el escáner o el botón «escáner.», tocar
`OperacionesExtra.swift` o `ContratoDatos.swift`.

## Preguntas para Alejandro

Ninguna.

## Entrega

Formato de `REGLAS.md` §6, en el chat. Sin archivos de informe. Sin commit (Antigravity).
