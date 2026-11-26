-- ============================================================
-- [BE] Águila Envíos · APLICAR TODO (generado automáticamente)
-- Generado por scripts/generar-sql-todo.mjs con 10 migraciones.
-- NO EDITAR A MANO: modifica las migraciones y vuelve a ejecutar npm run sql:todo.
--
-- Requisito: el esquema base aguila_envios_supabase_v2.sql ya debe estar aplicado.
-- Ejecutar completo en Supabase > SQL Editor. Todo va en una transacción: si una
-- sentencia falla, no se aplica nada (revisa el error, corrige y vuelve a ejecutar).
--
-- Antes de ejecutar en producción, haz un respaldo (Database > Backups) y prueba
-- primero en un proyecto de ensayo.
-- ============================================================

begin;

-- ============================================================
-- 002_rastreo_cliente.sql
-- ============================================================
-- ============================================================
-- [BE] Águila Envíos · Migración 002: rastreo del cliente
-- Ejecutar DESPUÉS de aguila_envios_supabase_v2.sql (Supabase > SQL Editor).
-- No cambia tablas, columnas ni políticas RLS. Solo agrega la función rastrear_guia.
--
-- Motivo: el cliente no puede leer `viajes` (RLS), así que no sabría qué chófer
-- lleva su guía. Esta función devuelve el chófer SOLO mientras la guía y su viaje
-- están en ruta; la posición sigue saliendo de `ubicaciones` por RLS.
-- ============================================================

drop function if exists public.rastrear_guia(text, date);

