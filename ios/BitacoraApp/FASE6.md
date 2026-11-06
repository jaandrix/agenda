# Fase 6: lo que solo hace la app de iPhone

Hecho el 06-11 sin Mac ni iPhone: el código Swift no se ha compilado aquí. La parte web (`js/nativo.js`) se probó en
el navegador con el puente simulado. Al subirlo a `main`, GitHub Actions compila la app solo (`.github/workflows/ios-build.yml`),
y así se sabe si el Swift compila.

## Qué hace

| Función | Cómo |
|---|---|
| Compartir | «compartir.» de Tu mes, la guía para tu IA, invitar a un amigo o un enlace compartido abren la hoja de compartir del iPhone (también con archivos). |
| Enlaces externos | Un enlace a otra web o un `window.open` se abre en Safari dentro de la app (con «Cerrar» arriba). mailto:, tel: y mapas van a su app. Iniciar sesión y el pago de Stripe siguen dentro. |
| Alertas | `confirm()` y `alert()` ya funcionan. Antes la app no tenía `WKUIDelegate` y `confirm()` devolvía siempre «no»: nada que preguntara antes de borrar se podía borrar. |
| Descargas | «descargar mis datos.», guardar una imagen, exportar: al acabar sale la hoja de compartir con «Guardar en Archivos» o «Guardar imagen». |
| Face ID para abrir | Opcional, apagado al principio. Lo pide al abrir la app y al volver tras más de un minuto fuera. En el selector de apps sale el velo negro, sin tus datos. Si Face ID falla, se puede usar el código del iPhone. |
| Face ID para Finanzas | Opcional, apagado al principio. Las cifras de Finanzas quedan tapadas hasta que lo pases. Vale hasta que salgas de la app. |
| Avisos | Opcional, apagado al principio. Dentro de la app no hay notificaciones web: la app programa un aviso local una hora antes de cada evento con hora de los próximos 7 días (con las mismas reglas que los avisos del servidor), y en el icono pone cuántas tareas de hoy te faltan. Se ponen al día cada vez que sales de la app. |
| Recibir de otras apps | Sin extensión de compartir, porque SideStore con Apple ID gratuito no instala extensiones (ya pasó con los widgets). Hay dos formas: el enlace `bitacora://apuntar?texto=...` (para un atajo) y «Abrir en Bitácora» con un archivo de texto. Lo recibido abre Apuntar con el texto ya escrito, y tú decides si lo guardas. |
| Hápticos | Ya estaban hechos (fase 4). Se añaden los tipos `error` y `seleccion`. |
| Versión y capacidades | `window.__BITACORA_NATIVE__` lleva versión, capacidades, tipo de biometría y ajustes. Se ven en Ajustes → «app del iphone.». |

Lo que no se hace: la acción de volver nativa. El gesto nativo sigue apagado a propósito (fase 2) y manda el gesto de la web.
Tampoco hay notificaciones push de verdad, porque necesitan la cuenta de desarrollador de pago (99 €/año).

Los ajustes están en Bitácora → Ajustes → conexiones → **app del iphone.** (solo sale dentro de la app). Se guardan en el
iPhone, no en la nube.

## Compilar e instalar

### Sin Mac (lo de siempre)

1. Tras el push, abre GitHub → `jaandrix/agenda` → Actions → «iOS - Build Bitácora (sin firmar)» y comprueba que la
   última ejecución sale en verde. Si sale en rojo, el error de Swift está en el paso «Compilar»: pásamelo.
2. Descarga el artefacto `BitacoraApp-unsigned-ipa` y descomprímelo para tener `BitacoraApp.ipa`.
3. Instálalo con SideStore (o AltStore): «+» → elige el `.ipa`. Antes, borra la versión vieja si SideStore se queja.
4. En Ajustes del iPhone → General → VPN y gestión de dispositivos, la versión debe ser **1.1.0 (7)**.

