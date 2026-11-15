-- ============================================================
-- [BE] Águila Envíos · Datos iniciales reales (plantilla)
-- Reemplaza los textos en MAYÚSCULAS y ejecuta cada bloque en Supabase > SQL Editor.
-- No incluye usuarios de ejemplo: las cuentas se crean desde la app y aquí solo
-- se les asigna rol y recinto por su correo.
-- ============================================================

-- ---------- 1) Recintos reales ----------
-- Nombre y departamento: solo letras, tildes, ñ y espacios (dominio d_letras).
insert into recintos (nombre, departamento, direccion)
values
  ('NOMBRE DEL RECINTO', 'La Paz', 'DIRECCION DEL RECINTO')
on conflict (nombre) do nothing;

-- Si no vas a usar el recinto de ejemplo del esquema, desactívalo (no lo borres si ya tiene guías):
-- update recintos set activo = false where nombre = 'Recinto Central';

-- ---------- 2) Primer superadmin ----------
-- Primero crea la cuenta en la app (pantalla "Crear cuenta") y confirma el correo.
update perfiles set rol = 'superadmin'
where id = (select id from auth.users where email = 'CORREO_DEL_SUPERADMIN');

-- ---------- 3) Personal (opcional: también se puede hacer desde la app) ----------
-- Con el superadmin ya creado, lo normal es usar "Usuarios del sistema" en la app.
-- Si prefieres SQL, la cuenta debe existir y el recinto también:
-- update perfiles
-- set rol = 'admin',   -- admin | recepcion | logistica | chofer
--     recinto_id = (select id from recintos where nombre = 'NOMBRE DEL RECINTO')
-- where id = (select id from auth.users where email = 'CORREO_DE_LA_PERSONA');

-- ---------- 4) Verificación ----------
select u.email, p.nombres, p.apellidos, p.rol, r.nombre as recinto, p.activo
from perfiles p
join auth.users u on u.id = p.id
left join recintos r on r.id = p.recinto_id
order by p.rol, p.nombres;
