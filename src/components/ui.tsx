// [FE] Componentes base: botones (52 px), tarjetas, chips de estado con texto, estados de carga/vacío/error y cabeceras
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ESTADO_META } from '@/theme/tokens';
import type { EstadoGuia } from '@/lib/tipos';
import { Logo } from '@/components/Logo';

type Variante = 'primaria' | 'secundaria' | 'fantasma' | 'peligro';

const VARIANTES: Record<Variante, string> = {
  primaria: 'bg-brand text-white hover:bg-[#A83F00]',
  secundaria: 'border-[1.5px] border-brand bg-white text-brand hover:bg-soft',
  fantasma: 'bg-transparent text-brand hover:bg-soft',
  peligro: 'border border-red-800 bg-white text-red-800 hover:bg-red-50',
};

export function Boton({
  variante = 'primaria',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] px-5 text-base font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTES[variante]} ${className}`}
    />
  );
}

export function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[16px] border border-line bg-white p-4 ${className}`}>{children}</section>;
}

export function ChipEstado({ estado }: { estado: EstadoGuia }) {
  const meta = ESTADO_META[estado];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${meta.cls}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

export function Cargando({ mensaje = 'Cargando…' }: { mensaje?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 rounded-[16px] border border-line bg-white p-8 text-center">
      <span aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border-4 border-soft border-t-brand" />
      <p className="font-semibold text-ink">{mensaje}</p>
    </div>
  );
}

export function Vacio({ titulo, texto, children }: { titulo: string; texto: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[16px] border border-dashed border-line bg-soft/40 p-6 text-center">
      <p className="font-bold text-ink">{titulo}</p>
      <p className="text-sm text-ink-2">{texto}</p>
      {children}
    </div>
  );
}

export function ErrorMsg({ mensaje, onReintentar }: { mensaje: string; onReintentar?: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-[16px] border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-semibold text-red-800">{mensaje}</p>
      {onReintentar ? (
        <Boton variante="peligro" className="self-start" onClick={onReintentar}>
          Reintentar
        </Boton>
      ) : null}
    </div>
  );
}

export function Alerta({ tipo, children }: { tipo: 'ok' | 'error' | 'info'; children: ReactNode }) {
  const estilos = {
    ok: 'bg-ok-bg text-ok-fg border-ok-fg/20',
    error: 'bg-red-50 text-red-800 border-red-200',
    info: 'bg-soft text-ink border-line',
  }[tipo];
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-[14px] border p-3 text-sm font-semibold ${estilos}`}>
      {children}
    </div>
  );
}

export function CabeceraNaranja({ titulo, subtitulo, volverA }: { titulo: string; subtitulo?: string; volverA?: string }) {
  return (
    <header className="bg-brand px-5 pb-6 pt-5 text-white">
      {volverA ? (
        <Link to={volverA} className="mb-2 inline-flex min-h-[44px] items-center text-sm font-bold text-white underline-offset-4 hover:underline">
          ← Volver
        </Link>
      ) : null}
      <h1 className="text-2xl font-extrabold leading-tight">{titulo}</h1>
      {subtitulo ? <p className="mt-1 text-sm text-white">{subtitulo}</p> : null}
    </header>
  );
}

// Marco para Login, Crear cuenta, Recuperar y Restablecer (móvil a pantalla completa, tarjeta en escritorio)
export function MarcoAcceso({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-soft/50 md:flex md:items-center md:justify-center md:p-6">
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-white md:min-h-0 md:overflow-hidden md:rounded-[16px] md:border md:border-line md:shadow-xl">
        <div className="bg-brand px-5 pb-6 pt-8 text-white">
          <Logo claro />
          <h1 className="mt-5 text-2xl font-extrabold">{titulo}</h1>
          {subtitulo ? <p className="mt-1 text-sm text-white">{subtitulo}</p> : null}
        </div>
        <div className="flex-1 space-y-4 p-5">{children}</div>
      </div>
    </div>
  );
}
