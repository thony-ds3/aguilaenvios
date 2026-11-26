// [BE] Edge Function (Deno) · crear-usuario
// Crea una cuenta y le asigna rol y recinto. Usa la clave secreta SOLO en el servidor.
// Quién puede llamarla:
//   - superadmin: crea admin, recepción, logística, chófer o cliente en cualquier recinto.
//   - admin: crea recepción, logística, chófer o cliente SOLO en su propio recinto.
// La función se despliega con --no-verify-jwt y valida aquí mismo la sesión de quien llama
// (la pasarela de Supabase no acepta las claves nuevas sb_publishable_ como JWT).
//
// Endurecimiento (auditoría 10, 11, 14, 15):
//   - CORS con lista blanca (AE_ALLOWED_ORIGINS).
//   - Límite de altas por cuenta y por hora (tabla limites_acciones, migración 005).
//   - Bitácora en `auditoria` (migración 005).
//   - Contraseña temporal: el usuario debe cambiarla al ingresar (debe_cambiar_clave).
//   - Política de contraseñas reforzada, igual que en el navegador (src/lib/clave.ts).
import { createClient } from 'npm:@supabase/supabase-js@2';

const METODOS = 'POST, OPTIONS';
const CABECERAS = 'authorization, x-client-info, apikey, content-type';
const MAX_CUERPO_BYTES = 12_000;
const LIMITE_ALTAS_POR_HORA = 10;

const RE_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?: [A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;
const RE_VOCAL_REPETIDA = /([aeiouáéíóúü])\1/i;
const RE_TELEFONO = /^\d{7,15}$/;
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES_DE_ADMIN = ['recepcion', 'logistica', 'chofer', 'cliente'];
const ROLES_DE_SUPERADMIN = ['admin', 'recepcion', 'logistica', 'chofer', 'cliente'];
const CLAVE_MIN = 10;
const CLAVE_MAX = 72;

// Contraseñas frecuentes (mismas que src/lib/clave.ts). Se comparan en minúsculas.
const CLAVES_COMUNES = new Set([
  '1234567890',
  '12345678910',
  'contrasena',
  'contraseña',
  'password10',
  'password123',
  'aguila1234',
  'aguilaenvios',
  'administrador',
  'recepcion123',
  'qwertyuiop',
  'iloveyou10',
  'bienvenido',
  '123456789a',
]);

// Orígenes autorizados para el navegador. Se configura con:
//   supabase secrets set AE_ALLOWED_ORIGINS="https://app.ejemplo.com,http://localhost:5173"
function origenesPermitidos(): string[] {
  const configurados = (Deno.env.get('AE_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  // Orígenes conocidos: desarrollo local y la app publicada en Render.
  // Se permiten siempre para que un secreto sin configurar no rompa el alta en producción.
  const conocidos = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://aguilaenvios.onrender.com',
  ];
  return [...new Set([...configurados, ...conocidos])];
}

function cabecerasCors(origen: string | null): Record<string, string> {
  const permitidos = origenesPermitidos();
  const permitido = origen && permitidos.includes(origen) ? origen : permitidos[0] ?? 'null';
  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Headers': CABECERAS,
    'Access-Control-Allow-Methods': METODOS,
    Vary: 'Origin',
  };
}

function responder(
  status: number,
  cuerpo: Record<string, unknown>,
  origen: string | null = null,
): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cabecerasCors(origen), 'Content-Type': 'application/json' },
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

// Misma política que el navegador: mínimo 10, letras y números, sin patrones obvios.
function validarClave(valor: string): string | null {
  if (valor.length < CLAVE_MIN) return `La contraseña debe tener al menos ${CLAVE_MIN} caracteres.`;
  if (valor.length > CLAVE_MAX) return `La contraseña no puede superar ${CLAVE_MAX} caracteres.`;
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(valor) || !/\d/.test(valor)) {
    return 'La contraseña debe combinar letras y números.';
  }
  if (CLAVES_COMUNES.has(valor.toLowerCase())) return 'Esa contraseña es demasiado común.';
  if (/(.)\1{3,}/.test(valor)) return 'La contraseña no puede repetir el mismo carácter cuatro veces.';
  if (/^(?:1234|abcd|qwer|asdf|ae-?\d)/i.test(valor)) {
    return 'La contraseña no puede empezar con una secuencia predecible.';
  }
  return null;
}

