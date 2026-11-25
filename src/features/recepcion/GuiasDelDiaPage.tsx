// [FE] Recepción 3/3 · Guías del día: tabla del recinto con estado y pago; los cambios se ven en vivo.
import { LayoutEscritorio } from '@/components/LayoutEscritorio';
import { Cargando, ChipEstado, ErrorMsg, Tarjeta, Vacio } from '@/components/ui';
import { CELDA, ChipPago, EnVivo, SinRecinto, Tabla } from '@/components/escritorio';
import { useRecinto } from '@/hooks/useRecinto';
import { useGuias } from '@/hooks/useGuias';
import { formatearFecha, formatearHora, formatearMonto } from '@/lib/formato';
import { hoyISO } from '@/lib/validacion';

function Contador({ valor, etiqueta }: { valor: number | string; etiqueta: string }) {
  return (
    <Tarjeta className="text-center">
      <p className="text-3xl font-extrabold text-brand">{valor}</p>
      <p className="text-sm font-bold text-ink-2">{etiqueta}</p>
    </Tarjeta>
  );
}

export default function GuiasDelDiaPage() {
  const { recintoId, cargando } = useRecinto();
  const guias = useGuias(recintoId, { tipo: 'hoy' });
  const lista = guias.data ?? [];
  const pagadas = lista.filter((g) => g.pagada).length;
  const porCobrar = lista.filter((g) => !g.pagada && Number(g.costo) > 0).length;
  const cobrado = lista.filter((g) => g.pagada).reduce((suma, g) => suma + Number(g.costo), 0);

  return (
    <LayoutEscritorio titulo="Guías del día" subtitulo={`Recepcionadas hoy, ${formatearFecha(hoyISO())}`}>
      {cargando ? <Cargando mensaje="Cargando tu recinto…" /> : null}
      {!cargando && !recintoId ? <SinRecinto /> : null}

      {recintoId ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Contador valor={lista.length} etiqueta="Guías de hoy" />
            <Contador valor={pagadas} etiqueta="Pagadas" />
            <Contador valor={porCobrar} etiqueta="Por cobrar" />
            <Contador valor={formatearMonto(cobrado)} etiqueta="Cobrado hoy" />
          </div>

          <EnVivo />

          {guias.isPending ? <Cargando mensaje="Cargando las guías de hoy…" /> : null}
          {guias.isError ? <ErrorMsg mensaje={guias.error.message} onReintentar={() => void guias.refetch()} /> : null}
          {guias.data && lista.length === 0 ? (
            <Vacio titulo="Todavía no hay guías hoy" texto="Las guías que registres en Nueva guía aparecerán aquí." />
          ) : null}

          {lista.length > 0 ? (
            <Tabla
              etiqueta="Guías recepcionadas hoy"
              columnas={['Número', 'Hora', 'Remitente', 'Destinatario', 'Paquetes', 'Costo', 'Pago', 'Estado']}
            >
              {lista.map((g) => (
                <tr key={g.id}>
                  <td className={`${CELDA} font-extrabold`}>
                    {g.numero}
                    {g.codigo_rastreo ? (
                      <span className="block font-mono text-xs font-normal text-ink-2" title="Código de rastreo para el cliente">
                        {g.codigo_rastreo}
                      </span>
                    ) : null}
                  </td>
                  <td className={CELDA}>{formatearHora(g.created_at)}</td>
                  <td className={CELDA}>{g.remitente}</td>
                  <td className={CELDA}>{g.destinatario}</td>
                  <td className={CELDA}>{g.cantidad_paquetes}</td>
                  <td className={CELDA}>{formatearMonto(g.costo)}</td>
                  <td className={CELDA}>
                    <ChipPago guia={g} />
                  </td>
                  <td className={CELDA}>
                    <ChipEstado estado={g.estado} />
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
