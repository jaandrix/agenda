# OpenCode en Bitácora: guía de coordinación para Claude Code

## Resumen ejecutivo

OpenCode es útil como implementador de cortes bien delimitados, no como responsable final de una versión. En la tanda
0.15 de la app iOS produjo una parte importante de la barra inferior, el carrusel semanal y el esqueleto amplio de
Finanzas. El coordinador tuvo que revisar el contrato con la PWA, corregir errores de cálculo, completar Despensa y
Ocio, ejecutar las pruebas, decidir qué entraba en producción y operar GitHub Actions.

La mejor división observada es esta:

1. Claude Code define un corte vertical pequeño, los archivos permitidos y criterios comprobables.
2. OpenCode inspecciona, implementa y añade pruebas, sin commit ni push.
3. Claude Code revisa cada línea sensible, corrige, integra y ejecuta las comprobaciones.
4. Solo Claude Code hace commit, push, vigila Actions y audita la IPA.

No conviene darle una petición maestra con muchos apartados acoplados. En esta tanda la velocidad y la precisión bajaron
al crecer el contexto; funcionó mejor con encargos independientes de barra, carrusel y proyección de Finanzas.

## Configuración del repositorio

OpenCode debe iniciarse desde la raíz del repositorio. La configuración está en `opencode.json` y los agentes y comandos
versionados en `.opencode/`:

- agente principal: `bitacora`;
- revisores de solo lectura: `revisor-ios` y `revisor-ci`;
- comandos: `/implementar-ios`, `/auditar-ios` y `/preparar-ipa`;
- instrucciones de proyecto: `CLAUDE.md`, `AGENTS.md` e `ios/BitacoraApp/AGENTS.md`;
- compartir sesiones está desactivado;
- OpenCode no puede publicar salvo autorización expresa.

Durante la tanda se seleccionó `iceman-free`. Ese es el nombre que mostró OpenCode; no se pudo acreditar desde el
repositorio el proveedor o identificador interno exacto. La selección de modelo no está fijada en `opencode.json`, por
lo que debe comprobarse en la interfaz al iniciar cada sesión. En el terminal no interactivo usado por el coordinador,
el ejecutable no estaba en `PATH`; esto no invalida la instalación que se abre desde su acceso normal, pero sí aconseja
anotar la ruta o añadirla al `PATH` del usuario.

## Cómo pedirle trabajo

Una petición eficaz tiene una sola responsabilidad y esta forma:

```text
/implementar-ios <objetivo concreto>

Contexto:
- rama y estado conocido;
- implementación PWA que es fuente de verdad;
- archivos que puede tocar y cambios ajenos que debe preservar.

Criterios de aceptación:
1. comportamiento observable;
2. esquema de datos exacto e idempotencia;
3. accesibilidad, tema y movimiento reducido;
4. pruebas concretas;
5. no commit, no push y no cambios fuera de alcance.

Entrega:
- diff revisable;
- pruebas ejecutadas y resultado;
- riesgos que solo puede comprobar macOS o el iPhone.
```

Conviene indicar funciones y claves reales de la PWA, no describirlas de memoria. Para datos, exigir siempre:

- conservar campos desconocidos;
- tocar solo las claves superiores declaradas por la operación;
- reaplicar la operación sin producir un segundo parche;
- una prueba con datos antiguos o campos extra;
- no inventar formatos alternativos.

Para interfaz, dar medidas y estados verificables: tamaño, alineación, arrastre en curso, punto de encaje, estado vacío,
Dynamic Type, VoiceOver y Reduce Motion. Una captura deseada ayuda más que adjetivos como «más nativo».

## Qué trabajo derivarle

Encaja bien:

- vistas SwiftUI acotadas sobre modelos ya definidos;
- componentes visuales y estados vacíos;
- proyecciones de lectura puras;
- pruebas unitarias repetitivas;
- documentación cercana al código;
- búsquedas y comparación inicial con la PWA;
- una auditoría de solo lectura después de que otro agente haya implementado.

Debe quedar en manos del coordinador:

- diseño del contrato de sincronización y migraciones;
- decisiones que mezclan varios subsistemas;
- cálculos de dinero, calendarios y deduplicación sin revisión humana;
- resolución de conflictos con cambios ajenos;
- aceptación visual final en un iPhone;
- commits, publicación, secretos, firma y GitHub Actions;
- diagnóstico final de una compilación macOS o de la IPA.

Puede ayudar en esas áreas, pero su resultado debe tratarse como propuesta, no como veredicto.

## Calidad observada en la tanda 0.15

### Barra inferior

Produjo un cambio compacto y aprovechable: superficie azul, geometría, botón central mayor, iconos simplificados y menú
rápido. La integración necesitó auditoría visual y pruebas de medidas, pero el rendimiento fue bueno.

