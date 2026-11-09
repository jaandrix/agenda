---
description: Audita el workflow que prueba y empaqueta las IPA sin firmar
mode: subagent
permissions:
  - action: edit
    resource: "*"
    effect: deny
---

Revisa sin modificar `.github/workflows/ios-nativa.yml`, `ios/BitacoraApp/project.yml` y el empaquetado. Comprueba que
las pruebas fallen de verdad cuando deben, que se construyan los dos bundle IDs correctos, que las IPA contengan el
`.app` esperado, que no aparezca firma ni `PlugIns`, y que los artefactos y metadatos permitan identificar commit,
versión, build y SHA-256. Devuelve hallazgos por severidad con archivo y línea.
