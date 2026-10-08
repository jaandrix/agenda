        // ============================================================
        //  INIT
        // ============================================================
        let appInitialized = false;

        async function init() {
            loadTheme();
            loadFontPref();
            initMobileShell();
            const loaded = await loadData();
            if (loaded) {
                setTimeout(comprobarBienvenida, 700);
                ensureRecurringProCharges();
                convertirCinesEnPeliculas();
                setInterval(convertirCinesEnPeliculas, 5 * 60000);
                document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { sincronizarDesdeNube(); convertirCinesEnPeliculas(); aplicarBandejaConector(); actualizarAnalisisIA(); } });
                window.addEventListener('focus', sincronizarDesdeNube);
                aplicarBandejaConector();
                setTimeout(actualizarAnalisisIA, 1500);
            }
            // Lo social no bloquea el primer pintado: va en paralelo y, al
            // llegar, repinta solo las vistas que lo enseñan. Recomendaciones,
            // viajes y listas compartidas usan los amigos para los nombres.
            const sociales = (async () => {
                await Promise.all([cargarCodigoAmigo(), cargarAmigos(), cargarNombrePublico()]);
                await Promise.all([cargarRecomendaciones(), cargarSolicitudesAmistad(), cargarViajesCompartidos(), cargarListasOcioCompartidas()]);
            })();

            if (!loadVaultData()) {
                vaultTasks = [];
                saveVaultData();
            }

            // Inicializar devModeActive = false (siempre empieza desactivado)
            devModeActive = false;

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
                        
                        <div class="empty-title">no se pudieron cargar tus datos.</div>
                        <div class="empty-sub">Revisa tu conexión a internet y vuelve a intentarlo. No se ha modificado nada en la nube.</div>
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
