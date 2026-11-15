// [FE] Componentes de escritorio: selector con etiqueta, chips con texto, tabla y avisos comunes
import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Vacio } from '@/components/ui';
import { VIAJE_META, type Tono } from '@/theme/catalogos';
import type { EstadoViaje, Guia } from '@/lib/tipos';

export interface SelectorProps extends ComponentPropsWithoutRef<'select'> {
  etiqueta: string;
  error?: string;
  ayuda?: string;
}

export const Selector = forwardRef<HTMLSelectElement, SelectorProps>(function Selector(
  { etiqueta, error, ayuda, id, className = '', children, ...rest },
  ref,
) {
  const autoId = useId();
  const idCampo = id ?? autoId;
  const idError = `${idCampo}-error`;
  const idAyuda = `${idCampo}-ayuda`;
  const describedBy = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={idCampo} className="text-sm font-bold text-ink">
        {etiqueta}
      </label>
      <select
        ref={ref}
        id={idCampo}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`h-[52px] w-full rounded-[14px] border bg-white px-4 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20 disabled:opacity-60 ${error ? 'border-red-700' : 'border-line'} ${className}`}
        {...rest}
      >
        {children}
      </select>
      {ayuda && !error ? (
        <p id={idAyuda} className="text-xs text-ink-2">
          {ayuda}
        </p>
      ) : null}
      {error ? (
        <p id={idError} className="text-xs font-semibold text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
});

const TONOS: Record<Tono, string> = {
  ok: 'bg-ok-bg text-ok-fg',
  pend: 'bg-pend-bg text-pend-fg',
  marca: 'bg-brand text-white',
  alerta: 'bg-red-100 text-red-800',
};

// Chip con texto (nunca solo color)
export function Chip({ tono, children }: { tono: Tono; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${TONOS[tono]}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function ChipPago({ guia }: { guia: Pick<Guia, 'pagada' | 'costo'> }) {
  if (guia.pagada) return <Chip tono="ok">Pagada</Chip>;
  if (Number(guia.costo) === 0) return <Chip tono="pend">Sin costo</Chip>;
  return <Chip tono="pend">Pago pendiente</Chip>;
}

export function ChipViaje({ estado }: { estado: EstadoViaje }) {
  const meta = VIAJE_META[estado];
  return <Chip tono={meta.tono}>{meta.label}</Chip>;
}

export function ChipActivo({ activo }: { activo: boolean }) {
  return activo ? <Chip tono="ok">Activo</Chip> : <Chip tono="pend">Desactivado</Chip>;
}

export const CELDA = 'px-4 py-3 align-middle';

export function Tabla({ etiqueta, columnas, children }: { etiqueta: string; columnas: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[16px] border border-line bg-white">
      <table className="w-full min-w-[720px] text-left text-sm text-ink">
        <caption className="sr-only">{etiqueta}</caption>
        <thead className="bg-soft text-xs font-bold uppercase tracking-wide text-ink-2">
          <tr>
            {columnas.map((columna) => (
              <th key={columna} scope="col" className="px-4 py-3">
                {columna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function EnVivo() {
  return (
    <p className="inline-flex items-center gap-2 text-xs font-bold text-ok-fg">
      <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-ok-fg" />
      Se actualiza en vivo
    </p>
  );
}

export function SinRecinto() {
  return (
    <Vacio
      titulo="No hay un recinto seleccionado"
      texto="Tu cuenta no tiene recinto asignado o todavía no existe ninguno. Un superadmin debe crear el recinto y asignarlo."
    />
  );
}
