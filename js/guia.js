// ============================================================
//  GUÍA DE BITÁCORA — modal completo (Ajustes, botón "?" y
//  buscador). Una sección por apartado: para qué sirve, cómo se usa
//  paso a paso, qué hace cada botón, trucos y lo que cambia en el
//  móvil. El contenido vive en GUIA; al cambiar un apartado, se
//  actualiza aquí su sección.
// ============================================================
const GUIA_GRUPOS = [
    { id: 'empezar', titulo: 'empezar.' },
    { id: 'general', titulo: 'general.' },
    { id: 'desarrollo', titulo: 'desarrollo.' },
    { id: 'otros', titulo: 'otros.' },
    { id: 'sistema', titulo: 'sistema.' },
];

// Un botón tal y como se ve en la app.
const guiaBoton = t => `<span class="guia-boton">${t}</span>`;

const GUIA = [
    {
        id: 'bienvenida', grupo: 'empezar', titulo: 'bienvenida.',
        lema: 'Tu vida entera en un solo sitio, sin ruido.',
        intro: 'Bitácora reúne lo que normalmente está repartido en decenas de apps: calendario, tareas del día, rutinas, notas, finanzas, estudios, trabajo, viajes, ocio, coleccionables y más. Todo se guarda solo en la nube y se sincroniza entre tus dispositivos.',
        pasos: [
            'El menú de la izquierda agrupa los apartados en <b>general.</b> (tu día a día), <b>desarrollo.</b> (lo que construyes: dinero, estudios, trabajo, objetivos), <b>otros.</b> (ocio, viajes, colecciones, amigos) y <b>sistema.</b> (bandeja, sugerencias, ajustes).',
            'Pulsa cualquier apartado para entrar. El primero, <b>home</b>, es tu calendario.',
            'No hay botón de guardar: cada cambio se guarda al momento.',
            'Si usas Bitácora en varios dispositivos a la vez, se combinan los cambios de todos sin pisarse.',
        ],
        trucos: [
            'Cuatro temas en Ajustes: <b>asfalto</b> (oscuro), <b>papel</b> (claro), <b>teja</b> (piedra cálida con naranja) y <b>pizarra</b> (gris azulado con tinta azul marino).',
            'Si no sabes dónde está algo, pulsa <b>Enter</b> y escríbelo: el buscador te lleva directo.',
        ],
    },
    {
        id: 'moverse', grupo: 'empezar', titulo: 'moverse rápido.',
        lema: 'Llega a cualquier sitio sin tocar el ratón.',
        intro: 'Además del menú, Bitácora tiene un buscador universal y atajos de teclado pensados para ir de un apartado a otro en segundos.',
        botones: [
            [guiaBoton('Enter'), 'Abre «¿dónde quieres ir?»: escribe el nombre de un apartado, una pestaña (por ejemplo «películas» o «horario semanal») o una entrada, y salta a ella.'],
            [guiaBoton('Espacio'), 'Abre la captura rápida para crear algo nuevo (ver «crear cosas»).'],
            [guiaBoton('Esc'), 'Cierra lo que esté abierto. Si no hay nada abierto, pregunta si quieres cerrar sesión.'],
            [guiaBoton('Ctrl + ↑ / ↓'), 'Pasa al apartado anterior o siguiente del menú.'],
            [guiaBoton('?'), 'Arriba a la derecha: ayuda corta con los atajos y lo que es cada apartado, y acceso a esta guía.'],
            [guiaBoton('/año, /tema, /backup, /exportar'), 'Comandos del buscador: escribe «/» para verlos. Abren tu esfuerzo del año, cambian el tema, hacen una copia o exportan tus datos.'],
            [guiaBoton('preguntas'), 'El buscador también responde con tus datos: «¿cuándo fue la última vez que fui al dentista?», «¿cuánto gasté en gasolina en septiembre?», «¿cuándo es el cumple de Ana?», «¿cuántas veces fui al cine este año?», «¿puedo permitirme 300 €?». La respuesta sale arriba; tocándola vas al día o al apartado.'],
        ],
        trucos: ['Haz clic derecho sobre un apartado del menú para ver sus opciones rápidas.'],
    },
    {
        id: 'crear', grupo: 'empezar', titulo: 'crear cosas.',
        lema: 'Un solo gesto para apuntar cualquier cosa.',
        intro: 'Casi todo en Bitácora es una «entrada»: un evento, un libro, un viaje, un objetivo, un cumpleaños, un documento... Se crean todas igual.',
        pasos: [
            'Pulsa el botón redondo del <b>rayo</b> (abajo a la derecha), <b>+ añadir.</b> (arriba) o la tecla <b>Espacio</b>.',
            'Elige el tipo: escribe sus primeras letras («ev» para evento, «li» para libro...) y pulsa Enter.',
            'Rellena el formulario. Los campos cambian según el tipo: un evento pide fecha, hora, lugar y aviso; un libro, autor y valoración.',
            'Pulsa <b>Guardar</b>. Aparecerá en su apartado y, si tiene fecha, en el calendario.',
        ],
        botones: [
            [guiaBoton('rayo'), 'Captura rápida. En Empleo late suavemente para recordarte que también sirve allí.'],
            [guiaBoton('+ Añadir'), 'Lo mismo que el rayo, desde la cabecera.'],
            [guiaBoton('campana'), 'Tus notificaciones dentro de la app: solicitudes de amistad, recomendaciones y avisos.'],
        ],
        trucos: ['Pulsar un día del calendario y luego «+ Añadir entrada este día» crea la entrada con esa fecha ya puesta.', 'Dentro de cualquier nota o descripción, escribe [[ y el nombre de otra entrada para enlazarlas.'],
    },
    {
        id: 'movil', grupo: 'empezar', titulo: 'versión móvil.',
        lema: 'Bitácora como app en tu iPhone o Android.',
        intro: 'Si añades Bitácora a la pantalla de inicio, se abre como una app con su propia versión móvil: una portada con tu semana y tu día como horario, una barra abajo para moverte y una página por apartado, pensada para consultar y apuntar con el pulgar.',
        pasos: [
            'iPhone: abre appbitacora.es en Safari → botón Compartir → <b>Añadir a pantalla de inicio</b>. En Android o en el ordenador: Ajustes → <b>instalar bitácora.</b>',
            'Ábrela desde el icono. Arriba verás la fecha en grande y el tiempo de tu ciudad.',
            'Debajo, tu <b>semana</b>: toca un día para verlo; las flechas pasan de semana y <b>mes.</b> despliega el mes entero en bolitas (en color, los días con algo). <b>volver a hoy.</b> te devuelve.',
            'El día sale como un <b>horario</b>: lo que no tiene hora arriba y lo demás en una línea de tiempo, con una marca de «ahora» entre lo hecho y lo que viene. Marca las tareas sin salir de la portada; el <b>+</b> añade algo a ese día.',
            'Más abajo, las teselas: tareas y rutinas de hoy, gasto del mes, próximo examen, bandeja, pedidos y próximo viaje. Tócalas para ir a cada apartado.',
            'El <b>+</b> naranja abre <b>apuntar.</b>: escribe como hablas («gimnasio mañana a las 19», «dentista el jueves a las 5 y el viernes cena con Marta en La Pepita», «examen de estadística el 20», «entregar el trabajo de psicología el 25», «cumple de Ana el 3 de mayo», «gimnasio todos los lunes a las 19», «clase de inglés los martes y jueves a las 18», «viaje a Lisboa del 3 al 7 de noviembre», «gasté 30 en gasolina en efectivo», «se ha acabado el aceite», «nota: …»). La primera palabra puede decir qué es: «evento …», «tarea …», «serie …», «peli …», «libro …» o «juego …» (estos cuatro van a Ocio). Lo que tiene hora y no empieza por un verbo («peluquería mañana a las 10»), o es con alguien («café con Marta a las 6»), va como evento. Puedes escribir varias cosas en una frase: cada una sale por separado con lo que va a crear, y puedes cambiarle el tipo y Bitácora te enseña qué va a crear antes de guardarlo; con un toque cambias el tipo, y si no entiende nada te avisa. Abajo, <b>lo último que apuntaste</b>: <b>deshacer.</b> lo borra y <b>cambiar.</b> te lo deja escrito para elegir otro tipo. Debajo, accesos grandes a cada formulario.',
            'La <b>barra de abajo</b>: inicio, planificador, el <b>+</b> naranja para apuntar cualquier cosa, el último apartado que visitaste (para ir y volver) y el menú con todo. Tocar la pestaña en la que ya estás sube arriba del todo.',
        ],
        botones: [
            [guiaBoton('‹ inicio.'), 'Arriba a la izquierda en cualquier apartado: vuelve a la portada.'],
            [guiaBoton('temas, letra.'), 'Al final del menú, los círculos cambian el tema y «letra.» el tamaño del texto en el móvil.'],
        ],
        trucos: ['Planificador, Finanzas, Estudios, Rutinas, Eventos, Notas y Viajes tienen página propia en el móvil; el resto usa la de escritorio adaptada, con los mismos botones en píldora.', 'En el inicio, arrastra la semana con el dedo: las semanas pasan como un carrusel y encajan al soltar. Finanzas en el móvil enseña también el ritmo del mes frente al anterior, en qué se va el dinero y los próximos cargos.', 'En Ocio, libros y películas salen en lista; en Profesorado, el cuadrante se desliza de lado y las tarjetas de las clases también.'],
    },
    {
        id: 'claude', grupo: 'empezar', titulo: 'claude y chatgpt.',
        lema: 'Habla con tu Bitácora.',
        intro: 'Puedes conectar Bitácora a Claude o a ChatGPT para preguntarle por tu agenda, tus gastos o cualquier apartado, y pedirle que apunte cosas por ti: un evento a partir de una entrada, un gasto a partir de un ticket, un viaje a partir de los correos de reserva...',
        pasos: [
            'Ajustes → claude y chatgpt. → <b>+ enlace para Claude</b> (o ChatGPT). Copia el enlace: es tu llave personal, solo se enseña una vez.',
            'En claude.ai: Ajustes → Conectores → Añadir conector personalizado, nómbralo «Bitácora» y pega el enlace.',
            'En un chat, activa Bitácora en el menú de herramientas y pregunta, por ejemplo: «¿qué tengo esta semana?».',
        ],
        botones: [
            [guiaBoton('se aplica solo'), 'Crear o editar eventos, añadir entradas con QR, los cambios en Ocio, las tarjetas de estudio, la lista de la compra y las tareas, el siguiente paso y el diario de un proyecto.'],
            [guiaBoton('ideas para pedirle'), '«Hazme tarjetas de estos apuntes» (con un PDF o una foto), «pasa los ingredientes de esta receta a la compra», «apunta este ticket en Bitácora» (con la foto), «añade estas tareas al proyecto de la web», «¿qué hora es y qué me queda hoy?». Sabe la fecha y la hora de Madrid.'],
            [guiaBoton('pasa por la bandeja'), 'Todo lo demás (tareas, movimientos, extractos, estudios, viajes, suscripciones, borrados...) espera a que lo valides en <b>bandeja.</b>'],
            [guiaBoton('revocar'), 'En Ajustes puedes revocar un enlace si lo pierdes o ya no lo usas.'],
        ],
        trucos: ['Todo lo que hace Claude queda en el historial de la bandeja, con opción de deshacer.', 'Si añadimos funciones nuevas al conector, abre un chat nuevo para que Claude las vea.', 'Para ahorrar uso, desactiva el conector en los chats que no son de Bitácora.'],
    },
    {
        id: 'avisos', grupo: 'empezar', titulo: 'notificaciones.',
        lema: 'Que Bitácora te avise, sin que tengas que abrirla.',
        intro: 'Bitácora puede mandarte notificaciones al móvil o al ordenador, aunque esté cerrada.',
        pasos: [
            'Ajustes → notificaciones. → activa el interruptor y acepta el permiso. En iPhone tiene que estar instalada como app (ver «versión móvil»).',
            'Cada mañana a las 9:00 te llega lo que toca ese día: exámenes, documentos que caducan, cumpleaños, cargos que no han llegado al banco... (como mucho tres, y nunca dos veces lo mismo).',
            'Una hora antes de cada evento con hora te llega su aviso.',
        ],
        botones: [
            [guiaBoton('avisos automáticos. → elegir.'), 'Enciende o apaga cada tipo de aviso: eventos, estudios, documentos, cumpleaños, cargos vigilados, reembolsos, ritmo de gasto y bandeja.'],
            [guiaBoton('silenciar.'), 'En la ficha de un evento: quita el aviso solo de ese evento. También en su formulario, campo «Aviso».'],
            [guiaBoton('campana'), 'Dentro de la app, la campana reúne lo de hoy: eventos, solicitudes de amistad, lo que te comparten, envíos que avanzan, los días que te quedan de prueba y, si das clase, las tareas que no pudiste dar.'],
        ],
    },
    {
        id: 'servicios', grupo: 'empezar', titulo: 'lo que sabe sola.',
        lema: 'Cosas que Bitácora averigua sin que apuntes nada.',
        intro: 'Con decirle dónde vives (y, si quieres, tus equipos), Bitácora rellena sola festivos, puentes, el precio de la luz, partidos, estrenos y el tiempo de tus viajes. Todo sale de fuentes públicas y se guarda en tu dispositivo.',
        pasos: [
            'Ajustes → lo que bitácora sabe sola. → <b>festivos y puentes.</b> → busca tu ciudad. Salen los festivos nacionales y los de tu comunidad; los locales los añades tú una vez.',
            'En la misma tarjeta: <b>tus equipos.</b> (busca y añade), <b>estrenos de tus series.</b> y <b>la luz más barata.</b>',
            'Pulsa <b>tu día.</b> en Panorama (o el aviso del día en el calendario) para ver la ficha de hoy.',
        ],
        botones: [
            [guiaBoton('festivos y puentes'), 'Los festivos salen marcados en el calendario y en el inicio del móvil. Si un festivo cae en martes o jueves, Bitácora te dice qué día cogerte y cuántos días libres te salen.'],
            [guiaBoton('la luz más barata'), 'En el planificador, el precio de cada hora (PVPC, península) y la franja más barata. Las tareas con lavadora, horno, lavavajillas, secadora o cargar el coche te dicen si es buena hora. Desde las 21:00 enseña ya el día siguiente.'],
            [guiaBoton('tus equipos'), 'Sus partidos de liga, copa y Europa entran solos en el calendario con hora y estadio. Al abrir uno: <b>apuntar en mi calendario.</b> lo convierte en evento tuyo (con su aviso) y <b>no me interesa este.</b> lo oculta.'],
            [guiaBoton('estrenos de tus series'), 'Las temporadas nuevas de las series que tienes en Ocio, y cada episodio de las que estás viendo.'],
            [guiaBoton('destino'), 'En cada viaje, la pestaña <b>Destino</b>: el tiempo de esos días (o el del año pasado, si aún queda lejos), la hora allí, la moneda con conversor, los festivos del país, los enchufes y el teléfono de urgencias.'],
            [guiaBoton('tu día'), 'La ficha de un día: tiempo, luz, lo que tienes, festivo y lo que hiciste ese día hace un año.'],
        ],
        trucos: ['Puedes cambiar de ciudad cuando quieras: los festivos se recalculan al momento.', 'Si un partido o un estreno no te interesa, ocúltalo y no vuelve a salir.'],
    },
    {
        id: 'atajos', grupo: 'empezar', titulo: 'siri y tu correo.',
        lema: 'Apunta sin abrir la app.',
        intro: 'Dos puertas para meter cosas en Bitácora desde fuera: dictándoselas a Siri o reenviando un correo.',
        pasos: [
            'Ajustes → siri y tu correo. → <b>conectar.</b> en Siri: copia el enlace y sigue los cuatro pasos para crear el atajo «Apunta en Bitácora» en la app Atajos.',
            'Luego di «Oye Siri, apunta en Bitácora» y dicta, por ejemplo, «dentista el martes a las 10» o «25 euros de gasolina».',
            'En <b>tu correo.</b> → <b>crear dirección.</b>: guárdala como contacto y reenvíale la confirmación de un vuelo, un hotel, unas entradas o un pedido.',
        ],
        botones: [
            [guiaBoton('siri'), 'Lo dictado pasa por el mismo intérprete que el + de apuntar: tarea, evento, gasto, compra, cumpleaños... Siri te lee lo que ha apuntado y puedes deshacerlo en «lo que has apuntado.».'],
            [guiaBoton('tu correo'), 'Vuelos, trenes y autobuses entran como evento a la hora de salida; hoteles, con la entrada y la salida; entradas y restaurantes, con su sitio; los pedidos, en Envíos. Cualquier otro correo queda como tarea pendiente.'],
            [guiaBoton('cámbialo'), 'Si pierdes el enlace o la dirección, o alguien que no debe la conoce, crea una nueva: la anterior deja de funcionar.'],
        ],
        trucos: ['Estos enlaces solo sirven para apuntar: no dejan leer nada de tu Bitácora.', 'Lo que entra así queda en el historial de la bandeja, con deshacer.'],
    },
    {
        id: 'home', grupo: 'general', titulo: 'home.',
        lema: 'Tu calendario de toda la vida.',
        intro: 'La primera pantalla: un calendario con todo lo que tiene fecha en Bitácora: eventos, viajes, cumpleaños, exámenes, pagos de suscripciones...',
        botones: [
            [guiaBoton('Día, Semana, Mes'), 'Cambia la vista. En el mes, cada punto bajo un día es una cosa ese día.'],
            [guiaBoton('‹ ›'), 'Mes, semana o día anterior y siguiente.'],
            [guiaBoton('●'), 'El círculo abre tu <b>esfuerzo.</b>: el año en bolitas, más intensas cuanto más te esforzaste, con la media de cada mes. Debajo, «¿cómo fue hoy?» para puntuarlo del 1 (flojo) al 5 (a tope); toca cualquier día pasado para puntuar ese.'],
            [guiaBoton('tiempo'), 'La temperatura de tu ciudad. Tócala para ver la previsión de los próximos días y cambiar de ciudad.'],
            [guiaBoton('tu foto'), 'Junto al título (y junto a «bitácora.» en el móvil). Ábrela para cambiar tu foto, tu nombre visible y una frase sobre ti, que ven tus amigos. Toda foto pasa sola a blanco y negro con grano.'],
        ],
        trucos: ['Tu horario y tus citas de trabajo salen aquí si en Empleo tienes encendido «en el calendario principal.».'],
        pasos: ['Pulsa un día para ver lo que hay y añadir algo con esa fecha.', 'Pulsa una entrada para abrir su ficha (ver, editar o borrar).'],
    },
    {
        id: 'resumen', grupo: 'general', titulo: 'panorama.',
        lema: 'Todo lo importante, de un vistazo.',
        intro: 'Un panel con lo que tienes encima y accesos a las vistas de resumen, para no ir apartado por apartado.',
        botones: [
            [guiaBoton('a tener en cuenta.'), 'Avisos del día: cargos que no han llegado, semanas cargadas, cosas por revisar.'],
            [guiaBoton('hoy. tareas. esta semana. próximamente.'), 'Lo de hoy, tus tareas, la semana y lo que viene.'],
            [guiaBoton('revisión semanal.'), 'Repaso guiado de la semana.'],
            [guiaBoton('actividad. estadísticas. patrones.'), 'Tu actividad día a día, cifras históricas y patrones de gasto y rutinas.'],
            [guiaBoton('bandeja. copia de seguridad.'), 'Atajos a la bandeja de Claude y a tus copias.'],
            [guiaBoton('✷'), 'Tu estancia en Bitácora: un dibujo de todo lo que has registrado desde que empezaste.'],
        ],
    },
    {
        id: 'planificador', grupo: 'general', titulo: 'planificador.',
        lema: 'Tu día, hora a hora.',
        intro: 'Una línea de tiempo para hoy, mañana y pasado mañana. Cada día empieza a las 4:00 de la mañana; lo que no marcas como hecho pasa al día siguiente destacado en granate, para que no se pierda.',
        botones: [
            [guiaBoton('Hoy, Mañana, Pasado mañana'), 'Qué día estás planificando.'],
            [guiaBoton('+ (tarjeta)'), 'Añade una tarea al día que estás viendo. La cifra es lo que tienes hoy.'],
            [guiaBoton('sin hora.'), 'En el formulario de la tarea: la tarea va al principio del día, sin hora fija.'],
            [guiaBoton('alta. media. baja.'), 'La prioridad de la tarea: le da color (rojo, ámbar o azul) y ordena las que no tienen hora.'],
            [guiaBoton('↻ (tarjeta)'), 'Tareas recurrentes: las que se repiten (cada día, ciertos días de la semana, cada mes o cada N días).'],
            [guiaBoton('progreso de hoy.'), 'Un sello por tarea; se rellenan al completarlas.'],
            [guiaBoton('tareas pendientes. → + tarea'), 'Cosas sin día ni hora. <b>→ hoy</b> las pasa a la línea de tiempo de hoy. Las que marcas hechas se esconden; <b>mostrar completadas.</b> las enseña otra vez.'],
            [guiaBoton('+ subtarea'), 'Divide una tarea en pasos.'],
        ],
        trucos: ['Pulsa el nombre de una tarea para editarla.', 'Los trabajos de Estudios aparecen solos aquí el día de su entrega.', 'Al completar una tarea queda constancia en el calendario.'],
    },
    {
        id: 'compra', grupo: 'general', titulo: 'despensa.',
        lema: 'La lista de la compra, en el orden del súper, y lo que te cuesta.',
        intro: 'Listas de la compra que se ordenan solas por secciones (frutas y verduras, carne y pescado, lácteos, pasta y conservas, limpieza...), como se recorre la tienda. Es un apartado opcional de la rama #home: actívalo en Ajustes → apartados.',
        pasos: ['Escribe lo que falta según te acuerdes: «2 leche, pan, tomates 1,20 €». La cantidad y el precio se entienden solos.', 'En el súper, toca el círculo de cada cosa al echarla al carro: baja a «en el carro.».', 'Al acabar, <b>terminar la compra.</b> la limpia y, si quieres, apunta el gasto en Finanzas.'],
        botones: [
            [guiaBoton('lo de siempre.'), 'Arriba, junto a listas.: lo que más veces has comprado, de más a menos, para añadirlo a la lista con un toque. Aprende de cada compra terminada y de cada ticket; <b>quitar.</b> borra lo que ya no compras.'],
            [guiaBoton('listas.'), 'Una lista por sitio o por súper: casa, el piso, Mercadona... Se cambia de una a otra arriba.'],
            [guiaBoton('nombre de un producto'), 'Cambia el nombre, la cantidad o el precio por unidad, o quítalo. El precio se recuerda para la próxima vez.'],
            [guiaBoton('terminar la compra.'), 'Saca de la lista lo del carro y la guarda en el historial con su tienda. Si marcas <b>apuntar también el gasto en finanzas.</b>, lo apunta en comida y bebida y se emparejará con el cargo del extracto.'],
            [guiaBoton('el ticket'), 'Pásale la foto a Claude o ChatGPT con el conector: «apunta este ticket en Bitácora». Se une a la compra de ese día con el precio de cada cosa: lo que estaba en la lista, lo que añadiste en la tienda y lo que se quedó sin comprar. Lo comprado sale de la lista. No toca Finanzas (el cargo llega con el extracto), salvo que se lo pidas. Si compras en varias tiendas, un ticket por tienda.'],
            [guiaBoton('historial.'), 'Arriba, de un vistazo: lo gastado este mes, <b>tu cesta habitual</b> (lo que más compras y lo que te cuesta en cada tienda, y cuál sale más barata en lo que tienen en común) y un aviso si algo ha subido un 10 % o más. Debajo, tus compras con su tienda y su total.'],
            [guiaBoton('tus productos.'), 'Todo lo que ha salido en tus tickets, cada producto con su tienda y lo último que pagaste; entre paréntesis, cuánto ha cambiado desde la primera vez. Se busca por nombre y se ordena por precio, por tienda o por lo que más ha cambiado.'],
            [guiaBoton('≈ precio'), 'En la lista, lo que te costó la última vez según tus tickets (de esa tienda si la lista se llama como ella), y el total estimado arriba.'],
            [guiaBoton('sección'), 'Al abrir un producto puedes cambiarlo de sección; Bitácora lo recuerda. Los tickets también le enseñan dónde va cada cosa.'],
            [guiaBoton('recetas.'), 'Tus recetas con sus ingredientes (uno por línea, con su cantidad), raciones, pasos y notas. Al escribirlos te sugiere lo que ya compras. Cada una dice lo que te cuesta según tus tickets y por ración, y <b>a la lista.</b> pasa lo que falte a la lista de la compra, marcado con la receta. También puedes decirle a Claude «guarda esta receta en Bitácora» con una foto o un enlace.'],
        ],
    },
    {
        id: 'habitos', grupo: 'general', titulo: 'rutinas.',
        lema: 'Lo que haces para estar bien, a tu ritmo.',
        intro: 'Antes se llamaba Hábitos. Sirve igual si las rutinas son el centro de tu día como si solo quieres probar con una. Sin puntos ni medallas: una semana de bolitas y tu racha en texto normal.',
        pasos: ['Si es la primera vez, toca una de las <b>ideas para empezar.</b> o escribe la tuya con <b>+ rutina.</b> Empieza por una sola.', 'Marca el círculo grande cuando la hagas. Si tiene pasos, puedes ir marcando cada paso y el círculo se va llenando.', 'Tócale el nombre para ajustarla: momento del día, cada cuánto y sus pasos.'],
        botones: [
            [guiaBoton('+ rutina.'), 'Qué, cuándo más o menos (mañana, tarde, noche o cuando sea), cada cuánto (todos los días, algunos días o x veces por semana) y, si quieres, sus pasos.'],
            [guiaBoton('círculo'), 'Hecha hoy. En las rutinas con pasos se va rellenando según marcas los pasos.'],
            [guiaBoton('bolitas de la semana'), 'Los últimos 7 días. Toca cualquiera para marcar o desmarcar ese día, por si se te olvidó apuntarlo. Las de borde punteado son días en los que no toca.'],
            [guiaBoton('ideas para empezar.'), 'Rutinas sencillas que se añaden con un toque. Salen mientras tengas pocas.'],
            [guiaBoton('hoy no toca. en pausa.'), 'Las rutinas de otros días de la semana y las que has pausado (conservan su historial).'],
        ],
        trucos: ['Los días en que no toca una rutina no rompen la racha; en las de x veces por semana, la racha se cuenta en semanas cumplidas.', 'Las rutinas que vienen de un objetivo (desde su mandala o su paso kaizen) indican para qué objetivo son.'],
    },
    {
        id: 'notas', grupo: 'general', titulo: 'notas.',
        lema: 'Una página por día, como un diario.',
        intro: 'Texto libre, una nota por día, con título opcional.',
        botones: [
            [guiaBoton('escribir la de hoy.'), 'Abre la nota de hoy (o la crea).'],
            [guiaBoton('tira de bolitas'), 'Los días del mes en los que escribiste.'],
            [guiaBoton('buscar en tus notas...'), 'Aparece a partir de siete notas; busca en títulos y contenido.'],
        ],
        trucos: ['Escribe [[ y el nombre de una entrada para enlazarla; aparecerá también en Conexiones.'],
    },
    {
        id: 'eventos', grupo: 'desarrollo', titulo: 'eventos.',
        lema: 'Planes con fecha, hora y lugar.',
        intro: 'Conciertos, citas, partidos, quedadas, médicos, vuelos... cada evento con su tipo e icono.',
        botones: [
            [guiaBoton('filtro.'), 'Muestra solo un tipo: social, teatro, cine, concierto, estudios, trabajo, salud, hogar, viajes, otro o deportes (con fútbol, baloncesto, F1 y MotoGP).'],
            [guiaBoton('buscar...'), 'Por título o lugar.'],
            [guiaBoton('importar calendario.'), 'Trae otro calendario: sube el archivo .ics que exportan Google, Apple u Outlook, o pega su enlace (en Google Calendar, «Dirección secreta en formato iCal»; también los calendarios de equipos, ligas o la universidad). Antes de importar te enseña cuántos eventos hay y eliges si solo de hoy en adelante o todo; las repeticiones se desdoblan para los próximos 12 meses y no se duplica nada si lo vuelves a importar. Para cualquier otro formato (una captura, un PDF), copia las instrucciones para una IA y pega lo que te devuelva. También está en Ajustes → tus datos.'],
            [guiaBoton('Mostrar pasados'), 'Los que ya pasaron.'],
            [guiaBoton('Aviso'), 'En el formulario: una hora antes o sin aviso.'],
            [guiaBoton('Entradas'), 'En el formulario: guarda las entradas con QR (una por persona) para enseñarlas en la puerta.'],
        ],
        trucos: ['Arriba ves el próximo evento; si hay varios hoy, a dos columnas (planes y exámenes).', 'Un evento de cine que ya pasó se convierte en película vista en Ocio para que la valores.'],
    },
    {
        id: 'finanzas', grupo: 'desarrollo', titulo: 'finanzas.',
        lema: 'Tu dinero, claro y sin sustos.',
        intro: 'Tres cuentas (Efectivo, Bancos y Online), todos tus movimientos con categoría, y herramientas para saber cómo vas y planificar. Al entrar te pregunta si quieres ocultar las cifras.',
        botones: [
            [guiaBoton('+ Movimiento, Registro rápido'), 'Apunta un ingreso, gasto o traspaso. El rápido solo pide importe y concepto; la categoría se ajusta luego.'],
            [guiaBoton('¿me lo puedo permitir?'), 'Escribe un precio y te dice si cabe este mes: lo que tienes, menos lo que sueles gastar hasta fin de mes, los cargos que faltan y lo programado.'],
            [guiaBoton('avisos de Finanzas'), 'Cuando una categoría pasa del 80 % de su presupuesto sale una línea suave (sin notificación). El presupuesto es el de las casillas de Largo plazo de ese mes vinculadas a la categoría y, si no tiene casilla, el presupuesto mensual de Categorías. Si un cargo se repite en el banco tres meses o más y no lo tienes como suscripción, Bitácora te pregunta si lo es: «añadir.» la da de alta y «no es.» no vuelve a proponerla.'],
            [guiaBoton('Importar'), 'Sube o pega el extracto del banco: el Excel (.xlsx) o el CSV tal cual lo descarga tu banco (Ibercaja, Santander, Revolut...), aunque traiga arriba los datos de la cuenta. Si tienes varias cuentas, las transferencias entre ellas (la salida en una y la entrada en otra, mismo importe, dos días como mucho) quedan solas como traspaso y no cuentan como ingreso ni gasto. Lo que apuntaste a mano se funde con su cargo del banco aunque lo pusieras en otra cuenta, y la fecha es siempre la del pago, no la del día en que el banco lo completó. Bitácora reconoce los movimientos, evita duplicados y aplica tus reglas de traspaso. Puedes importar mes a mes aunque los extractos se solapen: cada fila busca su pareja, lo que ya está no entra otra vez (aunque le hayas cambiado la nota, la categoría o lo hayas pasado a transferencia) y dos cargos iguales el mismo día cuentan como dos.'],
            [guiaBoton('Categorías, Reglas'), 'Tus categorías de gasto e ingreso, y las reglas de traspaso: un movimiento importado cuyo concepto contenga cierto texto (por ejemplo, lo que mandas a tu cuenta de inversión) se registra como traspaso entre cuentas en vez de como gasto.'],
            [guiaBoton('⭳ Exportar'), 'Un resumen en texto pensado para pegarlo en una IA y pedirle consejo.'],
            [guiaBoton('3M, 6M, 1A, Todo'), 'Rango de la gráfica de saldo.'],
            [guiaBoton('Patrimonio → %, Objetivo. saldos.'), 'En la tarjeta de Patrimonio: el porcentaje (o «Variación») abre cómo ha cambiado mes a mes; <b>Objetivo.</b> fija una meta y te dice cuánto falta; <b>saldos.</b> muestra el saldo de cada mes.'],
            [guiaBoton('ritmo.'), 'Cómo va tu gasto del mes comparado con lo normal en ti a estas alturas.'],
            [guiaBoton('largo plazo.'), 'Planifica cada mes tu sueldo y aportaciones, con historial, lista de deseos con semáforo e inversiones.'],
            [guiaBoton('metas.'), 'Huchas para objetivos de ahorro (fondo de emergencia, vacaciones...).'],
            [guiaBoton('recurrentes.'), 'Suscripciones y gastos fijos. Con «avisarme si no aparece en el banco» te avisa si un cargo no llega.'],
            [guiaBoton('programar gastos. Buscar duplicados, Corregir registros'), 'Gastos futuros, limpieza de duplicados y ajuste a mano del histórico.'],
            [guiaBoton('gasto de viaje.'), 'Al editar un gasto. Sigue contando como gasto, pero no entra en los presupuestos ni en el ritmo del mes, para que un viaje no te descuadre las categorías. Puedes asociarlo a un viaje de Viajes, que mostrará cuánto gastaste en él.'],
            [guiaBoton('gastos de un viaje.'), 'Marca de una vez todo lo de un viaje: eliges el viaje (o las fechas) y salen los gastos de esos días ya marcados, salvo suscripciones y gastos fijos. Desmarca lo que no fuera del viaje. Si el viaje no está en Viajes, escribe su nombre y se crea con esas fechas, con sus gastos dentro.'],
            [guiaBoton('viene de mis ahorros. va a mis ahorros.'), 'Para el dinero que sacas de una hucha o un bolsillo, o que apartas en él: mueve el saldo de la cuenta, pero no cuenta como ingreso ni como gasto. Los bolsillos de Revolut («From EUR Vacaciones», «To EUR Vacaciones») se marcan solos al importar.'],
            [guiaBoton('✎ Renombrar / saldo inicial'), 'Cambia el nombre de una cuenta o su saldo de partida.'],
        ],
        trucos: ['Si el extracto trae el saldo tras cada movimiento (el de Revolut lo trae), al importar Bitácora lo compara con el suyo. Si no cuadra, te enseña qué movimientos sobran o faltan en esas fechas para quitarlos con un botón, o ajusta el saldo al del extracto: el del banco manda.', 'Claude puede importar un extracto o registrar un gasto por ti; queda en la bandeja hasta que lo valides.', 'Si el banco cobra una suscripción en otra cuenta o con otro nombre (Claude cobrado como «Anthropic» en Revolut), Bitácora la reconoce por el importe exacto y la fecha, la pasa a la cuenta real y la recuerda para los meses siguientes.', 'Al importar, los pendientes se actualizan solos cuando se completan, y los cargos anulados por el banco se retiran.'],
    },
    {
        id: 'trabajo', grupo: 'desarrollo', titulo: 'empleo.',
        lema: 'Tu vida laboral, ordenada.',
        intro: 'Tus empleos con empresa, puesto, fechas, sueldo, modalidad y motivo de salida, y los documentos de cada uno.',
        botones: [
            [guiaBoton('importar vida laboral.'), 'Sube el PDF de tu Informe de Vida Laboral de la Seguridad Social y Bitácora crea los empleos solos.'],
            [guiaBoton('crear mi cv.'), 'Un asistente por pasos: tus datos de contacto, qué hacías y qué aprendiste en cada empleo, tu formación, idiomas y habilidades, y un perfil que Bitácora te propone escrito. Al final descarga un CV en PDF, limpio y de una página.'],
            [guiaBoton('Descargar resumen (PDF)'), 'Un resumen de tu vida laboral: días trabajados, cotizados y cada empleo.'],
            [guiaBoton('agenda laboral.'), 'Con un empleo actual aparece tu calendario de trabajo, aparte y más sobrio: solo tu horario y tus citas del trabajo. Pulsa un día para ver lo que tiene.'],
            [guiaBoton('horario.'), 'Qué días trabajas y a qué horas. Si trabajas fines de semana o un horario distinto cada día, aquí se ve y así sale en el calendario.'],
            [guiaBoton('+ cita.'), 'Una reunión, un turno distinto al de siempre, un plazo de entrega u otra cosa del trabajo, con hora y lugar.'],
            [guiaBoton('en el calendario principal.'), 'Encendido, tu horario y tus citas de trabajo salen también en Home y en el inicio del móvil, junto a todo lo demás. Apagado, solo se ven en Empleo.'],
            [guiaBoton('rayo'), 'En Empleo, la captura rápida late para recordarte que puedes añadir un empleo.'],
        ],
        trucos: ['El trabajo actual aparece destacado arriba, y los días que trabajas salen en el calendario. Sin horario, cuenta de lunes a viernes con las horas del empleo.', 'Lo que respondes en el CV se guarda: la próxima vez solo tienes que cambiar lo nuevo.', 'Si tienes activa Universidad, tu grado ya aparece en la formación del CV.'],
    },
    {
        id: 'estudios', grupo: 'desarrollo', titulo: 'estudios.',
        lema: 'Asignaturas, exámenes, trabajos y horario.',
        intro: 'Cada asignatura con sus exámenes y trabajos (fecha, peso y nota), tu horario semanal y notas rápidas.',
        botones: [
            [guiaBoton('+ asignatura'), 'Crea una asignatura (con créditos, para la nota media ponderada).'],
            [guiaBoton('+ (en la asignatura)'), 'Añade un examen o un trabajo.'],
            [guiaBoton('+ nota rápida, notas rápidas'), 'Apuntes sueltos, a mano.'],
            [guiaBoton('Horario semanal'), 'Tus clases por día y hora.'],
        ],
        trucos: ['Los exámenes salen en el calendario y los trabajos en el planificador el día de entrega.', 'Pide a Claude «añade el examen de X el día Y» y lo pondrá en su asignatura.'],
    },
    {
        id: 'profesorado', grupo: 'desarrollo', titulo: 'profesorado.',
        lema: 'El cuadrante de tu curso, como tu hoja de cálculo pero viva.',
        intro: 'Para quien da clase: tus clases arriba, los días hacia abajo y en cada casilla lo que quieres hacer ese día con ese grupo. Lo que no te da tiempo a dar te lo recuerda, las tareas se arrastran de un día a otro y, si un día al final no hay clase, todo se corre solo. Es un apartado opcional: actívalo en Ajustes → apartados (o al empezar en bitácora).',
        pasos: ['Crea tus clases con <b>+ clase.</b>: grupo, materia, color y qué días la tienes. O sube tu cuadrante de siempre con <b>importar cuadrante.</b>', 'En <b>calendario escolar.</b>, carga el de Zaragoza 2026-2027 (o añade tus días sin clase): se saltan solos.', 'Escribe en las casillas lo que toca cada día y marca el círculo cuando lo des.'],
        botones: [
            [guiaBoton('casillas'), 'Escribe y pulsa Intro para añadir la tarea; puedes poner varias el mismo día. Con la casilla vacía, Intro baja a la de abajo. Las casillas rayadas son días sin esa clase, pero también se puede escribir en ellas.'],
            [guiaBoton('asa (⋮⋮)'), 'Arrastra la tarea a otro día o a otra clase. Funciona con el ratón y con el dedo.'],
            [guiaBoton('círculo'), 'Hecha o por hacer. Las tareas sin círculo son avisos o notas (una excursión, un festivo): se crean así eligiendo «sin casilla.» al tocar su texto.'],
            [guiaBoton('pulsar un día'), 'Si al final no hay clase (huelga, jornada del centro), márcalo y las tareas de ese día y las siguientes se corren una clase, saltando fines de semana y festivos, hasta el primer hueco. Si un día sin clase al final la tiene, puedes adelantar las tareas para aprovecharlo.'],
            [guiaBoton('sin dar.'), 'Lo que tenía círculo y se quedó sin marcar antes de hoy. Desde ahí: asignar al día que elijas, correr el temario (va a la próxima clase y empuja lo de detrás), marcarla hecha o descartarla (se queda tachada en su día).'],
            [guiaBoton('mis clases.'), 'Debajo del cuadrante, una tarjeta por grupo: el curso en grande y en su color, un anillo con el porcentaje del temario hecho, una bolita por cada tarea de esta semana (rellena si está hecha, roja si se quedó sin dar), cómo vas (al día, por detrás o ajustado) y la próxima tarea. Al pulsarla se abre su ficha.'],
            [guiaBoton('ficha, resumen.'), 'Cuánto temario llevas, lo que se quedó sin dar, lo de esta semana y la siguiente, lo que ya has dado y cuántas clases te quedan hasta fin de curso. Desde aquí: copiar a otro grupo, guardar como plantilla y exportar.'],
            [guiaBoton('ficha, cuaderno.'), 'El cuaderno de notas: tus alumnos en filas (pega la lista entera con «+ alumnos.») y una columna por cada cosa que califiques, con su peso y su evaluación. La media se calcula sola y lo que queda por debajo de 5 se tiñe. Pulsa un alumno para ver su seguimiento y escribir observaciones.'],
            [guiaBoton('ficha, deberes.'), 'Qué mandaste y para cuándo. Marca quién lo ha entregado y, si quieres, pásalo al cuaderno para ponerle nota. Cada entrega sale en su día en el cuadrante.'],
            [guiaBoton('ficha, horario.'), 'A qué horas y en qué aula das esa clase. La hora y el aula salen en cada casilla del cuadrante, y los días de la clase se toman de aquí.'],
            [guiaBoton('ficha, notas.'), 'Las notas rápidas de cada día de esa clase. También se escriben con el lápiz de cada casilla del cuadrante.'],
            [guiaBoton('horario semanal.'), 'Tu semana entera por franjas, con cada clase en su color y su aula.'],
            [guiaBoton('copiar a otro grupo. plantillas'), 'Copia el temario de un grupo a otro (o a uno nuevo) desde la fecha que elijas, o guárdalo como plantilla para cargarlo en «repartir temario.» el curso que viene.'],
            [guiaBoton('exportar.'), 'PDF o Excel del mes: el cuadrante de todas las clases, o una clase con sus tareas, notas del día, deberes y cuaderno de notas.'],
            [guiaBoton('calendario escolar.'), 'Inicio y fin de curso y los días sin clase. Trae cargado el calendario oficial de Zaragoza 2026-2027 (festivos, Navidad, Semana Santa y no lectivos de la provincia).'],
            [guiaBoton('repartir temario.'), 'Pega los temas o tareas, uno por línea, y se colocan seguidos en los días de esa clase desde la fecha que elijas.'],
            [guiaBoton('importar cuadrante.'), 'Copia la instrucción y dásela a cualquier IA que pueda crear archivos (Claude, ChatGPT...) junto con tu cuadrante actual. Te devolverá un archivo cuadrante-bitacora.json que subes aquí. Se suma a lo que ya tienes, salvo que marques <b>sustituir mi cuadrante.</b>; abajo del todo, <b>borrar todo el cuadrante.</b> lo deja vacío.'],
            [guiaBoton('pantalla grande.'), 'Abre el cuadrante solo, a toda la ventana, para ver más días y clases de un vistazo. Dentro, <b>pantalla completa.</b> quita también las pestañas y la barra del navegador. <b>cerrar.</b> o Esc vuelven.'],
            [guiaBoton('ver títulos completos.'), 'El cuadrante enseña cada tarea en una línea, con sus primeras palabras, para ver muchos días de un vistazo (pasa el ratón o tócala para leerla entera). Este botón las enseña completas; <b>resumir tareas.</b> vuelve a una línea.'],
            [guiaBoton('ocultar lo pendiente.'), 'Esconde el aviso de lo que no pudiste dar, esas tareas en el cuadrante y la cuenta de hechas. <b>ver lo pendiente.</b> lo devuelve.'],
            [guiaBoton('1 semana, 2 semanas, 4 semanas, todo el curso'), 'Cuánto ves a la vez. «hoy.» te lleva a la semana actual.'],
        ],
        trucos: ['Al entrar, el cuadrante se abre con hoy en el centro, marcado en color.', 'Si tienes tareas sin dar, te lo avisa también la campana de notificaciones.', 'Las fiestas locales de Zaragoza (San Valero y Cincomarzada) vienen marcadas: si tu centro tiene otras, cámbialas pulsando el día.'],
    },
    {
        id: 'estudiar', grupo: 'desarrollo', titulo: 'estudiar.',
        lema: 'El rato de sentarse a estudiar.',
        intro: 'Va aparte de Estudios: allí están las asignaturas, el horario y los exámenes; aquí, el pomodoro, el plan del día, el temario y tus tarjetas de repaso. Es un apartado opcional de la rama #school: actívalo en Ajustes → apartados.',
        pasos: ['En <b>temario.</b>, apunta los temas de cada asignatura (puedes pegar el índice entero, uno por línea).', 'En <b>hoy.</b>, añade lo que vas a estudiar y cuántos pomodoros te llevará: se coloca solo desde la hora que digas, con sus descansos.', 'Pulsa ▶ en un tema para estudiarlo y márcalo al acabar.', 'En <b>tarjetas.</b>, crea un mazo y repasa cada día lo que toque.'],
        botones: [
            [guiaBoton('empezar. pausa. parar.'), 'El pomodoro: 25 minutos de estudio y 5 de descanso (cada 4, uno largo de 15). El descanso empieza solo; el siguiente pomodoro espera a que le des. Sigue contando aunque cambies de apartado, en la pastilla de abajo a la derecha.'],
            [guiaBoton('empiezo a las'), 'La hora desde la que se reparte el plan de hoy. Sin ella, empieza ahora.'],
            [guiaBoton('modo focus.'), 'En el pomodoro, el reloj solo a toda la ventana; en un repaso, la tarjeta sola y más grande. Dentro, <b>pantalla completa.</b> quita también las pestañas y la barra del navegador. Esc vuelve.'],
            [guiaBoton('− + ↑ ▶ ×'), 'Menos o más pomodoros para ese tema, subirlo en el orden, estudiarlo ahora o quitarlo.'],
            [guiaBoton('pasar al planificador.'), 'Lleva cada bloque al Planificador del día con su hora.'],
            [guiaBoton('→ hoy'), 'En el temario: pasa ese tema al plan de hoy. Al marcarlo como hecho en el plan, también queda estudiado en el temario.'],
            [guiaBoton('básica. ida y vuelta. escribir. huecos.'), 'Los tipos de tarjeta: ver la respuesta, preguntarla en los dos sentidos, escribirla antes de verla o tapar partes de una frase con {{c1::...}} (selecciona el texto y pulsa <b>hacer hueco.</b>).'],
            [guiaBoton('otra vez. difícil. bien. fácil.'), 'Cómo te ha ido con la tarjeta. Debajo de cada botón ves cuándo volverá: lo que fallas vuelve en minutos y lo que sabes se espacia días, semanas o meses. Atajos: espacio para ver la respuesta y 1 a 4 para responder.'],
            [guiaBoton('importar. exportar.'), 'Pega tarjetas «pregunta;respuesta», una por línea (también lo que exportan Anki y Quizlet), o llévate el mazo a Anki. <b>copiar instrucciones para una IA.</b> te da un texto para pedir a Claude o ChatGPT que haga las tarjetas de tus apuntes.'],
            [guiaBoton('ajustes.'), 'Los minutos del pomodoro y cuántas tarjetas nuevas ver al día (20 por defecto, para que los repasos no se acumulen).'],
        ],
        trucos: ['Repasar un poco cada día rinde mucho más que darse un atracón antes del examen: las tarjetas están pensadas para eso.', 'Las tarjetas se programan con FSRS, el mismo algoritmo que usa Anki hoy en día.'],
    },
    {
        id: 'universidad', grupo: 'desarrollo', titulo: 'universidad.',
        lema: 'Tu carrera entera, por cuatrimestres.',
        intro: 'Para quien estudia en la universidad: los créditos que llevas, la media del expediente, en qué semana del cuatrimestre estás, cuánto falta para los exámenes y qué necesitas sacar en cada asignatura para aprobar. Es un apartado opcional: actívalo en Ajustes → apartados. Con él activo, Estudios enseña solo las asignaturas del cuatrimestre actual.',
        pasos: ['Pulsa <b>configurar mi carrera.</b>: nombre del grado, créditos totales (240 normalmente), curso y cuatrimestre actual.', 'Ajusta en <b>fechas.</b> el inicio y fin de las clases, los exámenes y la extraordinaria de tu universidad.', 'En el <b>lápiz</b> de cada asignatura pon sus créditos y, cuando salga, la nota oficial del acta.'],
        botones: [
            [guiaBoton('+ asignatura.'), 'Añade una asignatura a ese cuatrimestre (también aparece en Estudios).'],
            [guiaBoton('lápiz'), 'Créditos, nota oficial, cuatrimestre y si está convalidada.'],
            [guiaBoton('+ cuatrimestre.'), 'Añade el siguiente cuatrimestre (o uno ya pasado, para completar tu expediente).'],
            [guiaBoton('hacer actual. pasar a él.'), 'Cambia al cuatrimestre nuevo. Cada cuatrimestre guarda su propio horario semanal.'],
        ],
        trucos: ['«necesitas un 5,7 en el 60% que queda» sale de los pesos y notas de los exámenes y trabajos de la asignatura.', 'La media del expediente se pondera por créditos y solo cuenta las asignaturas aprobadas, como la oficial.', 'Si tu carrera va por cursos completos y no por cuatrimestres, elige «curso completo» al configurarla. Si solo algunas asignaturas son anuales, márcalas como «anual» en su lápiz: saldrán en los dos cuatrimestres del curso.', 'Sin Universidad activa, Estudios funciona igual que siempre (bachillerato, FP, oposiciones...): todas tus asignaturas juntas, sin cuatrimestres.'],
    },
    {
        id: 'documentos', grupo: 'desarrollo', titulo: 'documentos.',
        lema: 'Lo importante, a mano cuando lo necesitas.',
        intro: 'Dos cosas en un sitio: <b>fichas</b> (DNI, garantías, seguros, contratos... con su fecha de caducidad) y <b>archivos</b> (PDF o páginas HTML que subes).',
        botones: [
            [guiaBoton('+ ficha.'), 'Un documento con su tipo, fecha de caducidad y enlace. En ámbar si caduca en menos de un mes; en granate si ya caducó.'],
            [guiaBoton('subir archivo.'), 'Sube un PDF o HTML. También puedes arrastrarlo sobre la página.'],
            [guiaBoton('copias.'), 'Tus copias de seguridad automáticas.'],
            [guiaBoton('↓, ✎, ✕'), 'En cada archivo: descargar o ver, renombrar y borrar.'],
        ],
        trucos: ['Bitácora te avisa 30, 7 y 1 día antes de que caduque una ficha (si tienes las notificaciones activadas).'],
    },
    {
        id: 'objetivos', grupo: 'desarrollo', titulo: 'objetivos.',
        lema: 'Lo que quieres conseguir, y cómo.',
        intro: 'Objetivos a corto, medio y largo plazo: numéricos (con progreso, por ejemplo «leer 20 libros») o con hitos.',
        botones: [
            [guiaBoton('Lista, Tablero'), 'Por plazo o en columnas por estado.'],
            [guiaBoton('Método'), 'Cuatro prácticas japonesas para trabajar cada objetivo (debajo).'],
            [guiaBoton('mandala.'), 'Método Harada (el de Shohei Ohtani): el objetivo en el centro, ocho pilares y ocho acciones por pilar. <b>→ rutina.</b> convierte una acción en hábito.'],
            [guiaBoton('paso kaizen.'), 'El gesto más pequeño que te acerca, cada día. Se lleva como rutina con su racha.'],
            [guiaBoton('para qué.'), 'Por qué lo quieres, para ti y para los demás: lo que te sostiene cuando cuesta.'],
            [guiaBoton('hansei.'), 'Cada semana: qué salió bien, qué no y qué parte fue tuya, y qué cambias.'],
        ],
    },
    {
        id: 'proyectos', grupo: 'desarrollo', titulo: 'proyectos.',
        lema: 'Cosas grandes, paso a paso.',
        intro: 'Cada proyecto se abre en su propio gestor: el siguiente paso siempre a la vista, dónde está en la colina, sus tareas por fases y un diario de lo que vas decidiendo. Se pueden vincular a un objetivo. Es un apartado opcional: actívalo o quítalo en Ajustes → apartados.',
        pasos: ['Crea el proyecto con el botón +, con su fecha límite.', 'Ábrelo y, en <b>tareas.</b>, pártelo en pasos que se puedan hacer en una sentada (pega varios, uno por línea). Si es largo, crea <b>fases.</b> y agrúpalas.', 'Marca con ★ el siguiente paso, o deja que Bitácora elija el primero en marcha o pendiente.', 'Cuando vayas a trabajar en él, <b>→ hoy</b> lo lleva al planificador. Al marcarlo hecho allí, se marca también en el proyecto.'],
        botones: [
            [guiaBoton('siguiente paso.'), 'Lo único que tienes que hacer ahora en ese proyecto. <b>hecho.</b> lo completa y trae el siguiente. También salen todos juntos en el planificador, en «siguientes pasos.».'],
            [guiaBoton('la colina.'), 'Dónde está el proyecto: cuesta arriba (pensando, probando) aún no sabes cómo hacerlo; pasada la cima (decidido), cuesta abajo, ya solo es hacer. Muévela según lo sientas: dice más que un porcentaje.'],
            [guiaBoton('○ ◐ ●'), 'El círculo de cada tarea: pendiente, en marcha y hecha. Tócalo para avanzarla; toca el nombre para ponerle fecha, fase o notas.'],
            [guiaBoton('diario.'), 'La bitácora del proyecto: apunta decisiones y avances con su fecha.'],
            [guiaBoton('Lista, Tablero'), 'Todos tus proyectos en lista (con su siguiente paso) o en tablero por estado, arrastrándolos de columna.'],
        ],
        trucos: ['Una tarea pequeña y concreta se empieza; «hacer la web» no. Si llevas días sin tocar una, pártela.', 'Claude puede añadir tareas a un proyecto; aparecen en el gestor.'],
    },
    {
        id: 'enlaces', grupo: 'desarrollo', titulo: 'enlaces.',
        lema: 'Tus webs, sin veinte pestañas abiertas.',
        intro: 'Enlaces guardados por categoría, como accesos directos. Es un apartado opcional: actívalo o quítalo en Ajustes → apartados.',
        botones: [[guiaBoton('+ enlace, + categoría'), 'Guarda un enlace o crea una categoría para agruparlos. Pulsa tu nombre para cambiarlo.']],
        trucos: ['Claude puede guardar un enlace por ti.'],
    },
    {
        id: 'ocio', grupo: 'otros', titulo: 'ocio.',
        lema: 'Lo que lees, ves y juegas.',
        intro: 'Libros, películas, series y videojuegos, con estado, fechas, valoración y notas, y listas propias.',
        botones: [
            [guiaBoton('libros. series. películas. videojuegos. listas.'), 'Cada tipo en su pestaña.'],
            [guiaBoton('importar goodreads. importar letterboxd. importar imdb.'), 'Trae tu historial de esas webs.'],
            [guiaBoton('recomendaciones.'), 'Lo que te han recomendado tus amigos de Bitácora.'],
            [guiaBoton('buscar portadas.'), 'Busca en internet la portada de todo lo que no la tiene en la pestaña. Si no está seguro de cuál es, la tarjeta te ofrece <b>elegir portada.</b> con las coincidencias.'],
            [guiaBoton('portada. (en la ficha)'), 'Cambia la portada, pega el enlace de otra imagen o quítala.'],
        ],
        trucos: ['Al añadir un libro, una serie, una película o un juego, Bitácora busca su portada sola.', 'Desde la ficha de una película o un libro puedes recomendarlo a un amigo.', 'Claude puede marcar algo como terminado y valorarlo, y se aplica solo.'],
    },
    {
        id: 'viajes', grupo: 'otros', titulo: 'viajes.',
        lema: 'Cada viaje, con todo dentro.',
        intro: 'Tus viajes y los lugares que quieres visitar. Cada viaje se abre en su gestor.',
        botones: [
            [guiaBoton('Resumen'), 'Acompañantes, notas, gasto total y cifras del viaje.'],
            [guiaBoton('Reservas'), 'Transportes (vuelos, trenes...: compañía, número, horarios, localizador, asiento) y alojamientos (dirección, entrada, salida, reserva).'],
            [guiaBoton('Lugares, Itinerario, Mapa'), 'Sitios que ver, el plan día a día y su mapa.'],
            [guiaBoton('Documentos, Listas'), 'Billetes y reservas en PDF, y listas de preparativos (maleta...).'],
            [guiaBoton('Gastos'), 'Lo que gastaste en el viaje, sacado de Finanzas: los movimientos marcados como «gasto de viaje.» con este viaje o dentro de sus fechas. Total, media por día, reparto por categorías y la lista día a día. «revisar qué gastos son del viaje.» abre la herramienta para marcarlos.'],
            [guiaBoton('Compartir'), 'Envía el viaje a un amigo de Bitácora.'],
        ],
        trucos: ['Pide a Claude que lea los correos de reserva y complete el viaje: transportes, alojamientos e itinerario (pasa por la bandeja).'],
    },
    {
        id: 'actualizaciones', grupo: 'otros', titulo: 'envíos.',
        lema: 'Tus pedidos por internet, bajo control.',
        intro: 'Lo que compras en AliExpress, Vinted, Amazon, Zara... con su estado en cinco pasos: pedido, enviado, en camino, en reparto y entregado. Con número de seguimiento, Bitácora consulta el transportista cada 2 horas y lo avanza sola (y te avisa). Es un apartado opcional: actívalo en Ajustes → apartados.',
        botones: [
            [guiaBoton('+ pedido.'), 'Qué es, tienda, número de seguimiento, enlace, precio, fecha y llegada estimada.'],
            [guiaBoton('→ siguiente paso'), 'Avanza el estado a mano; queda en su historial.'],
            [guiaBoton('actualizar.'), 'Consulta el transportista ahora mismo en vez de esperar a la siguiente revisión.'],
            [guiaBoton('movimientos.'), 'Cada escaneo del paquete, del más reciente al más antiguo.'],
            [guiaBoton('seguir envío.'), 'Abre la página de seguimiento del transportista (o 17TRACK si no se conoce).'],
            [guiaBoton('copiar. ver pedido. editar.'), 'Copiar el número, abrir el pedido en la tienda y cambiar sus datos o añadir una novedad.'],
            [guiaBoton('ver entregados.'), 'Los que ya llegaron.'],
        ],
        trucos: ['Para Vinted (InPost), pega el enlace de seguimiento del correo de envío en "enlace del pedido".', 'Amazon solo se puede seguir si te da el número del transportista (Correos, SEUR, GLS...); los envíos de Amazon Logistics no.', 'Si pasa la fecha estimada sin llegar, el pedido se marca en granate.'],
    },
    {
        id: 'coleccionables', grupo: 'otros', titulo: 'coleccionables.',
        lema: 'Tu colección y lo que vale.',
        intro: 'Un inventario por categorías con el valor de cada objeto. Para cartas, Bitácora busca su precio de mercado. Es un apartado opcional: actívalo en Ajustes → apartados.',
        botones: [
            [guiaBoton('+ coleccionable. + categoría.'), 'Añade un objeto o una categoría.'],
            [guiaBoton('todas. cartas. ...'), 'Filtra por categoría.'],
            [guiaBoton('buscar, ordenar'), 'Por nombre, set o número, y orden por valor u otros criterios.'],
        ],
    },
    {
        id: 'amigos', grupo: 'otros', titulo: 'social.',
        lema: 'Bitácora con tu gente.',
        intro: 'Todo lo que haces con tus amigos en un sitio: gastos compartidos (como Tricount), eventos que les compartes, quedadas y listas por enlace para quien no usa Bitácora y tu lista de amigos. Las recomendaciones de Ocio y los viajes compartidos también llegan de aquí.',
        pasos: ['En <b>amigos.</b>, genera tu código y compártelo, o escribe el de un amigo: le llegará una solicitud.', 'En <b>gastos.</b>, crea un grupo (un viaje, una cena, el piso) y elige quién está.', 'Cada vez que alguien pague algo, apúntalo con <b>+ gasto.</b>: lo ven y lo editan todos los del grupo.'],
        botones: [
            [guiaBoton('+ grupo.'), 'Nombre y quién está: tus amigos de Bitácora y, si hace falta, gente sin cuenta (solo con su nombre).'],
            [guiaBoton('+ gasto.'), 'Título, importe, fecha, quién pagó, categoría y para quién: a partes iguales, por partes (uno paga doble...) o por importes exactos.'],
            [guiaBoton('transferencia. ingreso.'), 'Una transferencia es dinero que alguien da a otro para devolverlo; un ingreso es dinero que entra al grupo (una devolución, una fianza) y se reparte.'],
            [guiaBoton('mis gastos. total del grupo. mi saldo.'), 'Lo que te toca a ti, lo que se ha gastado en total y si te deben (verde) o debes (rojo).'],
            [guiaBoton('saldos. cómo saldar.'), 'Cuánto debe o le deben a cada uno, y la forma de dejarlo a cero con los mínimos pagos. «pagado.» apunta ese pago.'],
            [guiaBoton('compartir un evento.'), 'Manda uno de tus próximos eventos a tus amigos; les llega para añadirlo a su calendario. También desde el botón «compartir.» de cada evento.'],
            [guiaBoton('con un enlace.'), 'Para quien no usa Bitácora: lo abre desde WhatsApp sin cuenta ni app. <b>quedada.</b> propone fechas y cada uno marca si puede; tú eliges y entra en tu calendario. <b>invitación.</b> manda un evento tuyo y te dicen si van (y con cuántos). <b>lista.</b> todos tachan y añaden; lo pendiente lo traes a tu despensa. Desde un viaje, <b>enseñar el plan.</b> Te llega un aviso cada vez que alguien responde.'],
            [guiaBoton('salir del grupo. borrar grupo para todos.'), 'Si sales y ya apareces en algún gasto, sigues con tu nombre para que las cuentas cuadren. Solo quien creó el grupo puede borrarlo.'],
            [guiaBoton('tu perfil. código de amigo'), 'Tu nombre visible, tu foto y una frase sobre ti, que ven tus amigos en su lista; y tu código permanente para conectar. La foto pasa sola a blanco y negro con grano, como todas las de bitácora. También se abre pulsando tu foto en Home.'],
        ],
        trucos: ['Los céntimos se reparten para que la suma cuadre siempre exacta.', 'Ideal para pisos compartidos: un grupo que no se cierra nunca y se salda cada mes.'],
    },
    {
        id: 'etiquetas', grupo: 'otros', titulo: 'etiquetas.',
        lema: 'Todo lo que comparte una etiqueta, junto.',
        intro: 'Cualquier entrada puede llevar etiquetas. Aquí ves cada una con cuántas entradas tiene y de qué tipos. Es un apartado opcional: actívalo o quítalo en Ajustes → apartados.',
        botones: [
            [guiaBoton('tarjeta'), 'Abre la etiqueta: sus entradas agrupadas por tipo.'],
            [guiaBoton('ver conexiones. renombrar. eliminar.'), 'Su constelación en Conexiones, cambiarle el nombre en todas partes o quitarla de todo.'],
            [guiaBoton('×'), 'Quita la etiqueta de una sola entrada.'],
        ],
        trucos: ['Usa padre/hijo (por ejemplo «viaje/japón») para agruparlas: la tarjeta de «viaje» enseña sus subetiquetas.'],
    },
    {
        id: 'conexiones', grupo: 'otros', titulo: 'conexiones.',
        lema: 'Cómo se relaciona todo, sin hacer nada.',
        intro: 'Bitácora encuentra sola lo que tiene que ver entre sí: lo que pasó durante cada viaje, los partidos de cada equipo, lo que comparte una persona, una etiqueta, una asignatura o un lugar, y los [[enlaces]] de tus notas. Es un apartado opcional: actívalo o quítalo en Ajustes → apartados.',
        pasos: ['Elige un centro en la columna izquierda (un viaje, un equipo, una persona...).', 'Verás su constelación y, debajo, la lista. Toca cualquier punto para abrir esa entrada.'],
    },
    {
        id: 'bandeja', grupo: 'sistema', titulo: 'bandeja.',
        lema: 'Lo que Claude propone, esperando tu visto bueno.',
        intro: 'Los cambios que piden Claude o ChatGPT (salvo eventos, entradas con QR, Ocio, tarjetas de estudio, compra y proyectos) no se aplican hasta que los validas. El número en granate del menú es lo que tienes pendiente.',
        botones: [
            [guiaBoton('validar cambio. descartar.'), 'Aplica o rechaza un cambio.'],
            [guiaBoton('validar los N. validar todo.'), 'Por grupo o todos de golpe.'],
            [guiaBoton('ver contenido.'), 'El detalle de lo que se va a aplicar (por ejemplo, las filas de un extracto).'],
            [guiaBoton('historial, deshacer.'), 'Todo lo que ha hecho Claude, con opción de deshacerlo.'],
        ],
    },
    {
        id: 'sugerencias', grupo: 'sistema', titulo: 'sugerencias.',
        lema: 'Tu opinión cuenta.',
        intro: 'Cuenta qué echas en falta o qué cambiarías; llega directamente a quien hace Bitácora. Debajo ves tus sugerencias anteriores.',
    },
    {
        id: 'ajustes', grupo: 'sistema', titulo: 'ajustes.',
        lema: 'Cómo es y cómo se comporta tu Bitácora.',
        intro: 'Agrupados en cuenta, apartados, conexiones, apariencia, más y zona de riesgo.',
        botones: [
            [guiaBoton('suscripción.'), 'Tu plan y su renovación. Las cuentas nuevas tienen 14 días de prueba gratis sin tarjeta; desde aquí te suscribes (1,99 € al mes o 18,99 € al año) o te haces socio fundador.'],
            [guiaBoton('socio fundador.'), 'Un único pago de 29,99 € y Bitácora de por vida, solo para 100 personas: tu número de socio en dorado en Home y un tema exclusivo, «fundador.». Si ya tenías suscripción, se cancela sola. Además tiene tres códigos que regalan 6 meses de Bitácora (se ven pulsando su número de socio en Home o en Ajustes).'],
            [guiaBoton('¿tienes un código de regalo?'), 'Si un socio fundador te ha pasado un código, escríbelo en Ajustes → suscripción o al terminar la prueba: tienes 6 meses de Bitácora gratis.'],
            [guiaBoton('elegir apartados.'), 'Los apartados que no todo el mundo usa, agrupados por ramas (#school, #home, #work, #mind): estudios, estudiar, universidad, profesorado, empleo, compra, envíos, proyectos, enlaces, etiquetas, conexiones y coleccionables. Marca los que quieras y pulsa <b>guardar selección.</b> abajo. Lo que apagas desaparece de menús, buscador e inicio móvil; sus datos se conservan.'],
            [guiaBoton('tu calendario en otras apps.'), 'Un enlace personal para suscribirte a Bitácora desde Google Calendar, el Calendario del iPhone u Outlook: eventos, cumpleaños, viajes y fechas límite de proyectos, que se actualizan solos. «cambiar enlace» anula el anterior si lo compartiste sin querer.'],
            [guiaBoton('importar calendario.'), 'Al revés: trae a Bitácora otro calendario (archivo .ics o enlace).'],
            [guiaBoton('tamaño de letra en el móvil.'), 'Pequeña, normal, grande o muy grande. Solo en este dispositivo.'],
            [guiaBoton('tus datos. → exportar. importar.'), 'Todo en un archivo JSON para guardarlo aparte o recuperarlo.'],
            [guiaBoton('claude y chatgpt. notificaciones.'), 'Conectar la IA y los avisos (ver sus secciones).'],
            [guiaBoton('tema y letra.'), 'Tema, tipografía y modo ancho; se guardan en cada dispositivo.'],
            [guiaBoton('prompts guardados.'), 'Textos que usas a menudo con una IA.'],
            [guiaBoton('modo desarrollador.'), 'Enseña funciones ocultas, como Vault.'],
            [guiaBoton('cerrar sesión en todas partes.'), 'Cierra tu sesión en todos los dispositivos.'],
        ],
    },
    {
        id: 'seguridad', grupo: 'sistema', titulo: 'tus datos, seguros.',
        lema: 'Nada se pierde.',
        intro: 'Bitácora guarda cada cambio en la nube al momento, combina los de todos tus dispositivos y hace copias de seguridad solas.',
        pasos: [
            'Cada día se hace una copia automática, y cada semana una instantánea completa (se guardan las 12 últimas).',
            'Puedes ver y restaurar copias en Documentos → <b>copias.</b> o en Panorama → copia de seguridad.',
            'Exporta todo cuando quieras desde Ajustes → tus datos.',
        ],
    },
];

