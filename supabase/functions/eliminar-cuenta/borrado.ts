// Orden y comprobaciones del borrado de cuenta, sin red: index.ts le pasa las
// llamadas reales y borrado_test.ts unas falsas que fallan en cada paso.
//
// Reglas:
// 1. Si no se puede cancelar la suscripción de Stripe, no se borra nada.
// 2. Cada paso se puede repetir: si algo falla a medias, la cuenta sigue
//    existiendo y el usuario puede volver a intentarlo.
// 3. El usuario de Auth se borra lo último, solo si todo lo anterior salió
//    bien y ya no quedan archivos suyos.

export type Resultado = { data?: any; error?: any };

export type Dependencias = {
    leerSuscripcion: (uid: string) => Promise<Resultado>;
    cancelarStripe: (sub: { stripe_customer_id?: string | null; stripe_subscription_id?: string | null }) => Promise<void>;
    listar: (bucket: string, prefijo: string, offset: number, limite: number) => Promise<Resultado>;
    quitar: (bucket: string, rutas: string[]) => Promise<Resultado>;
    leerJson: (bucket: string, ruta: string) => Promise<Resultado>;
    leerDatos: (uid: string) => Promise<Resultado>;
    gruposCreados: (uid: string) => Promise<Resultado>;
    otroMiembro: (grupoId: string, uid: string) => Promise<Resultado>;
    pasarGrupo: (grupoId: string, nuevo: string) => Promise<Resultado>;
    borrarGrupo: (grupoId: string) => Promise<Resultado>;
    borrarFilas: (tabla: string, columna: string, uid: string) => Promise<Resultado>;
    borrarUsuario: (uid: string) => Promise<Resultado>;
};

export type Salida = { ok: true } | { ok: false; paso: string; status: number; error: string };

// Todas las tablas con datos de la persona. Las que tienen "on delete cascade"
// también se irían al borrar Auth, pero se borran aquí para poder comprobarlo
// antes; amistades, solicitudes_amistad, perfiles_publicos, codigos_amigo y
// bitacora_secrets no lo tienen. bitacora va la última: guarda la lista de
// enlaces compartidos, que hace falta si hay que repetir el borrado.
// suscripciones se deja a la cascada para que un reintento aún vea Stripe.
// grupos_gastos_miembros y gastos_compartidos se quedan (user_id pasa a null
// solo): son las cuentas comunes de sus amigos.
export const TABLAS: [string, string][] = [
    ['amistades', 'user_id'], ['amistades', 'friend_id'],
    ['solicitudes_amistad', 'remitente_id'], ['solicitudes_amistad', 'destinatario_id'],
    ['perfiles_publicos', 'user_id'], ['perfiles_fotos', 'user_id'], ['codigos_amigo', 'user_id'],
    ['recomendaciones', 'remitente_id'], ['recomendaciones', 'destinatario_id'],
    ['listas_ocio_compartidas', 'remitente_id'], ['listas_ocio_compartidas', 'destinatario_id'],
    ['viajes_compartidos', 'remitente_id'], ['viajes_compartidos', 'destinatario_id'],
    ['eventos_compartidos', 'remitente_id'], ['eventos_compartidos', 'destinatario_id'],
    ['resultados_test', 'jugador'], ['partidas_test', 'creador'],
    ['conector_tokens', 'user_id'], ['conector_bandeja', 'user_id'],
    ['push_subscriptions', 'user_id'], ['avisos_enviados', 'user_id'],
    ['correo_semanal', 'user_id'], ['actividad', 'user_id'], ['sugerencias', 'user_id'],
    ['invitaciones', 'invitado'], ['invitaciones', 'anfitrion'], ['invitaciones_codigos', 'user_id'],
    ['beta_testers', 'user_id'],
    ['bitacora_snapshots', 'user_id'], ['bitacora_secrets', 'user_id'], ['bitacora', 'user_id'],
];

// Una tabla que no existe en este proyecto no tiene datos que borrar; cualquier otro error para el borrado.
export const tablaNoExiste = (e: any) => ['42P01', 'PGRST205'].includes(e?.code) || /could not find the table|does not exist/i.test(String(e?.message || ''));

const SUB_VIVA = (s: any) => !!(s?.stripe_subscription_id || s?.stripe_customer_id);
const idCompartido = (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9_-]{16}$/.test(id);
const PAGINA = 1000;

