// [BE] Edge Function (Deno) · crear-usuario
// Crea una cuenta y le asigna rol y recinto. Usa la clave secreta SOLO en el servidor.
// Quién puede llamarla:
//   - superadmin: crea admin, recepción, logística, chófer o cliente en cualquier recinto.
//   - admin: crea recepción, logística, chófer o cliente SOLO en su propio recinto.
// La función se despliega con --no-verify-jwt y valida aquí mismo la sesión de quien llama
// (la pasarela de Supabase no acepta las claves nuevas sb_publishable_ como JWT).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RE_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?: [A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;
const RE_VOCAL_REPETIDA = /([aeiouáéíóúü])\1/i;
const RE_TELEFONO = /^\d{7,15}$/;
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES_DE_ADMIN = ['recepcion', 'logistica', 'chofer', 'cliente'];
const ROLES_DE_SUPERADMIN = ['admin', 'recepcion', 'logistica', 'chofer', 'cliente'];

function responder(status: number, cuerpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// La clave secreta nunca sale del servidor. Orden de búsqueda:
// 1) AE_SECRET_KEY (secreto propio: supabase secrets set AE_SECRET_KEY=sb_secret_...)
// 2) SUPABASE_SECRET_KEYS (claves nuevas que inyecta la plataforma)
// 3) SUPABASE_SERVICE_ROLE_KEY (clave heredada que inyecta la plataforma)
function claveSecreta(): string | null {
  const propia = Deno.env.get('AE_SECRET_KEY');
  if (propia) return propia;
  const nuevas = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (nuevas) {
    try {
      const mapa = JSON.parse(nuevas) as Record<string, unknown>;
      const valor = mapa.default ?? Object.values(mapa)[0];
      if (typeof valor === 'string' && valor) return valor;
    } catch {
      // Formato inesperado: se intenta con la clave heredada
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? null;
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

function validarNombre(valor: string, etiqueta: string): string | null {
  if (valor.length < 2 || valor.length > 60) return `${etiqueta} debe tener entre 2 y 60 letras.`;
  if (!RE_NOMBRE.test(valor)) return `${etiqueta} solo puede tener letras, tildes, ñ y espacios.`;
  if (RE_VOCAL_REPETIDA.test(valor)) return `${etiqueta} no puede tener vocales repetidas seguidas.`;
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder(405, { error: 'Método no permitido.' });

  const url = Deno.env.get('SUPABASE_URL');
  const secreta = claveSecreta();
  if (!url || !secreta) {
    return responder(500, { error: 'La función no tiene configurada la clave del servidor.' });
  }
  const admin = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1) ¿Quién llama? Se valida su sesión con Supabase Auth
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return responder(401, { error: 'Inicia sesión para crear usuarios.' });
  const { data: sesion, error: errorSesion } = await admin.auth.getUser(token);
  if (errorSesion || !sesion.user) {
    return responder(401, { error: 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.' });
  }

  // 2) Debe ser admin o superadmin activo
  const { data: llamador, error: errorPerfil } = await admin
    .from('perfiles')
    .select('rol, recinto_id, activo')
    .eq('id', sesion.user.id)
    .maybeSingle();
  if (errorPerfil) return responder(500, { error: 'No se pudo verificar tu perfil.' });
  if (!llamador || !llamador.activo || !['admin', 'superadmin'].includes(llamador.rol)) {
    return responder(403, { error: 'Solo un admin o superadmin activo puede crear usuarios.' });
  }
  const esSuperadmin = llamador.rol === 'superadmin';

  // 3) Datos del usuario nuevo (se validan otra vez en el servidor)
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return responder(400, { error: 'Los datos enviados no son válidos.' });
  }
  const nombres = texto(cuerpo.nombres);
  const apellidos = texto(cuerpo.apellidos);
  const telefono = texto(cuerpo.telefono);
  const correo = texto(cuerpo.correo).toLowerCase();
  const clave = typeof cuerpo.clave === 'string' ? cuerpo.clave : '';
  const rol = texto(cuerpo.rol);

  const errorDatos =
    validarNombre(nombres, 'Los nombres') ??
    validarNombre(apellidos, 'Los apellidos') ??
    (telefono && !RE_TELEFONO.test(telefono) ? 'El teléfono debe tener entre 7 y 15 números.' : null) ??
    (!RE_CORREO.test(correo) ? 'El correo no tiene un formato válido.' : null) ??
    (clave.length < 8 || clave.length > 72 ? 'La contraseña debe tener entre 8 y 72 caracteres.' : null);
  if (errorDatos) return responder(400, { error: errorDatos });

  // 4) Rol y recinto permitidos según quién llama
  const rolesPermitidos = esSuperadmin ? ROLES_DE_SUPERADMIN : ROLES_DE_ADMIN;
  if (!rolesPermitidos.includes(rol)) {
    return responder(403, { error: 'No tienes permiso para crear usuarios con ese rol.' });
  }
  let recintoId: string | null;
  if (esSuperadmin) {
    recintoId = texto(cuerpo.recinto_id) || null;
    if (rol !== 'cliente' && !recintoId) {
      return responder(400, { error: 'El personal debe tener un recinto asignado.' });
    }
    if (recintoId) {
      const { data: recinto } = await admin.from('recintos').select('id').eq('id', recintoId).maybeSingle();
      if (!recinto) return responder(400, { error: 'El recinto indicado no existe.' });
    }
  } else {
    // Un admin solo crea usuarios en su propio recinto, sin importar lo que envíe el formulario
    recintoId = llamador.recinto_id;
    if (!recintoId) return responder(403, { error: 'Tu cuenta de admin no tiene recinto asignado.' });
  }

  // 5) Crear la cuenta (el trigger handle_new_user crea el perfil como cliente)
  const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
    email: correo,
    password: clave,
    email_confirm: true,
    user_metadata: { full_name: nombres },
  });
  if (errorCrear || !creado.user) {
    const mensaje = errorCrear?.message ?? '';
    if (/already|registered|exists/i.test(mensaje)) {
      return responder(409, { error: 'Ya existe una cuenta con este correo.' });
    }
    return responder(400, { error: 'No se pudo crear la cuenta. Revisa el correo y la contraseña.' });
  }

  // 6) Asignar nombre, teléfono, rol y recinto. Si falla, se borra la cuenta para no dejarla a medias.
  const { error: errorActualizar } = await admin
    .from('perfiles')
    .update({ nombres, apellidos, telefono: telefono || null, rol, recinto_id: recintoId })
    .eq('id', creado.user.id);
  if (errorActualizar) {
    await admin.auth.admin.deleteUser(creado.user.id);
    return responder(400, { error: 'No se pudo asignar el rol o el recinto. No se creó la cuenta.' });
  }

  return responder(201, { id: creado.user.id, correo });
});
