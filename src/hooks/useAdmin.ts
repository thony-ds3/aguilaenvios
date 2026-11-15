// [FE→BE] Administración: usuarios (perfiles), alta de cuentas por Edge Function y recintos.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { traducirError } from '@/lib/errores';
import type { Perfil, Rol } from '@/lib/tipos';

// Perfiles de un recinto (admin) o de todo el sistema (superadmin). RLS decide qué filas llegan.
export function useUsuarios(filtro: { recintoId: string | null } | 'todos') {
  const clave = filtro === 'todos' ? 'todos' : filtro.recintoId;
  return useQuery({
    queryKey: ['usuarios', clave],
    enabled: filtro === 'todos' || Boolean(filtro.recintoId),
    queryFn: async () => {
      let consulta = supabase.from('perfiles').select('*');
      if (filtro !== 'todos') consulta = consulta.eq('recinto_id', filtro.recintoId as string);
      const { data, error } = await consulta.order('nombres').limit(1000);
      if (error) throw new Error(traducirError(error));
      return (data ?? []) as Perfil[];
    },
  });
}

// Cambia rol, recinto o estado. El trigger proteger_perfil valida qué puede hacer cada quien.
export function useActualizarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; cambios: Partial<Pick<Perfil, 'rol' | 'recinto_id' | 'activo'>> }) => {
      const { data, error } = await supabase.from('perfiles').update(v.cambios).eq('id', v.id).select('id');
      if (error) throw new Error(traducirError(error));
      // RLS no devuelve error cuando no permite la fila: simplemente no actualiza nada
      if (!data || data.length === 0) throw new Error('No tienes permiso para modificar a este usuario.');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['usuarios'] });
      void qc.invalidateQueries({ queryKey: ['choferes'] });
    },
  });
}

export interface NuevoUsuario {
  nombres: string;
  apellidos: string;
  telefono: string;
  correo: string;
  clave: string;
  rol: Rol;
  recinto_id: string | null;
}

async function mensajeDeFuncion(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const respuesta = error.context as Response;
    if (respuesta.status === 404) return 'La función crear-usuario todavía no está desplegada en Supabase.';
    try {
      const cuerpo = (await respuesta.json()) as { error?: string };
      if (cuerpo.error) return cuerpo.error;
    } catch {
      // La respuesta no era JSON: se usa el mensaje genérico
    }
    return 'El servidor rechazó la solicitud. Inténtalo de nuevo.';
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return 'No se pudo conectar con la función crear-usuario. Verifica que esté desplegada en Supabase.';
  }
  return traducirError(error);
}

// Alta de usuario: la crea la Edge Function crear-usuario (la clave secreta vive solo en el servidor)
export function useCrearUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (usuario: NuevoUsuario) => {
      const { data, error } = await supabase.functions.invoke('crear-usuario', { body: usuario });
      if (error) throw new Error(await mensajeDeFuncion(error));
      return data as { id: string; correo: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['usuarios'] });
      void qc.invalidateQueries({ queryKey: ['choferes'] });
    },
  });
}

export interface DatosRecinto {
  id?: string;
  nombre: string;
  departamento: string;
  direccion: string | null;
  activo: boolean;
}

// Crear o editar un recinto (RLS: solo superadmin)
export function useGuardarRecinto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: DatosRecinto) => {
      const datos = { nombre: r.nombre, departamento: r.departamento, direccion: r.direccion, activo: r.activo };
      if (r.id) {
        const { data, error } = await supabase.from('recintos').update(datos).eq('id', r.id).select('id');
        if (error) throw new Error(traducirError(error));
        if (!data || data.length === 0) throw new Error('No tienes permiso para editar recintos.');
      } else {
        const { error } = await supabase.from('recintos').insert(datos);
        if (error) throw new Error(traducirError(error));
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recintos'] }),
  });
}
