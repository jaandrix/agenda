// ============================================================
//  APUNTAR (el + de la barra del móvil y el rayo del escritorio)
//  Una línea que entiende lo que escribes, aunque sean varias cosas en una
//  frase, y enseña qué va a crear con cada una antes de guardarlo:
//    «gimnasio mañana a las 19»          → tarea del planificador
//    «dentista el jueves a las 5 y el viernes cena con Marta en La Pepita»
//                                        → dos eventos (salud y social, con lugar)
//    «café 2,40 €», «gasté 30 en gasolina en efectivo» → gasto con categoría
//    «comprar pan y leche», «se ha acabado el aceite»  → lista de la compra
//    «cumple de Ana el 3 de mayo»        → cumpleaños
//    «examen de estadística el 20», «entregar el trabajo de psicología el 25»
//                                        → examen / entrega en su asignatura
//    «gimnasio todos los lunes y jueves a las 19» → tarea que se repite
//    «clase de inglés los martes a las 18»       → horario de clases
//    «viaje a Lisboa del 3 al 7 de noviembre»    → viaje
//  Los tipos nuevos se crean con el aplicador del conector (aplicarOpConector),
//  así hacen lo mismo que si se lo pidieras a Claude y se pueden deshacer.
// ============================================================
let apuntarFechaBase = null;
// Lo que se va a apuntar (una o varias cosas) y el tipo elegido a mano en cada una.
let apuntarItems = [];
let apuntarElegidos = {};

const APUNTAR_DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const APUNTAR_DIAS_RE = '(domingos?|lunes|martes|miercoles|jueves|viernes|sabados?)';
const APUNTAR_DIA_CLAVE = { lunes: 'lun', martes: 'mar', miercoles: 'mie', jueves: 'jue', viernes: 'vie', sabado: 'sab', domingo: 'dom' };

function apuntarNorm(t) { return stripAccents(String(t || '').toLowerCase()); }

// Lee fecha, hora, importe y de qué se trata, y deja el resto como título.
// Entiende, entre otras: «ayer», «en 3 días», «dentro de 2 semanas», «la
// semana que viene», «el finde», «15/10/2026», «del 3 al 7 de noviembre»,
// «a las 7 de la tarde», «a la una», «19h», «7 pm», «a mediodía», «8 menos
// cuarto», «de 18 a 20», «esta tarde», «mañana por la mañana», «todos los
// lunes», «los martes y jueves», «cada 15 días», «gasté 12 en el cine»,
// «me han pagado 50», «en efectivo», «cumple de Ana», «examen de
// estadística», «entregar el trabajo de psicología», «clase de inglés»,
// «viaje a Lisboa», «se ha acabado el aceite», «recuérdame…», «nota: …».
const APUNTAR_NUMEROS = { una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20 };
const APUNTAR_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const APUNTAR_MESES_RE = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)';
// Citas que son evento aunque sean mañana, y su tipo de evento.
const APUNTAR_EVENTOS = [
    [/\b(medico|medica|dentista|consulta|revision|analisis|fisio|psicologo|psicologa|vacuna|hospital|urgencias|oculista|ginecolog)/, 'salud'],
    [/\b(cine|pelicula)\b/, 'cine'], [/\bteatro\b/, 'teatro'], [/\b(concierto|festival)\b/, 'concierto'],
    [/\b(partido|carrera|maraton|torneo)\b/, 'deportes'],
    [/\b(reunion|entrevista|presentacion|congreso|formacion|curso)\b/, 'trabajo'],
    [/\b(cena|comida con|almuerzo|desayuno con|quedada|quedar con|quedo con|boda|bautizo|comunion|fiesta|cumple(?:anos)? de .+ y)\b/, 'social'],
    [/\b(vuelo|tren|autobus a|ave a)\b/, 'viajes'],
];
// Categoría de un gasto por lo que dice el concepto (se busca entre las
// categorías del usuario por su nombre).
const APUNTAR_CATEGORIAS = [
    [/\b(super|supermercado|mercadona|lidl|carrefour|dia\b|aldi|alcampo|eroski|consum|hipercor|compra\b|fruteria|carniceria|panaderia)/, /comida|alimenta|super|compra/],
    [/\b(restaurante|cena|comida|almuerzo|desayuno|bar\b|cafe|cana|canas|copas?|menu|pizza|burger|kebab|sushi|tapas|vermut|glovo|uber eats|just eat)/, /restaur|comer fuera|bares|ocio|comida/],
    [/\b(gasolina|gasoil|diesel|taxi|cabify|uber|bus|autobus|metro|tren|renfe|parking|aparcamiento|peaje|bici|patinete|billete)/, /transport|coche|movil|gasolina/],
    [/\b(farmacia|medico|dentista|fisio|gimnasio|gym|psicolog|optica|seguro medico)/, /salud|deporte|cuidado/],
    [/\b(cine|concierto|entradas?|teatro|museo|libro|videojuego|netflix|spotify|hbo|disney|steam|playstation)/, /ocio|cultura|suscrip|entreten/],
    [/\b(ropa|zapatillas|zara|primark|camiseta|pantalon|abrigo|zapatos)/, /ropa|compras|moda/],
    [/\b(luz|agua|gas\b|internet|fibra|movil|telefono|alquiler|comunidad|hipoteca)/, /casa|hogar|vivienda|factura|suministro/],
    [/\b(regalo|regalos)\b/, /regalo/],
];

function apuntarFechaDe(base, k) { const d = new Date(base); d.setDate(d.getDate() + k); return isoLocal(d); }

// Importes dichos con palabras («veinticinco euros», «ciento veinte euros»):
// se pasan a cifras antes de leer el importe, igual que si se hubieran
// escrito con números. Solo delante de euros, € o pavos, para no tocar
// «tres cosas» ni títulos con números.
const APUNTAR_CIFRAS = {
    cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
    diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
    veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
    veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
    setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300,
    trescientas: 300, cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600,
    seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900, mil: 1000,
};
const APUNTAR_CIFRAS_RE = new RegExp(`\\b((?:(?:${Object.keys(APUNTAR_CIFRAS).sort((a, b) => b.length - a.length).join('|')})(?:\\s+y\\s+|\\s+))+)(?=(?:euros?|€|eur|pavos)\\b|€)`, 'g');

function apuntarCifraDe(palabras) {
    let total = 0, actual = 0;
    palabras.split(/\s+/).filter(p => p && p !== 'y').forEach(p => {
        const v = APUNTAR_CIFRAS[p];
        if (v === 1000) { total += (actual || 1) * 1000; actual = 0; }
        else actual += v;
    });
    return total + actual;
}

function apuntarCifrasEscritas(texto) {
    const norm = apuntarNorm(texto);
    if (norm.length !== texto.length) return texto;
    let salida = texto, desfase = 0;
    for (const m of norm.matchAll(APUNTAR_CIFRAS_RE)) {
        const cifra = String(apuntarCifraDe(m[1].trim())) + ' ';
        const ini = m.index + desfase;
        salida = salida.slice(0, ini) + cifra + salida.slice(ini + m[1].length);
        desfase += cifra.length - m[1].length;
    }
    return salida;
}

