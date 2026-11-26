// [FE] Pantalla 1 · Ingreso: correo y contraseña, rastreo por guía y accesos a cuenta/recuperación
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { RUTA_INICIAL } from '@/theme/tokens';
import { correoSchema } from '@/lib/validacion';
import { Campo } from '@/components/Campo';
import { Alerta, Boton, MarcoAcceso } from '@/components/ui';

const loginSchema = z.object({
  correo: correoSchema,
  clave: z.string().min(1, 'Ingresa tu contraseña.'),
});
type LoginValores = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { session, perfil, cargando, error: errorSesion, iniciarSesion, reenviarConfirmacion } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const destino = (location.state as { from?: string } | null)?.from;

  // Enlace de confirmación del correo: Supabase vuelve a /login?confirmado=1.
  // Si el enlace venció o ya se usó, agrega error_code en la URL.
  const confirmado = params.get('confirmado') === '1';
  const errorEnlace =
    params.get('error_code') ?? new URLSearchParams(location.hash.replace(/^#/, '')).get('error_code');

  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [verClave, setVerClave] = useState(false);
  // Correo que existe pero sigue sin confirmar: permite pedir otro enlace.
  const [correoPendiente, setCorreoPendiente] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [avisoReenvio, setAvisoReenvio] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginValores>({
    resolver: zodResolver(loginSchema),
    defaultValues: { correo: '', clave: '' },
  });

  // Si ya hay sesión válida, redirige a la pantalla de su rol (o a la que pidió antes de iniciar sesión)
  useEffect(() => {
    // Tras confirmar el correo nos quedamos en el login para mostrar el aviso.
    if (confirmado) return;
    if (!cargando && session && perfil) {
      navigate(destino && destino !== '/login' ? destino : RUTA_INICIAL[perfil.rol], { replace: true });
    }
  }, [confirmado, cargando, session, perfil, destino, navigate]);

  const onSubmit = async (valores: LoginValores) => {
    setErrorForm(null);
    setAvisoReenvio(null);
    setCorreoPendiente(null);
    setEnviando(true);
    try {
      await iniciarSesion(valores.correo, valores.clave);
    } catch (e) {
      const codigo = (e as { code?: string }).code;
      if (codigo === 'email_not_confirmed') setCorreoPendiente(valores.correo);
      setErrorForm(e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
    } finally {
      setEnviando(false);
    }
  };

  const reenviar = async () => {
    if (!correoPendiente) return;
    setAvisoReenvio(null);
    setReenviando(true);
    try {
      await reenviarConfirmacion(correoPendiente);
      setAvisoReenvio('Te enviamos un correo nuevo. Revisa también la carpeta de spam.');
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : 'No se pudo reenviar el correo.');
    } finally {
      setReenviando(false);
    }
  };

  const mensaje = errorForm ?? errorSesion;

  // Supabase ya creó la sesión al abrir el enlace: se ofrece entrar directo,
  // sin saltar de página automáticamente.
  if (confirmado && !cargando && session && perfil) {
    return (
      <MarcoAcceso titulo="Correo confirmado" subtitulo="Tu cuenta está lista para usarse.">
        <Alerta tipo="ok">Confirmamos tu correo y tu sesión ya está activa.</Alerta>
        <Boton className="w-full" onClick={() => navigate(RUTA_INICIAL[perfil.rol], { replace: true })}>
          Entrar a mi cuenta
        </Boton>
      </MarcoAcceso>
    );
  }

  return (
    <MarcoAcceso titulo="Iniciar sesión" subtitulo="Ingresa para seguir tus envíos o gestionar tu trabajo.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {confirmado && !errorEnlace ? (
          <Alerta tipo="ok">¡Correo confirmado! Ya puedes iniciar sesión con tu contraseña.</Alerta>
        ) : null}
        {errorEnlace ? (
          <Alerta tipo="error">
            El enlace de confirmación ya expiró o fue usado. Si tu correo ya está confirmado, inicia sesión; si no,
            pide otro correo desde “Crear cuenta”.
          </Alerta>
        ) : null}
        {mensaje ? <Alerta tipo="error">{mensaje}</Alerta> : null}
        <Campo
          etiqueta="Correo electrónico"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="tu@correo.com"
          error={errors.correo?.message}
          {...register('correo')}
        />
        <Campo
          etiqueta="Contraseña"
          type={verClave ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="Tu contraseña"
          error={errors.clave?.message}
          {...register('clave')}
        />
        <button
          type="button"
          onClick={() => setVerClave((v) => !v)}
          className="min-h-[44px] text-sm font-bold text-brand underline-offset-4 hover:underline"
        >
          {verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        </button>
        <Boton type="submit" className="w-full" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </Boton>
        {correoPendiente ? (
          <Boton variante="secundaria" className="w-full" onClick={reenviar} disabled={reenviando}>
            {reenviando ? 'Enviando…' : 'Reenviar correo de confirmación'}
          </Boton>
        ) : null}
        {avisoReenvio ? <Alerta tipo="ok">{avisoReenvio}</Alerta> : null}
      </form>

      <Boton variante="fantasma" className="w-full" onClick={() => navigate('/cliente/rastreo')}>
        Rastrear con número de guía
      </Boton>

      <div className="flex items-center justify-between gap-2 text-sm">
        <Link to="/recuperar-contrasena" className="inline-flex min-h-[44px] items-center font-bold text-brand underline-offset-4 hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
        <Link to="/crear-cuenta" className="inline-flex min-h-[44px] items-center font-bold text-brand underline-offset-4 hover:underline">
          Crear cuenta
        </Link>
      </div>
    </MarcoAcceso>
  );
}
