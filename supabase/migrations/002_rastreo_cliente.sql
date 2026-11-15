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
