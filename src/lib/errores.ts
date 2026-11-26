// [FE] Traduce errores de Supabase Auth, PostgREST, dominios de la base y funciones RPC a mensajes en español.
// El orden importa: primero los mensajes específicos y al final los genéricos.

const MAPA: Array<[string, string]> = [
  // Autenticación
  ['Invalid login credentials', 'Correo o contraseña incorrectos.'],
  ['Email not confirmed', 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.'],
  ['already registered', 'Ya existe una cuenta con este correo.'],
  ['already been registered', 'Ya existe una cuenta con este correo.'],
  ['Password should be at least', 'La contraseña debe tener al menos 10 caracteres.'],
  ['rate limit', 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'],
  ['demasiados usuarios', 'Has creado demasiados usuarios en la última hora. Intenta más tarde.'],
  ['Origen no autorizado', 'El dominio desde el que intentas crear usuarios no está autorizado.'],
  ['For security purposes', 'Por seguridad, espera unos segundos antes de volver a intentarlo.'],
  ['Unable to validate email address', 'El correo no tiene un formato válido.'],
  ['Auth session missing', 'Tu sesión expiró. Vuelve a iniciar sesión.'],
  ['JWT expired', 'Tu sesión expiró. Vuelve a iniciar sesión.'],

  // Migraciones pendientes
  ['Could not find the function', 'Falta ejecutar una migración en Supabase: la función que usa esta pantalla todavía no existe.'],

  // Reglas de validación de la base (dominios y restricciones)
  ['d_letras', 'Los nombres solo pueden tener letras, tildes, ñ y espacios (máximo 60 caracteres).'],
  ['d_telefono', 'El teléfono debe tener entre 7 y 15 números, sin espacios ni signos.'],
  ['d_entero_pos', 'La cantidad debe ser un número entero mayor que cero.'],
  ['d_positivo', 'El peso y el monto deben ser mayores que cero.'],
  ['d_monto', 'El costo no puede ser negativo.'],
  ['recintos_nombre_key', 'Ya existe un recinto con ese nombre.'],
  ['pagos_guia_id_key', 'Esta guía ya tiene un pago registrado.'],
  ['perfiles_check', 'El personal de un recinto debe tener un recinto asignado.'],

  // Funciones de negocio
  ['Guía no encontrada o ya vinculada', 'Esa guía no existe o ya está vinculada a otra cuenta.'],
  ['Guía no encontrada', 'No encontramos una guía con ese número y fecha.'],
  ['Código de rastreo no encontrado', 'No encontramos una guía con ese código. Revísalo e inténtalo de nuevo.'],
  ['Solo clientes', 'Esta acción es solo para clientes.'],
  ['Sin permiso para cambiar rol', 'No tienes permiso para cambiar el rol, el recinto o el estado de este usuario.'],

  // Genéricos
  ['row-level security', 'No tienes permiso para realizar esta acción.'],
  ['permission denied', 'No tienes permiso para realizar esta acción.'],
  ['Sin permiso', 'No tienes permiso para realizar esta acción.'],
  ['foreign key', 'No se puede completar la acción porque hay registros relacionados.'],
  ['check constraint', 'Uno de los datos no es válido. Revísalo e inténtalo de nuevo.'],
  ['violates check', 'Uno de los datos no es válido. Revísalo e inténtalo de nuevo.'],
  ['duplicate key', 'Ya existe un registro con ese dato.'],
  ['Failed to fetch', 'Sin conexión con el servidor. Revisa tu internet.'],
  ['NetworkError', 'Sin conexión con el servidor. Revisa tu internet.'],
];

// Códigos de Supabase Auth. Tienen prioridad sobre el texto porque el mensaje
// en inglés cambia entre versiones y no siempre explica qué hacer.
const MAPA_CODIGOS: Record<string, string> = {
  over_email_send_rate_limit:
    'Se alcanzó el límite de correos de Supabase: con el servidor integrado solo se envían 2 por hora. Configura un SMTP propio en el panel de Supabase (Authentication > Emails > SMTP Settings) o espera una hora.',
  email_address_not_authorized:
    'El servidor de correo integrado de Supabase solo envía a las direcciones del equipo del proyecto. Para enviar a cualquier correo, configura un SMTP propio en el panel de Supabase.',
  over_request_rate_limit: 'Demasiadas solicitudes en poco tiempo. Espera unos minutos e inténtalo de nuevo.',
  signup_disabled: 'El registro público está desactivado en Supabase. Pide al administrador que lo habilite.',
  email_exists: 'Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.',
  user_already_exists: 'Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.',
  email_not_confirmed: 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada y la carpeta de spam.',
  invalid_credentials: 'Correo o contraseña incorrectos.',
  weak_password: 'La contraseña no cumple la política de seguridad: mínimo 10 caracteres, con letras y números.',
  same_password: 'La contraseña nueva debe ser distinta de la anterior.',
  otp_expired: 'El enlace ya expiró o fue usado. Solicita uno nuevo.',
  flow_state_not_found: 'El enlace ya expiró o fue usado. Solicita uno nuevo.',
  flow_state_expired: 'El enlace ya expiró o fue usado. Solicita uno nuevo.',
  session_not_found: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  refresh_token_not_found: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  validation_failed: 'Revisa los datos: hay un campo con formato inválido.',
};

function leerCodigo(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const codigo = (error as { code: unknown }).code;
    if (typeof codigo === 'string' && codigo) return codigo;
  }
  return null;
}

function leerEstado(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const estado = (error as { status: unknown }).status;
    if (typeof estado === 'number') return estado;
  }
  return null;
}

export function traducirError(error: unknown): string {
  let texto = '';
  if (error instanceof Error) texto = error.message;
  else if (typeof error === 'object' && error !== null && 'message' in error) {
    texto = String((error as { message: unknown }).message);
  }

  const codigo = leerCodigo(error);
  if (codigo && MAPA_CODIGOS[codigo]) return MAPA_CODIGOS[codigo];

  const encontrado = MAPA.find(([clave]) => texto.includes(clave));
  if (encontrado) return encontrado[1];

  // 429 sin código conocido: límite de peticiones de Supabase.
  if (leerEstado(error) === 429) {
    return 'Demasiadas solicitudes en poco tiempo. Espera unos minutos e inténtalo de nuevo.';
  }

  // Mensajes ya escritos en español (excepciones de la base: "Asigna un chófer primero", etc.)
  if (texto && /[áéíóúñ¿¡]|\b(el|los|las|para|ya|solo|debe|viaje|primero)\b/i.test(texto)) return texto;
  return 'Ocurrió un problema inesperado. Inténtalo de nuevo.';
}
