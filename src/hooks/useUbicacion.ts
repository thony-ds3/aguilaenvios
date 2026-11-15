// [FE→BE] GPS del chófer: geolocalización del navegador + upsert a `ubicaciones` cada 4,5 s,
// solo con la ruta activa. Mantiene la pantalla encendida (Screen Wake Lock) y se reanuda
// al volver de segundo plano. Incluye el simulador de recorrido del modo prueba.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { traducirError } from '@/lib/errores';

// Modo prueba: se activa con VITE_MODO_PRUEBA=true (en producción debe quedar en false)
export const MODO_PRUEBA: boolean = import.meta.env.VITE_MODO_PRUEBA === 'true';

const INTERVALO_MS = 4500;

export interface Punto {
  lat: number;
  lng: number;
}

export type EstadoGps = 'detenido' | 'solicitando' | 'compartiendo';

// Ruta predefinida del modo prueba (centro de La Paz) para cuando las paradas no tienen coordenadas
export const RUTA_PRUEBA: Punto[] = [
  { lat: -16.4957, lng: -68.1335 },
  { lat: -16.4963, lng: -68.1372 },
  { lat: -16.501, lng: -68.133 },
  { lat: -16.5046, lng: -68.1304 },
  { lat: -16.5106, lng: -68.1268 },
  { lat: -16.5113, lng: -68.1228 },
];

function interpolar(ruta: Punto[], pasos: number): Punto[] {
  if (ruta.length < 2) return ruta;
  const puntos: Punto[] = [];
  for (let i = 0; i < ruta.length - 1; i += 1) {
    const a = ruta[i];
    const b = ruta[i + 1];
    for (let k = 0; k < pasos; k += 1) {
      puntos.push({ lat: a.lat + ((b.lat - a.lat) * k) / pasos, lng: a.lng + ((b.lng - a.lng) * k) / pasos });
    }
  }
  puntos.push(ruta[ruta.length - 1]);
  return puntos;
}

