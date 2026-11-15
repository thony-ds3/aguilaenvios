// [FE→BE] Consultas y acciones del cliente. RLS limita cada fila a las guías del propio cliente.
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { traducirError } from '@/lib/errores';
import type { Guia, HistorialItem, RastreoRespuesta, ResumenCliente } from '@/lib/tipos';

// Lista "Mis envíos" (se refresca sola cuando cambia alguna guía del cliente)
export function useMisGuias() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id;

  useEffect(() => {
    if (!uid) return;
    const canal = supabase
      .channel(`mis-guias-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guias', filter: `cliente_id=eq.${uid}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['cliente'] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [uid, qc]);

  return useQuery({
    queryKey: ['cliente', 'guias', uid],
    enabled: Boolean(uid),
    queryFn: async () => {
      // Filtro explícito: sin él, un superadmin que abre esta vista recibiría todas las guías
      const { data, error } = await supabase
        .from('guias')
        .select('*')
        .eq('cliente_id', uid as string)
        .order('created_at', { ascending: false });
      if (error) throw new Error(traducirError(error));
      return (data ?? []) as Guia[];
    },
  });
}

// Tarjetas de resumen: total, en ruta y entregadas (vista resumen_cliente)
export function useResumenCliente() {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: ['cliente', 'resumen', uid],
    enabled: Boolean(uid),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resumen_cliente')
        .select('cliente_id,total,en_ruta,entregadas')
        .eq('cliente_id', uid as string)
        .maybeSingle();
      if (error) throw new Error(traducirError(error));
      return (data as ResumenCliente | null) ?? { cliente_id: uid ?? '', total: 0, en_ruta: 0, entregadas: 0 };
    },
  });
}

export function useGuia(id: string | undefined) {
  return useQuery({
    queryKey: ['cliente', 'guia', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('guias').select('*').eq('id', id as string).maybeSingle();
      if (error) throw new Error(traducirError(error));
      return (data as Guia | null) ?? null;
    },
  });
}

// Línea de tiempo de estados (la escribe un trigger; la app solo lee)
export function useHistorial(guiaId: string | undefined) {
  return useQuery({
    queryKey: ['cliente', 'historial', guiaId],
    enabled: Boolean(guiaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('historial')
        .select('*')
        .eq('guia_id', guiaId as string)
        .order('fecha', { ascending: true });
      if (error) throw new Error(traducirError(error));
      return (data ?? []) as HistorialItem[];
    },
  });
}

// Agrega una guía a "Mis envíos" con su número (RPC vincular_guia)
export function useVincularGuia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (numero: string) => {
      const { error } = await supabase.rpc('vincular_guia', { p_numero: numero });
      if (error) throw new Error(traducirError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cliente'] }),
  });
}

// Rastreo por número de guía + fecha de exportación (RPC rastrear_guia, ver migración 002)
export function useRastrearGuia() {
  return useMutation({
    mutationFn: async (v: { numero: string; fecha: string }) => {
      const { data, error } = await supabase.rpc('rastrear_guia', { p_numero: v.numero, p_fecha: v.fecha });
      if (error) throw new Error(traducirError(error));
      return data as RastreoRespuesta;
    },
  });
}

// Actualiza nombres, apellidos y teléfono del propio perfil (RLS: solo id = auth.uid())
export function useActualizarPerfil() {
  const { user, refrescarPerfil } = useAuth();
  return useMutation({
    mutationFn: async (v: { nombres: string; apellidos: string; telefono: string }) => {
      if (!user) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
      const { error } = await supabase
        .from('perfiles')
        .update({ nombres: v.nombres, apellidos: v.apellidos, telefono: v.telefono || null })
        .eq('id', user.id);
      if (error) throw new Error(traducirError(error));
      await refrescarPerfil();
    },
  });
}
