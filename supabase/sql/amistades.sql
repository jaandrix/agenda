-- Lista de amistades de Bitácora. Ejecutar en el SQL Editor de Supabase.
--
-- El cliente NUNCA escribe aquí directamente — las amistades se crean
-- (y se borran) a través de las funciones RPC
-- enviar_solicitud_amistad_por_codigo()/eliminar_amigo() (SECURITY
-- DEFINER, se saltan RLS por diseño). Por eso esta tabla solo necesita
-- política de lectura: cada usuario ve únicamente su propia lista.
-- Si esas funciones RPC no existen todavía con SECURITY DEFINER,
-- añadir amigos no funcionará aunque esta política esté bien — revísalas
-- también.

alter table amistades enable row level security;

drop policy if exists "usuarios ven su propia lista de amigos" on amistades;
create policy "usuarios ven su propia lista de amigos"
    on amistades for select
    using (auth.uid() = user_id);
