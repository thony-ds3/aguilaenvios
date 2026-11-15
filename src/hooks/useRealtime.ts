// [FE→BE] Suscripción Realtime reutilizable: cuando cambia una tabla, refresca las consultas indicadas.
// RLS también se aplica a Realtime: cada usuario solo recibe los cambios de las filas que puede ver.
import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

type TablaEnVivo = 'guias' | 'viajes' | 'ubicaciones';

export function useRealtimeInvalidar(
  canal: string | null,
  tabla: TablaEnVivo,
  filtro: string | undefined,
  claves: QueryKey[],
) {
  const qc = useQueryClient();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ref = useRef(claves);
  useEffect(() => {
    ref.current = claves;
  });

  useEffect(() => {
    if (!canal) return;
    const config = filtro
      ? { event: '*' as const, schema: 'public', table: tabla, filter: filtro }
      : { event: '*' as const, schema: 'public', table: tabla };
    const suscripcion = supabase
      .channel(`${canal}-${id}`)
      .on('postgres_changes', config, () => {
        for (const clave of ref.current) void qc.invalidateQueries({ queryKey: clave });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(suscripcion);
    };
  }, [canal, tabla, filtro, id, qc]);
}

// Reloj que fuerza un render cada `ms` (para textos como "hace 12 s")
export function useAhora(ms = 1000): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return ahora;
}
