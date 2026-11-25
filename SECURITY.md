# Seguridad · Águila Envíos

Este documento resume cómo reportar problemas y qué configuración debe aplicarse fuera del
repositorio. El código del cliente no es una frontera de seguridad: **RLS en Supabase** es
quien decide qué filas y columnas puede leer o escribir cada rol.

## Reportar una vulnerabilidad

No abras un issue público con datos reales (guías, teléfonos, correos). Escribe a la persona
responsable del proyecto indicando:

1. Pantalla o función afectada.
2. Pasos para reproducirlo.
3. Rol con el que se reproduce (cliente, chófer, recepción, logística, admin, superadmin).
4. Impacto esperado (leer datos ajenos, cambiar datos, crear cuentas, etc.).

## Configuración obligatoria en producción

Marca lo que ya esté hecho. Ninguna de estas tareas se puede completar solo con el código frontend.

- [ ] **Repositorio privado.** El proyecto estaba publicado en un repositorio público. Un repo
      público expone el historial y cualquier secreto que se haya subido por error. Cámbialo a
      privado y rota las claves que hayan estado en él.
- [ ] **Aplicar migraciones 005–008** en Supabase → SQL Editor, en orden:
      - `supabase/migrations/005_auditoria_y_limites.sql`
      - `supabase/migrations/006_codigo_rastreo.sql`
      - `supabase/migrations/007_endurecer_rastreo.sql`
      - `supabase/migrations/008_reparar_perfiles.sql`
      - Después, ejecutar `supabase/diagnostico_rls.sql` (solo lectura) y revisar el resultado.
- [ ] **Desplegar la Edge Function** `crear-usuario` (ver `scripts/desplegar-funcion.ps1`).
      Sin ella, el alta de usuarios desde `/superadmin/usuarios` sigue fallando.
- [ ] **Secretos de la función:**
      `supabase secrets set AE_ALLOWED_ORIGINS="https://tu-dominio.com,http://localhost:5173"`
      (y `AE_SECRET_KEY` si no usas las claves que inyecta la plataforma).
- [ ] **Confirmación de correo** activada y registro público desactivado si el alta la hace
      solo el personal (`Auth > Providers > Email`).
- [ ] **Verificación en dos pasos (TOTP)** activada para superadmin y admin desde
      `/seguridad`. La app exige aal2 cuando la cuenta ya tiene un factor verificado.
- [ ] **Protección de contraseñas filtradas** (HaveIBeenPwned): es una opción de Supabase
      Auth disponible en planes de pago; actívala si el plan la incluye.
- [ ] **SMTP propio.** El SMTP integrado de Supabase limita los correos (2 por hora) y no
      sirve para recuperación de contraseñas en producción.
- [ ] **Cabeceras de seguridad** desplegadas. `vercel.json` (Vercel) o `public/_headers`
      (Netlify/Cloudflare Pages). Si cambias `VITE_TILES_URL`, agrega ese dominio a
      `img-src` y `connect-src` en la CSP.
- [ ] **Proveedor de mosaicos.** No uses el servidor público de OpenStreetMap con tráfico
      alto: configura `VITE_TILES_URL` y `VITE_TILES_ATTRIBUTION`.
- [ ] **Variables de entorno.** `.env.local` no se versiona. Nunca pongas la clave
      `service_role`/`secret` en el frontend: la app se niega a arrancar si la detecta.

## Controles implementados en esta versión

| Hallazgo | Control |
| --- | --- |
| 10 · Contraseñas y MFA | Mínimo 10 caracteres con letras y números, lista de claves comunes, MFA TOTP opcional y exigencia de aal2 para admin/superadmin con factor verificado. Contraseña temporal obligatoria al alta. |
| 11 · Auditoría | Tabla `auditoria` con triggers en perfiles, recintos y pagos; lectura solo para superadmin (`/superadmin/auditoria`). |
| 12 · Búsqueda | Retraso de 300 ms en la búsqueda de clientes y columnas explícitas. |
| 13 · PII | Consultas con columnas explícitas en clientes, chóferes y usuarios. |
| 14 · Edge Function | CORS con lista blanca, límite de 10 altas por hora por cuenta, cuerpo máximo y validación doble. |
| 15 · Alta de usuarios | Función lista para desplegar; el error de "no desplegada" es explícito. |
| 16 · Rastreo | Código aleatorio de 12 caracteres (`rastrear_guia_codigo`) que no vincula la guía al consultarla, vínculo seguro a "Mis envíos" (`vincular_guia_codigo`), `vincular_guia` revocada y trigger anti-suplantación en `guias`. |
| 17 · Repositorio | `.gitignore` endurecido, Dependabot y este documento. |
| 18 · Dependencias | Revisión semanal automatizada; `npm audit --omit=dev` limpio. |
| 19 · Cabeceras | CSP, HSTS, `nosniff`, `frame-ancestors`, `Referrer-Policy` y `Permissions-Policy`. |
| 20 · Entorno | Mosaicos configurables; simulador GPS solo en desarrollo. |

## Límites conocidos

- `rastrear_guia` (migración 002) se conserva para compatibilidad, pero la migración 007 la
  reemplaza: ya **no vincula** la guía y, si la guía no pertenece al cliente, solo devuelve
  numero/estado/fechas (sin destinatario, dirección ni chófer). `vincular_guia` quedó revocada;
  el único vínculo es por código (`vincular_guia_codigo`).
- La protección de MFA es de experiencia: RLS no puede comprobar el nivel aal2. Si se necesita
  exigencia estricta en el servidor, hay que añadir políticas/claims específicos.
- Los metadatos `debe_cambiar_clave` son un control de UX; un usuario con la contraseña
  temporal podría llamar a la API directamente. Para una frontera real se necesitaría una
  columna en `perfiles` y una política/trigger que la respete.
- `npm audit` reporta 4 avisos moderados en dependencias **solo de desarrollo**
  (`glob`/`minimatch` dentro de `workbox-build`, usado por `vite-plugin-pwa`). No llegan al
  bundle ni al servidor. El arreglo automático exige bajar `vite-plugin-pwa` a la 1.x, lo que
  rompería la configuración actual; se siguen con Dependabot y se actualizarán cuando
  `workbox-build` publique una versión compatible. `npm audit --omit=dev` está limpio.
