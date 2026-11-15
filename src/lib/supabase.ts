// [FE→BE] Cliente de Supabase. Usa solo la URL y la clave PÚBLICA (anon o publishable).
import { createClient } from '@supabase/supabase-js';

const url: string = import.meta.env.VITE_SUPABASE_URL ?? '';
const clave: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

// Protección: si por error se pegó una clave secreta (service_role), la app no arranca.
function esClaveSecreta(valor: string): boolean {
  if (valor.startsWith('sb_secret_')) return true;
  try {
    const payload = JSON.parse(atob(valor.split('.')[1] ?? '')) as { role?: string };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

export const supabaseConfigurado =
  Boolean(url) && Boolean(clave) && !url.includes('TU-PROYECTO') && !esClaveSecreta(clave);

export const supabase = createClient(
  supabaseConfigurado ? url : 'https://placeholder.supabase.co',
  supabaseConfigurado ? clave : 'placeholder',
  {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  },
);
