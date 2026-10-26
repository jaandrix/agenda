# Bitácora — instrucciones para agentes (Codex y otros)

Lee primero `CLAUDE.md`: es la fuente de verdad del proyecto (qué es Bitácora, arquitectura, apartados y
convenciones). Lo mantiene Claude Code, que es quien implementa los cambios en este repositorio.

Si vienes a proponer diseño (ChatGPT / Codex):

- No edites el código ni hagas commits. Deja tu propuesta como un único `.md` (más imágenes numeradas) en una
  carpeta de salida fuera del repo, siguiendo `C:\Users\jandr\Documents\Bitacora-ChatGPT\PLANTILLA-PROPUESTA.md`.
- Respeta la sección «Convenciones establecidas» de `CLAUDE.md` por encima de cualquier tendencia: Poppins,
  etiquetas en minúscula con punto final, sin emojis ni glifos, sin pastillas, sin rayas de color laterales, sin
  mayúsculas espaciadas, sin etiquetas encima de los títulos, sin blur, sin «·» ni «—» en los textos.
- Los colores salen de las variables de cada tema en `styles.css` (`:root`, `body.papel`, `body.papel.acuarela`,
  `body.papel.pizarra`, `body.papel.oliva`, `body.fundador`).
- Antes de proponer un apartado, mira cómo está hecho hoy: su `renderXxx()` en `js/` y sus clases en `styles.css`.
  Reutiliza las piezas comunes (`.vista-cab`, `abrirMenuAcciones`, `.vista-seg`, `.vista-vacio`).
- Nunca pidas ni uses claves de Supabase, Stripe ni otros secretos; no hacen falta para diseñar.
- Antes de subir, ejecuta `node pruebas/comprobar.mjs`.
