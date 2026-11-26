// [BE] Genera supabase/APLICAR_TODO.sql a partir de las migraciones numeradas.
// Uso:  npm run sql:todo   (o: node scripts/generar-sql-todo.mjs)
//
// El archivo generado envuelve 002–011 en una sola transacción para ejecutarlo de
// una vez en Supabase > SQL Editor. Las migraciones numeradas siguen siendo la
// fuente de verdad; no edites APLICAR_TODO.sql a mano.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directorio = path.join(raiz, 'supabase', 'migrations');
const salida = path.join(raiz, 'supabase', 'APLICAR_TODO.sql');

const archivos = fs
  .readdirSync(directorio)
  .filter((nombre) => /^\d{3}_.+\.sql$/.test(nombre))
  .sort((a, b) => a.localeCompare(b, 'en'));

if (archivos.length === 0) {
  throw new Error(`No hay migraciones en ${directorio}`);
}

if (archivos[0] !== '002_rastreo_cliente.sql') {
  throw new Error('La primera migración debe ser 002_rastreo_cliente.sql (001 es el esquema base)');
}

const partes = archivos.map((archivo) => {
  const sql = fs.readFileSync(path.join(directorio, archivo), 'utf8').trimEnd();
  return [
    '-- ============================================================',
    `-- ${archivo}`,
    '-- ============================================================',
    sql,
    '',
  ].join('\n');
});

const contenido = `-- ============================================================
-- [BE] Águila Envíos · APLICAR TODO (generado automáticamente)
-- Generado por scripts/generar-sql-todo.mjs con ${archivos.length} migraciones.
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

${partes.join('\n')}
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
`;

fs.writeFileSync(salida, contenido, 'utf8');

console.log(`Generado ${path.relative(raiz, salida)}`);
for (const archivo of archivos) console.log(`  - ${archivo}`);
