// deno test supabase/functions/eliminar-cuenta/borrado_test.ts
import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';
import { eliminarCuenta, TABLAS, type Dependencias } from './borrado.ts';

const UID = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
const MIO = 'AAAAAAAAAAAAAAAA', AJENO = 'BBBBBBBBBBBBBBBB';

// Un "servidor" en memoria: archivos por bucket, filas por tabla y un registro de lo que se hizo.
function mundo(opciones: { falla?: string; sub?: any; nDocs?: number } = {}) {
    const hecho: string[] = [];
    const archivos: Record<string, Set<string>> = {
        documents: new Set(Array.from({ length: opciones.nDocs ?? 3 }, (_, i) => `${UID}/${i < 2 ? 'carpeta/' : ''}doc${i}.pdf`)),
        compartidos: new Set([`${MIO}/meta.json`, `${MIO}/ev/1.json`, `${AJENO}/meta.json`, `${AJENO}/ev/1.json`]),
    };
    const metas: Record<string, any> = { [`${MIO}/meta.json`]: { owner: UID }, [`${AJENO}/meta.json`]: { owner: 'otra-persona' } };
    const f = (paso: string) => opciones.falla === paso ? { error: { message: 'fallo inyectado: ' + paso } } : null;
    const dep: Dependencias = {
        leerSuscripcion: async () => f('leerSuscripcion') || { data: opciones.sub === undefined ? { stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' } : opciones.sub },
        cancelarStripe: async () => { if (opciones.falla === 'stripe') throw new Error('Stripe caído'); hecho.push('stripe'); },
        listar: async (bucket, prefijo, offset, limite) => {
            const fallo = f('listar:' + bucket); if (fallo) return fallo;
            const nombres = new Map<string, boolean>();
            for (const r of archivos[bucket]) if (r.startsWith(prefijo + '/')) { const resto = r.slice(prefijo.length + 1); const [cab, ...mas] = resto.split('/'); nombres.set(cab, mas.length === 0); }
            const lista = [...nombres].sort().map(([name, esArchivo]) => ({ name, id: esArchivo ? 'id-' + name : null }));
            return { data: lista.slice(offset, offset + limite) };
        },
        quitar: async (bucket, rutas) => { const fallo = f('quitar:' + bucket); if (fallo) return fallo; rutas.forEach(r => archivos[bucket].delete(r)); hecho.push(`quitar ${bucket} ${rutas.length}`); return {}; },
        leerJson: async (_b, ruta) => metas[ruta] ? { data: metas[ruta] } : { error: 'no existe' },
        leerDatos: async () => f('leerDatos') || { data: { servicios: { compartidos: [{ id: MIO }, { id: AJENO }, { id: '../../x' }] } } },
        gruposCreados: async () => f('grupos') || { data: [{ id: 'g1' }, { id: 'g2' }] },
        otroMiembro: async g => ({ data: g === 'g1' ? { user_id: 'amigo' } : null }),
        pasarGrupo: async (g, n) => { hecho.push(`pasar ${g} ${n}`); return {}; },
        borrarGrupo: async g => { hecho.push(`borrar grupo ${g}`); return {}; },
        borrarFilas: async (tabla, columna) => {
            if (opciones.falla === 'tabla:' + tabla) return { error: { code: '57014', message: 'timeout' } };
            if (tabla === 'beta_testers') return { error: { code: '42P01', message: 'relation "beta_testers" does not exist' } };
            hecho.push(`tabla ${tabla}.${columna}`); return {};
        },
        borrarUsuario: async () => { const fallo = f('auth'); if (fallo) return fallo; hecho.push('auth'); return {}; },
    };
    return { dep, hecho, archivos };
}

Deno.test('todo bien: Stripe primero, Auth lo último y no queda nada', async () => {
    const { dep, hecho, archivos } = mundo();
    const r = await eliminarCuenta(UID, dep);
    assertEquals(r, { ok: true });
    assertEquals(hecho[0], 'stripe');
    assertEquals(hecho.at(-1), 'auth');
    assertEquals(archivos.documents.size, 0);
    assertFalse(archivos.compartidos.has(`${MIO}/meta.json`));
    assertFalse(archivos.compartidos.has(`${MIO}/ev/1.json`));
    assert(archivos.compartidos.has(`${AJENO}/meta.json`), 'no borra lo compartido por otra persona');
    assert(hecho.includes('pasar g1 amigo'));
    assert(hecho.includes('borrar grupo g2'));
    for (const t of ['bitacora', 'bitacora_secrets', 'amistades', 'perfiles_fotos', 'conector_tokens', 'conector_bandeja', 'actividad', 'correo_semanal', 'push_subscriptions']) assert(hecho.some(h => h.startsWith(`tabla ${t}.`)), t);
    assertEquals(hecho.filter(h => h.startsWith('tabla ')).at(-1), 'tabla bitacora.user_id');
});

Deno.test('si Stripe falla no se borra nada', async () => {
    const { dep, hecho, archivos } = mundo({ falla: 'stripe' });
    const r = await eliminarCuenta(UID, dep);
    assertFalse(r.ok);
    if (!r.ok) { assertEquals(r.paso, 'stripe'); assertEquals(r.status, 502); }
    assertEquals(hecho, []);
    assertEquals(archivos.documents.size, 3);
});

Deno.test('si no se puede leer la suscripción tampoco se borra nada', async () => {
    const { dep, hecho } = mundo({ falla: 'leerSuscripcion' });
    const r = await eliminarCuenta(UID, dep);
    assertFalse(r.ok);
    assertEquals(hecho, []);
});

Deno.test('sin suscripción de Stripe no se llama a Stripe', async () => {
    const { dep, hecho } = mundo({ sub: null });
    assertEquals(await eliminarCuenta(UID, dep), { ok: true });
    assertFalse(hecho.includes('stripe'));
});

for (const paso of ['listar:documents', 'quitar:documents', 'leerDatos', 'quitar:compartidos', 'grupos', 'tabla:bitacora', 'tabla:amistades', 'auth']) {
    Deno.test(`un fallo en ${paso} no borra Auth`, async () => {
        const { dep, hecho } = mundo({ falla: paso });
        const r = await eliminarCuenta(UID, dep);
        assertFalse(r.ok);
        if (!r.ok) assertEquals(r.status, 500);
        assertFalse(hecho.includes('auth'));
    });
}

Deno.test('tras un fallo, repetir termina el trabajo', async () => {
    const m = mundo({ falla: 'tabla:bitacora_secrets' });
    assertFalse((await eliminarCuenta(UID, m.dep)).ok);
    const otra = mundo();
    otra.archivos.documents.clear();
    assertEquals(await eliminarCuenta(UID, otra.dep), { ok: true });
});

Deno.test('Storage se pagina: más de 1000 documentos', async () => {
    const { dep, archivos } = mundo({ nDocs: 2600 });
    assertEquals(await eliminarCuenta(UID, dep), { ok: true });
    assertEquals(archivos.documents.size, 0);
});

Deno.test('una tabla que no existe en el proyecto no bloquea el borrado', () => {
    assert(TABLAS.some(([t]) => t === 'beta_testers'));
});
