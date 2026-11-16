// deno test supabase/functions/calendario-feed/ics_test.ts
import { assert, assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1';
import { calendario, esFecha, firma, horaNormal, igualSeguro, servirFeed, type Dependencias } from './ics.ts';

const SECRETO = 'secreto-de-prueba';
const UID = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
const DATOS = { calendarioFeedVersion: 2, entries: [{ id: 'e1', type: 'event', title: 'Cena privada', date: '2026-11-20', time: '21:00' }] };

function dep(acceso: () => Promise<any>, datos: () => Promise<any> = async () => ({ data: DATOS, error: null })): Dependencias {
    return { secreto: SECRETO, leerDatos: datos, tieneAcceso: acceso };
}
const k = () => firma(SECRETO, UID, 2);

Deno.test('con acceso true entrega el calendario', async () => {
    const r = await servirFeed(UID, await k(), dep(async () => ({ data: true, error: null })));
    assertEquals(r.status, 200);
    assertStringIncludes(await r.text(), 'Cena privada');
});

Deno.test('con acceso false sale vacío, sin datos', async () => {
    const r = await servirFeed(UID, await k(), dep(async () => ({ data: false, error: null })));
    assertEquals(r.status, 200);
    const t = await r.text();
    assertFalse(t.includes('Cena privada'));
    assertFalse(t.includes('BEGIN:VEVENT'));
});

for (const [nombre, acceso] of [
    ['error de la RPC', async () => ({ data: null, error: { message: 'boom' } })],
    ['null', async () => ({ data: null, error: null })],
    ['undefined', async () => ({ data: undefined, error: null })],
    ['un valor raro', async () => ({ data: 'true', error: null })],
    ['la red se cae', async () => { throw new Error('timeout'); }],
] as const) {
    Deno.test(`tiene_acceso con ${nombre} da 503 y nunca los datos`, async () => {
        const r = await servirFeed(UID, await k(), dep(acceso as any));
        assertEquals(r.status, 503);
        assertFalse((await r.text()).includes('Cena'));
    });
}

Deno.test('si no se pueden leer los datos da 503', async () => {
    const r = await servirFeed(UID, await k(), dep(async () => ({ data: true, error: null }), async () => ({ data: null, error: { message: 'x' } })));
    assertEquals(r.status, 503);
});

Deno.test('firma mala, de otra versión o de otro usuario: 404 sin consultar el acceso', async () => {
    let consultado = false;
    const d = dep(async () => { consultado = true; return { data: true, error: null }; });
    assertEquals((await servirFeed(UID, 'A'.repeat(32), d)).status, 404);
    assertEquals((await servirFeed(UID, await firma(SECRETO, UID, 1), d)).status, 404);
    assertEquals((await servirFeed(UID, await firma(SECRETO, '11111111-1111-4111-8111-111111111111', 2), d)).status, 404);
    assertEquals((await servirFeed('no-es-un-uuid', await k(), d)).status, 404);
    assertFalse(consultado);
});

Deno.test('sin secreto configurado no entrega nada', async () => {
    const r = await servirFeed(UID, await k(), { ...dep(async () => ({ data: true, error: null })), secreto: '' });
    assertEquals(r.status, 503);
});

Deno.test('igualSeguro', () => {
    assert(igualSeguro('abc', 'abc'));
    assertFalse(igualSeguro('abc', 'abd'));
    assertFalse(igualSeguro('abc', 'abcd'));
    assertFalse(igualSeguro('', 'a'));
});

Deno.test('fechas imposibles no pasan', () => {
    assert(esFecha('2028-02-29'));
    assertFalse(esFecha('2026-02-29'));
    assertFalse(esFecha('2026-02-31'));
    assertFalse(esFecha('2026-99-99'));
    assertFalse(esFecha('2026-00-10'));
    assertFalse(esFecha('2026-1-1'));
    assertFalse(esFecha(null));
});

Deno.test('horas', () => {
    assertEquals(horaNormal('9:05'), '09:05');
    assertEquals(horaNormal('23:59'), '23:59');
    assertEquals(horaNormal('24:00'), '');
    assertEquals(horaNormal('99:99'), '');
    assertEquals(horaNormal('12:60'), '');
});

Deno.test('un evento roto no tira el calendario y no se publica mal', () => {
    const ics = calendario({ entries: [
        { id: 'malo1', type: 'event', title: 'Malo', date: '2026-99-99' },
        { id: 'malo2', type: 'event', title: 'Febrero', date: '2026-02-31' },
        null, 42, 'texto',
        { id: 'bueno', type: 'event', title: 'Bueno', date: '2026-11-20', time: '99:99' },
        { id: 'raro', type: 'event', title: 'Raro', date: '2026-11-20', time: '10:00', endTime: '09:00' },
        { id: 'tarde', type: 'event', title: 'Tarde', date: '2026-11-20', time: '23:30' },
        { id: 'v', type: 'travel', title: 'Viaje', startDate: '2026-11-10', endDate: '2026-11-01' },
    ] }, '2026-11-16');
    assertFalse(ics.includes('Malo'));
    assertFalse(ics.includes('Febrero'));
    assertStringIncludes(ics, 'SUMMARY:Bueno\r\nDTSTART;VALUE=DATE:20261120');
    assertStringIncludes(ics, 'DTSTART;TZID=Europe/Madrid:20261120T100000\r\nDTEND;TZID=Europe/Madrid:20261120T110000');
    assertStringIncludes(ics, 'DTSTART;TZID=Europe/Madrid:20261120T233000\r\nDTEND;TZID=Europe/Madrid:20261120T235900');
    assertStringIncludes(ics, 'DTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261111');
});

Deno.test('el id no puede meter líneas en el .ics', () => {
    const ics = calendario({ entries: [{ id: 'x\r\nATTENDEE:mal', type: 'event', title: 'T\r\nX-MAL:1', date: '2026-11-20' }] }, '2026-11-16');
    assertFalse(/\r\nATTENDEE:/.test(ics));
    assertFalse(/\r\nX-MAL:/.test(ics));
});
