// ============================================================
//  GUÍA PARA TU IA — un Markdown descargable con todo Bitácora,
//  pensado para pasárselo a ChatGPT, Claude o Gemini y que te enseñe
//  a usarla y te resuelva dudas paso a paso. La parte de cada
//  apartado sale de GUIA (guia.js), así se mantiene al día sola; aquí
//  solo va lo que una IA necesita además: cómo responder, la cuenta,
//  recetas paso a paso, problemas frecuentes y el glosario.
// ============================================================

const GUIA_IA_INSTRUCCIONES = `## Para la IA que lee este documento

Eres el asistente de ayuda de **Bitácora** (appbitacora.es) para la persona que te ha pasado este documento. Tu trabajo es enseñarle a usar la app, resolver sus dudas y ayudarla cuando algo no le funcione, usando **solo** lo que dice esta guía.

Cómo responder:

1. **En español, cercano y breve.** Ve al grano.
2. **Paso a paso y numerado** cuando haya que hacer algo: un paso por línea, en el orden en que se hace.
3. **Usa los nombres exactos de los botones** como salen aquí (en Bitácora casi todo va en minúscula y con punto final: «+ apuntar.», «terminar la compra.»). Ponlos entre comillas o en negrita para que se reconozcan en pantalla.
4. **Pregunta antes si usa el móvil o el ordenador** cuando los pasos cambian. En el móvil, Bitácora se usa instalada como app (ver «Versión móvil»), con una barra abajo; en el ordenador, con el menú de la izquierda.
5. **No inventes.** Si algo no está en esta guía, dilo con claridad («eso no lo encuentro en la guía de Bitácora») y sugiere escribirlo en el apartado «sugerencias.» de la app, que llega directamente a quien la hace.
6. **Problemas:** sigue la sección «Solución de problemas» en orden, de lo más simple a lo más raro, y pide que te cuente qué ve en pantalla después de cada paso.
7. **Enseña a hacerlo, no lo hagas por la persona:** tú no puedes tocar su Bitácora desde aquí. Si quiere que una IA apunte cosas por ella, explícale el conector («Claude y ChatGPT»).
8. **Privacidad:** nunca pidas contraseñas, el enlace del conector, el enlace de Siri o del correo, datos de tarjetas ni números de cuenta. Si te los pega, dile que no hacía falta y que puede cambiarlos desde Ajustes.
9. **Ofrece el siguiente paso:** al terminar una explicación, propone algo relacionado que le pueda venir bien («¿quieres que te enseñe también a…?»).
10. Si la persona dice «enséñame Bitácora» sin más, empieza por «Primeros pasos» y ve apartado a apartado según lo que le interese (estudios, dinero, trabajo, el día a día…).`;

const GUIA_IA_CONCEPTOS = `## Qué es Bitácora

Bitácora es una app para tener la vida entera en un solo sitio, sin ruido: calendario, tareas del día, rutinas, notas, dinero, estudios, trabajo, viajes, ocio, compra, colecciones, amigos y más. Funciona en el navegador (appbitacora.es) y como app en el móvil y el ordenador. No hay publicidad ni scroll infinito.

Ideas clave para entenderla:

- **Todo se guarda solo.** No hay botón de guardar: cada cambio se sube a la nube al momento.
- **Varios dispositivos a la vez.** Los cambios de cada dispositivo se combinan sin pisarse.
- **Sin conexión también funciona.** Lo que apuntas sin red se guarda en el dispositivo y se sube al volver la conexión.
- **Entradas.** Casi todo es una «entrada»: un evento, un viaje, un libro, un objetivo, un cumpleaños, un documento… Lo que tiene fecha sale en el calendario.
- **Apuntar como hablas.** El botón «+ apuntar.» (o la tecla Espacio en el ordenador, o el «+» naranja en el móvil) entiende frases como «cena con Marta el viernes a las 9» y lo coloca donde toca.
- **Apartados opcionales.** Algunos apartados se encienden o se apagan en Ajustes → «apartados.»: estudios, repaso, carrera, profesorado, empleo, despensa, envíos, proyectos, enlaces, etiquetas, conexiones y coleccionables. Si alguien echa en falta un apartado, casi siempre es que está apagado.
- **Ramas.** Los opcionales se agrupan en #school (estudios), #home (casa), #work (trabajo) y #mind (mente).
- **Perfil.** En la bienvenida se elige si se estudia, se trabaja o las dos cosas, y eso decide qué sale de primeras. Se cambia en Ajustes → «apartados.».
- **Temas.** asfalto (oscuro), papel (claro), teja (piedra cálida con naranja) y pizarra (gris azulado). Hay dos más: «oliva.», para quien invita a un amigo o entra invitado, y «fundador.», para los socios fundadores.
- **Privacidad.** Los datos son de cada persona; solo los ve ella (y, en Social, lo que decida compartir con sus amigos).`;

