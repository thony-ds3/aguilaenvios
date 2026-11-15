// [FE→BE] Guías: consultas y mutaciones con React Query + Realtime sobre la tabla `guias`.
// Lo usan recepción (guías del día, cobro), logística (recibidas) y admin (envíos del recinto).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeInvalidar } from '@/hooks/useRealtime';
import { traducirError } from '@/lib/errores';
import { hoyISO } from '@/lib/validacion';
import type { EstadoGuia, Guia, MetodoPago, Perfil } from '@/lib/tipos';

export type FiltroGuias =
  | { tipo: 'hoy' }
  | { tipo: 'pendientes-cobro' }
  | { tipo: 'recibidas' }
  | { tipo: 'estado'; estado: EstadoGuia | 'todas' };

// Lista de guías de un recinto. Se actualiza sola cuando cambia cualquier guía del recinto.
export function useGuias(recintoId: string | null, filtro: FiltroGuias) {
  useRealtimeInvalidar(
    recintoId ? `guias-recinto-${recintoId}` : null,
    'guias',
    recintoId ? `recinto_id=eq.${recintoId}` : undefined,
    [['guias'], ['viajes']],
  );

  return useQuery({
    queryKey: ['guias', recintoId, filtro],
    enabled: Boolean(recintoId),
    queryFn: async () => {
      let consulta = supabase.from('guias').select('*').eq('recinto_id', recintoId as string);
      if (filtro.tipo === 'hoy') consulta = consulta.eq('fecha_recepcion', hoyISO());
      if (filtro.tipo === 'pendientes-cobro') consulta = consulta.eq('pagada', false).gt('costo', 0);
      if (filtro.tipo === 'recibidas') consulta = consulta.eq('estado', 'enviada_a_logistica');
      if (filtro.tipo === 'estado' && filtro.estado !== 'todas') consulta = consulta.eq('estado', filtro.estado);
      const { data, error } = await consulta.order('created_at', { ascending: false }).limit(300);
      if (error) throw new Error(traducirError(error));
      return (data ?? []) as Guia[];
    },
  });
}

// Búsqueda opcional de cliente por nombre, apellido o teléfono (RLS: recepción ve los perfiles de clientes)
export function useBuscarClientes(texto: string) {
  const limpio = texto.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ]/g, '').trim();
  return useQuery({
    queryKey: ['clientes', limpio],
    enabled: limpio.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('perfiles')
        .select('*')
        .eq('rol', 'cliente')
        .eq('activo', true)
        .or(`nombres.ilike.%${limpio}%,apellidos.ilike.%${limpio}%,telefono.ilike.%${limpio}%`)
        .order('nombres')
        .limit(8);
      if (error) throw new Error(traducirError(error));
      return (data ?? []) as Perfil[];
    },
  });
}

export interface NuevaGuia {
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
}

// INSERT en guias. El número (AE-000000), el estado inicial y el historial los pone la base.
export function useCrearGuia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (guia: NuevaGuia) => {
      const { data, error } = await supabase.from('guias').insert(guia).select('*').single();
      if (error) throw new Error(traducirError(error));
      return data as Guia;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guias'] }),
  });
}

// INSERT en pagos. El trigger pago_registrado marca la guía como pagada (la app no escribe `pagada`).
export function useRegistrarPago() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pago: { guiaId: string; monto: number; metodo: MetodoPago }) => {
      if (!user) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
      const { error } = await supabase
        .from('pagos')
        .insert({ guia_id: pago.guiaId, monto: pago.monto, metodo: pago.metodo, cobrado_por: user.id });
      if (error) throw new Error(traducirError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guias'] }),
  });
}
