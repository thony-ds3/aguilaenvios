# [BE] Águila Envíos · Configuración de Supabase

Pasos que se hacen una sola vez en el panel de Supabase y con la CLI. Nada de esto se puede hacer desde el frontend.

## 1. Base de datos (SQL Editor, en este orden)

1. `aguila_envios_supabase_v2.sql`: esquema principal (ya ejecutado en el proyecto).
2. `migrations/002_rastreo_cliente.sql`: función `rastrear_guia` (rastreo del cliente por guía y fecha).
3. `migrations/003_reordenar_paradas.sql`: función `reordenar_paradas` (logística ordena las paradas).
4. `migrations/004_cuentas_inactivas.sql`: opcional y recomendada. Impide que una cuenta desactivada siga usando las funciones de viaje.
5. `migrations/005_auditoria_y_limites.sql`: bitácora de cambios administrativos (solo superadmin la lee) y límite de altas por hora.
6. `migrations/006_codigo_rastreo.sql`: **necesaria para vincular guías desde "Mis envíos"**. Agrega el código aleatorio de 12 caracteres y las funciones `rastrear_guia_codigo` y `vincular_guia_codigo`. Sin ella, la tabla del esquema compartido no tiene la columna que usa esta función.
7. `migrations/007_endurecer_rastreo.sql`: **obligatoria**. `rastrear_guia` deja de vincular la guía y ya no devuelve destinatario, dirección ni chófer si la guía no es del cliente; revoca `vincular_guia` y agrega un trigger que impide que un cliente modifique guías por PostgREST.
8. `migrations/008_reparar_perfiles.sql`: crea el perfil de las cuentas de `auth.users` que quedaron sin fila en `perfiles`.
9. `migrations/009_blindar_privilegios.sql`: **obligatoria**. Triggers que impiden que un cliente se cambie el `rol` en `perfiles`, que un chófer reporte la ubicación de otro, que se reasignen viajes ajenos y que un cliente registre pagos, aunque una política RLS sea demasiado amplia.
10. `migrations/010_realtime_y_politicas.sql`: **obligatoria para GPS y tiempo real**. Publica `guias`, `viajes` y `ubicaciones` en `supabase_realtime`, activa `replica identity full`, agrega políticas de lectura estrechas para cliente/chófer y pone las vistas `resumen_cliente` y `paradas_chofer` en `security_invoker = true`.
11. `migrations/011_perfil_automatico.sql`: **obligatoria**. Recrea `handle_new_user` (alta automática de perfil) y crea `reparar_mi_perfil()`, que la app llama si una cuenta quedó sin perfil.
12. `datos_iniciales.sql`: recintos reales y primer superadmin (edita los textos en mayúsculas antes de ejecutar).

Atajo: `npm run sql:todo` regenera `supabase/APLICAR_TODO.sql` con las migraciones 002–011 dentro de una sola transacción. Es la opción recomendada para el SQL Editor: si algo falla, no se aplica nada. Las migraciones numeradas siguen siendo la fuente de verdad.

Después de aplicar todo, ejecuta `diagnostico_rls.sql` (solo lectura) en el SQL Editor. La sección 8 debe mostrar `existe = true` en todas las filas y la sección 12 debe mostrar `true` en todas las columnas.

Después de aplicar todo, ejecuta `diagnostico_rls.sql` (solo lectura) en el SQL Editor. También revisa que existan las vistas, columnas y funciones RPC que invoca la aplicación. El esquema que compartiste solo lista las tablas; por sí solo no define esas dependencias.

El archivo principal `aguila_envios_supabase_v2.sql`, mencionado abajo, no está incluido en esta carpeta. Si aún no ejecutaste ese esquema en el proyecto, recupéralo antes de aplicar las migraciones: estas dependen de funciones, vistas, triggers y políticas RLS que se crean allí.

Luego revisa:

- **RLS activo** en las 7 tablas del dominio y en `auditoria`.
- **Políticas de `guias`**: el `SELECT` del cliente debe filtrar por `cliente_id = auth.uid()`; el `UPDATE`/`DELETE` de cliente no debe existir.
- **RPC de rastreo/vínculo**: solo `authenticated` debe tener `EXECUTE`; nunca `anon` ni `PUBLIC`.
- **Trigger `proteger_guia_cliente`** habilitado y `guias_sin_codigo = 0`.
- **Triggers de la migración 009** (`proteger_perfil_privilegios`, `proteger_ubicacion_chofer`, `proteger_viaje_chofer`, `proteger_pago`) habilitados.
- **Realtime**: `guias`, `viajes` y `ubicaciones` en `supabase_realtime`, con `relreplident = 'f'` (full).
- **Vistas**: `resumen_cliente` y `paradas_chofer` con `security_invoker=true`.
- **Trigger `on_auth_user_created`** en `auth.users` y RPC `reparar_mi_perfil()` existentes.