const GUIA_IA_CUENTA = `## Cuenta, prueba y precios

- **Crear cuenta:** en appbitacora.es, con correo y contraseña (mínimo 8 caracteres; Bitácora rechaza contraseñas que han aparecido en filtraciones conocidas).
- **Prueba gratis:** 14 días desde que se crea la cuenta, sin tarjeta. Quien entra con el código de un amigo tiene 30 días.
- **Precio:** 1,99 € al mes o 18,99 € al año, con todo incluido. Se contrata en Ajustes → «suscripción.».
- **Socio fundador:** un único pago de 29,99 € y Bitácora de por vida, solo para 100 personas. Incluye el tema «fundador.» y tres códigos que regalan 6 meses de Bitácora.
- **Código de regalo:** se escribe en Ajustes → «suscripción.» o en la pantalla del final de la prueba.
- **Invitar a un amigo:** Ajustes → cuenta → «invita a un amigo.»: tu código y tu enlace. Tu amigo tiene 30 días de prueba y los dos desbloqueáis el tema «oliva.».
- **Pagos, tarjeta y facturas, o cancelar:** Ajustes → «suscripción.» → «pagos y facturas.».
- **Cuando termina la prueba sin suscribirse:** sale la pantalla «tu prueba gratuita ha terminado.», con la opción de suscribirse y con «descargar mis datos.» para llevarse todo. Los datos no se borran.
- **Llevarse los datos:** Ajustes → «tus datos.» → «exportar.» (un archivo JSON con todo). Finanzas tiene además su propio «exportar.» en texto, pensado para pegárselo a una IA.
- **Borrar la cuenta:** Ajustes → zona de riesgo → «eliminar mi cuenta.». Es definitivo.
- **Cerrar sesión en todos los dispositivos:** Ajustes → «cerrar sesión en todas partes.».`;

const GUIA_IA_PRIMEROS = `## Primeros pasos (para alguien que empieza)

1. Crea la cuenta en appbitacora.es y sigue la bienvenida: tu nombre, si estudias o trabajas, qué apartados quieres y, si te apetece, una **semana de ejemplo** para ver cómo encaja todo. El ejemplo se quita con «empezar con lo mío.», en la franja de abajo, sin tocar lo que hayas apuntado tú.
2. **Instálala en el móvil** (muy recomendable):
   - iPhone: abre appbitacora.es en **Safari** → botón Compartir → «Añadir a pantalla de inicio».
   - Android: en Chrome, menú → «Instalar aplicación» o «Añadir a pantalla de inicio».
   - Ordenador: Ajustes → «instalar bitácora.».
3. **Activa las notificaciones** (Ajustes → «notificaciones.»). En el iPhone solo funcionan con la app instalada y abierta desde su icono.
4. **Dile dónde vives** (Ajustes → «lo que bitácora sabe sola.» → festivos y puentes): así salen tus festivos, el tiempo y los puentes.
5. **Apunta lo de esta semana** con «+ apuntar.»: planes, exámenes, tareas, gastos. Escribe como hablas.
6. Prueba el **planificador** con las tareas de hoy y una **rutina** sencilla.
7. Si llevas tus cuentas, entra en **Finanzas** e importa el extracto de tu banco.
8. Cuando te apetezca, conecta **Claude o ChatGPT** para apuntar desde el chat o preguntar por tus datos.`;

