// [FE] Logística 4/4 · Estado de chóferes: chóferes activos del recinto, si están en ruta
// y su última posición en `ubicaciones` (hora y hace cuánto).
import { LayoutEscritorio } from '@/components/LayoutEscritorio';
import { Cargando, ErrorMsg, Vacio } from '@/components/ui';
import { CELDA, Chip, EnVivo, SinRecinto, Tabla } from '@/components/escritorio';
import { useRecinto } from '@/hooks/useRecinto';
import { useAhora } from '@/hooks/useRealtime';
import { useChoferes, useUbicacionesChoferes, useViajes } from '@/hooks/useViaje';
import { formatearFechaHora, haceCuanto, nombreCompleto } from '@/lib/formato';

export default function ChoferesPage() {
  const { recintoId, cargando } = useRecinto();
  const choferes = useChoferes(recintoId);
  const viajes = useViajes(recintoId);
  const activos = (choferes.data ?? []).filter((c) => c.activo);
  const ubicaciones = useUbicacionesChoferes(activos.map((c) => c.id));
  const ahora = useAhora(1000);

  const enRuta = new Set(
    (viajes.data ?? []).filter((v) => v.estado === 'en_ruta' && v.chofer_id).map((v) => v.chofer_id as string),
  );

  return (
    <LayoutEscritorio titulo="Chóferes" subtitulo="Disponibilidad y última ubicación de los chóferes del recinto">
      {cargando ? <Cargando mensaje="Cargando tu recinto…" /> : null}
      {!cargando && !recintoId ? <SinRecinto /> : null}

      {recintoId ? (
        <>
          <EnVivo />
          {choferes.isPending ? <Cargando mensaje="Cargando chóferes…" /> : null}
          {choferes.isError ? (
            <ErrorMsg mensaje={choferes.error.message} onReintentar={() => void choferes.refetch()} />
          ) : null}
          {ubicaciones.isError ? (
            <ErrorMsg mensaje={ubicaciones.error.message} onReintentar={() => void ubicaciones.refetch()} />
          ) : null}
          {choferes.data && activos.length === 0 ? (
            <Vacio titulo="No hay chóferes activos" texto="El admin del recinto puede crear cuentas con el rol Chófer." />
          ) : null}

          {activos.length > 0 ? (
            <Tabla
              etiqueta="Estado de los chóferes del recinto"
              columnas={['Chófer', 'Teléfono', 'Estado', 'Última ubicación', 'Hace cuánto', 'Coordenadas']}
            >
              {activos.map((c) => {
                const u = ubicaciones.data?.find((x) => x.chofer_id === c.id) ?? null;
                const viajando = enRuta.has(c.id);
                const segundos = u ? (ahora - new Date(u.actualizado).getTime()) / 1000 : null;
                return (
                  <tr key={c.id}>
                    <td className={`${CELDA} font-extrabold`}>{nombreCompleto(c)}</td>
                    <td className={CELDA}>{c.telefono ?? '—'}</td>
                    <td className={CELDA}>
                      {viajando ? <Chip tono="marca">En ruta</Chip> : <Chip tono="ok">Disponible</Chip>}
                      {viajando && (segundos === null || segundos > 60) ? (
                        <span className="mt-1 block text-xs font-bold text-red-800">Sin señal reciente</span>
                      ) : null}
                    </td>
                    <td className={CELDA}>{u ? formatearFechaHora(u.actualizado) : 'Sin registro'}</td>
                    <td className={CELDA}>{u ? haceCuanto(u.actualizado, ahora) : '—'}</td>
                    <td className={CELDA}>{u ? `${u.lat.toFixed(5)}, ${u.lng.toFixed(5)}` : '—'}</td>
                  </tr>
                );
              })}
            </Tabla>
          ) : null}
        </>
      ) : null}
    </LayoutEscritorio>
  );
}
