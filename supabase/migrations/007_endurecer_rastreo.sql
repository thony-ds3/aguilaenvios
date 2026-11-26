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
