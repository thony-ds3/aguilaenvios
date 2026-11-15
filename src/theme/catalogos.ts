// [FE] Catálogos de la aplicación: estados de viaje, métodos de pago, departamentos y roles asignables
import type { EstadoGuia, EstadoViaje, MetodoPago, Rol } from '@/lib/tipos';

export type Tono = 'ok' | 'pend' | 'marca' | 'alerta';

export const VIAJE_META: Record<EstadoViaje, { label: string; tono: Tono }> = {
  programado: { label: 'Programado', tono: 'pend' },
  en_ruta: { label: 'En ruta', tono: 'marca' },
  finalizado: { label: 'Finalizado', tono: 'ok' },
  cancelado: { label: 'Cancelado', tono: 'alerta' },
};

export const METODOS_PAGO: { valor: MetodoPago; label: string }[] = [
  { valor: 'efectivo', label: 'Efectivo' },
  { valor: 'qr', label: 'QR' },
  { valor: 'transferencia', label: 'Transferencia' },
];

export const ESTADOS_GUIA: EstadoGuia[] = ['enviada_a_logistica', 'asignada', 'en_ruta', 'entregada', 'incidencia'];

// Departamentos de Bolivia (la columna recintos.departamento solo admite letras)
export const DEPARTAMENTOS = ['Beni', 'Chuquisaca', 'Cochabamba', 'La Paz', 'Oruro', 'Pando', 'Potosí', 'Santa Cruz', 'Tarija'];

// Roles que un admin de recinto puede asignar (lo valida el trigger proteger_perfil)
export const ROLES_ADMIN: Rol[] = ['recepcion', 'logistica', 'chofer', 'cliente'];
// Roles que el superadmin puede asignar al CREAR una cuenta (superadmin se asigna solo editando)
export const ROLES_ALTA_SUPERADMIN: Rol[] = ['admin', 'recepcion', 'logistica', 'chofer', 'cliente'];
export const ROLES_TODOS: Rol[] = ['superadmin', 'admin', 'recepcion', 'logistica', 'chofer', 'cliente'];

// El personal de un recinto siempre pertenece a uno (check de la tabla perfiles)
export const rolRequiereRecinto = (rol: Rol): boolean => rol !== 'cliente' && rol !== 'superadmin';
