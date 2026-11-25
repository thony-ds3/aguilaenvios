// [FE] Política de contraseñas (hallazgo 10 de la auditoría).
// Se aplica en el navegador y la Edge Function crear-usuario la vuelve a aplicar en el servidor.
// Nota: Supabase Auth limita la longitud a 72 bytes; la verificación de contraseñas filtradas
// (HaveIBeenPwned) es una función del plan Pro que se activa en el panel, no en el código.
export const CLAVE_MIN = 10;
export const CLAVE_MAX = 72;

// Las contraseñas más usadas en español y en el propio proyecto. Se rechazan sin distinguir mayúsculas.
const COMUNES = new Set([
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

export interface RevisionClave {
  valida: boolean;
  mensaje: string | null;
}

// Devuelve el primer problema encontrado, con un mensaje listo para mostrar al usuario.
export function revisarClave(valor: string): RevisionClave {
  const clave = valor.trim();
  if (clave.length < CLAVE_MIN) {
    return { valida: false, mensaje: `La contraseña debe tener al menos ${CLAVE_MIN} caracteres.` };
  }
  if (clave.length > CLAVE_MAX) {
    return { valida: false, mensaje: `La contraseña no puede superar ${CLAVE_MAX} caracteres.` };
  }
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(clave) || !/\d/.test(clave)) {
    return { valida: false, mensaje: 'La contraseña debe combinar letras y números.' };
  }
  if (COMUNES.has(clave.toLowerCase())) {
    return { valida: false, mensaje: 'Esa contraseña es demasiado común. Elige una distinta.' };
  }
  if (/(.)\1{3,}/.test(clave)) {
    return { valida: false, mensaje: 'La contraseña no puede repetir el mismo carácter cuatro veces seguidas.' };
  }
  if (/^(?:1234|abcd|qwer|asdf|ae-?\d)/i.test(clave)) {
    return { valida: false, mensaje: 'La contraseña no puede empezar con una secuencia predecible.' };
  }
  return { valida: true, mensaje: null };
}

// Nivel orientativo (0 a 3) para la barra de fuerza de la interfaz.
export function nivelClave(valor: string): 0 | 1 | 2 | 3 {
  const clave = valor.trim();
  if (clave.length === 0) return 0;
  let puntos = 0;
  if (clave.length >= CLAVE_MIN) puntos += 1;
  if (clave.length >= 14) puntos += 1;
  if (/[A-ZÁÉÍÓÚÜÑ]/.test(clave) && /[a-záéíóúüñ]/.test(clave)) puntos += 1;
  if (/\d/.test(clave) && /[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/.test(clave)) puntos += 1;
  return Math.min(3, puntos) as 0 | 1 | 2 | 3;
}
