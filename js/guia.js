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
        intro: 'Bitácora reúne lo que normalmente está repartido en decenas de apps: calendario, tareas del día, hábitos, notas, finanzas, estudios, trabajo, viajes, ocio, coleccionables y más. Todo se guarda solo en la nube y se sincroniza entre tus dispositivos.',
        pasos: [
            'El menú de la izquierda agrupa los apartados en <b>general.</b> (tu día a día), <b>desarrollo.</b> (lo que construyes: dinero, estudios, trabajo, objetivos), <b>otros.</b> (ocio, viajes, colecciones, amigos) y <b>sistema.</b> (bandeja, sugerencias, ajustes).',
            'Pulsa cualquier apartado para entrar. El primero, <b>home</b>, es tu calendario.',
            'No hay botón de guardar: cada cambio se guarda al momento.',
            'Si usas Bitácora en varios dispositivos a la vez, se combinan los cambios de todos sin pisarse.',
        ],
        trucos: [
            'Tres temas en Ajustes: <b>asfalto</b> (oscuro), <b>papel</b> (claro) y <b>teja</b> (piedra cálida con naranja).',
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
            [guiaBoton('/año · /tema · /backup · /exportar'), 'Comandos del buscador: escribe «/» para verlos. Abren el calendario anual, cambian el tema, hacen una copia o exportan tus datos.'],
        ],
        trucos: ['Haz clic derecho sobre un apartado del menú para ver sus opciones rápidas.'],
    },
    {
        id: 'crear', grupo: 'empezar', titulo: 'crear cosas.',
        lema: 'Un solo gesto para apuntar cualquier cosa.',
        intro: 'Casi todo en Bitácora es una «entrada»: un evento, un libro, un viaje, un objetivo, un cumpleaños, un documento... Se crean todas igual.',
        pasos: [
            'Pulsa el botón redondo del <b>rayo</b> (abajo a la derecha), <b>+ Añadir</b> (arriba) o la tecla <b>Espacio</b>.',
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
        intro: 'Si añades Bitácora a la pantalla de inicio, se abre como una app con su propia versión móvil: una portada con tu mes en bolitas y una página por apartado, pensada para consultar y apuntar con el pulgar.',
        pasos: [
            'iPhone: abre appbitacora.es en Safari → botón Compartir → <b>Añadir a pantalla de inicio</b>. En Android o en el ordenador: Ajustes → <b>instalar bitácora.</b>',
            'Ábrela desde el icono. Arriba verás la fecha en grande y el tiempo de tu ciudad.',
            'El mes en <b>bolitas</b>: negras las pasadas, grises las que faltan y en color las que tienen algo (eventos, tareas, cumpleaños...). Toca una para ver ese día debajo; <b>volver a hoy.</b> te devuelve.',
            'En la lista del día puedes marcar las tareas sin salir de la portada; el <b>+</b> añade algo a ese día.',
            'Más abajo, las teselas: tareas y hábitos de hoy, gasto del mes, próximo examen, bandeja, pedidos y próximo viaje. Tócalas para ir a cada apartado.',
            'El botón redondo de arriba a la derecha abre el <b>menú</b> a pantalla completa. Los números en círculo son lo pendiente; el punto naranja en el botón avisa de que hay cambios en la bandeja.',
        ],
        botones: [
            [guiaBoton('‹ inicio.'), 'Arriba a la izquierda en cualquier apartado: vuelve a la portada sin abrir el menú.'],
            [guiaBoton('versión completa.'), 'Al final del menú: cambia a la versión de escritorio hasta que cierres la app.'],
            [guiaBoton('temas'), 'Al final del menú, los tres círculos cambian el tema.'],
        ],
        trucos: ['Planificador, Finanzas, Estudios, Hábitos, Eventos, Notas y Viajes tienen página propia en el móvil; el resto usa la de escritorio adaptada.'],
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
            [guiaBoton('se aplica solo'), 'Crear o editar eventos, añadir entradas con QR y los cambios en Ocio.'],
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
        ],
    },
    {
        id: 'home', grupo: 'general', titulo: 'home.',
        lema: 'Tu calendario de toda la vida.',
        intro: 'La primera pantalla: un calendario con todo lo que tiene fecha en Bitácora — eventos, viajes, cumpleaños, exámenes, pagos de suscripciones...',
        botones: [
            [guiaBoton('Día · Semana · Mes'), 'Cambia la vista. En el mes, cada punto bajo un día es una cosa ese día.'],
            [guiaBoton('‹ ›'), 'Mes, semana o día anterior y siguiente.'],
            [guiaBoton('●'), 'El círculo negro abre el <b>calendario anual</b>: el año entero en bolitas, con vistas de días de viaje y de esfuerzo.'],
            [guiaBoton('tiempo'), 'La temperatura de tu ciudad. Tócala para ver la previsión de los próximos días y cambiar de ciudad.'],
        ],
        pasos: ['Pulsa un día para ver lo que hay y añadir algo con esa fecha.', 'Pulsa una entrada para abrir su ficha (ver, editar o borrar).'],
    },
    {
        id: 'resumen', grupo: 'general', titulo: 'centro resumen.',
        lema: 'Todo lo importante, de un vistazo.',
        intro: 'Un panel con lo que tienes encima y accesos a las vistas de resumen, para no ir apartado por apartado.',
        botones: [
            [guiaBoton('a tener en cuenta.'), 'Avisos del día: cargos que no han llegado, semanas cargadas, cosas por revisar.'],
            [guiaBoton('hoy. · tareas. · esta semana. · próximamente.'), 'Lo de hoy, tus tareas, la semana y lo que viene.'],
            [guiaBoton('revisión semanal.'), 'Repaso guiado de la semana.'],
            [guiaBoton('actividad. · estadísticas. · patrones.'), 'Tu actividad día a día, cifras históricas y patrones de gasto y hábitos.'],
            [guiaBoton('bandeja. · copia de seguridad.'), 'Atajos a la bandeja de Claude y a tus copias.'],
            [guiaBoton('✷'), 'Tu estancia en Bitácora: un dibujo de todo lo que has registrado desde que empezaste.'],
        ],
    },
    {
        id: 'planificador', grupo: 'general', titulo: 'planificador.',
        lema: 'Tu día, hora a hora.',
        intro: 'Una línea de tiempo para hoy, mañana y pasado mañana. Cada día empieza a las 4:00 de la mañana; lo que no marcas como hecho pasa al día siguiente destacado en granate, para que no se pierda.',
        botones: [
            [guiaBoton('Hoy · Mañana · Pasado mañana'), 'Qué día estás planificando.'],
            [guiaBoton('+ (tarjeta)'), 'Añade una tarea con hora al día que estás viendo. La cifra es lo que tienes hoy.'],
            [guiaBoton('↻ (tarjeta)'), 'Tareas recurrentes: las que se repiten (cada día, ciertos días de la semana, cada mes o cada N días).'],
            [guiaBoton('progreso de hoy.'), 'Un sello por tarea; se rellenan al completarlas.'],
            [guiaBoton('tareas pendientes. → + tarea'), 'Cosas sin día ni hora. <b>→ hoy</b> las pasa a la línea de tiempo de hoy.'],
            [guiaBoton('+ subtarea'), 'Divide una tarea en pasos.'],
        ],
        trucos: ['Los trabajos de Estudios aparecen solos aquí el día de su entrega.', 'Al completar una tarea queda constancia en el calendario.'],
    },
    {
        id: 'habitos', grupo: 'general', titulo: 'hábitos.',
        lema: 'Constancia sin presión.',
        intro: 'Lleva la cuenta de lo que quieres hacer a menudo. Sin puntos ni medallas: solo una cuadrícula de los últimos días y tu racha.',
        botones: [
            [guiaBoton('+ Hábito'), 'Crea uno nuevo.'],
            [guiaBoton('casilla'), 'Marca el hábito como hecho hoy.'],
            [guiaBoton('⋯'), 'Pausar (o reactivar) y eliminar.'],
        ],
        trucos: ['Los hábitos que vienen de un objetivo (desde su mandala o su paso kaizen) indican para qué objetivo son.'],
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
            [guiaBoton('Importar eventos'), 'Varios de golpe: pega texto o sube un archivo .ics de Google o Apple Calendar.'],
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
            [guiaBoton('+ Movimiento · Registro rápido'), 'Apunta un ingreso, gasto o traspaso. El rápido solo pide importe y concepto; la categoría se ajusta luego.'],
            [guiaBoton('Importar'), 'Sube o pega el extracto del banco (CSV o Excel). Bitácora reconoce los movimientos, evita duplicados y aplica tus reglas de traspaso.'],
            [guiaBoton('Categorías · Reglas'), 'Tus categorías de gasto e ingreso, y las reglas de traspaso: un movimiento importado cuyo concepto contenga cierto texto (por ejemplo, lo que mandas a tu cuenta de inversión) se registra como traspaso entre cuentas en vez de como gasto.'],
            [guiaBoton('⭳ Exportar'), 'Un resumen en texto pensado para pegarlo en una IA y pedirle consejo.'],
            [guiaBoton('3M · 6M · 1A · Todo'), 'Rango de la gráfica de saldo.'],
            [guiaBoton('Patrimonio → % · Objetivo. · saldos.'), 'En la tarjeta de Patrimonio: el porcentaje (o «Variación») abre cómo ha cambiado mes a mes; <b>Objetivo.</b> fija una meta y te dice cuánto falta; <b>saldos.</b> muestra el saldo de cada mes.'],
            [guiaBoton('ritmo.'), 'Cómo va tu gasto del mes comparado con lo normal en ti a estas alturas.'],
            [guiaBoton('largo plazo.'), 'Planifica cada mes tu sueldo y aportaciones, con historial, lista de deseos con semáforo e inversiones.'],
            [guiaBoton('metas.'), 'Huchas para objetivos de ahorro (fondo de emergencia, vacaciones...).'],
            [guiaBoton('recurrentes.'), 'Suscripciones y gastos fijos. Con «avisarme si no aparece en el banco» te avisa si un cargo no llega.'],
            [guiaBoton('programar gastos. · Buscar duplicados · Corregir registros'), 'Gastos futuros, limpieza de duplicados y ajuste a mano del histórico.'],
            [guiaBoton('✎ Renombrar / saldo inicial'), 'Cambia el nombre de una cuenta o su saldo de partida.'],
        ],
        trucos: ['Claude puede importar un extracto o registrar un gasto por ti; queda en la bandeja hasta que lo valides.'],
    },
    {
        id: 'trabajo', grupo: 'desarrollo', titulo: 'empleo.',
        lema: 'Tu vida laboral, ordenada.',
        intro: 'Tus empleos con empresa, puesto, fechas, sueldo, modalidad y motivo de salida, y los documentos de cada uno.',
        botones: [
            [guiaBoton('Importar Vida Laboral'), 'Sube el PDF de tu Informe de Vida Laboral de la Seguridad Social y Bitácora crea los empleos solos.'],
            [guiaBoton('crear mi cv.'), 'Un asistente por pasos: tus datos de contacto, qué hacías y qué aprendiste en cada empleo, tu formación, idiomas y habilidades, y un perfil que Bitácora te propone escrito. Al final descarga un CV en PDF, limpio y de una página.'],
            [guiaBoton('Descargar resumen (PDF)'), 'Un resumen de tu vida laboral: días trabajados, cotizados y cada empleo.'],
            [guiaBoton('rayo'), 'En Empleo, la captura rápida late para recordarte que puedes añadir un empleo.'],
        ],
        trucos: ['El trabajo actual aparece destacado arriba, y los días que trabajas salen en el calendario.', 'Lo que respondes en el CV se guarda: la próxima vez solo tienes que cambiar lo nuevo.', 'Si tienes activa Universidad, tu grado ya aparece en la formación del CV.'],
    },
    {
        id: 'estudios', grupo: 'desarrollo', titulo: 'estudios.',
        lema: 'Asignaturas, exámenes, trabajos y horario.',
        intro: 'Cada asignatura con sus exámenes y trabajos (fecha, peso y nota), tu horario semanal y notas rápidas.',
        botones: [
            [guiaBoton('+ asignatura'), 'Crea una asignatura (con créditos, para la nota media ponderada).'],
            [guiaBoton('+ (en la asignatura)'), 'Añade un examen o un trabajo.'],
            [guiaBoton('+ nota rápida · notas rápidas'), 'Apuntes sueltos, a mano.'],
            [guiaBoton('Horario semanal'), 'Tus clases por día y hora.'],
        ],
        trucos: ['Los exámenes salen en el calendario y los trabajos en el planificador el día de entrega.', 'Pide a Claude «añade el examen de X el día Y» y lo pondrá en su asignatura.'],
    },
    {
        id: 'universidad', grupo: 'desarrollo', titulo: 'universidad.',
        lema: 'Tu carrera entera, por cuatrimestres.',
        intro: 'Para quien estudia en la universidad: los créditos que llevas, la media del expediente, en qué semana del cuatrimestre estás, cuánto falta para los exámenes y qué necesitas sacar en cada asignatura para aprobar. Es un apartado opcional: actívalo en Ajustes → apartados. Con él activo, Estudios enseña solo las asignaturas del cuatrimestre actual.',
        pasos: ['Pulsa <b>configurar mi carrera.</b>: nombre del grado, créditos totales (240 normalmente), curso y cuatrimestre actual.', 'Ajusta en <b>fechas.</b> el inicio y fin de las clases, los exámenes y la extraordinaria de tu universidad.', 'En <b>···</b> de cada asignatura pon sus créditos y, cuando salga, la nota oficial del acta.'],
        botones: [
            [guiaBoton('+ asignatura.'), 'Añade una asignatura a ese cuatrimestre (también aparece en Estudios).'],
            [guiaBoton('···'), 'Créditos, nota oficial, cuatrimestre y si está convalidada.'],
            [guiaBoton('+ cuatrimestre.'), 'Añade el siguiente cuatrimestre (o uno ya pasado, para completar tu expediente).'],
            [guiaBoton('hacer actual. · pasar a él.'), 'Cambia al cuatrimestre nuevo. Cada cuatrimestre guarda su propio horario semanal.'],
        ],
        trucos: ['«necesitas un 5,7 en el 60% que queda» sale de los pesos y notas de los exámenes y trabajos de la asignatura.', 'La media del expediente se pondera por créditos y solo cuenta las asignaturas aprobadas, como la oficial.', 'Si tu carrera va por cursos completos y no por cuatrimestres, elige «curso completo» al configurarla. Si solo algunas asignaturas son anuales, márcalas como «anual» en ···: saldrán en los dos cuatrimestres del curso.', 'Sin Universidad activa, Estudios funciona igual que siempre (bachillerato, FP, oposiciones...): todas tus asignaturas juntas, sin cuatrimestres.'],
    },
    {
        id: 'documentos', grupo: 'desarrollo', titulo: 'documentos.',
        lema: 'Lo importante, a mano cuando lo necesitas.',
        intro: 'Dos cosas en un sitio: <b>fichas</b> (DNI, garantías, seguros, contratos... con su fecha de caducidad) y <b>archivos</b> (PDF o páginas HTML que subes).',
        botones: [
            [guiaBoton('+ ficha.'), 'Un documento con su tipo, fecha de caducidad y enlace. En ámbar si caduca en menos de un mes; en granate si ya caducó.'],
            [guiaBoton('subir archivo.'), 'Sube un PDF o HTML. También puedes arrastrarlo sobre la página.'],
            [guiaBoton('copias.'), 'Tus copias de seguridad automáticas.'],
            [guiaBoton('↓ · ✎ · ✕'), 'En cada archivo: descargar o ver, renombrar y borrar.'],
        ],
        trucos: ['Bitácora te avisa 30, 7 y 1 día antes de que caduque una ficha (si tienes las notificaciones activadas).'],
    },
    {
        id: 'objetivos', grupo: 'desarrollo', titulo: 'objetivos.',
        lema: 'Lo que quieres conseguir, y cómo.',
        intro: 'Objetivos a corto, medio y largo plazo: numéricos (con progreso, por ejemplo «leer 20 libros») o con hitos.',
        botones: [
            [guiaBoton('Lista · Tablero'), 'Por plazo o en columnas por estado.'],
            [guiaBoton('Método'), 'Cuatro prácticas japonesas para trabajar cada objetivo (debajo).'],
            [guiaBoton('mandala.'), 'Método Harada (el de Shohei Ohtani): el objetivo en el centro, ocho pilares y ocho acciones por pilar. <b>→ hábito.</b> convierte una acción en hábito.'],
            [guiaBoton('paso kaizen.'), 'El gesto más pequeño que te acerca, cada día. Se lleva como hábito con su racha.'],
            [guiaBoton('para qué.'), 'Por qué lo quieres, para ti y para los demás: lo que te sostiene cuando cuesta.'],
            [guiaBoton('hansei.'), 'Cada semana: qué salió bien, qué no y qué parte fue tuya, y qué cambias.'],
        ],
    },
    {
        id: 'proyectos', grupo: 'desarrollo', titulo: 'proyectos.',
        lema: 'Cosas grandes, en tareas.',
        intro: 'Cada proyecto con su lista de tareas; al marcarlas ves el progreso. Se pueden vincular a un objetivo. Es un apartado opcional: actívalo o quítalo en Ajustes → apartados.',
    },
    {
        id: 'enlaces', grupo: 'desarrollo', titulo: 'enlaces.',
        lema: 'Tus webs, sin veinte pestañas abiertas.',
        intro: 'Enlaces guardados por categoría, como accesos directos. Es un apartado opcional: actívalo o quítalo en Ajustes → apartados.',
        botones: [[guiaBoton('+ enlace · + categoría'), 'Guarda un enlace o crea una categoría para agruparlos. Pulsa tu nombre para cambiarlo.']],
        trucos: ['Claude puede guardar un enlace por ti.'],
    },
    {
        id: 'ocio', grupo: 'otros', titulo: 'ocio.',
        lema: 'Lo que lees, ves y juegas.',
        intro: 'Libros, películas, series y videojuegos, con estado, fechas, valoración y notas, y listas propias.',
        botones: [
            [guiaBoton('Libros · Series · Películas · Videojuegos · Listas'), 'Cada tipo en su pestaña.'],
            [guiaBoton('Importar Goodreads · Letterboxd'), 'Trae tu historial de esas webs.'],
            [guiaBoton('Recomendaciones'), 'Lo que te han recomendado tus amigos de Bitácora.'],
        ],
        trucos: ['Desde la ficha de una película o un libro puedes recomendarlo a un amigo.', 'Claude puede marcar algo como terminado y valorarlo, y se aplica solo.'],
    },
    {
        id: 'viajes', grupo: 'otros', titulo: 'viajes.',
        lema: 'Cada viaje, con todo dentro.',
        intro: 'Tus viajes y los lugares que quieres visitar. Cada viaje se abre en su gestor.',
        botones: [
            [guiaBoton('Resumen'), 'Acompañantes, notas, gasto total y cifras del viaje.'],
            [guiaBoton('Reservas'), 'Transportes (vuelos, trenes...: compañía, número, horarios, localizador, asiento) y alojamientos (dirección, entrada, salida, reserva).'],
            [guiaBoton('Lugares · Itinerario · Mapa'), 'Sitios que ver, el plan día a día y su mapa.'],
            [guiaBoton('Documentos · Listas'), 'Billetes y reservas en PDF, y listas de preparativos (maleta...).'],
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
            [guiaBoton('copiar. · ver pedido. · editar.'), 'Copiar el número, abrir el pedido en la tienda y cambiar sus datos o añadir una novedad.'],
            [guiaBoton('ver entregados.'), 'Los que ya llegaron.'],
        ],
        trucos: ['Para Vinted (InPost), pega el enlace de seguimiento del correo de envío en "enlace del pedido".', 'Amazon solo se puede seguir si te da el número del transportista (Correos, SEUR, GLS...); los envíos de Amazon Logistics no.', 'Si pasa la fecha estimada sin llegar, el pedido se marca en granate.'],
    },
    {
        id: 'coleccionables', grupo: 'otros', titulo: 'coleccionables.',
        lema: 'Tu colección y lo que vale.',
        intro: 'Un inventario por categorías con el valor de cada objeto. Para cartas, Bitácora busca su precio de mercado. Es un apartado opcional: actívalo en Ajustes → apartados.',
        botones: [
            [guiaBoton('+ coleccionable. · + categoría.'), 'Añade un objeto o una categoría.'],
            [guiaBoton('todas. · cartas. · ...'), 'Filtra por categoría.'],
            [guiaBoton('buscar · ordenar'), 'Por nombre, set o número, y orden por valor u otros criterios.'],
        ],
    },
    {
        id: 'amigos', grupo: 'otros', titulo: 'social.',
        lema: 'Bitácora con tu gente.',
        intro: 'Todo lo que haces con tus amigos en un sitio: gastos compartidos (como Tricount), eventos que les compartes y tu lista de amigos. Las recomendaciones de Ocio y los viajes compartidos también llegan de aquí.',
        pasos: ['En <b>amigos.</b>, genera tu código y compártelo, o escribe el de un amigo: le llegará una solicitud.', 'En <b>gastos.</b>, crea un grupo (un viaje, una cena, el piso) y elige quién está.', 'Cada vez que alguien pague algo, apúntalo con <b>+ gasto.</b>: lo ven y lo editan todos los del grupo.'],
        botones: [
            [guiaBoton('+ grupo.'), 'Nombre y quién está: tus amigos de Bitácora y, si hace falta, gente sin cuenta (solo con su nombre).'],
            [guiaBoton('+ gasto.'), 'Título, importe, fecha, quién pagó, categoría y para quién: a partes iguales, por partes (uno paga doble...) o por importes exactos.'],
            [guiaBoton('transferencia. · ingreso.'), 'Una transferencia es dinero que alguien da a otro para devolverlo; un ingreso es dinero que entra al grupo (una devolución, una fianza) y se reparte.'],
            [guiaBoton('mis gastos. · total del grupo. · mi saldo.'), 'Lo que te toca a ti, lo que se ha gastado en total y si te deben (verde) o debes (rojo).'],
            [guiaBoton('saldos. · cómo saldar.'), 'Cuánto debe o le deben a cada uno, y la forma de dejarlo a cero con los mínimos pagos. «pagado.» apunta ese pago.'],
            [guiaBoton('compartir un evento.'), 'Manda uno de tus próximos eventos a tus amigos; les llega para añadirlo a su calendario. También desde el botón «compartir.» de cada evento.'],
            [guiaBoton('salir del grupo. · borrar grupo para todos.'), 'Si sales y ya apareces en algún gasto, sigues con tu nombre para que las cuentas cuadren. Solo quien creó el grupo puede borrarlo.'],
            [guiaBoton('Tu nombre visible · código de amigo'), 'Cómo te ven tus amigos y tu código permanente para conectar.'],
        ],
        trucos: ['Los céntimos se reparten para que la suma cuadre siempre exacta.', 'Ideal para pisos compartidos: un grupo que no se cierra nunca y se salda cada mes.'],
    },
    {
        id: 'etiquetas', grupo: 'otros', titulo: 'etiquetas.',
        lema: 'Todo lo que comparte una etiqueta, junto.',
        intro: 'Cualquier entrada puede llevar etiquetas. Aquí ves cada una con cuántas entradas tiene y de qué tipos. Es un apartado opcional: actívalo o quítalo en Ajustes → apartados.',
        botones: [
            [guiaBoton('tarjeta'), 'Abre la etiqueta: sus entradas agrupadas por tipo.'],
            [guiaBoton('ver conexiones. · renombrar. · eliminar.'), 'Su constelación en Conexiones, cambiarle el nombre en todas partes o quitarla de todo.'],
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
        intro: 'Los cambios que piden Claude o ChatGPT (salvo eventos, entradas con QR y Ocio) no se aplican hasta que los validas. El número en granate del menú es lo que tienes pendiente.',
        botones: [
            [guiaBoton('validar cambio. · descartar.'), 'Aplica o rechaza un cambio.'],
            [guiaBoton('validar los N. · validar todo.'), 'Por grupo o todos de golpe.'],
            [guiaBoton('ver contenido.'), 'El detalle de lo que se va a aplicar (por ejemplo, las filas de un extracto).'],
            [guiaBoton('historial · deshacer.'), 'Todo lo que ha hecho Claude, con opción de deshacerlo.'],
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
            [guiaBoton('apartados. → perfil.'), '<b>estudiante.</b> (sin Empleo), <b>trabajador.</b> (sin Estudios ni exámenes) o <b>ambas.</b> Lo que no corresponde desaparece de menús, buscador e inicio móvil; sus datos se conservan.'],
            [guiaBoton('apartados opcionales.'), 'Apartados que no todo el mundo usa (envíos, proyectos, enlaces, etiquetas, conexiones y coleccionables): actívalos solo si los quieres.'],
            [guiaBoton('tus datos. → exportar. · importar.'), 'Todo en un archivo JSON para guardarlo aparte o recuperarlo.'],
            [guiaBoton('claude y chatgpt. · notificaciones.'), 'Conectar la IA y los avisos (ver sus secciones).'],
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
            'Puedes ver y restaurar copias en Documentos → <b>copias.</b> o en Centro resumen → copia de seguridad.',
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