// Tareas habituales, paso a paso. Lo que cambia entre móvil y ordenador va dicho en el propio paso.
const GUIA_IA_RECETAS = [
    ['Apuntar algo rápido (evento, tarea, gasto, examen…)', [
        'Pulsa «+ apuntar.» (abajo a la derecha en el ordenador, o la tecla Espacio) o el «+» naranja de la barra de abajo en el móvil.',
        'Escríbelo como lo dirías: «dentista el jueves a las 5», «examen de estadística el 20», «gasté 30 en gasolina en efectivo», «gimnasio todos los lunes a las 19».',
        'Mira la vista previa: dice qué va a crear. Si no es el tipo que querías, tócalo y cámbialo.',
        'Confirma. Si te equivocas, en «lo último que apuntaste» tienes «deshacer.».',
    ]],
    ['Crear un evento con todos sus datos y aviso', [
        'Pulsa «+ añadir.» (arriba) y elige «evento» (escribe «ev» y Enter).',
        'Pon título, fecha, hora, lugar y tipo.',
        'En «Aviso», deja «una hora antes» si quieres la notificación.',
        'Si tienes entradas con QR, añádelas en «Entradas».',
        'Guarda. Saldrá en el calendario y en Eventos.',
    ]],
    ['Planificar el día y pasar tareas a hoy', [
        'Entra en «planificador.».',
        'Añade tareas con el «+» de la tarjeta (con hora o «sin hora.») y su prioridad.',
        'Las tareas sin día están en «tareas pendientes.»: «→ hoy» las pasa a la línea de tiempo de hoy.',
        'Marca el círculo al terminar cada una. Lo que no marques pasa al día siguiente, destacado.',
    ]],
    ['Hacer que una tarea se repita', [
        'En el planificador, abre la tarjeta «recurrentes.».',
        'Crea la tarea y elige cada cuánto: cada día, ciertos días de la semana, cada mes o cada N días.',
        'También vale apuntar «regar las plantas cada 3 días» con «+ apuntar.».',
    ]],
    ['Crear una rutina', [
        'Entra en «rutinas.» y pulsa «+ rutina.» (o toca una de las «ideas para empezar.»).',
        'Elige el momento del día, cada cuánto (todos los días, algunos días o x veces por semana) y, si quieres, sus pasos.',
        'Marca el círculo grande cuando la hagas. Si se te olvidó un día, toca su bolita de la semana.',
    ]],
    ['Importar el extracto del banco', [
        'Descarga el extracto desde la web o la app de tu banco, en Excel (.xlsx) o CSV. Si tu banco solo da .xls (el formato antiguo), ábrelo y guárdalo como .xlsx o CSV.',
        'En Finanzas, pulsa «importar.» y sube el archivo. En el móvil también puedes pulsar «importar extracto.» y pegar lo que hayas copiado (por ejemplo, el CSV de Revolut desde su botón de compartir).',
        'Revisa que la cuenta destino sea la correcta y que las columnas de fecha, concepto e importe estén bien.',
        'Pulsa «Importar movimientos». Bitácora evita duplicados, aunque los extractos se solapen.',
        'Si el extracto trae el saldo y no cuadra, Bitácora te enseña qué sobra o qué falta, para arreglarlo con un botón.',
    ]],
    ['Que algo no cuente como gasto (ahorro, inversión, viaje)', [
        'Abre el movimiento en Finanzas (en el móvil, tócalo en «últimos movimientos.»).',
        'Si es dinero que apartas a una hucha o que sacas de ella, marca «va a mis ahorros.» o «viene de mis ahorros.»: mueve el saldo, pero no cuenta como gasto ni como ingreso.',
        'Lo de la categoría «Inversiones» ya se trata como ahorro.',
        'Si es un gasto de un viaje, marca «gasto de viaje.»: cuenta como gasto, pero no entra en los presupuestos ni en el ritmo del mes.',
        'Para marcar todos los gastos de un viaje a la vez, usa «gastos de un viaje.».',
    ]],
    ['Ocultar las cifras de Finanzas', [
        'Al entrar en Finanzas, Bitácora pregunta si quieres el modo privacidad: responde «Sí».',
        'También puedes pulsar el ojo de arriba a la derecha en Finanzas.',
    ]],
    ['Dar de alta una suscripción o un gasto fijo', [
        'Finanzas → «planificación.» → «recurrentes.».',
        'Añádela con su importe, su día de cobro y la cuenta en la que se cobra.',
        'Activa «avisarme si no aparece en el banco» si quieres que te avise cuando un cargo no llegue.',
        'Si Bitácora detecta un cargo que se repite y no lo tienes dado de alta, te lo propone con «añadir.».',
    ]],
    ['Ver tu calendario de Bitácora en Google Calendar, iPhone u Outlook', [
        'Ajustes → «tu calendario en otras apps.» → copia tu enlace personal.',
        'En Google Calendar: Otros calendarios → «Desde URL» → pega el enlace. En el iPhone: Ajustes → Calendario → Cuentas → Añadir cuenta → Otra → «Añadir calendario suscrito». En Outlook: Añadir calendario → «Suscribirse desde la Web».',
        'Se actualiza solo. Si compartes el enlace sin querer, «cambiar enlace» anula el anterior.',
    ]],
    ['Traer un calendario de fuera (Google, Apple, la universidad…)', [
        'Eventos → «importar calendario.» (o Ajustes → «tus datos.»).',
        'Sube el archivo .ics o pega su enlace. En Google Calendar, el enlace es la «Dirección secreta en formato iCal».',
        'Elige si importar solo de hoy en adelante o todo. Volver a importar no duplica nada.',
    ]],
    ['Conectar Claude o ChatGPT', [
        'Ajustes → «claude y chatgpt.» → crea el enlace para Claude o para ChatGPT y cópialo. Solo se enseña una vez y es tu llave: no lo compartas.',
        'En Claude: Ajustes → Conectores → Añadir conector personalizado → nómbralo «Bitácora» y pega el enlace. En ChatGPT, añádelo como conector en la configuración de conectores o aplicaciones.',
        'En un chat, activa Bitácora en las herramientas y pide, por ejemplo: «¿qué tengo esta semana?» o «apunta este ticket» (con la foto).',
        'El dinero y los borrados esperan tu visto bueno en «bandeja.»; lo demás se aplica solo y se puede deshacer desde ahí.',
    ]],
    ['Activar las notificaciones', [
        'En el iPhone, primero instala la app (Safari → Compartir → «Añadir a pantalla de inicio») y ábrela desde su icono.',
        'Ajustes → «notificaciones.» → activa el interruptor y acepta el permiso del sistema.',
        'En «avisos automáticos. → elegir.» decides qué tipos quieres recibir.',
    ]],
    ['Apuntar con Siri o reenviando un correo', [
        'Ajustes → «siri y tu correo.» → «conectar.» en Siri y sigue los pasos para crear el atajo «Apunta en Bitácora».',
        'Di «Oye Siri, apunta en Bitácora» y dicta.',
        'Para el correo: «crear dirección.», guárdala como contacto y reenvíale confirmaciones de vuelos, hoteles, entradas o pedidos.',
    ]],
    ['Llevar las asignaturas, exámenes y trabajos', [
        'Estudios → «+ asignatura» (con sus créditos si quieres la media ponderada).',
        'Abre la asignatura y añade exámenes y trabajos con fecha, hora, peso y nota.',
        'Los exámenes salen en el calendario y los trabajos en el planificador el día de entrega.',
        'Al final de Estudios, «entregas.» los ordena todos por fecha.',
    ]],
    ['Traer las tareas de Google Classroom', [
        'Estudios → «classroom.» → «conectar con google.» (en el iPhone, hazlo desde Safari o el ordenador).',
        'Elige la cuenta de Google con la que entras en Classroom y da permiso (solo lectura).',
        'Une cada clase con su asignatura (o «no traer esta clase.») y pulsa «traer tareas.».',
        'Para actualizar, vuelve a conectar: si todas las clases ya están unidas, trae las tareas solo.',
    ]],
    ['Estudiar con tarjetas (tipo Anki)', [
        'Estudios → pestaña «repaso.».',
        'Crea tarjetas a mano, impórtalas («frente;reverso» o TSV) o pídeselas a Claude con tus apuntes («hazme tarjetas de este PDF»).',
        'Repasa las que tocan cada día: Bitácora programa cuándo vuelve cada una según cómo la recordaste.',
    ]],
    ['Hacer la compra con la lista', [
        'Activa «despensa.» en Ajustes → «apartados.» si no la ves.',
        'Escribe lo que falta («2 leche, pan, tomates»): se ordena solo por secciones del súper.',
        'En la tienda, toca cada cosa al echarla al carro.',
        'Al acabar, «terminar la compra.». Si tienes el conector, pásale la foto del ticket a la IA para guardar los precios.',
    ]],
    ['Dividir gastos con amigos', [
        'Social → pestaña de gastos → crea un grupo e invita a tus amigos de Bitácora.',
        'Apunta quién pagó qué: el grupo calcula quién debe a quién.',
    ]],
    ['Organizar una quedada con gente que no usa Bitácora', [
        'Social → «con un enlace.» → quedada: propón fechas y comparte el enlace.',
        'Cada uno vota sin necesidad de cuenta; tú eliges la fecha y se crea el evento.',
        'También sirve para invitaciones (voy, quizá, no), listas compartidas y para enseñar un viaje.',
    ]],
    ['Planear un viaje', [
        'Viajes → «nuevo viaje.» con destino y fechas.',
        'Dentro tienes itinerario, transportes, alojamientos, listas y la pestaña «Destino» (tiempo, moneda, enchufes, festivos).',
        'Reenviar el correo de una reserva a tu dirección de Bitácora, o dárselo a Claude, lo rellena solo.',
    ]],
    ['Crear tu CV', [
        'Empleo → «crear mi cv.».',
        'Responde los pasos (contacto, cada empleo, formación, idiomas, habilidades) y revisa el perfil propuesto.',
        'Descarga el PDF. Lo que respondes se guarda para la próxima vez.',
    ]],
    ['Recuperar algo que borraste o volver atrás', [
        'Si lo hizo Claude, ChatGPT, Siri o Apuntar: «bandeja.» → historial → «deshacer».',
        'Si no: Documentos → «copias.» (o Panorama → copia de seguridad) y restaura una copia. Se hace una al día y una completa cada semana.',
    ]],
    ['Cambiar el tema, la letra o el tamaño del texto', [
        'Ajustes → apariencia: tema, tipografía y modo ancho.',
        'En el móvil, al final del menú: los círculos cambian el tema y «letra.» el tamaño.',
    ]],
    ['Encender o apagar apartados', [
        'Ajustes → «apartados.» → «elegir apartados.».',
        'Marca los que quieras y pulsa «guardar selección.». Lo que apagas desaparece de los menús, pero sus datos se conservan.',
    ]],
];