create function public.rastrear_guia(p_numero text, p_fecha date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g guias;
  v_chofer uuid;
  v_nombre text;
begin
  if mi_rol() is distinct from 'cliente' then
    raise exception 'Solo clientes pueden rastrear guías';
  end if;

  select * into g from guias
  where numero = upper(btrim(p_numero)) and fecha_recepcion = p_fecha;

  if not found or (g.cliente_id is not null and g.cliente_id <> auth.uid()) then
    raise exception 'Guía no encontrada para esa fecha';
  end if;

  -- Primera búsqueda: la guía queda vinculada a la cuenta (igual que vincular_guia)
  if g.cliente_id is null then
    update guias set cliente_id = auth.uid() where id = g.id;
  end if;

  -- El chófer solo se expone mientras la guía y su viaje están en ruta
  select v.chofer_id, p.nombres || coalesce(' ' || p.apellidos, '')
    into v_chofer, v_nombre
  from viajes v
  left join perfiles p on p.id = v.chofer_id
  where v.id = g.viaje_id and v.estado = 'en_ruta' and g.estado = 'en_ruta';

  return jsonb_build_object(
    'id', g.id,
    'numero', g.numero,
    'estado', g.estado,
    'destinatario', g.destinatario,
    'direccion_entrega', g.direccion_entrega,
    'fecha_recepcion', g.fecha_recepcion,
    'entregada_at', g.entregada_at,
    'chofer_id', v_chofer,
    'chofer_nombre', v_nombre
  );
end $$;

revoke execute on function public.rastrear_guia(text, date) from public, anon;
grant execute on function public.rastrear_guia(text, date) to authenticated;

-- ============================================================
-- 003_reordenar_paradas.sql
-- ============================================================
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

-- ============================================================
-- 004_cuentas_inactivas.sql
-- ============================================================
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

-- ============================================================
-- 005_auditoria_y_limites.sql
-- ============================================================
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

-- ============================================================
-- 006_codigo_rastreo.sql
-- ============================================================
-- ============================================================
-- [BE] Águila Envíos · Migración 006: código aleatorio de rastreo
-- Ejecutar DESPUÉS de aguila_envios_supabase_v2.sql (Supabase > SQL Editor).
-- Es aditiva: agrega una columna, un índice único y una función nueva.
--
-- Motivación (auditoría 16): rastrear_guia permite enumerar números AE-000000
-- y vincula automáticamente la guía a la cuenta que la consulta. Eso permite
-- "robar" guías ajenas. El código de 12 caracteres hexadecimales (48 bits) no
-- es enumerable y rastrear_guia_codigo NO vincula la guía al consultarla.
-- Se mantiene rastrear_guia por compatibilidad; la app debe preferir el código.
-- ============================================================

alter table public.guias
  add column if not exists codigo_rastreo text;

-- Rellena las guías existentes con un código aleatorio
update public.guias
set codigo_rastreo = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
where codigo_rastreo is null;

alter table public.guias
  alter column codigo_rastreo set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

alter table public.guias
  alter column codigo_rastreo set not null;

create unique index if not exists guias_codigo_rastreo_key
  on public.guias (codigo_rastreo);

alter table public.guias
  drop constraint if exists guias_codigo_rastreo_formato;
alter table public.guias
  add constraint guias_codigo_rastreo_formato
  check (codigo_rastreo ~ '^[A-F0-9]{12}$');

-- Rastreo por código: devuelve el mismo resumen que rastrear_guia, sin vincular la guía.
drop function if exists public.rastrear_guia_codigo(text);

create function public.rastrear_guia_codigo(p_codigo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g guias;
  v_chofer uuid;
  v_nombre text;
begin
  if mi_rol() is distinct from 'cliente' then
    raise exception 'Solo clientes pueden rastrear guías';
  end if;

  select * into g from guias where codigo_rastreo = upper(btrim(p_codigo));

  -- Mismo mensaje para "no existe" y "es de otra cuenta": no se filtra nada.
  if not found or (g.cliente_id is not null and g.cliente_id <> auth.uid()) then
    raise exception 'Código de rastreo no encontrado';
  end if;

  -- A diferencia de rastrear_guia, aquí NO se actualiza cliente_id.

  select v.chofer_id, p.nombres || coalesce(' ' || p.apellidos, '')
    into v_chofer, v_nombre
  from viajes v
  left join perfiles p on p.id = v.chofer_id
  where v.id = g.viaje_id and v.estado = 'en_ruta' and g.estado = 'en_ruta';

  return jsonb_build_object(
    'id', g.id,
    'numero', g.numero,
    'codigo_rastreo', g.codigo_rastreo,
    'estado', g.estado,
    'destinatario', g.destinatario,
    'direccion_entrega', g.direccion_entrega,
    'fecha_recepcion', g.fecha_recepcion,
    'entregada_at', g.entregada_at,
    'chofer_id', v_chofer,
    'chofer_nombre', v_nombre
  );
end $$;

revoke execute on function public.rastrear_guia_codigo(text) from public, anon;
grant execute on function public.rastrear_guia_codigo(text) to authenticated;

-- Vínculo seguro: el cliente agrega una guía a "Mis envíos" con el código secreto,
-- no con el número correlativo. Evita que alguien reclame guías ajenas adivinando AE-000000.
drop function if exists public.vincular_guia_codigo(text);

create function public.vincular_guia_codigo(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if mi_rol() is distinct from 'cliente' then
    raise exception 'Solo clientes pueden vincular guías';
  end if;

  -- Bandera de transacción que autoriza el cambio de dueño en el trigger de guias (migración 007)
  perform set_config('ae.vinculando_guia', 'on', true);

  update guias
  set cliente_id = auth.uid()
  where codigo_rastreo = upper(btrim(p_codigo))
    and (cliente_id is null or cliente_id = auth.uid());
  get diagnostics n = row_count;

  perform set_config('ae.vinculando_guia', 'off', true);

  if n = 0 then
    raise exception 'Código no encontrado o ya vinculado a otra cuenta';
  end if;
end $$;

revoke execute on function public.vincular_guia_codigo(text) from public, anon;
grant execute on function public.vincular_guia_codigo(text) to authenticated;

-- ============================================================
-- 007_endurecer_rastreo.sql
-- ============================================================
-- ============================================================
-- [BE] Águila Envíos · Migración 007: cierre del secuestro de guías
-- Ejecutar DESPUÉS de 006_codigo_rastreo.sql.
--
-- Cierra el hallazgo crítico del análisis senior:
--   1) `rastrear_guia` ya NO vincula la guía a quien la consulta.
--   2) Si la guía no pertenece al cliente, `rastrear_guia` solo devuelve el estado:
--      nunca destinatario, dirección ni chófer (evita enumerar PII con AE-000000 + fecha).
--   3) `vincular_guia` (solo número correlativo) queda revocada: el vínculo seguro es
--      `vincular_guia_codigo` (código aleatorio de 12 caracteres).
--   4) Un trigger impide que un cliente cree, modifique o borre guías directamente por
--      PostgREST; la única excepción es la RPC segura por código.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Contexto de servidor (lo usan 007, 009 y los triggers de 010)
--
-- No sirve `auth.uid() is null`: también es nulo para `anon`. Hay que distinguir:
--   - API con clave secreta (service_role): Edge Functions y tareas administrativas.
--   - SQL Editor / psql / migraciones: no hay solicitud PostgREST.
--   - `anon`: sí hay solicitud PostgREST, pero sin usuario. Nunca cuenta como servidor.
--
-- Es SECURITY INVOKER a propósito: solo lee los GUC que PostgREST deja en la sesión,
-- así que funciona igual dentro de funciones SECURITY DEFINER (que es donde se usa).
-- ------------------------------------------------------------
create or replace function public.contexto_servidor() returns boolean
language sql stable security invoker set search_path = public, pg_temp as $$
  select
    -- Clave secreta de la API (Edge Functions, scripts con service_role)
    coalesce(auth.role(), '') = 'service_role'
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or coalesce(
         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
         ''
       ) = 'service_role'
    -- SQL Editor, psql, migraciones y el trigger de auth.users (GoTrue no usa PostgREST)
    or (
      coalesce(current_setting('request.method', true), '') = ''
      and coalesce(auth.role(), '') = ''
      and auth.uid() is null
    );
