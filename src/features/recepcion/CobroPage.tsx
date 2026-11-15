// [FE] Recepción 2/3 · Cobro: busca una guía pendiente y registra el pago (efectivo, QR o transferencia).
// El trigger de la base marca la guía como pagada; la app nunca escribe ese campo.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutEscritorio } from '@/components/LayoutEscritorio';
import { Campo } from '@/components/Campo';
import { Alerta, Boton, Cargando, ErrorMsg, Tarjeta, Vacio } from '@/components/ui';
import { EnVivo, SinRecinto } from '@/components/escritorio';
import { useRecinto } from '@/hooks/useRecinto';
import { useGuias, useRegistrarPago } from '@/hooks/useGuias';
import { METODOS_PAGO } from '@/theme/catalogos';
import { formatearFecha, formatearMonto } from '@/lib/formato';
import type { MetodoPago } from '@/lib/tipos';

export default function CobroPage() {
  const { recintoId, cargando } = useRecinto();
  const [params, setParams] = useSearchParams();
  const pendientes = useGuias(recintoId, { tipo: 'pendientes-cobro' });
  const pagar = useRegistrarPago();
  const [texto, setTexto] = useState('');
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo');
  const [aviso, setAviso] = useState<string | null>(null);

  const lista = pendientes.data ?? [];
  const seleccionId = params.get('guia');
  const seleccion = lista.find((g) => g.id === seleccionId) ?? null;
  const buscado = texto.trim().toLowerCase();
  const visibles = buscado
    ? lista.filter((g) =>
        [g.numero, g.remitente, g.destinatario].some((campo) => campo.toLowerCase().includes(buscado)),
      )
    : lista;

  const elegir = (id: string) => {
    setAviso(null);
    pagar.reset();
    setParams({ guia: id });
  };

  const cobrar = async () => {
    if (!seleccion) return;
    setAviso(null);
    try {
      await pagar.mutateAsync({ guiaId: seleccion.id, monto: Number(seleccion.costo), metodo });
      setAviso(`Pago registrado. La guía ${seleccion.numero} quedó marcada como pagada.`);
      setParams({});
    } catch {
      // El mensaje se muestra desde pagar.error
    }
  };

  return (
    <LayoutEscritorio titulo="Cobro" subtitulo="Registrar pago: efectivo, QR o transferencia">
      {cargando ? <Cargando mensaje="Cargando tu recinto…" /> : null}
      {!cargando && !recintoId ? <SinRecinto /> : null}

      {recintoId ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Tarjeta className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-ink">Guías pendientes de pago</h2>
              <EnVivo />
            </div>
            <Campo
              etiqueta="Buscar por número, remitente o destinatario"
              placeholder="AE-000001"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            {pendientes.isPending ? <Cargando mensaje="Cargando guías pendientes…" /> : null}
            {pendientes.isError ? (
              <ErrorMsg mensaje={pendientes.error.message} onReintentar={() => void pendientes.refetch()} />
            ) : null}
            {pendientes.data && lista.length === 0 ? (
              <Vacio titulo="No hay cobros pendientes" texto="Todas las guías con costo ya fueron pagadas." />
            ) : null}
            {lista.length > 0 && visibles.length === 0 ? (
              <Vacio titulo="Sin resultados" texto="Ninguna guía pendiente coincide con la búsqueda." />
            ) : null}
            {visibles.length > 0 ? (
              <ul className="max-h-[480px] divide-y divide-line overflow-y-auto rounded-[14px] border border-line">
                {visibles.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => elegir(g.id)}
                      aria-pressed={g.id === seleccionId}
                      className={`flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${g.id === seleccionId ? 'bg-soft' : 'hover:bg-soft/60'}`}
                    >
                      <span>
                        <span className="block font-extrabold text-ink">{g.numero}</span>
                        <span className="block text-ink-2">Para: {g.destinatario}</span>
                      </span>
                      <span className="font-bold text-brand">{formatearMonto(g.costo)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Tarjeta>

          <Tarjeta className="space-y-4">
            <h2 className="text-lg font-extrabold text-ink">Registrar pago</h2>
            {aviso ? <Alerta tipo="ok">{aviso}</Alerta> : null}
            {pagar.isError ? <Alerta tipo="error">{pagar.error.message}</Alerta> : null}
            {seleccionId && !seleccion && pendientes.data && !aviso ? (
              <Alerta tipo="info">Esa guía ya está pagada o no tiene costo.</Alerta>
            ) : null}

            {seleccion ? (
              <>
                <dl className="grid gap-3 text-sm text-ink-2 sm:grid-cols-2">
                  <div>
                    <dt className="font-bold text-ink">Guía</dt>
                    <dd className="text-lg font-extrabold text-ink">{seleccion.numero}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-ink">Monto a cobrar</dt>
                    <dd className="text-lg font-extrabold text-brand">{formatearMonto(seleccion.costo)}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-ink">Remitente</dt>
                    <dd>{seleccion.remitente}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-ink">Destinatario</dt>
                    <dd>{seleccion.destinatario}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-ink">Recepción</dt>
                    <dd>{formatearFecha(seleccion.fecha_recepcion)}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-ink">Paquetes</dt>
                    <dd>{seleccion.cantidad_paquetes}</dd>
                  </div>
                </dl>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-bold text-ink">Método de pago</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {METODOS_PAGO.map((m) => (
                      <label
                        key={m.valor}
                        className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[14px] border px-4 text-sm font-bold ${metodo === m.valor ? 'border-brand bg-soft text-brand' : 'border-line text-ink'}`}
                      >
                        <input
                          type="radio"
                          name="metodo"
                          value={m.valor}
                          checked={metodo === m.valor}
                          onChange={() => setMetodo(m.valor)}
                          className="h-4 w-4 accent-[#C84E00]"
                        />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <Boton className="w-full" onClick={cobrar} disabled={pagar.isPending}>
                  {pagar.isPending ? 'Registrando pago…' : 'Registrar pago y marcar como pagada'}
                </Boton>
              </>
            ) : (
              <Vacio titulo="Elige una guía" texto="Selecciona una guía pendiente de la lista para registrar su pago." />
            )}
          </Tarjeta>
        </div>
      ) : null}
    </LayoutEscritorio>
  );
}
