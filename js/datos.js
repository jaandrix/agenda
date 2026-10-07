        // ============================================================
        //  LOAD / SAVE (SUPABASE)
        // ============================================================
        async function loadData() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) {
                    entries = [];
                    categories = getDefaultCategories();
                    notes = [];
                    prompts = [];
                    userName = '';
                    filteredEntries = [];
                    investmentData = { initial: 0, rate: 7, monthly: 0 };
                    return true;
                }
                const { data, error } = await sb.from('bitacora').select('data').eq('user_id', user.id).maybeSingle();
                if (error) throw error;
                const saved = (data && data.data) ? data.data : {};
                datosBase = Object.fromEntries(Object.keys(DATOS_SINCRONIZADOS).map(k => [k, clonarDatos(saved[k])]));
                entries = saved.entries || [];
                normalizeWorkCotizationData();
                categories = saved.categories || getDefaultCategories();
                // El rosa de "Evento" (en cualquiera de sus dos tonos
                // anteriores) pasa a negro — a quien ya tuviera la categoría
                // creada se le actualiza sola, una única vez.
                const eventCat = categories.find(c => c.id === 'cat_evento');
                if (eventCat && (eventCat.color === '#ec4899' || eventCat.color === '#f9a8d4')) eventCat.color = '#000000';
                notes = saved.notes || [];
                prompts = saved.prompts || [];
                userName = saved.userName || '';
                investmentData = saved.investmentData || { initial: 0, rate: 7, monthly: 0 };
                migrateInvestmentData();
                inbox = saved.inbox || [];
                registroConector = Array.isArray(saved.registroConector) ? saved.registroConector : [];
                analisisIA = saved.analisisIA || null;
                preferenciasAvisos = (saved.preferenciasAvisos && typeof saved.preferenciasAvisos === 'object') ? saved.preferenciasAvisos : {};
                ciudadTiempo = saved.ciudadTiempo || null;
                pedidos = Array.isArray(saved.pedidos) ? saved.pedidos : [];
                hansei = Array.isArray(saved.hansei) ? saved.hansei : [];
                apartadosConfig = (saved.apartadosConfig && typeof saved.apartadosConfig === 'object') ? saved.apartadosConfig : null;
                perfilLaboral = (saved.perfilLaboral && typeof saved.perfilLaboral === 'object') ? saved.perfilLaboral : null;
                financeIncome = saved.financeIncome || { current: 0, next: 0 };
                financeProfile = saved.financeProfile || {
                    cash: 0, cashTarget: 0, invested: 0, investedTarget: 0,
                    emergency: 0, emergencyTarget: 0, vacation: 0, vacationTarget: 0,
                    salaryForecast: {}, history: []
                };
                financeProfile.salaryForecast = financeProfile.salaryForecast || {};
                financeProfile.history = Array.isArray(financeProfile.history) ? financeProfile.history : [];
                financeProfile.oneOffIncome = Array.isArray(financeProfile.oneOffIncome) ? financeProfile.oneOffIncome : [];
                financeProfile.movements = Array.isArray(financeProfile.movements) ? financeProfile.movements : [];
                financeProfile.customAccounts = Array.isArray(financeProfile.customAccounts) ? financeProfile.customAccounts : [];
                financeProfile.salaryReal = (financeProfile.salaryReal && typeof financeProfile.salaryReal === 'object') ? financeProfile.salaryReal : {};
                financeProfile.investmentContributions = Array.isArray(financeProfile.investmentContributions) ? financeProfile.investmentContributions : [];
                financeProfile.chartSeries = Array.isArray(financeProfile.chartSeries) ? financeProfile.chartSeries : [];
                financeProfile.budgets = (financeProfile.budgets && typeof financeProfile.budgets === 'object') ? financeProfile.budgets : {};
                financeProfile.savingsGoals = Array.isArray(financeProfile.savingsGoals) ? financeProfile.savingsGoals : [];
                financeProfile.recordatorioDia = Number.isFinite(financeProfile.recordatorioDia) ? financeProfile.recordatorioDia : null;
                financeProfile.ultimoCierreMensual = financeProfile.ultimoCierreMensual || null;
                financePro = saved.financePro || financePro;
                financePro.enabled = !!financePro.enabled;
                financePro.accounts = (financePro.accounts && typeof financePro.accounts === 'object') ? financePro.accounts : {};
                ['efectivo', 'bancos', 'online'].forEach(k => {
                    financePro.accounts[k] = financePro.accounts[k] || { name: k[0].toUpperCase() + k.slice(1), balance0: 0 };
                });
                financePro.categories = Array.isArray(financePro.categories) && financePro.categories.length ? financePro.categories : financeProDefaultCategories();
                // Categorías nuevas (Inversiones/Coleccionables/Gasolina como
                // gasto) — se añaden a cuentas que ya tenían categorías
                // guardadas de antes, sin tocar las que el usuario ya tiene.
                financeProDefaultCategories().forEach(def => {
                    if (!financePro.categories.some(c => c.id === def.id)) financePro.categories.push(def);
                });
                // "Regalos" pasa a llamarse "Aportaciones" — renombra la
                // categoría ya existente en la cuenta (una sola vez), no
                // solo la etiqueta por defecto para cuentas nuevas.
                const cat_regalo = financePro.categories.find(c => c.id === 'cat_regalo');
                if (cat_regalo && cat_regalo.name === 'Regalos') cat_regalo.name = 'Aportaciones';
                financePro.transactions = Array.isArray(financePro.transactions) ? financePro.transactions : [];
                financePro.categoryBudgets = (financePro.categoryBudgets && typeof financePro.categoryBudgets === 'object') ? financePro.categoryBudgets : {};
                financePro.rules = Array.isArray(financePro.rules) ? financePro.rules : [];
                financePro.programados = Array.isArray(financePro.programados) ? financePro.programados : [];
                // Migración: los antiguos "ingresos puntuales" pasan a formar parte
                // del registro unificado de movimientos (una sola vez).
                if (financeProfile.oneOffIncome.length && !financeProfile._oneOffMigrated) {
                    financeProfile.movements = [
                        ...financeProfile.oneOffIncome.map(x => ({
                            id: x.id || ('income_' + Date.now() + Math.random().toString(36).slice(2, 6)),
                            type: 'income', label: x.label, amount: Number(x.amount) || 0,
                            date: x.date, addedToCash: !!x.addedToCash
                        })),
                        ...financeProfile.movements
                    ];
                    financeProfile._oneOffMigrated = true;
                }
                // Si aún no existe una cifra manual para inversiones, tomamos como
                // punto de partida el valor real de la cartera ya registrada.
                if (!(Number(financeProfile.invested) > 0) && typeof portfolioCurrentValue === 'function') {
                    financeProfile.invested = portfolioCurrentValue();
                }
                plannedTrips = saved.plannedTrips || [];
                // Migración única: el antiguo "Organizador de Viajes" (viajes
                // planeados aparte, con una sola checklist) se retira — cada uno
                // pasa a ser un viaje normal con su propio Gestor de viajes, y su
                // checklist se conserva como una lista llamada "Preparativos".
                if (plannedTrips.length) {
                    plannedTrips.forEach(pt => {
                        // Por si la migración se repitiera antes de que el borrado de
                        // plannedTrips llegara a guardarse (recarga rápida): no duplicar.
                        if (pt.id && entries.some(e => e.id === pt.id)) return;
                        entries.push({
                            id: pt.id || ('entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
                            type: 'travel',
                            title: pt.title || 'Viaje',
                            destination: pt.destination || '',
                            startDate: pt.startDate || '',
                            endDate: pt.endDate || '',
                            companions: '',
                            notes: '',
                            expenses: [],
                            places: [],
                            itinerario: [],
                            listas: (pt.checklist && pt.checklist.length) ? [{
                                id: 'lista_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                                nombre: 'Preparativos',
                                items: pt.checklist.map(c => ({ id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), texto: c.text, hecho: !!c.done }))
                            }] : [],
                            createdAt: pt.createdAt || new Date().toISOString()
                        });
                    });
                    plannedTrips = [];
                    filteredEntries = [...entries];
                    // Se guarda de inmediato para que el borrado de plannedTrips
                    // quede en la nube y la migración no se repita en la próxima
                    // carga (si no, cada recarga duplicaría los viajes migrados).
                    if (typeof saveData === 'function') saveData().catch(e => console.error('Error guardando tras migrar viajes planeados:', e));
                }
                apuntes = saved.apuntes || [];
                weeklyTasks = Array.isArray(saved.weeklyTasks) ? saved.weeklyTasks : [];
                cultureLists = Array.isArray(saved.cultureLists) ? saved.cultureLists : [];
                habits = Array.isArray(saved.habits) ? saved.habits : [];
                habits.forEach(h => { h.completadas = h.completadas && typeof h.completadas === 'object' ? h.completadas : {}; });
                collectibleCategories = Array.isArray(saved.collectibleCategories) && saved.collectibleCategories.length
                    ? saved.collectibleCategories
                    : [{ id: 'cat_cartas', name: 'Cartas' }, { id: 'cat_videojuegos', name: 'Videojuegos' }];
                collectibles = Array.isArray(saved.collectibles) ? saved.collectibles : [];
                dayPlanner = migratePlannerData(saved.dayPlanner);
                recurringTasks = Array.isArray(saved.recurringTasks) ? saved.recurringTasks : [];
                recurringTasks.forEach(t => { t.completadas = t.completadas && typeof t.completadas === 'object' ? t.completadas : {}; });
                dailyEffort = (saved.dailyEffort && typeof saved.dailyEffort === 'object') ? saved.dailyEffort : {};
                financeProfile.chartHistory = Array.isArray(financeProfile.chartHistory) ? financeProfile.chartHistory : [];
                financeProfile.forecastProfile = financeProfile.forecastProfile || { salary: 0, contractMonths: 0, emergencyMonthlyPlan: 0, vacationMonthlyPlan: 0, investMonthlyPlan: 0 };
                blurFinances = !!saved.blurFinances;
                studies = (saved.studies && typeof saved.studies === 'object') ? saved.studies : { subjects: [], schedule: { lun: [], mar: [], mie: [], jue: [], vie: [], sab: [], dom: [] }, notes: '' };
                studies.subjects = Array.isArray(studies.subjects) ? studies.subjects : [];
                studies.schedule = studies.schedule && typeof studies.schedule === 'object' ? studies.schedule : {};
                STUDIES_DAYS.forEach(d => { studies.schedule[d.key] = Array.isArray(studies.schedule[d.key]) ? studies.schedule[d.key] : []; });
                studies.quickNotes = Array.isArray(studies.quickNotes) ? studies.quickNotes : [];
                if (typeof studies.notes === 'string' && studies.notes.trim() && !studies.quickNotes.length) {
                    studies.quickNotes.push({ id: 'qn_migrated_' + Date.now(), text: studies.notes.trim(), createdAt: new Date().toISOString() });
                }
                delete studies.notes;
                links = Array.isArray(saved.links) ? saved.links : [];
                linkCategories = Array.isArray(saved.linkCategories) ? saved.linkCategories : [];
                resetDayPlannerIfNeeded();
                // Los trabajos con fecha que ya existían antes de que el
                // Planificador supiera reflejarlos también aparecen ahí
                // (idempotente: no duplica los que ya se hubieran creado).
                studies.subjects.forEach(s => (s.assignments || []).forEach(item => { if (item.date) syncAssignmentPlannerItem(s, item); }));
            } catch (e) {
                console.error('Error cargando datos de Supabase:', e);
                return false;
            }
            if (!categories || categories.length === 0) categories = getDefaultCategories();
            categories.forEach(c => { if (!c.id) c.id = 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2,
                    6); });
            filteredEntries = [...entries];
            invalidarCachesDerivadas();
            updatePageTitle();
            return true;
        }

        // Apuntes se edita en una página independiente. Para evitar que una
        // Bitácora abierta con datos antiguos sobrescriba los apuntes recién
        // guardados, solo usamos la copia local de "apuntes" cuando procede
        // de una importación explícita. En el resto de guardados conservamos
        // siempre la versión más reciente que haya en Supabase.
        let apuntesDirty = false;
        // ============================================================
        //  FUSIÓN CON LA NUBE
        //  Cada dispositivo guarda en datosBase cómo estaban sus datos en
        //  la nube la última vez que los leyó o escribió. Al guardar (o al
        //  volver a la app) se fusiona a tres bandas, apartado por apartado:
        //  lo que solo cambió aquí gana, lo que solo cambió en la nube se
        //  respeta, y en las listas con id (eventos, movimientos, tareas...)
        //  se combinan los elementos uno a uno. Antes cada apartado se
        //  escribía entero con lo que hubiera en memoria, y un dispositivo
        //  que llevaba rato abierto borraba lo que otro (o Claude) acababa
        //  de añadir: así se perdieron dos eventos el 2026-10-06.
        // ============================================================
        const DATOS_SINCRONIZADOS = {
            entries: [() => entries, v => { entries = v; filteredEntries = [...v]; }],
            categories: [() => categories, v => { categories = v; }],
            userName: [() => userName, v => { userName = v; }],
            investmentData: [() => investmentData, v => { investmentData = v; }],
            notes: [() => notes, v => { notes = v; }],
            prompts: [() => prompts, v => { prompts = v; }],
            inbox: [() => inbox, v => { inbox = v; }],
            registroConector: [() => registroConector, v => { registroConector = v; }],
            analisisIA: [() => analisisIA, v => { analisisIA = v; }],
            preferenciasAvisos: [() => preferenciasAvisos, v => { preferenciasAvisos = v; }],
            ciudadTiempo: [() => ciudadTiempo, v => { ciudadTiempo = v; }],
            financeIncome: [() => financeIncome, v => { financeIncome = v; }],
            financeProfile: [() => financeProfile, v => { financeProfile = v; }],
            financePro: [() => financePro, v => { financePro = v; }],
            plannedTrips: [() => plannedTrips, v => { plannedTrips = v; }],
            weeklyTasks: [() => weeklyTasks, v => { weeklyTasks = v; }],
            cultureLists: [() => cultureLists, v => { cultureLists = v; }],
            habits: [() => habits, v => { habits = v; }],
            collectibleCategories: [() => collectibleCategories, v => { collectibleCategories = v; }],
            collectibles: [() => collectibles, v => { collectibles = v; }],
            dayPlanner: [() => dayPlanner, v => { dayPlanner = v; }],
            recurringTasks: [() => recurringTasks, v => { recurringTasks = v; }],
            dailyEffort: [() => dailyEffort, v => { dailyEffort = v; }],
            studies: [() => studies, v => { studies = v; }],
            links: [() => links, v => { links = v; }],
            linkCategories: [() => linkCategories, v => { linkCategories = v; }],
            blurFinances: [() => blurFinances, v => { blurFinances = v; }],
            pedidos: [() => pedidos, v => { pedidos = v; }],
            hansei: [() => hansei, v => { hansei = v; }],
            apartadosConfig: [() => apartadosConfig, v => { apartadosConfig = v; }],
            perfilLaboral: [() => perfilLaboral, v => { perfilLaboral = v; }]
        };
        let datosBase = null;
        const clonarDatos = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
        // Comparación sin depender del orden de las claves: la nube (jsonb)
        // devuelve los objetos con las claves en otro orden que la memoria.
        const canonico = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, c) => (o[c] = x[c], o), {}) : x);
        const mismoValor = (a, b) => canonico(a) === canonico(b);
        const esObjetoPlano = v => !!v && typeof v === 'object' && !Array.isArray(v);
        const idsUnicos = a => a.every(x => esObjetoPlano(x) && x.id != null) && new Set(a.map(x => String(x.id))).size === a.length;

        function fusionarTresBandas(base, local, nube) {
            if (mismoValor(local, base)) return nube;
            if (mismoValor(nube, base) || mismoValor(local, nube)) return local;
            if (esObjetoPlano(local) && esObjetoPlano(nube)) {
                const b = esObjetoPlano(base) ? base : {};
                const r = {};
                new Set([...Object.keys(local), ...Object.keys(nube)]).forEach(k => {
                    const v = fusionarTresBandas(b[k], local[k], nube[k]);
                    if (v !== undefined) r[k] = v;
                });
                return r;
            }
            if (Array.isArray(local) && Array.isArray(nube) && (local.length || nube.length) && idsUnicos(local) && idsUnicos(nube)) {
                const mapa = a => new Map((Array.isArray(a) ? a : []).filter(esObjetoPlano).map(x => [String(x.id), x]));
                const B = mapa(base), L = mapa(local), N = mapa(nube);
                const decidir = id => {
                    const b = B.get(id), l = L.get(id), n = N.get(id);
                    if (l && n) return fusionarTresBandas(b, l, n);
                    // Solo está en un lado: o es nuevo, o el otro lado lo
                    // borró; un borrado gana salvo que este lado lo cambiara.
                    const unico = l || n;
                    return b && mismoValor(unico, b) ? undefined : unico;
                };
                const r = [], vistos = new Set();
                [...local, ...nube].forEach(x => {
                    const id = String(x.id);
                    if (vistos.has(id)) return;
                    vistos.add(id);
                    const v = decidir(id);
                    if (v !== undefined) r.push(v);
                });
                return r;
            }
            return local;
        }

        // Fusiona la nube con la memoria y deja la memoria con el resultado.
        function aplicarFusionConNube(nube) {
            const fusion = {};
            let cambiado = false;
            Object.entries(DATOS_SINCRONIZADOS).forEach(([k, [leer, escribir]]) => {
                const local = leer();
                let v = datosBase ? fusionarTresBandas(datosBase[k], local, nube[k]) : local;
                if (v === undefined) v = local;
                fusion[k] = v;
                if (v !== local && !mismoValor(v, local)) { escribir(v); cambiado = true; }
            });
            return { fusion, cambiado };
        }

        // Al volver a la app: trae lo último de la nube sin escribir nada,
        // para que un dispositivo abierto desde hace rato no enseñe datos
        // viejos. Va en la misma cola que los guardados.
        let ultimaSincronizacion = 0;
        function sincronizarDesdeNube() {
            if (!datosBase || Date.now() - ultimaSincronizacion < 15000) return;
            ultimaSincronizacion = Date.now();
            saveChain = saveChain.then(async () => {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const { data, error } = await sb.from('bitacora').select('data').eq('user_id', user.id).maybeSingle();
                if (error || !data) return;
                const nube = data.data || {};
                const { cambiado } = aplicarFusionConNube(nube);
                datosBase = Object.fromEntries(Object.keys(DATOS_SINCRONIZADOS).map(k => [k, clonarDatos(nube[k])]));
                if (cambiado) { invalidarCachesDerivadas(); render(); }
            }).catch(e => console.error('No se pudo sincronizar con la nube:', e));
        }

        let saveChain = Promise.resolve();

        function saveData() {
            invalidarCachesDerivadas();
            const attempt = saveChain.then(doSaveData, doSaveData);
            saveChain = attempt.catch(() => {});
            // doSaveData mezcla con lo último de Supabase (otra pestaña u
            // otro dispositivo), así que al terminar los datos pueden haber
            // cambiado otra vez.
            attempt.finally(invalidarCachesDerivadas).catch(() => {});
            return attempt;
        }

        // Cálculos caros que dependen de todos los datos (patrones de Home,
        // actividad por día) se guardan entre pintados; cualquier cambio de
        // datos pasa por saveData() o por loadData(), que los invalidan.
        function invalidarCachesDerivadas() {
            patronesCache = null;
            actividadPorDiaCache = null;
        }

        // Clave de semana ISO (año-Wsemana), usada para no disparar el
        // snapshot más de una vez por semana.
        function isoWeekKey(d = new Date()) {
            const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            const dayNum = date.getUTCDay() || 7;
            date.setUTCDate(date.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
            return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
        }

        async function doSaveData() {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) throw new Error('No hay sesión activa');

            // Leer la versión más reciente antes de escribir. Esto evita que
            // una pestaña antigua de Bitácora borre cambios hechos desde
            // /apuntes/.
            const { data: latestRow, error: readError } = await sb
                .from('bitacora')
                .select('data')
                .eq('user_id', user.id)
                .maybeSingle();

            if (readError) throw readError;

            const latestData = (latestRow && latestRow.data) ? latestRow.data : {};
            const latestApuntes = Array.isArray(latestData.apuntes) ? latestData.apuntes : [];
            const currentWeek = isoWeekKey();
            const lastSnapshotWeek = latestData._meta?.lastSnapshotWeek || '';
            const needsSnapshot = lastSnapshotWeek !== currentWeek;

            const { fusion, cambiado } = aplicarFusionConNube(latestData);
            const mergedData = {
                ...latestData,
                ...fusion,
                // Solo sustituir los apuntes remotos cuando el usuario ha
                // importado deliberadamente un archivo que los contiene.
                apuntes: apuntesDirty ? apuntes : latestApuntes,
                _meta: { ...(latestData._meta || {}), lastSnapshotWeek: needsSnapshot ? currentWeek : lastSnapshotWeek }
            };

            // En vez de reescribir siempre el bloque de datos entero, se
            // envía solo lo que de verdad cambió desde la lectura de arriba
            // (comparando clave a clave de primer nivel). Una función de
            // Supabase hace el merge en el servidor. Si esa función todavía
            // no existe (o falla por cualquier otro motivo), se cae al
            // guardado completo de siempre — nunca se pierde un guardado
            // por este cambio, en el peor caso solo no se ahorra nada.
            const patch = {};
            Object.keys(mergedData).forEach(key => {
                if (JSON.stringify(mergedData[key]) !== JSON.stringify(latestData[key])) {
                    patch[key] = mergedData[key];
                }
            });

            if (Object.keys(patch).length > 0) {
                const { error: patchError } = await sb.rpc('merge_bitacora_data', { p_patch: patch });
                if (patchError) {
                    const { error: fallbackError } = await sb.from('bitacora').upsert({
                        user_id: user.id,
                        data: mergedData,
                        updated_at: new Date().toISOString()
                    });
                    if (fallbackError) throw fallbackError;
                }
            }

            datosBase = clonarDatos(fusion);
            if (cambiado) setTimeout(() => { invalidarCachesDerivadas(); render(); }, 0);

            // Mantener la memoria local sincronizada con lo que realmente
            // quedó almacenado.
            if (!apuntesDirty) apuntes = latestApuntes;
            apuntesDirty = false;

            // Snapshot semanal de seguridad: como mucho una escritura extra
            // por semana (no en cada guardado), y solo se conservan las
            // últimas 12. Si la tabla bitacora_snapshots no existe todavía
            // en Supabase, esto falla en silencio sin romper el guardado
            // normal — ver nota de configuración.
            if (needsSnapshot) {
                try {
                    await sb.from('bitacora_snapshots').insert({ user_id: user.id, week_key: currentWeek, data: mergedData });
                    const { data: oldSnapshots } = await sb.from('bitacora_snapshots')
                        .select('id').eq('user_id', user.id).order('created_at', { ascending: false });
                    if (Array.isArray(oldSnapshots) && oldSnapshots.length > 12) {
                        const idsToDelete = oldSnapshots.slice(12).map(r => r.id);
                        await sb.from('bitacora_snapshots').delete().in('id', idsToDelete);
                    }
                } catch (snapErr) {
                    console.error('No se pudo guardar el snapshot semanal:', snapErr);
                }
            }

            bitacoraNativeSyncSnapshot();
        }

        // ============================================================
        //  PUENTE CON LA APP NATIVA DE iOS (widgets)
        //  La app nativa envuelve esta misma web en un WKWebView y registra
        //  un manejador de mensajes llamado "bitacoraNative". Cada vez que
        //  se guarda algo, le mandamos un resumen (racha, tareas de hoy,
        //  saldo, próximos eventos) que la app nativa deja en un App Group
        //  para que los widgets lo lean sin conexión. En la PWA/web normal
        //  ese manejador no existe, así que esto no hace nada.
        // ============================================================
        function bitacoraActivityDates() {
            const dates = new Set();
            (entries || []).forEach(e => { if (e && e.date && !isCalendarLogEntry(e)) dates.add(String(e.date).slice(0, 10)); });
            (financePro && Array.isArray(financePro.transactions) ? financePro.transactions : []).forEach(t => { if (t && t.date) dates.add(String(t.date).slice(0, 10)); });
            return dates;
        }

        // Racha de días seguidos con algo añadido/editado en Bitácora. Si
        // hoy todavía no hay actividad no se da la racha por rota hasta que
        // acabe el día — se cuenta hacia atrás desde ayer mientras tanto.
        function bitacoraUpdateStreak() {
            const dates = bitacoraActivityDates();
            const today = new Date();
            const todayStr = today.toISOString().slice(0, 10);
            const cursor = new Date(today);
            if (!dates.has(todayStr)) cursor.setDate(cursor.getDate() - 1);
            let streak = 0;
            while (dates.has(cursor.toISOString().slice(0, 10))) {
                streak++;
                cursor.setDate(cursor.getDate() - 1);
            }
            return streak;
        }

        function bitacoraSnapshotPayload() {
            const today = todayISO();
            const tasksToday = (typeof plannerItemsForOffset === 'function' ? plannerItemsForOffset(0) : [])
                .slice(0, 7)
                .map(it => ({ done: !!it.done }));
            const todaysEvents = (entries || [])
                .filter(e => e.type === 'event' && e.date === today && !isCalendarLogEntry(e))
                .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
                .slice(0, 3)
                .map(e => ({ time: e.time || '', title: e.title || '' }));
            let balancePct = null;
            if (financePro && financePro.enabled) {
                try { balancePct = financeProStatsData().pctVsPrevMonth; } catch (e) { balancePct = null; }
            }
            return {
                streakDays: bitacoraUpdateStreak(),
                tasksToday,
                balance: (financePro && financePro.enabled) ? financeProTotalBalance() : 0,
                balancePct,
                events: todaysEvents,
                updatedAtISO: new Date().toISOString()
            };
        }

        function bitacoraNativeSyncSnapshot() {
            try {
                if (!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bitacoraNative)) return;
                window.webkit.messageHandlers.bitacoraNative.postMessage(JSON.stringify(bitacoraSnapshotPayload()));
            } catch (e) { console.error('bitacoraNativeSyncSnapshot', e); }
        }

        // Cuando un widget abre la app con bitacora://quick?type=expense|income
        // (ver ContentView.swift), la app nativa carga
        // https://appbitacora.es/?quick=expense — aquí se detecta y se abre
        // el registro rápido de Finanzas PRO ya preparado en ese tipo.
        function handleWidgetDeepLink() {
            const params = new URLSearchParams(window.location.search);
            const quick = params.get('quick');
            if (quick !== 'expense' && quick !== 'income') return;
            history.replaceState(null, '', window.location.pathname + window.location.hash);
            if (!financePro || !financePro.enabled) { showToast('Activa el modo PRO de Finanzas para usar el registro rápido', true); return; }
            switchView('finance');
            setTimeout(() => {
                if (typeof openFinanceProQuickCaptureModal === 'function') {
                    openFinanceProQuickCaptureModal();
                    if (typeof financeProQuickSet === 'function') financeProQuickSet('type', quick);
                }
            }, 150);
        }

        // Normaliza registros laborales antiguos para que el nuevo sistema
        // de estimación/corrección sea compatible con los datos existentes.
        function normalizeWorkCotizationData() {
            entries.forEach(entry => {
                if (entry.type !== 'work') return;
                if (entry.cotizationType !== 'practicas' && entry.cotizationType !== 'general') {
                    entry.cotizationType = 'general';
                }
                if (entry.cotizedDays !== null && entry.cotizedDays !== undefined && entry.cotizedDays !== '') {
                    const n = Number(entry.cotizedDays);
                    entry.cotizedDays = Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
                } else {
                    entry.cotizedDays = null;
                }
            });
        }

        // ============================================================
        //  USER NAME
        // ============================================================
        function updatePageTitle() {
            const titleEl = document.getElementById('page-title');
            const hasName = userName && userName.trim();
            const nameDisplay = hasName ? escapeHtml(userName.trim()) : 'tu nombre';
            const nameLink = `<a href="javascript:void(0)" class="username-link" onclick="editUserName()">${nameDisplay}</a><span class="title-period">.</span>`;
            if (currentView === 'calendar') {
                const greeting = greetingText().replace(/\.$/, '');
                titleEl.innerHTML = `Home - ${greeting} ${nameLink}`;
            } else {
                const baseTitle = VIEW_LABELS[currentView] || 'Home';
                titleEl.innerHTML = `${baseTitle} de ${nameLink}`;
            }
            updateAddButton();
        }

        async function editUserName() {
            const name = prompt('¿Cómo quieres que aparezca tu nombre?', userName || '');
            if (name !== null) {
                userName = name.trim();
                updatePageTitle();
                try {
                    await saveData();
                    showToast('Nombre guardado');
                } catch (err) {
                    console.error('Error guardando el nombre en Supabase:', err);
                    showToast('No se pudo guardar en la nube. Revisa tu conexión.', true);
                }
            }
        }

        // ============================================================
        //  ADD BUTTON
        // ============================================================
        function updateAddButton() {
            const btn = document.getElementById('add-section-btn');
            if (!btn) return;
            let type = VIEW_TO_ENTRY_TYPE[currentView];
            if (currentView === 'culture') {
                type = ({ books: 'book', series: 'series', movies: 'movie', games: 'game' })[cultureTab] || 'book';
            } else if (currentView === 'travels') {
                type = travelPlacesTab === 'places' ? 'place' : 'travel';
            }
            if (type) {
                btn.style.display = 'flex';
                btn.onclick = () => openNewEntry(type);
            } else {
                btn.style.display = 'none';
            }
        }

        function openSectionAdd() {
            const type = VIEW_TO_ENTRY_TYPE[currentView];
            if (type) openNewEntry(type);
        }

        const FAB_ICON_DEFAULT = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M13 2 3 14h6l-1 8 10-12h-6z"/></svg>';

        // El FAB (captura rápida) cambia de icono según el apartado activo
        // y añade un anillo de pulso cuando hay uno contextual — misma idea
        // que el resto de icono TARJETA BITACORA, sin cambiar su acción
        // (sigue abriendo la paleta de comandos / tecla ESPACIO).
        function updateFabIcon() {
            const fab = document.getElementById('fab');
            if (!fab) return;
            if (currentView === 'work') {
                fab.innerHTML = FAB_ICON_DEFAULT;
                fab.classList.add('fab-pulse');
                fab.title = 'Captura rápida · Empleo (tecla ESPACIO)';
            } else {
                fab.innerHTML = FAB_ICON_DEFAULT;
                fab.classList.remove('fab-pulse');
                fab.title = 'Captura rápida (tecla ESPACIO)';
            }
        }

        // ============================================================
        //  THEME
        // ============================================================
        // Dos tonos únicos — "asfalto" (oscuro, por defecto, sin clase en
        // <body>) y "papel" (claro, body.papel). Sustituyen a los tres
        // temas anteriores (oscuro puro / claro puro / beige).
        const THEMES = ['asfalto', 'papel', 'acuarela', 'fundador'];
        const THEME_LABELS = { asfalto: 'asfalto', papel: 'papel', acuarela: 'teja', fundador: 'fundador' };
        // Teja (antes acuarela, de ahí la clave y la clase) es un tema
        // claro: lleva también la clase papel para heredar todos los
        // ajustes de tema claro, y encima los suyos (body.acuarela).
        // Fundador: oscuro con dorado, solo para socios fundadores.
        const THEME_CLASSES = { asfalto: [], papel: ['papel'], acuarela: ['papel', 'acuarela'], fundador: ['fundador'] };
        // Los temas antiguos ('dark'/'light'/'beige') que ya hubiera
        // guardados en localStorage de sesiones previas migran al tono más
        // parecido la primera vez que se cargan, para no cambiarle el tema
        // a quien ya tenía uno elegido.
        const THEME_MIGRATION = { dark: 'asfalto', light: 'papel', beige: 'papel' };

        function loadTheme() {
            let theme = localStorage.getItem('bitacora_theme') || 'asfalto';
            if (THEME_MIGRATION[theme]) {
                theme = THEME_MIGRATION[theme];
                localStorage.setItem('bitacora_theme', theme);
            }
            aplicarClasesTema(THEMES.includes(theme) ? theme : 'asfalto');
        }

        function aplicarClasesTema(tema) {
            ['papel', 'acuarela', 'fundador'].forEach(c => document.body.classList.remove(c));
            (THEME_CLASSES[tema] || []).forEach(c => document.body.classList.add(c));
        }

        function temaActual() {
            const guardado = localStorage.getItem('bitacora_theme');
            return THEMES.includes(guardado) ? guardado : 'asfalto';
        }

        function setTheme(tema) {
            aplicarClasesTema(tema);
            localStorage.setItem('bitacora_theme', tema);
            document.querySelectorAll('.tema-opcion').forEach(b => b.classList.toggle('active', b.dataset.tema === tema));
            showToast('Tema cambiado a ' + THEME_LABELS[tema]);
        }

        function temasDisponibles() {
            return THEMES.filter(t => t !== 'fundador' || suscripcionActual?.estado === 'fundador');
        }

        function toggleTheme() {
            const temas = temasDisponibles();
            setTheme(temas[(temas.indexOf(temaActual()) + 1) % temas.length]);
        }

        function renderSelectorTema() {
            const actual = temaActual();
            const muestras = { asfalto: ['#302f2c', '#3a3934', '#efede3'], papel: ['#FAF8F5', '#ffffff', '#302f2c'], acuarela: ['#E7E2D9', '#EE4B1F', '#161514'], fundador: ['#1a1916', '#d4b06a', '#f1ead8'] };
            return `<div class="tema-selector">${temasDisponibles().map(t => `
                <button class="tema-opcion ${t === actual ? 'active' : ''}" data-tema="${t}" onclick="setTheme('${t}')">
                    <span class="tema-muestra">${muestras[t].map(c => `<span style="background:${c}"></span>`).join('')}</span>
                    <span>${THEME_LABELS[t]}.</span>
                </button>`).join('')}</div>`;
        }

        // ============================================================
        //  TIPOGRAFÍA (Ajustes) — cambia var(--font-family) al vuelo, sin
        //  recargar. Guardado por dispositivo en localStorage, igual que
        //  el tema.
        // ============================================================
        const FONT_OPTIONS = [
            { id: 'poppins', label: 'Poppins', stack: "'Poppins', -apple-system, system-ui, sans-serif" },
            { id: 'inter', label: 'Inter', stack: "'Inter', -apple-system, system-ui, sans-serif" },
            { id: 'space-grotesk', label: 'Space Grotesk', stack: "'Space Grotesk', -apple-system, system-ui, sans-serif" },
            { id: 'dm-sans', label: 'DM Sans', stack: "'DM Sans', -apple-system, system-ui, sans-serif" },
            { id: 'lora', label: 'Lora', stack: "'Lora', Georgia, serif" },
            { id: 'jetbrains-mono', label: 'JetBrains Mono', stack: "'JetBrains Mono', 'Courier New', monospace" }
        ];

        function loadFontPref() {
            const id = localStorage.getItem('bitacora_font') || 'poppins';
            const opt = FONT_OPTIONS.find(f => f.id === id) || FONT_OPTIONS[0];
            document.documentElement.style.setProperty('--font-family', opt.stack);
        }

        function setFontPref(id) {
            const opt = FONT_OPTIONS.find(f => f.id === id);
            if (!opt) return;
            document.documentElement.style.setProperty('--font-family', opt.stack);
            localStorage.setItem('bitacora_font', id);
            const container = document.getElementById('font-options-container');
            if (container) container.innerHTML = renderFontOptionsList();
            showToast('Letra cambiada a ' + opt.label);
        }

        function renderFontOptionsList() {
            const current = localStorage.getItem('bitacora_font') || 'poppins';
            return `<div class="font-option-list">${FONT_OPTIONS.map(f => `
                <div class="font-option-row${f.id === current ? ' font-option-row-active' : ''}" onclick="setFontPref('${f.id}')">
                    <div class="font-option-preview" style="font-family:${f.stack}">${escapeHtml(f.label)}</div>
                    <div class="font-option-check">${f.id === current ? '✓' : ''}</div>
                </div>`).join('')}</div>`;
        }

        let modeWide = false;

        function toggleMode() {
            modeWide = !modeWide;
            document.getElementById('app').style.maxWidth = modeWide ? '100%' : '1200px';
        }

        // ============================================================
        //  TOAST
        // ============================================================
        function showToast(msg, isError = false) {
            const t = document.getElementById('toast');
            t.textContent = msg;
            t.className = isError ? 'error' : '';
            t.classList.add('show');
            clearTimeout(t._timer);
            t._timer = setTimeout(() => t.classList.remove('show'), 2500);
        }

        // Mensaje destacado en el centro de la pantalla, para avisos que
        // merecen más presencia que un toast (p. ej. activar el modo
        // desarrollador). Mismo estilo que el resto de overlays de la app.
        function showCenteredMessage(text) {
            const overlay = document.createElement('div');
            overlay.className = 'centered-message-overlay';
            overlay.onclick = (e) => { if (e.target === overlay) closeCenteredMessage(overlay); };
            overlay.innerHTML = `
                <div class="centered-message-box">
                    <div class="centered-message-text">${escapeHtml(text)}</div>
                    <button class="btn-modal-primary" onclick="closeCenteredMessage(this.closest('.centered-message-overlay'))">Entendido</button>
                </div>`;
            document.body.appendChild(overlay);
            setTimeout(() => closeCenteredMessage(overlay), 2600);
        }

        function closeCenteredMessage(overlay) {
            if (!overlay || !document.body.contains(overlay)) return;
            overlay.style.animation = 'modalOverlayOut 0.18s ease both';
            setTimeout(() => overlay.remove(), 170);
        }

        function countWorkingDays(startDate, endDate) {
            // Los días cotizados incluyen sábados y domingos.
            // La ocultación de "Trabajando en..." en fin de semana es
            // únicamente una regla visual del detalle del calendario.
            // Cálculo por diferencia de fechas (no día a día): con un rango
            // muy grande o una fecha mal escrita, el bucle anterior podía
            // iterar miles de veces y notarse como un cuelgue momentáneo.
            if (!startDate || !endDate) return 0;
            const current = new Date(startDate + 'T12:00:00');
            const end = new Date(endDate + 'T12:00:00');
            if (isNaN(current.getTime()) || isNaN(end.getTime()) || end < current) return 0;
            return Math.round((end - current) / 86400000) + 1;
        }

