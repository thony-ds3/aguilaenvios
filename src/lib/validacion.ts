// [FE] Reglas de validación. Se aplican al ESCRIBIR (filtros que bloquean caracteres)
// y al ENVIAR (esquemas zod con mensajes en español). La base de datos vuelve a validar.
import { z } from 'zod';

const LETRAS = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
export const RE_NOMBRE = new RegExp(`^[${LETRAS}]+(?: [${LETRAS}]+)*$`);
// Bloquea la misma vocal dos veces seguida (aa, ee, ii, oo, uu, con o sin tilde)
export const RE_VOCAL_REPETIDA = /([aeiouáéíóúü])\1/i;
const RE_GUIA = /^AE-\d{6}$/;
const RE_TELEFONO = /^\d{7,15}$/;

export const hoyISO = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });

// ---------- Filtros al escribir (devuelven el valor que se muestra) ----------

// Solo letras, tildes, ñ y espacios entre palabras; sin vocales repetidas; máximo 60
export function filtrarNombre(anterior: string, nuevo: string): string {
  const limpio = nuevo
    .replace(new RegExp(`[^${LETRAS} ]`, 'g'), '')
    .replace(/^ +/, '')
    .replace(/ {2,}/g, ' ');
  if (limpio.length > 60 || RE_VOCAL_REPETIDA.test(limpio)) return anterior;
  return limpio;
}

// Solo dígitos (teléfono, cantidades); sin signo menos, sin "e", sin letras
export function filtrarDigitos(_anterior: string, nuevo: string, max = 15): string {
  return nuevo.replace(/\D/g, '').slice(0, max);
}

// Entero positivo (cantidad de paquetes)
export function filtrarEntero(_anterior: string, nuevo: string): string {
  return nuevo.replace(/\D/g, '').slice(0, 4);
}

// Decimal no negativo (peso, costo): solo dígitos y un punto con máximo 2 decimales
export function filtrarDecimal(anterior: string, nuevo: string): string {
  if (nuevo === '') return '';
  return /^\d{0,9}(\.\d{0,2})?$/.test(nuevo) ? nuevo : anterior;
}

// Número de guía: mayúsculas, letras, dígitos y guion
export function filtrarGuia(_anterior: string, nuevo: string): string {
  return nuevo.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9);
}

// ---------- Esquemas zod (validación al enviar) ----------

export function campoNombre(etiqueta: string) {
  return z
    .string()
    .trim()
    .min(2, `${etiqueta} debe tener al menos 2 letras.`)
    .max(60, `${etiqueta} no puede superar 60 caracteres.`)
    .superRefine((valor, ctx) => {
      if (!RE_NOMBRE.test(valor)) {
        ctx.addIssue({ code: 'custom', message: `${etiqueta} solo puede tener letras, tildes, ñ y espacios.` });
      } else if (RE_VOCAL_REPETIDA.test(valor)) {
        ctx.addIssue({ code: 'custom', message: `${etiqueta} no puede tener vocales repetidas seguidas (por ejemplo "aa").` });
      }
    });
}

export const correoSchema = z
  .string()
  .trim()
  .min(1, 'Ingresa tu correo electrónico.')
  .email('El correo no tiene un formato válido.');

export const claveSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(72, 'La contraseña no puede superar 72 caracteres.');

export const telefonoSchema = z
  .string()
  .trim()
  .regex(RE_TELEFONO, 'El teléfono debe tener entre 7 y 15 números, sin espacios ni signos.');

export const telefonoOpcionalSchema = z
  .string()
  .trim()
  .refine((valor) => valor === '' || RE_TELEFONO.test(valor), {
    message: 'El teléfono debe tener entre 7 y 15 números, sin espacios ni signos.',
  });

export const numeroGuiaSchema = z
  .string()
  .trim()
  .regex(RE_GUIA, 'Usa el formato AE-000000 (6 números después de AE-).');

export const fechaSchema = z
  .string()
  .min(1, 'Selecciona la fecha de exportación de la guía.')
  .refine((valor) => valor <= hoyISO(), 'La fecha no puede ser futura.');

export const direccionSchema = z
  .string()
  .trim()
  .min(5, 'Escribe la dirección de entrega (mínimo 5 caracteres).')
  .max(200, 'La dirección no puede superar 200 caracteres.');

// ---------- Números escritos en campos de texto filtrados (nunca negativos) ----------

// Entero mayor que cero (cantidad de paquetes)
export function enteroPositivo(etiqueta: string) {
  return z
    .string()
    .trim()
    .min(1, 'Este campo es obligatorio.')
    .regex(/^\d+$/, `${etiqueta} debe ser un número entero, sin signos ni letras.`)
    .refine((v) => !(Number(v) < 1), `${etiqueta} debe ser al menos 1.`);
}

// Decimal mayor que cero, hasta 2 decimales (peso)
export function decimalPositivo(etiqueta: string) {
  return z
    .string()
    .trim()
    .min(1, 'Este campo es obligatorio.')
    .regex(/^\d+(\.\d{1,2})?$/, `${etiqueta} debe ser un número positivo con hasta 2 decimales.`)
    .refine((v) => !(Number(v) <= 0), `${etiqueta} debe ser mayor que cero.`)
    .refine((v) => !(Number(v) > 99999999.99), `${etiqueta} es demasiado grande.`);
}

// Decimal mayor o igual a cero, hasta 2 decimales (costo)
export function decimalNoNegativo(etiqueta: string) {
  return z
    .string()
    .trim()
    .min(1, 'Este campo es obligatorio.')
    .regex(/^\d+(\.\d{1,2})?$/, `${etiqueta} debe ser un número (no negativo) con hasta 2 decimales.`)
    .refine((v) => !(Number(v) > 99999999.99), `${etiqueta} es demasiado grande.`);
}
