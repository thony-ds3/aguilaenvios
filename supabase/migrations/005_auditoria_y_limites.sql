-- ============================================================
-- [BE] Águila Envíos · Migración 005: auditoría y límites de acciones
-- Ejecutar DESPUÉS de aguila_envios_supabase_v2.sql (Supabase > SQL Editor).
-- Es aditiva: no modifica tablas ni políticas existentes.
--
-- 1) `auditoria`: bitácora de cambios administrativos. La escriben triggers
--    (security definer); desde el cliente solo el superadmin puede leerla.
-- 2) `limites_acciones`: conteo de acciones sensibles por cuenta, usado por la
--    Edge Function crear-usuario para limitar altas por hora.
--
-- Nota: la Edge Function funciona aunque esta migración no esté aplicada
-- (detecta la tabla ausente y omite el límite y la bitácora).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Bitácora
-- ------------------------------------------------------------
create table if not exists public.auditoria (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  actor_rol  text,
  accion     text not null,
  entidad    text not null,
  entidad_id text,
  datos      jsonb,
  creado_en  timestamptz not null default now()
);

create index if not exists auditoria_creado_en_idx on public.auditoria (creado_en desc);
create index if not exists auditoria_entidad_idx on public.auditoria (entidad, entidad_id);

alter table public.auditoria enable row level security;

drop policy if exists "auditoria_lectura_superadmin" on public.auditoria;
create policy "auditoria_lectura_superadmin"
  on public.auditoria
  for select
  to authenticated
  using (public.mi_rol() = 'superadmin');

-- Solo lectura para la app; la inserción la hacen los triggers y la Edge Function
-- con la clave de servicio (que no pasa por RLS).
revoke all on public.auditoria from anon, authenticated;
grant select on public.auditoria to authenticated;

-- Función común de los triggers. Guarda solo los campos relevantes (no PII completa).
-- IMPORTANTE: en INSERT no existe OLD y en DELETE no existe NEW. Acceder al registro
-- que no existe lanza "record is not assigned yet" y haría fallar el INSERT del perfil
-- (es decir, rompería todos los registros). Por eso cada operación se trata aparte.
create or replace function public.registrar_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_accion text := lower(tg_table_name) || '_' || lower(tg_op);
  v_entidad_id text;
  v_datos jsonb;
  v_antes jsonb;
  v_despues jsonb;
begin
  if tg_table_name = 'perfiles' then
    -- El IF del UPDATE va anidado: en INSERT no existe OLD y no se debe evaluar
    -- old.rol (PostgreSQL no garantiza el cortocircuito de AND).
    if tg_op = 'UPDATE' then
      if old.rol is not distinct from new.rol
         and old.recinto_id is not distinct from new.recinto_id
         and old.activo is not distinct from new.activo then
        return new;  -- nada relevante cambió
      end if;
    end if;

    if tg_op in ('UPDATE', 'DELETE') then
      v_antes := jsonb_build_object('rol', old.rol, 'recinto_id', old.recinto_id, 'activo', old.activo);
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      v_despues := jsonb_build_object('rol', new.rol, 'recinto_id', new.recinto_id, 'activo', new.activo);
    end if;
    v_datos := jsonb_build_object('antes', v_antes, 'despues', v_despues);
    v_entidad_id := case when tg_op = 'DELETE' then old.id::text else new.id::text end;
  elsif tg_table_name = 'recintos' then
    if tg_op in ('UPDATE', 'DELETE') then
      v_antes := jsonb_build_object('nombre', old.nombre, 'departamento', old.departamento, 'activo', old.activo);
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      v_despues := jsonb_build_object('nombre', new.nombre, 'departamento', new.departamento, 'activo', new.activo);
    end if;
    v_datos := jsonb_build_object('antes', v_antes, 'despues', v_despues);
    v_entidad_id := case when tg_op = 'DELETE' then old.id::text else new.id::text end;
  elsif tg_table_name = 'pagos' then
    if tg_op in ('UPDATE', 'DELETE') then
      v_antes := jsonb_build_object('guia_id', old.guia_id, 'monto', old.monto, 'metodo', old.metodo);
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      v_despues := jsonb_build_object('guia_id', new.guia_id, 'monto', new.monto, 'metodo', new.metodo);
    end if;
    v_datos := jsonb_build_object('antes', v_antes, 'despues', v_despues);
    v_entidad_id := case when tg_op = 'DELETE' then old.guia_id::text else new.guia_id::text end;
  end if;

  insert into public.auditoria (actor_id, actor_rol, accion, entidad, entidad_id, datos)
  values (auth.uid(), public.mi_rol(), v_accion, tg_table_name, v_entidad_id, v_datos);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists auditoria_perfiles on public.perfiles;
create trigger auditoria_perfiles
  after insert or update or delete on public.perfiles
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditoria_recintos on public.recintos;
create trigger auditoria_recintos
  after insert or update or delete on public.recintos
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditoria_pagos on public.pagos;
create trigger auditoria_pagos
  after insert or update or delete on public.pagos
  for each row execute function public.registrar_auditoria();

-- ------------------------------------------------------------
-- 2) Límite de acciones por cuenta
-- ------------------------------------------------------------
create table if not exists public.limites_acciones (
  id        bigint generated always as identity primary key,
  actor_id  uuid not null,
  accion    text not null,
  creado_en timestamptz not null default now()
);

create index if not exists limites_acciones_busqueda_idx
  on public.limites_acciones (actor_id, accion, creado_en desc);

alter table public.limites_acciones enable row level security;

-- Sin políticas: ningún rol del cliente puede leer ni escribir.
-- La Edge Function usa la clave de servicio, que omite RLS.
revoke all on public.limites_acciones from anon, authenticated;
