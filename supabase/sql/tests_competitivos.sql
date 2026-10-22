-- Test competitivo entre amigos (Estudios → repaso → test).
-- Ejecutar entero en el SQL Editor de Supabase.
--
-- Quien crea una partida elige preguntas tipo test, los segundos por pregunta,
-- cuánto tiempo está abierta y a qué amigos invita. Cada participante (también
-- quien la crea) la juega una vez, cuando quiera mientras esté abierta; gana
-- quien más puntos saca (100 por acierto y hasta 50 más por rapidez).
--
-- Las respuestas correctas viven en una tabla aparte que nadie puede leer: la
-- puntuación se calcula aquí, en funciones del servidor, para que no se puedan
-- mirar antes de jugar. Todo se escribe a través de funciones; las tablas solo
-- se leen, y solo quien participa.
-- Límites: 3 partidas creadas por persona y día (hora de Madrid), hasta 50
-- preguntas de 2 a 6 opciones, de 5 a 120 segundos por pregunta, abierta de 1
-- hora a 7 días.

create table if not exists partidas_test (
    id uuid primary key default gen_random_uuid(),
    creador uuid not null default auth.uid() references auth.users on delete cascade,
    titulo text not null,
    preguntas jsonb not null,           -- [{ pregunta, opciones: [..] }], sin la correcta
    segundos int not null,
    invitados uuid[] not null default '{}',
    caduca timestamptz not null,
    creada timestamptz not null default now()
);
create index if not exists partidas_test_creador on partidas_test (creador, creada);

create table if not exists partidas_test_soluciones (
    partida uuid primary key references partidas_test on delete cascade,
    correctas int[] not null
);

create table if not exists resultados_test (
    partida uuid not null references partidas_test on delete cascade,
    jugador uuid not null default auth.uid() references auth.users on delete cascade,
    empezada timestamptz not null default now(),
    terminada timestamptz,
    puntos int not null default 0,
    aciertos int not null default 0,
    respuestas jsonb,
    primary key (partida, jugador)
);

alter table partidas_test enable row level security;
alter table partidas_test_soluciones enable row level security;
alter table resultados_test enable row level security;

drop policy if exists "partidas: participantes" on partidas_test;
create policy "partidas: participantes" on partidas_test for select to authenticated
    using (creador = auth.uid() or auth.uid() = any (invitados));
drop policy if exists "partidas: borra quien la crea" on partidas_test;
create policy "partidas: borra quien la crea" on partidas_test for delete to authenticated
    using (creador = auth.uid());

-- partidas_test_soluciones: sin políticas, nadie la lee ni la escribe desde fuera.

drop policy if exists "resultados: participantes" on resultados_test;
create policy "resultados: participantes" on resultados_test for select to authenticated
    using (exists (select 1 from partidas_test p where p.id = partida and (p.creador = auth.uid() or auth.uid() = any (p.invitados))));

revoke insert, update, delete on partidas_test, resultados_test from anon, authenticated;
revoke all on partidas_test_soluciones from anon, authenticated;

