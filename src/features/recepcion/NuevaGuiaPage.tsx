// [FE] Recepción 1/3 · Nueva guía: formulario en dos columnas, cliente opcional y punto de entrega opcional.
// La guía se crea en estado "enviada a logística" y aparece sola en logística (Realtime).
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { LayoutEscritorio } from '@/components/LayoutEscritorio';
import { Campo, CampoControlado } from '@/components/Campo';
import { Alerta, Boton, Cargando, Tarjeta } from '@/components/ui';
import { SinRecinto } from '@/components/escritorio';
import { MapaSelector } from '@/components/Mapas';
import { useRecinto } from '@/hooks/useRecinto';
import { useBuscarClientes, useCrearGuia } from '@/hooks/useGuias';
import {
  campoNombre,
  decimalNoNegativo,
  decimalPositivo,
  direccionSchema,
  enteroPositivo,
  filtrarDecimal,
  filtrarDigitos,
  filtrarEntero,
  filtrarNombre,
  telefonoOpcionalSchema,
} from '@/lib/validacion';
import { formatearMonto, nombreCompleto } from '@/lib/formato';
import type { Guia, Perfil } from '@/lib/tipos';

const guiaSchema = z.object({
  remitente: campoNombre('El remitente'),
  destinatario: campoNombre('El destinatario'),
  telefono: telefonoOpcionalSchema,
  direccion: direccionSchema,
  paquetes: enteroPositivo('La cantidad de paquetes'),
  peso: decimalPositivo('El peso'),
  costo: decimalNoNegativo('El costo'),
});
type GuiaValores = z.infer<typeof guiaSchema>;

const VACIO: GuiaValores = { remitente: '', destinatario: '', telefono: '', direccion: '', paquetes: '1', peso: '', costo: '' };

