-- Foto de perfil y descripción corta de cada usuario (js/perfil.js).
--
-- Va aparte de perfiles_publicos a propósito: aquella la puede leer
-- cualquier usuario autenticado (solo expone un nombre), y la foto solo
-- deben verla el propio usuario y sus amigos. La foto se guarda ya
-- procesada en el cliente (256 px, blanco y negro con grano, JPEG en
-- data URL), por eso basta un text con límite de tamaño.

create table if not exists perfiles_fotos (
    user_id uuid primary key references auth.users(id) on delete cascade,
    foto text check (foto is null or (foto like 'data:image/jpeg;base64,%' and length(foto) <= 150000)),
    descripcion text check (descripcion is null or length(descripcion) <= 160),
    actualizado_en timestamptz not null default now()
);

alter table perfiles_fotos enable row level security;

drop policy if exists "uno mismo y sus amigos ven la foto" on perfiles_fotos;
create policy "uno mismo y sus amigos ven la foto"
    on perfiles_fotos for select
    to authenticated
    using (
        auth.uid() = user_id
        or exists (select 1 from amistades a where a.user_id = auth.uid() and a.friend_id = perfiles_fotos.user_id)
    );

drop policy if exists "cada uno gestiona su foto" on perfiles_fotos;
create policy "cada uno gestiona su foto"
    on perfiles_fotos for all
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
