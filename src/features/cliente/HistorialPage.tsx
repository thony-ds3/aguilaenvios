// [FE] Cliente 3/4 · Historial de la guía: línea de tiempo de estados (la escribe un trigger en `historial`)
import { useParams } from 'react-router-dom';
import { LayoutMovil } from '@/components/LayoutMovil';
import { ChipEstado, Cargando, ErrorMsg, Tarjeta, Vacio } from '@/components/ui';
import { useGuia, useHistorial } from '@/hooks/useCliente';
import { ESTADO_META } from '@/theme/tokens';
import { formatearFechaHora } from '@/lib/formato';

export default function HistorialPage() {
  const { guiaId } = useParams<{ guiaId: string }>();
  const guia = useGuia(guiaId);
  const historial = useHistorial(guiaId);

  return (
    <LayoutMovil titulo="Historial de la guía" subtitulo={guia.data?.numero ?? 'Cargando guía…'} volverA="/cliente/guias">
      {guia.isPending ? <Cargando mensaje="Cargando la guía…" /> : null}
      {guia.isError ? <ErrorMsg mensaje={guia.error.message} onReintentar={() => void guia.refetch()} /> : null}
      {guia.data === null ? <Vacio titulo="Guía no encontrada" texto="Puede que no esté vinculada a tu cuenta." /> : null}

      {guia.data ? (
        <Tarjeta className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-lg font-extrabold text-ink">{guia.data.numero}</p>
            <ChipEstado estado={guia.data.estado} />
          </div>
          <p className="text-sm text-ink-2">
            <span className="font-bold text-ink">Para:</span> {guia.data.destinatario}
          </p>
          <p className="text-sm text-ink-2">{guia.data.direccion_entrega}</p>
          {guia.data.entregada_at ? (
            <p className="text-xs font-bold text-ok-fg">Entregada el {formatearFechaHora(guia.data.entregada_at)}</p>
          ) : null}
        </Tarjeta>
      ) : null}

      {historial.isPending && guia.data ? <Cargando mensaje="Cargando el historial…" /> : null}
      {historial.isError ? <ErrorMsg mensaje={historial.error.message} onReintentar={() => void historial.refetch()} /> : null}
      {historial.data && historial.data.length === 0 ? (
        <Vacio titulo="Sin movimientos todavía" texto="Los estados aparecerán aquí a medida que avance tu envío." />
      ) : null}

      {historial.data && historial.data.length > 0 ? (
        <Tarjeta>
          <p className="mb-4 font-extrabold text-ink">Línea de tiempo</p>
          <ol className="relative ml-2 space-y-6 border-l-2 border-line pl-7">
            {historial.data.map((item, i) => {
              const actual = i === historial.data.length - 1;
              return (
                <li key={item.id} className="relative">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[37px] top-1 h-4 w-4 rounded-full border-2 border-white ${actual ? 'bg-brand' : 'bg-pend-fg'}`}
                  />
                  <p className="font-bold text-ink">{ESTADO_META[item.estado].label}</p>
                  <p className="text-xs text-ink-2">{formatearFechaHora(item.fecha)}</p>
                </li>
              );
            })}
          </ol>
        </Tarjeta>
      ) : null}
    </LayoutMovil>
  );
}
