// [FE] Logística 2/4 · Detalle del viaje: guías disponibles (ventana de 2 días), agregar al viaje,
// ordenar paradas, asignar chófer y marcar en ruta. Todo pasa por las funciones RPC de la base.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LayoutEscritorio } from '@/components/LayoutEscritorio';
import { Alerta, Boton, Cargando, ChipEstado, ErrorMsg, Tarjeta, Vacio } from '@/components/ui';
import { ChipPago, ChipViaje, EnVivo, Selector } from '@/components/escritorio';
import {
  useAccionesViaje,
  useChoferes,
  useGuiasDelViaje,
  useGuiasDisponibles,
  useViaje,
} from '@/hooks/useViaje';
import { formatearFecha, formatearFechaHora, nombreCompleto, restarDias } from '@/lib/formato';

export default function ViajeDetallePage() {
  const { viajeId } = useParams<{ viajeId: string }>();
  const viaje = useViaje(viajeId);
  const guias = useGuiasDelViaje(viajeId);
  const programado = viaje.data?.estado === 'programado';
  const disponibles = useGuiasDisponibles(viajeId, programado);
  const choferes = useChoferes(viaje.data?.recinto_id ?? null);
  const acciones = useAccionesViaje(viajeId ?? '');
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [choferElegido, setChoferElegido] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const datos = viaje.data;
  const paradas = guias.data ?? [];
  const listaDisponibles = disponibles.data ?? [];
  const choferesActivos = (choferes.data ?? []).filter((c) => c.activo);
  const choferActual = choferes.data?.find((c) => c.id === datos?.chofer_id) ?? null;
  const choferValor = choferElegido || datos?.chofer_id || '';
  const ocupado =
    acciones.agregar.isPending ||
    acciones.asignarChofer.isPending ||
    acciones.marcarEnRuta.isPending ||
    acciones.reordenar.isPending;
  const errorAccion =
    acciones.agregar.error ?? acciones.asignarChofer.error ?? acciones.marcarEnRuta.error ?? acciones.reordenar.error;

  const limpiar = () => {
    setAviso(null);
    acciones.agregar.reset();
    acciones.asignarChofer.reset();
    acciones.marcarEnRuta.reset();
    acciones.reordenar.reset();
  };

  const alternar = (id: string) => {
    setMarcadas((actual) => (actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]));
  };

  const agregar = async () => {
    limpiar();
    // Solo se envían las que siguen disponibles (otra persona pudo asignarlas mientras tanto)
    const ids = marcadas.filter((id) => listaDisponibles.some((g) => g.id === id));
    if (ids.length === 0) return;
    try {
      const agregadas = await acciones.agregar.mutateAsync(ids);
      setMarcadas([]);
      setAviso(
        agregadas === ids.length
          ? `Se agregaron ${agregadas} guía(s) al viaje.`
          : `Se agregaron ${agregadas} de ${ids.length} guías. Las demás ya no estaban disponibles.`,
      );
    } catch {
      // El mensaje se muestra desde errorAccion
    }
  };

  const mover = (indice: number, direccion: -1 | 1) => {
    const destino = indice + direccion;
    if (destino < 0 || destino >= paradas.length) return;
    limpiar();
    const ids = paradas.map((g) => g.id);
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    acciones.reordenar.mutate(ids);
  };

  const asignar = async () => {
    if (!choferValor) return;
    limpiar();
    try {
      await acciones.asignarChofer.mutateAsync(choferValor);
      setChoferElegido('');
      setAviso('Chófer asignado al viaje.');
    } catch {
      // El mensaje se muestra desde errorAccion
    }
  };

  const salir = async () => {
    limpiar();
    try {
      await acciones.marcarEnRuta.mutateAsync();
      setAviso('El viaje está en ruta. El chófer ya ve sus paradas y los clientes pueden seguirlo.');
    } catch {
      // El mensaje se muestra desde errorAccion
    }
  };

  const faltaParaSalir = !datos?.chofer_id
    ? 'Asigna un chófer para poder marcar el viaje en ruta.'
    : paradas.length === 0
      ? 'Agrega al menos una guía para poder marcar el viaje en ruta.'
      : null;

  return (
    <LayoutEscritorio
      titulo="Detalle del viaje"
      subtitulo={datos ? `Viaje del ${formatearFecha(datos.fecha_viaje)}` : 'Cargando viaje…'}
    >
      <Link
        to="/logistica/viajes"
        className="inline-flex min-h-[44px] items-center font-bold text-brand underline-offset-4 hover:underline"
      >
        ← Volver a viajes
      </Link>

      {viaje.isPending ? <Cargando mensaje="Cargando el viaje…" /> : null}
      {viaje.isError ? <ErrorMsg mensaje={viaje.error.message} onReintentar={() => void viaje.refetch()} /> : null}
      {viaje.data === null ? (
        <Vacio titulo="Viaje no encontrado" texto="Puede que no exista o que pertenezca a otro recinto." />
      ) : null}

      {datos ? (
        <>
          {aviso ? <Alerta tipo="ok">{aviso}</Alerta> : null}
          {errorAccion ? <Alerta tipo="error">{errorAccion.message}</Alerta> : null}

          <Tarjeta className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-extrabold text-ink">Viaje del {formatearFecha(datos.fecha_viaje)}</h2>
                <ChipViaje estado={datos.estado} />
              </div>
              <EnVivo />
            </div>
            <dl className="grid gap-3 text-sm text-ink-2 sm:grid-cols-3">
              <div>
                <dt className="font-bold text-ink">Chófer</dt>
                <dd>{choferActual ? nombreCompleto(choferActual) : datos.chofer_id ? 'Chófer asignado' : 'Sin asignar'}</dd>
              </div>
              <div>
                <dt className="font-bold text-ink">Paradas</dt>
                <dd>{paradas.length}</dd>
              </div>
              <div>
                <dt className="font-bold text-ink">Salida</dt>
                <dd>{formatearFechaHora(datos.salida_at)}</dd>
              </div>
            </dl>

            {programado ? (
              <div className="grid items-end gap-4 border-t border-line pt-4 md:grid-cols-[1fr_auto_auto]">
                <Selector
                  etiqueta="Chófer del viaje"
                  value={choferValor}
                  onChange={(e) => setChoferElegido(e.target.value)}
                  disabled={choferes.isPending || choferesActivos.length === 0}
                  ayuda={
                    choferesActivos.length === 0 && !choferes.isPending
                      ? 'No hay chóferes activos en este recinto. Pídele al admin que cree uno.'
                      : 'Solo chóferes activos de este recinto.'
                  }
                >
                  <option value="">Selecciona un chófer</option>
                  {choferesActivos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nombreCompleto(c)}
                    </option>
                  ))}
                </Selector>
                <Boton
                  variante="secundaria"
                  onClick={asignar}
                  disabled={ocupado || !choferValor || choferValor === datos.chofer_id}
                >
                  Asignar chófer
                </Boton>
                <Boton onClick={salir} disabled={ocupado || faltaParaSalir !== null}>
                  {acciones.marcarEnRuta.isPending ? 'Marcando…' : 'Marcar en ruta'}
                </Boton>
              </div>
            ) : null}
            {programado && faltaParaSalir ? <p className="text-sm text-ink-2">{faltaParaSalir}</p> : null}
          </Tarjeta>

          <div className="grid gap-4 xl:grid-cols-2">
            <Tarjeta className="space-y-4">
              <h2 className="text-lg font-extrabold text-ink">Paradas del viaje (en orden)</h2>
              {guias.isPending ? <Cargando mensaje="Cargando paradas…" /> : null}
              {guias.isError ? <ErrorMsg mensaje={guias.error.message} onReintentar={() => void guias.refetch()} /> : null}
              {guias.data && paradas.length === 0 ? (
                <Vacio titulo="El viaje no tiene guías" texto="Selecciona guías disponibles y agrégalas al viaje." />
              ) : null}
              {paradas.length > 0 ? (
                <ol className="space-y-3">
                  {paradas.map((g, i) => (
                    <li key={g.id} className="flex items-center gap-3 rounded-[14px] border border-line p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-extrabold text-white">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-extrabold text-ink">{g.numero}</p>
                          <ChipEstado estado={g.estado} />
                        </div>
                        <p className="text-sm text-ink-2">
                          {g.destinatario} · {g.direccion_entrega}
                        </p>
                      </div>
                      {programado ? (
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => mover(i, -1)}
                            disabled={ocupado || i === 0}
                            aria-label={`Subir la parada ${g.numero}`}
                            className="h-11 w-11 rounded-[12px] border border-line text-lg font-bold text-brand hover:bg-soft disabled:opacity-40"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => mover(i, 1)}
                            disabled={ocupado || i === paradas.length - 1}
                            aria-label={`Bajar la parada ${g.numero}`}
                            className="h-11 w-11 rounded-[12px] border border-line text-lg font-bold text-brand hover:bg-soft disabled:opacity-40"
                          >
                            ↓
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </Tarjeta>

            <Tarjeta className="space-y-4">
              <h2 className="text-lg font-extrabold text-ink">Guías disponibles</h2>
              {programado ? (
                <>
                  <p className="text-sm text-ink-2">
                    Recepcionadas entre el {formatearFecha(restarDias(datos.fecha_viaje, 2))} y el{' '}
                    {formatearFecha(datos.fecha_viaje)}, todavía sin viaje.
                  </p>
                  {disponibles.isPending ? <Cargando mensaje="Buscando guías disponibles…" /> : null}
                  {disponibles.isError ? (
                    <ErrorMsg mensaje={disponibles.error.message} onReintentar={() => void disponibles.refetch()} />
                  ) : null}
                  {disponibles.data && listaDisponibles.length === 0 ? (
                    <Vacio
                      titulo="No hay guías disponibles"
                      texto="Cuando recepción registre guías dentro de la ventana de 2 días, aparecerán aquí al instante."
                    />
                  ) : null}
                  {listaDisponibles.length > 0 ? (
                    <>
                      <ul className="max-h-[420px] divide-y divide-line overflow-y-auto rounded-[14px] border border-line">
                        {listaDisponibles.map((g) => (
                          <li key={g.id}>
                            <label className="flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-2 hover:bg-soft/60">
                              <input
                                type="checkbox"
                                checked={marcadas.includes(g.id)}
                                onChange={() => alternar(g.id)}
                                className="h-5 w-5 accent-[#C84E00]"
                              />
                              <span className="min-w-0 flex-1 text-sm">
                                <span className="block font-extrabold text-ink">
                                  {g.numero} · {g.destinatario}
                                </span>
                                <span className="block text-ink-2">
                                  {g.direccion_entrega} · Recepción {formatearFecha(g.fecha_recepcion)}
                                </span>
                              </span>
                              <ChipPago guia={g} />
                            </label>
                          </li>
                        ))}
                      </ul>
                      <Boton onClick={agregar} disabled={ocupado || marcadas.length === 0} className="w-full">
                        {acciones.agregar.isPending ? 'Agregando…' : `Agregar al viaje (${marcadas.length})`}
                      </Boton>
                    </>
                  ) : null}
                </>
              ) : (
                <Alerta tipo="info">El viaje ya salió o terminó: no se pueden sumar más guías.</Alerta>
              )}
            </Tarjeta>
          </div>
        </>
      ) : null}
    </LayoutEscritorio>
  );
}
