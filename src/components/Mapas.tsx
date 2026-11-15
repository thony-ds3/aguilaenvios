// [FE] Mapas OpenStreetMap: paradas numeradas con la posición del chófer, y selector de punto de entrega.
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { divIcon, latLngBounds } from 'leaflet';

export const CENTRO_LA_PAZ: [number, number] = [-16.4955, -68.1336];

const MOSAICOS = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUCION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const iconoChofer = divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#C84E00;border:4px solid #fff;box-shadow:0 0 0 4px rgba(242,106,27,.45)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const iconoDestino = divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#C84E00;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

// El número viene de la app (no del usuario), así que es seguro insertarlo en el HTML del ícono
function iconoParada(numero: number, entregada: boolean) {
  return divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${entregada ? '#17582F' : '#1F1A17'};color:#fff;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font:700 13px system-ui;box-shadow:0 1px 4px rgba(0,0,0,.45)">${numero}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export interface PuntoParada {
  id: string;
  numero: number;
  lat: number;
  lng: number;
  entregada: boolean;
}

// Encuadra todas las paradas (y al chófer). Solo se vuelve a encuadrar cuando cambian las paradas.
function Encuadrar({ puntos, firma }: { puntos: [number, number][]; firma: string }) {
  const map = useMap();
  useEffect(() => {
    if (puntos.length === 0) return;
    if (puntos.length === 1) {
      map.setView(puntos[0], 15);
      return;
    }
    map.fitBounds(latLngBounds(puntos), { padding: [36, 36] });
    // `firma` resume los puntos: evita re-encuadrar en cada movimiento del chófer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, map]);
  return null;
}

export function MapaParadas({
  paradas,
  chofer,
  descripcion,
}: {
  paradas: PuntoParada[];
  chofer: { lat: number; lng: number } | null;
  descripcion: string;
}) {
  const puntos: [number, number][] = paradas.map((p) => [p.lat, p.lng]);
  if (chofer) puntos.push([chofer.lat, chofer.lng]);
  const firma = `${paradas.map((p) => `${p.lat},${p.lng}`).join('|')}#${chofer ? 'chofer' : ''}`;
  const centro: [number, number] = puntos[0] ?? CENTRO_LA_PAZ;

  return (
    <div role="img" aria-label={descripcion} className="isolate h-72 w-full overflow-hidden rounded-[16px] border border-line">
      <MapContainer center={centro} zoom={14} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer url={MOSAICOS} attribution={ATRIBUCION} />
        {paradas.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={iconoParada(p.numero, p.entregada)} />
        ))}
        {chofer ? <Marker position={[chofer.lat, chofer.lng]} icon={iconoChofer} /> : null}
        <Encuadrar puntos={puntos} firma={firma} />
      </MapContainer>
    </div>
  );
}

function CapturarClic({ onCambio }: { onCambio: (p: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(evento) {
      onCambio({
        lat: Number(evento.latlng.lat.toFixed(6)),
        lng: Number(evento.latlng.lng.toFixed(6)),
      });
    },
  });
  return null;
}

// Selector opcional del punto de entrega: un clic en el mapa fija lat/lng de la guía
export function MapaSelector({
  valor,
  onCambio,
}: {
  valor: { lat: number; lng: number } | null;
  onCambio: (p: { lat: number; lng: number }) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Mapa para marcar el punto de entrega. Haz clic sobre el mapa para fijar el destino."
      className="isolate h-64 w-full overflow-hidden rounded-[16px] border border-line"
    >
      <MapContainer center={valor ? [valor.lat, valor.lng] : CENTRO_LA_PAZ} zoom={13} className="h-full w-full">
        <TileLayer url={MOSAICOS} attribution={ATRIBUCION} />
        <CapturarClic onCambio={onCambio} />
        {valor ? <Marker position={[valor.lat, valor.lng]} icon={iconoDestino} /> : null}
      </MapContainer>
    </div>
  );
}
