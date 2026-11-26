// [FE] Pantalla 2 · Crear cuenta: nombres y apellidos (solo letras), teléfono (solo números), correo y contraseña (mínimo 8)
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  campoNombre,
  claveSchema,
  correoSchema,
  filtrarDigitos,
  filtrarNombre,
  telefonoSchema,
} from '@/lib/validacion';
import { CampoControlado } from '@/components/Campo';
import { Campo } from '@/components/Campo';
import { Alerta, Boton, MarcoAcceso } from '@/components/ui';

const registroSchema = z
  .object({
    nombres: campoNombre('Los nombres'),
    apellidos: campoNombre('Los apellidos'),
    telefono: telefonoSchema,
    correo: correoSchema,
    clave: claveSchema,
    confirmar: z.string(),
  })
  .refine((d) => d.clave === d.confirmar, { message: 'Las contraseñas no coinciden.', path: ['confirmar'] });
type RegistroValores = z.infer<typeof registroSchema>;

export default function CrearCuentaPage() {
  const { crearCuenta } = useAuth();
  const navigate = useNavigate();
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [revisarCorreo, setRevisarCorreo] = useState(false);

  const { control, register, handleSubmit, formState: { errors } } = useForm<RegistroValores>({
    resolver: zodResolver(registroSchema),
    defaultValues: { nombres: '', apellidos: '', telefono: '', correo: '', clave: '', confirmar: '' },
  });

  const onSubmit = async (v: RegistroValores) => {
    setErrorForm(null);
    setEnviando(true);
    try {
      const { requiereConfirmacion } = await crearCuenta({
        nombres: v.nombres,
        apellidos: v.apellidos,
        telefono: v.telefono,
        correo: v.correo,
        clave: v.clave,
      });
      if (requiereConfirmacion) setRevisarCorreo(true);
      else navigate('/', { replace: true });
    } catch (e) {
      console.log(e);
      setErrorForm(e instanceof Error ? e.message : 'No se pudo crear la cuenta.');
    } finally {
      setEnviando(false);
    }
  };

  if (revisarCorreo) {
    return (
      <MarcoAcceso titulo="Revisa tu correo" subtitulo="Tu cuenta casi está lista.">
        <Alerta tipo="ok">
          Te enviamos un enlace para confirmar tu correo. Ábrelo y después podrás iniciar sesión.
        </Alerta>
        <Link to="/login" className="inline-flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-brand px-5 font-bold text-white">
          Ir a iniciar sesión
        </Link>
      </MarcoAcceso>
    );
  }

  return (
    <MarcoAcceso titulo="Crear cuenta" subtitulo="Regístrate para rastrear tus envíos.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {errorForm ? <Alerta tipo="error">{errorForm}</Alerta> : null}

        <CampoControlado
          control={control}
          name="nombres"
          filtro={filtrarNombre}
          etiqueta="Nombres"
          autoComplete="given-name"
          placeholder="Ana María"
          ayuda="Solo letras, tildes y ñ. Sin vocales repetidas seguidas."
        />
        <CampoControlado
          control={control}
          name="apellidos"
          filtro={filtrarNombre}
          etiqueta="Apellidos"
          autoComplete="family-name"
          placeholder="Pérez Quispe"
          ayuda="Solo letras, tildes y ñ."
        />
        <CampoControlado
          control={control}
          name="telefono"
          filtro={(a, n) => filtrarDigitos(a, n, 15)}
          etiqueta="Teléfono"
          type="text"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="71234567"
          ayuda="Solo números, de 7 a 15 dígitos."
        />
        <Campo
          etiqueta="Correo electrónico"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          error={errors.correo?.message}
          {...register('correo')}
        />
        <Campo
          etiqueta="Contraseña"
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo 10 caracteres"
          ayuda="Mínimo 10 caracteres."
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
          {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
        </Boton>
      </form>

      <Link to="/login" className="inline-flex min-h-[44px] w-full items-center justify-center text-sm font-bold text-brand underline-offset-4 hover:underline">
        Ya tengo cuenta · Iniciar sesión
      </Link>
    </MarcoAcceso>
  );
}
