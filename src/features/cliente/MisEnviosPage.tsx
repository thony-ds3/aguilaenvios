// [FE] Cliente 2/4 · Mis envíos: resumen (total, en ruta, entregadas), agregar guía por número y lista
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { LayoutMovil } from '@/components/LayoutMovil';
import { CampoControlado } from '@/components/Campo';
import { Alerta, Boton, ChipEstado, Cargando, ErrorMsg, Tarjeta, Vacio } from '@/components/ui';
import { useMisGuias, useResumenCliente, useVincularGuia } from '@/hooks/useCliente';
import { filtrarGuia, numeroGuiaSchema } from '@/lib/validacion';
import { formatearFecha } from '@/lib/formato';

const agregarSchema = z.object({ numero: numeroGuiaSchema });
type AgregarValores = z.infer<typeof agregarSchema>;

function Estadistica({ valor, etiqueta }: { valor: number | string; etiqueta: string }) {
  return (
    <div className="rounded-[16px] border border-line bg-soft p-3 text-center">
      <p className="text-2xl font-extrabold text-brand">{valor}</p>
      <p className="text-xs font-bold text-ink-2">{etiqueta}</p>
    </div>
  );
}

export default function MisEnviosPage() {
  const resumen = useResumenCliente();
  const guias = useMisGuias();
  const vincular = useVincularGuia();
  const [aviso, setAviso] = useState<string | null>(null);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<AgregarValores>({
    resolver: zodResolver(agregarSchema),
    defaultValues: { numero: '' },
  });

  const onAgregar = async (v: AgregarValores) => {
    setAviso(null);
    try {
      await vincular.mutateAsync(v.numero);
      reset({ numero: '' });
      setAviso('Guía agregada a tus envíos.');
    } catch {
      // El mensaje de error se muestra abajo desde vincular.error
    }
  };

  return (
    <LayoutMovil titulo="Mis envíos" subtitulo="Tus guías, su avance y sus totales.">
      {resumen.isPending ? (
        <Cargando mensaje="Calculando tu resumen…" />
      ) : resumen.isError ? (
        <ErrorMsg mensaje={resumen.error.message} onReintentar={() => void resumen.refetch()} />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Estadistica valor={resumen.data.total} etiqueta="Total" />
          <Estadistica valor={resumen.data.en_ruta} etiqueta="En ruta" />
          <Estadistica valor={resumen.data.entregadas} etiqueta="Entregadas" />
        </div>
      )}

      <Tarjeta>
        <form onSubmit={handleSubmit(onAgregar)} noValidate className="space-y-4">
          <p className="font-extrabold text-ink">Agregar guía por número</p>
          {vincular.isError ? <Alerta tipo="error">{vincular.error.message}</Alerta> : null}
          {aviso ? <Alerta tipo="ok">{aviso}</Alerta> : null}
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
          <Boton type="submit" className="w-full" disabled={vincular.isPending}>
            {vincular.isPending ? 'Agregando…' : 'Agregar guía'}
          </Boton>
        </form>
      </Tarjeta>

      <section className="space-y-3" aria-label="Lista de guías">
        {guias.isPending ? <Cargando mensaje="Cargando tus guías…" /> : null}
        {guias.isError ? <ErrorMsg mensaje={guias.error.message} onReintentar={() => void guias.refetch()} /> : null}
        {guias.data && guias.data.length === 0 ? (
          <Vacio titulo="Aún no tienes guías" texto="Agrega tu número de guía (AE-000000) para empezar a seguirla." />
        ) : null}
        {guias.data?.map((guia) => (
          <Tarjeta key={guia.id} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-extrabold text-ink">{guia.numero}</p>
              <ChipEstado estado={guia.estado} />
            </div>
            <p className="text-sm text-ink-2">
              <span className="font-bold text-ink">Para:</span> {guia.destinatario}
            </p>
            <p className="text-sm text-ink-2">{guia.direccion_entrega}</p>
            <p className="text-xs text-ink-2">Recepción: {formatearFecha(guia.fecha_recepcion)}</p>
            <Link
              to={`/cliente/guias/${guia.id}`}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-[14px] border-[1.5px] border-brand font-bold text-brand hover:bg-soft"
            >
              Ver historial
            </Link>
          </Tarjeta>
        ))}
      </section>
    </LayoutMovil>
  );
}
