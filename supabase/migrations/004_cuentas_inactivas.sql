-- ============================================================
-- [BE] Águila Envíos · Migración 004 (OPCIONAL, recomendada): cuentas desactivadas
-- La app funciona sin esta migración. Corrige un hueco de seguridad del esquema v2.
--
-- Problema: mi_rol() devuelve NULL cuando la cuenta está desactivada (activo = false).
-- En SQL, "NULL not in (...)" y "NULL <> 'chofer'" dan NULL, y un IF con NULL no entra.
-- Resultado: una cuenta desactivada que conserve su sesión puede seguir llamando a
-- agregar_guias_a_viaje, asignar_chofer y marcar_en_ruta (de cualquier recinto), y un
-- chófer desactivado puede seguir confirmando entregas de su viaje.
--
-- Cambio: solo la primera comprobación de cada función ("mi_rol() is null or ...").
-- El resto del cuerpo es idéntico al de aguila_envios_supabase_v2.sql.
-- "create or replace" conserva los permisos (grant/revoke) ya definidos.
-- ============================================================

create or replace function public.agregar_guias_a_viaje(p_viaje uuid, p_guias uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare v viajes; n integer;
begin
  if mi_rol() is null or mi_rol() not in ('logistica', 'admin', 'superadmin') then raise exception 'Sin permiso'; end if;
  select * into v from viajes where id = p_viaje;
  if not found then raise exception 'Viaje no encontrado'; end if;
  if mi_rol() <> 'superadmin' and v.recinto_id is distinct from mi_recinto() then
    raise exception 'Sin permiso'; end if;
  if v.estado <> 'programado' then raise exception 'El viaje ya salió o terminó'; end if;
  with sel as (
    select id, row_number() over (order by fecha_recepcion, created_at) rn
    from guias
    where id = any (p_guias) and recinto_id = v.recinto_id and estado = 'enviada_a_logistica'
      and fecha_recepcion between v.fecha_viaje - 2 and v.fecha_viaje),
  base as (select coalesce(max(orden_parada), 0) m from guias where viaje_id = p_viaje)
  update guias g set viaje_id = p_viaje, estado = 'asignada', orden_parada = base.m + sel.rn
  from sel, base where g.id = sel.id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.asignar_chofer(p_viaje uuid, p_chofer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v viajes;
begin
  if mi_rol() is null or mi_rol() not in ('logistica', 'admin', 'superadmin') then raise exception 'Sin permiso'; end if;
  select * into v from viajes where id = p_viaje;
  if not found then raise exception 'Viaje no encontrado'; end if;
  if mi_rol() <> 'superadmin' and v.recinto_id is distinct from mi_recinto() then
    raise exception 'Sin permiso'; end if;
  if v.estado <> 'programado' then raise exception 'El viaje ya salió o terminó'; end if;
  update viajes set chofer_id = p_chofer where id = p_viaje;  -- el trigger valida al chófer
end $$;

create or replace function public.marcar_en_ruta(p_viaje uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v viajes;
begin
  if mi_rol() is null or mi_rol() not in ('logistica', 'admin', 'superadmin') then raise exception 'Sin permiso'; end if;
  select * into v from viajes where id = p_viaje;
  if not found then raise exception 'Viaje no encontrado'; end if;
  if mi_rol() <> 'superadmin' and v.recinto_id is distinct from mi_recinto() then
    raise exception 'Sin permiso'; end if;
  if v.estado <> 'programado' then raise exception 'El viaje ya salió o terminó'; end if;
  if v.chofer_id is null then raise exception 'Asigna un chófer primero'; end if;
  if not exists (select 1 from guias where viaje_id = p_viaje) then
    raise exception 'El viaje no tiene guías'; end if;
  update viajes set estado = 'en_ruta', salida_at = now() where id = p_viaje;
  update guias set estado = 'en_ruta' where viaje_id = p_viaje and estado = 'asignada';
end $$;

create or replace function public.confirmar_entrega(p_guia uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g guias;
begin
  if mi_rol() is distinct from 'chofer' then raise exception 'Solo el chófer confirma entregas'; end if;
  select gu.* into g from guias gu join viajes v on v.id = gu.viaje_id
  where gu.id = p_guia and v.chofer_id = auth.uid() and v.estado = 'en_ruta' and gu.estado = 'en_ruta';
  if not found then raise exception 'Guía no disponible para entrega'; end if;
  update guias set estado = 'entregada', entregada_at = now() where id = p_guia;
  if not exists (select 1 from guias where viaje_id = g.viaje_id and estado <> 'entregada') then
    update viajes set estado = 'finalizado' where id = g.viaje_id;
  end if;
end $$;
