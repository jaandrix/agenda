        // ============================================================
        //  SERVICIOS PÚBLICOS: lo que Bitácora sabe sin que lo apuntes.
        //  Festivos y puentes de tu comunidad (Nager.Date), el precio de la
        //  luz por horas (Red Eléctrica), la ficha del destino de cada viaje
        //  (Open-Meteo, Frankfurter, Nager.Date) y tu día en una ficha.
        //  Los ajustes viven en `servicios` (sincronizado); lo descargado,
        //  en localStorage, que se puede volver a pedir.
        // ============================================================

        const servLeer = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
        const servGuardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento: se vuelve a pedir */ } };
        const servDia = iso => new Date(iso + 'T12:00:00');
        const servMasDias = (iso, k) => { const d = servDia(iso); d.setDate(d.getDate() + k); return isoLocal(d); };
        const SERV_DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const SERV_DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
        const servFecha = (iso, conDia = true) => `${conDia ? SERV_DIAS[servDia(iso).getDay()] + ' ' : ''}${servDia(iso).getDate()} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][servDia(iso).getMonth()]}`;

        async function servGuardarDatos() {
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Repinta solo si lo que se ve puede usar lo que acaba de llegar.
        let servRepintando = 0;
        function servRepintar() {
            clearTimeout(servRepintando);
            servRepintando = setTimeout(() => {
                if (document.querySelector('#modal-container .modal-sheet input:focus, #modal-container .modal-sheet textarea:focus')) return;
                if (mobileStandaloneActive || ['calendar', 'planner', 'travels', 'home'].includes(currentView)) render();
            }, 60);
        }

        // ------------------------------------------------------------
        //  FESTIVOS Y PUENTES
        // ------------------------------------------------------------
        const FESTIVOS_REGIONES = { 'ES-AN': 'Andalucía', 'ES-AR': 'Aragón', 'ES-AS': 'Asturias', 'ES-IB': 'Illes Balears', 'ES-CN': 'Canarias', 'ES-CB': 'Cantabria', 'ES-CL': 'Castilla y León', 'ES-CM': 'Castilla-La Mancha', 'ES-CT': 'Cataluña', 'ES-VC': 'Comunitat Valenciana', 'ES-EX': 'Extremadura', 'ES-GA': 'Galicia', 'ES-MD': 'Comunidad de Madrid', 'ES-MC': 'Región de Murcia', 'ES-NC': 'Navarra', 'ES-PV': 'País Vasco', 'ES-RI': 'La Rioja', 'ES-CE': 'Ceuta', 'ES-ML': 'Melilla' };
        // El nombre de la comunidad tal como lo da el buscador de ciudades.
        const FESTIVOS_PISTAS = [['andaluc', 'ES-AN'], ['arag', 'ES-AR'], ['asturias', 'ES-AS'], ['balear', 'ES-IB'], ['canari', 'ES-CN'], ['cantabri', 'ES-CB'], ['castilla y le', 'ES-CL'], ['castilla-la mancha', 'ES-CM'], ['castilla la mancha', 'ES-CM'], ['catalu', 'ES-CT'], ['catalon', 'ES-CT'], ['valencia', 'ES-VC'], ['extremadura', 'ES-EX'], ['galicia', 'ES-GA'], ['madrid', 'ES-MD'], ['murcia', 'ES-MC'], ['navarra', 'ES-NC'], ['vasco', 'ES-PV'], ['euskadi', 'ES-PV'], ['basque', 'ES-PV'], ['rioja', 'ES-RI'], ['ceuta', 'ES-CE'], ['melilla', 'ES-ML']];

        function festivosRegionDe(admin1) {
            const n = stripAccents(String(admin1 || '').toLowerCase());
            return (FESTIVOS_PISTAS.find(([p]) => n.includes(stripAccents(p))) || [])[1] || '';
        }

        const festivosMemoria = {};
        const festivosPidiendo = {};
        function festivosDelPais(pais, anio) {
            const clave = `${pais}-${anio}`;
            if (festivosMemoria[clave]) return festivosMemoria[clave];
            const guardado = servLeer('bitacora-festivos-' + clave);
            if (guardado) return (festivosMemoria[clave] = guardado);
            if (!festivosPidiendo[clave]) {
                festivosPidiendo[clave] = fetch(`https://date.nager.at/api/v3/PublicHolidays/${anio}/${encodeURIComponent(pais)}`)
                    .then(r => r.ok ? r.json() : [])
                    .then(l => {
                        festivosMemoria[clave] = (Array.isArray(l) ? l : []).map(x => ({ fecha: x.date, nombre: x.localName || x.name, global: x.global !== false, regiones: x.counties || [] }));
                        if (festivosMemoria[clave].length) servGuardar('bitacora-festivos-' + clave, festivosMemoria[clave]);
                        servRepintar();
                    })
                    .catch(() => { festivosMemoria[clave] = []; });
            }
            return null;
        }

        // El festivo de un día en la comunidad elegida (o el local que
        // apuntó el usuario). Mientras se descargan, no hay festivo.
        function festivoDe(iso, ajustes = servicios.festivos) {
            if (!ajustes?.pais || !iso) return null;
            const local = (ajustes.locales || []).find(l => l.md === iso.slice(5));
            if (local) return { nombre: local.nombre, local: true };
            const lista = festivosDelPais(ajustes.pais, iso.slice(0, 4));
            const f = lista?.find(x => x.fecha === iso && (x.global || !ajustes.region || x.regiones.includes(ajustes.region)));
            return f ? { nombre: f.nombre } : null;
        }

        function festivosEntre(desde, hasta, ajustes = servicios.festivos) {
            const res = [];
            for (let d = desde; d <= hasta; d = servMasDias(d, 1)) { const f = festivoDe(d, ajustes); if (f) res.push({ fecha: d, ...f }); }
            return res;
        }

        // Puentes: un festivo en lunes o viernes da fin de semana largo; en
        // martes o jueves, cogiendo un día se hacen cuatro; en miércoles,
        // cogiendo dos se hacen cinco.
        function proximosPuentes(dias = 75) {
            if (!servicios.festivos?.pais) return [];
            const hoy = todayISO();
            const libre = d => { const w = servDia(d).getDay(); return w === 0 || w === 6 || !!festivoDe(d); };
            const vistos = new Set();
            return festivosEntre(hoy, servMasDias(hoy, dias)).map(f => {
                const w = servDia(f.fecha).getDay();
                if (w === 0 || w === 6) return null;
                const coger = w === 2 ? [servMasDias(f.fecha, -1)] : w === 4 ? [servMasDias(f.fecha, 1)] : w === 3 ? [servMasDias(f.fecha, 1), servMasDias(f.fecha, 2)] : [];
                const pedir = coger.filter(d => !libre(d));
                let ini = f.fecha, fin = f.fecha;
                const esLibre = d => libre(d) || coger.includes(d);
                while (esLibre(servMasDias(ini, -1))) ini = servMasDias(ini, -1);
                while (esLibre(servMasDias(fin, 1))) fin = servMasDias(fin, 1);
                const total = Math.round((servDia(fin) - servDia(ini)) / 864e5) + 1;
                if (total < 3 || vistos.has(ini)) return null;
                vistos.add(ini);
                return { ...f, ini, fin, total, pedir };
            }).filter(Boolean);
        }

        function puenteTexto(p) {
            const rango = `${SERV_DIAS_CORTOS[servDia(p.ini).getDay()]} ${servDia(p.ini).getDate()} a ${SERV_DIAS_CORTOS[servDia(p.fin).getDay()]} ${servDia(p.fin).getDate()}`;
            return p.pedir.length
                ? `El ${servFecha(p.fecha)} es festivo (${p.nombre}): cogiendo ${p.pedir.length === 1 ? `el ${servFecha(p.pedir[0])}` : `${p.pedir.length} días`} tienes ${p.total} días libres, de ${rango}.`
                : `El ${servFecha(p.fecha)} es festivo (${p.nombre}): ${p.total} días libres, de ${rango}.`;
        }

        // Una línea con el próximo puente. En el inicio (sinPuente) solo sale la pregunta de la ciudad: el puente
        // se queda para «tu día» y el calendario lo marca en su día.
        function renderLineaFestivos(clase = '', sinPuente = false) {
            if (!servicios.festivos?.pais) {
                if (servicios.festivosNo) return '';
                return `<div class="serv-linea ${clase}"><span>¿Dónde vives? Así verás tus festivos y los puentes que vienen.</span><button class="pedido-btn" onclick="openAjustesFestivos()">elegir ciudad.</button><button class="serv-cerrar" onclick="servicios.festivosNo=true;servGuardarDatos();render()" aria-label="Ahora no"><i class='ico ico-x' aria-hidden=true></i></button></div>`;
            }
            if (sinPuente) return '';
            const p = proximosPuentes(45)[0];
            if (p) return `<button class="serv-linea serv-linea-puente ${clase}" onclick="openAjustesFestivos()"><b>puente.</b><span>${puenteTexto(p)}</span></button>`;
            return '';
        }

        function openAjustesFestivos() {
            const a = servicios.festivos || {};
            showModal(`
                <div class="modal-title">festivos y puentes.</div>
                <p class="finance-modal-note">Bitácora marca en el calendario los festivos de tu ciudad y te avisa de los puentes que vienen. Si te vas a vivir a otro sitio, cámbialo aquí.</p>
                <div class="modal-label">tu ciudad</div>
                <input id="fest-ciudad" class="modal-input" autocomplete="off" placeholder="Busca tu ciudad o pueblo..." value="${escapeHtml(a.ciudad || '')}" oninput="festivosBuscarCiudad(this.value)">
                <div id="fest-resultados" class="serv-resultados"></div>
                ${a.pais ? `<div class="serv-elegida">${escapeHtml(a.ciudad || '')}${a.region ? `, ${escapeHtml(FESTIVOS_REGIONES[a.region] || a.region)}` : ''}${a.paisNombre ? ` (${escapeHtml(a.paisNombre)})` : ''}.</div>` : ''}
                <div class="modal-label" style="margin-top:14px">festivos locales</div>
                <p class="finance-modal-note" style="margin-top:0">Los de tu ciudad (el patrón, la feria...) no salen en las listas oficiales: añádelos una vez y se repiten cada año.</p>
                <div id="fest-locales">${renderFestivosLocales()}</div>
                <div class="serv-fila-anadir"><input id="fest-local-fecha" class="modal-input" type="date"><input id="fest-local-nombre" class="modal-input" placeholder="San Valero"><button class="pedido-btn" onclick="festivosAnadirLocal()">añadir.</button></div>
                ${a.pais ? `<div class="modal-label" style="margin-top:14px">los próximos</div><div class="serv-lista">${festivosEntre(todayISO(), servMasDias(todayISO(), 120)).slice(0, 8).map(f => `<div class="serv-lista-fila"><span>${servFecha(f.fecha)}</span><b>${escapeHtml(f.nombre)}</b></div>`).join('') || '<div class="finance-modal-note">Ningún festivo en los próximos cuatro meses.</div>'}</div>` : ''}
            `);
        }

        function renderFestivosLocales() {
            const l = servicios.festivos?.locales || [];
            return l.length ? l.map((x, i) => `<div class="serv-lista-fila"><span>${Number(x.md.slice(3))} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][Number(x.md.slice(0, 2)) - 1]}</span><b>${escapeHtml(x.nombre)}</b><button class="serv-cerrar" onclick="festivosQuitarLocal(${i})" aria-label="Quitar"><i class='ico ico-x' aria-hidden=true></i></button></div>`).join('') : '';
        }

        let festivosBusqueda = 0;
        function festivosBuscarCiudad(texto) {
            clearTimeout(festivosBusqueda);
            const caja = document.getElementById('fest-resultados');
            if (!caja) return;
            if (String(texto).trim().length < 2) { caja.innerHTML = ''; return; }
            festivosBusqueda = setTimeout(async () => {
                try {
                    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(texto.trim())}&count=6&language=es&format=json`).then(x => x.json());
                    window._festCiudades = r.results || [];
                    caja.innerHTML = window._festCiudades.map((c, i) => `<button class="serv-resultado" onclick="festivosElegirCiudad(${i})"><b>${escapeHtml(c.name)}</b><span>${escapeHtml([c.admin1, c.country].filter(Boolean).join(', '))}</span></button>`).join('') || '<div class="finance-modal-note">No encuentro esa ciudad.</div>';
                } catch (e) { caja.innerHTML = '<div class="finance-modal-note">Sin conexión para buscar.</div>'; }
            }, 250);
        }

        async function festivosElegirCiudad(i) {
            const c = window._festCiudades?.[i];
            if (!c) return;
            const pais = String(c.country_code || '').toUpperCase();
            servicios.festivos = { ...(servicios.festivos || {}), pais, paisNombre: c.country || '', ciudad: c.name, region: pais === 'ES' ? festivosRegionDe(c.admin1) : '', lat: c.latitude, lon: c.longitude };
            if (pais === 'ES' && servicios.luz === undefined) servicios.luz = !['ES-CN', 'ES-IB', 'ES-CE', 'ES-ML'].includes(servicios.festivos.region);
            delete servicios.festivosNo;
            festivosDelPais(pais, todayISO().slice(0, 4));
            await servGuardarDatos();
            openAjustesFestivos();
            render();
        }

        async function festivosAnadirLocal() {
            const f = document.getElementById('fest-local-fecha')?.value;
            const n = document.getElementById('fest-local-nombre')?.value.trim();
            if (!f || !n) { showToast('Pon el día y el nombre', true); return; }
            servicios.festivos = { ...(servicios.festivos || {}) };
            servicios.festivos.locales = [...(servicios.festivos.locales || []).filter(x => x.md !== f.slice(5)), { md: f.slice(5), nombre: n }].sort((a, b) => a.md.localeCompare(b.md));
            await servGuardarDatos();
            openAjustesFestivos();
            render();
        }

        async function festivosQuitarLocal(i) {
            const l = [...(servicios.festivos?.locales || [])];
            l.splice(i, 1);
            servicios.festivos = { ...(servicios.festivos || {}), locales: l };
            await servGuardarDatos();
            openAjustesFestivos();
            render();
        }

        // ------------------------------------------------------------
        //  LA LUZ MÁS BARATA (PVPC de Red Eléctrica, península). Precios por
        //  hora de hoy y, desde las 20:30, de mañana.
        // ------------------------------------------------------------
        const LUZ_APARATOS = [
            [/\blavadora/, 2, 'la lavadora'], [/\b(lavavajillas|friegaplatos)/, 2, 'el lavavajillas'], [/\bsecadora/, 1, 'la secadora'],
            [/\bhorno\b/, 1, 'el horno'], [/\bplanchar|\bplancha\b/, 1, 'la plancha'], [/\b(cargar|carga|enchufar) (el )?coche|coche electrico/, 4, 'el coche'],
            [/\btermo\b/, 2, 'el termo'], [/\b(aire acondicionado|calefaccion|radiador)/, 2, 'la climatización'],
        ];
        const luzMemoria = {};
        let luzPidiendo = null;
        let luzFallo = 0;
        function luzActiva() { return servicios.luz === true || (servicios.luz === undefined && servicios.festivos?.pais === 'ES' && !['ES-CN', 'ES-IB', 'ES-CE', 'ES-ML'].includes(servicios.festivos?.region)); }

        function luzPrecios(fecha) {
            if (!luzActiva()) return null;
            if (luzMemoria[fecha]) return luzMemoria[fecha];
            const g = servLeer('bitacora-luz-' + fecha);
            if (g?.length === 24) return (luzMemoria[fecha] = g);
            const hoy = todayISO();
            const manana = servMasDias(hoy, 1);
            if (fecha !== hoy && fecha !== manana) return null;
            // Los de mañana se publican hacia las 20:30: antes, no se piden.
            if (fecha === manana && new Date().getHours() < 20) return null;
            const ultimo = servLeer('bitacora-luz-intento');
            if (ultimo && Date.now() - ultimo < 15 * 60000 && fecha === manana) return null;
            if (!luzPidiendo && Date.now() - luzFallo > 10 * 60000) {
                servGuardar('bitacora-luz-intento', Date.now());
                luzPidiendo = fetch(`https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date=${hoy}T00:00&end_date=${manana}T23:59&time_trunc=hour`)
                    .then(r => r.json())
                    .then(d => {
                        const pvpc = (d.included || []).find(x => /pvpc/i.test(x.type)) || (d.included || [])[0];
                        const porDia = {};
                        (pvpc?.attributes?.values || []).forEach(v => {
                            const dia = String(v.datetime).slice(0, 10), h = Number(String(v.datetime).slice(11, 13));
                            (porDia[dia] = porDia[dia] || Array(24).fill(null))[h] = Math.round(v.value) / 1000;
                        });
                        Object.entries(porDia).forEach(([dia, l]) => { if (l.every(x => x != null)) { luzMemoria[dia] = l; servGuardar('bitacora-luz-' + dia, l); } });
                        luzPidiendo = null;
                        servRepintar();
                    })
                    .catch(() => { luzPidiendo = null; luzFallo = Date.now(); });
            }
            return null;
        }

        // La franja de `horas` seguidas más barata de un día (desde ahora, si es hoy).
        function luzMejorFranja(fecha, horas = 2) {
            const p = luzPrecios(fecha);
            if (!p) return null;
            const desde = fecha === todayISO() ? new Date().getHours() : 0;
            let mejor = null;
            for (let h = desde; h + horas <= 24; h++) {
                const media = p.slice(h, h + horas).reduce((a, b) => a + b, 0) / horas;
                if (!mejor || media < mejor.media) mejor = { ini: h, fin: h + horas, media };
            }
            return mejor;
        }

        const luzEuros = v => v.toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' €/kWh';

        // Una tarea con un aparato que gasta luz: cuándo conviene.
        function luzAviso(titulo, fecha, hora) {
            const n = stripAccents(String(titulo || '').toLowerCase());
            const ap = LUZ_APARATOS.find(([re]) => re.test(n));
            if (!ap) return '';
            const franja = luzMejorFranja(fecha, ap[1]);
            if (!franja) return '';
            const p = luzPrecios(fecha);
            const h = hora ? Number(String(hora).slice(0, 2)) : null;
            const suya = h != null && h + ap[1] <= 24 ? p.slice(h, h + ap[1]).reduce((a, b) => a + b, 0) / ap[1] : null;
            const cara = suya != null && suya > franja.media * 1.2 && h !== franja.ini;
            return `<div class="luz-aviso"><i class="luz-rayo" aria-hidden="true"></i>${cara
                ? `A las ${h} h la luz está un ${Math.round((suya / franja.media - 1) * 100)} % más cara: mejor de ${franja.ini} a ${franja.fin} h.`
                : `La luz más barata para ${ap[2]}: de ${franja.ini} a ${franja.fin} h (${luzEuros(franja.media)}).`}</div>`;
        }

        // El día en barras: la franja barata resaltada y la hora actual.
        function renderLuzDia(fecha) {
            if (!luzActiva()) return '';
            // De noche, lo barato de hoy ya pasó: si ya están, los de mañana.
            const manana = servMasDias(todayISO(), 1);
            if (fecha === todayISO() && new Date().getHours() >= 21 && luzPrecios(manana)) fecha = manana;
            const p = luzPrecios(fecha);
            if (!p) return fecha === todayISO() ? '<div class="luz-dia luz-cargando">la luz de hoy, cargando...</div>' : '';
            const max = Math.max(...p), min = Math.min(...p);
            const franja = luzMejorFranja(fecha, 2) || { ini: p.indexOf(min), fin: p.indexOf(min) + 1 };
            const ahora = fecha === todayISO() ? new Date().getHours() : -1;
            const cara = p.indexOf(max);
            return `<div class="luz-dia">
                <div class="luz-dia-cab"><b>luz${fecha === todayISO() ? ' hoy' : ' mañana'}.</b><span>más barata de ${franja.ini} a ${franja.fin} h; más cara a las ${cara} h (${luzEuros(max)}).</span></div>
                <div class="luz-barras" role="img" aria-label="Precio de la luz por horas">${p.map((v, h) => `<i class="${h >= franja.ini && h < franja.fin ? 'barata' : ''} ${h === ahora ? 'ahora' : ''} ${h < ahora ? 'pasada' : ''}" style="--alto:${Math.round(18 + (max > min ? (v - min) / (max - min) : 0) * 82)}%" title="${h} h: ${luzEuros(v)}"></i>`).join('')}</div>
                <div class="luz-horas"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
            </div>`;
        }

        // ------------------------------------------------------------
        //  LA FICHA DEL DESTINO de cada viaje.
        // ------------------------------------------------------------
        // País → [moneda, enchufes]. Lo de fuera de la tabla sale sin moneda ni enchufe.
        const PAISES_VIAJE = {
            ES: ['EUR', 'C/F'], PT: ['EUR', 'C/F'], FR: ['EUR', 'C/E'], IT: ['EUR', 'C/F/L'], DE: ['EUR', 'C/F'], AT: ['EUR', 'C/F'], NL: ['EUR', 'C/F'], BE: ['EUR', 'C/E'], LU: ['EUR', 'C/F'], IE: ['EUR', 'G'],
            GR: ['EUR', 'C/F'], HR: ['EUR', 'C/F'], SI: ['EUR', 'C/F'], SK: ['EUR', 'C/E'], FI: ['EUR', 'C/F'], EE: ['EUR', 'C/F'], LV: ['EUR', 'C/F'], LT: ['EUR', 'C/F'], MT: ['EUR', 'G'], CY: ['EUR', 'G'],
            GB: ['GBP', 'G'], CH: ['CHF', 'C/J'], HU: ['HUF', 'C/F'], CZ: ['CZK', 'C/E'], PL: ['PLN', 'C/E'], DK: ['DKK', 'C/F/K'], SE: ['SEK', 'C/F'], NO: ['NOK', 'C/F'], IS: ['ISK', 'C/F'], RO: ['RON', 'C/F'],
            BG: ['BGN', 'C/F'], TR: ['TRY', 'C/F'], MA: ['MAD', 'C/E'], US: ['USD', 'A/B'], CA: ['CAD', 'A/B'], MX: ['MXN', 'A/B'], BR: ['BRL', 'C/N'], AR: ['ARS', 'C/I'], CL: ['CLP', 'C/L'], CO: ['COP', 'A/B'],
            PE: ['PEN', 'A/C'], JP: ['JPY', 'A/B'], CN: ['CNY', 'A/C/I'], KR: ['KRW', 'C/F'], TH: ['THB', 'A/B/C/O'], IN: ['INR', 'C/D/M'], ID: ['IDR', 'C/F'], AU: ['AUD', 'I'], NZ: ['NZD', 'I'], ZA: ['ZAR', 'C/M/N'],
            EG: ['EGP', 'C/F'], AE: ['AED', 'G'], IL: ['ILS', 'C/H'], SG: ['SGD', 'G'], HK: ['HKD', 'G'], PH: ['PHP', 'A/B/C'], MY: ['MYR', 'G'], VN: ['VND', 'A/C'],
        };

        async function destinoGeo(t) {
            if (t.destinoGeo || t._destinoBuscando || !t.destination) return;
            t._destinoBuscando = true;
            try {
                const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(String(t.destination).split(',')[0].trim())}&count=1&language=es&format=json`).then(x => x.json());
                const c = r.results?.[0];
                t.destinoGeo = c ? { nombre: c.name, pais: String(c.country_code || '').toUpperCase(), paisNombre: c.country || '', lat: c.latitude, lon: c.longitude, zona: c.timezone || '' } : { noEncontrado: true };
                delete t._destinoBuscando;
                await servGuardarDatos();
                if (tripManagerTab === 'destino') render();
            } catch (e) { delete t._destinoBuscando; }
        }

        const destinoMemoria = {};
        function destinoPedir(clave, url, procesar) {
            if (destinoMemoria[clave] !== undefined) return destinoMemoria[clave];
            const g = servLeer('bitacora-destino-' + clave);
            if (g && Date.now() - g.cuando < 6 * 3600e3) return (destinoMemoria[clave] = g.v);
            destinoMemoria[clave] = null;
            fetch(url).then(r => r.json()).then(d => {
                destinoMemoria[clave] = procesar(d);
                servGuardar('bitacora-destino-' + clave, { cuando: Date.now(), v: destinoMemoria[clave] });
                if (tripManagerTab === 'destino') render();
            }).catch(() => { destinoMemoria[clave] = false; });
            return null;
        }

        function destinoHora(zona) {
            if (!zona) return '';
            try {
                const ahora = new Date();
                const alli = new Intl.DateTimeFormat('es-ES', { timeZone: zona, hour: '2-digit', minute: '2-digit' }).format(ahora);
                const desfase = z => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: z, hour: '2-digit', minute: '2-digit', hour12: false, day: '2-digit' }).formatToParts(ahora).map(x => [x.type, x.value])); return Number(p.day) * 1440 + (Number(p.hour) % 24) * 60 + Number(p.minute); };
                const dif = Math.round((desfase(zona) - desfase('Europe/Madrid')) / 60);
                return `Allí son las ${alli}${dif === 0 ? ', la misma hora que en España' : `, ${Math.abs(dif)} ${Math.abs(dif) === 1 ? 'hora' : 'horas'} ${dif > 0 ? 'más' : 'menos'} que en España`}.`;
            } catch (e) { return ''; }
        }

        function renderTripDestinoTab(t) {
            if (!t.destination) return '<div class="finance-empty-state">Ponle un destino al viaje y aquí tendrás el tiempo, la hora, la moneda y los festivos de allí.</div>';
            const g = t.destinoGeo;
            if (!g) { destinoGeo(t); return '<div class="finance-empty-state">Buscando el destino...</div>'; }
            if (g.noEncontrado) return `<div class="finance-empty-state">No encuentro «${escapeHtml(t.destination)}». Prueba a escribir solo la ciudad en el destino del viaje.</div>`;
            const ini = t.startDate || todayISO(), fin = t.endDate || ini;
            const hoy = todayISO();
            const dias = Math.round((servDia(ini) - servDia(hoy)) / 864e5);
            const info = PAISES_VIAJE[g.pais] || [];
            // El tiempo: previsión si el viaje empieza en menos de 15 días;
            // si no, cómo fueron esos mismos días el año pasado.
            let tiempo = '';
            if (fin < hoy) tiempo = '';
            else if (dias <= 14) {
                const f = destinoPedir(`prev-${g.lat}-${g.lon}-${ini}-${fin}`, `https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${ini < hoy ? hoy : ini}&end_date=${[fin, servMasDias(hoy, 15)].sort()[0]}`,
                    d => (d.daily?.time || []).map((x, i) => ({ f: x, code: d.daily.weather_code[i], max: d.daily.temperature_2m_max[i], min: d.daily.temperature_2m_min[i], lluvia: d.daily.precipitation_probability_max?.[i] })));
                tiempo = f ? `<div class="destino-dias">${f.map(x => `<div class="destino-dia"><span>${SERV_DIAS_CORTOS[servDia(x.f).getDay()]} ${servDia(x.f).getDate()}</span>${tiempoIcono(tiempoTipo(x.code, true), 26)}<b>${Math.round(x.max)}°</b><small>${Math.round(x.min)}°${x.lluvia >= 40 ? `, ${x.lluvia} %` : ''}</small></div>`).join('')}</div>` : '<div class="finance-modal-note">Cargando la previsión...</div>';
            } else {
                const a = (Number(ini.slice(0, 4)) - 1) + ini.slice(4), b = (Number(fin.slice(0, 4)) - 1) + fin.slice(4);
                const h = destinoPedir(`hist-${g.lat}-${g.lon}-${a}-${b}`, `https://archive-api.open-meteo.com/v1/archive?latitude=${g.lat}&longitude=${g.lon}&start_date=${a}&end_date=${b}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`,
                    d => { const mx = d.daily?.temperature_2m_max || [], mn = d.daily?.temperature_2m_min || [], ll = d.daily?.precipitation_sum || []; return mx.length ? { max: Math.round(mx.reduce((s, v) => s + v, 0) / mx.length), min: Math.round(mn.reduce((s, v) => s + v, 0) / mn.length), lluvia: ll.filter(v => v >= 1).length, n: mx.length } : null; });
                tiempo = h ? `<p class="destino-texto">El año pasado, esos mismos días: entre <b>${h.min}°</b> y <b>${h.max}°</b> de media${h.lluvia ? `, y llovió ${h.lluvia} de ${h.n} días` : ', sin lluvia'}. La previsión llega dos semanas antes.</p>` : '<div class="finance-modal-note">Mirando cómo fue el tiempo esos días el año pasado...</div>';
            }
            let moneda = '';
            if (info[0] && info[0] !== 'EUR') {
                const tasa = destinoPedir('cambio-' + info[0], `https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${info[0]}`, d => d.rates?.[info[0]] || false);
                moneda = tasa ? `<p class="destino-texto"><b>1 € = ${tasa.toLocaleString('es-ES', { maximumFractionDigits: tasa < 10 ? 3 : 1 })} ${info[0]}</b> (Banco Central Europeo).</p>
                    <div class="destino-conversor"><input class="modal-input" type="text" inputmode="decimal" placeholder="importe en ${info[0]}" oninput="this.nextElementSibling.textContent = (financeProParseEuroAmount(this.value) / ${tasa}) > 0 ? financeMoney(financeProParseEuroAmount(this.value) / ${tasa}) : ''"><b></b></div>`
                    : tasa === false ? `<p class="destino-texto">Se paga en ${info[0]}.</p>` : '<div class="finance-modal-note">Cargando el cambio...</div>';
            } else if (info[0] === 'EUR') moneda = '<p class="destino-texto">Se paga en euros.</p>';
            const fest = g.pais && t.startDate ? festivosEntre(ini, fin, { pais: g.pais }) : [];
            const cargando = g.pais && t.startDate && [ini.slice(0, 4), fin.slice(0, 4)].some(a => !festivosDelPais(g.pais, a));
            const tarjeta = (titulo, cuerpo) => cuerpo ? `<section class="destino-tarjeta"><div class="destino-tarjeta-titulo">${titulo}</div>${cuerpo}</section>` : '';
            return `<div class="destino">
                <div class="destino-cab"><b>${escapeHtml(g.nombre)}</b><span>${escapeHtml(g.paisNombre)}</span></div>
                <div class="destino-rejilla">
                    ${tarjeta('el tiempo.', tiempo)}
                    ${tarjeta('la hora.', g.zona ? `<p class="destino-texto">${destinoHora(g.zona)}</p>` : '')}
                    ${tarjeta('el dinero.', moneda)}
                    ${tarjeta('festivos allí.', cargando ? '<div class="finance-modal-note">Mirando los festivos...</div>' : fest.length ? fest.map(f => `<p class="destino-texto"><b>${servFecha(f.fecha)}</b>: ${escapeHtml(f.nombre)}. Puede haber tiendas y museos cerrados.</p>`).join('') : '<p class="destino-texto">Ningún festivo durante el viaje.</p>')}
                    ${tarjeta('enchufes y urgencias.', `<p class="destino-texto">${info[1] ? `Enchufe tipo <b>${info[1]}</b>${/^C\//.test(info[1]) || info[1] === 'C/F' ? ', el mismo que en España' : ', lleva adaptador'}. ` : ''}Urgencias: <b>${['US', 'CA', 'MX'].includes(g.pais) ? '911' : g.pais === 'GB' ? '999 o 112' : g.pais === 'JP' ? '110 policía, 119 ambulancia' : g.pais === 'AU' ? '000' : '112'}</b>.</p>`)}
                </div>
                <div class="finance-modal-note">Datos de Open-Meteo, Nager.Date y el Banco Central Europeo, al momento.</div>
            </div>`;
        }

        // ------------------------------------------------------------
        //  TU DÍA, en una ficha: lo que pasó, lo que hiciste, lo que
        //  gastaste, el tiempo que hizo y, si lo hay, qué pasaba hace un año.
        // ------------------------------------------------------------
        function tuDiaDatos(fecha) {
            const todas = getDayAllEntries(fecha);
            const eventos = todas.filter(e => !isCalendarLogEntry(e) && e.type !== 'work' && e.type !== 'birthday');
            const cumples = todas.filter(e => e.type === 'birthday');
            const hechas = entries.filter(e => isCalendarLogEntry(e) && e.date === fecha).map(e => String(e.title || '').replace(/^completado:\s*/i, ''));
            if (fecha === todayISO()) plannerItemsForOffset(0).filter(i => i.done).forEach(i => { if (!hechas.includes(i.title)) hechas.push(i.title); });
            const gastos = financePro.transactions.filter(t => t.date === fecha && t.type === 'expense' && !financeProNeutro(t));
            const ingresos = financePro.transactions.filter(t => t.date === fecha && t.type === 'income' && !financeProNeutro(t));
            const rutinas = (habits || []).filter(h => h.completadas?.[fecha]).map(h => h.texto || h.name || '');
            const nota = (notes || []).find(n => n.date === fecha && (n.content || '').trim());
            const ocio = entries.filter(e => ['book', 'series', 'game'].includes(e.type) && e.endDate === fecha || (e.type === 'movie' && e.date === fecha));
            const viaje = entries.find(e => e.type === 'travel' && e.startDate && e.startDate <= fecha && (e.endDate || e.startDate) >= fecha);
            return { eventos, cumples, hechas, gastos, ingresos, rutinas, nota, ocio, viaje, esfuerzo: dailyEffort?.[fecha] || 0, festivo: festivoDe(fecha) };
        }

        const tuDiaVacio = d => !d.eventos.length && !d.hechas.length && !d.gastos.length && !d.rutinas.length && !d.nota && !d.ocio.length && !d.viaje;

        // El tiempo que hizo (o que hace) en tu ciudad ese día.
        function tuDiaTiempo(fecha) {
            const c = ciudadTiempo || CIUDAD_TIEMPO_DEFECTO;
            const hoy = todayISO();
            const reciente = Math.round((servDia(hoy) - servDia(fecha)) / 864e5) <= 5;
            return destinoPedir(`dia-${c.lat}-${c.lon}-${fecha}`, reciente
                ? `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${fecha}&end_date=${fecha}`
                : `https://archive-api.open-meteo.com/v1/archive?latitude=${c.lat}&longitude=${c.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${fecha}&end_date=${fecha}`,
                d => d.daily?.time?.length ? { code: d.daily.weather_code[0], max: d.daily.temperature_2m_max[0], min: d.daily.temperature_2m_min[0] } : false);
        }

        function openTuDia(fecha = todayISO()) {
            window._tuDiaFecha = fecha;
            showModal(`<div id="tu-dia">${renderTuDia(fecha)}</div>`);
        }

        function renderTuDia(fecha) {
            const d = tuDiaDatos(fecha);
            const tiempo = tuDiaTiempo(fecha);
            const total = d.gastos.reduce((s, t) => s + Number(t.amount), 0);
            const tipoT = tiempo ? tiempoTipo(tiempo.code, true) : null;
            const bloque = (titulo, filas) => filas.length ? `<div class="tudia-bloque"><div class="tudia-bloque-titulo">${titulo}</div>${filas.map(f => `<div class="tudia-fila">${f}</div>`).join('')}</div>` : '';
            const antes = servMasDias(fecha, -365 - (Number(fecha.slice(0, 4)) % 4 === 0 && fecha.slice(5) > '02-28' ? 1 : 0));
            const hace = tuDiaDatos(antes);
            const cuandoHace = [...hace.eventos.map(e => e.title), ...hace.ocio.map(e => e.title), hace.viaje ? `de viaje en ${hace.viaje.destination || hace.viaje.title}` : ''].filter(Boolean);
            return `
                <div class="tudia">
                    <div class="tudia-cab">
                        <div><div class="tudia-fecha">${servFecha(fecha)}.</div>${d.festivo ? `<div class="tudia-sub">festivo, ${escapeHtml(d.festivo.nombre)}.</div>` : ''}${d.viaje ? `<div class="tudia-sub">de viaje en ${escapeHtml(d.viaje.destination || d.viaje.title || '')}.</div>` : ''}</div>
                        ${tiempo ? `<div class="tudia-tiempo">${tiempoIcono(tipoT, 30)}<span>${Math.round(tiempo.max)}° <small>${Math.round(tiempo.min)}°</small></span></div>` : ''}
                        <button class="modal-close" onclick="closeModal()" aria-label="Cerrar"><i class='ico ico-x' aria-hidden=true></i></button>
                    </div>
                    ${tuDiaVacio(d) ? '<p class="finance-modal-note">Un día sin nada apuntado. A veces es lo mejor.</p>' : ''}
                    ${bloque('lo que pasó.', [...d.eventos.map(e => `${e.time ? `<b>${escapeHtml(e.time)}</b> ` : ''}${escapeHtml(e.title || '')}${e.place ? ` <span>en ${escapeHtml(e.place)}</span>` : ''}`), ...d.cumples.map(e => `cumpleaños de ${escapeHtml(e.title)}`)])}
                    ${bloque('lo que hiciste.', [...d.hechas.map(t => escapeHtml(t)), ...(d.rutinas.length ? [`${d.rutinas.length} ${d.rutinas.length === 1 ? 'rutina' : 'rutinas'}: ${escapeHtml(d.rutinas.join(', ').toLowerCase())}`] : []), ...(d.esfuerzo ? [`esfuerzo del día: ${d.esfuerzo} de 5`] : [])])}
                    ${bloque('lo que gastaste.', d.gastos.length ? [`<b>${financeMoney(total)}</b> en ${d.gastos.length} ${d.gastos.length === 1 ? 'pago' : 'pagos'}${d.gastos.length > 1 ? `; el mayor, ${escapeHtml(d.gastos.slice().sort((a, b) => b.amount - a.amount)[0].note || 'sin concepto')} (${financeMoney(Math.max(...d.gastos.map(t => Number(t.amount))))})` : `: ${escapeHtml(d.gastos[0].note || 'sin concepto')}`}.`, ...(d.ingresos.length ? [`entraron ${financeMoney(d.ingresos.reduce((s, t) => s + Number(t.amount), 0))}.`] : [])] : [])}
                    ${bloque('lo que terminaste.', d.ocio.map(e => `${escapeHtml(e.title)} <span>${{ book: 'libro', series: 'serie', game: 'juego', movie: 'película' }[e.type]}${e.rating ? `, ${'★'.repeat(e.rating)}` : ''}</span>`))}
                    ${d.nota ? `<div class="tudia-bloque"><div class="tudia-bloque-titulo">lo que escribiste.</div><p class="tudia-nota">${escapeHtml(d.nota.content.trim().slice(0, 280))}${d.nota.content.trim().length > 280 ? '…' : ''}</p></div>` : ''}
                    ${cuandoHace.length ? `<div class="tudia-hace"><b>hace un año.</b> ${escapeHtml(cuandoHace.slice(0, 3).join(', '))}.</div>` : ''}
                    <div class="tudia-nav">
                        <button class="pedido-btn" onclick="openTuDia('${servMasDias(fecha, -1)}')"><i class='ico ico-izq' aria-hidden=true></i> el día anterior.</button>
                        ${fecha < todayISO() ? `<button class="pedido-btn" onclick="openTuDia('${servMasDias(fecha, 1)}')">el siguiente. <i class='ico ico-der' aria-hidden=true></i></button>` : ''}
                    </div>
                </div>`;
        }

        // Un renglón para el inicio del móvil y el día del calendario.
        function renderEntradaTuDia(fecha) {
            const hoy = todayISO();
            if (fecha > hoy || (fecha === hoy && new Date().getHours() < 19)) return '';
            const d = tuDiaDatos(fecha);
            if (tuDiaVacio(d)) return '';
            const total = d.gastos.reduce((s, t) => s + Number(t.amount), 0);
            const resumen = [d.eventos.length ? `${d.eventos.length} ${d.eventos.length === 1 ? 'cosa' : 'cosas'} en la agenda` : '', d.hechas.length ? `${d.hechas.length} ${d.hechas.length === 1 ? 'tarea hecha' : 'tareas hechas'}` : '', total ? `${financeMoney(total)} gastados` : ''].filter(Boolean).join(', ');
            return `<button class="tudia-entrada" onclick="openTuDia('${fecha}')"><b>${fecha === hoy ? 'tu día.' : 'ese día.'}</b><span>${resumen || 'ver la ficha del día'}.</span><i class='ico ico-der' aria-hidden=true></i></button>`;
        }

        // Ajustes: la tarjeta de servicios.
        AJUSTES_ICONOS.lugar = '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M50 4c19 0 34 15 34 34 0 24-34 58-34 58S16 62 16 38C16 19 31 4 50 4zm0 20a14 14 0 1 0 0 28 14 14 0 0 0 0-28z"/></svg>';
        function renderAjustesServicios() {
            const f = servicios.festivos;
            return `<div class="serv-ajustes">
                <div class="serv-ajustes-fila"><div><b>festivos y puentes.</b><span>${f?.pais ? `${escapeHtml(f.ciudad || '')}${f.region ? `, ${escapeHtml(FESTIVOS_REGIONES[f.region] || '')}` : ''}${(f.locales || []).length ? `, ${f.locales.length} ${f.locales.length === 1 ? 'festivo local' : 'festivos locales'}` : ''}.` : 'Sin ciudad elegida.'}</span></div><button class="btn-secondary" style="width:auto" onclick="openAjustesFestivos()">${f?.pais ? 'cambiar.' : 'elegir ciudad.'}</button></div>
                <div class="serv-ajustes-fila"><div><b>tus equipos.</b><span>${(servicios.equipos || []).length ? escapeHtml(servicios.equipos.map(e => e.corto || e.nombre).join(', ')) + '.' : 'Sus partidos, solos en tu calendario.'}</span></div><button class="btn-secondary" style="width:auto" onclick="openAjustesEquipos()">${(servicios.equipos || []).length ? 'cambiar.' : 'elegir.'}</button></div>
                <label class="serv-ajustes-fila"><div><b>estrenos de tus series.</b><span>Las temporadas nuevas de las series que tienes en Ocio, y los episodios de las que estás viendo.</span></div><input type="checkbox" ${estrenosActivos() ? 'checked' : ''} onchange="servicios.estrenos=this.checked;servGuardarDatos();render()"></label>
                <label class="serv-ajustes-fila"><div><b>la luz más barata.</b><span>Precio por horas (PVPC, península) en el planificador y en las tareas con lavadora, horno, lavavajillas...</span></div><input type="checkbox" ${luzActiva() ? 'checked' : ''} onchange="servicios.luz=this.checked;servGuardarDatos();render()"></label>
            </div>`;
        }

        // ------------------------------------------------------------
        //  TUS EQUIPOS (ESPN y TheSportsDB, a través de la función
        //  `deportes`) y LOS ESTRENOS DE TUS SERIES (TVmaze, directo).
        //  Entran en el calendario como entradas de solo lectura (srv_...):
        //  al abrirlas se pueden apuntar como evento propio u ocultar.
        // ------------------------------------------------------------
        async function deportesPedir(cuerpo) {
            const { data: { session } } = await sb.auth.getSession();
            if (!session) return {};
            const r = await fetch(`${SUPABASE_URL}/functions/v1/deportes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(cuerpo) });
            return r.ok ? r.json() : {};
        }

        const partidosMemoria = {};
        const partidosPidiendo = {};
        function partidosDe(eq) {
            if (partidosMemoria[eq.id]) return partidosMemoria[eq.id];
            const g = servLeer('bitacora-partidos-' + eq.id);
            if (g && Date.now() - g.cuando < 12 * 3600e3) return (partidosMemoria[eq.id] = g.partidos);
            if (!partidosPidiendo[eq.id]) {
                partidosPidiendo[eq.id] = deportesPedir({ accion: 'calendario', deporte: eq.deporte, liga: eq.liga, id: eq.id }).then(d => {
                    if (Array.isArray(d.partidos)) { partidosMemoria[eq.id] = d.partidos; servGuardar('bitacora-partidos-' + eq.id, { cuando: Date.now(), partidos: d.partidos }); servRepintar(); }
                }).catch(() => {}).finally(() => { setTimeout(() => { delete partidosPidiendo[eq.id]; }, 10 * 60000); });
            }
            return g?.partidos || [];
        }

        const seriesMemoria = {};
        let seriesCola = null;
        function estrenosActivos() { return servicios.estrenos !== false; }
        // La próxima emisión de cada serie que sigues (TVmaze), de una en
        // una y guardada un día: no hace falta más.
        function seriesSeguidas() { return entries.filter(e => e.type === 'series' && e.title && !/abandon/i.test(e.status || '')).slice(0, 30); }
        function estrenoDe(e) {
            if (seriesMemoria[e.id] !== undefined) return seriesMemoria[e.id];
            const g = servLeer('bitacora-serie-' + e.id);
            if (g && Date.now() - g.cuando < 24 * 3600e3 && g.titulo === e.title) return (seriesMemoria[e.id] = g.v);
            if (!seriesCola) seriesCola = (async () => {
                for (const s of seriesSeguidas()) {
                    const ya = servLeer('bitacora-serie-' + s.id);
                    if (ya && Date.now() - ya.cuando < 24 * 3600e3 && ya.titulo === s.title) { seriesMemoria[s.id] = ya.v; continue; }
                    try {
                        const d = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(s.title)}&embed=nextepisode`).then(r => r.ok ? r.json() : null);
                        const n = d?._embedded?.nextepisode;
                        seriesMemoria[s.id] = n?.airdate ? { fecha: n.airdate, hora: n.airtime || '', temporada: n.season, episodio: n.number, nombre: n.name || '', canal: d.network?.name || d.webChannel?.name || '' } : null;
                        servGuardar('bitacora-serie-' + s.id, { cuando: Date.now(), titulo: s.title, v: seriesMemoria[s.id] });
                    } catch (err) { seriesMemoria[s.id] = null; }
                    await new Promise(r => setTimeout(r, 400));
                }
                servRepintar();
            })();
            return g?.v || null;
        }

        function servDiaLocal(isoUtc) {
            const d = new Date(isoUtc);
            return { fecha: isoLocal(d), hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
        }

        // Lo que estos servicios ponen en un día del calendario.
        function serviciosCalendario(iso) {
            const res = [];
            const ocultos = new Set(servicios.ocultos || []);
            const apuntados = new Set(entries.map(e => e.servicioId).filter(Boolean));
            (servicios.equipos || []).forEach(eq => partidosDe(eq).forEach(p => {
                const { fecha, hora } = servDiaLocal(p.fecha);
                const id = 'srv_p_' + p.id;
                if (fecha !== iso || ocultos.has(id) || apuntados.has(id)) return;
                res.push({ id, type: 'event', eventType: eq.deporte === 'basketball' ? 'baloncesto' : 'futbol', title: p.local ? `${eq.corto} - ${p.rival}` : `${p.rival} - ${eq.corto}`, date: iso, time: p.horaConfirmada ? hora : '', place: p.estadio || '', notes: p.competicion || '', categoryId: getCategoryIdForType('event'), tags: [], _servicio: 'partido', _datos: { ...p, equipo: eq } });
            }));
            if (estrenosActivos()) seriesSeguidas().forEach(s => {
                const n = estrenoDe(s);
                if (!n || n.fecha !== iso) return;
                const viendo = /viendo/i.test(s.status || '');
                if (!viendo && n.episodio !== 1) return;
                const id = `srv_s_${s.id}_${n.temporada}_${n.episodio}`;
                if (ocultos.has(id) || apuntados.has(id)) return;
                res.push({ id, type: 'event', eventType: 'cine', title: n.episodio === 1 ? `${s.title}: temporada ${n.temporada}` : `${s.title}: nuevo episodio`, date: iso, time: '', place: n.canal || '', notes: n.nombre || '', categoryId: getCategoryIdForType('event'), tags: [], _servicio: 'serie', _datos: { ...n, serie: s.title } });
            });
            return res;
        }

        // Los partidos que pone Bitácora por seguir a un equipo (y los que se apuntan desde ellos) llevan la etiqueta
        // «auto.», como lo demás que se añade solo.
        const esPartidoAuto = e => e?._servicio === 'partido' || /^srv_p_/.test(e?.servicioId || '');
        const ETIQUETA_AUTO = '<span class="etiqueta-auto" title="Lo añade Bitácora porque sigues a este equipo">auto.</span>';

        // Próximos partidos de tus equipos (los mismos que salen en el calendario), para el apartado Eventos: antes
        // solo se veían en el calendario y parecía que no habían entrado.
        function partidosProximos(dias = 30) {
            if (!(servicios.equipos || []).length) return [];
            const hoy = todayISO(), res = [];
            for (let k = 0; k < dias; k++) serviciosCalendario(servMasDias(hoy, k)).forEach(e => { if (e._servicio === 'partido') res.push(e); });
            return res.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
        }
        function renderPartidosEventos(movil) {
            if (!(servicios.equipos || []).length) return '';
            const lista = partidosProximos().slice(0, 6);
            const fecha = iso => { const d = new Date(iso + 'T12:00:00'); return `${MOBILE_DIAS[d.getDay()]} ${d.getDate()} ${MOBILE_MESES[d.getMonth()].slice(0, 3)}`; };
            const filas = lista.map(e => `<button class="partidos-fila" data-open-entry="${e.id}"><span class="partidos-fecha">${fecha(e.date)}.</span><span class="partidos-cuerpo"><b>${escapeHtml(e.title)}${ETIQUETA_AUTO}</b><small>${escapeHtml([e.time || 'hora por confirmar', e._datos?.competicion].filter(Boolean).join(', '))}</small></span></button>`).join('');
            return `<section class="partidos-eventos ${movil ? 'movil' : ''}">
                <div class="${movil ? 'm-bloque-cab' : 'partidos-cab'}"><div class="${movil ? 'm-etiqueta' : 'partidos-titulo'}">tus equipos.</div><button class="${movil ? 'm-mini' : 'btn-secondary'}" style="width:auto" onclick="openAjustesEquipos()">elegir.</button></div>
                ${filas || `<div class="${movil ? 'm-vacio m-vacio-peque' : 'partidos-vacio'}">Cargando sus partidos... si no salen en un rato, ábrelo desde aquí.</div>`}
            </section>`;
        }

        function servicioPorId(id) {
            if (!/^srv_[ps]_/.test(String(id))) return null;
            const hoy = todayISO();
            for (let k = -3; k < 400; k++) { const x = serviciosCalendario(servMasDias(hoy, k)).find(e => e.id === id); if (x) return x; }
            return null;
        }

        function openServicioDetalle(id) {
            const e = servicioPorId(id);
            if (!e) return;
            const d = e._datos;
            const escudo = (src, alt) => src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">` : `<span>${escapeHtml(String(alt || '?').charAt(0))}</span>`;
            showModal(`
                <div class="modal-title">${e._servicio === 'partido' ? 'partido.' : 'estreno.'}</div>
                ${e._servicio === 'partido' ? `
                <div class="partido-cara">
                    <div>${escudo(d.local ? d.equipo.escudo : d.rivalEscudo, d.local ? d.equipo.nombre : d.rival)}<b>${escapeHtml(d.local ? d.equipo.corto : d.rival)}</b></div>
                    <i>-</i>
                    <div>${escudo(d.local ? d.rivalEscudo : d.equipo.escudo, d.local ? d.rival : d.equipo.nombre)}<b>${escapeHtml(d.local ? d.rival : d.equipo.corto)}</b></div>
                </div>
                <p class="partido-datos">${servFecha(e.date)}${e.time ? `, a las ${e.time}` : ', hora por confirmar'}.<br>${escapeHtml(d.competicion || '')}${d.estadio ? `, ${escapeHtml(d.estadio)}` : ''}.</p>`
                : `<p class="partido-datos"><b>${escapeHtml(e.title)}</b><br>${servFecha(e.date)}${d.canal ? `, en ${escapeHtml(d.canal)}` : ''}.${d.nombre ? `<br>«${escapeHtml(d.nombre)}»` : ''}</p>`}
                <button class="btn-modal-primary" onclick="servicioApuntar('${e.id}')">apuntar en mi calendario.</button>
                <button class="btn-secondary" style="margin-top:8px" onclick="servicioOcultar('${e.id}')">no me interesa este.</button>
                <p class="finance-modal-note">${e._servicio === 'partido' ? 'Sale porque sigues a este equipo (Ajustes, dónde vives).' : 'Sale porque tienes esta serie en Ocio.'} Al apuntarlo pasa a ser un evento tuyo, con su aviso una hora antes.</p>
            `);
        }

        async function servicioApuntar(id) {
            const e = servicioPorId(id);
            if (!e) return;
            entries.push({ id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), type: 'event', eventType: e.eventType, title: e.title, date: e.date, time: e.time, place: e.place, notes: e.notes, categoryId: e.categoryId, tags: [], servicioId: e.id });
            filteredEntries = [...entries];
            closeModal();
            render();
            await servGuardarDatos();
            showToast('Apuntado en tu calendario');
        }

        async function servicioOcultar(id) {
            servicios.ocultos = [...new Set([...(servicios.ocultos || []), id])].slice(-300);
            closeModal();
            render();
            await servGuardarDatos();
        }

        function openAjustesEquipos() {
            showModal(`
                <div class="modal-title">tus equipos.</div>
                <p class="finance-modal-note">Sus partidos entran solos en tu calendario, con la hora y el estadio, en todas sus competiciones: liga, copa, Champions...</p>
                <input class="modal-input" autocomplete="off" placeholder="Busca un equipo: Zaragoza, Barça, Lakers..." oninput="equiposBuscar(this.value)">
                <div id="equipos-resultados" class="serv-resultados"></div>
                <div class="modal-label" style="margin-top:14px">los que sigues</div>
                <div class="serv-lista">${(servicios.equipos || []).map((eq, i) => `<div class="serv-lista-fila equipo-fila">${eq.escudo ? `<img src="${escapeHtml(eq.escudo)}" alt="">` : ''}<b>${escapeHtml(eq.nombre)}</b><span>${escapeHtml(eq.ligaNombre || '')}</span><button class="serv-cerrar" onclick="equiposQuitar(${i})" aria-label="Dejar de seguir"><i class='ico ico-x' aria-hidden=true></i></button></div>`).join('') || '<div class="finance-modal-note">Todavía ninguno.</div>'}</div>
            `);
        }

        let equiposBusqueda = 0;
        function equiposBuscar(texto) {
            clearTimeout(equiposBusqueda);
            const caja = document.getElementById('equipos-resultados');
            if (!caja) return;
            if (String(texto).trim().length < 3) { caja.innerHTML = ''; return; }
            caja.innerHTML = '<div class="finance-modal-note">Buscando...</div>';
            equiposBusqueda = setTimeout(async () => {
                const d = await deportesPedir({ accion: 'buscar', texto: texto.trim() }).catch(() => ({}));
                window._equiposEncontrados = d.equipos || [];
                if (!document.getElementById('equipos-resultados')) return;
                caja.innerHTML = window._equiposEncontrados.map((eq, i) => `<button class="serv-resultado equipo-resultado" onclick="equiposAnadir(${i})">${eq.escudo ? `<img src="${escapeHtml(eq.escudo)}" alt="">` : ''}<div><b>${escapeHtml(eq.nombre)}</b><span>${escapeHtml(eq.ligaNombre || '')}</span></div></button>`).join('') || '<div class="finance-modal-note">No encuentro ese equipo.</div>';
            }, 350);
        }

        async function equiposAnadir(i) {
            const eq = window._equiposEncontrados?.[i];
            if (!eq) return;
            servicios.equipos = [...(servicios.equipos || []).filter(x => x.id !== eq.id), { id: eq.id, deporte: eq.deporte, liga: eq.liga, ligaNombre: eq.ligaNombre, nombre: eq.nombre, corto: eq.corto, escudo: eq.escudo }];
            await servGuardarDatos();
            partidosDe(eq);
            openAjustesEquipos();
            render();
        }

        async function equiposQuitar(i) {
            const l = [...(servicios.equipos || [])];
            l.splice(i, 1);
            servicios.equipos = l;
            await servGuardarDatos();
            openAjustesEquipos();
            render();
        }

        // ------------------------------------------------------------
        //  SIRI Y TU CORREO (función `entrada`). Cada puerta tiene su
        //  propio token en conector_tokens, con nombre «siri» o «correo»:
        //  solo sirve para apuntar (el servidor del conector lo rechaza),
        //  así que se guarda también aquí para poder enseñarlo otra vez.
        // ------------------------------------------------------------
        const ENTRADA_URL = `${SUPABASE_URL}/functions/v1/entrada`;
        const CORREO_DOMINIO = 'in.appbitacora.es';
        AJUSTES_ICONOS.atajos = '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M44 6h12v34h16L50 64 28 40h16zM8 58h22l8 14h24l8-14h22v36H8z"/></svg>';

        function renderAjustesAtajos() {
            const siri = servicios.siriToken, correo = servicios.correoToken;
            return `
                <div class="serv-ajustes">
                    <div class="serv-ajustes-fila"><div><b>siri.</b><span>${siri ? 'Conectado. Di «Apunta en Bitácora» y dicta lo que sea.' : 'Dile a Siri qué apuntar sin abrir la app: «cena con Marta el viernes a las 9».'}</span></div><button class="btn-secondary" style="width:auto" onclick="openAtajoSiri()">${siri ? 'ver pasos.' : 'conectar.'}</button></div>
                    <div class="serv-ajustes-fila"><div><b>tu correo.</b><span>${correo ? 'Reenvía aquí tus reservas y pedidos.' : 'Reenvía la confirmación de un vuelo, un hotel, unas entradas o un pedido y se apunta sola.'}</span></div><button class="btn-secondary" style="width:auto" onclick="openAtajoCorreo()">${correo ? 'ver dirección.' : 'crear dirección.'}</button></div>
                </div>`;
        }

        async function atajoToken(nombre) {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) { showToast('Inicia sesión para conectarlo', true); return null; }
            const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
            const hash = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join('');
            const { error } = await sb.from('conector_tokens').insert({ token_hash: await hash(token), user_id: user.id, nombre });
            if (error) { console.error(error); showToast('No se ha podido crear', true); return null; }
            const clave = nombre === 'siri' ? 'siriToken' : 'correoToken';
            if (servicios[clave]) await sb.from('conector_tokens').delete().eq('token_hash', await hash(servicios[clave]));
            servicios[clave] = token;
            await servGuardarDatos();
            return token;
        }

        function atajoCopiar(texto, aviso) {
            navigator.clipboard.writeText(texto).then(() => showToast(aviso)).catch(() => showToast('No se ha podido copiar', true));
        }

        function atajoRepintarAjustes() {
            const caja = document.querySelector('#settings-atajos-section .serv-ajustes');
            if (caja) caja.outerHTML = renderAjustesAtajos();
        }

        async function openAtajoSiri(nuevo) {
            if (!servicios.siriToken || nuevo) { if (!(await atajoToken('siri'))) return; atajoRepintarAjustes(); }
            const url = `${ENTRADA_URL}?t=${servicios.siriToken}`;
            showModal(`
                <div class="modal-title">siri.</div>
                <p class="finance-modal-note" style="margin-top:0">Un atajo de cuatro pasos en la app <b>Atajos</b> del iPhone. Se hace una vez y luego basta con decir <b>«Oye Siri, apunta en Bitácora»</b>.</p>
                <div class="conector-url"><code>${escapeHtml(url)}</code></div>
                <button class="btn-modal-primary" style="margin:10px 0 16px" onclick="atajoCopiar('${url}', 'Enlace copiado')">copiar enlace.</button>
                <ol class="conector-pasos atajo-pasos">
                    <li>Abre <b>Atajos</b>, pulsa <b>+</b> y llámalo <b>Apunta en Bitácora</b>: esa frase es la que dirás a Siri.</li>
                    <li>Añade la acción <b>Dictar texto</b>.</li>
                    <li>Añade <b>Obtener contenido de URL</b>, pega el enlace y, en su flecha: método <b>POST</b>, cuerpo de la solicitud <b>JSON</b>, un campo de texto llamado <b>texto</b> con el valor <b>Texto dictado</b>.</li>
                    <li>Añade <b>Leer texto</b> (o <b>Mostrar resultado</b>) con el <b>Contenido de la URL</b>: Siri te confirmará lo que ha apuntado.</li>
                </ol>
                <div class="atajo-ejemplos">
                    <span>«dentista el martes a las 10»</span><span>«25 euros de gasolina»</span><span>«comprar leche y huevos»</span><span>«cumple de Lucía el 3 de mayo»</span>
                </div>
                <p class="finance-modal-note">Lo dictado pasa por el mismo intérprete que el + de la app: entra como tarea, evento, gasto, compra o lo que toque, y se puede deshacer desde «lo que has apuntado.». Este enlace solo sirve para apuntar; si lo pierdes o lo compartes por error, <a href="#" onclick="event.preventDefault();if(confirm('¿Cambiar el enlace? El atajo actual dejará de funcionar hasta que pegues el nuevo.'))openAtajoSiri(true)">cámbialo</a>.</p>
            `);
        }

        async function openAtajoCorreo(nuevo) {
            if (!servicios.correoToken || nuevo) { if (!(await atajoToken('correo'))) return; atajoRepintarAjustes(); }
            const dir = `${servicios.correoToken}@${CORREO_DOMINIO}`;
            showModal(`
                <div class="modal-title">tu correo.</div>
                <p class="finance-modal-note" style="margin-top:0">Tu dirección para reenviar cosas a Bitácora. Guárdala como contacto, «Bitácora», para tenerla a mano al reenviar.</p>
                <div class="conector-url atajo-correo"><code>${escapeHtml(dir)}</code></div>
                <button class="btn-modal-primary" style="margin:10px 0 16px" onclick="atajoCopiar('${dir}', 'Dirección copiada')">copiar dirección.</button>
                <div class="atajo-correo-lista">
                    <div><b>vuelos, trenes y autobuses.</b><span>Un evento a la hora de salida, con el número de reserva.</span></div>
                    <div><b>hoteles y apartamentos.</b><span>La entrada en el calendario, con la salida en las notas.</span></div>
                    <div><b>entradas y restaurantes.</b><span>El concierto, el partido o la cena, con su sitio.</span></div>
                    <div><b>pedidos.</b><span>Un envío nuevo en Envíos, con su número de seguimiento.</span></div>
                    <div><b>cualquier otro correo.</b><span>Queda en tus tareas pendientes, con el asunto y quién lo manda.</span></div>
                </div>
                <p class="finance-modal-note">Lo leen mejor los correos que traen sus datos por dentro, como muchos de aerolíneas, Renfe, Booking, Airbnb, Ticketmaster o TheFork; el resto queda como tarea. Si alguien que no debe conoce la dirección, <a href="#" onclick="event.preventDefault();if(confirm('¿Cambiar la dirección? La actual dejará de funcionar.'))openAtajoCorreo(true)">cambia la dirección</a>.</p>
            `);
        }