class FalloPaso extends Error {
    constructor(public paso: string, public detalle: unknown) { super(paso); }
}
function comprobar(paso: string, r: Resultado) {
    if (r?.error) throw new FalloPaso(paso, r.error);
    return r?.data;
}

// Todas las rutas bajo un prefijo, paginando y bajando a las carpetas.
export async function rutasBajo(dep: Dependencias, bucket: string, prefijo: string, paso: string): Promise<string[]> {
    const rutas: string[] = [];
    for (let offset = 0; ; offset += PAGINA) {
        const lista = comprobar(paso, await dep.listar(bucket, prefijo, offset, PAGINA)) || [];
        for (const item of lista) {
            const ruta = `${prefijo}/${item.name}`;
            if (item.id) rutas.push(ruta);
            else rutas.push(...await rutasBajo(dep, bucket, ruta, paso));
        }
        if (lista.length < PAGINA) return rutas;
    }
}

async function quitarTodas(dep: Dependencias, bucket: string, rutas: string[], paso: string) {
    for (let i = 0; i < rutas.length; i += PAGINA) comprobar(paso, await dep.quitar(bucket, rutas.slice(i, i + PAGINA)));
}

export async function eliminarCuenta(uid: string, dep: Dependencias): Promise<Salida> {
    // 1. Stripe. Si falla, se para aquí sin haber tocado nada.
    try {
        const sub = comprobar('stripe', await dep.leerSuscripcion(uid));
        if (SUB_VIVA(sub)) await dep.cancelarStripe(sub);
    } catch (e) {
        console.error('eliminar-cuenta: Stripe', e instanceof FalloPaso ? e.detalle : e);
        return { ok: false, paso: 'stripe', status: 502, error: 'No se ha borrado nada: no hemos podido cancelar tu suscripción. Vuelve a intentarlo en un rato; si sigue fallando, escríbenos.' };
    }

    try {
        // 2. Documentos (bucket documents, todo bajo <uid>/).
        await quitarTodas(dep, 'documents', await rutasBajo(dep, 'documents', uid, 'documentos'), 'documentos');

        // 3. Enlaces compartidos sin registro (bucket compartidos). Solo los suyos según meta.json:
        //    la lista viene de sus propios datos y no debe servir para borrar los de otro.
        const datos = comprobar('compartidos', await dep.leerDatos(uid));
        const ids = (Array.isArray(datos?.servicios?.compartidos) ? datos.servicios.compartidos : []).map((c: any) => c?.id).filter(idCompartido);
        for (const id of [...new Set(ids)] as string[]) {
            const meta = await dep.leerJson('compartidos', `${id}/meta.json`);
            if (meta.error || !meta.data || meta.data.owner !== uid) continue;
            const rutas = await rutasBajo(dep, 'compartidos', `${id}/ev`, 'compartidos');
            await quitarTodas(dep, 'compartidos', [...rutas, `${id}/meta.json`], 'compartidos');
        }

        // 4. Grupos de gastos que creó: pasan a otro miembro con cuenta; si no queda nadie, se borran.
        for (const g of comprobar('grupos', await dep.gruposCreados(uid)) || []) {
            const otro = comprobar('grupos', await dep.otroMiembro(g.id, uid));
            comprobar('grupos', otro?.user_id ? await dep.pasarGrupo(g.id, otro.user_id) : await dep.borrarGrupo(g.id));
        }

        // 5. Tablas.
        for (const [tabla, columna] of TABLAS) {
            const r = await dep.borrarFilas(tabla, columna, uid);
            if (r?.error && !tablaNoExiste(r.error)) throw new FalloPaso(`tabla ${tabla}`, r.error);
        }

        // 6. Comprobación: no queda ningún documento.
        const quedan = await rutasBajo(dep, 'documents', uid, 'comprobación');
        if (quedan.length) throw new FalloPaso('comprobación', `${quedan.length} archivos siguen en documents`);

        // 7. Auth, lo último.
        comprobar('auth', await dep.borrarUsuario(uid));
        return { ok: true };
    } catch (e) {
        const paso = e instanceof FalloPaso ? e.paso : 'desconocido';
        console.error(`eliminar-cuenta: falló en ${paso}`, e instanceof FalloPaso ? e.detalle : e);
        return { ok: false, paso, status: 500, error: 'No se ha podido terminar de borrar la cuenta. Sigue existiendo (si tenías suscripción, ya está cancelada): vuelve a intentarlo; si sigue fallando, escríbenos y lo hacemos a mano.' };
    }
}
