-- Gastos compartidos entre amigos (Social → gastos., al estilo Tricount).
-- Ejecutar en el SQL Editor de Supabase.
--
-- A diferencia de viajes_compartidos (una foto fija que se manda), aquí los
-- datos son vivos y comunes: un grupo, sus miembros y sus gastos los ven y
-- los editan todos los miembros. Un miembro puede no tener cuenta (user_id
-- null, solo nombre) para poder apuntar a alguien que no usa Bitácora.
--
-- reparto: [{"miembro": <id de grupos_gastos_miembros>, "importe": 12.5,
-- "partes": 1}] con los importes ya calculados en el cliente; "modo"
-- ('igual' | 'partes' | 'importes') solo sirve para volver a editarlo.

create table if not exists grupos_gastos (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    descripcion text,
    moneda text not null default 'EUR',
    creador_id uuid not null references auth.users(id) on delete cascade,
    creado_en timestamptz not null default now(),
    archivado boolean not null default false
);

create table if not exists grupos_gastos_miembros (
    id uuid primary key default gen_random_uuid(),
    grupo_id uuid not null references grupos_gastos(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null,
    nombre text not null,
    creado_en timestamptz not null default now(),
    unique (grupo_id, user_id)
);

create table if not exists gastos_compartidos (
    id uuid primary key default gen_random_uuid(),
    grupo_id uuid not null references grupos_gastos(id) on delete cascade,
    tipo text not null default 'gasto' check (tipo in ('gasto', 'transferencia', 'ingreso')),
    titulo text not null,
    importe numeric(12, 2) not null check (importe > 0),
    pagado_por uuid not null references grupos_gastos_miembros(id) on delete restrict,
    modo text not null default 'igual',
    reparto jsonb not null,
    fecha date not null default current_date,
    categoria text,
    creado_por uuid references auth.users(id) on delete set null,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

create index if not exists gastos_compartidos_grupo on gastos_compartidos (grupo_id, fecha desc);
create index if not exists grupos_gastos_miembros_user on grupos_gastos_miembros (user_id);

-- SECURITY DEFINER para que las políticas puedan consultar la tabla de
-- miembros sin entrar en recursión con su propia política.
create or replace function public.es_miembro_grupo_gastos(p_grupo uuid)
returns boolean language sql security definer stable set search_path = public as $$
    select exists (select 1 from grupos_gastos_miembros where grupo_id = p_grupo and user_id = auth.uid());
$$;

alter table grupos_gastos enable row level security;
alter table grupos_gastos_miembros enable row level security;
alter table gastos_compartidos enable row level security;

drop policy if exists "miembros ven el grupo" on grupos_gastos;
create policy "miembros ven el grupo" on grupos_gastos for select
    using (creador_id = auth.uid() or es_miembro_grupo_gastos(id));
drop policy if exists "cualquiera crea su grupo" on grupos_gastos;
create policy "cualquiera crea su grupo" on grupos_gastos for insert
    with check (creador_id = auth.uid());
drop policy if exists "miembros editan el grupo" on grupos_gastos;
create policy "miembros editan el grupo" on grupos_gastos for update
    using (es_miembro_grupo_gastos(id)) with check (es_miembro_grupo_gastos(id));
drop policy if exists "el creador borra el grupo" on grupos_gastos;
create policy "el creador borra el grupo" on grupos_gastos for delete
    using (creador_id = auth.uid());

drop policy if exists "miembros ven a los miembros" on grupos_gastos_miembros;
create policy "miembros ven a los miembros" on grupos_gastos_miembros for select
    using (es_miembro_grupo_gastos(grupo_id));
-- Solo se puede meter en un grupo a uno mismo, a un amigo o a alguien sin cuenta.
drop policy if exists "miembros añaden miembros" on grupos_gastos_miembros;
create policy "miembros añaden miembros" on grupos_gastos_miembros for insert
    with check (
        (es_miembro_grupo_gastos(grupo_id) or exists (select 1 from grupos_gastos g where g.id = grupo_id and g.creador_id = auth.uid()))
        and (user_id is null or user_id = auth.uid() or exists (select 1 from amistades a where a.user_id = auth.uid() and a.friend_id = grupos_gastos_miembros.user_id))
    );
drop policy if exists "miembros renombran miembros" on grupos_gastos_miembros;
create policy "miembros renombran miembros" on grupos_gastos_miembros for update
    using (es_miembro_grupo_gastos(grupo_id)) with check (es_miembro_grupo_gastos(grupo_id));
drop policy if exists "miembros quitan miembros" on grupos_gastos_miembros;
create policy "miembros quitan miembros" on grupos_gastos_miembros for delete
    using (es_miembro_grupo_gastos(grupo_id));

drop policy if exists "miembros ven los gastos" on gastos_compartidos;
create policy "miembros ven los gastos" on gastos_compartidos for select
    using (es_miembro_grupo_gastos(grupo_id));
drop policy if exists "miembros apuntan gastos" on gastos_compartidos;
create policy "miembros apuntan gastos" on gastos_compartidos for insert
    with check (es_miembro_grupo_gastos(grupo_id) and creado_por = auth.uid());
drop policy if exists "miembros editan gastos" on gastos_compartidos;
create policy "miembros editan gastos" on gastos_compartidos for update
    using (es_miembro_grupo_gastos(grupo_id)) with check (es_miembro_grupo_gastos(grupo_id));
drop policy if exists "miembros borran gastos" on gastos_compartidos;
create policy "miembros borran gastos" on gastos_compartidos for delete
    using (es_miembro_grupo_gastos(grupo_id));

-- Salir de un grupo: si la persona ya sale en algún gasto, se queda como
-- miembro sin cuenta (con su nombre) para no descuadrar las cuentas.
create or replace function public.salir_grupo_gastos(p_grupo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_miembro uuid;
begin
    select id into v_miembro from grupos_gastos_miembros where grupo_id = p_grupo and user_id = auth.uid();
    if v_miembro is null then return; end if;
    if exists (select 1 from gastos_compartidos where grupo_id = p_grupo and (pagado_por = v_miembro or reparto @> jsonb_build_array(jsonb_build_object('miembro', v_miembro)))) then
        update grupos_gastos_miembros set user_id = null where id = v_miembro;
    else
        delete from grupos_gastos_miembros where id = v_miembro;
    end if;
    delete from grupos_gastos g where g.id = p_grupo and not exists (select 1 from grupos_gastos_miembros m where m.grupo_id = p_grupo and m.user_id is not null);
end;
$$;
revoke all on function public.salir_grupo_gastos(uuid) from public, anon;
grant execute on function public.salir_grupo_gastos(uuid) to authenticated;

-- Eventos propios que se comparten con amigos: misma idea que
-- viajes_compartidos (una foto del evento); el destinatario lo añade a su
-- calendario o lo descarta, y la fila se borra.
create table if not exists eventos_compartidos (
    id uuid primary key default gen_random_uuid(),
    remitente_id uuid not null references auth.users(id) on delete cascade,
    destinatario_id uuid not null references auth.users(id) on delete cascade,
    evento jsonb not null,
    nota text,
    creado_en timestamptz not null default now()
);
alter table eventos_compartidos enable row level security;
drop policy if exists "remitente comparte evento con un amigo" on eventos_compartidos;
create policy "remitente comparte evento con un amigo" on eventos_compartidos for insert
    with check (auth.uid() = remitente_id and exists (select 1 from amistades a where a.user_id = auth.uid() and a.friend_id = destinatario_id));
drop policy if exists "destinatario ve sus eventos compartidos" on eventos_compartidos;
create policy "destinatario ve sus eventos compartidos" on eventos_compartidos for select
    using (auth.uid() = destinatario_id);
drop policy if exists "remitente o destinatario borran el evento compartido" on eventos_compartidos;
create policy "remitente o destinatario borran el evento compartido" on eventos_compartidos for delete
    using (auth.uid() = remitente_id or auth.uid() = destinatario_id);
