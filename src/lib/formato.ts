// [FE] Formato de fechas (hora de Bolivia, America/La_Paz), montos y textos en español

export function formatearFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-BO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/La_Paz',
  });
}

// Para fechas sin hora (fecha_recepcion, fecha_viaje: tipo date)
export function formatearFecha(fechaISO: string | null | undefined): string {
  if (!fechaISO) return '—';
  return new Date(`${fechaISO}T12:00:00`).toLocaleDateString('es-BO', {
    dateStyle: 'medium',
    timeZone: 'America/La_Paz',
  });
}

export function formatearHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/La_Paz',
  });
}

export function formatearMonto(valor: number): string {
  return `Bs ${Number(valor).toFixed(2)}`;
}

// "hace 12 s", "hace 3 min", "hace 2 h"
export function haceCuanto(iso: string, ahora: number): string {
  const s = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

// Resta días a una fecha AAAA-MM-DD (para mostrar la ventana de 2 días de logística)
export function restarDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

export function nombreCompleto(p: { nombres: string; apellidos: string | null }): string {
  return p.apellidos ? `${p.nombres} ${p.apellidos}` : p.nombres;
}
