// [FE] Chófer · Mi ruta (móvil, sin barra inferior): paradas en orden con mapa, GPS en vivo,
// pantalla encendida y confirmación de entregas. El superadmin ve una versión de supervisión (solo lectura).
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutEscritorio } from '@/components/LayoutEscritorio';
import { Alerta, Boton, CabeceraNaranja, Cargando, ChipEstado, ErrorMsg, Tarjeta, Vacio } from '@/components/ui';
import { Chip, Selector, SinRecinto } from '@/components/escritorio';
import { MapaParadas, type PuntoParada } from '@/components/Mapas';
import { useAuth } from '@/hooks/useAuth';
import { useRecinto } from '@/hooks/useRecinto';
import { useAhora } from '@/hooks/useRealtime';
import { useUbicacionEnVivo } from '@/hooks/useRastreo';
import { MODO_PRUEBA, RUTA_PRUEBA, useUbicacion, type Punto } from '@/hooks/useUbicacion';
import { useChoferes, useConfirmarEntrega, useParadas, useViajeDelChofer, useViajes } from '@/hooks/useViaje';
import { formatearFecha, haceCuanto, nombreCompleto } from '@/lib/formato';
import type { Parada } from '@/lib/tipos';

function puntosDe(paradas: Parada[]): PuntoParada[] {
  return paradas.flatMap((p, i) =>
    p.lat !== null && p.lng !== null
      ? [{ id: p.guia_id, numero: i + 1, lat: p.lat, lng: p.lng, entregada: p.estado === 'entregada' }]
      : [],
  );
}

function ListaParadas({ paradas, accion }: { paradas: Parada[]; accion?: (p: Parada) => ReactNode }) {
  return (
    <ol className="space-y-3">
      {paradas.map((p, i) => (
        <li key={p.guia_id} className="space-y-3 rounded-[16px] border border-line bg-white p-4">
          <div className="flex items-start gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white ${p.estado === 'entregada' ? 'bg-ok-fg' : 'bg-ink'}`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-extrabold text-ink">{p.numero}</p>
                <ChipEstado estado={p.estado} />
              </div>
              <p className="text-sm font-bold text-ink">{p.destinatario}</p>
              <p className="text-sm text-ink-2">{p.direccion_entrega}</p>
            </div>
          </div>
          {accion ? accion(p) : null}
        </li>
      ))}
    </ol>
  );
}

