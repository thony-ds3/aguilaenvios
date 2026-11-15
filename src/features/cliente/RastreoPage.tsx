// [FE] Cliente 1/4 · Seguimiento en tiempo real: guía + fecha de exportación → chófer en el mapa (Realtime)
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { LayoutMovil } from '@/components/LayoutMovil';
import { Campo, CampoControlado } from '@/components/Campo';
import { Alerta, Boton, ChipEstado, Cargando, ErrorMsg, Tarjeta, Vacio } from '@/components/ui';
import { MapaRastreo } from '@/components/MapaRastreo';
import { useRastrearGuia } from '@/hooks/useCliente';
import { useCanalGuia, useUbicacionEnVivo } from '@/hooks/useRastreo';
import { fechaSchema, filtrarGuia, hoyISO, numeroGuiaSchema } from '@/lib/validacion';
import { formatearFechaHora } from '@/lib/formato';

const rastreoSchema = z.object({ numero: numeroGuiaSchema, fecha: fechaSchema });
type RastreoValores = z.infer<typeof rastreoSchema>;

export default function RastreoPage() {
  const rastrear = useRastrearGuia();
  const [busqueda, setBusqueda] = useState<RastreoValores | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const { control, register, handleSubmit, formState: { errors } } = useForm<RastreoValores>({
    resolver: zodResolver(rastreoSchema),
    defaultValues: { numero: '', fecha: '' },
  });

  const resultado = rastrear.data ?? null;
  const enRuta = resultado?.estado === 'en_ruta' && Boolean(resultado.chofer_id);
  const ubicacion = useUbicacionEnVivo(enRuta ? (resultado?.chofer_id ?? null) : null);

  // Si la guía cambia de estado mientras se mira, se vuelve a consultar sola
  useCanalGuia(busqueda?.numero ?? null, () => {
    if (busqueda) rastrear.mutate(busqueda);
  });

  // Reloj para mostrar "hace N segundos" de la última actualización
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const onSubmit = (v: RastreoValores) => {
    setBusqueda(v);
    rastrear.mutate(v);
  };

  const segundos = ubicacion.data
    ? Math.max(0, Math.round((ahora - new Date(ubicacion.data.actualizado).getTime()) / 1000))
    : null;

  return (
    <LayoutMovil titulo="Rastreo en vivo" subtitulo="Busca tu guía con la fecha de exportación y sigue a tu chófer.">
      <Tarjeta>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <CampoControlado
            control={control}
            name="numero"
            filtro={filtrarGuia}
            etiqueta="Número de guía"
            placeholder="AE-000001"
            autoCapitalize="characters"
            ayuda="Formato AE-000000"
            error={errors.numero?.message}
          />
          <Campo
            etiqueta="Fecha de exportación"
            type="date"
            max={hoyISO()}
            error={errors.fecha?.message}
            {...register('fecha')}
          />
          <Boton type="submit" className="w-full" disabled={rastrear.isPending}>
            {rastrear.isPending ? 'Buscando…' : 'Rastrear envío'}
          </Boton>
        </form>
      </Tarjeta>

      {rastrear.isPending ? <Cargando mensaje="Buscando tu guía…" /> : null}

      {rastrear.isError && !rastrear.isPending ? (
        <ErrorMsg mensaje={rastrear.error.message} onReintentar={() => busqueda && rastrear.mutate(busqueda)} />
      ) : null}

      {resultado && !rastrear.isPending ? (
        <Tarjeta className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-lg font-extrabold text-ink">{resultado.numero}</p>
            <ChipEstado estado={resultado.estado} />
          </div>
          <div className="space-y-1 text-sm text-ink-2">
            <p>
              <span className="font-bold text-ink">Destinatario:</span> {resultado.destinatario}
            </p>
            <p>
              <span className="font-bold text-ink">Dirección:</span> {resultado.direccion_entrega}
            </p>
          </div>

          {enRuta ? (
            <div className="space-y-3">
              {ubicacion.isPending ? <Cargando mensaje="Buscando la ubicación del chófer…" /> : null}
              {ubicacion.isError ? (
                <ErrorMsg mensaje={ubicacion.error.message} onReintentar={() => void ubicacion.refetch()} />
              ) : null}
              {ubicacion.data ? (
                <MapaRastreo
                  lat={ubicacion.data.lat}
                  lng={ubicacion.data.lng}
                  etiqueta={`Ubicación del chófer de la guía ${resultado.numero}`}
                />
              ) : null}
              {!ubicacion.isPending && !ubicacion.isError && !ubicacion.data ? (
                <Vacio titulo="Esperando al chófer" texto="El chófer todavía no comparte su ubicación GPS." />
              ) : null}
              <p className="text-sm text-ink">
                <span className="font-bold">Chófer:</span> {resultado.chofer_nombre ?? 'Asignado'}
              </p>
              <p className="text-xs text-ink-2">
                {ubicacion.data
                  ? `Última actualización: hace ${segundos} s (${formatearFechaHora(ubicacion.data.actualizado)})`
                  : 'Sin actualizaciones todavía'}
              </p>
            </div>
          ) : resultado.estado === 'entregada' ? (
            <Alerta tipo="ok">Entregada el {formatearFechaHora(resultado.entregada_at)}.</Alerta>
          ) : (
            <Alerta tipo="info">
              Tu envío todavía no está en ruta. El mapa en vivo se activa cuando el chófer salga con tu guía.
            </Alerta>
          )}

          <Link
            to={`/cliente/guias/${resultado.id}`}
            className="inline-flex min-h-[52px] w-full items-center justify-center rounded-[14px] border-[1.5px] border-brand bg-white px-5 font-bold text-brand hover:bg-soft"
          >
            Ver historial de estados
          </Link>
        </Tarjeta>
      ) : null}

      {!resultado && !rastrear.isPending && !rastrear.isError ? (
        <Vacio titulo="Sigue tu pedido" texto="Escribe el número de guía y la fecha en que fue exportada para ver dónde va." />
      ) : null}
    </LayoutMovil>
  );
}