Sobre los problemas que tenía la app con SideStore: las fases 1 y 2 ya arreglaron las dos causas que se vieron en el
iPhone (salía la versión de escritorio, y el gesto de volver arrastraba la web entera). La firma gratuita caduca a los
7 días: hay que refrescarla en SideStore. Ninguna función de esta fase necesita permisos de pago. Si al instalar falla
con un error de «extension» o «entitlement», avísame con el texto exacto.

### Con un Mac (si algún día hay uno)

```bash
brew install xcodegen
cd ios/BitacoraApp && xcodegen generate && open BitacoraApp.xcodeproj
```

En Xcode: target BitacoraApp → Signing & Capabilities → marca «Automatically manage signing», elige tu equipo (vale
el Apple ID gratuito) y cambia el Bundle Identifier si Xcode dice que está cogido. Después conecta el iPhone y pulsa ▶.
No hace falta añadir capacidades: Face ID y los avisos locales no usan entitlements. El texto de permiso de Face ID ya
está en Info.plist (`NSFaceIDUsageDescription`).

## Probar cada función en el iPhone

Antes: abre la app y entra con tu cuenta. Espera unos 10 minutos tras el push, para que GitHub Pages sirva el
`js/nativo.js` nuevo, o ciérrala del todo y vuelve a abrirla.

1. **Versión.** Ajustes → «app del iphone.». Al final pone «Versión 1.1.0-7». Si no sale el bloque, la web es la vieja: cierra y abre.
2. **Borrar con pregunta.** Borra algo de prueba que pregunte antes (una tarea, por ejemplo). Sale el aviso del iPhone con «Cancelar» y «Aceptar», y «Aceptar» borra.
3. **Compartir.** Panorama → «tu mes.» → «compartir.». Sale la hoja del iPhone con la imagen. También: Ajustes → «guía para tu ia.».
4. **Enlaces.** En Enlaces, toca uno guardado. Se abre Safari dentro de la app, con «Cerrar» arriba a la izquierda, y al cerrarlo vuelves a Bitácora tal cual.
5. **Descargas.** Ajustes → «descargar mis datos.». Al acabar sale la hoja de compartir: «Guardar en Archivos».
6. **Face ID para abrir.** Activa «abrir con Face ID.» (te lo pide una vez para activarlo). Sal a la pantalla de inicio: en el selector de apps, Bitácora sale en negro. Vuelve antes de un minuto: no lo pide. Vuelve tras más de un minuto: pide Face ID. Cancélalo: se queda «desbloquear.», y al pulsarlo lo vuelve a pedir.
7. **Face ID para Finanzas.** Activa «finanzas con Face ID.». Ve a Finanzas: sale «finanzas. Protegidas con Face ID.» y lo pide. Al pasarlo se ven las cifras. «volver.» te lleva al inicio. Sal de la app, vuelve y entra en Finanzas: lo pide otra vez.
8. **Avisos.** Activa «avisos en el iphone.» y acepta el permiso. Crea un evento con hora dentro de 1 hora y 5 minutos, y sal de la app. A los ~5 minutos llega «Empieza en una hora...». El icono enseña el número de tareas de hoy sin hacer. Si tienes también la PWA con avisos, te llegarán dos: apaga uno de los dos.
9. **Recibir con un atajo.** En la app Atajos → nuevo atajo:
   - Arriba, en la «i», activa «Mostrar en la hoja de compartir» y elige que acepte Texto y URL.
   - Acción «Codificar URL» con la «Entrada del atajo».
   - Acción «Texto» con `bitacora://apuntar?texto=` seguido de la variable «Texto codificado».
   - Acción «Abrir URL» con ese texto.
   - Ponle de nombre «Mandar a Bitácora».

   Después, en Safari o en Notas, selecciona un texto → Compartir → «Mandar a Bitácora». Se abre Bitácora con Apuntar y
   el texto ya escrito. Si la app estaba cerrada, aparece en cuanto acaba de cargar.
10. **Abrir en Bitácora.** En Archivos, mantén pulsado un `.txt` → Compartir → Bitácora (puede que esté en «Más»). Se abre Apuntar con su contenido.
11. **Hápticos.** Marcar una tarea vibra suave, y apuntar algo da el toque de «hecho».

Si algo no va, dime el número del paso y qué ves.
