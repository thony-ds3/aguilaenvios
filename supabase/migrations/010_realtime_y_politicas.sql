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
