// [FE] Superadmin · Auditoría: cambios de rol/estado/recinto, recintos y pagos (migración 005).
// Solo lectura: la tabla no admite insert/update/delete desde el cliente.
import { useState } from 'react';
import { LayoutEscritorio } from '@/components/LayoutEscritorio';
import { Alerta, Cargando, ErrorMsg, Tarjeta, Vacio } from '@/components/ui';
import { CELDA, Tabla } from '@/components/escritorio';
import { Campo } from '@/components/Campo';
import { useAuditoria } from '@/hooks/useAuditoria';
import { formatearFechaHora } from '@/lib/formato';

// Resumen legible de los datos guardados (antes/después, monto, etc.)
function resumen(datos: Record<string, unknown> | null): string {
  if (!datos) return '—';
  const texto = JSON.stringify(datos);
  return texto.length > 160 ? `${texto.slice(0, 157)}…` : texto;
}

export default function AuditoriaPage() {
  const eventos = useAuditoria();
  const [texto, setTexto] = useState('');
  const buscado = texto.trim().toLowerCase();
  const lista = (eventos.data ?? []).filter(
    (e) =>
      !buscado ||
      e.accion.toLowerCase().includes(buscado) ||
      e.entidad.toLowerCase().includes(buscado) ||
      (e.actor_id ?? '').includes(buscado) ||
      (e.entidad_id ?? '').toLowerCase().includes(buscado),
  );

  return (
    <LayoutEscritorio titulo="Auditoría" subtitulo="Quién cambió qué y cuándo (últimos 300 eventos)">
      <Tarjeta className="max-w-4xl">
        <Campo
          etiqueta="Buscar por acción, entidad o identificador"
          placeholder="perfil_actualizado, pagos…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </Tarjeta>

      {eventos.isPending ? <Cargando mensaje="Cargando la bitácora…" /> : null}
      {eventos.isError ? <ErrorMsg mensaje={eventos.error.message} onReintentar={() => void eventos.refetch()} /> : null}
      {eventos.data && lista.length === 0 ? (
        <Vacio titulo="Sin eventos" texto="Todavía no hay cambios administrativos registrados." />
      ) : null}

      {lista.length > 0 ? (
        <Tabla etiqueta="Eventos de auditoría" columnas={['Fecha', 'Actor', 'Rol', 'Acción', 'Entidad', 'Detalle']}>
          {lista.map((e) => (
            <tr key={e.id}>
              <td className={CELDA}>{formatearFechaHora(e.creado_en)}</td>
              <td className={`${CELDA} font-mono text-xs`}>{e.actor_id ? e.actor_id.slice(0, 8) : 'sistema'}</td>
              <td className={CELDA}>{e.actor_rol ?? '—'}</td>
              <td className={CELDA}>{e.accion}</td>
              <td className={CELDA}>
                {e.entidad}
                {e.entidad_id ? <span className="block font-mono text-xs text-ink-2">{e.entidad_id.slice(0, 8)}</span> : null}
              </td>
              <td className={`${CELDA} max-w-[22rem] break-all font-mono text-xs text-ink-2`}>{resumen(e.datos)}</td>
            </tr>
          ))}
        </Tabla>
      ) : null}

      <Alerta tipo="info">
        La bitácora es de solo lectura. Si necesitas exportarla, hazlo desde el panel de Supabase (SQL Editor) con tu cuenta.
      </Alerta>
    </LayoutEscritorio>
  );
}
