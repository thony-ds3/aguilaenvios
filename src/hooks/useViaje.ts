// [FE→BE] Viajes: consultas, funciones RPC de logística y ruta del chófer, con Realtime en `viajes` y `guias`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useRealtimeInvalidar } from '@/hooks/useRealtime';
import { traducirError } from '@/lib/errores';
import type { Guia, Parada, Perfil, Ubicacion, Viaje } from '@/lib/tipos';

// ---------- Logística ----------

export function useViajes(recintoId: string | null) {
  useRealtimeInvalidar(
    recintoId ? `viajes-recinto-${recintoId}` : null,
    'viajes',
    recintoId ? `recinto_id=eq.${recintoId}` : undefined,
    [['viajes']],
  );
  return useQuery({
    queryKey: ['viajes', 'lista', recintoId],
    enabled: Boolean(recintoId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('viajes')
        .select('*')
        .eq('recinto_id', recintoId as string)
        .order('fecha_viaje', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(traducirError(error));
      return (data ?? []) as Viaje[];
    },
  });
}

export function useCrearViaje() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { recintoId: string; fecha: string }) => {
      const { data, error } = await supabase
        .from('viajes')
        .insert({ recinto_id: v.recintoId, fecha_viaje: v.fecha })
        .select('*')
        .single();
      if (error) throw new Error(traducirError(error));
      return data as Viaje;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['viajes'] }),
  });
}

// Un viaje con Realtime: cambia solo cuando logística lo edita o el chófer cierra la ruta
export function useViaje(viajeId: string | undefined) {
  useRealtimeInvalidar(viajeId ? `viaje-${viajeId}` : null, 'viajes', viajeId ? `id=eq.${viajeId}` : undefined, [['viajes']]);
  // Guías: tanto las del viaje como las nuevas que llegan de recepción (disponibles)
  useRealtimeInvalidar(viajeId ? `viaje-guias-${viajeId}` : null, 'guias', undefined, [['viajes']]);
  return useQuery({
    queryKey: ['viajes', 'detalle', viajeId],
    enabled: Boolean(viajeId),
    queryFn: async () => {
      const { data, error } = await supabase.from('viajes').select('*').eq('id', viajeId as string).maybeSingle();
      if (error) throw new Error(traducirError(error));
      return (data as Viaje | null) ?? null;
    },
  });
}

export function useGuiasDelViaje(viajeId: string | undefined) {
  return useQuery({
    queryKey: ['viajes', 'guias', viajeId],
    enabled: Boolean(viajeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('guias')
        .select('*')
        .eq('viaje_id', viajeId as string)
        .order('orden_parada', { ascending: true });
      if (error) throw new Error(traducirError(error));
      return (data ?? []) as Guia[];
    },
  });
}

// RPC guias_disponibles: recepcionadas como máximo 2 días antes de la fecha del viaje
export function useGuiasDisponibles(viajeId: string | undefined, habilitado: boolean) {
  return useQuery({
    queryKey: ['viajes', 'disponibles', viajeId],
    enabled: Boolean(viajeId) && habilitado,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('guias_disponibles', { p_viaje: viajeId as string });
      if (error) throw new Error(traducirError(error));
      return (data ?? []) as Guia[];
    },
  });
}

export function useAccionesViaje(viajeId: string) {
  const qc = useQueryClient();
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ['viajes'] });
    void qc.invalidateQueries({ queryKey: ['guias'] });
  };

  const agregar = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.rpc('agregar_guias_a_viaje', { p_viaje: viajeId, p_guias: ids });
      if (error) throw new Error(traducirError(error));
      return typeof data === 'number' ? data : 0;
    },
    onSuccess: refrescar,
  });

  const asignarChofer = useMutation({
    mutationFn: async (choferId: string) => {
      const { error } = await supabase.rpc('asignar_chofer', { p_viaje: viajeId, p_chofer: choferId });
      if (error) throw new Error(traducirError(error));
    },
    onSuccess: refrescar,
  });

  const marcarEnRuta = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('marcar_en_ruta', { p_viaje: viajeId });
      if (error) throw new Error(traducirError(error));
    },
    onSuccess: refrescar,
  });

  // RPC reordenar_paradas (migración 003): recibe las guías del viaje en el orden nuevo
  const reordenar = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('reordenar_paradas', { p_viaje: viajeId, p_guias: ids });
      if (error) throw new Error(traducirError(error));
    },
    onSuccess: refrescar,
  });

  return { agregar, asignarChofer, marcarEnRuta, reordenar };
}

// Chóferes del recinto (activos e inactivos; cada pantalla filtra lo que necesita)
export function useChoferes(recintoId: string | null) {
  return useQuery({
    queryKey: ['choferes', recintoId],
    enabled: Boolean(recintoId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('perfiles')
        .select('*')
        .eq('rol', 'chofer')
        .eq('recinto_id', recintoId as string)
        .order('nombres');
      if (error) throw new Error(traducirError(error));
      return (data ?? []) as Perfil[];
    },
  });
}

// Última posición de varios chóferes, en vivo (pantalla "Estado de chóferes")
export function useUbicacionesChoferes(ids: string[]) {
  const firma = ids.join(',');
  useRealtimeInvalidar(ids.length > 0 ? 'ubicaciones-choferes' : null, 'ubicaciones', undefined, [['choferes-ubic']]);
  return useQuery({
    queryKey: ['choferes-ubic', firma],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('ubicaciones').select('*').in('chofer_id', ids);
      if (error) throw new Error(traducirError(error));
      return (data ?? []) as Ubicacion[];
    },
  });
}

// ---------- Chófer ----------

// Viaje del chófer: primero el que está en ruta; si no hay, el próximo programado
export function useViajeDelChofer(choferId: string | null) {
  useRealtimeInvalidar(
    choferId ? `viajes-chofer-${choferId}` : null,
    'viajes',
    choferId ? `chofer_id=eq.${choferId}` : undefined,
    [['viajes']],
  );
  return useQuery({
    queryKey: ['viajes', 'chofer', choferId],
    enabled: Boolean(choferId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('viajes')
        .select('*')
        .eq('chofer_id', choferId as string)
        .in('estado', ['en_ruta', 'programado'])
        .order('fecha_viaje', { ascending: true });
      if (error) throw new Error(traducirError(error));
      const lista = (data ?? []) as Viaje[];
      return lista.find((v) => v.estado === 'en_ruta') ?? lista[0] ?? null;
    },
  });
}

// Paradas en orden (vista paradas_chofer). Se refresca cuando cambia una guía del viaje.
export function useParadas(viajeId: string | null) {
  useRealtimeInvalidar(
    viajeId ? `paradas-${viajeId}` : null,
    'guias',
    viajeId ? `viaje_id=eq.${viajeId}` : undefined,
    [['viajes']],
  );
  return useQuery({
    queryKey: ['viajes', 'paradas', viajeId],
    enabled: Boolean(viajeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('paradas_chofer')
        .select('*')
        .eq('viaje_id', viajeId as string)
        .order('orden_parada', { ascending: true });
      if (error) throw new Error(traducirError(error));
      return (data ?? []) as Parada[];
    },
  });
}

// RPC confirmar_entrega: al confirmar la última parada, la base cierra el viaje
export function useConfirmarEntrega() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (guiaId: string) => {
      const { error } = await supabase.rpc('confirmar_entrega', { p_guia: guiaId });
      if (error) throw new Error(traducirError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['viajes'] }),
  });
}
