// [FE] Pantalla 1 · Ingreso: correo y contraseña, rastreo por guía y accesos a cuenta/recuperación
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  const { session, perfil, cargando, error: errorSesion, iniciarSesion } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destino = (location.state as { from?: string } | null)?.from;

  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [verClave, setVerClave] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginValores>({
    resolver: zodResolver(loginSchema),
    defaultValues: { correo: '', clave: '' },
  });

  // Si ya hay sesión válida, redirige a la pantalla de su rol (o a la que pidió antes de iniciar sesión)
  useEffect(() => {
    if (!cargando && session && perfil) {
      navigate(destino && destino !== '/login' ? destino : RUTA_INICIAL[perfil.rol], { replace: true });
    }
  }, [cargando, session, perfil, destino, navigate]);

  const onSubmit = async (valores: LoginValores) => {
    setErrorForm(null);
    setEnviando(true);
    try {
      await iniciarSesion(valores.correo, valores.clave);
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
    } finally {
      setEnviando(false);
    }
  };

  const mensaje = errorForm ?? errorSesion;

  return (
    <MarcoAcceso titulo="Iniciar sesión" subtitulo="Ingresa para seguir tus envíos o gestionar tu trabajo.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
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