El script también lista perfiles huérfanos, funciones `SECURITY DEFINER` sin `search_path`, políticas potencialmente abiertas y permisos de `anon`.

## 2. Autenticación

### Contraseña mínima
Authentication > Sign In / Providers > Email > **Minimum password length = 10**.

La app también exige letras y números y bloquea contraseñas comunes (ver `src/lib/clave.ts`).
La configuración del panel es la última barrera: debe coincidir con la del código.

### Direcciones permitidas
Authentication > URL Configuration. Para producción en Render:

- **Site URL**: `https://aguilaenvios.onrender.com`
- **Redirect URLs**:
  - `https://aguilaenvios.onrender.com/**`
  - `http://localhost:5173/**` (solo desarrollo)

La app envía `emailRedirectTo` a `https://aguilaenvios.onrender.com/login?confirmado=1`, pero Supabase solo respeta esa dirección si el dominio está en **Redirect URLs**. Si falta, usa el **Site URL** y el enlace termina en otra pantalla o en `localhost`.

El dominio se toma de `VITE_APP_URL` (en Render: `https://aguilaenvios.onrender.com`). Si la variable no existe, se usa el dominio desde el que se abrió la app.

Sin esta configuración, los enlaces de confirmación y de recuperación de contraseña vuelven a una dirección equivocada.

### Google
1. Google Cloud Console > APIs y servicios > Credenciales > Crear ID de cliente de OAuth (aplicación web).
2. URI de redireccionamiento autorizado: `https://ifbexbcoujmdfgvryzfm.supabase.co/auth/v1/callback`.
3. Supabase > Authentication > Sign In / Providers > Google: activar y pegar **Client ID** y **Client Secret**.

Mientras Google esté desactivado, el botón "Continuar con Google" muestra un error.

### Correo de recuperación en español
Authentication > Emails > **Reset Password**.

Asunto:

```
Restablece tu contraseña de Águila Envíos
```

Cuerpo:

```html
<h2>Restablece tu contraseña</h2>
<p>Recibimos una solicitud para cambiar la contraseña de tu cuenta de Águila Envíos.</p>
<p><a href="{{ .ConfirmationURL }}">Crear una contraseña nueva</a></p>
<p>Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.</p>
<p>Águila Envíos · Tu envío, siempre a la vista.</p>
```

El enlace debe abrirse en el mismo navegador donde se pidió la recuperación.

Correo de confirmación de cuenta (Authentication > Emails > **Confirm signup**), asunto `Confirma tu cuenta de Águila Envíos`:

```html
<h2>Confirma tu correo</h2>
<p>Gracias por registrarte en Águila Envíos. Confirma tu correo para empezar a seguir tus envíos.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar mi correo</a></p>
```

El enlace del correo de confirmación vuelve a `https://aguilaenvios.onrender.com/login?confirmado=1`. La app detecta `confirmado=1` y muestra “¡Correo confirmado!”.

### SMTP propio (necesario para el registro público)

Con `mailer_autoconfirm = false`, cada alta envía un correo. El servidor **integrado** de Supabase tiene dos límites:

- **2 correos por hora** para todo el proyecto.
- **Solo envía a direcciones del equipo del proyecto** (las que aparecen en Organization > Team).

Por eso, después de unas pocas cuentas, “Crear cuenta” falla con `over_email_send_rate_limit` o “Email address not authorized”. **No es un fallo de la app**: es el límite del correo integrado. La solución definitiva es un SMTP propio.

1. Crea una cuenta en un proveedor transaccional (Resend, Brevo, SendGrid, Amazon SES) o usa Gmail con contraseña de aplicación.
2. Authentication > Emails > **SMTP Settings** > *Enable custom SMTP*:
   - **Resend**: host `smtp.resend.com`, puerto `465` (SSL) o `587` (STARTTLS), usuario `resend`, contraseña = API key, remitente = dominio verificado en Resend.
   - **Brevo**: host `smtp-relay.brevo.com`, puerto `587`, usuario = el correo de la cuenta, contraseña = clave SMTP de Brevo.
   - **Gmail**: host `smtp.gmail.com`, puerto `465`, usuario = la cuenta completa, contraseña = “contraseña de aplicación” (requiere verificación en dos pasos).
3. **Sender email** debe pertenecer al dominio verificado en el proveedor (por ejemplo `no-reply@tudominio.com`).
4. Usa **Send test email** y confirma que llega.
5. Ajusta Authentication > **Rate Limits** > *Email sent* según tu proveedor.

