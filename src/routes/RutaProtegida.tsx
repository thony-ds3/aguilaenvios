// [FE] Protección de rutas por rol. Oculta pantallas por comodidad; la seguridad real está en RLS (servidor).
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
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

export function RutaProtegida({ roles, children }: { roles: Rol[]; children: ReactNode }) {
  const { session, perfil, cargando } = useAuth();
  const ubicacion = useLocation();

  if (cargando) return <PantallaCarga />;
  if (!session || !perfil) return <Navigate to="/login" replace state={{ from: ubicacion.pathname }} />;
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
