-- ============================================================
-- [BE] Águila Envíos · Migración 009: blindaje de privilegios y suplantación
-- Ejecutar DESPUÉS de 008_reparar_perfiles.sql. Es idempotente.
--
-- El esquema real no muestra las políticas RLS. Si una política de UPDATE de
-- `perfiles` permite `id = auth.uid()` sin restringir columnas, un cliente podría
-- ejecutar `update perfiles set rol = 'superadmin'` y escalar privilegios.
-- Estos triggers cierran esa vía aunque la política sea demasiado amplia:
--
--   1) perfiles: solo superadmin (o service_role) asigna roles administrativos.
--      Un admin gestiona únicamente usuarios de su recinto y nunca puede ascenderse
--      ni crear otro admin. El resto solo edita sus propios datos.
--   2) ubicaciones: un chófer solo escribe su propia posición; los clientes no escriben.
--   3) viajes: un chófer no puede reasignarse viajes ni cambiar el recinto/creador.
--   4) pagos: solo recepción/admin registran cobros; nadie fuera de administración
--      puede modificarlos o borrarlos, y el cobro queda a nombre de quien lo registra.
--
-- `auth.uid() is null` NO significa service_role: también es nulo para `anon`.
-- Por eso se usa public.contexto_servidor() (definido en 007; se recrea aquí para
-- que la migración sea autosuficiente).
-- ============================================================

-- ------------------------------------------------------------
-- 0) Contexto de servidor (idéntico a 007; create or replace es idempotente)
-- ------------------------------------------------------------
create or replace function public.contexto_servidor() returns boolean
language sql stable security invoker set search_path = public, pg_temp as $$
  select
    coalesce(auth.role(), '') = 'service_role'
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or coalesce(
         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
         ''
       ) = 'service_role'
    or (
      coalesce(current_setting('request.method', true), '') = ''
      and coalesce(auth.role(), '') = ''
      and auth.uid() is null
    );
$$;

revoke execute on function public.contexto_servidor() from public, anon;
grant execute on function public.contexto_servidor() to authenticated, service_role;

-- ------------------------------------------------------------
-- 1) Perfiles: impedir la auto-promoción de rol
-- ------------------------------------------------------------
create or replace function public.proteger_perfil_privilegios() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rol text := coalesce(public.mi_rol(), '');
  v_recinto uuid := public.mi_recinto();
begin
  -- service_role / SQL Editor / conexiones internas
  if public.contexto_servidor() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- El superadmin puede todo
  if v_rol = 'superadmin' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- El admin solo gestiona su recinto y nunca asigna roles administrativos
  if v_rol = 'admin' then
    if tg_op = 'INSERT' then
      if new.rol in ('superadmin', 'admin') then
        raise exception 'Solo un superadmin puede crear administradores';
      end if;
      if v_recinto is not null and new.recinto_id is distinct from v_recinto then
        raise exception 'Solo puedes crear usuarios en tu recinto';
      end if;
      return new;
    end if;

    if tg_op = 'DELETE' then
      if old.rol in ('superadmin', 'admin') then
        raise exception 'Solo un superadmin puede eliminar administradores';
      end if;
      if v_recinto is not null and old.recinto_id is distinct from v_recinto then
        raise exception 'Solo puedes eliminar usuarios de tu recinto';
      end if;
      return old;
    end if;

    -- UPDATE: no tocar otros administradores
    if old.rol in ('superadmin', 'admin') and old.id is distinct from auth.uid() then
      raise exception 'Solo un superadmin puede gestionar administradores';
    end if;
    if new.rol in ('superadmin', 'admin') and new.rol is distinct from old.rol then
      raise exception 'Solo un superadmin puede asignar roles administrativos';
    end if;
    if v_recinto is not null
       and (old.recinto_id is distinct from v_recinto or new.recinto_id is distinct from v_recinto) then
      raise exception 'Solo puedes gestionar usuarios de tu recinto';
    end if;
    if old.id = auth.uid()
       and (new.id is distinct from old.id
            or new.rol is distinct from old.rol
            or new.activo is distinct from old.activo
            or new.recinto_id is distinct from old.recinto_id) then
      raise exception 'No puedes cambiar tu propio rol, estado o recinto';
    end if;
    return new;
  end if;

  -- Resto de roles (o cuenta sin perfil todavía): solo su propio perfil
  if tg_op = 'INSERT' then
    -- Única vía para que un usuario cree su propio perfil: la RPC reparar_mi_perfil()
    -- (migración 011), que marca la transacción. Un INSERT directo por PostgREST no
    -- puede activar esa bandera. El alta normal la hace handle_new_user o la Edge Function.
    if coalesce(current_setting('ae.reparando_perfil', true), 'off') = 'on'
       and new.id = auth.uid()
       and new.rol = 'cliente'
       and new.activo is true then
      return new;
    end if;
    raise exception 'No tienes permiso para crear perfiles';
  end if;

  if tg_op = 'DELETE' then
    raise exception 'No tienes permiso para eliminar perfiles';
  end if;

  -- UPDATE
  if new.id is distinct from old.id
     or new.rol is distinct from old.rol
     or new.activo is distinct from old.activo
     or new.recinto_id is distinct from old.recinto_id then
    raise exception 'No puedes cambiar tu rol, estado o recinto';
  end if;

  -- Sin privilegios de administración solo se edita el propio perfil
  if old.id is distinct from auth.uid() then
    raise exception 'Solo puedes editar tu propio perfil';
  end if;

  return new;
