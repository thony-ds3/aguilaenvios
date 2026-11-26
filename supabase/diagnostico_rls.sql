-- ============================================================
-- [BE] Águila Envíos · Diagnóstico de RLS, Realtime y funciones (SOLO LECTURA)
-- Ejecutar completo en Supabase > SQL Editor. No cambia nada.
-- Sirve para verificar el estado real después de aplicar 002–011.
--
-- Interpretación rápida:
--   * Toda la sección 8 debe devolver existe = true.
--   * Toda la sección 12 debe devolver cumple = true.
--   * Las secciones 13 y 14 muestran políticas/permisos que conviene revisar.
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

-- 3) Funciones SECURITY DEFINER, permisos y search_path
select
  p.proname as funcion,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  p.prosecdef as security_definer,
  p.proacl as permisos,
  p.proconfig as configuracion,
  coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%' as fija_search_path
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname;

-- 4) Permisos de las RPC de rastreo, vínculo y autorreparación
select
  routine_name as funcion,
  grantee as rol,
  privilege_type as privilegio
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'rastrear_guia','rastrear_guia_codigo','vincular_guia','vincular_guia_codigo',
    'reparar_mi_perfil','mi_viaje_chofer','cliente_en_viaje','puede_ver_ubicacion','contexto_servidor'
  )
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

-- 7) Triggers relevantes en public
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

-- 8) Objetos que usa la aplicación. Cada fila debe mostrar existe = true.
with objetos(nombre, existe, origen) as (
  values
    ('vista resumen_cliente', to_regclass('public.resumen_cliente') is not null, 'Esquema principal aguila_envios_supabase_v2.sql'),
    ('vista paradas_chofer', to_regclass('public.paradas_chofer') is not null, 'Esquema principal aguila_envios_supabase_v2.sql'),
    ('columna guias.codigo_rastreo', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'guias' and column_name = 'codigo_rastreo'), 'Migración 006_codigo_rastreo.sql'),
    ('tabla auditoria', to_regclass('public.auditoria') is not null, 'Migración 005_auditoria_y_limites.sql'),
    ('tabla limites_acciones', to_regclass('public.limites_acciones') is not null, 'Migración 005_auditoria_y_limites.sql'),
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
    ('RPC vincular_guia_codigo(text)', to_regprocedure('public.vincular_guia_codigo(text)') is not null, 'Migraciones 006 y 007'),
    ('RPC reparar_mi_perfil()', to_regprocedure('public.reparar_mi_perfil()') is not null, 'Migración 011_perfil_automatico.sql'),
    ('helper contexto_servidor()', to_regprocedure('public.contexto_servidor()') is not null, 'Migraciones 007 y 009'),
    ('helper mi_viaje_chofer(uuid)', to_regprocedure('public.mi_viaje_chofer(uuid)') is not null, 'Migración 010_realtime_y_politicas.sql'),
    ('helper cliente_en_viaje(uuid)', to_regprocedure('public.cliente_en_viaje(uuid)') is not null, 'Migración 010_realtime_y_politicas.sql'),
    ('helper puede_ver_ubicacion(uuid)', to_regprocedure('public.puede_ver_ubicacion(uuid)') is not null, 'Migración 010_realtime_y_politicas.sql'),
    ('trigger on_auth_user_created', exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created' and not tgisinternal), 'Migración 011_perfil_automatico.sql'),
    ('trigger proteger_guia_cliente', exists (select 1 from pg_trigger where tgrelid = 'public.guias'::regclass and tgname = 'proteger_guia_cliente' and not tgisinternal), 'Migración 007_endurecer_rastreo.sql'),
    ('trigger proteger_perfil_privilegios', exists (select 1 from pg_trigger where tgrelid = 'public.perfiles'::regclass and tgname = 'proteger_perfil_privilegios' and not tgisinternal), 'Migración 009_blindar_privilegios.sql'),
    ('trigger proteger_pago', exists (select 1 from pg_trigger where tgrelid = 'public.pagos'::regclass and tgname = 'proteger_pago' and not tgisinternal), 'Migración 009_blindar_privilegios.sql')
)
select nombre, existe, origen from objetos order by nombre;

-- 9) Realtime: tablas publicadas y replica identity
select tablename as tabla_publicada
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;

select
  c.relname as tabla,
  c.relreplident,
  case c.relreplident when 'f' then 'full' when 'd' then 'default' when 'n' then 'nothing' else c.relreplident::text end as replica_identity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('guias','viajes','ubicaciones')
order by c.relname;

-- 10) Vistas: deben tener security_invoker = true para respetar RLS
select
  c.relname as vista,
  c.relkind,
  c.reloptions,
  coalesce('security_invoker=true' = any(c.reloptions), false) as security_invoker
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('resumen_cliente','paradas_chofer')
order by c.relname;

-- 11) Requisitos de upsert/constraint: ubicaciones(chofer_id) único y formato del código
select conname, contype, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.ubicaciones'::regclass
order by contype, conname;

select conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.guias'::regclass
  and conname = 'guias_codigo_rastreo_formato';

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'guias' and indexdef ilike '%codigo_rastreo%';

-- 12) Resumen automático: cada fila debe ser true
select
  (select bool_and(c.relrowsecurity) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in ('perfiles','viajes','guias','historial','pagos','ubicaciones')) as rls_en_tablas,
  to_regprocedure('public.rastrear_guia(text,date)') is not null as rastrear_guia,
  to_regprocedure('public.rastrear_guia_codigo(text)') is not null as rastrear_guia_codigo,
  to_regprocedure('public.vincular_guia_codigo(text)') is not null as vincular_guia_codigo,
  to_regprocedure('public.reparar_mi_perfil()') is not null as reparar_mi_perfil,
  exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created' and not tgisinternal) as alta_automatica_perfil,
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('guias','viajes','ubicaciones')) = 3 as realtime_tres_tablas;

-- 13) Políticas potencialmente demasiado abiertas (revisar, no siempre son un fallo)
select tablename as tabla, policyname as politica, cmd as comando, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and (
    qual = 'true'
    or (cmd in ('INSERT','UPDATE','ALL') and with_check is null)
    or (cmd in ('INSERT','UPDATE','ALL') and with_check = 'true')
  )
order by tablename, policyname;

-- 14) Permisos de tabla para anon (recuerda: RLS sigue aplicando aunque el GRANT exista)
select
  c.relname as tabla,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_lee,
  has_table_privilege('anon', c.oid, 'INSERT') as anon_inserta,
  has_table_privilege('anon', c.oid, 'UPDATE') as anon_actualiza,
  has_table_privilege('anon', c.oid, 'DELETE') as anon_borra
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('recintos','perfiles','viajes','guias','historial','pagos','ubicaciones','auditoria','limites_acciones')
order by c.relname;

-- 15) ¿Un cliente puede leer guías ajenas? Revisar que TODA política SELECT de guias
--     incluya cliente_id = auth.uid() o esté limitada por rol. Si aparece una política
--     SELECT con qual = true para authenticated, el cliente verá todas las guías.
select policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'guias' and cmd in ('SELECT','ALL')
order by policyname;