export default function NuevaGuiaPage() {
  const { recintoId, recinto, cargando } = useRecinto();
  const crear = useCrearGuia();
  const [creada, setCreada] = useState<Guia | null>(null);
  const [cliente, setCliente] = useState<Perfil | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [punto, setPunto] = useState<{ lat: number; lng: number } | null>(null);
  const [verMapa, setVerMapa] = useState(false);
  const clientes = useBuscarClientes(cliente ? '' : busqueda);

  const { control, register, handleSubmit, reset, formState: { errors } } = useForm<GuiaValores>({
    resolver: zodResolver(guiaSchema),
    defaultValues: VACIO,
  });

  const onSubmit = async (v: GuiaValores) => {
    if (!recintoId) return;
    try {
      const guia = await crear.mutateAsync({
        recinto_id: recintoId,
        cliente_id: cliente?.id ?? null,
        remitente: v.remitente,
        destinatario: v.destinatario,
        telefono_destinatario: v.telefono || null,
        direccion_entrega: v.direccion,
        lat: punto?.lat ?? null,
        lng: punto?.lng ?? null,
        cantidad_paquetes: Number(v.paquetes),
        peso_kg: Number(v.peso),
        costo: Number(v.costo),
      });
      setCreada(guia);
      reset(VACIO);
      setCliente(null);
      setBusqueda('');
      setPunto(null);
      setVerMapa(false);
    } catch {
      // El mensaje se muestra desde crear.error
    }
  };

  return (
    <LayoutEscritorio titulo="Nueva guía" subtitulo={`Registro de envíos${recinto ? ` · ${recinto.nombre}` : ''}`}>
      {cargando ? <Cargando mensaje="Cargando tu recinto…" /> : null}
      {!cargando && !recintoId ? <SinRecinto /> : null}

      {recintoId && creada ? (
        <Tarjeta className="max-w-2xl space-y-4">
          <Alerta tipo="ok">La guía se creó y ya está en logística.</Alerta>
          <div>
            <p className="text-sm font-bold text-ink-2">Número de guía</p>
            <p className="text-4xl font-extrabold tracking-wide text-brand">{creada.numero}</p>
          </div>
          {creada.codigo_rastreo ? (
            <div>
              <p className="text-sm font-bold text-ink-2">Código de rastreo (entrégalo al cliente)</p>
              <p className="font-mono text-2xl font-extrabold tracking-widest text-ink">{creada.codigo_rastreo}</p>
              <p className="text-xs text-ink-2">
                Sirve para seguir el envío sin la fecha y evita que alguien adivine el número correlativo.
              </p>
            </div>
          ) : null}
          <dl className="grid gap-2 text-sm text-ink-2 sm:grid-cols-2">
            <div>
              <dt className="font-bold text-ink">Destinatario</dt>
              <dd>{creada.destinatario}</dd>
            </div>
            <div>
              <dt className="font-bold text-ink">Costo</dt>
              <dd>{formatearMonto(creada.costo)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-3">
            {Number(creada.costo) > 0 ? (
              <Link
                to={`/recepcion/cobro?guia=${creada.id}`}
                className="inline-flex min-h-[52px] items-center justify-center rounded-[14px] bg-brand px-5 font-bold text-white hover:bg-[#A83F00]"
              >
                Registrar cobro
              </Link>
            ) : null}
            <Boton variante="secundaria" onClick={() => setCreada(null)}>
              Crear otra guía
            </Boton>
          </div>
        </Tarjeta>
      ) : null}

      {recintoId && !creada ? (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-4xl space-y-4">
          {crear.isError ? <Alerta tipo="error">{crear.error.message}</Alerta> : null}

          <Tarjeta className="space-y-4">
            <h2 className="text-lg font-extrabold text-ink">Datos del envío</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <CampoControlado
                control={control}
                name="remitente"
                filtro={filtrarNombre}
                etiqueta="Remitente"
                placeholder="Nombre de quien envía"
                ayuda="Solo letras, tildes y ñ. Sin vocales repetidas seguidas."
              />
              <CampoControlado
                control={control}
                name="destinatario"
                filtro={filtrarNombre}
                etiqueta="Destinatario"
                placeholder="Nombre de quien recibe"
                ayuda="Solo letras, tildes y ñ. Sin vocales repetidas seguidas."
              />
              <CampoControlado
                control={control}
                name="telefono"
                filtro={(a, n) => filtrarDigitos(a, n, 15)}
                etiqueta="Teléfono del destinatario"
                inputMode="numeric"
                placeholder="71234567"
                ayuda="Solo números, de 7 a 15 dígitos. Opcional."
              />
              <Campo
                etiqueta="Dirección de entrega"
                placeholder="Calle, número, zona y referencia"
                maxLength={200}
                error={errors.direccion?.message}
                {...register('direccion')}
              />
              <CampoControlado
                control={control}
                name="paquetes"
                filtro={filtrarEntero}
                etiqueta="Cantidad de paquetes"
                inputMode="numeric"
                ayuda="Número entero, mínimo 1."
              />
              <CampoControlado
                control={control}
                name="peso"
                filtro={filtrarDecimal}
                etiqueta="Peso (kg)"
                inputMode="decimal"
                placeholder="0.00"
                ayuda="Mayor que cero, hasta 2 decimales."
              />
              <CampoControlado
                control={control}
                name="costo"
                filtro={filtrarDecimal}
                etiqueta="Costo (Bs)"
                inputMode="decimal"
                placeholder="0.00"
                ayuda="No negativo, hasta 2 decimales."
              />
            </div>
          </Tarjeta>

          <Tarjeta className="space-y-3">
            <h2 className="text-lg font-extrabold text-ink">Cliente (opcional)</h2>
            <p className="text-sm text-ink-2">
              Si el cliente ya tiene cuenta, vincúlalo para que vea la guía en "Mis envíos". Si no, podrá agregarla después con el código de rastreo de 12 caracteres que aparece al crear la guía.
            </p>
            {cliente ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-soft p-3">
                <p className="text-sm font-bold text-ink">
                  {nombreCompleto(cliente)}
                  {cliente.telefono ? <span className="font-normal text-ink-2"> · {cliente.telefono}</span> : null}
                </p>
                <Boton variante="fantasma" onClick={() => setCliente(null)}>
                  Quitar cliente
                </Boton>
              </div>
            ) : (
              <>
                <Campo
                  etiqueta="Buscar cliente por nombre o teléfono"
                  placeholder="Escribe al menos 2 letras"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
                {clientes.isFetching ? <p className="text-sm text-ink-2">Buscando…</p> : null}
                {clientes.isError ? <Alerta tipo="error">{clientes.error.message}</Alerta> : null}
                {clientes.data && clientes.data.length === 0 ? (
                  <p className="text-sm text-ink-2">No hay clientes con ese nombre o teléfono.</p>
                ) : null}
                {clientes.data && clientes.data.length > 0 ? (
                  <ul className="divide-y divide-line rounded-[14px] border border-line">
                    {clientes.data.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setCliente(c)}
                          className="flex min-h-[48px] w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-soft"
                        >
                          <span className="font-bold text-ink">{nombreCompleto(c)}</span>
                          <span className="text-ink-2">{c.telefono ?? 'Sin teléfono'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </Tarjeta>

          <Tarjeta className="space-y-3">
            <h2 className="text-lg font-extrabold text-ink">Punto de entrega en el mapa (opcional)</h2>
            <p className="text-sm text-ink-2">
              Marca el destino para que el chófer vea la parada en su mapa.
            </p>
            {verMapa ? (
              <>
                <MapaSelector valor={punto} onCambio={setPunto} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-ink">
                    {punto ? `Punto marcado: ${punto.lat}, ${punto.lng}` : 'Haz clic en el mapa para marcar el destino.'}
                  </p>
                  <Boton
                    variante="fantasma"
                    onClick={() => {
                      setPunto(null);
                      setVerMapa(false);
                    }}
                  >
                    Quitar punto
                  </Boton>
                </div>
              </>
            ) : (
              <Boton variante="secundaria" onClick={() => setVerMapa(true)}>
                Marcar punto en el mapa
              </Boton>
            )}
          </Tarjeta>

          <Boton type="submit" disabled={crear.isPending} className="w-full md:w-auto">
            {crear.isPending ? 'Creando guía…' : 'Crear guía'}
          </Boton>
        </form>
      ) : null}
    </LayoutEscritorio>
  );
}