export function useUbicacion(choferId: string | null, rutaActiva: boolean) {
  const [estado, setEstado] = useState<EstadoGps>('detenido');
  const [errorGps, setErrorGps] = useState<string | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [posicion, setPosicion] = useState<Punto | null>(null);
  const [ultimoEnvio, setUltimoEnvio] = useState<string | null>(null);
  const [pantallaActiva, setPantallaActiva] = useState(false);
  const [simulando, setSimulando] = useState(false);

  const posRef = useRef<Punto | null>(null);
  const watchRef = useRef<number | null>(null);
  const relojRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const envioRef = useRef(0);
  const enviandoRef = useRef(false);
  const pantallaRef = useRef<WakeLockSentinel | null>(null);
  const simRef = useRef<{ puntos: Punto[]; i: number } | null>(null);
  const activoRef = useRef(false);
  const ocultoRef = useRef(false);
  const detenerRef = useRef<() => void>(() => undefined);

  // Escribe la última posición conocida en `ubicaciones` (una fila por chófer)
  const enviar = useCallback(async () => {
    const p = posRef.current;
    if (!p || !choferId || enviandoRef.current) return;
    enviandoRef.current = true;
    envioRef.current = Date.now();
    const ahora = new Date().toISOString();
    const { error } = await supabase
      .from('ubicaciones')
      .upsert({ chofer_id: choferId, lat: p.lat, lng: p.lng, actualizado: ahora }, { onConflict: 'chofer_id' });
    enviandoRef.current = false;
    if (error) {
      setErrorEnvio(traducirError(error));
    } else {
      setErrorEnvio(null);
      setUltimoEnvio(ahora);
    }
  }, [choferId]);

  const pedirPantalla = useCallback(async () => {
    if (!('wakeLock' in navigator)) {
      setPantallaActiva(false);
      return;
    }
    try {
      const bloqueo = await navigator.wakeLock.request('screen');
      pantallaRef.current = bloqueo;
      setPantallaActiva(true);
      bloqueo.addEventListener('release', () => setPantallaActiva(false));
    } catch {
      setPantallaActiva(false);
    }
  }, []);

  const observar = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        posRef.current = p;
        setPosicion(p);
        setErrorGps(null);
        setEstado('compartiendo');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          detenerRef.current();
          setErrorGps(
            'Permiso de ubicación denegado. Actívalo en el candado de la barra de direcciones (Permisos > Ubicación) y vuelve a tocar "Compartir ubicación".',
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setErrorGps('Sin señal GPS. Activa la ubicación del teléfono y sal a un lugar despejado; se reintenta solo.');
        } else {
          setErrorGps('El GPS está tardando en responder. Se sigue intentando; mantén la página abierta.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }, []);

  const arrancarReloj = useCallback(() => {
    if (relojRef.current) clearInterval(relojRef.current);
    relojRef.current = setInterval(() => {
      if (Date.now() - envioRef.current < INTERVALO_MS) return;
      const sim = simRef.current;
      if (sim) {
        sim.i = Math.min(sim.i + 1, sim.puntos.length - 1);
        const p = sim.puntos[sim.i];
        posRef.current = p;
        setPosicion(p);
      }
      void enviar();
    }, 1000);
  }, [enviar]);

  const detener = useCallback(() => {
    activoRef.current = false;
    ocultoRef.current = false;
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (relojRef.current) {
      clearInterval(relojRef.current);
      relojRef.current = null;
    }
    simRef.current = null;
    const bloqueo = pantallaRef.current;
    pantallaRef.current = null;
    if (bloqueo) void bloqueo.release().catch(() => undefined);
    setPantallaActiva(false);
    setSimulando(false);
    setEstado('detenido');
  }, []);

  useEffect(() => {
    detenerRef.current = detener;
  }, [detener]);

  const iniciar = useCallback(() => {
    setErrorGps(null);
    setErrorEnvio(null);
    setAviso(null);
    if (!choferId || !rutaActiva) {
      setErrorGps('Solo puedes compartir tu ubicación cuando tu viaje está en ruta.');
      return;
    }
    if (!window.isSecureContext) {
      setErrorGps('La ubicación solo funciona con conexión segura (HTTPS). Abre la app desde su dirección https://');
      return;
    }
    if (!('geolocation' in navigator)) {
      setErrorGps('Este navegador no permite obtener la ubicación. Usa Chrome en Android.');
      return;
    }
    detener();
    activoRef.current = true;
    envioRef.current = 0;
    setEstado('solicitando');
    observar();
    arrancarReloj();
    void pedirPantalla();
  }, [choferId, rutaActiva, detener, observar, arrancarReloj, pedirPantalla]);

  // Modo prueba: mueve un punto por una ruta predefinida escribiendo en `ubicaciones`
  const simular = useCallback(
    (ruta: Punto[]) => {
      if (!choferId || !rutaActiva || ruta.length === 0) return;
      detener();
      setErrorGps(null);
      setErrorEnvio(null);
      setAviso(null);
      activoRef.current = true;
      envioRef.current = 0;
      simRef.current = { puntos: interpolar(ruta, 10), i: -1 };
      posRef.current = ruta[0];
      setPosicion(ruta[0]);
      setSimulando(true);
      setEstado('compartiendo');
      arrancarReloj();
      void pedirPantalla();
    },
    [choferId, rutaActiva, detener, arrancarReloj, pedirPantalla],
  );

  // Pestaña en segundo plano: el navegador pausa el GPS y libera la pantalla. Al volver, se reanuda.
  useEffect(() => {
    const alCambiar = () => {
      if (!activoRef.current) return;
      if (document.visibilityState === 'hidden') {
        ocultoRef.current = true;
        return;
      }
      if (ocultoRef.current) {
        ocultoRef.current = false;
        setAviso('La página estuvo en segundo plano y el envío de ubicación se pausó. Ya se reanudó.');
      }
      void pedirPantalla();
      if (!simRef.current) observar();
      envioRef.current = 0;
    };
    document.addEventListener('visibilitychange', alCambiar);
    return () => document.removeEventListener('visibilitychange', alCambiar);
  }, [observar, pedirPantalla]);

  // Si la ruta deja de estar activa (última entrega confirmada), se detiene el envío
  useEffect(() => {
    if (!rutaActiva && activoRef.current) detener();
  }, [rutaActiva, detener]);

  // Al salir de la pantalla se libera el GPS, el reloj y la pantalla
  useEffect(() => () => detenerRef.current(), []);

  return {
    estado,
    compartiendo: estado !== 'detenido',
    errorGps,
    errorEnvio,
    aviso,
    posicion,
    ultimoEnvio,
    pantallaActiva,
    simulando,
    iniciar,
    detener,
    simular,
  };
}
