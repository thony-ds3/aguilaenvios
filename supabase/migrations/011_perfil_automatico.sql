-- ============================================================
-- [BE] Águila Envíos · Migración 011: perfil automático y autorreparación
-- Ejecutar DESPUÉS de 010_realtime_y_politicas.sql. Es idempotente.
--
-- Dos problemas reales del proyecto:
--   1) Si el trigger `handle_new_user` no existe (o se perdió), una cuenta creada
--      en Auth queda sin fila en `perfiles` y la app la expulsa al iniciar sesión.
--   2) En la app no había forma segura de que el propio usuario reparara ese hueco.
--
-- Esta migración:
--   - recrea `handle_new_user` de forma tolerante (sanea nombres, limita longitudes,
--     nunca acepta roles desde metadatos y no pisa un perfil existente);
--   - crea la RPC `reparar_mi_perfil()`: devuelve el perfil actual o crea uno de
--     cliente activo con los metadatos de Auth. Solo se puede llamar con sesión.
--
-- El INSERT de la RPC se autoriza con la bandera de transacción
-- `ae.reparando_perfil`, que el trigger de la migración 009 exige. Un INSERT
-- directo por PostgREST no puede activar esa bandera.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Normalizador común (evita duplicar el saneo en cada función)
-- ------------------------------------------------------------
create or replace function public.normalizar_nombre(p_texto text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select left(
    nullif(
      btrim(
        regexp_replace(
          regexp_replace(coalesce(p_texto, ''), '[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]', '', 'g'),
          ' {2,}', ' ', 'g'
        )
      ),
      ''
    ),
    60
  );
$$;

revoke execute on function public.normalizar_nombre(text) from public, anon;
grant execute on function public.normalizar_nombre(text) to authenticated;

-- ------------------------------------------------------------
-- 2) handle_new_user: alta de cliente desde los metadatos de Auth
-- ------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nombres text;
  v_apellidos text;
  v_telefono text;
begin
  v_nombres := public.normalizar_nombre(
    coalesce(new.raw_user_meta_data->>'nombres', new.raw_user_meta_data->>'full_name')
  );
  if v_nombres is null or length(v_nombres) < 2 then
    v_nombres := 'Usuario';
  end if;

  v_apellidos := public.normalizar_nombre(new.raw_user_meta_data->>'apellidos');
  if v_apellidos is not null and length(v_apellidos) < 2 then
    v_apellidos := null;
  end if;

  v_telefono := regexp_replace(coalesce(new.raw_user_meta_data->>'telefono', ''), '\D', '', 'g');
  if v_telefono !~ '^\d{7,15}$' then
    v_telefono := null;
  end if;

  -- El rol SIEMPRE es cliente: los roles de personal los asigna la Edge Function
  -- crear-usuario con service_role, nunca un metadato que pueda manipular el usuario.
  insert into public.perfiles (id, nombres, apellidos, telefono, rol, activo)
  values (new.id, v_nombres, v_apellidos, v_telefono, 'cliente', true)
  on conflict (id) do nothing;

  return new;
end $$;

-- Si el esquema base ya tenía un trigger apuntando a handle_new_user con otro nombre,
-- se retira para no duplicar inserciones. Solo se tocan triggers de esa función.
do $$
declare
  r record;
begin
  for r in
    select t.tgname
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'auth.users'::regclass
      and not t.tgisinternal
      and p.proname = 'handle_new_user'
  loop
    execute format('drop trigger if exists %I on auth.users', r.tgname);
  end loop;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 3) RPC reparar_mi_perfil(): autorreparación segura
-- ------------------------------------------------------------
create or replace function public.reparar_mi_perfil() returns public.perfiles
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_meta jsonb;
  v_nombres text;
  v_apellidos text;
  v_telefono text;
  v_perfil public.perfiles;
begin
  if v_id is null then
    raise exception 'Necesitas iniciar sesión para reparar tu perfil';
  end if;

  select * into v_perfil from public.perfiles where id = v_id;
  if found then
    return v_perfil;
  end if;

  -- La cuenta debe existir en Auth (auth.uid() ya lo garantiza, pero se leen metadatos)
  select coalesce(raw_user_meta_data, '{}'::jsonb)
    into v_meta
    from auth.users
    where id = v_id;

  if not found then
    raise exception 'La cuenta no existe';
  end if;

  v_nombres := public.normalizar_nombre(
    coalesce(v_meta->>'nombres', v_meta->>'full_name')
  );
  if v_nombres is null or length(v_nombres) < 2 then
    v_nombres := 'Usuario';
  end if;

  v_apellidos := public.normalizar_nombre(v_meta->>'apellidos');
  if v_apellidos is not null and length(v_apellidos) < 2 then
    v_apellidos := null;
  end if;

  v_telefono := regexp_replace(coalesce(v_meta->>'telefono', ''), '\D', '', 'g');
  if v_telefono !~ '^\d{7,15}$' then
    v_telefono := null;
  end if;

  -- Bandera que autoriza el INSERT en el trigger de la migración 009
  perform set_config('ae.reparando_perfil', 'on', true);

  insert into public.perfiles (id, nombres, apellidos, telefono, rol, activo)
  values (v_id, v_nombres, v_apellidos, v_telefono, 'cliente', true)
  on conflict (id) do nothing;

  perform set_config('ae.reparando_perfil', 'off', true);

  select * into v_perfil from public.perfiles where id = v_id;
  if not found then
    raise exception 'No se pudo crear el perfil';
  end if;

  return v_perfil;
end $$;

revoke execute on function public.reparar_mi_perfil() from public, anon;
grant execute on function public.reparar_mi_perfil() to authenticated;

-- ------------------------------------------------------------
-- 4) Reparación inmediata de cuentas ya existentes (idempotente)
--    Misma lógica que 008, por si 008 se ejecutó antes de recrear el trigger.
-- ------------------------------------------------------------
with base as (
  select
    u.id,
    public.normalizar_nombre(
      coalesce(u.raw_user_meta_data->>'nombres', u.raw_user_meta_data->>'full_name')
    ) as nombres,
    public.normalizar_nombre(u.raw_user_meta_data->>'apellidos') as apellidos,
    regexp_replace(coalesce(u.raw_user_meta_data->>'telefono', ''), '\D', '', 'g') as telefono
  from auth.users u
  left join public.perfiles p on p.id = u.id
  where p.id is null
)
insert into public.perfiles (id, nombres, apellidos, telefono, rol, activo)
select
  id,
  case when length(nombres) between 2 and 60 then nombres else 'Usuario' end,
  case when length(apellidos) between 2 and 60 then apellidos else null end,
  case when telefono ~ '^\d{7,15}$' then telefono else null end,
  'cliente',
  true
from base
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 5) Comprobación (opcional, solo lectura)
-- ------------------------------------------------------------
-- select count(*) as huerfanos
-- from auth.users u left join public.perfiles p on p.id = u.id
-- where p.id is null;
-- select tgname, tgenabled from pg_trigger where tgname = 'on_auth_user_created';
