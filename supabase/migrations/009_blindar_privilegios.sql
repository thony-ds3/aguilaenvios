-- ============================================================
-- [BE] Águila Envíos · Migración 009: blindaje de privilegios y suplantación
-- Ejecutar DESPUÉS de 008_reparar_perfiles.sql. Es idempotente.
--
-- El esquema real no muestra las políticas RLS. Si la política de UPDATE de
-- `perfiles` permite `id = auth.uid()` sin restringir columnas, un cliente podría
-- ejecutar `update perfiles set rol = 'superadmin'` y escalar privilegios.
-- Estos triggers cierran esa vía aunque la política sea demasiado amplia:
--
--   1) perfiles: solo admin/superadmin (o service_role) cambian rol, activo,
--      recinto_id o id. El resto puede seguir editando nombres/apellidos/teléfono.
--   2) ubicaciones: un chófer solo puede escribir su propia posición; los clientes
--      no pueden escribir ubicaciones.
--   3) viajes: un chófer no puede reasignar el chófer, el recinto ni el creador de
--      un viaje, y solo actualiza viajes que tiene asignados.
--
-- `auth.uid()` nulo = service_role / SQL Editor: se permite (altas, migraciones).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Perfiles: impedir la auto-promoción de rol
-- ------------------------------------------------------------
create or replace function public.proteger_perfil_privilegios() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rol text := coalesce(public.mi_rol(), '');
begin
  -- service_role / SQL Editor: sin JWT de usuario
  if auth.uid() is null then
    return new;
  end if;

  -- El personal autorizado sí puede cambiar rol, estado y recinto
  if v_rol in ('superadmin', 'admin') then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.rol is distinct from old.rol
     or new.activo is distinct from old.activo
     or new.recinto_id is distinct from old.recinto_id then
    raise exception 'No puedes cambiar tu rol, estado o recinto';
  end if;

  return new;
end $$;

drop trigger if exists proteger_perfil_privilegios on public.perfiles;
create trigger proteger_perfil_privilegios
  before update on public.perfiles
  for each row execute function public.proteger_perfil_privilegios();

-- ------------------------------------------------------------
-- 2) Ubicaciones: el chófer solo reporta su propia posición
-- ------------------------------------------------------------
create or replace function public.proteger_ubicacion_chofer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rol text := coalesce(public.mi_rol(), '');
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Clientes y cuentas sin perfil no escriben ubicaciones
  if v_rol not in ('chofer', 'logistica', 'admin', 'superadmin') then
    raise exception 'No tienes permiso para actualizar ubicaciones';
  end if;

  -- Un chófer no puede mover el punto de otro chófer
  if v_rol = 'chofer' and new.chofer_id <> auth.uid() then
    raise exception 'Solo puedes reportar tu propia ubicación';
  end if;

  return new;
end $$;

drop trigger if exists proteger_ubicacion_chofer on public.ubicaciones;
create trigger proteger_ubicacion_chofer
  before insert or update on public.ubicaciones
  for each row execute function public.proteger_ubicacion_chofer();

-- ------------------------------------------------------------
-- 3) Viajes: evitar que un chófer se reasigne viajes ajenos
-- ------------------------------------------------------------
create or replace function public.proteger_viaje_chofer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rol text := coalesce(public.mi_rol(), '');
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Administración y logística gestionan la asignación de viajes
  if v_rol in ('superadmin', 'admin', 'logistica') then
    return new;
  end if;

  if new.chofer_id is distinct from old.chofer_id
     or new.recinto_id is distinct from old.recinto_id
     or new.creado_por is distinct from old.creado_por then
    raise exception 'No puedes reasignar el chófer, el recinto ni el creador del viaje';
  end if;

  -- Un chófer solo actualiza el viaje que tiene asignado
  if v_rol = 'chofer' and old.chofer_id is distinct from auth.uid() then
    raise exception 'Solo puedes actualizar tus propios viajes';
  end if;

  return new;
end $$;

drop trigger if exists proteger_viaje_chofer on public.viajes;
create trigger proteger_viaje_chofer
  before update on public.viajes
  for each row execute function public.proteger_viaje_chofer();

-- ------------------------------------------------------------
-- 4) Comprobación (opcional, solo lectura)
-- ------------------------------------------------------------
-- select tgname, tgenabled from pg_trigger
--  where tgname in ('proteger_perfil_privilegios','proteger_ubicacion_chofer','proteger_viaje_chofer');