function RutaChofer() {
  const { user, perfil, cerrarSesion } = useAuth();
  const navigate = useNavigate();
  const uid = user?.id ?? null;
  const viaje = useViajeDelChofer(uid);
  const datos = viaje.data ?? null;
  const enRuta = datos?.estado === 'en_ruta';
  const paradas = useParadas(datos?.id ?? null);
  const confirmar = useConfirmarEntrega();
  const gps = useUbicacion(uid, enRuta);
  const ahora = useAhora(1000);
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null);
  const [finalizada, setFinalizada] = useState(false);

  const lista = paradas.data ?? [];
  const pendientes = lista.filter((p) => p.estado !== 'entregada');
  const puntos = puntosDe(lista);
  const proxima = pendientes[0] ?? null;

  const entregar = async (guiaId: string) => {
    try {
      await confirmar.mutateAsync(guiaId);
      setPorConfirmar(null);
      if (pendientes.length <= 1) setFinalizada(true);
    } catch {
      // El mensaje se muestra desde confirmar.error
    }
  };

  // Modo prueba: recorre las paradas pendientes con coordenadas, o una ruta fija del centro de La Paz
  const simularRecorrido = () => {
    const destinos: Punto[] = puntos.filter((p) => !p.entregada).map((p) => ({ lat: p.lat, lng: p.lng }));
    const ruta = destinos.length > 0 ? [{ lat: destinos[0].lat - 0.008, lng: destinos[0].lng - 0.008 }, ...destinos] : RUTA_PRUEBA;
    gps.simular(ruta);
  };

  const salir = async () => {
    gps.detener();
    await cerrarSesion();
    navigate('/login', { replace: true });
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-white md:my-6 md:min-h-[844px] md:overflow-hidden md:rounded-[32px] md:border md:border-line md:shadow-xl">
      <CabeceraNaranja
        titulo="Mi ruta"
        subtitulo={
          enRuta
            ? `${pendientes.length} parada(s) pendiente(s) de ${lista.length}`
            : 'Paradas en orden, ubicación y entregas'
        }
      />
      <main className="flex-1 space-y-4 p-4 pb-8">
        {viaje.isPending ? <Cargando mensaje="Buscando tu viaje…" /> : null}
        {viaje.isError ? <ErrorMsg mensaje={viaje.error.message} onReintentar={() => void viaje.refetch()} /> : null}

        {viaje.data === null && finalizada ? (
          <Alerta tipo="ok">¡Ruta finalizada! Confirmaste todas las entregas y el viaje quedó cerrado.</Alerta>
        ) : null}
        {viaje.data === null && !finalizada ? (
          <Vacio titulo="No tienes viajes asignados" texto="Cuando logística te asigne un viaje, aparecerá aquí sin recargar la página." />
        ) : null}

        {datos && !enRuta ? (
          <Alerta tipo="info">
            Tienes un viaje programado para el {formatearFecha(datos.fecha_viaje)}. Podrás compartir tu ubicación y confirmar
            entregas cuando logística lo marque en ruta.
          </Alerta>
        ) : null}

        {datos && enRuta ? (
          <Tarjeta className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-ink">Ubicación</h2>
              {gps.compartiendo ? (
                <Chip tono="ok">
                  {gps.simulando
                    ? 'Recorrido simulado'
                    : gps.estado === 'solicitando'
                      ? 'Buscando señal GPS'
                      : 'Ubicación compartida'}
                </Chip>
              ) : (
                <Chip tono="pend">Ubicación detenida</Chip>
              )}
            </div>

            {gps.compartiendo ? (
              <Alerta tipo="info">
                Deja esta página abierta y el teléfono desbloqueado. Si cambias de aplicación, el envío se pausa hasta que vuelvas.
              </Alerta>
            ) : (
              <p className="text-sm text-ink-2">
                Al tocar "Compartir ubicación", el navegador te pedirá permiso para usar el GPS. Tu posición se envía solo
                mientras la ruta está activa, para que el cliente vea por dónde va su pedido.
              </p>
            )}

            {gps.compartiendo && !gps.pantallaActiva ? (
              <p className="text-sm font-bold text-red-800">
                Este navegador no pudo mantener la pantalla encendida. Evita que el teléfono se bloquee.
              </p>
            ) : null}
            {gps.errorGps ? <Alerta tipo="error">{gps.errorGps}</Alerta> : null}
            {gps.errorEnvio ? <Alerta tipo="error">No se pudo enviar la ubicación: {gps.errorEnvio}</Alerta> : null}
            {gps.aviso ? <Alerta tipo="info">{gps.aviso}</Alerta> : null}
            {gps.ultimoEnvio ? (
              <p className="text-xs text-ink-2">Último envío: {haceCuanto(gps.ultimoEnvio, ahora)}</p>
            ) : null}

            {gps.compartiendo ? (
              <Boton variante="peligro" className="w-full" onClick={gps.detener}>
                Detener ruta
              </Boton>
            ) : (
              <Boton className="w-full" onClick={gps.iniciar}>
                Compartir ubicación
              </Boton>
            )}
            {MODO_PRUEBA && !gps.compartiendo ? (
              <Boton variante="secundaria" className="w-full" onClick={simularRecorrido}>
                Simular recorrido (modo prueba)
              </Boton>
            ) : null}
          </Tarjeta>
        ) : null}

        {datos ? (
          <>
            {paradas.isPending ? <Cargando mensaje="Cargando tus paradas…" /> : null}
            {paradas.isError ? (
              <ErrorMsg mensaje={paradas.error.message} onReintentar={() => void paradas.refetch()} />
            ) : null}
            {paradas.data && lista.length === 0 ? (
              <Vacio titulo="El viaje aún no tiene paradas" texto="Logística todavía está armando la ruta." />
            ) : null}

            {enRuta && proxima ? (
              <Tarjeta className="space-y-1 bg-soft">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-2">Próxima parada</p>
                <p className="text-lg font-extrabold text-ink">{proxima.destinatario}</p>
                <p className="text-sm text-ink-2">{proxima.direccion_entrega}</p>
              </Tarjeta>
            ) : null}

            {puntos.length > 0 || gps.posicion ? (
              <MapaParadas
                paradas={puntos}
                chofer={gps.posicion}
                descripcion={`Mapa de la ruta con ${puntos.length} parada(s) marcada(s)${gps.posicion ? ' y tu posición actual' : ''}.`}
              />
            ) : lista.length > 0 ? (
              <p className="text-sm text-ink-2">Las paradas no tienen punto en el mapa; usa la dirección de cada una.</p>
            ) : null}

            {confirmar.isError ? <Alerta tipo="error">{confirmar.error.message}</Alerta> : null}

            {lista.length > 0 ? (
              <ListaParadas
                paradas={lista}
                accion={(p) => {
                  if (!enRuta || p.estado !== 'en_ruta') return null;
                  if (porConfirmar === p.guia_id) {
                    return (
                      <div className="grid grid-cols-2 gap-2">
                        <Boton onClick={() => void entregar(p.guia_id)} disabled={confirmar.isPending}>
                          {confirmar.isPending ? 'Confirmando…' : 'Sí, entregada'}
                        </Boton>
                        <Boton variante="secundaria" onClick={() => setPorConfirmar(null)} disabled={confirmar.isPending}>
                          Cancelar
                        </Boton>
                      </div>
                    );
                  }
                  return (
                    <Boton
                      className="w-full"
                      onClick={() => {
                        confirmar.reset();
                        setPorConfirmar(p.guia_id);
                      }}
                    >
                      Marcar como entregada
                    </Boton>
                  );
                }}
              />
            ) : null}
          </>
        ) : null}

        <Tarjeta className="space-y-3">
          <p className="text-sm text-ink-2">
            <span className="font-bold text-ink">Chófer:</span> {perfil ? nombreCompleto(perfil) : '—'}
          </p>
          <Boton variante="secundaria" className="w-full" onClick={() => void salir()}>
            Cerrar sesión
          </Boton>
        </Tarjeta>
      </main>
    </div>
  );
}

