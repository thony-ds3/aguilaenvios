// [FE] Mapa de rutas. Cada ruta está protegida por rol (la seguridad real la aplica RLS en Supabase).
// El superadmin entra a todas las vistas; en las de escritorio trabaja con el recinto elegido en el menú.
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RedirigirPorRol, RutaProtegida } from '@/routes/RutaProtegida';
import { supabaseConfigurado } from '@/lib/supabase';
import type { Rol } from '@/lib/tipos';
import LoginPage from '@/features/auth/LoginPage';
import CrearCuentaPage from '@/features/auth/CrearCuentaPage';
import RecuperarPage from '@/features/auth/RecuperarPage';
import RestablecerPage from '@/features/auth/RestablecerPage';
import RastreoPage from '@/features/cliente/RastreoPage';
import MisEnviosPage from '@/features/cliente/MisEnviosPage';
import HistorialPage from '@/features/cliente/HistorialPage';
import PerfilPage from '@/features/cliente/PerfilPage';
import NuevaGuiaPage from '@/features/recepcion/NuevaGuiaPage';
import CobroPage from '@/features/recepcion/CobroPage';
import GuiasDelDiaPage from '@/features/recepcion/GuiasDelDiaPage';
import ViajesPage from '@/features/logistica/ViajesPage';
import ViajeDetallePage from '@/features/logistica/ViajeDetallePage';
import RecibidasPage from '@/features/logistica/RecibidasPage';
import ChoferesPage from '@/features/logistica/ChoferesPage';
import RutaPage from '@/features/chofer/RutaPage';
import UsuariosRecintoPage from '@/features/admin/UsuariosRecintoPage';
import EnviosRecintoPage from '@/features/admin/EnviosRecintoPage';
import RecintosPage from '@/features/superadmin/RecintosPage';
import UsuariosSistemaPage from '@/features/superadmin/UsuariosSistemaPage';

function protegida(roles: Rol[], elemento: ReactNode) {
  return <RutaProtegida roles={roles}>{elemento}</RutaProtegida>;
}

function ConfiguracionFaltante() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-white p-6">
      <div className="max-w-md space-y-3 rounded-[16px] border border-line p-6">
        <h1 className="text-xl font-extrabold text-ink">Falta configurar Supabase</h1>
        <p className="text-sm text-ink-2">
          Crea el archivo <code>.env.local</code> dentro de la carpeta <code>aguila_envios</code> con{' '}
          <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (copia{' '}
          <code>.env.example</code>), y vuelve a ejecutar <code>npm run dev</code>.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  if (!supabaseConfigurado) return <ConfiguracionFaltante />;

  return (
    <Routes>
      <Route path="/" element={<RedirigirPorRol />} />

      {/* Acceso (público) */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/crear-cuenta" element={<CrearCuentaPage />} />
      <Route path="/recuperar-contrasena" element={<RecuperarPage />} />
      <Route path="/restablecer-contrasena" element={<RestablecerPage />} />

      {/* Cliente (móvil) */}
      <Route path="/cliente/rastreo" element={protegida(['cliente'], <RastreoPage />)} />
      <Route path="/cliente/guias" element={protegida(['cliente'], <MisEnviosPage />)} />
      <Route path="/cliente/guias/:guiaId" element={protegida(['cliente'], <HistorialPage />)} />
      <Route path="/cliente/perfil" element={protegida(['cliente'], <PerfilPage />)} />

      {/* Recepción (escritorio) */}
      <Route path="/recepcion/nueva-guia" element={protegida(['recepcion'], <NuevaGuiaPage />)} />
      <Route path="/recepcion/cobro" element={protegida(['recepcion'], <CobroPage />)} />
      <Route path="/recepcion/guias-del-dia" element={protegida(['recepcion'], <GuiasDelDiaPage />)} />

      {/* Logística (escritorio) */}
      <Route path="/logistica/viajes" element={protegida(['logistica'], <ViajesPage />)} />
      <Route path="/logistica/viajes/:viajeId" element={protegida(['logistica'], <ViajeDetallePage />)} />
      <Route path="/logistica/recibidas" element={protegida(['logistica'], <RecibidasPage />)} />
      <Route path="/logistica/choferes" element={protegida(['logistica'], <ChoferesPage />)} />

      {/* Chófer (móvil, sin barra inferior) */}
      <Route path="/chofer/ruta" element={protegida(['chofer'], <RutaPage />)} />

      {/* Admin de recinto (escritorio) */}
      <Route path="/admin/usuarios" element={protegida(['admin'], <UsuariosRecintoPage />)} />
      <Route path="/admin/envios" element={protegida(['admin'], <EnviosRecintoPage />)} />

      {/* Superadmin (escritorio) */}
      <Route path="/superadmin/recintos" element={protegida(['superadmin'], <RecintosPage />)} />
      <Route path="/superadmin/usuarios" element={protegida(['superadmin'], <UsuariosSistemaPage />)} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