$$;

comment on function public.contexto_servidor() is
  'true solo para service_role, SQL Editor/psql o conexiones internas. anon y authenticated devuelven false.';

revoke execute on function public.contexto_servidor() from public, anon;
grant execute on function public.contexto_servidor() to authenticated, service_role;

-- ------------------------------------------------------------
-- 1) Rastreo por número + fecha: sin auto-vínculo y sin PII ajena
-- ------------------------------------------------------------
create or replace function public.rastrear_guia(p_numero text, p_fecha date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g guias;
  v_chofer uuid;
  v_nombre text;
  v_propia boolean;
begin
  if mi_rol() is distinct from 'cliente' then
    raise exception 'Solo clientes pueden rastrear guías';
  end if;

  select * into g from guias
  where numero = upper(btrim(p_numero)) and fecha_recepcion = p_fecha;

  -- Guía inexistente o ya vinculada a otra cuenta: mismo mensaje, sin filtrar información
  if not found or (g.cliente_id is not null and g.cliente_id <> auth.uid()) then
    raise exception 'Guía no encontrada para esa fecha';
  end if;

  -- Solo el dueño ve el detalle completo. Una guía sin dueño devuelve únicamente el estado.
  v_propia := coalesce(g.cliente_id = auth.uid(), false);

  if v_propia then
    select v.chofer_id, p.nombres || coalesce(' ' || p.apellidos, '')
      into v_chofer, v_nombre
    from viajes v
    left join perfiles p on p.id = v.chofer_id
    where v.id = g.viaje_id and v.estado = 'en_ruta' and g.estado = 'en_ruta';
  end if;

  return jsonb_build_object(
    'id',                case when v_propia then g.id else null end,
    'numero',            g.numero,
    'estado',            g.estado,
    'destinatario',      case when v_propia then g.destinatario else null end,
    'direccion_entrega', case when v_propia then g.direccion_entrega else null end,
    'fecha_recepcion',   g.fecha_recepcion,
    'entregada_at',      g.entregada_at,
    'chofer_id',         v_chofer,
    'chofer_nombre',     v_nombre
  );
end $$;

revoke execute on function public.rastrear_guia(text, date) from public, anon;
grant execute on function public.rastrear_guia(text, date) to authenticated;

-- ------------------------------------------------------------
-- 2) Retirar el vínculo por número correlativo (todas sus sobrecargas)
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select
      p.proname as nombre,
      pg_get_function_identity_arguments(p.oid) as argumentos
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'vincular_guia'
  loop
    execute format(
      'revoke execute on function public.%I(%s) from public, anon, authenticated',
      r.nombre, r.argumentos
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3) Vínculo seguro por código: autoriza el cambio con una bandera de transacción
-- ------------------------------------------------------------
create or replace function public.vincular_guia_codigo(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if mi_rol() is distinct from 'cliente' then
    raise exception 'Solo clientes pueden vincular guías';
  end if;

  perform set_config('ae.vinculando_guia', 'on', true);

  update guias
  set cliente_id = auth.uid()
  where codigo_rastreo = upper(btrim(p_codigo))
    and (cliente_id is null or cliente_id = auth.uid());
  get diagnostics n = row_count;

  perform set_config('ae.vinculando_guia', 'off', true);

  if n = 0 then
    raise exception 'Código no encontrado o ya vinculado a otra cuenta';
  end if;
end $$;

revoke execute on function public.vincular_guia_codigo(text) from public, anon;
grant execute on function public.vincular_guia_codigo(text) to authenticated;

-- ------------------------------------------------------------
-- 4) Trigger anti-suplantación
--    - Los clientes no pueden crear, modificar ni borrar guías directamente.
--    - La RPC anterior pone ae.vinculando_guia = 'on' solo dentro de su transacción,
--      y únicamente se acepta si el único campo que cambió es cliente_id = auth.uid().
--    - El personal conserva sus permisos; RLS sigue limitando las filas que ve/edita.
--    - contexto_servidor() cubre service_role y el SQL Editor.
-- ------------------------------------------------------------
create or replace function public.proteger_guia_cliente() returns trigger
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
    if v_rol in ('superadmin', 'admin', 'recepcion', 'logistica') then
      return new;
    end if;
    raise exception 'No tienes permiso para crear guías';
  end if;

  if tg_op = 'DELETE' then
    if v_rol in ('superadmin', 'admin') then
      return old;
    end if;
    raise exception 'No tienes permiso para eliminar guías';
  end if;

  -- UPDATE: única vía permitida a un cliente (vincular_guia_codigo).
  -- Se exige que cliente_id pase a ser el propio usuario y que NINGÚN campo
  -- sensible cambie; así una RPC futura no puede reutilizar la bandera para
  -- alterar el dueño, el precio, el estado, la dirección ni el viaje.
  if coalesce(current_setting('ae.vinculando_guia', true), 'off') = 'on'
     and new.cliente_id is not distinct from auth.uid()
     and new.id is not distinct from old.id
     and new.numero is not distinct from old.numero
     and new.recinto_id is not distinct from old.recinto_id
     and new.remitente is not distinct from old.remitente
     and new.destinatario is not distinct from old.destinatario
     and new.telefono_destinatario is not distinct from old.telefono_destinatario
     and new.direccion_entrega is not distinct from old.direccion_entrega
     and new.lat is not distinct from old.lat
     and new.lng is not distinct from old.lng
     and new.cantidad_paquetes is not distinct from old.cantidad_paquetes
     and new.peso_kg is not distinct from old.peso_kg
     and new.costo is not distinct from old.costo
     and new.pagada is not distinct from old.pagada
     and new.estado is not distinct from old.estado
     and new.fecha_recepcion is not distinct from old.fecha_recepcion
     and new.viaje_id is not distinct from old.viaje_id
     and new.orden_parada is not distinct from old.orden_parada
     and new.entregada_at is not distinct from old.entregada_at
     and new.codigo_rastreo is not distinct from old.codigo_rastreo
     and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  if v_rol in ('superadmin', 'admin', 'recepcion', 'logistica', 'chofer') then
    return new;
  end if;

  raise exception 'No tienes permiso para modificar guías';
