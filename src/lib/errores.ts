// [FE] Traduce errores de Supabase Auth, PostgREST, dominios de la base y funciones RPC a mensajes en español.
// El orden importa: primero los mensajes específicos y al final los genéricos.

const MAPA: Array<[string, string]> = [
  // Autenticación
  ['Invalid login credentials', 'Correo o contraseña incorrectos.'],
  ['Email not confirmed', 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.'],
  ['already registered', 'Ya existe una cuenta con este correo.'],
  ['already been registered', 'Ya existe una cuenta con este correo.'],
  ['Password should be at least', 'La contraseña debe tener al menos 8 caracteres.'],
  ['rate limit', 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'],
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

export function traducirError(error: unknown): string {
  let texto = '';
  if (error instanceof Error) texto = error.message;
  else if (typeof error === 'object' && error !== null && 'message' in error) {
    texto = String((error as { message: unknown }).message);
  }
  const encontrado = MAPA.find(([clave]) => texto.includes(clave));
  if (encontrado) return encontrado[1];
  // Mensajes ya escritos en español (excepciones de la base: "Asigna un chófer primero", etc.)
  if (texto && /[áéíóúñ¿¡]|\b(el|los|las|para|ya|solo|debe|viaje|primero)\b/i.test(texto)) return texto;
  return 'Ocurrió un problema inesperado. Inténtalo de nuevo.';
}
