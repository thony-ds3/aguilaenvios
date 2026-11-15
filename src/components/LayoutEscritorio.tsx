// [FE] Layout de escritorio para recepción, logística, admin y superadmin:
// barra lateral izquierda con logo, menú del rol y (solo superadmin) selector de recinto de trabajo.
// En pantallas pequeñas el menú pasa arriba.
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Boton } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/hooks/useAuth';
import { useRecinto } from '@/hooks/useRecinto';
import { ROL_LABEL } from '@/theme/tokens';

interface Seccion {
  titulo: string;
  items: { to: string; label: string }[];
}

const SEC_RECEPCION: Seccion = {
  titulo: 'Recepción',
  items: [
    { to: '/recepcion/nueva-guia', label: 'Nueva guía' },
    { to: '/recepcion/cobro', label: 'Cobro' },
    { to: '/recepcion/guias-del-dia', label: 'Guías del día' },
  ],
};
const SEC_LOGISTICA: Seccion = {
  titulo: 'Logística',
  items: [
    { to: '/logistica/viajes', label: 'Viajes' },
    { to: '/logistica/recibidas', label: 'Guías recibidas' },
    { to: '/logistica/choferes', label: 'Chóferes' },
  ],
};
const SEC_CHOFER: Seccion = { titulo: 'Chófer', items: [{ to: '/chofer/ruta', label: 'Rutas en curso' }] };
const SEC_ADMIN: Seccion = {
  titulo: 'Admin de recinto',
  items: [
    { to: '/admin/usuarios', label: 'Usuarios' },
    { to: '/admin/envios', label: 'Envíos' },
  ],
};
const SEC_SUPER: Seccion = {
  titulo: 'Superadmin',
  items: [
    { to: '/superadmin/recintos', label: 'Recintos' },
    { to: '/superadmin/usuarios', label: 'Usuarios del sistema' },
  ],
};
const SEC_CLIENTE: Seccion = {
  titulo: 'Vista cliente',
  items: [
    { to: '/cliente/rastreo', label: 'Rastreo' },
    { to: '/cliente/guias', label: 'Mis envíos' },
    { to: '/cliente/perfil', label: 'Perfil' },
  ],
};

// El superadmin ve todas las vistas de los demás roles desde su menú
const SECCIONES_POR_ROL: Record<string, Seccion[]> = {
  superadmin: [SEC_SUPER, SEC_RECEPCION, SEC_LOGISTICA, SEC_CHOFER, SEC_ADMIN, SEC_CLIENTE],
  recepcion: [SEC_RECEPCION],
  logistica: [SEC_LOGISTICA],
  chofer: [SEC_CHOFER],
  admin: [SEC_ADMIN],
  cliente: [SEC_CLIENTE],
};

// Selector del recinto con el que trabaja el superadmin en las vistas de los demás roles
function SelectorRecinto() {
  const { esSuperadmin, recinto, recintos, recintoId, seleccionar } = useRecinto();

  if (!esSuperadmin) {
    return recinto ? (
      <p className="text-xs text-ink-2">
        <span className="font-bold text-ink">Recinto:</span> {recinto.nombre}
      </p>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="recinto-trabajo" className="text-xs font-bold text-ink">
        Recinto de trabajo
      </label>
      <select
        id="recinto-trabajo"
        value={recintoId ?? ''}
        onChange={(e) => seleccionar(e.target.value)}
        disabled={recintos.length === 0}
        className="h-11 w-full rounded-[12px] border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/20"
      >
        {recintos.length === 0 ? <option value="">Sin recintos</option> : null}
        {recintos.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nombre}
            {r.activo ? '' : ' (inactivo)'}
          </option>
        ))}
      </select>
    </div>
  );
}

export function LayoutEscritorio({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  const { perfil, cerrarSesion } = useAuth();
  const navigate = useNavigate();
  const secciones = perfil ? (SECCIONES_POR_ROL[perfil.rol] ?? []) : [];

  const salir = async () => {
    await cerrarSesion();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-dvh bg-soft/40">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-white md:flex">
        <div className="space-y-4 border-b border-line p-5">
          <Logo tamano="compacto" />
          <SelectorRecinto />
        </div>
        <nav aria-label="Menú principal" className="flex-1 space-y-5 overflow-y-auto p-4">
          {secciones.map((seccion) => (
            <div key={seccion.titulo}>
              <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-ink-2">{seccion.titulo}</p>
              <ul className="space-y-1">
                {seccion.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        `block min-h-[44px] rounded-[12px] px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-brand text-white' : 'text-ink hover:bg-soft'}`
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="space-y-1 border-t border-line p-4">
          <p className="truncate text-sm font-bold text-ink">{perfil?.nombres}</p>
          <p className="text-xs text-ink-2">{perfil ? ROL_LABEL[perfil.rol] : ''}</p>
          <Boton variante="secundaria" className="mt-3 w-full" onClick={salir}>
            Cerrar sesión
          </Boton>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="space-y-3 border-b border-line bg-white p-3 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <Logo tamano="compacto" />
            <button
              type="button"
              onClick={salir}
              className="min-h-[44px] rounded-[12px] border border-line px-3 text-sm font-bold text-brand"
            >
              Salir
            </button>
          </div>
          <SelectorRecinto />
          <nav aria-label="Menú principal" className="flex gap-2 overflow-x-auto pb-1">
            {secciones
              .flatMap((s) => s.items)
              .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `inline-flex min-h-[44px] shrink-0 items-center rounded-full px-4 text-sm font-bold ${isActive ? 'bg-brand text-white' : 'border border-line text-ink'}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
          </nav>
        </div>
        <header className="bg-brand px-6 py-6 text-white">
          <h1 className="text-2xl font-extrabold">{titulo}</h1>
          {subtitulo ? <p className="mt-1 text-sm text-white">{subtitulo}</p> : null}
        </header>
        <main className="flex-1 space-y-4 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