const GUIA_IA_PROBLEMAS = [
    ['No me llegan las notificaciones', [
        'En el iPhone, las notificaciones solo funcionan con Bitácora instalada en la pantalla de inicio y abierta desde su icono (no desde Safari).',
        'Comprueba Ajustes → «notificaciones.»: el interruptor tiene que estar encendido. Apágalo y vuelve a encenderlo para renovar el permiso (hace falta tras reinstalar la app o cambiar de móvil).',
        'Mira los permisos del sistema: en el iPhone, Ajustes → Notificaciones → Bitácora; en Android, los ajustes de notificaciones de la app o de Chrome.',
        'En «avisos automáticos. → elegir.», comprueba que no estén apagados los tipos que esperas.',
        'Los avisos de eventos llegan una hora antes solo si el evento tiene hora y no está silenciado; el resumen del día llega a las 9:00 si hay algo que contar.',
        'Si nada de esto funciona, escríbelo en «sugerencias.».',
    ]],
    ['No veo un cambio nuevo o algo se ve raro', [
        'En el móvil, cierra la app del todo (deslízala fuera de las apps abiertas) y vuelve a abrirla.',
        'En el ordenador, recarga con Ctrl+F5 (Cmd+Shift+R en Mac).',
        'Si sigue igual, cierra sesión y vuelve a entrar.',
    ]],
    ['En un dispositivo veo cosas distintas que en otro', [
        'Espera unos segundos con los dos abiertos y con conexión: los cambios se combinan solos.',
        'Si un dispositivo estuvo sin red, sus cambios se suben al volver la conexión.',
        'Recarga el que va atrasado (en el móvil, cerrar y abrir la app).',
    ]],
    ['Estoy sin conexión', [
        'Bitácora se abre igual con la copia guardada y puedes seguir apuntando.',
        'Lo que apuntes se sube solo al volver la red. El tiempo, la luz, los partidos, Social y los avisos necesitan conexión.',
    ]],
    ['No encuentro un apartado', [
        'Probablemente esté apagado: Ajustes → «apartados.» → «elegir apartados.».',
        'En el ordenador, pulsa Enter y escribe su nombre en el buscador.',
        'Estudios, repaso y carrera salen juntos en el menú como «Estudios», con pestañas arriba.',
    ]],
    ['El extracto del banco no se importa bien', [
        'Si dice que no tiene filas o salen 0 importados, revisa en el paso de columnas que la de importe sea la del dinero (no la de fecha) y que la cuenta destino sea la correcta.',
        'Si tu banco separa cargos y abonos en dos columnas, marca «Mi banco separa cargo y abono en dos columnas».',
        'Si es un .xls antiguo, ábrelo en Excel o LibreOffice y guárdalo como .xlsx o CSV.',
        'Si aparece algo duplicado, Finanzas tiene «Buscar duplicados»; y si el saldo no cuadra con el del extracto, la ventana del cuadre enseña qué sobra o qué falta.',
    ]],
    ['Un movimiento cuenta como gasto y no lo es', [
        'Si es dinero que va o viene de una hucha o bolsillo, márcalo como «va a mis ahorros.» o «viene de mis ahorros.».',
        'Si es una aportación a tu inversión, ponle la categoría «Inversiones».',
        'Si es una transferencia entre tus cuentas, cámbialo a traspaso. Para que no vuelva a pasar al importar, crea una regla en Finanzas → «reglas.».',
    ]],
    ['Un presupuesto sale en rojo y no debería', [
        'Las devoluciones (un ingreso con la misma categoría que el gasto, por ejemplo «Coleccionables») amplían el límite del mes. Comprueba que el reembolso tenga esa categoría.',
        'Los gastos marcados como «gasto de viaje.» no cuentan en los presupuestos.',
    ]],
    ['No me funciona Classroom', [
        'En el iPhone con la app instalada, la ventana de Google no vuelve a la app: hazlo desde Safari o desde el ordenador.',
        'Si Google dice que la app no está verificada, pulsa «Continuar» (o «Configuración avanzada» → «Ir a Bitácora»).',
        'Si dice que tu organización lo bloquea, es el administrador de tu centro: pídele que permita la app.',
        'Si una nota sale vacía aunque esté calificada, es que el profesor aún no ha devuelto la tarea: Classroom no da la nota hasta entonces.',
    ]],
    ['Claude o ChatGPT no hacen lo que pido', [
        'Comprueba que Bitácora está activada en las herramientas de ese chat.',
        'Si hay funciones nuevas, abre un chat nuevo para que las vea.',
        'Los gastos, ingresos, extractos y borrados no se aplican hasta que los valides en «bandeja.».',
        'Si perdiste el enlace o crees que alguien lo tiene, revócalo en Ajustes y crea otro.',
    ]],
    ['En el iPhone, al tocar un campo no sale el teclado', [
        'Toca de nuevo dentro del campo. Si persiste, cierra la app del todo y vuelve a abrirla.',
    ]],
    ['Se me ha acabado la prueba', [
        'Puedes suscribirte desde la propia pantalla (1,99 € al mes, 18,99 € al año o socio fundador), canjear un código de regalo o descargar tus datos.',
        'Tus datos siguen guardados: al suscribirte vuelve todo como estaba.',
    ]],
    ['He borrado algo sin querer', [
        'Si fue con Claude, ChatGPT, Siri o Apuntar: «bandeja.» → historial → «deshacer».',
        'Si no: restaura una copia en Documentos → «copias.».',
    ]],
];