let guiaSeccion = 'bienvenida';
let guiaFiltro = '';

function openGuia(id) {
    if (id) guiaSeccion = id;
    guiaFiltro = '';
    showModal(`<div class="guia" id="guia">${renderGuiaInterior()}</div>`);
    document.querySelector('#modal-container .modal-sheet')?.classList.add('guia-sheet');
    centrarIndiceGuia();
}

function textoPlanoGuia(s) {
    return stripAccents([s.titulo, s.lema, s.intro, ...(s.pasos || []), ...(s.trucos || []), ...(s.botones || []).flat()].join(' ').replace(/<[^>]+>/g, ' ').toLowerCase());
}

function renderGuiaInterior() {
    const q = stripAccents(guiaFiltro.toLowerCase().trim());
    const visibles = GUIA.filter(s => !q || textoPlanoGuia(s).includes(q));
    const actual = GUIA.find(s => s.id === guiaSeccion) || GUIA[0];
    return `
        <div class="guia-cab">
            <div><div class="guia-titulo">guía de bitácora.</div><div class="guia-sub">Cada apartado y cada botón, explicado.</div></div>
            <input class="modal-input guia-buscar" placeholder="buscar en la guía..." value="${escapeHtml(guiaFiltro)}" oninput="guiaFiltro=this.value;const c=this.selectionStart;document.getElementById('guia').innerHTML=renderGuiaInterior();const i=document.querySelector('.guia-buscar');i.focus();i.setSelectionRange(c,c)">
            <button class="guia-cerrar" onclick="closeModal()" aria-label="Cerrar la guía">×</button>
        </div>
        <div class="guia-cuerpo">
            <nav class="guia-indice">
                ${GUIA_GRUPOS.map(g => {
                    const items = visibles.filter(s => s.grupo === g.id);
                    if (!items.length) return '';
                    return `<div class="guia-indice-grupo">${g.titulo}</div>${items.map(s => `<button data-seccion="${s.id}" class="${s.id === actual.id ? 'activo' : ''}" onclick="guiaIr('${s.id}')">${s.titulo}</button>`).join('')}`;
                }).join('') || '<div class="guia-sin">Nada coincide.</div>'}
            </nav>
            <article class="guia-contenido" id="guia-contenido">${renderGuiaSeccion(actual)}</article>
        </div>`;
}

