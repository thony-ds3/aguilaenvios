// [FE] Pantalla 3 · Recuperar contraseña: envía un enlace al correo (Supabase Auth)
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { correoSchema } from '@/lib/validacion';
import { Campo } from '@/components/Campo';
import { Alerta, Boton, MarcoAcceso } from '@/components/ui';

const recuperarSchema = z.object({ correo: correoSchema });
type RecuperarValores = z.infer<typeof recuperarSchema>;

export default function RecuperarPage() {
  const { recuperarClave } = useAuth();
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<RecuperarValores>({
    resolver: zodResolver(recuperarSchema),
    defaultValues: { correo: '' },
  });

  const onSubmit = async (v: RecuperarValores) => {
    setErrorForm(null);
    setEnviando(true);
    try {
      await recuperarClave(v.correo);
      setEnviado(true);
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : 'No se pudo enviar el enlace.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <MarcoAcceso titulo="Recuperar contraseña" subtitulo="Te enviaremos un enlace para crear una nueva.">
      {enviado ? (
        <Alerta tipo="ok">
          Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.
        </Alerta>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {errorForm ? <Alerta tipo="error">{errorForm}</Alerta> : null}
          <Campo
            etiqueta="Correo electrónico"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            error={errors.correo?.message}
            {...register('correo')}
          />
          <Boton type="submit" className="w-full" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar enlace'}
          </Boton>
        </form>
      )}
      <Link to="/login" className="inline-flex min-h-[44px] w-full items-center justify-center text-sm font-bold text-brand underline-offset-4 hover:underline">
        Volver a iniciar sesión
      </Link>
    </MarcoAcceso>
  );
}
