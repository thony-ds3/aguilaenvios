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
