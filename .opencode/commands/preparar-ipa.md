---
description: Comprueba que el cambio está listo para generar IPA en GitHub Actions
agent: bitacora
---

Prepara los cambios actuales para la compilación de las IPA sin firmar. No implementes funciones nuevas y no publiques.
Inspecciona el diff y el estado de Git, verifica versión, bundle IDs, recursos, pruebas, `project.yml` y el workflow.
Ejecuta todas las comprobaciones posibles en Windows. Pide a `revisor-ci` una auditoría independiente y resuelve solo
los hallazgos que pertenezcan al encargo actual. Devuelve LISTO o NO LISTO con pruebas, archivos que deberían entrar en
el commit y los pasos exactos que el coordinador deberá realizar en GitHub.