const GUIA_IA_ATAJOS = `## Atajos de teclado (ordenador)

- **Enter:** buscador universal («¿dónde quieres ir?»). También responde preguntas sobre tus datos («¿cuánto gasté en gasolina en septiembre?»).
- **Espacio:** abre Apuntar.
- **Esc:** cierra lo que esté abierto.
- **Ctrl + ↑ / ↓:** apartado anterior o siguiente.
- **«/» en el buscador:** comandos (/año, /tema, /backup, /exportar).
- **«?» arriba a la derecha:** ayuda corta y acceso a la guía.
- **En un repaso:** espacio para dar la vuelta a la tarjeta y 1-4 para puntuarla. En los tests, 1-6 para responder.`;

const GUIA_IA_GLOSARIO = [
    ['entrada', 'Cualquier cosa guardada con su tipo: evento, viaje, libro, objetivo, cumpleaños, documento…'],
    ['apuntar', 'La captura rápida que entiende frases normales y decide qué crear.'],
    ['bandeja', 'Donde esperan tu visto bueno los cambios de dinero y los borrados que pide una IA, con el historial de todo lo que han hecho (y su deshacer).'],
    ['conector', 'El enlace que deja a Claude o ChatGPT leer tu Bitácora y apuntar cosas en ella.'],
    ['planificador', 'Tu día hora a hora; cada día empieza a las 4:00.'],
    ['tareas pendientes', 'Tareas sin día ni hora, para pasarlas a hoy cuando toque.'],
    ['rutinas', 'Lo que antes se llamaba hábitos: lo que haces con frecuencia, sin puntos ni medallas.'],
    ['panorama', 'El resumen con tarjetas: tu día, hoy, entregas, tareas, la semana, el mes y lo que viene.'],
    ['ritmo', 'Cómo va tu gasto del mes comparado con lo normal en ti a estas alturas.'],
    ['largo plazo', 'La planificación mensual del sueldo en casillas, con deseos e inversiones.'],
    ['ahorro (marca)', 'Movimiento que va o viene de una hucha: mueve el saldo, pero no es ingreso ni gasto.'],
    ['ajuste de saldo', 'Corrección del saldo de una cuenta para que cuadre con el banco; no es ingreso ni gasto.'],
    ['gasto de viaje', 'Gasto que cuenta, pero queda fuera de los presupuestos y del ritmo del mes.'],
    ['traspaso', 'Dinero que pasa de una cuenta tuya a otra.'],
    ['regla', 'Instrucción para que, al importar, un concepto concreto se registre como traspaso.'],
    ['despensa', 'La lista de la compra, con historial, precios y recetas.'],
    ['repaso', 'Tarjetas de estudio con repetición espaciada, pomodoro y tests.'],
    ['carrera', 'Tu grado por cuatrimestres, con créditos y notas de acta.'],
    ['envíos', 'Seguimiento de pedidos por internet.'],
    ['conexiones', 'Lo que se relaciona entre sí en tus datos (un viaje y lo que pasó en él, una persona, una etiqueta…).'],
    ['socio fundador', 'Pago único con Bitácora para siempre, solo para 100 personas.'],
];

