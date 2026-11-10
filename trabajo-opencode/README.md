# Cola de trabajo de OpenCode

Esta carpeta contiene encargos pequeños, verificables y sin autoridad para publicar. El coordinador humano, Claude o
Codex revisa cada resultado, decide si autoriza edición, ejecuta pruebas y conserva en exclusiva el commit y el push.

## Ejecución

Desde la raíz del repositorio:

```powershell
pwsh -File scripts/opencode-supervisor.ps1 -TaskFile trabajo-opencode/cola/OC-001-apuntar-p0.md
```

Para trabajo paralelo, abre una terminal por encargo. Cada tarea recibe su propio directorio XDG, por lo que no comparte
la base de datos de la aplicación de escritorio. Los logs locales se guardan en `trabajo-opencode/resultados/` y no se
versionan.

## Puertas de control

1. Investigación sin edición.
2. Revisión del encargo y su fiabilidad.
3. Implementación en rama o worktree aislado, nunca sobre cambios ajenos.
4. Pruebas automáticas y auditoría independiente.
5. Integración y publicación exclusiva del coordinador.

Una tarea debe parar si necesita secretos, cambia contratos de datos sin migración, no puede demostrar paridad o intenta
hacer commit, push o lanzar GitHub Actions.
