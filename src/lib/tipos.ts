// [FE] Tipos alineados 1:1 con aguila_envios_supabase_v2.sql (y con el esquema de referencia).

export type Rol = 'superadmin' | 'admin' | 'recepcion' | 'logistica' | 'chofer' | 'cliente';
export type EstadoGuia = 'enviada_a_logistica' | 'asignada' | 'en_ruta' | 'entregada' | 'incidencia';
export type EstadoViaje = 'programado' | 'en_ruta' | 'finalizado' | 'cancelado';
export type MetodoPago = 'efectivo' | 'qr' | 'transferencia';

export interface Recinto {
  id: string;
  nombre: string;
  departamento: string;
  direccion: string | null;
  activo: boolean;
  created_at: string;
}

export interface Perfil {
  id: string;
  nombres: string;
  apellidos: string | null;
  telefono: string | null;
  rol: Rol;
  recinto_id: string | null;
  activo: boolean;
  created_at: string;
}

export interface Viaje {
  id: string;
  recinto_id: string;
  fecha_viaje: string;
  chofer_id: string | null;
  estado: EstadoViaje;
  creado_por: string | null;
  salida_at: string | null;
  created_at: string;
}

export interface Guia {
  id: string;
  numero: string;
  recinto_id: string;
  cliente_id: string | null;
  remitente: string;
  destinatario: string;
  telefono_destinatario: string | null;
  direccion_entrega: string;
  lat: number | null;
  lng: number | null;
  cantidad_paquetes: number;
  peso_kg: number;
  costo: number;
  pagada: boolean;
  estado: EstadoGuia;
  fecha_recepcion: string;
  viaje_id: string | null;
  orden_parada: number | null;
  entregada_at: string | null;
  // Migración 006: código aleatorio para rastrear sin exponer el número correlativo
  codigo_rastreo?: string | null;
  created_at: string;
}

export interface HistorialItem {
  id: number;
  guia_id: string;
  estado: EstadoGuia;
  usuario_id: string | null;
  fecha: string;
}

export interface Ubicacion {
  chofer_id: string;
  lat: number;
  lng: number;
  actualizado: string;
}

export interface ResumenCliente {
  cliente_id: string;
  total: number;
  en_ruta: number;
  entregadas: number;
}

// Fila de la vista paradas_chofer
export interface Parada {
  viaje_id: string;
  orden_parada: number | null;
  guia_id: string;
  numero: string;
  destinatario: string;
  direccion_entrega: string;
  lat: number | null;
  lng: number | null;
  estado: EstadoGuia;
}

// Respuesta de la función rastrear_guia (ver supabase/migrations/002_rastreo_cliente.sql)
export interface RastreoRespuesta {
  // La RPC devuelve id/destinatario/dirección solo si la guía pertenece al cliente.
  // Para guías sin dueño, `rastrear_guia` entrega únicamente numero, estado y fechas.
  id: string | null;
  numero: string;
  codigo_rastreo?: string | null;
  estado: EstadoGuia;
  destinatario: string | null;
  direccion_entrega: string | null;
  fecha_recepcion: string;
  entregada_at: string | null;
  chofer_id: string | null;
  chofer_nombre: string | null;
}