### Carrusel semanal

Implementó la estructura de tres semanas, el seguimiento del dedo y el encaje. Fue más lento que la barra, pero el
resultado resultó una base válida tras revisar el estado seleccionado, precarga y Reduce Motion.

### Finanzas

Generó mucho volumen útil: modelos de lectura, cinco secciones de interfaz y pruebas. También introdujo tres fallos que
demuestran por qué no debe aceptarse por tamaño del diff: duplicaba el primer día de una serie, calculaba mal el mes
siguiente de diciembre y referenciaba incorrectamente el redondeo del ahorro. El coordinador los corrigió antes de
integrar. La cobertura funcional fue alta, la precisión inicial fue media.

### Despensa y Ocio

OpenCode no terminó estas partes dentro de un tiempo útil. El coordinador las implementó para retirar al agente de la
ruta crítica. Cuando un encargo deja de producir cambios verificables durante demasiado tiempo, es mejor interrumpirlo,
conservar el diff válido y dividir el resto.

## Medición de trabajo y ahorro

No hay una telemetría fiable de tokens en el repositorio, y `iceman-free` no expuso aquí un contador verificable. No se
deben presentar cifras exactas. Para esta tanda se puede medir trabajo aceptado:

- barra: 117 inserciones y 95 borrados en el commit integrado;
- carrusel: 222 inserciones y 80 borrados;
- Finanzas: 1.189 inserciones y 96 borrados, con correcciones posteriores del coordinador.

Las líneas no equivalen a razonamiento ni calidad. La estimación razonable para esos tres bloques es que OpenCode hizo
aproximadamente el 65-75 % de la escritura mecánica y el 45-60 % del trabajo de ingeniería aceptado al incluir
especificación, revisión, corrección y pruebas. Al sumar Despensa, Ocio, auditoría y publicación realizadas por el
coordinador, la fracción de toda la versión derivada baja aproximadamente al 35-50 %.

El ahorro de tokens de Claude Code no coincide con esa fracción: revisar un diff grande también consume contexto. En
esta experiencia, el rango defendible es un 20-35 % de ahorro neto para la versión completa, y un 35-50 % en encargos
mecánicos bien aislados. Una petición demasiado grande puede ahorrar cero o incluso costar más por esperas y
reparaciones.

Para medir mejor futuras tandas, registrar por encargo:

| dato | cómo medirlo |
|---|---|
| tiempo hasta el primer diff | reloj desde el envío |
| tiempo total | hasta entrega revisable |
| líneas aceptadas | `git diff --numstat` tras la revisión |
| defectos confirmados | hallazgos que requirieron cambio |
| pruebas creadas y válidas | no solo cantidad, también si fallan al romper el código |
| retrabajo | líneas del coordinador sobre el mismo corte |
| tokens | contador del proveedor, si la interfaz lo ofrece |

## Límites y capacidad diaria

No se observó un límite estable que permita prometer un número de encargos al día. Depende del modelo gratuito elegido,
la congestión del proveedor, el tamaño del contexto y los límites que OpenCode o el proveedor apliquen en ese momento.
La degradación práctica apareció antes por latencia y amplitud de la tarea que por un mensaje explícito de cuota.

Como planificación conservadora, tratar una sesión gratuita como capacidad para varios cortes pequeños, no para una
versión completa monolítica. Tras dos o tres cortes medianos, abrir una sesión limpia por tema reduce el contexto y suele
ser más eficaz que continuar acumulando instrucciones. Si el proveedor muestra cuota, esa cifra manda sobre cualquier
estimación histórica.

## Protocolo recomendado para Claude Code

1. Ejecutar `git status --short` y aislar cambios ajenos.
2. Leer el código fuente de verdad de la PWA y las instrucciones del subárbol.
3. Escribir de cinco a diez criterios de aceptación comprobables.
4. Dar a OpenCode un solo corte mediante `/implementar-ios`.
5. Pedir una actualización si no aparece un diff verificable; interrumpir si solo hay razonamiento repetido.
6. Revisar el diff, en especial dinero, fechas, identificadores, claves JSON y concurrencia.
7. Ejecutar `/auditar-ios`; usar `/preparar-ipa` si cambió empaquetado.
8. Corregir personalmente los hallazgos confirmados.
9. Ejecutar `node pruebas/comprobar.mjs`, `node --test pruebas/contrato-ios.mjs` y
   `node pruebas/apuntar-casos.mjs`.
10. Hacer commit por corte solo cuando el diff esté limpio.
11. Al final, revisar el conjunto, subir a `main`, vigilar Actions y auditar el contenido de la IPA.

La regla operativa más importante es sencilla: OpenCode puede producir; Claude Code conserva la responsabilidad de
entender, aceptar y publicar.