-- Crear una partida --------------------------------------------------------
create or replace function crear_partida_test(p_titulo text, p_preguntas jsonb, p_segundos int, p_horas int, p_invitados uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
    yo uuid := auth.uid();
    hoy date := (now() at time zone 'Europe/Madrid')::date;
    n int := jsonb_array_length(coalesce(p_preguntas, '[]'::jsonb));
    limpias jsonb := '[]'::jsonb;
    v_correctas int[] := '{}';
    q jsonb;
    nueva uuid;
    v_invitados uuid[];
begin
    if yo is null then raise exception 'Sin sesión'; end if;
    if (select count(*) from partidas_test where creador = yo and (creada at time zone 'Europe/Madrid')::date = hoy) >= 3 then
        raise exception 'Ya has creado 3 partidas hoy: vuelve mañana';
    end if;
    if n < 1 or n > 50 then raise exception 'Entre 1 y 50 preguntas'; end if;
    if p_segundos < 5 or p_segundos > 120 then raise exception 'Entre 5 y 120 segundos por pregunta'; end if;
    if p_horas < 1 or p_horas > 168 then raise exception 'Abierta entre 1 hora y 7 días'; end if;
    if length(coalesce(trim(p_titulo), '')) = 0 then raise exception 'Falta el título'; end if;
    for q in select * from jsonb_array_elements(p_preguntas) loop
        if jsonb_typeof(q -> 'opciones') <> 'array' or jsonb_array_length(q -> 'opciones') < 2 or jsonb_array_length(q -> 'opciones') > 6 then
            raise exception 'Cada pregunta necesita de 2 a 6 opciones';
        end if;
        if (q ->> 'correcta')::int is null or (q ->> 'correcta')::int < 0 or (q ->> 'correcta')::int >= jsonb_array_length(q -> 'opciones') then
            raise exception 'Cada pregunta necesita su opción correcta';
        end if;
        limpias := limpias || jsonb_build_object('pregunta', left(q ->> 'pregunta', 500), 'opciones', (select jsonb_agg(left(o #>> '{}', 200)) from jsonb_array_elements(q -> 'opciones') o));
        v_correctas := v_correctas || (q ->> 'correcta')::int;
    end loop;
    -- Solo se puede invitar a amigos.
    select coalesce(array_agg(distinct i), '{}') into v_invitados from unnest(coalesce(p_invitados, '{}')) i
        where exists (select 1 from amistades a where a.user_id = yo and a.friend_id = i);
    insert into partidas_test (creador, titulo, preguntas, segundos, invitados, caduca)
        values (yo, left(trim(p_titulo), 120), limpias, p_segundos, v_invitados, now() + make_interval(hours => p_horas))
        returning id into nueva;
    insert into partidas_test_soluciones (partida, correctas) values (nueva, v_correctas);
    return nueva;
end $$;

-- Empezar: deja constancia de la hora (una sola vez por persona) ------------
create or replace function empezar_partida_test(p_partida uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    yo uuid := auth.uid();
    p partidas_test;
begin
    select * into p from partidas_test where id = p_partida and (creador = yo or yo = any (invitados));
    if p.id is null then raise exception 'No tienes acceso a esta partida'; end if;
    if p.caduca < now() then raise exception 'La partida ya está cerrada'; end if;
    if exists (select 1 from resultados_test where partida = p_partida and jugador = yo) then raise exception 'Ya has jugado esta partida'; end if;
    insert into resultados_test (partida, jugador) values (p_partida, yo);
    return jsonb_build_object('titulo', p.titulo, 'preguntas', p.preguntas, 'segundos', p.segundos);
end $$;

-- Terminar: puntúa en el servidor -------------------------------------------
-- p_respuestas: [{ opcion: índice o null, ms: milisegundos que tardó }].
-- 100 puntos por acierto y hasta 50 más según la rapidez. Si la suma de los
-- tiempos que dice el cliente no cuadra con el tiempo real transcurrido, no
-- hay puntos de rapidez.
create or replace function terminar_partida_test(p_partida uuid, p_respuestas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    yo uuid := auth.uid();
    p partidas_test;
    r resultados_test;
    sol int[];
    i int;
    resp jsonb;
    opcion int;
    ms int;
    limite int;
    total_ms bigint := 0;
    v_aciertos int := 0;
    v_puntos int := 0;
    bonus int := 0;
    real_ms bigint;
begin
    select * into p from partidas_test where id = p_partida;
    select * into r from resultados_test where partida = p_partida and jugador = yo;
    if r.partida is null then raise exception 'Primero hay que empezar la partida'; end if;
    if r.terminada is not null then raise exception 'Ya has terminado esta partida'; end if;
    select correctas into sol from partidas_test_soluciones where partida = p_partida;
    limite := p.segundos * 1000;
    for i in 0 .. array_length(sol, 1) - 1 loop
        resp := coalesce(p_respuestas -> i, '{}'::jsonb);
        opcion := (resp ->> 'opcion')::int;
        ms := least(greatest(coalesce((resp ->> 'ms')::int, limite), 0), limite);
        total_ms := total_ms + ms;
        if opcion is not null and opcion = sol[i + 1] then
            v_aciertos := v_aciertos + 1;
            v_puntos := v_puntos + 100;
            bonus := bonus + round(50.0 * (limite - ms) / limite);
        end if;
    end loop;
    real_ms := extract(epoch from (now() - r.empezada)) * 1000;
    if total_ms <= real_ms + 3000 then v_puntos := v_puntos + bonus; end if;
    update resultados_test set terminada = now(), puntos = v_puntos, aciertos = v_aciertos, respuestas = p_respuestas
        where partida = p_partida and jugador = yo;
    return jsonb_build_object('puntos', v_puntos, 'aciertos', v_aciertos, 'total', array_length(sol, 1), 'correctas', to_jsonb(sol));
end $$;

-- Clasificación con nombres (los participantes no tienen por qué ser amigos entre sí)
create or replace function clasificacion_partida_test(p_partida uuid)
returns table (jugador uuid, nombre text, puntos int, aciertos int, terminada timestamptz)
language sql security definer set search_path = public as $$
    select r.jugador, coalesce(pp.nombre_publico, 'Sin nombre'), r.puntos, r.aciertos, r.terminada
    from resultados_test r
    join partidas_test p on p.id = r.partida
    left join perfiles_publicos pp on pp.user_id = r.jugador
    where r.partida = p_partida and (p.creador = auth.uid() or auth.uid() = any (p.invitados))
    order by r.terminada is null, r.puntos desc, r.terminada;
$$;

-- Soluciones para repasar, solo para quien ya ha terminado
create or replace function soluciones_partida_test(p_partida uuid)
returns int[] language sql security definer set search_path = public as $$
    select s.correctas from partidas_test_soluciones s
    where s.partida = p_partida and exists (select 1 from resultados_test r where r.partida = p_partida and r.jugador = auth.uid() and r.terminada is not null);
$$;

revoke execute on function crear_partida_test(text, jsonb, int, int, uuid[]) from public, anon;
revoke execute on function empezar_partida_test(uuid) from public, anon;
revoke execute on function terminar_partida_test(uuid, jsonb) from public, anon;
revoke execute on function clasificacion_partida_test(uuid) from public, anon;
revoke execute on function soluciones_partida_test(uuid) from public, anon;
grant execute on function crear_partida_test(text, jsonb, int, int, uuid[]) to authenticated;
grant execute on function empezar_partida_test(uuid) to authenticated;
grant execute on function terminar_partida_test(uuid, jsonb) to authenticated;
grant execute on function clasificacion_partida_test(uuid) to authenticated;
grant execute on function soluciones_partida_test(uuid) to authenticated;
