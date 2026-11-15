// [FE] Mapa OpenStreetMap (gratis, sin tarjeta) con el marcador del chófer. Se re-centra al moverse.
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';

const icono = divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#C84E00;border:4px solid #fff;box-shadow:0 0 0 4px rgba(242,106,27,.45)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function Seguir({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.panTo([lat, lng], { animate: true });
  }, [lat, lng, map]);
  return null;
}

export function MapaRastreo({ lat, lng, etiqueta }: { lat: number; lng: number; etiqueta: string }) {
  return (
    <div
      role="img"
      aria-label={`Mapa en vivo. ${etiqueta}. Posición actual: latitud ${lat.toFixed(5)}, longitud ${lng.toFixed(5)}.`}
      className="isolate h-64 w-full overflow-hidden rounded-[16px] border border-line"
    >
      <MapContainer center={[lat, lng]} zoom={16} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Marker position={[lat, lng]} icon={icono} />
        <Seguir lat={lat} lng={lng} />
      </MapContainer>
    </div>
  );
}