// Superadmin: supervisa las rutas en curso del recinto elegido. No confirma entregas ni comparte ubicación.
function SupervisionRuta() {
  const { recintoId, cargando } = useRecinto();
  const viajes = useViajes(recintoId);
  const choferes = useChoferes(recintoId);
  const [elegido, setElegido] = useState('');
  const ahora = useAhora(1000);

  const enCurso = (viajes.data ?? []).filter((v) => v.estado === 'en_ruta');
  const viaje = enCurso.find((v) => v.id === elegido) ?? enCurso[0] ?? null;
  const paradas = useParadas(viaje?.id ?? null);
  const ubicacion = useUbicacionEnVivo(viaje?.chofer_id ?? null);
  const lista = paradas.data ?? [];
  const puntos = puntosDe(lista);
  const posicion = ubicacion.data ? { lat: ubicacion.data.lat, lng: ubicacion.data.lng } : null;

  const nombreChofer = (id: string | null): string => {
    const chofer = choferes.data?.find((c) => c.id === id);
    return chofer ? nombreCompleto(chofer) : 'Chófer';
  };

  return (
    <LayoutEscritorio titulo="Rutas en curso" subtitulo="Supervisión de la vista del chófer (solo lectura)">
      {cargando ? <Cargando mensaje="Cargando recintos…" /> : null}
      {!cargando && !recintoId ? <SinRecinto /> : null}

      {recintoId ? (
        <>
          <Alerta tipo="info">
            Confirmar entregas y compartir ubicación son acciones exclusivas de la cuenta del chófer. Aquí ves su ruta en vivo.
          </Alerta>
          {viajes.isPending ? <Cargando mensaje="Buscando viajes en ruta…" /> : null}
          {viajes.isError ? <ErrorMsg mensaje={viajes.error.message} onReintentar={() => void viajes.refetch()} /> : null}
          {viajes.data && enCurso.length === 0 ? (
            <Vacio titulo="No hay viajes en ruta" texto="Cuando logística marque un viaje en ruta en este recinto, aparecerá aquí." />
          ) : null}

          {viaje ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <Tarjeta className="space-y-4">
                <Selector etiqueta="Viaje en ruta" value={viaje.id} onChange={(e) => setElegido(e.target.value)}>
                  {enCurso.map((v) => (
                    <option key={v.id} value={v.id}>
                      {formatearFecha(v.fecha_viaje)} · {nombreChofer(v.chofer_id)}
                    </option>
                  ))}
                </Selector>
                {puntos.length > 0 || posicion ? (
                  <MapaParadas
                    paradas={puntos}
                    chofer={posicion}
                    descripcion={`Mapa del viaje con ${puntos.length} parada(s)${posicion ? ' y la posición del chófer' : ''}.`}
                  />
                ) : (
                  <p className="text-sm text-ink-2">Sin puntos en el mapa: las paradas no tienen coordenadas y el chófer aún no comparte su ubicación.</p>
                )}
                <p className="text-sm text-ink-2">
                  <span className="font-bold text-ink">Ubicación del chófer:</span>{' '}
                  {ubicacion.data ? `actualizada ${haceCuanto(ubicacion.data.actualizado, ahora)}` : 'sin registro'}
                </p>
              </Tarjeta>
              <div className="space-y-3">
                {paradas.isPending ? <Cargando mensaje="Cargando paradas…" /> : null}
                {paradas.isError ? (
                  <ErrorMsg mensaje={paradas.error.message} onReintentar={() => void paradas.refetch()} />
                ) : null}
                {lista.length > 0 ? <ListaParadas paradas={lista} /> : null}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </LayoutEscritorio>
  );
}

export default function RutaPage() {
  const { perfil } = useAuth();
  return perfil?.rol === 'superadmin' ? <SupervisionRuta /> : <RutaChofer />;
}
