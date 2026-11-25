// [FE→BE] Verificación en dos pasos (MFA/TOTP) de Supabase Auth — hallazgo 10.
// El segundo factor lo valida Supabase; aquí solo se inscribe, se verifica y se consulta el nivel (aal1/aal2).
import { useCallback, useEffect, useState } from 'react';
import type { Factor } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { traducirError } from '@/lib/errores';

export interface InscripcionMfa {
  factorId: string;
  qr: string;
  secreto: string;
}

export interface NivelMfa {
  cargando: boolean;
  nivel: 'aal1' | 'aal2' | null;
  // true cuando la cuenta ya tiene un factor verificado pero la sesión sigue en aal1
  requiereVerificacion: boolean;
}

export function useMfa() {
  const [factores, setFactores] = useState<Factor[]>([]);
  const [nivel, setNivel] = useState<'aal1' | 'aal2' | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const [lista, aal] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      if (lista.error) throw lista.error;
      if (aal.error) throw aal.error;
      const totp = (lista.data?.totp ?? []).filter((f) => f.status === 'verified' || f.status === 'unverified');
      setFactores(totp);
      setNivel((aal.data?.currentLevel as 'aal1' | 'aal2' | null) ?? null);
      setError(null);
    } catch (e) {
      setError(traducirError(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void recargar();
    });
    return () => data.subscription.unsubscribe();
  }, [recargar]);

  // Inicia el alta de un autenticador TOTP. Devuelve el QR (data URI) y el secreto para copiarlo.
  const inscribir = useCallback(
    async (nombre: string): Promise<InscripcionMfa> => {
      // Limpia intentos anteriores que quedaron sin verificar para no acumular factores
      for (const factor of factores) {
        if (factor.status === 'unverified') {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }
      const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: nombre });
      if (e || !data) throw new Error(traducirError(e));
      return { factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret };
    },
    [factores],
  );

  // Verifica el código de 6 dígitos. Crea un challenge nuevo justo antes para evitar expiraciones.
  const verificar = useCallback(
    async (factorId: string, codigo: string) => {
      const desafio = await supabase.auth.mfa.challenge({ factorId });
      if (desafio.error || !desafio.data) throw new Error(traducirError(desafio.error));
      const { error: e } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: desafio.data.id,
        code: codigo.replace(/\s/g, ''),
      });
      if (e) throw new Error(traducirError(e));
      await recargar();
    },
    [recargar],
  );

  const eliminar = useCallback(
    async (factorId: string) => {
      const { error: e } = await supabase.auth.mfa.unenroll({ factorId });
      if (e) throw new Error(traducirError(e));
      await recargar();
    },
    [recargar],
  );

  return {
    factores,
    verificados: factores.filter((f) => f.status === 'verified'),
    nivel,
    cargando,
    error,
    recargar,
    inscribir,
    verificar,
    eliminar,
  };
}

// Consulta ligera para las rutas: ¿la sesión necesita elevarse a aal2?
export function useNivelMfa(habilitado: boolean): NivelMfa {
  const [estado, setEstado] = useState<NivelMfa>({ cargando: habilitado, nivel: null, requiereVerificacion: false });

  useEffect(() => {
    if (!habilitado) {
      setEstado({ cargando: false, nivel: null, requiereVerificacion: false });
      return;
    }
    let activo = true;
    const consultar = async () => {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!activo) return;
      setEstado({
        cargando: false,
        nivel: (data?.currentLevel as 'aal1' | 'aal2' | null) ?? null,
        requiereVerificacion: data?.currentLevel === 'aal1' && data?.nextLevel === 'aal2',
      });
    };
    void consultar();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void consultar();
    });
    return () => {
      activo = false;
      data.subscription.unsubscribe();
    };
  }, [habilitado]);

  return estado;
}
