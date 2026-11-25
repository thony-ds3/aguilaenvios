// [FE→BE] Consultas y acciones del cliente. RLS limita cada fila a las guías del propio cliente.
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { traducirError } from '@/lib/errores';
import { RE_CODIGO_RASTREO } from '@/lib/validacion';
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

// Agrega una guía a "Mis envíos" SOLO con el código secreto (migración 006/007).
// El número correlativo ya no sirve para vincular: era adivinable y permitía reclamar guías ajenas.
export function useVincularGuia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (consulta: string) => {
      const valor = consulta.trim().toUpperCase();
      if (!RE_CODIGO_RASTREO.test(valor)) {
        throw new Error('Necesitas el código de rastreo de 12 caracteres. Pídelo en recepción.');
      }
      const { error } = await supabase.rpc('vincular_guia_codigo', { p_codigo: valor });
      if (error) throw new Error(traducirError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cliente'] }),
  });
}

// Rastreo por número de guía + fecha (RPC rastrear_guia, migración 002) o por código
// aleatorio de 12 caracteres (RPC rastrear_guia_codigo, migración 006).
// Hallazgo 16: el código no es enumerable y no vincula la guía automáticamente.
export function useRastrearGuia() {
  return useMutation({
    mutationFn: async (v: { numero?: string; consulta?: string; fecha?: string }) => {
      const consulta = (v.consulta ?? v.numero ?? '').trim().toUpperCase();
      if (!consulta) throw new Error('Escribe el número de guía o el código de rastreo.');
      if (RE_CODIGO_RASTREO.test(consulta)) {
        const { data, error } = await supabase.rpc('rastrear_guia_codigo', { p_codigo: consulta });
        if (error) throw new Error(traducirError(error));
        return data as RastreoRespuesta;
      }
      if (!v.fecha) throw new Error('Selecciona la fecha de exportación.');
      const { data, error } = await supabase.rpc('rastrear_guia', { p_numero: consulta, p_fecha: v.fecha });
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
