# [BE] Águila Envíos · Configuración de Supabase

Pasos que se hacen una sola vez en el panel de Supabase y con la CLI. Nada de esto se puede hacer desde el frontend.

## 1. Base de datos (SQL Editor, en este orden)

1. `aguila_envios_supabase_v2.sql`: esquema principal (ya ejecutado en el proyecto).
2. `migrations/002_rastreo_cliente.sql`: función `rastrear_guia` (rastreo del cliente por guía y fecha).
3. `migrations/003_reordenar_paradas.sql`: función `reordenar_paradas` (logística ordena las paradas).
4. `migrations/004_cuentas_inactivas.sql`: opcional y recomendada. Impide que una cuenta desactivada siga usando las funciones de viaje.
5. `datos_iniciales.sql`: recintos reales y primer superadmin (edita los textos en mayúsculas antes de ejecutar).

## 2. Autenticación

### Contraseña mínima
Authentication > Sign In / Providers > Email > **Minimum password length = 8**.

### Direcciones permitidas
Authentication > URL Configuration:
- **Site URL**: la dirección pública de la app, por ejemplo `https://aguila-envios.vercel.app`.
- **Redirect URLs**: `https://TU-DOMINIO/**` y, para desarrollo, `http://localhost:5173/**`.

Sin esto, los enlaces de recuperar contraseña y el acceso con Google vuelven a una dirección equivocada.

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

El servicio de correo incluido en Supabase permite muy pocos envíos por hora. Para uso real configura un SMTP propio en Authentication > Emails > SMTP Settings.

## 3. Edge Function `crear-usuario`

Necesaria para "Agregar usuario" (admin y superadmin). La clave secreta vive solo en el servidor.

```bash
npm install -g supabase            # o: npx supabase <comando>
supabase login
cd aguila_envios
supabase functions deploy crear-usuario --project-ref ifbexbcoujmdfgvryzfm --no-verify-jwt
```

`--no-verify-jwt` es obligatorio con las claves nuevas (`sb_publishable_...`): la pasarela de Supabase no las acepta como JWT. La función valida por su cuenta la sesión de quien llama y comprueba que sea admin o superadmin activo.

La plataforma entrega la clave secreta a la función de forma automática. Si al crear un usuario aparece "La función no tiene configurada la clave del servidor", guárdala como secreto propio (Settings > API Keys > Secret key):

```bash
supabase secrets set AE_SECRET_KEY=sb_secret_XXXXXXXX --project-ref ifbexbcoujmdfgvryzfm
```

Nunca pongas esa clave en `.env.local` ni en el frontend.

## 4. Tiempo real

El esquema ya agrega `guias`, `viajes` y `ubicaciones` a la publicación `supabase_realtime`. Se puede comprobar en Database > Publications.

## 5. Variables de la app (hosting)

En Vercel, Netlify o Cloudflare Pages:

| Variable | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://ifbexbcoujmdfgvryzfm.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | la clave `sb_publishable_...` |
| `VITE_MODO_PRUEBA` | `false` en producción |

Comando de compilación: `npm run build`. Carpeta de salida: `dist`.
