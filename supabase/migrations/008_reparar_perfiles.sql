-- ============================================================
-- [BE] Águila Envíos · Migración 008: reparar perfiles huérfanos
-- Ejecutar DESPUÉS de 007_endurecer_rastreo.sql. Es idempotente.
--
-- Problema: si el trigger handle_new_user no existe, falló o se deshabilitó, una
-- cuenta puede existir en auth.users sin fila en public.perfiles. Al iniciar sesión,
-- useAuth la trata como "sin perfil" y la expulsa. Este script crea el perfil que
-- falta con los datos que haya en user_metadata (full_name, apellidos, telefono).
--
-- No crea ni reemplaza el trigger handle_new_user: si no existe, restáuralo desde
-- aguila_envios_supabase_v2.sql. La app también sincroniza apellidos/teléfono en el
-- primer inicio de sesión (src/hooks/useAuth.tsx).
-- ============================================================

with base as (
  select
    u.id,
    btrim(regexp_replace(
      regexp_replace(coalesce(u.raw_user_meta_data->>'full_name', ''), '[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]', '', 'g'),
      ' {2,}', ' ', 'g'
    )) as nombres,
    btrim(regexp_replace(
      regexp_replace(coalesce(u.raw_user_meta_data->>'apellidos', ''), '[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]', '', 'g'),
      ' {2,}', ' ', 'g'
    )) as apellidos,
    regexp_replace(coalesce(u.raw_user_meta_data->>'telefono', ''), '\D', '', 'g') as telefono
  from auth.users u
  left join public.perfiles p on p.id = u.id
  where p.id is null
)
insert into public.perfiles (id, nombres, apellidos, telefono)
select
  id,
  -- El dominio de nombres exige letras y al menos 2 caracteres
  case when length(nombres) between 2 and 60 then nombres else 'Usuario' end,
  case when length(apellidos) between 2 and 60 then apellidos else null end,
  case when telefono ~ '^\d{7,15}$' then telefono else null end
from base
on conflict (id) do nothing;

-- Verificación (debe devolver 0 después de ejecutar):
-- select count(*) as huerfanos
-- from auth.users u
-- left join public.perfiles p on p.id = u.id
-- where p.id is null;
