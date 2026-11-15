// [FE] Admin de recinto 2/2 · Envíos del recinto: todas las guías con filtros por estado, en vivo.
import { useState } from 'react';
import { LayoutEscritorio } from '@/components/LayoutEscritorio';
import { Cargando, ChipEstado, ErrorMsg, Vacio } from '@/components/ui';
import { CELDA, ChipPago, EnVivo, SinRecinto, Tabla } from '@/components/escritorio';
import { useRecinto } from '@/hooks/useRecinto';
import { useGuias } from '@/hooks/useGuias';
import { formatearFecha, formatearMonto } from '@/lib/formato';
import { ESTADOS_GUIA } from '@/theme/catalogos';
import { ESTADO_META } from '@/theme/tokens';
import type { EstadoGuia } from '@/lib/tipos';

type Filtro = EstadoGuia | 'todas';

export default function EnviosRecintoPage() {
  const { recintoId, recinto, cargando } = useRecinto();
  const [estado, setEstado] = useState<Filtro>('todas');
  const guias = useGuias(recintoId, { tipo: 'estado', estado });
  const lista = guias.data ?? [];
  const filtros: { valor: Filtro; label: string }[] = [
    { valor: 'todas', label: 'Todas' },
    ...ESTADOS_GUIA.map((e) => ({ valor: e as Filtro, label: ESTADO_META[e].label })),
  ];

  return (
    <LayoutEscritorio titulo="Envíos del recinto" subtitulo={recinto ? recinto.nombre : 'Todas las guías'}>
      {cargando ? <Cargando mensaje="Cargando tu recinto…" /> : null}
      {!cargando && !recintoId ? <SinRecinto /> : null}

      {recintoId ? (
        <>
          <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
            {filtros.map((f) => (
              <button
                key={f.valor}
                type="button"
                aria-pressed={estado === f.valor}
                onClick={() => setEstado(f.valor)}
                className={`min-h-[44px] rounded-full px-4 text-sm font-bold ${estado === f.valor ? 'bg-brand text-white' : 'border border-line bg-white text-ink hover:bg-soft'}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-ink">
              {lista.length} guía(s){lista.length === 300 ? ' (se muestran las 300 más recientes)' : ''}
            </p>
            <EnVivo />
          </div>

          {guias.isPending ? <Cargando mensaje="Cargando envíos…" /> : null}
          {guias.isError ? <ErrorMsg mensaje={guias.error.message} onReintentar={() => void guias.refetch()} /> : null}
          {guias.data && lista.length === 0 ? (
            <Vacio titulo="No hay envíos con este filtro" texto="Prueba con otro estado o espera a que recepción registre guías." />
          ) : null}

          {lista.length > 0 ? (
            <Tabla
              etiqueta="Envíos del recinto"
              columnas={['Número', 'Recepción', 'Remitente', 'Destinatario', 'Dirección', 'Costo', 'Pago', 'Estado']}
            >
              {lista.map((g) => (
                <tr key={g.id}>
                  <td className={`${CELDA} font-extrabold`}>{g.numero}</td>
                  <td className={CELDA}>{formatearFecha(g.fecha_recepcion)}</td>
                  <td className={CELDA}>{g.remitente}</td>
                  <td className={CELDA}>{g.destinatario}</td>
                  <td className={CELDA}>{g.direccion_entrega}</td>
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
