-- ============================================================
-- [BE] Águila Envíos · Diagnóstico de RLS y funciones (SOLO LECTURA)
-- Ejecutar en Supabase > SQL Editor. No cambia nada: sirve para verificar
-- el estado real del proyecto después de aplicar las migraciones 005–008.
-- ============================================================

-- 1) ¿RLS activo en cada tabla?
select
  c.relname as tabla,
  c.relrowsecurity as rls_activo,
  c.relforcerowsecurity as rls_forzado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('recintos','perfiles','viajes','guias','historial','pagos','ubicaciones','auditoria','limites_acciones')
order by c.relname;

-- 2) Políticas existentes (una fila por política y comando)
select
  tablename as tabla,
  policyname as politica,
  permissive,
  roles,
  cmd as comando,
  qual as usando,
  with_check as con_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3) Funciones SECURITY DEFINER y sus permisos (revisar que no estén en PUBLIC/anon)
select
  p.proname as funcion,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  p.prosecdef as security_definer,
  p.proacl as permisos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname;

-- 4) Permisos de las RPC de rastreo y vínculo
select
  routine_name as funcion,
  grantee as rol,
  privilege_type as privilegio
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('rastrear_guia','rastrear_guia_codigo','vincular_guia','vincular_guia_codigo')
order by routine_name, grantee;

-- 5) Perfiles huérfanos (auth.users sin fila en perfiles)
select u.id, u.email, u.created_at
from auth.users u
left join public.perfiles p on p.id = u.id
where p.id is null
order by u.created_at desc;

-- 6) Guías sin código de rastreo (debe ser 0 después de la migración 006)
select count(*) as guias_sin_codigo
from public.guias
where codigo_rastreo is null;

-- 7) Triggers relevantes
select
  c.relname as tabla,
  t.tgname as trigger,
  p.proname as funcion,
  t.tgenabled as habilitado
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and not t.tgisinternal
order by c.relname, t.tgname;

-- 8) Objetos auxiliares que usa la aplicación pero no aparecen en el esquema de tablas.
--    Cada fila debe mostrar existe = true. Si falta algo, aplica/restaura la parte indicada.
with objetos(nombre, existe, origen) as (
  values
    ('vista resumen_cliente', to_regclass('public.resumen_cliente') is not null, 'Esquema principal aguila_envios_supabase_v2.sql'),
    ('vista paradas_chofer', to_regclass('public.paradas_chofer') is not null, 'Esquema principal aguila_envios_supabase_v2.sql'),
    ('columna guias.codigo_rastreo', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'guias' and column_name = 'codigo_rastreo'), 'Migración 006_codigo_rastreo.sql'),
    ('RPC mi_rol()', to_regprocedure('public.mi_rol()') is not null, 'Esquema principal'),
    ('RPC mi_recinto()', to_regprocedure('public.mi_recinto()') is not null, 'Esquema principal'),
    ('RPC guias_disponibles(uuid)', to_regprocedure('public.guias_disponibles(uuid)') is not null, 'Esquema principal'),
    ('RPC agregar_guias_a_viaje(uuid, uuid[])', to_regprocedure('public.agregar_guias_a_viaje(uuid,uuid[])') is not null, 'Esquema principal'),
    ('RPC asignar_chofer(uuid, uuid)', to_regprocedure('public.asignar_chofer(uuid,uuid)') is not null, 'Esquema principal'),
    ('RPC marcar_en_ruta(uuid)', to_regprocedure('public.marcar_en_ruta(uuid)') is not null, 'Esquema principal'),
    ('RPC confirmar_entrega(uuid)', to_regprocedure('public.confirmar_entrega(uuid)') is not null, 'Esquema principal'),
    ('RPC reordenar_paradas(uuid, uuid[])', to_regprocedure('public.reordenar_paradas(uuid,uuid[])') is not null, 'Migración 003_reordenar_paradas.sql'),
    ('RPC rastrear_guia(text, date)', to_regprocedure('public.rastrear_guia(text,date)') is not null, 'Migraciones 002 y 007'),
    ('RPC rastrear_guia_codigo(text)', to_regprocedure('public.rastrear_guia_codigo(text)') is not null, 'Migraciones 006 y 007'),
    ('RPC vincular_guia_codigo(text)', to_regprocedure('public.vincular_guia_codigo(text)') is not null, 'Migraciones 006 y 007')
)
select nombre, existe, origen from objetos order by nombre;

-- 9) RLS de pagos/guías: ¿un cliente puede leer guías ajenas?
--    (Ejecutar con la sesión del cliente no es posible desde SQL Editor; revisar
--     las políticas de SELECT de `guias` y que usen cliente_id = auth.uid().)