end $$;

drop trigger if exists proteger_guia_cliente on public.guias;
create trigger proteger_guia_cliente
  before insert or update or delete on public.guias
  for each row execute function public.proteger_guia_cliente();

-- ------------------------------------------------------------
-- 5) Comprobación rápida (opcional, solo lectura)
-- ------------------------------------------------------------
-- select proname, proacl from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('rastrear_guia', 'rastrear_guia_codigo', 'vincular_guia', 'vincular_guia_codigo');
-- select tgname, tgenabled from pg_trigger where tgname = 'proteger_guia_cliente';

-- ============================================================
-- 008_reparar_perfiles.sql
-- ============================================================
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

-- ============================================================
-- 009_blindar_privilegios.sql
-- ============================================================
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

-- ============================================================
-- 010_realtime_y_politicas.sql
-- ============================================================
-- ============================================================
-- [BE] Águila Envíos · Migración 010: Realtime y políticas de lectura
-- Ejecutar DESPUÉS de 009_blindar_privilegios.sql. Es idempotente.
--
-- La app necesita tres cosas que el esquema base no garantiza:
--   1) `guias`, `viajes` y `ubicaciones` publicadas en supabase_realtime, con
--      replica identity full para que los UPDATE/DELETE lleguen con datos.
--   2) Políticas RLS aditivas y estrechas para que el cliente vea SOLO su guía,
--      el viaje de su guía y la ubicación del chófer SOLO mientras está en ruta;
--      y el chófer vea SOLO su viaje y sus guías.
--   3) Vistas con security_invoker = true. Si `resumen_cliente` o `paradas_chofer`
--      se crearon como vistas normales, por defecto se ejecutan con los permisos
--      del dueño (postgres) y saltan RLS: cualquier cliente vería filas ajenas.
--
-- No se elimina ninguna política existente: las nuevas se llaman ae_* y solo
-- amplían lo necesario. Si el diagnóstico muestra políticas demasiado abiertas,
-- se corrigen aparte con su definición real a la vista.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Helpers SECURITY DEFINER para las políticas
--    Evitan la recursión de RLS al consultar guias/viajes/perfiles desde una
--    política de otra tabla. Solo devuelven booleanos, nunca filas.
-- ------------------------------------------------------------