function guiaIaTexto(html) {
    return String(html || '')
        .replace(/<span class="guia-boton">(.*?)<\/span>/g, '«$1»')
        .replace(/<\/?b>/g, '**')
        .replace(/<br\s*\/?>/g, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ').trim();
}

function guiaIaSeccion(s) {
    const l = [`### ${guiaIaTexto(s.titulo).replace(/\.$/, '')}`, ''];
    if (s.lema) l.push(`*${guiaIaTexto(s.lema)}*`, '');
    if (s.intro) l.push(guiaIaTexto(s.intro), '');
    if (s.pasos?.length) { l.push('**Cómo se usa:**', ''); s.pasos.forEach((p, i) => l.push(`${i + 1}. ${guiaIaTexto(p)}`)); l.push(''); }
    if (s.botones?.length) { l.push('**Botones y opciones:**', ''); s.botones.forEach(([b, t]) => l.push(`- **${guiaIaTexto(b).replace(/^«|»$/g, '')}:** ${guiaIaTexto(t)}`)); l.push(''); }
    if (s.trucos?.length) { l.push('**Trucos:**', ''); s.trucos.forEach(t => l.push(`- ${guiaIaTexto(t)}`)); l.push(''); }
    return l.join('\n');
}

function construirGuiaIA() {
    const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    const l = [
        '# Bitácora: guía completa para tu asistente de IA',
        '',
        `Versión del ${fecha}. Descargada desde la propia app. Pásale este archivo a ChatGPT, Claude, Gemini o la IA que uses y pregúntale lo que quieras sobre Bitácora: te lo explicará paso a paso.`,
        '',
        '**Cómo usarla:** abre un chat nuevo, adjunta este archivo y escribe, por ejemplo: «Eres mi ayuda de Bitácora. Enséñame a…» o «Tengo este problema con Bitácora: …».',
        '',
        '## Índice',
        '',
        '1. Para la IA que lee este documento',
        '2. Qué es Bitácora',
        '3. Primeros pasos',
        '4. Cuenta, prueba y precios',
        '5. Mapa de la app',
        '6. Cada apartado, en detalle',
        '7. Cómo hacer…, paso a paso',
        '8. Solución de problemas',
        '9. Atajos de teclado',
        '10. Glosario',
        '11. Si nada de esto resuelve tu duda',
        '',
        GUIA_IA_INSTRUCCIONES, '',
        GUIA_IA_CONCEPTOS, '',
        GUIA_IA_PRIMEROS, '',
        GUIA_IA_CUENTA, '',
        '## Mapa de la app', '',
    ];
    GUIA_GRUPOS.forEach(g => {
        const secciones = GUIA.filter(s => s.grupo === g.id);
        if (!secciones.length) return;
        l.push(`**${guiaIaTexto(g.titulo).replace(/\.$/, '')}:**`, '');
        secciones.forEach(s => l.push(`- **${guiaIaTexto(s.titulo).replace(/\.$/, '')}:** ${guiaIaTexto(s.lema || '')}`));
        l.push('');
    });
    l.push('## Cada apartado, en detalle', '');
    GUIA_GRUPOS.forEach(g => {
        const secciones = GUIA.filter(s => s.grupo === g.id);
        if (!secciones.length) return;
        l.push(`## ${guiaIaTexto(g.titulo).replace(/\.$/, '').replace(/^./, c => c.toUpperCase())}`, '');
        secciones.forEach(s => l.push(guiaIaSeccion(s)));
    });
    l.push('## Cómo hacer…, paso a paso', '');
    GUIA_IA_RECETAS.forEach(([t, pasos]) => { l.push(`### ${t}`, ''); pasos.forEach((p, i) => l.push(`${i + 1}. ${p}`)); l.push(''); });
    l.push('## Solución de problemas', '', 'Sigue los pasos en orden y comprueba después de cada uno si se ha arreglado.', '');
    GUIA_IA_PROBLEMAS.forEach(([t, pasos]) => { l.push(`### ${t}`, ''); pasos.forEach((p, i) => l.push(`${i + 1}. ${p}`)); l.push(''); });
    l.push(GUIA_IA_ATAJOS, '', '## Glosario', '');
    GUIA_IA_GLOSARIO.forEach(([p, d]) => l.push(`- **${p}:** ${d}`));
    l.push('', '## Si nada de esto resuelve tu duda', '',
        '- Dentro de Bitácora, el apartado **«sugerencias.»** llega directamente a quien hace la app: cuenta qué te pasa o qué echas en falta.',
        '- La guía de la propia app (Ajustes → «guía de bitácora.», o el botón «?») tiene cada apartado con sus botones.',
        '- Vuelve a descargar este archivo de vez en cuando: Bitácora cambia a menudo y la guía se actualiza con ella.', '');
    return l.join('\n');
}

function descargarGuiaIA() {
    const texto = construirGuiaIA();
    const blob = new Blob([texto], { type: 'text/markdown;charset=utf-8' });
    const nombre = `bitacora-guia-para-tu-ia-${todayISO()}.md`;
    const archivo = typeof File === 'function' ? new File([blob], nombre, { type: 'text/markdown' }) : null;
    // En el móvil, la hoja de compartir deja mandarla directamente a la app de ChatGPT o Claude.
    if (archivo && navigator.canShare?.({ files: [archivo] }) && ES_TACTIL) {
        navigator.share({ files: [archivo], title: 'Guía de Bitácora para tu IA' }).catch(() => {});
        return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    showToast('Guía descargada. Pásasela a tu IA.');
}
