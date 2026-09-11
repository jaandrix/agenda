            // Bloque aislado (no depende del resto del script de la app) para
            // que el botón de instalar funcione aunque algo más falle.
            (function () {
                var pwaDeferredPrompt = null;
                var pwaIsStandalone = function () {
                    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
                };
                function showPwaInstallButton(mode) {
                    var btn = document.getElementById('pwa-install-btn');
                    if (!btn || pwaIsStandalone()) return;
                    btn.dataset.mode = mode;
                    btn.style.display = 'inline-flex';
                }
                function hidePwaInstallButton() {
                    var btn = document.getElementById('pwa-install-btn');
                    if (btn) btn.style.display = 'none';
                }
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
                        navigator.serviceWorker.register('service-worker.js').catch(function () {});
                    });
                }
            })();
