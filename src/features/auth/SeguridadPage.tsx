// [FE] Seguridad de la cuenta (hallazgo 10): verificación en dos pasos (TOTP) y sesión actual.
// Si la cuenta ya tiene un factor verificado y la sesión está en aal1, Supabase exige el código
// y las rutas de admin/superadmin redirigen aquí (ver RutaProtegida).
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutEscritorio } from '@/components/LayoutEscritorio';
import { Alerta, Boton, Cargando, Tarjeta } from '@/components/ui';
import { Campo } from '@/components/Campo';
import { useAuth } from '@/hooks/useAuth';
import { useMfa, type InscripcionMfa } from '@/hooks/useMfa';
import { traducirError } from '@/lib/errores';
import { RUTA_INICIAL } from '@/theme/tokens';

export default function SeguridadPage() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requerido = params.get('requerido') === '1';
  const mfa = useMfa();

  const [inscripcion, setInscripcion] = useState<InscripcionMfa | null>(null);
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const destino = perfil ? RUTA_INICIAL[perfil.rol] : '/';

  // Si el usuario llega redirigido por falta de aal2, el bloque de verificación va primero
  const pendiente = mfa.verificados.length > 0 && mfa.nivel !== 'aal2';
  const factorPendiente = mfa.verificados[0] ?? null;

  const verificarSesion = useCallback(async () => {
    if (!factorPendiente) return;
    setOcupado(true);
    setError(null);
    try {
      await mfa.verificar(factorPendiente.id, codigo);
      setCodigo('');
      setAviso('Identidad verificada. Ya puedes continuar.');
    } catch (e) {
      setError(traducirError(e));
    } finally {
      setOcupado(false);
    }
  }, [codigo, factorPendiente, mfa]);

  const iniciarAlta = useCallback(async () => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const nombre = `${perfil?.nombres ?? 'Cuenta'} · ${new Date().toLocaleDateString('es-BO')}`;
      setInscripcion(await mfa.inscribir(nombre.slice(0, 60)));
      setCodigo('');
    } catch (e) {
      setError(traducirError(e));
    } finally {
      setOcupado(false);
    }
  }, [mfa, perfil?.nombres]);

  const confirmarAlta = useCallback(async () => {
    if (!inscripcion) return;
    setOcupado(true);
    setError(null);
    try {
      await mfa.verificar(inscripcion.factorId, codigo);
      setInscripcion(null);
      setCodigo('');
      setAviso('Verificación en dos pasos activada. Guarda el secreto en un lugar seguro.');
    } catch (e) {
      setError(traducirError(e));
    } finally {
      setOcupado(false);
    }
  }, [codigo, inscripcion, mfa]);

  const quitar = useCallback(
    async (factorId: string) => {
      setOcupado(true);
      setError(null);
      try {
        await mfa.eliminar(factorId);
        setAviso('Se quitó el autenticador. Te recomendamos activar otro de inmediato.');
      } catch (e) {
        setError(traducirError(e));
      } finally {
        setOcupado(false);
      }
    },
    [mfa],
  );

  // Al verificar correctamente desde una redirección, se vuelve al destino natural del rol
  useEffect(() => {
    if (requerido && mfa.nivel === 'aal2' && !inscripcion) {
      navigate(destino, { replace: true });
    }
  }, [destino, inscripcion, mfa.nivel, navigate, requerido]);

  return (
    <LayoutEscritorio titulo="Seguridad de la cuenta" subtitulo="Verificación en dos pasos y control de la sesión">
      {requerido && pendiente ? <Alerta tipo="info">Tu cuenta tiene verificación en dos pasos. Ingresa el código para continuar.</Alerta> : null}
      {aviso ? <Alerta tipo="ok">{aviso}</Alerta> : null}
      {error ?? mfa.error ? <Alerta tipo="error">{error ?? mfa.error}</Alerta> : null}

      {mfa.cargando ? <Cargando mensaje="Consultando tu seguridad…" /> : null}

      {!mfa.cargando ? (
        <Tarjeta className="max-w-2xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-ink">Verificación en dos pasos</h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                mfa.nivel === 'aal2' ? 'bg-ok-bg text-ok-fg' : mfa.verificados.length > 0 ? 'bg-pend-bg text-pend-fg' : 'bg-soft text-ink-2'
              }`}
            >
              {mfa.nivel === 'aal2' ? 'Sesión verificada' : mfa.verificados.length > 0 ? 'Falta el código' : 'Sin activar'}
            </span>
          </div>

          <p className="text-sm text-ink-2">
            Con la verificación en dos pasos, además de tu contraseña se pide un código de 6 dígitos generado por una
            aplicación como Google Authenticator, Microsoft Authenticator o Authy. Es obligatoria para el personal con
            permisos de administración.
          </p>

          {pendiente && factorPendiente ? (
            <div className="space-y-3 rounded-[14px] border border-line bg-soft/60 p-4">
              <p className="text-sm font-bold text-ink">Código del autenticador</p>
              <Campo
                etiqueta="Código de 6 dígitos"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={7}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <div className="flex flex-wrap gap-3">
                <Boton onClick={() => void verificarSesion()} disabled={ocupado || codigo.length !== 6}>
                  {ocupado ? 'Verificando…' : 'Verificar y continuar'}
                </Boton>
                <Boton variante="secundaria" onClick={() => navigate(destino)} disabled={ocupado}>
                  Ahora no
                </Boton>
              </div>
            </div>
          ) : null}

          {mfa.verificados.length > 0 && !pendiente ? (
            <ul className="divide-y divide-line rounded-[14px] border border-line">
              {mfa.verificados.map((factor) => (
                <li key={factor.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div>
                    <p className="text-sm font-bold text-ink">{factor.friendly_name || 'Autenticador'}</p>
                    <p className="text-xs text-ink-2">Alta: {new Date(factor.created_at).toLocaleDateString('es-BO')}</p>
                  </div>
                  <Boton variante="peligro" className="!min-h-[44px]" disabled={ocupado} onClick={() => void quitar(factor.id)}>
                    Quitar
                  </Boton>
                </li>
              ))}
            </ul>
          ) : null}

          {inscripcion ? (
            <div className="space-y-4 rounded-[14px] border-[1.5px] border-brand/40 bg-soft/40 p-4">
              <p className="text-sm font-bold text-ink">1. Escanea el código con tu aplicación</p>
              <img
                src={inscripcion.qr}
                alt="Código QR para configurar la verificación en dos pasos"
                className="h-44 w-44 rounded-[12px] border border-line bg-white p-2"
              />
              <div className="space-y-1">
                <p className="text-sm font-bold text-ink">¿No puedes escanear? Escribe esta clave:</p>
                <code className="block break-all rounded-[12px] border border-line bg-white p-3 text-sm text-ink">{inscripcion.secreto}</code>
              </div>
              <p className="text-sm font-bold text-ink">2. Escribe el código que muestra la aplicación</p>
              <Campo
                etiqueta="Código de 6 dígitos"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={7}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <div className="flex flex-wrap gap-3">
                <Boton onClick={() => void confirmarAlta()} disabled={ocupado || codigo.length !== 6}>
                  {ocupado ? 'Activando…' : 'Activar verificación'}
                </Boton>
                <Boton
                  variante="secundaria"
                  disabled={ocupado}
                  onClick={() => {
                    setInscripcion(null);
                    setCodigo('');
                    void mfa.recargar();
                  }}
                >
                  Cancelar
                </Boton>
              </div>
            </div>
          ) : mfa.verificados.length === 0 ? (
            <Boton onClick={() => void iniciarAlta()} disabled={ocupado}>
              {ocupado ? 'Preparando…' : 'Activar verificación en dos pasos'}
            </Boton>
          ) : (
            <Boton variante="secundaria" onClick={() => void iniciarAlta()} disabled={ocupado}>
              Agregar otro autenticador
            </Boton>
          )}
        </Tarjeta>
      ) : null}

      <Tarjeta className="max-w-2xl space-y-2">
        <h2 className="text-lg font-extrabold text-ink">Recomendaciones de sesión</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>No compartas tu contraseña ni el código de 6 dígitos con nadie.</li>
          <li>Cierra sesión al terminar en computadoras compartidas.</li>
          <li>Si cambias de teléfono, agrega el nuevo autenticador antes de quitar el anterior.</li>
        </ul>
      </Tarjeta>
    </LayoutEscritorio>
  );
}
