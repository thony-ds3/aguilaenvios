// [FE→BE] Tiempo real para el rastreo: ubicación del chófer (ubicaciones) y estado de la guía (guias).
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Ubicacion } from '@/lib/tipos';

// Última posición del chófer. Se actualiza por Realtime cada vez que el chófer escribe en `ubicaciones`.
// RLS (cliente_ve_chofer) solo permite leerla mientras la guía del cliente está en ruta.
export function useUbicacionEnVivo(choferId: string | null) {
  const qc = useQueryClient();

  const consulta = useQuery({
    queryKey: ['ubicacion', choferId],
    enabled: Boolean(choferId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ubicaciones')
        .select('*')
        .eq('chofer_id', choferId as string)
        .maybeSingle();
      if (error) throw new Error('No se pudo obtener la ubicación del chófer.');
      return (data as Ubicacion | null) ?? null;
    },
  });

  useEffect(() => {
    if (!choferId) return;
    const canal = supabase
      .channel(`ubicacion-${choferId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ubicaciones', filter: `chofer_id=eq.${choferId}` },
        (payload) => {
          const nueva = payload.new as Partial<Ubicacion>;
          if (typeof nueva.lat === 'number' && typeof nueva.lng === 'number') {
            qc.setQueryData(['ubicacion', choferId], nueva as Ubicacion);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [choferId, qc]);

  return consulta;
}

// Escucha cambios de estado de una guía (por número) y ejecuta onCambio para refrescar la vista
export function useCanalGuia(numero: string | null, onCambio: () => void) {
  const ref = useRef(onCambio);
  useEffect(() => {
    ref.current = onCambio;
  });

  useEffect(() => {
    if (!numero) return;
    const canal = supabase
      .channel(`guia-${numero}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'guias', filter: `numero=eq.${numero}` },
        () => ref.current(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [numero]);
}
