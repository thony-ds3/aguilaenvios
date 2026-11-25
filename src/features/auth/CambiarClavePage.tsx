// [FE] Cambio obligatorio de la contraseña temporal (hallazgo 10).
// La Edge Function crear-usuario marca `debe_cambiar_clave` en los metadatos del usuario.
// Es un control de experiencia (los metadatos no son una frontera de seguridad): evita que
// la contraseña que entregó el administrador siga siendo válida indefinidamente.
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { claveSchema } from '@/lib/validacion';
import { traducirError } from '@/lib/errores';
import { RUTA_INICIAL } from '@/theme/tokens';
import { Campo } from '@/components/Campo';
import { Alerta, Boton, MarcoAcceso } from '@/components/ui';

const cambioSchema = z
  .object({ clave: claveSchema, confirmar: z.string() })
  .refine((d) => d.clave === d.confirmar, { message: 'Las contraseñas no coinciden.', path: ['confirmar'] });
type CambioValores = z.infer<typeof cambioSchema>;

export default function CambiarClavePage() {
  const { perfil, cerrarSesion } = useAuth();
  const navigate = useNavigate();
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<CambioValores>({
    resolver: zodResolver(cambioSchema),
    defaultValues: { clave: '', confirmar: '' },
  });

  const onSubmit = async (v: CambioValores) => {
    setErrorForm(null);
    setEnviando(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: v.clave,
        data: { debe_cambiar_clave: false },
      });
      if (error) throw error;
      setListo(true);
    } catch (e) {
      setErrorForm(traducirError(e));
    } finally {
      setEnviando(false);
    }
  };

  if (listo) {
    return (
      <MarcoAcceso titulo="Contraseña actualizada" subtitulo="Tu cuenta ya usa tu contraseña personal.">
        <Alerta tipo="ok">La contraseña temporal quedó invalidada. Guárdala en un lugar seguro.</Alerta>
        <Boton className="w-full" onClick={() => navigate(perfil ? RUTA_INICIAL[perfil.rol] : '/', { replace: true })}>
          Continuar
        </Boton>
      </MarcoAcceso>
    );
  }

  return (
    <MarcoAcceso
      titulo="Cambia tu contraseña"
      subtitulo="Tu cuenta se creó con una contraseña temporal. Elige una nueva antes de continuar."
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {errorForm ? <Alerta tipo="error">{errorForm}</Alerta> : null}
        <Campo
          etiqueta="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo 10 caracteres"
          ayuda="Mínimo 10 caracteres, con letras y números."
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
      <button
        type="button"
        onClick={() => void cerrarSesion()}
        className="inline-flex min-h-[44px] w-full items-center justify-center text-sm font-bold text-ink-2 underline-offset-4 hover:underline"
      >
        Cerrar sesión
      </button>
    </MarcoAcceso>
  );
}