end $$;

drop trigger if exists proteger_perfil_privilegios on public.perfiles;
create trigger proteger_perfil_privilegios
  before insert or update or delete on public.perfiles
  for each row execute function public.proteger_perfil_privilegios();

-- ------------------------------------------------------------
-- 2) Ubicaciones: el chófer solo reporta su propia posición
-- ------------------------------------------------------------
create or replace function public.proteger_ubicacion_chofer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rol text := coalesce(public.mi_rol(), '');
begin
  if public.contexto_servidor() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- Clientes y cuentas sin perfil no escriben ubicaciones
  if v_rol not in ('chofer', 'logistica', 'admin', 'superadmin') then
    raise exception 'No tienes permiso para actualizar ubicaciones';
  end if;

  if tg_op = 'DELETE' then
    if v_rol = 'chofer' and old.chofer_id is distinct from auth.uid() then
      raise exception 'Solo puedes borrar tu propia ubicación';
    end if;
    return old;
  end if;

  -- Un chófer no puede mover el punto de otro chófer
  if v_rol = 'chofer' and new.chofer_id is distinct from auth.uid() then
    raise exception 'Solo puedes reportar tu propia ubicación';
  end if;

  return new;
end $$;

drop trigger if exists proteger_ubicacion_chofer on public.ubicaciones;
create trigger proteger_ubicacion_chofer
  before insert or update or delete on public.ubicaciones
  for each row execute function public.proteger_ubicacion_chofer();

-- ------------------------------------------------------------
-- 3) Viajes: evitar que un chófer se reasigne viajes ajenos
-- ------------------------------------------------------------
create or replace function public.proteger_viaje_chofer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rol text := coalesce(public.mi_rol(), '');
  v_recinto uuid := public.mi_recinto();
begin
  if public.contexto_servidor() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if v_rol not in ('superadmin', 'admin', 'logistica') then
      raise exception 'No tienes permiso para crear viajes';
    end if;
    -- Admin/logística solo crean viajes en su propio recinto
    if v_rol in ('admin', 'logistica')
       and v_recinto is not null
       and new.recinto_id is distinct from v_recinto then
      raise exception 'Solo puedes crear viajes en tu recinto';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if v_rol not in ('superadmin', 'admin') then
      raise exception 'No tienes permiso para eliminar viajes';
    end if;
    return old;
  end if;

  -- UPDATE
  if v_rol in ('superadmin', 'admin', 'logistica') then
    if v_rol in ('admin', 'logistica')
       and v_recinto is not null
       and (old.recinto_id is distinct from v_recinto or new.recinto_id is distinct from v_recinto) then
      raise exception 'Solo puedes gestionar viajes de tu recinto';
    end if;
    return new;
  end if;

  -- Un chófer solo actualiza el viaje que tiene asignado y no puede reasignarlo
  if v_rol = 'chofer' then
    if new.chofer_id is distinct from old.chofer_id
       or new.recinto_id is distinct from old.recinto_id
       or new.creado_por is distinct from old.creado_por then
      raise exception 'No puedes reasignar el chófer, el recinto ni el creador del viaje';
    end if;
    if old.chofer_id is distinct from auth.uid() then
      raise exception 'Solo puedes actualizar tus propios viajes';
    end if;
    return new;
  end if;

  raise exception 'No tienes permiso para modificar viajes';
end $$;

drop trigger if exists proteger_viaje_chofer on public.viajes;
create trigger proteger_viaje_chofer
  before insert or update or delete on public.viajes
  for each row execute function public.proteger_viaje_chofer();

-- ------------------------------------------------------------
-- 4) Pagos: un cliente no puede marcar su guía como pagada
--    El cobro lo registra recepción (o administración); el trigger `pago_registrado`
--    del esquema base es quien actualiza guias.pagada.
-- ------------------------------------------------------------
create or replace function public.proteger_pago() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rol text := coalesce(public.mi_rol(), '');
begin
  if public.contexto_servidor() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if v_rol in ('superadmin', 'admin', 'recepcion') then
      -- El cobro queda a nombre de quien lo registra (recepción no puede suplantar)
      if v_rol = 'recepcion' then
        new.cobrado_por := auth.uid();
      end if;
      return new;
    end if;
    raise exception 'No tienes permiso para registrar pagos';
  end if;

  if tg_op = 'DELETE' then
    if v_rol in ('superadmin', 'admin') then
      return old;
    end if;
    raise exception 'No tienes permiso para eliminar pagos';
  end if;

  -- UPDATE: solo administración (recepción corrige registrando/eliminando, no editando)
  if v_rol in ('superadmin', 'admin') then
    return new;
  end if;
  raise exception 'No tienes permiso para modificar pagos';
end $$;

drop trigger if exists proteger_pago on public.pagos;
create trigger proteger_pago
  before insert or update or delete on public.pagos
  for each row execute function public.proteger_pago();

-- ------------------------------------------------------------
-- 5) Comprobación (opcional, solo lectura)
-- ------------------------------------------------------------
-- select tgname, tgenabled from pg_trigger
--  where tgname in ('proteger_perfil_privilegios','proteger_ubicacion_chofer',
--                   'proteger_viaje_chofer','proteger_pago');
