// [FE] Layout móvil del cliente (lienzo 390×844): cabecera naranja y barra inferior Rastreo / Mis envíos / Perfil
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { CabeceraNaranja } from '@/components/ui';

const NAVEGACION = [
  { to: '/cliente/rastreo', label: 'Rastreo' },
  { to: '/cliente/guias', label: 'Mis envíos' },
  { to: '/cliente/perfil', label: 'Perfil' },
];

export function LayoutMovil({
  titulo,
  subtitulo,
  volverA,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  volverA?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-white md:my-6 md:min-h-[844px] md:overflow-hidden md:rounded-[32px] md:border md:border-line md:shadow-xl">
      <CabeceraNaranja titulo={titulo} subtitulo={subtitulo} volverA={volverA} />
      <main className="flex-1 space-y-4 p-4 pb-28">{children}</main>
      <nav
        aria-label="Navegación principal"
        className="fixed bottom-0 left-1/2 z-10 grid w-full max-w-[430px] -translate-x-1/2 grid-cols-3 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]"
      >
        {NAVEGACION.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-h-[56px] items-center justify-center text-sm font-bold ${isActive ? 'text-brand underline decoration-2 underline-offset-8' : 'text-ink-2'}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
