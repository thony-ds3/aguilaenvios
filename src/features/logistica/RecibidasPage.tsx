// [FE] Logística 3/4 · Guías recibidas: lo que recepción registra llega aquí al instante (Realtime).
import { LayoutEscritorio } from '@/components/LayoutEscritorio';
import { Cargando, ErrorMsg, Vacio } from '@/components/ui';
import { CELDA, ChipPago, EnVivo, SinRecinto, Tabla } from '@/components/escritorio';
import { useRecinto } from '@/hooks/useRecinto';
import { useGuias } from '@/hooks/useGuias';
import { formatearFecha, formatearHora } from '@/lib/formato';

export default function RecibidasPage() {
  const { recintoId, cargando } = useRecinto();
  const guias = useGuias(recintoId, { tipo: 'recibidas' });
  const lista = guias.data ?? [];

  return (
    <LayoutEscritorio titulo="Guías recibidas" subtitulo="Enviadas a logística y pendientes de asignar a un viaje">
      {cargando ? <Cargando mensaje="Cargando tu recinto…" /> : null}
      {!cargando && !recintoId ? <SinRecinto /> : null}

      {recintoId ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-ink">{lista.length} guía(s) por asignar</p>
            <EnVivo />
          </div>

          {guias.isPending ? <Cargando mensaje="Cargando guías recibidas…" /> : null}
          {guias.isError ? <ErrorMsg mensaje={guias.error.message} onReintentar={() => void guias.refetch()} /> : null}
          {guias.data && lista.length === 0 ? (
            <Vacio titulo="No hay guías por asignar" texto="Las guías nuevas de recepción aparecerán aquí sin recargar la página." />
          ) : null}

          {lista.length > 0 ? (
            <Tabla
              etiqueta="Guías recibidas de recepción"
              columnas={['Número', 'Recepción', 'Hora', 'Destinatario', 'Dirección', 'Paquetes', 'Peso', 'Pago']}
            >
              {lista.map((g) => (
                <tr key={g.id}>
                  <td className={`${CELDA} font-extrabold`}>{g.numero}</td>
                  <td className={CELDA}>{formatearFecha(g.fecha_recepcion)}</td>
                  <td className={CELDA}>{formatearHora(g.created_at)}</td>
                  <td className={CELDA}>{g.destinatario}</td>
                  <td className={CELDA}>{g.direccion_entrega}</td>
                  <td className={CELDA}>{g.cantidad_paquetes}</td>
                  <td className={CELDA}>{Number(g.peso_kg)} kg</td>
                  <td className={CELDA}>
                    <ChipPago guia={g} />
                  </td>
                </tr>
              ))}
            </Tabla>
          ) : null}
        </>
      ) : null}
    </LayoutEscritorio>
  );
}
