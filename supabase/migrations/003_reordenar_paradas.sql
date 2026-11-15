-- ============================================================
-- [BE] Águila Envíos · Migración 003: reordenar paradas de un viaje
-- Ejecutar DESPUÉS de aguila_envios_supabase_v2.sql y 002_rastreo_cliente.sql
-- (Supabase > SQL Editor). No cambia tablas, columnas ni políticas RLS.
--
-- Motivo: la política guias_update solo deja editar guías a recepción/admin y
-- solo mientras no tienen viaje. Logística no puede cambiar orden_parada con un
-- UPDATE directo, así que "ordenar paradas" necesita esta función. Sigue las
-- mismas reglas que agregar_guias_a_viaje: rol, recinto y viaje aún programado.
-- ============================================================

drop function if exists public.reordenar_paradas(uuid, uuid[]);

-- p_guias: TODAS las guías del viaje, en el orden nuevo (la primera será la parada 1)
create function public.reordenar_paradas(p_viaje uuid, p_guias uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v viajes;
  n integer;
begin
  -- "is null" primero: una cuenta desactivada no tiene rol y no debe pasar
  if mi_rol() is null or mi_rol() not in ('logistica', 'admin', 'superadmin') then
    raise exception 'Sin permiso';
  end if;
  select * into v from viajes where id = p_viaje;
  if not found then raise exception 'Viaje no encontrado'; end if;
  if mi_rol() <> 'superadmin' and v.recinto_id is distinct from mi_recinto() then
    raise exception 'Sin permiso';
  end if;
  if v.estado <> 'programado' then raise exception 'El viaje ya salió o terminó'; end if;

  -- La lista debe contener exactamente las guías del viaje, sin repetir ni faltar
  select count(*) into n from guias where viaje_id = p_viaje;
  if n <> coalesce(array_length(p_guias, 1), 0)
     or n <> (select count(distinct g.id) from guias g
              where g.viaje_id = p_viaje and g.id = any (p_guias)) then
    raise exception 'La lista de paradas no coincide con las guías del viaje';
  end if;

  update guias g set orden_parada = t.orden
  from unnest(p_guias) with ordinality as t(id, orden)
  where g.id = t.id and g.viaje_id = p_viaje;
end $$;

revoke execute on function public.reordenar_paradas(uuid, uuid[]) from public, anon;
grant execute on function public.reordenar_paradas(uuid, uuid[]) to authenticated;
