// [FE→BE] Sesión de Supabase Auth + perfil (rol, recinto, activo) leído de la tabla `perfiles`.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigurado } from '@/lib/supabase';
import { traducirError } from '@/lib/errores';
import type { Perfil } from '@/lib/tipos';

export interface DatosRegistro {
  nombres: string;
  apellidos: string;
  telefono: string;
  correo: string;
  clave: string;
}

interface AuthValor {
  session: Session | null;
  user: User | null;
  perfil: Perfil | null;
  cargando: boolean;
  error: string | null;
  iniciarSesion: (correo: string, clave: string) => Promise<void>;
  iniciarConGoogle: () => Promise<void>;
  crearCuenta: (datos: DatosRegistro) => Promise<{ requiereConfirmacion: boolean }>;
  recuperarClave: (correo: string) => Promise<void>;
  restablecerClave: (clave: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
  refrescarPerfil: () => Promise<void>;
}

const AuthContext = createContext<AuthValor | undefined>(undefined);

async function leerPerfil(id: string): Promise<Perfil | null> {
  const { data, error } = await supabase.from('perfiles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Perfil | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigurado) {
      setCargando(false);
      return;
    }
    let activo = true;

    const aplicar = async (nueva: Session | null) => {
      if (!activo) return;
      setSession(nueva);
      if (!nueva) {
        setPerfil(null);
        setCargando(false);
        return;
      }
      try {
        let p = await leerPerfil(nueva.user.id);
        if (!activo) return;
        if (!p || !p.activo) {
          setError(p ? 'Tu cuenta está desactivada. Contacta al administrador.' : 'Tu cuenta no tiene perfil asignado. Contacta al administrador.');
          setPerfil(null);
          await supabase.auth.signOut();
        } else {
          // Reparación suave: si el perfil quedó sin apellidos/teléfono (p. ej. el alta
          // ocurrió con confirmación de correo y no había sesión), se recuperan de user_metadata.
          const meta = nueva.user.user_metadata as Record<string, unknown> | undefined;
          const cambios: Partial<Perfil> = {};
          if (!p.apellidos && typeof meta?.apellidos === 'string' && meta.apellidos.trim()) {
            cambios.apellidos = meta.apellidos.trim();
          }
          if (!p.telefono && typeof meta?.telefono === 'string' && meta.telefono.trim()) {
            cambios.telefono = meta.telefono.trim();
          }
          if (Object.keys(cambios).length > 0) {
            const { data } = await supabase
              .from('perfiles')
              .update(cambios)
              .eq('id', nueva.user.id)
              .select('*')
              .maybeSingle();
            if (data) p = data as Perfil;
          }
          setError(null);
          setPerfil(p);
        }
      } catch (e) {
        if (activo) {
          setError(traducirError(e));
          setPerfil(null);
        }
      } finally {
        if (activo) setCargando(false);
      }
    };

    void supabase.auth.getSession().then(({ data }) => aplicar(data.session));
    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      void aplicar(nueva);
    });
    return () => {
      activo = false;
      suscripcion.subscription.unsubscribe();
    };
  }, []);

  const iniciarSesion = useCallback(async (correo: string, clave: string) => {
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
    if (e) throw new Error(traducirError(e));
  }, []);

  const iniciarConGoogle = useCallback(async () => {
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (e) throw new Error(traducirError(e));
  }, []);

  const crearCuenta = useCallback(async (datos: DatosRegistro) => {
    const { data, error: e } = await supabase.auth.signUp({
      email: datos.correo,
      password: datos.clave,
      options: {
        data: {
          full_name: datos.nombres,
          apellidos: datos.apellidos,
          telefono: datos.telefono || null,
        },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    if (e) throw new Error(traducirError(e));
    if (data.session && data.user) {
      const { error: e2 } = await supabase
        .from('perfiles')
        .update({ nombres: datos.nombres, apellidos: datos.apellidos, telefono: datos.telefono || null })
        .eq('id', data.user.id);
      if (e2) throw new Error(traducirError(e2));
    }
    return { requiereConfirmacion: !data.session };
  }, []);

  const recuperarClave = useCallback(async (correo: string) => {
    const { error: e } = await supabase.auth.resetPasswordForEmail(correo, {
      redirectTo: `${window.location.origin}/restablecer-contrasena`,
    });
    if (e) throw new Error(traducirError(e));
  }, []);

  const restablecerClave = useCallback(async (clave: string) => {
    const { error: e } = await supabase.auth.updateUser({ password: clave });
    if (e) throw new Error(traducirError(e));
  }, []);

  const cerrarSesion = useCallback(async () => {
    await supabase.auth.signOut();
    setPerfil(null);
    setSession(null);
  }, []);

  const refrescarPerfil = useCallback(async () => {
    if (!session) return;
    setPerfil(await leerPerfil(session.user.id));
  }, [session]);

  const valor = useMemo<AuthValor>(
    () => ({
      session,
      user: session?.user ?? null,
      perfil,
      cargando,
      error,
      iniciarSesion,
      iniciarConGoogle,
      crearCuenta,
      recuperarClave,
      restablecerClave,
      cerrarSesion,
      refrescarPerfil,
    }),
    [session, perfil, cargando, error, iniciarSesion, iniciarConGoogle, crearCuenta, recuperarClave, restablecerClave, cerrarSesion, refrescarPerfil],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValor {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return contexto;
}
