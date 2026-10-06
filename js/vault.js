        // ============================================================
        //  VAULT: CONTRASEÑAS EN SUPABASE
        // ============================================================

        async function hashPassword(password) {
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        async function getSecret(type) {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) throw new Error('No hay sesión activa');
            const { data, error } = await sb
                .from('bitacora_secrets')
                .select(`${type}_password_hash`)
                .eq('user_id', user.id)
                .maybeSingle();
            if (error) throw error;
            return data ? data[`${type}_password_hash`] : null;
        }

        async function setSecret(type, hash) {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) throw new Error('No hay sesión activa');
            const column = `${type}_password_hash`;
            const { error } = await sb
                .from('bitacora_secrets')
                .upsert({
                    user_id: user.id,
                    [column]: hash
                }, { onConflict: 'user_id' });
            if (error) throw error;
        }

        async function getGlobalDevPasswordHash() {
            const { data, error } = await sb
                .from('global_settings')
                .select('dev_password_hash')
                .eq('id', 1)
                .maybeSingle();
            if (error) throw error;
            return data ? data.dev_password_hash : null;
        }

        async function setGlobalDevPasswordHash(hash) {
            const { error } = await sb
                .from('global_settings')
                .upsert({
                    id: 1,
                    dev_password_hash: hash,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' });
            if (error) throw error;
        }

        function showModal(htmlContent) {
            vtFichaOrigen = null;
            const container = document.getElementById('modal-container');
            container.innerHTML = `
                <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
                    <div class="modal-sheet">
                        ${htmlContent}
                    </div>
                </div>
            `;
            // El modal nace del punto que se pulsó (un botón, un día del
            // calendario...) en vez de aparecer siempre en el centro. Se
            // usan offsetLeft/Top porque no les afecta la escala con la que
            // arranca la animación; abierto con teclado, sale del centro.
            const punto = vtPunteroReciente();
            const sheet = container.querySelector('.modal-sheet');
            if (punto && sheet && !vtReducido()) {
                sheet.style.transformOrigin = `${Math.round(punto.x - sheet.offsetLeft)}px ${Math.round(punto.y - sheet.offsetTop)}px`;
                sheet.classList.add('modal-sheet-desde-punto');
            }
            // Deja el cursor listo en el primer campo de escritura del modal,
            // para no tener que coger el ratón antes de poder escribir. Un
            // setTimeout(0) en vez de requestAnimationFrame: el foco tiene
            // que "ganar" a cualquier auto-focus que el propio contenido del
            // modal dispare (algunos modales ya llaman a su focus() propio).
            setTimeout(() => {
                const sheet = container.querySelector('.modal-sheet');
                const field = sheet?.querySelector(
                    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=color]):not([type=file]):not([disabled]), textarea:not([disabled]), select:not([disabled]):not(.selector-nativo)'
                );
                field?.focus();
                if (field?.tagName === 'INPUT' && (field.type === 'text' || field.type === '')) field.select?.();
            }, 0);
        }

        // ============================================================
        //  PASSWORD ACCESS SYSTEM (para Vault) - CORREGIDO
        // ============================================================

        async function requestPasswordAccess(type, onSuccess) {
            try {
                const storedHash = await getSecret(type);
                
                if (!storedHash) {
                    // No hay contraseña guardada → crear por primera vez
                    window._passwordSuccessCallback = onSuccess;
                    window._passwordType = type;
                    
                    showModal(`
                        <div class="modal-title" style="color:var(--vault-accent)">
                            Configurar acceso a Vault
                        </div>
                        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
                            Establece una contraseña para proteger Vault.
                        </div>
                        <div class="form-row">
                            <label class="modal-label">Nueva contraseña</label>
                            <input type="password" id="pw-new" class="modal-input" placeholder="Mínimo 6 caracteres" onkeydown="if(event.key==='Enter')createPassword('${type}')">
                        </div>
                        <div class="form-row">
                            <label class="modal-label">Repetir contraseña</label>
                            <input type="password" id="pw-new2" class="modal-input" placeholder="Repite la contraseña" onkeydown="if(event.key==='Enter')createPassword('${type}')">
                        </div>
                        <div id="pw-create-error" style="color:#dc2626;font-size:12px;margin-bottom:8px;min-height:16px"></div>
                        <button class="btn-modal-primary" onclick="createPassword('${type}')" style="background:var(--vault-accent)">
                            🔐 Crear contraseña
                        </button>
                    `);
                    return;
                }

                // Ya hay contraseña guardada → verificar acceso
                window._passwordSuccessCallback = onSuccess;
                window._passwordType = type;

                showModal(`
                    <div class="modal-title" style="color:var(--vault-accent)">
                        Acceso a Vault
                    </div>
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
                        Introduce tu contraseña para acceder.
                    </div>
                    <div class="form-row">
                        <label class="modal-label">Contraseña</label>
                        <input type="password" id="pw-input" class="modal-input" placeholder="Tu contraseña" onkeydown="if(event.key==='Enter')verifyPassword('${type}')">
                    </div>
                    <div id="pw-error" style="color:#dc2626;font-size:12px;margin-bottom:8px;min-height:16px"></div>
                    <button class="btn-modal-primary" onclick="verifyPassword('${type}')" style="background:var(--vault-accent)">
                        Verificar
                    </button>
                `);

                // Enfocar el input después de renderizar
                setTimeout(() => {
                    const input = document.getElementById('pw-input');
                    if (input) input.focus();
                }, 100);
                
            } catch (e) {
                console.error('Error al acceder a la contraseña:', e);
                showToast('Error de conexión, intenta de nuevo', true);
            }
        }

        async function createPassword(type) {
            const pw1 = document.getElementById('pw-new').value;
            const pw2 = document.getElementById('pw-new2').value;
            const errorEl = document.getElementById('pw-create-error');
            
            if (!pw1 || pw1.length < 6) {
                errorEl.textContent = '❌ La contraseña debe tener al menos 6 caracteres';
                return;
            }
            if (pw1 !== pw2) {
                errorEl.textContent = '❌ Las contraseñas no coinciden';
                return;
            }
            
            try {
                const hash = await hashPassword(pw1);
                await setSecret(type, hash);
                closeModal();
                if (window._passwordSuccessCallback) {
                    window._passwordSuccessCallback();
                }
                showToast('🔑 Contraseña creada correctamente');
            } catch (e) {
                console.error('Error al crear contraseña:', e);
                errorEl.textContent = 'Error al guardar la contraseña. Intenta de nuevo.';
            }
        }

        async function verifyPassword(type) {
            const input = document.getElementById('pw-input');
            if (!input) return;
            const password = input.value;
            const errorEl = document.getElementById('pw-error');
            
            if (!password) {
                errorEl.textContent = 'Introduce tu contraseña';
                return;
            }
            
            try {
                const storedHash = await getSecret(type);
                if (!storedHash) {
                    errorEl.textContent = 'No hay contraseña guardada. Contacta con el administrador.';
                    return;
                }
                
                const inputHash = await hashPassword(password);
                
                if (inputHash === storedHash) {
                    closeModal();
                    if (window._passwordSuccessCallback) {
                        window._passwordSuccessCallback();
                    }
                } else {
                    errorEl.textContent = '❌ Contraseña incorrecta';
                }
            } catch (e) {
                console.error('Error al verificar contraseña:', e);
                errorEl.textContent = 'Error de conexión, intenta de nuevo';
            }
        }

        // ============================================================
        //  DESARROLLADOR - CREAR CONTRASEÑA GLOBAL
        // ============================================================

        async function createDevPassword() {
            showModal(`
                <div class="modal-title" style="color:var(--accent-purple)">⚙ Configurar Modo Desarrollador</div>
                <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
                    Esta es la contraseña global que se usará para activar el Modo Desarrollador.
                    <br><strong>Guárdala bien</strong> — no hay forma de recuperarla si la pierdes.
                </div>
                <div class="form-row">
                    <label class="modal-label">Nueva contraseña</label>
                    <input type="password" id="dev-pw-new" class="modal-input" placeholder="Mínimo 6 caracteres" onkeydown="if(event.key==='Enter')confirmCreateDevPassword()">
                </div>
                <div class="form-row">
                    <label class="modal-label">Repetir contraseña</label>
                    <input type="password" id="dev-pw-new2" class="modal-input" placeholder="Repite la contraseña" onkeydown="if(event.key==='Enter')confirmCreateDevPassword()">
                </div>
                <div id="dev-pw-create-error" style="color:#dc2626;font-size:12px;margin-bottom:8px;min-height:16px"></div>
                <button class="btn-modal-primary" onclick="confirmCreateDevPassword()" style="background:var(--accent-purple)">
                    🔐 Establecer contraseña
                </button>
            `);
        }

        async function confirmCreateDevPassword() {
            const pw1 = document.getElementById('dev-pw-new').value;
            const pw2 = document.getElementById('dev-pw-new2').value;
            const errorEl = document.getElementById('dev-pw-create-error');

            if (!pw1 || pw1.length < 6) {
                errorEl.textContent = '❌ La contraseña debe tener al menos 6 caracteres';
                return;
            }
            if (pw1 !== pw2) {
                errorEl.textContent = '❌ Las contraseñas no coinciden';
                return;
            }

            try {
                const hash = await hashPassword(pw1);
                await setGlobalDevPasswordHash(hash);
                closeModal();
                devModeActive = true;
                document.getElementById('content').innerHTML = renderSettings();
                showCenteredMessage('Modo desarrollador activado');
            } catch (e) {
                console.error('Error al guardar la contraseña global:', e);
                errorEl.textContent = 'Error al guardar la contraseña. Asegúrate de que la tabla global_settings existe en Supabase.';
            }
        }

        // ============================================================
        //  MODE DEVELOPER GLOBAL - CONTRASEÑA EN SUPABASE - CORREGIDO
        // ============================================================
        async function toggleDeveloperMode() {
            if (devModeActive) {
                // Desactivar
                devModeActive = false;
                document.getElementById('content').innerHTML = renderSettings();
                showToast('Modo desarrollador desactivado');
                return;
            }

            try {
                const storedHash = await getGlobalDevPasswordHash();

                if (!storedHash) {
                    // No hay contraseña global → ofrecer crearla
                    createDevPassword();
                    return;
                }

                // Pedir la contraseña
                showModal(`
                    <div class="modal-title" style="color:var(--accent-purple)">⚙ Modo Desarrollador</div>
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Introduce la contraseña global del Modo Desarrollador para activarlo.</div>
                    <div class="form-row">
                        <label class="modal-label">Contraseña</label>
                        <input type="password" id="pw-dev-input" class="modal-input" placeholder="Contraseña global" onkeydown="if(event.key==='Enter')verifyDevPassword()">
                    </div>
                    <div id="pw-dev-error" style="color:#dc2626;font-size:12px;margin-bottom:8px;min-height:16px"></div>
                    <button class="btn-modal-primary" onclick="verifyDevPassword()" style="background:var(--accent-purple)">🔓 Activar</button>
                `);

                setTimeout(() => {
                    const input = document.getElementById('pw-dev-input');
                    if (input) input.focus();
                }, 100);

            } catch (e) {
                console.error('Error al obtener la contraseña global:', e);
                showToast('Error al conectar con el servidor. Asegúrate de que la tabla global_settings existe.', true);
            }
        }

        async function verifyDevPassword() {
            const input = document.getElementById('pw-dev-input').value;
            const errorEl = document.getElementById('pw-dev-error');

            if (!input) {
                errorEl.textContent = 'Introduce la contraseña';
                return;
            }

            try {
                const storedHash = await getGlobalDevPasswordHash();
                if (!storedHash) {
                    errorEl.textContent = 'No hay contraseña global configurada';
                    return;
                }

                const inputHash = await hashPassword(input);

                if (inputHash !== storedHash) {
                    errorEl.textContent = '❌ Contraseña incorrecta';
                    return;
                }

                closeModal();
                devModeActive = true;
                document.getElementById('content').innerHTML = renderSettings();
                showCenteredMessage('Modo desarrollador activado');
            } catch (e) {
                console.error('Error verificando contraseña:', e);
                errorEl.textContent = 'Error de conexión, intenta de nuevo';
            }
        }

        function openVault() {
            loadVaultData();
            requestPasswordAccess('vault', () => {
                currentView = 'vault';
                document.querySelectorAll('.sidebar-nav button, #mobile-menu-panel .menu-nav button').forEach(b => {
                    b.classList.toggle('active', b.dataset.view === 'vault');
                });
                updatePageTitle();
                render();
            });
        }

        // ============================================================
        //  PROMPTS (Punto 5)
        // ============================================================
        function openNewPrompt() {
            window._editPromptId = null;
            showModal(renderPromptModalContent());
        }

        function openPromptDetail(id) {
            window._editPromptId = id;
            showModal(renderPromptModalContent());
        }

        function renderPromptModalContent() {
            const p = window._editPromptId ? prompts.find(x => x.id === window._editPromptId) : null;
            const title = p ? p.title : '';
            const content = p ? p.content : '';

            return `
                <div class="modal-title" style="font-family:'JetBrains Mono',monospace;color:var(--accent-purple)">&gt; ${p ? 'Editar prompt' : 'Nuevo prompt'}</div>
                <div class="modal-label">Título</div>
                <input id="prompt-title-input" class="modal-input console-font" value="${escapeHtml(title)}" placeholder="Nombre del prompt...">
                <div class="modal-label">Contenido</div>
                <textarea id="prompt-content-input" class="modal-input console-font console-textarea" rows="8" placeholder="Escribe tu prompt aquí...">${escapeHtml(content)}</textarea>
                <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
                    <button class="btn-modal-primary" style="width:auto;background:var(--accent-purple)" onclick="savePrompt()">💾 Guardar</button>
                    <button class="btn-secondary" style="width:auto" onclick="copyPromptToClipboard()">📋 Copiar</button>
                    ${p ? `<button class="btn-secondary" style="width:auto;color:#dc2626" onclick="deletePrompt('${p.id}')">🗑 Eliminar</button>` : ''}
                </div>
            `;
        }

        async function savePrompt() {
            const title = document.getElementById('prompt-title-input').value.trim();
            const content = document.getElementById('prompt-content-input').value;
            if (!title) { showToast('Escribe un título', true); return; }

            if (window._editPromptId) {
                const p = prompts.find(x => x.id === window._editPromptId);
                if (p) {
                    p.title = title;
                    p.content = content;
                    p.updatedAt = new Date().toISOString();
                }
            } else {
                prompts.push({ id: 'prompt_' + Date.now(), title, content, updatedAt: new Date().toISOString() });
            }
            closeModal();
            document.getElementById('content').innerHTML = renderSettings();
            try { await saveData();
                showToast('Prompt guardado'); } catch (e) { console.error(e);
                showToast('No se pudo guardar en la nube', true); }
        }

        async function deletePrompt(id) {
            if (!confirm('¿Eliminar este prompt?')) return;
            prompts = prompts.filter(p => p.id !== id);
            closeModal();
            document.getElementById('content').innerHTML = renderSettings();
            try { await saveData();
                showToast('Prompt eliminado'); } catch (e) { console.error(e);
                showToast('No se pudo guardar en la nube', true); }
        }

        function copyPromptToClipboard() {
            const content = document.getElementById('prompt-content-input').value;
            navigator.clipboard.writeText(content)
                .then(() => showToast('📋 Copiado al portapapeles'))
                .catch(() => showToast('No se pudo copiar', true));
        }

        // ============================================================
        //  VAULT
        // ============================================================
        let vaultTasks = [];

        function loadVaultData() {
            try {
                const stored = localStorage.getItem('vault_data');
                if (stored) {
                    vaultTasks = JSON.parse(stored);
                    return true;
                }
            } catch (e) { console.error('Error cargando Vault:', e); }
            return false;
        }

        function saveVaultData() {
            try {
                localStorage.setItem('vault_data', JSON.stringify(vaultTasks));
                return true;
            } catch (e) {
                console.error('Error guardando Vault:', e);
                return false;
            }
        }

        function renderVault() {
            if (!vaultTasks.length) {
                return `
                    <div style="max-width:600px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                            <div>
                                <div style="font-size:20px;font-weight:700;color:var(--text-primary)">Vault</div>
                                <div style="font-size:13px;color:var(--text-secondary)">Tareas personales</div>
                            </div>
                            <button class="btn-secondary" onclick="changeVaultPassword()" style="margin:0;padding:6px 12px;font-size:12px;width:auto;color:var(--vault-accent)">🔑 Cambiar contraseña</button>
                        </div>
                        <div class="vault-input-row">
                            <input type="text" id="vault-input" placeholder="Escribe una tarea..." onkeydown="if(event.key==='Enter')addVaultTask()">
                            <button onclick="addVaultTask()">Añadir</button>
                        </div>
                        <div class="empty-state">
                            
                            <div class="empty-title">Sin tareas</div>
                            <div class="empty-sub">Añade tu primera tarea con el campo de arriba</div>
                        </div>
                    </div>
                `;
            }

            const done = vaultTasks.filter(t => t.done);
            const pending = vaultTasks.filter(t => !t.done);

            return `
                <div style="max-width:600px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                        <div>
                            <div style="font-size:20px;font-weight:700;color:var(--text-primary)">Vault</div>
                            <div style="font-size:13px;color:var(--text-secondary)">${pending.length} pendientes · ${done.length} completadas</div>
                        </div>
                        <button class="btn-secondary" onclick="changeVaultPassword()" style="margin:0;padding:6px 12px;font-size:12px;width:auto;color:var(--vault-accent)">🔑 Cambiar contraseña</button>
                    </div>
                    <div class="vault-input-row">
                        <input type="text" id="vault-input" placeholder="Escribe una tarea..." onkeydown="if(event.key==='Enter')addVaultTask()">
                        <button onclick="addVaultTask()">Añadir</button>
                    </div>

                    ${pending.length ? `
                        <div style="font-size:12px;font-weight:600;text-transform:uppercase;color:var(--text-secondary);letter-spacing:0.5px;margin:12px 0 8px 0">Pendientes</div>
                        ${pending.map((t, i) => {
                            const realIdx = vaultTasks.indexOf(t);
                            return `
                                <div class="vault-task" onclick="toggleVaultTask(${realIdx})">
                                    <span class="task-check">◯</span>
                                    <span class="task-text">${escapeHtml(t.text)}</span>
                                    <button class="task-delete" onclick="event.stopPropagation();deleteVaultTask(${realIdx})">✕</button>
                                </div>
                            `;
                        }).join('')}
                    ` : ''}

                    ${done.length ? `
                        <div style="font-size:12px;font-weight:600;text-transform:uppercase;color:var(--text-secondary);letter-spacing:0.5px;margin:12px 0 8px 0">Completadas</div>
                        ${done.map((t, i) => {
                            const realIdx = vaultTasks.indexOf(t);
                            return `
                                <div class="vault-task done" onclick="toggleVaultTask(${realIdx})">
                                    <span class="task-check">●</span>
                                    <span class="task-text">${escapeHtml(t.text)}</span>
                                    <button class="task-delete" onclick="event.stopPropagation();deleteVaultTask(${realIdx})">✕</button>
                                </div>
                            `;
                        }).join('')}
                    ` : ''}
                </div>
            `;
        }

        function addVaultTask() {
            const input = document.getElementById('vault-input');
            if (!input) return;
            const text = input.value.trim();
            if (!text) { showToast('Escribe una tarea', true); return; }

            vaultTasks.push({ text, done: false, created: new Date().toISOString() });
            saveVaultData();
            input.value = '';
            render();
            showToast('Tarea añadida');
        }

        function toggleVaultTask(index) {
            if (index < 0 || index >= vaultTasks.length) return;
            vaultTasks[index].done = !vaultTasks[index].done;
            saveVaultData();
            render();
        }

        function deleteVaultTask(index) {
            if (index < 0 || index >= vaultTasks.length) return;
            if (!confirm('¿Eliminar esta tarea?')) return;
            vaultTasks.splice(index, 1);
            saveVaultData();
            render();
            showToast('Tarea eliminada');
        }

        // ============================================================
        //  VAULT PASSWORD CHANGE
        // ============================================================
        function changeVaultPassword() {
            showModal(`
                <div class="modal-title" style="color:var(--vault-accent)">Cambiar contraseña de Vault</div>
                <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Introduce tu contraseña actual y la nueva.</div>
                <div class="form-row">
                    <label class="modal-label">Contraseña actual</label>
                    <input type="password" id="pw-old-v" class="modal-input" placeholder="Tu contraseña actual">
                </div>
                <div class="form-row">
                    <label class="modal-label">Nueva contraseña</label>
                    <input type="password" id="pw-new-v" class="modal-input" placeholder="Mínimo 6 caracteres">
                </div>
                <div class="form-row">
                    <label class="modal-label">Repetir nueva contraseña</label>
                    <input type="password" id="pw-new2-v" class="modal-input" placeholder="Repite la contraseña">
                </div>
                <div id="pw-change-error-v" style="color:#dc2626;font-size:12px;margin-bottom:8px;min-height:16px"></div>
                <button class="btn-modal-primary" onclick="updateVaultPassword()" style="background:var(--vault-accent)">🔐 Cambiar contraseña</button>
            `);
        }

        async function updateVaultPassword() {
            const old = document.getElementById('pw-old-v').value;
            const pw1 = document.getElementById('pw-new-v').value;
            const pw2 = document.getElementById('pw-new2-v').value;
            const errorEl = document.getElementById('pw-change-error-v');

            if (!old) { errorEl.textContent = 'Introduce tu contraseña actual'; return; }
            if (!pw1 || pw1.length < 6) { errorEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres'; return; }
            if (pw1 !== pw2) { errorEl.textContent = 'Las contraseñas no coinciden'; return; }

            try {
                const storedHash = await getSecret('vault');
                const oldHash = await hashPassword(old);
                if (oldHash !== storedHash) {
                    errorEl.textContent = '❌ Contraseña actual incorrecta';
                    return;
                }
                const newHash = await hashPassword(pw1);
                await setSecret('vault', newHash);
                closeModal();
                showToast('🔑 Contraseña de Vault actualizada');
            } catch (e) {
                console.error('Error cambiando contraseña:', e);
                errorEl.textContent = 'Error de conexión, intenta de nuevo';
            }
        }