-- ¿El viaje está asignado al chófer autenticado?
create or replace function public.mi_viaje_chofer(p_viaje uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from viajes v
    where v.id = p_viaje and v.chofer_id = auth.uid()
  );
$$;

-- ¿El cliente autenticado tiene alguna guía en este viaje? (solo para ver el viaje,
-- nunca para leer las guías de otros clientes del mismo viaje)
create or replace function public.cliente_en_viaje(p_viaje uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from guias g
    where g.viaje_id = p_viaje and g.cliente_id = auth.uid()
  );
$$;

-- ¿Puede el usuario autenticado ver la ubicación de este chófer?
create or replace function public.puede_ver_ubicacion(p_chofer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    -- El propio chófer
    p_chofer = auth.uid()
    -- Cliente: solo mientras SU guía y el viaje están en ruta
    or exists (
      select 1
      from guias g
      join viajes v on v.id = g.viaje_id
      where g.cliente_id = auth.uid()
        and v.chofer_id = p_chofer
        and g.estado = 'en_ruta'
        and v.estado = 'en_ruta'
    )
    -- Administración: superadmin todo; admin/logística solo su recinto
    or (
      public.mi_rol() = 'superadmin'
    )
    or (
      public.mi_rol() in ('admin', 'logistica')
      and exists (
        select 1 from perfiles p
        where p.id = p_chofer
          and p.recinto_id is not distinct from public.mi_recinto()
      )
    );
$$;

revoke execute on function public.mi_viaje_chofer(uuid) from public, anon;
revoke execute on function public.cliente_en_viaje(uuid) from public, anon;
revoke execute on function public.puede_ver_ubicacion(uuid) from public, anon;
grant execute on function public.mi_viaje_chofer(uuid) to authenticated;
grant execute on function public.cliente_en_viaje(uuid) to authenticated;
grant execute on function public.puede_ver_ubicacion(uuid) to authenticated;

-- ------------------------------------------------------------
-- 1) Realtime
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['guias', 'viajes', 'ubicaciones'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- UPDATE/DELETE completos para que Realtime pueda aplicar el filtro del cliente
alter table public.guias replica identity full;
alter table public.viajes replica identity full;
alter table public.ubicaciones replica identity full;

-- El GPS hace upsert con onConflict: 'chofer_id'. Si la tabla no trae una clave
-- única para esa columna, PostgREST devuelve 42P10 y el mapa nunca se actualiza.
-- Se conserva la fila más reciente de cada chófer antes de crear el índice.
do $$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_attribute a
      on a.attrelid = i.indrelid
     and a.attnum = i.indkey[0]
    where i.indrelid = 'public.ubicaciones'::regclass
      and i.indisunique
      and i.indnkeyatts = 1
      and a.attname = 'chofer_id'
  ) then
    delete from public.ubicaciones a
    using public.ubicaciones b
    where a.chofer_id = b.chofer_id
      and (
        a.actualizado < b.actualizado
        or (a.actualizado = b.actualizado and a.ctid < b.ctid)
      );
    create unique index if not exists ubicaciones_chofer_id_key
      on public.ubicaciones (chofer_id);
  end if;
