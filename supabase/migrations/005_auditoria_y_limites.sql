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
create or replace function public.registrar_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_accion text := lower(tg_table_name) || '_' || lower(tg_op);
  v_entidad_id text;
  v_datos jsonb;
begin
  if tg_table_name = 'perfiles' then
    if tg_op = 'UPDATE'
       and old.rol is not distinct from new.rol
       and old.recinto_id is not distinct from new.recinto_id
       and old.activo is not distinct from new.activo then
      return new;  -- nada relevante cambió
    end if;
    v_entidad_id := coalesce(new.id, old.id)::text;
    v_datos := jsonb_build_object(
      'antes',  jsonb_build_object('rol', old.rol, 'recinto_id', old.recinto_id, 'activo', old.activo),
      'despues', jsonb_build_object('rol', new.rol, 'recinto_id', new.recinto_id, 'activo', new.activo)
    );
  elsif tg_table_name = 'recintos' then
    v_entidad_id := coalesce(new.id, old.id)::text;
    v_datos := jsonb_build_object(
      'antes',  case when tg_op = 'INSERT' then null else jsonb_build_object('nombre', old.nombre, 'departamento', old.departamento, 'activo', old.activo) end,
      'despues', case when tg_op = 'DELETE' then null else jsonb_build_object('nombre', new.nombre, 'departamento', new.departamento, 'activo', new.activo) end
    );
  elsif tg_table_name = 'pagos' then
    v_entidad_id := coalesce(new.guia_id, old.guia_id)::text;
    v_datos := jsonb_build_object('guia_id', coalesce(new.guia_id, old.guia_id), 'monto', new.monto, 'metodo', new.metodo);
  end if;

  insert into public.auditoria (actor_id, actor_rol, accion, entidad, entidad_id, datos)
  values (auth.uid(), public.mi_rol(), v_accion, tg_table_name, v_entidad_id, v_datos);

  return coalesce(new, old);
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
