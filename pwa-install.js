            // Bloque aislado (no depende del resto del script de la app) para
            // que el botón de instalar funcione aunque algo más falle.
            (function () {
                var pwaDeferredPrompt = null;
                // El botón solo vive en el DOM cuando la vista Ajustes está
                // montada (se re-crea cada vez que se renderiza), así que el
                // estado real de "se puede instalar" se guarda aparte, y
                // pwaSyncInstallButton() lo vuelve a aplicar cada vez que
                // Ajustes se renderiza, sin depender de cuándo llegó el evento.
                var pwaCurrentMode = null;
                var pwaIsStandalone = function () {
                    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
                };
                function showPwaInstallButton(mode) {
                    pwaCurrentMode = mode;
                    if (pwaIsStandalone()) return;
                    var btn = document.getElementById('pwa-install-btn');
                    if (!btn) return;
                    btn.dataset.mode = mode;
                    btn.style.display = 'inline-flex';
                }
                function hidePwaInstallButton() {
                    pwaCurrentMode = null;
                    var btn = document.getElementById('pwa-install-btn');
                    if (btn) btn.style.display = 'none';
                }
                window.pwaSyncInstallButton = function () {
                    if (pwaCurrentMode) showPwaInstallButton(pwaCurrentMode);
                };
                function showPwaFallbackMessage() {
                    var ua = navigator.userAgent;
                    var isIOS = /iphone|ipad|ipod/i.test(ua);
                    var isSafari = /^((?!chrome|android).)*safari/i.test(ua);
                    var text = isIOS
                        ? 'En iPhone/iPad: pulsa el icono Compartir en Safari y elige "Añadir a pantalla de inicio".'
                        : isSafari
                            ? 'En Safari (Mac): usa el icono de compartir de la barra de direcciones y elige "Añadir al Dock".'
                            : 'Busca el icono de instalar en la barra de direcciones de tu navegador (o el menú "Instalar Bitácora").';
                    if (typeof showCenteredMessage === 'function') {
                        showCenteredMessage(text);
                    } else {
                        alert(text);
                    }
                }
                window.handlePwaInstallClick = function () {
                    var btn = document.getElementById('pwa-install-btn');
                    if (btn && btn.dataset.mode === 'install' && pwaDeferredPrompt) {
                        pwaDeferredPrompt.prompt();
                        pwaDeferredPrompt.userChoice.then(function (choice) {
                            pwaDeferredPrompt = null;
                            if (choice && choice.outcome === 'accepted') hidePwaInstallButton();
                        });
                        return;
                    }
                    showPwaFallbackMessage();
                };
                window.addEventListener('beforeinstallprompt', function (e) {
                    e.preventDefault();
                    pwaDeferredPrompt = e;
                    showPwaInstallButton('install');
                });
                window.addEventListener('appinstalled', function () {
                    pwaDeferredPrompt = null;
                    hidePwaInstallButton();
                });
                // Si tras un momento ningún navegador ha ofrecido instalación
                // nativa (Safari, Firefox de escritorio...), el botón se
                // muestra igual, con instrucciones manuales.
                setTimeout(function () { if (!pwaDeferredPrompt) showPwaInstallButton('manual'); }, 1200);

                if ('serviceWorker' in navigator) {
                    window.addEventListener('load', function () {
                        navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' }).catch(function () {});
                        // Comprueba si hay una versión nueva del propio service-worker.js
                        // cada vez que se abre la app, en vez de fiarse solo de la
                        // revisión automática del navegador (que puede tardar).
                        navigator.serviceWorker.getRegistration().then(function (reg) {
                            if (reg) reg.update().catch(function () {});
                        });
                    });
                }
            })();
