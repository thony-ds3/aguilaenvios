// [FE] Logística 1/4 · Viajes: lista del recinto (en vivo) y creación de viaje por fecha.
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { LayoutEscritorio } from '@/components/LayoutEscritorio';
import { Campo } from '@/components/Campo';
import { Alerta, Boton, Cargando, ErrorMsg, Tarjeta, Vacio } from '@/components/ui';
import { CELDA, ChipViaje, EnVivo, SinRecinto, Tabla } from '@/components/escritorio';
import { useRecinto } from '@/hooks/useRecinto';
import { useChoferes, useCrearViaje, useViajes } from '@/hooks/useViaje';
import { formatearFecha, formatearFechaHora, nombreCompleto } from '@/lib/formato';
import { hoyISO } from '@/lib/validacion';

const viajeSchema = z.object({
  fecha: z
    .string()
    .min(1, 'Selecciona la fecha del viaje.')
    .refine((valor) => valor >= hoyISO(), 'La fecha del viaje no puede ser anterior a hoy.'),
});
type ViajeValores = z.infer<typeof viajeSchema>;

export default function ViajesPage() {
  const { recintoId, cargando } = useRecinto();
  const viajes = useViajes(recintoId);
  const choferes = useChoferes(recintoId);
  const crear = useCrearViaje();
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm<ViajeValores>({
    resolver: zodResolver(viajeSchema),
    defaultValues: { fecha: hoyISO() },
  });

  const nombreChofer = (id: string | null): string => {
    if (!id) return 'Sin asignar';
    const chofer = choferes.data?.find((c) => c.id === id);
    return chofer ? nombreCompleto(chofer) : 'Chófer asignado';
  };

  const onSubmit = async (v: ViajeValores) => {
    if (!recintoId) return;
    try {
      const viaje = await crear.mutateAsync({ recintoId, fecha: v.fecha });
      navigate(`/logistica/viajes/${viaje.id}`);
    } catch {
      // El mensaje se muestra desde crear.error
    }
  };

  const lista = viajes.data ?? [];

  return (
    <LayoutEscritorio titulo="Viajes" subtitulo="Crea viajes por fecha y arma sus paradas">
      {cargando ? <Cargando mensaje="Cargando tu recinto…" /> : null}
      {!cargando && !recintoId ? <SinRecinto /> : null}

      {recintoId ? (
        <>
          <Tarjeta className="max-w-2xl">
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              <h2 className="text-lg font-extrabold text-ink">Crear viaje</h2>
              {crear.isError ? <Alerta tipo="error">{crear.error.message}</Alerta> : null}
              <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto]">
                <Campo
                  etiqueta="Fecha del viaje"
                  type="date"
                  min={hoyISO()}
                  ayuda="Se podrán sumar guías recepcionadas hasta 2 días antes de esta fecha."
                  error={errors.fecha?.message}
                  {...register('fecha')}
                />
                <Boton type="submit" disabled={crear.isPending}>
                  {crear.isPending ? 'Creando…' : 'Crear viaje'}
                </Boton>
              </div>
            </form>
          </Tarjeta>

          <EnVivo />

          {viajes.isPending ? <Cargando mensaje="Cargando viajes…" /> : null}
          {viajes.isError ? <ErrorMsg mensaje={viajes.error.message} onReintentar={() => void viajes.refetch()} /> : null}
          {viajes.data && lista.length === 0 ? (
            <Vacio titulo="Aún no hay viajes" texto="Crea el primer viaje eligiendo una fecha." />
          ) : null}

          {lista.length > 0 ? (
            <Tabla etiqueta="Viajes del recinto" columnas={['Fecha', 'Estado', 'Chófer', 'Salida', 'Acción']}>
              {lista.map((v) => (
                <tr key={v.id}>
                  <td className={`${CELDA} font-extrabold`}>{formatearFecha(v.fecha_viaje)}</td>
                  <td className={CELDA}>
                    <ChipViaje estado={v.estado} />
                  </td>
                  <td className={CELDA}>{nombreChofer(v.chofer_id)}</td>
                  <td className={CELDA}>{formatearFechaHora(v.salida_at)}</td>
                  <td className={CELDA}>
                    <Link
                      to={`/logistica/viajes/${v.id}`}
                      className="inline-flex min-h-[44px] items-center rounded-[12px] border-[1.5px] border-brand px-4 font-bold text-brand hover:bg-soft"
                    >
                      Abrir
                    </Link>
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