function renderGuiaSeccion(actual) {
    const i = GUIA.indexOf(actual);
    const ant = GUIA[i - 1], sig = GUIA[i + 1];
    return `
        <div class="guia-seccion-grupo">${GUIA_GRUPOS.find(g => g.id === actual.grupo)?.titulo || ''}</div>
        <h2 class="guia-seccion-titulo">${actual.titulo}</h2>
        <div class="guia-lema">${actual.lema}</div>
        <p class="guia-intro">${actual.intro}</p>
        ${actual.pasos?.length ? `<div class="guia-bloque-titulo">cómo se usa.</div><ol class="guia-pasos">${actual.pasos.map(p => `<li>${p}</li>`).join('')}</ol>` : ''}
        ${actual.botones?.length ? `<div class="guia-bloque-titulo">cada botón.</div><div class="guia-botones">${actual.botones.map(([nombre, que]) => `<div class="guia-boton-fila"><div class="guia-boton-nombre">${nombre}</div><div class="guia-boton-que">${que}</div></div>`).join('')}</div>` : ''}
        ${actual.trucos?.length ? `<div class="guia-bloque-titulo">trucos.</div><ul class="guia-trucos">${actual.trucos.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
        <div class="guia-nav">
            ${ant ? `<button onclick="guiaIr('${ant.id}')">← ${ant.titulo}</button>` : '<span></span>'}
            ${sig ? `<button class="sig" onclick="guiaIr('${sig.id}')">${sig.titulo} →</button>` : ''}
        </div>`;
}

// Solo cambia el contenido y la marca del índice: repintar la guía
// entera devolvía el índice a su principio en cada clic.
function guiaIr(id) {
    const actual = GUIA.find(s => s.id === id);
    const contenido = document.getElementById('guia-contenido');
    if (!actual || !contenido) return;
    guiaSeccion = id;
    contenido.innerHTML = renderGuiaSeccion(actual);
    contenido.scrollTop = 0;
    document.querySelectorAll('.guia-indice button').forEach(btn => btn.classList.toggle('activo', btn.dataset.seccion === id));
    centrarIndiceGuia();
}

// Con el índice en fila (móvil), deja la sección activa a la vista
// desplazando solo el índice, nunca el modal ni la página.
function centrarIndiceGuia() {
    const btn = document.querySelector('.guia-indice button.activo');
    const indice = btn?.parentElement;
    if (!btn || !indice) return;
    if (indice.scrollWidth > indice.clientWidth) {
        indice.scrollTo({ left: btn.offsetLeft - (indice.clientWidth - btn.offsetWidth) / 2, behavior: 'smooth' });
    } else if (btn.offsetTop < indice.scrollTop || btn.offsetTop + btn.offsetHeight > indice.scrollTop + indice.clientHeight) {
        indice.scrollTo({ top: btn.offsetTop - indice.clientHeight / 2, behavior: 'smooth' });
    }
}