// Lee el claim `aal` del JWT: aal1 = solo contraseña, aal2 = contraseña + segundo factor.
function nivelAal(token: string): string | null {
  try {
    const parte = token.split('.')[1];
    if (!parte) return null;
    const base64 = parte.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as { aal?: unknown };
    return typeof payload.aal === 'string' ? payload.aal : null;
  } catch {
    return null;
  }
}

// Extrae la lista de factores sin depender de la forma exacta de la respuesta del Admin API.
function factoresDe(respuesta: unknown): Array<{ status?: string }> {
  if (!respuesta || typeof respuesta !== 'object') return [];
  const posibles = (respuesta as { factors?: unknown }).factors;
  if (Array.isArray(posibles)) return posibles as Array<{ status?: string }>;
  if ('status' in respuesta) return [respuesta as { status?: string }];
  return [];
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origen = req.headers.get('Origin');
  const permitidos = origenesPermitidos();

  // 0) CORS: solo orígenes de la lista blanca. Sin cabecera Origin (curl) se permite,
  //    porque igualmente hay que presentar un JWT válido de admin/superadmin.
  if (origen && !permitidos.includes(origen)) {
    return responder(403, { error: 'Origen no autorizado. Configura AE_ALLOWED_ORIGINS.' }, origen);
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecerasCors(origen) });
  if (req.method !== 'POST') return responder(405, { error: 'Método no permitido.' }, origen);

  const largo = Number(req.headers.get('content-length') ?? 0);
  if (largo > MAX_CUERPO_BYTES) return responder(413, { error: 'La solicitud es demasiado grande.' }, origen);

  const url = Deno.env.get('SUPABASE_URL');
  const secreta = claveSecreta();
  if (!url || !secreta) {
    return responder(500, { error: 'La función no tiene configurada la clave del servidor.' }, origen);
  }
  const admin = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1) ¿Quién llama? Se valida su sesión con Supabase Auth
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return responder(401, { error: 'Inicia sesión para crear usuarios.' }, origen);
  const { data: sesion, error: errorSesion } = await admin.auth.getUser(token);
  if (errorSesion || !sesion.user) {
    return responder(401, { error: 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.' }, origen);
  }
  const actorId = sesion.user.id;

  // 2) Debe ser admin o superadmin activo
  const { data: llamador, error: errorPerfil } = await admin
    .from('perfiles')
    .select('rol, recinto_id, activo')
    .eq('id', actorId)
    .maybeSingle();
  if (errorPerfil) return responder(500, { error: 'No se pudo verificar tu perfil.' }, origen);
  if (!llamador || !llamador.activo || !['admin', 'superadmin'].includes(llamador.rol)) {
    return responder(403, { error: 'Solo un admin o superadmin activo puede crear usuarios.' }, origen);
  }
  const esSuperadmin = llamador.rol === 'superadmin';

  // 2.1) MFA del lado del servidor: si la cuenta ya tiene un factor verificado,
  //       crear usuarios exige una sesión aal2 (contraseña + código TOTP).
  try {
    const mfa = await admin.auth.admin.mfa.listFactors({ userId: actorId });
    const tieneFactor = factoresDe(mfa.data).some((f) => f.status === 'verified');
    if (tieneFactor && nivelAal(token) !== 'aal2') {
      return responder(
        403,
        { error: 'Tu cuenta tiene verificación en dos pasos. Vuelve a iniciar sesión e ingresa el código antes de crear usuarios.' },
        origen,
      );
    }
  } catch (e) {
    // Si el Admin API no responde, no se bloquea el alta: se registra para revisión.
    console.error('mfa', e instanceof Error ? e.message : e);
  }

  // 3) Límite de altas por hora (migración 005). Si la tabla no existe todavía,
  //    la función sigue funcionando: el límite es una capa adicional, no un requisito.
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const conteo = await admin
    .from('limites_acciones')
    .select('id', { count: 'exact', head: true })
    .eq('actor_id', actorId)
    .eq('accion', 'crear_usuario')
    .gte('creado_en', desde);
  if (!conteo.error && (conteo.count ?? 0) >= LIMITE_ALTAS_POR_HORA) {
    return responder(429, { error: 'Has creado demasiados usuarios en la última hora. Intenta más tarde.' }, origen);
  }
  const registrarLimite = async () => {
    const { error } = await admin.from('limites_acciones').insert({ actor_id: actorId, accion: 'crear_usuario' });
    // 42P01 = tabla inexistente: la migración 005 no está aplicada
    if (error && error.code !== '42P01') console.error('limites_acciones', error.message);
  };

  // 4) Datos del usuario nuevo (se validan otra vez en el servidor)
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return responder(400, { error: 'Los datos enviados no son válidos.' }, origen);
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
    validarClave(clave);
  if (errorDatos) return responder(400, { error: errorDatos }, origen);

  // 5) Rol y recinto permitidos según quién llama
  const rolesPermitidos = esSuperadmin ? ROLES_DE_SUPERADMIN : ROLES_DE_ADMIN;
  if (!rolesPermitidos.includes(rol)) {
    return responder(403, { error: 'No tienes permiso para crear usuarios con ese rol.' }, origen);
  }
  let recintoId: string | null;
  if (esSuperadmin) {
    recintoId = texto(cuerpo.recinto_id) || null;
    if (rol !== 'cliente' && !recintoId) {
      return responder(400, { error: 'El personal debe tener un recinto asignado.' }, origen);
    }
    if (recintoId) {
      const { data: recinto } = await admin.from('recintos').select('id').eq('id', recintoId).maybeSingle();
      if (!recinto) return responder(400, { error: 'El recinto indicado no existe.' }, origen);
    }
  } else {
    // Un admin solo crea usuarios en su propio recinto, sin importar lo que envíe el formulario
    recintoId = llamador.recinto_id;
    if (!recintoId) return responder(403, { error: 'Tu cuenta de admin no tiene recinto asignado.' }, origen);
  }

  // 6) Crear la cuenta (el trigger handle_new_user crea el perfil como cliente)
  //    `debe_cambiar_clave` hace que la app exija una contraseña personal al ingresar.
  const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
    email: correo,
    password: clave,
    email_confirm: true,
    user_metadata: {
      full_name: nombres,
      apellidos,
      telefono: telefono || null,
      debe_cambiar_clave: true,
    },
  });
  if (errorCrear || !creado.user) {
    const mensaje = errorCrear?.message ?? '';
    if (/already|registered|exists/i.test(mensaje)) {
      return responder(409, { error: 'Ya existe una cuenta con este correo.' }, origen);
    }
    return responder(400, { error: 'No se pudo crear la cuenta. Revisa el correo y la contraseña.' }, origen);
  }

  // 7) Asignar nombre, teléfono, rol y recinto con UPSERT.
  //    No basta un UPDATE: si handle_new_user no existe, el UPDATE afecta 0 filas y
  //    PostgREST no devuelve error, dejando la cuenta huérfana. El upsert crea la fila
  //    que falte y `.select('id')` verifica que realmente se escribió.
  const { data: perfil, error: errorPerfilNuevo } = await admin
    .from('perfiles')
    .upsert(
      {
        id: creado.user.id,
        nombres,
        apellidos,
        telefono: telefono || null,
        rol,
        recinto_id: recintoId,
        activo: true,
      },
      { onConflict: 'id' },
    )
    .select('id')
    .maybeSingle();
  if (errorPerfilNuevo || !perfil) {
    await admin.auth.admin.deleteUser(creado.user.id);
    return responder(400, { error: 'No se pudo asignar el rol o el recinto. No se creó la cuenta.' }, origen);
  }

  await registrarLimite();

  // 8) Bitácora (migración 005). Si la tabla no existe, no se interrumpe el alta.
  const { error: errorAuditoria } = await admin.from('auditoria').insert({
    actor_id: actorId,
    actor_rol: llamador.rol,
    accion: 'usuario_creado',
    entidad: 'perfiles',
    entidad_id: creado.user.id,
    datos: { correo, rol, recinto_id: recintoId },
  });
  if (errorAuditoria && errorAuditoria.code !== '42P01') {
    console.error('auditoria', errorAuditoria.message);
  }

  return responder(201, { id: creado.user.id, correo }, origen);
});
