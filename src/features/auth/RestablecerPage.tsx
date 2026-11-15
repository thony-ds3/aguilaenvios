// [FE] Restablecer contraseña: se abre desde el enlace del correo. Mínimo 8 caracteres.
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { claveSchema } from '@/lib/validacion';
import { Campo } from '@/components/Campo';
import { Alerta, Boton, Cargando, MarcoAcceso } from '@/components/ui';

const restablecerSchema = z
  .object({ clave: claveSchema, confirmar: z.string() })
  .refine((d) => d.clave === d.confirmar, { message: 'Las contraseñas no coinciden.', path: ['confirmar'] });
type RestablecerValores = z.infer<typeof restablecerSchema>;

export default function RestablecerPage() {
  const { session, cargando, restablecerClave } = useAuth();
  const navigate = useNavigate();
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<RestablecerValores>({
    resolver: zodResolver(restablecerSchema),
    defaultValues: { clave: '', confirmar: '' },
  });

  const onSubmit = async (v: RestablecerValores) => {
    setErrorForm(null);
    setEnviando(true);
    try {
      await restablecerClave(v.clave);
      navigate('/', { replace: true });
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) {
    return (
      <MarcoAcceso titulo="Nueva contraseña">
        <Cargando mensaje="Validando el enlace…" />
      </MarcoAcceso>
    );
  }

  if (!session) {
    return (
      <MarcoAcceso titulo="Enlace no válido" subtitulo="El enlace venció o ya fue usado.">
        <Alerta tipo="error">Solicita un nuevo enlace para restablecer tu contraseña.</Alerta>
        <Link to="/recuperar-contrasena" className="inline-flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-brand px-5 font-bold text-white">
          Solicitar nuevo enlace
        </Link>
      </MarcoAcceso>
    );
  }

  return (
    <MarcoAcceso titulo="Nueva contraseña" subtitulo="Crea una contraseña de al menos 8 caracteres.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {errorForm ? <Alerta tipo="error">{errorForm}</Alerta> : null}
        <Campo
          etiqueta="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          error={errors.clave?.message}
          {...register('clave')}
        />
        <Campo
          etiqueta="Confirmar contraseña"
          type="password"
          autoComplete="new-password"
          placeholder="Repite la contraseña"
          error={errors.confirmar?.message}
          {...register('confirmar')}
        />
        <Boton type="submit" className="w-full" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar contraseña'}
        </Boton>
      </form>
    </MarcoAcceso>
  );
}