Alternativa rápida solo para pruebas: Authentication > Sign In / Providers > Email > desactivar **Confirm email** (`mailer_autoconfirm = true`). El registro funciona sin enviar correos, pero cualquiera puede crear cuentas sin verificar su dirección. No se recomienda en producción.

## 3. Edge Function `crear-usuario`

Necesaria para "Agregar usuario" (admin y superadmin). La clave secreta vive solo en el servidor.

```powershell
.\scripts\desplegar-funcion.ps1
# o con otro dominio:
.\scripts\desplegar-funcion.ps1 -Origenes "https://TU-DOMINIO.com,http://localhost:5173"
```

El script usa `supabase` si está instalado o `npx supabase` si no, pasa `--project-ref ifbexbcoujmdfgvryzfm` y configura `AE_ALLOWED_ORIGINS` con Render + localhost por defecto.

O manualmente:

```bash
npm install -g supabase            # o: npx supabase <comando>
supabase login
cd aguila_envios
supabase secrets set AE_ALLOWED_ORIGINS="https://aguilaenvios.onrender.com,http://localhost:5173" --project-ref ifbexbcoujmdfgvryzfm
supabase functions deploy crear-usuario --project-ref ifbexbcoujmdfgvryzfm --no-verify-jwt
```

`supabase/config.toml` ya define `verify_jwt = false`: la pasarela de Supabase no acepta las claves nuevas (`sb_publishable_...`) como JWT, así que la función valida por su cuenta la sesión de quien llama y comprueba que sea admin o superadmin activo. Si despliegas desde la CLI, no necesitas añadir `--no-verify-jwt`, pero hacerlo es inofensivo.

La función crea la cuenta con `full_name`, `apellidos` y `telefono` en los metadatos y luego hace **upsert** del perfil con rol, recinto y `activo = true`. El upsert verifica que la fila se escribió: si el perfil no se pudo crear, borra la cuenta de Auth para no dejar usuarios huérfanos.

`AE_ALLOWED_ORIGINS` es recomendable en producción: la función también acepta siempre `https://aguilaenvios.onrender.com` y localhost, pero si usas otro dominio debes agregarlo. La función limita a 10 altas por hora por cuenta y registra cada alta en `auditoria` cuando la migración 005 está aplicada.

La plataforma entrega la clave secreta a la función de forma automática. Si al crear un usuario aparece "La función no tiene configurada la clave del servidor", guárdala como secreto propio (Settings > API Keys > Secret key):

```bash
supabase secrets set AE_SECRET_KEY=sb_secret_XXXXXXXX --project-ref ifbexbcoujmdfgvryzfm
```

Nunca pongas esa clave en `.env.local` ni en el frontend.

## 4. Tiempo real

La migración `010_realtime_y_politicas.sql` garantiza que `guias`, `viajes` y `ubicaciones` estén en la publicación `supabase_realtime` y que tengan `replica identity full`. Se puede comprobar en Database > Publications o con la sección 9 de `diagnostico_rls.sql`.

Realtime aplica RLS: el cliente solo recibe cambios de sus propias filas y de la ubicación del chófer mientras su guía está en ruta. Si el GPS no se actualiza en el mapa, revisa en este orden:

1. Que el chófer tenga la pantalla de ruta abierta y el permiso de ubicación concedido.
2. Que el upsert a `ubicaciones` no devuelva error (política `ae_ubicaciones_chofer_escritura`).
3. Que `ubicaciones` tenga una restricción única o primaria en `chofer_id` (el upsert usa `onConflict: 'chofer_id'`).
4. Que la guía y el viaje estén en estado `en_ruta` (`puede_ver_ubicacion`).

## 5. Variables de la app (hosting)

En Vercel, Netlify o Cloudflare Pages:

| Variable | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://ifbexbcoujmdfgvryzfm.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | la clave `sb_publishable_...` |
| `VITE_APP_URL` | `https://aguilaenvios.onrender.com` (sin barra final) |
| `VITE_MODO_PRUEBA` | `false` en producción (solo se activa en `npm run dev`) |
| `VITE_TILES_URL` | opcional: proveedor de mosaicos propio (MapTiler, Stadia…) |
| `VITE_TILES_ATTRIBUTION` | atribución que exige ese proveedor |

Comando de compilación: `npm run build`. Carpeta de salida: `dist`.

### Cabeceras de seguridad

- En Vercel se aplican con `vercel.json`.
- En Netlify o Cloudflare Pages se aplican con `public/_headers` (Vite lo copia a `dist`).
- Si cambias `VITE_TILES_URL`, agrega su dominio en `img-src` y `connect-src` de la CSP o los mosaicos no cargarán.
