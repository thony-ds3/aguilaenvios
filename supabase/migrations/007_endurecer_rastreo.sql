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
--   4) Un trigger impide que un cliente cambie el dueño o cualquier campo de una guía
--      directamente por PostgREST; la única excepción es la RPC segura por código.
-- ============================================================

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
--    - Los clientes no pueden modificar guías directamente.
--    - La RPC anterior pone ae.vinculando_guia = 'on' solo dentro de su transacción.
--    - auth.uid() nulo = service_role / SQL Editor: se permite (tareas administrativas).
-- ------------------------------------------------------------
create or replace function public.proteger_guia_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and coalesce(public.mi_rol(), '') not in ('superadmin', 'admin', 'recepcion', 'logistica', 'chofer')
     and coalesce(current_setting('ae.vinculando_guia', true), 'off') <> 'on' then
    raise exception 'Los clientes no pueden modificar guías directamente';
  end if;
  return new;
end $$;

drop trigger if exists proteger_guia_cliente on public.guias;
create trigger proteger_guia_cliente
  before update on public.guias
  for each row execute function public.proteger_guia_cliente();

-- ------------------------------------------------------------
-- 5) Comprobación rápida (opcional, solo lectura)
-- ------------------------------------------------------------
-- select proname, proacl from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('rastrear_guia', 'rastrear_guia_codigo', 'vincular_guia', 'vincular_guia_codigo');
-- select tgname, tgenabled from pg_trigger where tgname = 'proteger_guia_cliente';
