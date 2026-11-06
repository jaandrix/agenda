// Las claves que la app nativa conoce (ContratoDatos.swift) tienen que ser las de DATOS_SINCRONIZADOS (js/datos.js).
// Si la web añade un bloque, la nativa lo conserva igual (no lo pisa), pero hay que apuntarlo en el contrato.
// node --test pruebas/contrato-ios.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raiz = new URL('..', import.meta.url);
const leer = r => readFileSync(new URL(r, raiz), 'utf8');

test('el contrato de iOS lleva las mismas claves que la web', () => {
    const datos = leer('js/datos.js');
    const bloque = datos.slice(datos.indexOf('const DATOS_SINCRONIZADOS = {'), datos.indexOf('let datosBase = null;'));
    const web = [...bloque.matchAll(/^\s{12}(\w+):\s*\[/gm)].map(m => m[1]);
    assert.ok(web.length > 30, 'no se encontró DATOS_SINCRONIZADOS');

    const swift = leer('ios/BitacoraApp/BitacoraNative/DataContract/ContratoDatos.swift');
    const lista = swift.slice(swift.indexOf('// claves-inicio'), swift.indexOf('// claves-fin'));
    const ios = [...lista.matchAll(/"(\w+)"/g)].map(m => m[1]);

    assert.deepEqual([...ios].sort(), [...web].sort());
});
