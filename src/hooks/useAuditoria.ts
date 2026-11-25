// [FE→BE] Bitácora de acciones administrativas (hallazgo 11). La escribe la base con triggers
// (migración 005) y solo el superadmin puede leerla por RLS.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { traducirError } from '@/lib/errores';

export interface AuditoriaItem {
  id: number;
  actor_id: string | null;
  actor_rol: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  datos: Record<string, unknown> | null;
  creado_en: string;
}

export function useAuditoria() {
  return useQuery({
    queryKey: ['auditoria'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auditoria')
        .select('id,actor_id,actor_rol,accion,entidad,entidad_id,datos,creado_en')
        .order('creado_en', { ascending: false })
        .limit(300);
      if (error) throw new Error(traducirError(error));
      return (data ?? []) as AuditoriaItem[];
    },
  });
}
