// [FE] Protección de rutas por rol. Oculta pantallas por comodidad; la seguridad real está en RLS (servidor).
// Además: exige cambiar la contraseña temporal y, si la cuenta usa MFA, eleva la sesión a aal2.
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useNivelMfa } from '@/hooks/useMfa';
import { RUTA_INICIAL } from '@/theme/tokens';
import type { Rol } from '@/lib/tipos';
import { Cargando } from '@/components/ui';

export function PantallaCarga() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-white p-6">
      <div className="w-full max-w-sm">
        <Cargando mensaje="Verificando tu sesión…" />
      </div>
    </div>
  );
}

export function RutaProtegida({
  roles,
  children,
  omitirMfa = false,
  omitirClaveForzada = false,
}: {
  roles: Rol[];
  children: ReactNode;
  // /seguridad y /cambiar-clave no pueden exigirse a sí mismas
  omitirMfa?: boolean;
  omitirClaveForzada?: boolean;
}) {
  const { session, user, perfil, cargando } = useAuth();
  const ubicacion = useLocation();
  const esAdministrativo = perfil?.rol === 'admin' || perfil?.rol === 'superadmin';
  const mfa = useNivelMfa(Boolean(session) && esAdministrativo && !omitirMfa);

  if (cargando) return <PantallaCarga />;
  if (!session || !perfil) return <Navigate to="/login" replace state={{ from: ubicacion.pathname }} />;

  // Contraseña temporal entregada por un administrador: se cambia antes de usar el sistema
  if (!omitirClaveForzada && user?.user_metadata?.debe_cambiar_clave === true) {
    return <Navigate to="/cambiar-clave" replace />;
  }

  // La cuenta tiene un factor verificado pero la sesión aún es aal1
  if (esAdministrativo && !omitirMfa) {
    if (mfa.cargando) return <PantallaCarga />;
    if (mfa.requiereVerificacion) return <Navigate to="/seguridad?requerido=1" replace />;
  }

  if (perfil.rol !== 'superadmin' && !roles.includes(perfil.rol)) {
    return <Navigate to={RUTA_INICIAL[perfil.rol]} replace />;
  }
  return <>{children}</>;
}

// Ruta "/": envía a cada usuario a su pantalla según su rol
export function RedirigirPorRol() {
  const { session, perfil, cargando } = useAuth();
  if (cargando) return <PantallaCarga />;
  if (!session || !perfil) return <Navigate to="/login" replace />;
  return <Navigate to={RUTA_INICIAL[perfil.rol]} replace />;
}