end $$;

-- ------------------------------------------------------------
-- 2) Políticas de lectura del cliente
-- ------------------------------------------------------------
drop policy if exists ae_guias_cliente_select on public.guias;
create policy ae_guias_cliente_select on public.guias
  for select to authenticated
  using (cliente_id = auth.uid());

drop policy if exists ae_viajes_cliente_select on public.viajes;
create policy ae_viajes_cliente_select on public.viajes
  for select to authenticated
  using (public.cliente_en_viaje(id));

drop policy if exists ae_ubicaciones_cliente_select on public.ubicaciones;
create policy ae_ubicaciones_cliente_select on public.ubicaciones
  for select to authenticated
  using (public.puede_ver_ubicacion(chofer_id));

-- ------------------------------------------------------------
-- 3) Políticas del chófer
-- ------------------------------------------------------------
drop policy if exists ae_guias_chofer_select on public.guias;
create policy ae_guias_chofer_select on public.guias
  for select to authenticated
  using (viaje_id is not null and public.mi_viaje_chofer(viaje_id));

drop policy if exists ae_viajes_chofer_select on public.viajes;
create policy ae_viajes_chofer_select on public.viajes
  for select to authenticated
  using (chofer_id = auth.uid());

drop policy if exists ae_ubicaciones_chofer_escritura on public.ubicaciones;
create policy ae_ubicaciones_chofer_escritura on public.ubicaciones
  for insert to authenticated
  with check (chofer_id = auth.uid() and public.mi_rol() = 'chofer');

drop policy if exists ae_ubicaciones_chofer_actualizar on public.ubicaciones;
create policy ae_ubicaciones_chofer_actualizar on public.ubicaciones
  for update to authenticated
  using (chofer_id = auth.uid())
  with check (chofer_id = auth.uid());

-- ------------------------------------------------------------
-- 4) Vistas: aplicar la RLS de quien consulta
-- ------------------------------------------------------------
do $$
declare
  v text;
begin
  foreach v in array array['resumen_cliente', 'paradas_chofer'] loop
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v
        and c.relkind = 'v'
    ) then
      execute format('alter view public.%I set (security_invoker = true)', v);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5) Comprobación (opcional, solo lectura)
-- ------------------------------------------------------------
-- select tablename from pg_publication_tables
--  where pubname = 'supabase_realtime' and schemaname = 'public';
-- select relname, relreplident from pg_class
--  where relname in ('guias','viajes','ubicaciones');
-- select relname, reloptions from pg_class
--  where relname in ('resumen_cliente','paradas_chofer');

-- ============================================================
-- 011_perfil_automatico.sql
-- ============================================================
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

commit;

-- ============================================================
-- Verificación final (debe devolver todo en true)
-- ============================================================
select
  to_regclass('public.auditoria') is not null            as auditoria,
  to_regclass('public.limites_acciones') is not null     as limites_acciones,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'guias' and column_name = 'codigo_rastreo'
  )                                                       as codigo_rastreo,
  to_regprocedure('public.rastrear_guia(text,date)') is not null       as rastrear_guia,
  to_regprocedure('public.rastrear_guia_codigo(text)') is not null     as rastrear_guia_codigo,
  to_regprocedure('public.vincular_guia_codigo(text)') is not null     as vincular_guia_codigo,
  to_regprocedure('public.reordenar_paradas(uuid,uuid[])') is not null as reordenar_paradas,
  to_regprocedure('public.reparar_mi_perfil()') is not null            as reparar_mi_perfil;