function interpretarApunte(texto) {
    let resto = apuntarCifrasEscritas(' ' + String(texto || '').trim() + ' ');
    const n = apuntarNorm(resto);
    const r = { fecha: apuntarFechaBase || todayISO(), fechaDicha: false, fechaFin: '', anioDicho: false, hora: '', horaFin: '', importe: null, ingreso: false, comprar: false, nota: false, titulo: '', recurrencia: null, cumple: false, estudio: null, clase: false, viaje: false, eventoTipo: '', lugar: '', cuenta: '', categoria: '', forzado: '', conGente: false };
    const quitar = (re) => { const m = apuntarNorm(resto).match(re); if (!m) return null; resto = resto.slice(0, m.index) + ' ' + resto.slice(m.index + m[0].length); return m; };

    quitar(/^\s*(?:y\s+)?(?:ademas|tambien|luego|despues|y|e)\s*,?\s+/);
    // La primera palabra puede decir qué es: «evento hoy comida con Lali a
    // las 13:30», «serie Los hombres de Paco», «leer el libro …».
    const OCIO_PALABRA = { serie: 'serie', peli: 'peli', pelicula: 'peli', libro: 'libro', videojuego: 'juego', juego: 'juego' };
    const dicho = quitar(/^\s*(evento|tarea|serie|peli|pelicula|libro|videojuego|juego)\s*:?\s+(?=\S)/)
        || quitar(/^\s*(?:ver|empezar|acabar|terminar)\s+(?:la\s+)?(serie|peli|pelicula)\s+(?=\S)/) || quitar(/^\s*leer\s+(?:el\s+)?(libro)\s+(?=\S)/) || quitar(/^\s*jugar\s+(?:al?\s+)?(videojuego|juego)\s+(?=\S)/);
    if (dicho) r.forzado = OCIO_PALABRA[dicho[1]] || dicho[1];
    // De Ocio solo interesa el título, tal cual (en «El día de mañana» no hay fecha).
    if (OCIO_PALABRA[dicho?.[1]]) {
        const ti = resto.replace(/\s+/g, ' ').trim();
        r.titulo = ti.charAt(0).toUpperCase() + ti.slice(1);
        return r;
    }
    // Qué es: prefijos que no forman parte del título.
    if (quitar(/^\s*(?:nota|idea|apunte|apuntar que)\s*:\s*/)) r.nota = true;
    quitar(/^\s*(?:recuerdame|recordarme|recordar|acuerdate de|no olvidar|no olvides|no te olvides de|tengo que|hay que|debo|apunta|apuntar|anota)\s+(?:que\s+)?/);
    if (quitar(/^\s*(?:anade|anadir|pon|apunta)?\s*(?:a|en)\s+la\s+(?:lista\s+de\s+la\s+)?compra\s*:?\s*/) || quitar(/\s+(?:a|en)\s+la\s+(?:lista\s+de\s+la\s+)?compra\s*$/)) r.comprar = true;
    // Lo que falta en casa va a la compra.
    if (quitar(/^\s*(?:falta|faltan|se (?:ha|han) acabado|se acabo|se acabaron|no (?:queda|quedan|hay)|queda poco|quedan pocos|quedan pocas|necesito|necesitamos)\s+(?:de\s+)?/)) r.comprar = true;

    let m = quitar(/[+]?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur(?:os)?\b|pavos\b)/) || quitar(/€\s*(\d+(?:[.,]\d{1,2})?)/);
    if (!m && (m = quitar(/\b(?:gaste|he gastado|pague|he pagado|me ha costado|me costo|cuesta|costo|cobre|he cobrado|me han pagado|me pagan|me ingresan|ingrese|ingreso de|bizum de)\s+(\d+(?:[.,]\d{1,2})?)\b/))) {
        resto = ' ' + m[0].replace(/\s*\d+(?:[.,]\d{1,2})?\s*$/, '') + ' ' + resto;
    }
    // «gasto 30 gasolina», «ingreso nómina 1500», «pagar alquiler 800 el 1»: la palabra de delante ya dice que
    // el número es dinero, aunque no lleve €. Se salta el que va tras «el», «día» o «a las» (es fecha u hora).
    if (!m && /^\s*(?:gasto|ingreso|pagar|cobrar)\b/.test(apuntarNorm(resto))) {
        m = quitar(/(?<!\b(?:el|dia|las|del|al|y)\s)\b(\d+(?:[.,]\d{1,2})?)\b(?!\s*(?::|h\b|de\s+[a-z]+\b(?<=enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)))/);
        if (m) quitar(/^\s*(?:gasto|ingreso)\b\s*(?:de\s+)?/);
    }
    if (m) { r.importe = Number(m[1].replace(',', '.')); r.ingreso = /^\s*\+/.test(m[0]) || /\b(cobr|ingres|nomina|me pagan|me han pagado|me ingresan|me devolvi|devolucion)/.test(n); }
    if (r.importe != null) {
        quitar(/^\s*(?:gaste|he gastado|pague|he pagado|me ha costado|me costo|cobre|he cobrado|me han pagado|me pagan|me ingresan|ingrese|bizum de)\b/);
        if (quitar(/\b(?:en|con|pagado en|pague en)\s+(?:efectivo|metalico|cash|billetes)\b/)) r.cuenta = 'efectivo';
        else if (quitar(/\b(?:con|en)\s+(?:la\s+)?(?:tarjeta|visa|bizum)\b/)) r.cuenta = 'tarjeta';
    }

    // Lo que se repite: «todos los días», «todos los lunes», «los martes y
    // jueves», «cada 15 días», «el día 5 de cada mes». Va antes que las
    // fechas, que si no se quedarían con el «lunes».
    const dias = '(?:domingos?|lunes|martes|miercoles|jueves|viernes|sabados?)';
    if (quitar(/\b(?:todos los dias|cada dia|a diario|diariamente)\b/)) r.recurrencia = { frecuencia: 'diaria' };
    else if ((m = quitar(new RegExp(`\\b(?:todos los|cada|los)\\s+(${dias}(?:\\s*(?:,|y)\\s*(?:los\\s+)?${dias})*)\\b`)))) {
        const lista = m[1].split(/\s*(?:,|y)\s*(?:los\s+)?/).map(x => x.replace(/s$/, '').replace('sabado', 'sabado').replace('domingo', 'domingo')).map(x => x === 'lune' ? 'lunes' : x === 'marte' ? 'martes' : x === 'miercole' ? 'miercoles' : x === 'jueve' ? 'jueves' : x === 'vierne' ? 'viernes' : x);
        r.recurrencia = { frecuencia: 'semanal', dias: [...new Set(lista.filter(x => APUNTAR_DIAS.includes(x)))] };
    } else if ((m = quitar(/\bcada\s+(\d{1,2}|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte)\s+dias\b/))) r.recurrencia = { frecuencia: 'intervalo', cada: /^\d+$/.test(m[1]) ? Number(m[1]) : APUNTAR_NUMEROS[m[1]] };
    else if ((m = quitar(/\b(?:el\s+)?(?:dia\s+)?(\d{1,2})\s+de\s+cada\s+mes\b/))) r.recurrencia = { frecuencia: 'mensual', diaMes: Number(m[1]) };
    else if (quitar(/\b(?:cada mes|todos los meses|mensualmente)\b/)) r.recurrencia = { frecuencia: 'mensual', diaMes: new Date().getDate() };

    // De qué se trata (se quita del texto lo que solo dice el tipo).
    if (quitar(/\b(?:es\s+el\s+)?(?:cumple|cumpleanos)\s+(?:de\s+)?/)) r.cumple = true;
    if ((m = quitar(/\b(examen|parcial|final|recuperacion|global|oral)\s+(?:de\s+|del\s+)?/))) r.estudio = { lista: 'exams', clase: m[1] };
    else if ((m = quitar(/\b(?:entregar|entrega(?:\s+de)?)\s+(?:el\s+|la\s+)?/))) r.estudio = { lista: 'assignments', clase: 'trabajo' };
    else if (/\b(trabajo|practica|ensayo|proyecto|memoria|informe)\s+de\s+/.test(apuntarNorm(resto)) && /\b(entreg|para el|hasta el)\b/.test(n)) r.estudio = { lista: 'assignments', clase: 'trabajo' };
    if (r.importe == null && quitar(/\bclases?\s+(?:de\s+)?(?=\S)/)) r.clase = true;
    if (quitar(/\b(?:viaje|viajo|me voy de viaje|me voy|escapada|vacaciones)\s+(?:a|para|en)\s+/)) r.viaje = true;
    const nn = apuntarNorm(resto);
    for (const [re, tipo] of APUNTAR_EVENTOS) if (re.test(nn)) { r.eventoTipo = tipo; break; }
    const accion = /^\s*(?:pedir|llamar|reservar|mandar|enviar|escribir|pagar|preparar|revisar|mirar|buscar|cancelar|confirmar|comprar|cambiar|anular)\b/.test(nn);
    if (accion) r.eventoTipo = '';
    // Quedar con alguien («café con Marta», «con mis padres») también es una cita.
    r.conGente = !accion && (/\bcon\s+[A-ZÁÉÍÓÚÑ]/.test(String(texto || '')) || /\bcon\s+(?:mi|mis|el|la|los|las)\s+(?:amig|famil|padres|madre|padre|novi|pareja|prim|compa|abuel|herman|tio|tia|jefe|equipo)/.test(nn));

    const base = new Date(todayISO() + 'T12:00:00');
    const dia = k => { r.fecha = apuntarFechaDe(base, k); r.fechaDicha = true; };
    const fechaDe = (d, mes, anio) => {
        const f = new Date(anio != null ? anio : base.getFullYear(), mes, d, 12);
        if (anio == null && isoLocal(f) < todayISO() && !r.cumple) f.setFullYear(f.getFullYear() + 1);
        return f;
    };
    // Momento del día (se usa como hora si no se dice otra).
    let momento = '';
    if ((m = quitar(/\b(?:por|de)\s+la\s+(manana|tarde|noche)\b/))) momento = m[1];
    else if ((m = quitar(/\besta\s+(manana|tarde|noche)\b/))) { momento = m[1]; dia(0); }
    else if (quitar(/\b(?:a|al)\s+medio\s?dia\b/)) momento = 'mediodia';

    // Del 3 al 7 de noviembre / del 3/11 al 7/11: fecha y fecha de fin. Sin mes, «temas del 3 al 5» no son días.
    const rangoSinFechas = /\b(?:temas?|capitulos?|paginas?|pags?|ejercicios?|lecciones?|unidades?|preguntas?)\s+del?\s+\d{1,2}\s+(?:al|hasta el)\s+\d{1,2}\b(?!\s*(?:\/|de\s))/.test(n);
    if (!rangoSinFechas && (m = quitar(new RegExp(`\\bdel?\\s+(\\d{1,2})(?:\\s*(?:\\/|de\\s+)(\\d{1,2}|${APUNTAR_MESES_RE.slice(1, -1)}))?\\s+(?:al|hasta el)\\s+(\\d{1,2})(?:\\s*(?:\\/|de\\s+)(\\d{1,2}|${APUNTAR_MESES_RE.slice(1, -1)}))?\\b`)))) {
        const mesDe = x => /^\d+$/.test(x) ? Number(x) - 1 : APUNTAR_MESES.indexOf(x);
        const d1 = Number(m[1]), d2 = Number(m[3]), cruza = d2 < d1;
        let ini, fin;
        if (m[4]) {
            const mesFin = mesDe(m[4]);
            ini = fechaDe(d1, m[2] ? mesDe(m[2]) : mesFin - (cruza && !m[2] ? 1 : 0));
            fin = new Date(ini.getFullYear() + (mesFin < ini.getMonth() ? 1 : 0), mesFin, d2, 12);
        } else {
            // Sin mes («del 3 al 7», «del 28 al 2»): el próximo día de inicio, este mes o el siguiente.
            const hoyD = new Date(todayISO() + 'T12:00:00');
            ini = new Date(hoyD.getFullYear(), hoyD.getMonth() + (d1 < hoyD.getDate() ? 1 : 0), d1, 12);
            fin = new Date(ini.getFullYear(), ini.getMonth() + (cruza ? 1 : 0), d2, 12);
        }
        r.fecha = isoLocal(ini); r.fechaFin = isoLocal(fin); r.fechaDicha = true;
    }
    else if (quitar(/\banteayer\b/)) dia(-2);
    else if (quitar(/\bayer\b/)) dia(-1);
    else if (quitar(/\bpasado\s+manana\b/)) dia(2);
    else if (quitar(/\bmanana\b/)) dia(1);
    else if (quitar(/\bhoy\b/)) dia(0);
    else if ((m = quitar(/\b(?:en|dentro\s+de)\s+(\d{1,2}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince)\s+(dias?|semanas?|mes(?:es)?)\b/))) {
        const cant = /^\d+$/.test(m[1]) ? Number(m[1]) : (APUNTAR_NUMEROS[m[1]] || 1);
        if (m[2].startsWith('mes')) { const d = new Date(base); d.setMonth(d.getMonth() + cant); r.fecha = isoLocal(d); r.fechaDicha = true; }
        else dia(cant * (m[2].startsWith('semana') ? 7 : 1));
    }
    else if (quitar(/\b(?:la\s+)?(?:semana\s+que\s+viene|proxima\s+semana|siguiente\s+semana)\b/)) dia(((1 - base.getDay() + 7) % 7) || 7);
    else if (quitar(/\b(?:este|el)\s+(?:finde|fin\s+de\s+semana)\b/)) dia((6 - base.getDay() + 7) % 7);
    else if (quitar(/\b(?:a\s+)?final(?:es)?\s+de\s+mes\b/)) { const d = new Date(base.getFullYear(), base.getMonth() + 1, 0, 12); r.fecha = isoLocal(d); r.fechaDicha = true; }
    else if (!r.recurrencia && (m = quitar(/\b(?:el\s+)?(?:proximo\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)(\s+que\s+viene|\s+proximo)?\b/))) {
        const objetivo = APUNTAR_DIAS.indexOf(m[1]);
        let k = (objetivo - base.getDay() + 7) % 7; if (k === 0) k = 7;
        dia(k);
    } else if ((m = quitar(new RegExp(`\\b(?:el\\s+(?:dia\\s+)?)?(\\d{1,2})\\s*(?:\\/|-|de\\s+)(\\d{1,2}|${APUNTAR_MESES_RE.slice(1, -1)})(?:\\s*(?:\\/|-|de\\s+)(\\d{4}|\\d{2}))?\\b`)))) {
        const mes = /^\d+$/.test(m[2]) ? Number(m[2]) - 1 : APUNTAR_MESES.indexOf(m[2]);
        const anio = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : null;
        r.anioDicho = anio != null;
        r.fecha = isoLocal(fechaDe(Number(m[1]), mes, anio)); r.fechaDicha = true;
    } else if ((m = quitar(/\bel\s+(?:dia\s+)?(\d{1,2})\b/))) {
        const d = new Date(base.getFullYear(), base.getMonth(), Number(m[1]), 12);
        if (isoLocal(d) < todayISO()) d.setMonth(d.getMonth() + 1);
        r.fecha = isoLocal(d); r.fechaDicha = true;
    }

    // Hora: «a las 19», «a la una y media», «19:30», «19h», «7 pm», «8 menos
    // cuarto», «de 18 a 20» (empieza y acaba), «sobre las 8».
    const num = '(\\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)';
    const reHora = new RegExp(`\\b(?:de|desde)?\\s*(?:a|sobre|hacia)?\\s*(?:las?\\s+)?${num}(?:\\s*[:.,h]\\s*(\\d{2})|\\s+y\\s+(media|cuarto)|\\s+menos\\s+(cuarto|\\d{1,2}))?(?:\\s*(am|pm|h\\b|de la (?:manana|tarde|noche|madrugada)))?(?:\\s+(?:a|hasta)\\s+(?:las?\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?)?`);
    const leerHora = mm => {
        let h = /^\d+$/.test(mm[1]) ? Number(mm[1]) : APUNTAR_NUMEROS[mm[1]];
        let min = mm[2] ? Number(mm[2]) : mm[3] === 'media' ? 30 : mm[3] === 'cuarto' ? 15 : 0;
        const dicha = h;
        if (mm[4]) { h -= 1; min = 60 - (mm[4] === 'cuarto' ? 15 : Number(mm[4])); if (h < 0) h = 23; }
        const suf = mm[5] || '';
        // «a la una», «a las 5» a secas casi siempre es por la tarde.
        // Y de 8 a 11, si el plan es de noche: «cena con Marta a las nueve».
        const deNoche = !suf && !momento && dicha >= 8 && dicha <= 11 && /\b(?:cena|cenar|cenamos|ceno|copas?|fiesta|concierto|discoteca|teatro)\b/.test(n);
        const tarde = /pm|tarde|noche/.test(suf) || (!suf && /tarde|noche/.test(momento)) || (!suf && !momento && !mm[2] && dicha >= 1 && dicha <= 7) || deNoche;
        if (tarde && h < 12) h += 12;
        if (/am|madrugada|manana/.test(suf) && h === 12) h = 0;
        return h < 24 && min < 60 ? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` : '';
    };
    const marcaHora = /\b(?:a|sobre|hacia|desde)\s+(?:las?\s+)?(?:\d|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)|\bde\s+\d{1,2}\s+a\s+\d|\b\d{1,2}\s*(?:[:.]\d{2}|h\b|am\b|pm\b)/;
    if (marcaHora.test(apuntarNorm(resto)) && (m = quitar(reHora)) && /\d|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce/.test(m[0])) {
        r.hora = leerHora(m);
        if (m[6] && r.hora) {
            let h2 = Number(m[6]);
            const h1 = Number(r.hora.slice(0, 2));
            if (h2 <= h1 && h2 + 12 < 24) h2 += 12;
            r.horaFin = `${String(h2).padStart(2, '0')}:${m[7] || '00'}`;
        }
    }
    if (!r.hora && momento) r.hora = { manana: '09:00', mediodia: '14:00', tarde: '17:00', noche: '21:00' }[momento];

    if (/^\s*(?:comprar|compra)\b/.test(apuntarNorm(resto))) { r.comprar = true; resto = resto.replace(/^\s*(?:comprar|compra)\b\s*:?/i, ''); }
    if (r.comprar) quitar(/^\s*(?:anade|anadir|pon|poner|mete|meter|apunta)\s+/);
    if (r.importe != null) quitar(/^\s*(?:en|de|del|por)\s+(?:el\s+|la\s+|los\s+|las\s+)?/);

    // El lugar de un evento: «en La Pepita», «en el Palacio de Deportes».
    if (!r.comprar && r.importe == null) {
        const lm = resto.match(/\s(?:en|al|a la)\s+((?:el|la|los|las)\s+)?([A-ZÁÉÍÓÚÑ][\wáéíóúñü'’.-]*(?:\s+(?:de(?:l)?\s+(?:la\s+)?)?[A-ZÁÉÍÓÚÑ0-9][\wáéíóúñü'’.-]*)*)/);
        if (lm && (r.eventoTipo || r.fechaDicha || r.hora)) { r.lugar = ((lm[1] || '') + lm[2]).trim(); resto = resto.replace(lm[0], ' '); }
    }
    const t = resto.replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').replace(/^(?:el|la|los|las)\s+(?=\S)/i, m2 => (r.estudio ? '' : m2)).replace(/\s+(?:a|el|en|para|de|y|con)$/i, '').trim();
    const t2 = r.comprar ? t.replace(/^(?:el|la|los|las|un|una|unos|unas|algo de|mas)\s+/i, '') : t;
    r.titulo = t2.charAt(0).toUpperCase() + t2.slice(1);

    // Categoría y cuenta de un gasto.
    if (r.importe != null && !r.ingreso && typeof financePro !== 'undefined') {
        const tn = apuntarNorm(r.titulo);
        for (const [re, nombre] of APUNTAR_CATEGORIAS) {
            if (!re.test(tn)) continue;
            const cat = (financePro.categories || []).find(c => c.type === 'expense' && nombre.test(apuntarNorm(c.name)));
            if (cat) { r.categoria = cat.id; break; }
        }
    }
    if (r.estudio && typeof studies !== 'undefined') r.asignatura = apuntarAsignatura(r.titulo);
    return r;
}

// La asignatura que nombra el texto (por sus palabras), entre las del curso.
function apuntarAsignatura(texto) {
    const lista = (typeof asignaturasEnCurso === 'function' ? asignaturasEnCurso() : null) || studies?.subjects || [];
    const tn = ' ' + apuntarNorm(texto) + ' ';
    let mejor = null, nota = 0;
    lista.forEach(s => {
        const palabras = apuntarNorm(s.name).split(/[^a-z0-9ñ]+/).filter(p => p.length > 3);
        if (!palabras.length) return;
        const dentro = palabras.filter(p => tn.includes(' ' + p) || tn.includes(p.slice(0, Math.max(5, p.length - 2)))).length;
        const v = dentro / palabras.length + (tn.includes(apuntarNorm(s.name)) ? 1 : 0);
        if (dentro && v > nota) { nota = v; mejor = s; }
    });
    return mejor;
}

// Una frase con varias cosas se parte donde empieza otra: una línea, un
// «;», un punto, o una coma o «y» seguida de una fecha o de un verbo de los
// que abren algo nuevo. «comprar pan, leche y huevos» o «cena con Marta y
// Pablo el viernes» siguen siendo una sola cosa.
const APUNTAR_ARRANQUE = new RegExp('^(?:' + [
    'hoy', 'manana', 'pasado manana', 'esta (?:manana|tarde|noche)', 'el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo|finde|fin de semana|dia \\d|\\d)', 'este (?:finde|fin de semana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)',
    'la semana que viene', 'en \\d+ dias', 'dentro de', 'todos los', 'cada ', 'los (?:lunes|martes|miercoles|jueves|viernes|sabados|domingos)',
    'comprar', 'compra ', 'falta', 'se (?:ha|han) acabado', 'no queda', 'gaste', 'he gastado', 'pague', 'he pagado', 'cobre', 'me han pagado', 'me pagan',
    'cumple', 'examen', 'parcial', 'entregar', 'entrega', 'clase', 'viaje', 'vuelo', 'reunion', 'cita', 'cena', 'comida', 'quedada', 'quedar', 'medico', 'dentista',
    'recuerdame', 'tengo que', 'hay que', 'llamar', 'escribir', 'mandar', 'enviar', 'pedir', 'reservar', 'pagar', 'ir a', 'ir al', 'nota:', 'idea:',
].join('|') + ')\\b');

function apuntarAnclado(t) {
    const r = interpretarApunte(t);
    return !!(r.fechaDicha || r.hora || r.recurrencia || r.importe != null);
}

function apuntarConFecha(t) {
    const r = interpretarApunte(t);
    return !!(r.fechaDicha || r.recurrencia);
}

function apuntarTrocear(texto) {
    const piezas = String(texto || '').replace(/([.!?])\s+(?=\S)/g, '$1\n').split(/\n+|;\s*/).map(x => x.trim()).filter(Boolean);
    const SEP = /\s*,\s*(?:y\s+)?|\s+y\s+(?:luego\s+|despu[eé]s\s+|tambi[eé]n\s+|adem[aá]s\s+)?|\s+(?:luego|despu[eé]s|adem[aá]s|tambi[eé]n)\s+/gi;
    const salida = [];
    piezas.forEach(p => {
        const trozos = p.split(SEP);
        const sep = p.match(SEP) || [];
        let actual = trozos[0];
        for (let k = 1; k < trozos.length; k++) {
            const sig = trozos[k];
            const largo = sig.trim().split(/\s+/).length >= 2;
            const arranca = largo && APUNTAR_ARRANQUE.test(apuntarNorm(sig).replace(/^(?:y|e)\s+/, ''));
            // También si cada trozo tiene su propia fecha, hora, repetición o
            // importe («examen el 28 a las 9, gimnasio todos los lunes a las 19»).
            // Salvo que siga una lista («los lunes y jueves», «el 3 y 5»).
            const sigue = /^(?:y\s+)?(?:los\s+)?(?:lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)\b|^(?:y\s+)?\d/.test(apuntarNorm(sig));
            // Con una «y» no basta la hora: «comida con Lali y Paco a las 13:30» es una sola cosa.
            const conY = !/,|;/.test(sep[k - 1] || '');
            const anclado = conY ? apuntarConFecha(actual) && apuntarConFecha(sig) : apuntarAnclado(actual) && apuntarAnclado(sig);
            if (actual.trim() && (arranca || (largo && !sigue && anclado))) { salida.push(actual.trim()); actual = sig; }
            else actual += (sep[k - 1] || ' ') + sig;
        }
        if (actual.trim()) salida.push(actual.trim().replace(/^(?:y|e)\s+/i, ''));
    });
    return salida.map(t => t.replace(/[.\s]+$/, '')).filter(Boolean).slice(0, 12);
}

// Qué se crearía con cada cosa, salvo que se elija otro tipo a mano.
function apuntarTipo(r, elegido) {
    if (elegido) return elegido;
    if (r.nota) return 'nota';
    if (r.forzado && (!APUNTAR_OCIO[r.forzado] || apartadoVisible('culture'))) return r.forzado;
    if (r.viaje && r.fechaDicha) return 'viaje';
    if (r.cumple && r.fechaDicha) return 'cumple';
    if (r.clase && r.recurrencia?.dias?.length && r.hora) return 'clase';
    if (r.recurrencia && !r.clase && r.importe == null) return 'recurrente';
    if (r.estudio && r.asignatura && r.fechaDicha && apartadoVisible('studies')) return r.estudio.lista === 'exams' ? 'examen' : 'trabajo';
    if (r.importe != null) return 'gasto';
    if (r.comprar && apartadoVisible('compra')) return 'compra';
    if ((r.eventoTipo || r.estudio || r.cumple || r.conGente) && (r.fechaDicha || r.hora)) return 'evento';
    // Con hora y sin un verbo delante («peluquería mañana a las 10») es una cita;
    // «llamar a Ana a las 5» o «estudiar a las 6» siguen siendo tareas.
    if (r.hora && !/^(?:ir\b|[a-zñ]{2,}(?:ar|er|ir)(?:me|te|se|le|lo|la|les|los)?\b)/.test(apuntarNorm(r.titulo))) return 'evento';
    const dias = Math.round((new Date(r.fecha + 'T12:00:00') - new Date(currentPlannerDayKey() + 'T12:00:00')) / 864e5);
    return dias >= 0 && dias <= 2 ? 'tarea' : 'evento';
}

function apuntarFechaTexto(iso) {
    const dias = Math.round((new Date(iso + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 864e5);
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'mañana';
    if (dias === 2) return 'pasado mañana';
    if (dias === -1) return 'ayer';
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', '');
}

const APUNTAR_TIPOS = [['tarea', 'tarea'], ['evento', 'evento'], ['gasto', 'gasto o ingreso'], ['compra', 'a la compra'], ['nota', 'nota'], ['cumple', 'cumpleaños'], ['examen', 'examen'], ['trabajo', 'trabajo o entrega'], ['recurrente', 'tarea que se repite'], ['clase', 'clase del horario'], ['viaje', 'viaje'], ['libro', 'libro'], ['serie', 'serie'], ['peli', 'película'], ['juego', 'videojuego']];
// Los tipos de Ocio y su entrada.
const APUNTAR_OCIO = { libro: 'book', serie: 'series', peli: 'movie', juego: 'game' };
const APUNTAR_DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function apuntarRecurrenciaTexto(rc) {
    if (!rc) return '';
    if (rc.frecuencia === 'diaria') return 'todos los días';
    if (rc.frecuencia === 'semanal') return 'cada ' + (rc.dias || []).map(d => APUNTAR_DIAS_CORTOS[APUNTAR_DIAS.indexOf(d)]).join(', ');
    if (rc.frecuencia === 'intervalo') return `cada ${rc.cada} días`;
    return `el día ${rc.diaMes} de cada mes`;
}

// Lo que se va a crear, en una línea, y si le falta algo para poder hacerlo.
function apuntarDescribir(r, tipo) {
    if (r.comprar && tipo !== 'compra' && r.titulo && !/^comprar\b/i.test(r.titulo)) r = { ...r, titulo: 'Comprar ' + r.titulo.charAt(0).toLowerCase() + r.titulo.slice(1) };
    const cuando = `${apuntarFechaTexto(r.fecha)}${r.hora ? ` a las ${r.hora}${r.horaFin ? '–' + r.horaFin : ''}` : ''}`;
    const tit = escapeHtml(r.titulo || '…');
    switch (tipo) {
        case 'gasto': return { texto: `${r.ingreso ? 'ingreso' : 'gasto'} de ${r.importe != null ? financeMoney(r.importe) : '—'}${r.titulo ? `, ${tit}` : ''}${r.categoria ? `, ${escapeHtml((financePro.categories.find(c => c.id === r.categoria)?.name || '').toLowerCase())}` : ''}${r.cuenta === 'efectivo' ? ', efectivo' : ''}${r.fechaDicha && r.fecha !== todayISO() ? ', ' + apuntarFechaTexto(r.fecha) : ''}`, falta: !(r.importe > 0) ? 'falta el importe' : '' };
        case 'compra': return { texto: `a la compra: ${tit}`, falta: r.titulo ? '' : 'falta qué comprar' };
        case 'nota': return { texto: `a la nota de hoy`, falta: '' };
        case 'cumple': return { texto: `cumpleaños de ${tit}, ${new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`, falta: !r.fechaDicha ? 'falta el día' : !r.titulo ? 'falta de quién' : '' };
        case 'examen': case 'trabajo': return { texto: `${tipo === 'examen' ? (r.estudio?.clase && r.estudio.clase !== 'examen' ? 'examen ' + r.estudio.clase : 'examen') : 'entrega'} de ${escapeHtml((r.asignatura?.name || '?').toLowerCase())}, ${cuando}`, falta: !r.asignatura ? 'no encuentro la asignatura' : !r.fechaDicha ? 'falta la fecha' : '' };
        case 'recurrente': return { texto: `${tit}, ${apuntarRecurrenciaTexto(r.recurrencia) || 'todos los días'}${r.hora ? ' a las ' + r.hora : ''}`, falta: r.titulo ? '' : 'falta qué hacer' };
        case 'clase': return { texto: `clase de ${tit}, ${apuntarRecurrenciaTexto(r.recurrencia)} a las ${r.hora || '?'}`, falta: !r.recurrencia?.dias?.length ? 'faltan los días' : !r.hora ? 'falta la hora' : '' };
        case 'viaje': return { texto: `viaje a ${tit}, ${apuntarFechaTexto(r.fecha)}${r.fechaFin ? ' → ' + apuntarFechaTexto(r.fechaFin) : ''}`, falta: r.titulo ? '' : 'falta el destino' };
        case 'libro': case 'serie': case 'peli': case 'juego': return { texto: `${{ libro: 'libro', serie: 'serie', peli: 'película', juego: 'videojuego' }[tipo]} para ocio: ${tit}`, falta: r.titulo ? '' : 'falta el título' };
        case 'evento': return { texto: `evento, ${cuando}${r.lugar ? ', ' + escapeHtml(r.lugar) : ''}, ${tit}`, falta: r.titulo ? '' : 'falta qué es' };
        default: return { texto: `tarea, ${cuando}${r.hora ? '' : ', sin hora'}, ${tit}`, falta: r.titulo ? '' : 'falta qué es' };
    }
}

function apuntarAnalizar() {
    const texto = document.getElementById('apuntar-texto')?.value || '';
    apuntarItems = apuntarTrocear(texto).map(t => ({ texto: t, r: interpretarApunte(t) }));
}

let apuntarPintando = 0;
function pintarVistaApunte() {
    cancelAnimationFrame(apuntarPintando);
    apuntarPintando = requestAnimationFrame(pintarVistaApunteYa);
}

function pintarVistaApunteYa() {
    const caja = document.getElementById('apuntar-vista');
    if (!caja) return;
    apuntarAnalizar();
    if (!apuntarItems.length) {
        caja.innerHTML = APUNTAR_PISTA;
        return;
    }
    const tipos = APUNTAR_TIPOS.filter(([k]) => (k !== 'compra' || apartadoVisible('compra')) && (!['examen', 'trabajo', 'clase'].includes(k) || apartadoVisible('studies')) && (!APUNTAR_OCIO[k] || apartadoVisible('culture')));
    caja.innerHTML = `${apuntarItems.length > 1 ? `<div class="apuntar-varias">${apuntarItems.length} cosas.</div>` : ''}${apuntarItems.map((it, k) => {
        const tipo = apuntarTipo(it.r, apuntarElegidos[k]);
        const d = apuntarDescribir(it.r, tipo);
        const nada = !apuntarElegidos[k] && tipo === 'tarea' && !it.r.fechaDicha && !it.r.hora && it.r.importe == null && !it.r.comprar && !it.r.nota && !it.r.estudio && !it.r.cumple;
        return `<div class="apuntar-item ${d.falta ? 'incompleto' : ''}">
            <i class="apuntar-item-ico">${APUNTAR_ICONOS[APUNTAR_ICONO_DE[tipo] || 'tarea']}</i>
            <div class="apuntar-item-cuerpo">
                <div class="apuntar-resumen">${d.texto}</div>
                ${d.falta ? `<small class="apuntar-falta">${d.falta}.</small>` : nada ? '<small class="apuntar-falta">Sin fecha ni hora: irá como tarea para hoy.</small>' : ''}
            </div>
            <select class="apuntar-item-tipo" aria-label="Cambiar el tipo" onchange="apuntarElegidos[${k}]=this.value;pintarVistaApunte()">${tipos.map(([v, t]) => `<option value="${v}" ${v === tipo ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>`;
    }).join('')}`;
}

const APUNTAR_PISTA = '<span class="apuntar-pista">Escribe como hablas: «cena con Marta el viernes a las 9», «serie Los hombres de Paco», «gasté 12 en gasolina».</span>';
const APUNTAR_ICONO_DE = { tarea: 'tarea', evento: 'evento', gasto: 'gasto', compra: 'compra', nota: 'nota', cumple: 'cumple', examen: 'examen', trabajo: 'tarea', recurrente: 'rutina', clase: 'ocio', viaje: 'viaje', libro: 'ocio', serie: 'ocio', peli: 'ocio', juego: 'ocio' };

// Lo que se escribe en «apuntar.» se guarda en el dispositivo hasta apuntarlo: si iOS cierra la app o se toca
// fuera, al volver sigue ahí. Solo en este dispositivo, nunca en la nube, y caduca a los tres días.
const apuntarClaveBorrador = () => 'bitacora-apuntar-borrador-' + (copiaUid || '');
let apuntarBorradorTemporizador = null;
function apuntarGuardarBorrador(texto) {
    clearTimeout(apuntarBorradorTemporizador);
    apuntarBorradorTemporizador = setTimeout(() => {
        try {
            if (texto.trim()) localStorage.setItem(apuntarClaveBorrador(), JSON.stringify({ texto, actualizado: Date.now() }));
            else localStorage.removeItem(apuntarClaveBorrador());
        } catch (_) { /* sin almacenamiento */ }
    }, 200);
}
function apuntarLeerBorrador() {
    try {
        const b = JSON.parse(localStorage.getItem(apuntarClaveBorrador()) || 'null');
        if (b?.texto && Date.now() - b.actualizado < 3 * 864e5) return b.texto;
        localStorage.removeItem(apuntarClaveBorrador());
    } catch (_) { /* sin almacenamiento */ }
    return '';
}
function apuntarDescartarBorrador() {
    clearTimeout(apuntarBorradorTemporizador);
    try { localStorage.removeItem(apuntarClaveBorrador()); } catch (_) { /* sin almacenamiento */ }
    const t = document.getElementById('apuntar-texto');
    if (t) t.value = '';
    document.querySelector('.apuntar-borrador')?.remove();
    apuntarElegidos = {};
    pintarVistaApunteYa();
}

function openApuntar(fecha) {
    apuntarFechaBase = fecha || null;
    const borrador = apuntarLeerBorrador();
    apuntarElegidos = {};
    apuntarItems = [];
    const accesos = [
        ['tarea.', 'tarea', `closeModal();plannerDayOffset=${Math.min(2, Math.max(0, Math.round((new Date((fecha || todayISO()) + 'T12:00:00') - new Date(currentPlannerDayKey() + 'T12:00:00')) / 864e5)))};openAddPlannerItem()`],
        ['evento.', 'evento', `closeModal();openNewEntry('event');${fecha ? `setTimeout(()=>{const f=document.getElementById('modal-date');if(f)f.value='${fecha}'},60)` : ''}`],
        ['gasto.', 'gasto', 'closeModal();openFinanceProQuickCaptureModal()'],
        ['nota.', 'nota', 'closeModal();openWriteNote()'],
        ...(apartadoVisible('compra') ? [['compra.', 'compra', "closeModal();(mobileStandaloneActive?mobileIr:switchView)('compra')"]] : []),
        ['rutina.', 'rutina', 'closeModal();openAddHabit()'],
        ['ocio.', 'ocio', "closeModal();openNewEntry('book')"],
        ['viaje.', 'viaje', "closeModal();openNewEntry('travel')"],
    ];
    showModal(`
        <div class="modal-title">apuntar${fecha && fecha !== todayISO() ? ` para ${apuntarFechaTexto(fecha)}` : ''}.</div>
        <textarea id="apuntar-texto" class="modal-input apuntar-texto" rows="2" placeholder="dentista mañana a las 5 y comprar pan..." oninput="apuntarElegidos={};pintarVistaApunte();apuntarGuardarBorrador(this.value)" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();guardarApunte()}">${escapeHtml(borrador)}</textarea>
        ${borrador ? '<div class="apuntar-borrador">Lo que dejaste a medias. <button class="m-enlace" onclick="apuntarDescartarBorrador()">descartar.</button></div>' : ''}
        <div id="apuntar-vista" class="apuntar-vista">${borrador ? '' : APUNTAR_PISTA}</div>
        <button class="btn-modal-primary" onclick="guardarApunte()">apuntar.</button>
        <div class="apuntar-o">o elige qué quieres apuntar</div>
        <div class="apuntar-rejilla">${accesos.map(([t, icono, accion]) => `<button onclick="${accion}"><i>${APUNTAR_ICONOS[icono]}</i><span>${t}</span></button>`).join('')}</div>
        <button class="m-enlace apuntar-todos" onclick="closeModal();window._dayPrefillDate=apuntarFechaBase;openCommandPalette('create');window._dayPrefillDate=apuntarFechaBase">todos los tipos.</button>
        ${apuntesRecientes.length ? `<button class="m-enlace apuntar-todos" onclick="openApuntesRecientes()">lo último que apuntaste.</button>` : ''}
    `);
    document.querySelector('#modal-container .modal-sheet')?.classList.add('hoja-apuntar');
    // Lo último apuntado ya no se enseña solo al acabar de subir la hoja: al aparecer, la hoja crecía y se recortaba
    // (un tirón en cada apertura). Ahora es un enlace, y la hoja tiene su altura desde el primer fotograma.
    if (borrador) pintarVistaApunteYa();
    enfocarSiTeclado(() => document.getElementById('apuntar-texto'));
}

// Crea una cosa. Devuelve { aviso, hecho } o { error }.
function apuntarCrear(texto, r, tipo) {
    if (r.comprar && tipo !== 'compra' && r.titulo && !/^comprar\b/i.test(r.titulo)) r = { ...r, titulo: 'Comprar ' + r.titulo.charAt(0).toLowerCase() + r.titulo.slice(1) };
    const id = p => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const conector = (op, prefijo) => {
        const ref = id(prefijo);
        const l = aplicarOpConector(op, ref);
        if (!l) return { error: 'no se pudo apuntar' };
        registrarLineaConector(l, 'apuntar');
        return { aviso: l.resumen.charAt(0).toUpperCase() + l.resumen.slice(1), hecho: { tipo: 'conector', ref } };
    };
    if (tipo === 'gasto') {
        if (!(r.importe > 0)) return { error: 'falta el importe' };
        const ultima = [...(financePro.transactions || [])].reverse().find(t => t.manual && t.account)?.account;
        const cuenta = r.cuenta === 'efectivo' && FINANCE_PRO_ACCOUNT_KEYS.includes('efectivo') ? 'efectivo' : FINANCE_PRO_ACCOUNT_KEYS.includes(ultima) ? ultima : FINANCE_PRO_ACCOUNT_KEYS.includes('bancos') ? 'bancos' : FINANCE_PRO_ACCOUNT_KEYS[0];
        const txId = id('ptx_q');
        financePro.transactions.push({ id: txId, date: r.fechaDicha ? r.fecha : todayISO(), hora: financeProHoraAhora(r.fechaDicha ? r.fecha : todayISO()), account: cuenta, type: r.ingreso ? 'income' : 'expense', amount: r.importe, note: r.titulo || undefined, category: r.categoria || undefined, needsReview: !r.categoria, manual: true });
        return { aviso: `${r.ingreso ? 'Ingreso' : 'Gasto'} de ${financeMoney(r.importe)} en ${financePro.accounts[cuenta]?.name || cuenta}${r.categoria ? '' : '. Ponle categoría en Finanzas'}`, hecho: { tipo: 'gasto', txId } };
    }
    if (tipo === 'compra') {
        const lista = compraListaActual();
        const cosas = (r.titulo || texto).split(/\n|,(?!\d)|\s+y\s+/).map(x => x.trim()).filter(Boolean);
        cosas.forEach(c => compraAnadir(c, true));
        return { aviso: `A la compra: ${cosas.join(', ').toLowerCase()}`, hecho: { tipo: 'compra', listaId: lista.id, textos: cosas.map(c => compraInterpretar(c).texto) } };
    }
    if (tipo === 'nota') {
        const hoy = todayISO();
        let nota = notes.find(x => x.date === hoy);
        if (!nota) { nota = { id: 'note_' + Date.now(), date: hoy, content: '', createdAt: new Date().toISOString() }; notes.push(nota); }
        const anadido = (r.nota ? texto.replace(/^\s*(?:nota|idea|apunte|apuntar que)\s*:\s*/i, '') : texto).trim();
        nota.content = [nota.content, anadido].filter(Boolean).join('\n\n');
        return { aviso: 'A la nota de hoy', hecho: { tipo: 'nota', notaId: nota.id, texto: anadido } };
    }
    if (tipo === 'cumple') {
        if (!r.titulo) return { error: 'falta de quién es' };
        const md = r.fecha.slice(5);
        return conector({ tipo: 'entrada_crear', entryType: 'birthday', datos: { title: r.titulo, firstName: r.titulo, lastName: '', birthDate: r.anioDicho ? r.fecha : `2000-${md}`, date: r.anioDicho ? r.fecha : `2000-${md}`, sinAnio: !r.anioDicho || undefined, tags: [] } }, 'ap_cumple');
    }
    if (tipo === 'examen' || tipo === 'trabajo') {
        const asig = r.asignatura || apuntarAsignatura(r.titulo);
        if (!asig) return { error: 'no encuentro la asignatura' };
        const lista = tipo === 'examen' ? 'exams' : 'assignments';
        const titulo = tipo === 'examen' ? (r.estudio?.clase && r.estudio.clase !== 'examen' ? 'Examen ' + r.estudio.clase : 'Examen') : (r.titulo && apuntarNorm(r.titulo) !== apuntarNorm(asig.name) ? r.titulo : 'Entrega');
        return conector({ tipo: 'estudio_crear', subjectId: asig.id, lista, item: { title: titulo, date: r.fecha, time: r.hora || '' } }, 'ap_est');
    }
    if (tipo === 'recurrente') {
        if (!r.titulo) return { error: 'falta qué hacer' };
        const rc = r.recurrencia || { frecuencia: 'diaria' };
        const datos = { texto: r.titulo, frecuencia: rc.frecuencia };
        if (rc.frecuencia === 'semanal') datos.diasSemana = (rc.dias || []).map(d => APUNTAR_DIAS.indexOf(d)).filter(x => x >= 0);
        if (rc.frecuencia === 'mensual') datos.diaMes = rc.diaMes;
        if (rc.frecuencia === 'intervalo') { datos.intervaloDias = Math.max(2, rc.cada || 2); datos.intervaloInicio = r.fechaDicha ? r.fecha : todayISO(); }
        if (r.hora) datos.hora = r.hora;
        return conector({ tipo: 'tarea_recurrente', accion: 'crear', datos }, 'ap_rec');
    }
    if (tipo === 'clase') {
        const dias = r.recurrencia?.dias || [];
        if (!dias.length || !r.hora) return { error: !dias.length ? 'faltan los días' : 'falta la hora' };
        const res = dias.map(d => conector({ tipo: 'clase', accion: 'anadir', dia: APUNTAR_DIA_CLAVE[d], hora: r.hora, texto: r.titulo }, 'ap_clase'));
        const bien = res.filter(x => !x.error);
        if (!bien.length) return { error: 'ya estaba en el horario' };
        return { aviso: `Clase de ${r.titulo.toLowerCase()} ${apuntarRecurrenciaTexto(r.recurrencia)} a las ${r.hora}`, hecho: { tipo: 'conector', refs: bien.map(x => x.hecho.ref) } };
    }
    if (APUNTAR_OCIO[tipo]) {
        if (!r.titulo) return { error: 'falta el título' };
        const hoy = todayISO();
        const entryType = APUNTAR_OCIO[tipo];
        const datos = entryType === 'movie' ? { date: hoy, rating: 0, notes: '' } : { status: { book: 'Leyendo', series: 'Viendo', game: 'Jugando' }[entryType], startDate: hoy, date: hoy, endDate: '', rating: 0 };
        return conector({ tipo: 'ocio', entryType, titulo: r.titulo, datos }, 'ap_ocio');
    }
    if (tipo === 'viaje') {
        if (!r.titulo) return { error: 'falta el destino' };
        const destino = r.titulo;
        return conector({ tipo: 'entrada_crear', entryType: 'travel', datos: { title: 'Viaje a ' + destino, destination: destino, startDate: r.fecha, endDate: r.fechaFin || r.fecha, date: r.fecha, tags: [] } }, 'ap_viaje');
    }
    if (!r.titulo) return { error: 'falta qué es' };
    const dias = Math.round((new Date(r.fecha + 'T12:00:00') - new Date(currentPlannerDayKey() + 'T12:00:00')) / 864e5);
    if (tipo === 'tarea' && dias >= 0 && dias <= 2) {
        const tareaId = id('planner');
        plannerItemsForOffset(dias).push({ id: tareaId, time: r.hora, title: r.titulo, notes: '', done: false });
        return { aviso: `Tarea para ${apuntarFechaTexto(r.fecha)}${r.hora ? ' a las ' + r.hora : ''}`, hecho: { tipo: 'tarea', tareaId } };
    }
    const eventoId = id('evt');
    const eventType = r.eventoTipo || (r.estudio ? 'estudios' : 'otro');
    entries.push({ id: eventoId, type: 'event', categoryId: getCategoryIdForType('event'), tags: [], eventType, title: r.titulo, date: r.fecha, time: r.hora, place: r.lugar || '', notes: r.horaFin ? `hasta las ${r.horaFin}` : '' });
    filteredEntries = [...entries];
    const cuandoTxt = apuntarFechaTexto(r.fecha);
    return { aviso: `Evento ${/^(hoy|mañana|pasado mañana|ayer)$/.test(cuandoTxt) ? '' : 'el '}${cuandoTxt}${r.hora ? ' a las ' + r.hora : ''}`, hecho: { tipo: 'evento', eventoId } };
}

async function guardarApunte() {
    const textoEl = document.getElementById('apuntar-texto');
    if (!textoEl?.value.trim()) { showToast('Escribe qué quieres apuntar', true); return; }
    apuntarAnalizar();
    const hechos = [], fallos = [];
    apuntarItems.forEach((it, k) => {
        const tipo = apuntarTipo(it.r, apuntarElegidos[k]);
        const res = apuntarCrear(it.texto, it.r, tipo);
        if (res.error) { fallos.push(`«${it.texto}»: ${res.error}`); return; }
        apuntarRegistrar(it.texto, tipo, res.aviso, res.hecho);
        hechos.push({ tipo, aviso: res.aviso });
    });
    if (!hechos.length) { showToast(fallos[0] ? fallos[0].charAt(0).toUpperCase() + fallos[0].slice(1) : 'No he podido apuntarlo', true); return; }
    clearTimeout(apuntarBorradorTemporizador);
    try { localStorage.removeItem(apuntarClaveBorrador()); } catch (_) { /* sin almacenamiento */ }
    closeModal();
    invalidarCachesDerivadas();
    render();
    if (hechos.length === 1 && !fallos.length) showToast(hechos[0].aviso);
    else showToast(`${hechos.length} ${hechos.length === 1 ? 'cosa apuntada' : 'cosas apuntadas'}: ${hechos.map(h => (APUNTAR_TIPO_NOMBRE[h.tipo] || h.tipo)).join(', ')}${fallos.length ? `. Sin apuntar: ${fallos.join('; ')}` : '.'}`, !!fallos.length);
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

// ---- registro de lo apuntado: revisar, deshacer o cambiar de tipo ----
const APUNTES_MAX = 40;
const APUNTAR_TIPO_NOMBRE = { tarea: 'tarea', evento: 'evento', gasto: 'gasto', compra: 'compra', nota: 'nota', cumple: 'cumpleaños', examen: 'examen', trabajo: 'entrega', recurrente: 'tarea que se repite', clase: 'clase', viaje: 'viaje', libro: 'libro', serie: 'serie', peli: 'película', juego: 'videojuego' };

function apuntarRegistrar(texto, tipo, resumen, deshacer) {
    apuntesRecientes = [{ id: 'apn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), cuando: new Date().toISOString(), texto: String(texto || '').trim(), tipo, resumen, deshacer }, ...apuntesRecientes].slice(0, APUNTES_MAX);
}

function apuntarFilaRegistro(a) {
    const cuando = new Date(a.cuando);
    const hoy = isoLocal(cuando) === todayISO();
    return `<div class="apuntar-reg">
        <div class="apuntar-reg-txt"><b>${escapeHtml(a.texto)}</b><small>${escapeHtml(APUNTAR_TIPO_NOMBRE[a.tipo] || a.tipo)}, ${hoy ? cuando.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : cuando.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}${a.deshecho ? ', deshecho' : ''}</small></div>
        ${a.deshecho ? '' : `<button class="profe-chip" onclick="cambiarApunte('${a.id}')" title="Deshacerlo y volver a escribirlo">cambiar.</button><button class="profe-chip" onclick="deshacerApunte('${a.id}')">deshacer.</button>`}
    </div>`;
}

function openApuntesRecientes() {
    showModal(`
        <div class="modal-title">lo que has apuntado.</div>
        <p class="finance-modal-note" style="margin-top:0">Lo último que apuntaste con el + o el rayo, en cualquier dispositivo. <b>deshacer.</b> lo borra de donde se guardó; <b>cambiar.</b> lo borra y te lo deja escrito para elegir otro tipo.</p>
        ${apuntesRecientes.map(apuntarFilaRegistro).join('') || '<div class="finance-empty-line">Nada todavía.</div>'}
    `);
}

// Quita lo que creó el apunte. Devuelve false si ya no existe.
function apuntarQuitar(dh) {
    if (!dh) return false;
    if (dh.tipo === 'tarea') {
        resetDayPlannerIfNeeded();
        let ok = false;
        Object.keys(dayPlanner.days || {}).forEach(k => { const antes = (dayPlanner.days[k] || []).length; dayPlanner.days[k] = (dayPlanner.days[k] || []).filter(i => i.id !== dh.tareaId); ok = ok || dayPlanner.days[k].length !== antes; });
        return ok;
    }
    if (dh.tipo === 'evento') {
        const antes = entries.length;
        entries = entries.filter(e => e.id !== dh.eventoId);
        filteredEntries = [...entries];
        return entries.length !== antes;
    }
    if (dh.tipo === 'gasto') {
        const antes = financePro.transactions.length;
        financePro.transactions = financePro.transactions.filter(t => t.id !== dh.txId);
        return financePro.transactions.length !== antes;
    }
    if (dh.tipo === 'compra') {
        const l = datosCompra().listas.find(x => x.id === dh.listaId);
        if (!l) return false;
        const fuera = new Set((dh.textos || []).map(t => t.toLowerCase()));
        const antes = l.items.length;
        l.items = l.items.filter(i => i.hecho || !fuera.has(i.texto.toLowerCase()));
        return l.items.length !== antes;
    }
    if (dh.tipo === 'nota') {
        const n = notes.find(x => x.id === dh.notaId);
        if (!n || !dh.texto) return false;
        const i = n.content.lastIndexOf(dh.texto);
        if (i < 0) return false;
        n.content = (n.content.slice(0, i) + n.content.slice(i + dh.texto.length)).replace(/\n{3,}/g, '\n\n').trim();
        return true;
    }
    return false;
}

async function deshacerApunte(id) {
    const a = apuntesRecientes.find(x => x.id === id);
    if (!a || a.deshecho) return;
    if (a.deshacer?.tipo === 'conector') {
        for (const ref of (a.deshacer.refs || [a.deshacer.ref])) await deshacerConector(ref, true);
        a.deshecho = true;
        closeModal();
        render();
        return;
    }
    const ok = apuntarQuitar(a.deshacer);
    a.deshecho = true;
    invalidarCachesDerivadas();
    closeModal();
    render();
    showToast(ok ? 'Deshecho' : 'Ya no estaba: lo habrías borrado o cambiado antes');
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

async function cambiarApunte(id) {
    const a = apuntesRecientes.find(x => x.id === id);
    if (!a || a.deshecho) return;
    if (a.deshacer?.tipo === 'conector') { for (const ref of (a.deshacer.refs || [a.deshacer.ref])) await deshacerConector(ref, true); }
    else apuntarQuitar(a.deshacer);
    a.deshecho = true;
    invalidarCachesDerivadas();
    render();
    openApuntar();
    const t = document.getElementById('apuntar-texto');
    if (t) { t.value = a.texto; pintarVistaApunte(); }
    saveData().catch(e => console.error(e));
}

const APUNTAR_ICONOS = {
    cumple: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M46 6h8l4 12a8 8 0 1 1-16 0z"/><rect x="44" y="30" width="12" height="18" rx="3"/><path d="M12 54a8 8 0 0 1 8-8h60a8 8 0 0 1 8 8v12c-6 0-8 6-13 6s-7-6-13-6-8 6-13 6-7-6-13-6-8 6-13 6-7-6-12-6z"/><path d="M12 74c6 0 8 6 13 6s7-6 13-6 8 6 13 6 7-6 13-6 8 6 13 6 7-6 11-6v20H12z"/></svg>',
    examen: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M20 6h60a8 8 0 0 1 8 8v72a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8V14a8 8 0 0 1 8-8zm8 18v10h44V24zm0 20v10h28V44zm6 34 24-24 8 8-24 24-14 2z"/></svg>',
    tarea: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="17" cy="22" r="9"/><rect x="34" y="16" width="58" height="12" rx="6"/><circle cx="17" cy="50" r="9"/><rect x="34" y="44" width="46" height="12" rx="6"/><circle cx="17" cy="78" r="9"/><rect x="34" y="72" width="52" height="12" rx="6"/></svg>',
    evento: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M24 8h12v10h28V8h12v10h6a10 10 0 0 1 10 10v54a10 10 0 0 1-10 10H18A10 10 0 0 1 8 82V28a10 10 0 0 1 10-10h6zM20 40v40h60V40z"/><rect x="30" y="50" width="16" height="16" rx="4"/></svg>',
    gasto: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M50 6a44 44 0 1 1 0 88 44 44 0 0 1 0-88zM30 38v11h40V38zm0 16v11h40V54z"/></svg>',
    nota: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M18 6h48l22 22v56a10 10 0 0 1-10 10H18A10 10 0 0 1 8 84V16A10 10 0 0 1 18 6zm6 40v10h52V46zm0 20v10h40V66zM60 10v24h24z"/></svg>',
    compra: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M6 12h16l12 50h48l10-36H32l-3-14z"/><circle cx="40" cy="82" r="8"/><circle cx="76" cy="82" r="8"/></svg>',
    rutina: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M50 6a44 44 0 1 1 0 88 44 44 0 0 1 0-88zm0 14a30 30 0 1 0 0 60 30 30 0 0 0 0-60z"/><circle cx="50" cy="50" r="12"/></svg>',
    ocio: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M10 14h34a10 10 0 0 1 10 10v66a8 8 0 0 0-8-8H10zM90 14H62a8 8 0 0 0-8 8v68a8 8 0 0 1 8-8h28z"/></svg>',
    viaje: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M50 4l10 34 32 14v10L58 52 54 80l10 8v8L50 90l-14 6v-8l10-8-4-28-34 10V52l32-14z"/></svg>',
};
