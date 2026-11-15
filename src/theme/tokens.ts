// [FE] Tokens de estado, rol y rutas. Los colores base están en src/index.css (@theme).
import type { EstadoGuia, Rol } from '@/lib/tipos';

export const ESTADO_META: Record<EstadoGuia, { label: string; cls: string }> = {
  enviada_a_logistica: { label: 'Enviada a logística', cls: 'bg-pend-bg text-pend-fg' },
  asignada: { label: 'Asignada', cls: 'bg-soft text-brand' },
  en_ruta: { label: 'En ruta', cls: 'bg-brand text-white' },
  entregada: { label: 'Entregada', cls: 'bg-ok-bg text-ok-fg' },
  incidencia: { label: 'Incidencia', cls: 'bg-red-100 text-red-800' },
};

export const ROL_LABEL: Record<Rol, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin de recinto',
  recepcion: 'Recepción',
  logistica: 'Logística',
  chofer: 'Chófer',
  cliente: 'Cliente',
};

// Ruta inicial tras iniciar sesión, según el rol guardado en `perfiles`
export const RUTA_INICIAL: Record<Rol, string> = {
  cliente: '/cliente/rastreo',
  recepcion: '/recepcion/nueva-guia',
  logistica: '/logistica/viajes',
  chofer: '/chofer/ruta',
  admin: '/admin/usuarios',
  superadmin: '/superadmin/recintos',
};
