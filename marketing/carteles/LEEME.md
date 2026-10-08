# Carteles de Bitácora

Listos para imprimir en `pdf/` (tamaño exacto, sin márgenes) y para verlos rápido en `png/`.
Cada diseño lleva su propio QR con `?utm_source=cartel-<diseño>`: en GoatCounter, en
"Referrers", aparece como `cartel-pregunta`, `cartel-lista`... y así se ve cuál trae más visitas.

| Diseño | Idea | Tamaños | Fondo |
|---|---|---|---|
| `pregunta` | «¿Cuántas apps has abierto hoy para saber qué tienes que hacer mañana?» | A3, A4, A5 | oscuro |
| `lista` | La lista de lo que tienes en la cabeza; la última línea es la pregunta | A3, A4, A5 | claro |
| `catorce` | «Tu vida no cabe en 14 apps. Cabe en una.» con 14 círculos tachados y uno naranja | A3, A4, A5 | claro |
| `universidad` | «¿Cuánto necesitas sacar en el final?» con el cuatrimestre real de la app | A3, A4, A5 | oscuro |
| `amigos` | «¿Quién debe a quién del viaje?» con los saldos reales de la app | A3, A4, A5 | oscuro |
| `tiras` | Cartel con 8 tiras para arrancar (appbitacora.es · 14 días gratis) | A4 | claro |
| `tarjeta` | Tarjeta de 85 × 55 mm con QR, para dejar en mesas o repartir | 85 × 55 mm | oscuro |
| `posit` | Pósit de 76 × 76 mm (papel adhesivo amarillo) con la lista | 76 × 76 mm | amarillo |

Para imprimir:
- En copistería, pide **sin márgenes / a sangre** y **escala 100 %** (no «ajustar a página»).
- Los de fondo oscuro gastan mucha tinta: en impresora de casa, mejor los claros.
- Antes de imprimir muchos, escanea el QR de una copia de prueba con el móvil.
- Tarjetas: en cartulina de 300 g. Pósits: en hojas A4 de etiquetas adhesivas o pide «pósits personalizados».

Para regenerarlos tras cambiar textos: edita `carteles.html` y ejecuta `py marketing/carteles/generar.py`
(necesita `pip install qrcode` y Chrome).
