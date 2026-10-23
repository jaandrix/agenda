        // ============================================================
        //  INIT
        // ============================================================
        let appInitialized = false;

        async function init() {
            loadTheme();
            loadFontPref();
            initMobileShell();
            const loaded = await loadData();
            // El menú se pintó al cargar nucleo.js, antes de tener los datos:
            // sin repintarlo, los apartados opcionales activados (universidad,
            // profesorado...) no aparecían hasta tocar su interruptor.
            renderAllNavs();
            if (loaded) {
                setTimeout(comprobarBienvenida, 700);
                setTimeout(() => comprobarAvisosDeArranque().catch(e => console.error(e)), 2500);
                if (/[?&]finprueba\b/.test(location.search)) { history.replaceState(null, '', location.pathname); setTimeout(openFinPrueba, 900); }
                if (modoSinConexion) setTimeout(() => showToast('Sin conexión: estás viendo la copia guardada en este dispositivo.'), 900);
                else if (copiaPendiente) saveData().catch(e => console.error(e));
                ensureRecurringProCharges();
                convertirCinesEnPeliculas();
                setInterval(convertirCinesEnPeliculas, 5 * 60000);
                document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { refrescarAlVolver(); sincronizarDesdeNube(); convertirCinesEnPeliculas(); aplicarBandejaConector(); actualizarAnalisisIA(); } else ocultoDesde = { hora: Date.now(), dia: todayISO() }; });
                window.addEventListener('pageshow', e => { if (e.persisted) refrescarAlVolver(true); });
                window.addEventListener('focus', sincronizarDesdeNube);
                aplicarBandejaConector();
                setTimeout(actualizarAnalisisIA, 1500);
                setTimeout(revisarCumplesRegalo, 2500);
                compartidoDesdeUrl();
                if (/[?&]semana\b/.test(location.search)) {
                    history.replaceState(null, '', location.pathname);
                    setTimeout(openResumenSemana, 900);
                }
            }
            // Lo social no bloquea el primer pintado: va en paralelo y, al
            // llegar, repinta solo las vistas que lo enseñan. Recomendaciones,
            // viajes y listas compartidas usan los amigos para los nombres.
            const sociales = (async () => {
                await Promise.all([cargarCodigoAmigo(), cargarAmigos(), cargarNombrePublico(), cargarMiPerfil()]);
                await Promise.all([cargarRecomendaciones(), cargarSolicitudesAmistad(), cargarViajesCompartidos(), cargarListasOcioCompartidas()]);
            })();

            if (!loadVaultData()) {
                vaultTasks = [];
                saveVaultData();
            }

            // El modo desarrollador empieza encendido solo en la cuenta del creador (se recuerda en la cuenta).
            devModeActive = cuentaDesarrollador;
            document.body.classList.toggle('dev-mode', devModeActive);

            if (window.innerWidth <= 768) {
                document.querySelector('.menu-hamburger').style.display = 'block';
            }

            if (!appInitialized) {
                appInitialized = true;

                document.getElementById('mobile-menu-overlay').addEventListener('click', function() {
                    if (this.classList.contains('open')) toggleMobileMenu();
                });

                let resizeTimer;
                window.addEventListener('resize', () => {
                    clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(() => {
                        const isMobile = window.innerWidth <= 768;
                        document.querySelector('.menu-hamburger').style.display = isMobile ? 'block' :
                        'none';
                    }, 200);
                });
            }

            if (!loaded) {
                document.body.classList.remove('pwa', 'mobile-standalone');
                document.getElementById('content').innerHTML =
                    `<div class="empty-state">
                        
                        <div class="empty-title">${navigator.onLine === false || redSinRespuesta ? 'sin conexión y aún sin copia en este dispositivo.' : 'no se pudieron cargar tus datos.'}</div>
                        <div class="empty-sub">${navigator.onLine === false || redSinRespuesta ? 'Ábrela una vez con internet: a partir de ahí guarda una copia y se abre también sin red.' : 'Revisa tu conexión a internet y vuelve a intentarlo. No se ha modificado nada en la nube.'}</div>
                        <button class="btn-secondary" style="margin-top:12px" onclick="init()">Reintentar</button>
                    </div>`;
                return;
            }

            requestAnimationFrame(() => {
                render();
                updateHeaderClock();
                updateSidebarProgress();
                if (!window._headerClockTimer) window._headerClockTimer = setInterval(() => { updateHeaderClock(); updateSidebarProgress(); }, 1000);
                updatePageTitle();
                updateAddButton();
                maybeShowDailyAlert();
                if (!window._dailyAlertTimer) window._dailyAlertTimer = setInterval(maybeShowDailyAlert, 60000);
                runDailyBackupCheck();
                updateNotifBadge();
                if (!window._notifTimer) window._notifTimer = setInterval(refreshNotifData, 90000);
                bitacoraNativeSyncSnapshot();
                handleWidgetDeepLink();
            });
            sociales.then(() => {
                updateNotifBadge();
                if (['friends', 'culture', 'travels', 'home'].includes(currentView)) render();
            });
        }

        if (window.location.hash) {
            const view = window.location.hash.replace('#', '');
            if (view && view !== 'calendar') {
                currentView = view;
            }
        } else {
            currentView = 'calendar';
        }

        // Con la app en segundo plano (sobre todo la del iPhone) nada se repinta: al
        // volver seguían la hora, el saludo y el día de cuando se dejó. Si ha pasado
        // un rato se repinta, y si ya es otro día se vuelve a hoy. No se toca si se
        // está escribiendo en un campo de la página, para no perder lo escrito.
        let ocultoDesde = null;
        function refrescarAlVolver(forzar) {
            const fuera = ocultoDesde;
            ocultoDesde = null;
            if (!forzar && (!fuera || Date.now() - fuera.hora < 30000)) return;
            const activo = document.activeElement;
            if (activo && activo.matches('input, textarea, [contenteditable="true"]') && activo.closest('#content, #mobile-shell')) return;
            if (!fuera || fuera.dia !== todayISO()) {
                mobileDiaSel = null;
                mobileMes = null;
                plannerDayOffset = 0;
            }
            repintarTrasModal();
        }
