// [FE→BE] Recinto de trabajo. El personal usa el recinto de su perfil; el superadmin elige uno
// con el selector del menú, porque sus consultas no tienen mi_recinto() en el servidor.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { traducirError } from '@/lib/errores';
import type { Recinto } from '@/lib/tipos';

interface RecintoValor {
  recintoId: string | null;
  recinto: Recinto | null;
  recintos: Recinto[];
  esSuperadmin: boolean;
  cargando: boolean;
  seleccionar: (id: string) => void;
}

const CLAVE_LOCAL = 'ae_recinto';
const SIN_RECINTOS: Recinto[] = [];
const RecintoContext = createContext<RecintoValor | undefined>(undefined);

function leerElegido(): string | null {
  try {
    return localStorage.getItem(CLAVE_LOCAL);
  } catch {
    return null;
  }
}

export function RecintoProvider({ children }: { children: ReactNode }) {
  const { perfil } = useAuth();
  const esSuperadmin = perfil?.rol === 'superadmin';
  const habilitado = Boolean(perfil) && perfil?.rol !== 'cliente';
  const [elegido, setElegido] = useState<string | null>(leerElegido);

  // RLS: el superadmin recibe todos los recintos; el resto solo el suyo
  const consulta = useQuery({
    queryKey: ['recintos', perfil?.id ?? null],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase.from('recintos').select('*').order('nombre');
      if (error) throw new Error(traducirError(error));
      return (data ?? []) as Recinto[];
    },
  });
  const recintos = consulta.data ?? SIN_RECINTOS;

  const recintoId = useMemo(() => {
    if (!perfil) return null;
    if (!esSuperadmin) return perfil.recinto_id;
    if (elegido && recintos.some((r) => r.id === elegido)) return elegido;
    return recintos.find((r) => r.activo)?.id ?? recintos[0]?.id ?? null;
  }, [perfil, esSuperadmin, elegido, recintos]);

  const seleccionar = useCallback((id: string) => {
    setElegido(id);
    try {
      localStorage.setItem(CLAVE_LOCAL, id);
    } catch {
      // Sin almacenamiento local: la selección dura hasta recargar la página
    }
  }, []);

  const valor = useMemo<RecintoValor>(
    () => ({
      recintoId,
      recinto: recintos.find((r) => r.id === recintoId) ?? null,
      recintos,
      esSuperadmin,
      cargando: habilitado && consulta.isPending,
      seleccionar,
    }),
    [recintoId, recintos, esSuperadmin, habilitado, consulta.isPending, seleccionar],
  );

  return <RecintoContext.Provider value={valor}>{children}</RecintoContext.Provider>;
}

export function useRecinto(): RecintoValor {
  const contexto = useContext(RecintoContext);
  if (!contexto) throw new Error('useRecinto debe usarse dentro de RecintoProvider');
  return contexto;
}
