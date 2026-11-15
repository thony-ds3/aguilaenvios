// [FE] Cliente 4/4 · Perfil: ver y editar nombres, apellidos y teléfono; cerrar sesión
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { LayoutMovil } from '@/components/LayoutMovil';
import { CampoControlado } from '@/components/Campo';
import { Alerta, Boton, Tarjeta } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useActualizarPerfil } from '@/hooks/useCliente';
import { campoNombre, filtrarDigitos, filtrarNombre, telefonoOpcionalSchema } from '@/lib/validacion';
import { ROL_LABEL } from '@/theme/tokens';

const perfilSchema = z.object({
  nombres: campoNombre('Los nombres'),
  apellidos: campoNombre('Los apellidos'),
  telefono: telefonoOpcionalSchema,
});
type PerfilValores = z.infer<typeof perfilSchema>;

export default function PerfilPage() {
  const { perfil, user, cerrarSesion } = useAuth();
  const actualizar = useActualizarPerfil();
  const navigate = useNavigate();
  const [aviso, setAviso] = useState<string | null>(null);

  const { control, handleSubmit, reset, formState: { errors, isDirty } } = useForm<PerfilValores>({
    resolver: zodResolver(perfilSchema),
    defaultValues: {
      nombres: perfil?.nombres ?? '',
      apellidos: perfil?.apellidos ?? '',
      telefono: perfil?.telefono ?? '',
    },
  });

  const onGuardar = async (v: PerfilValores) => {
    setAviso(null);
    try {
      await actualizar.mutateAsync(v);
      reset(v);
      setAviso('Perfil actualizado.');
    } catch {
      // El error se muestra abajo desde actualizar.error
    }
  };

  const salir = async () => {
    await cerrarSesion();
    navigate('/login', { replace: true });
  };

  return (
    <LayoutMovil titulo="Mi perfil" subtitulo="Datos de tu cuenta y configuración.">
      <Tarjeta className="space-y-1">
        <p className="text-sm font-bold text-ink">Tipo de cuenta</p>
        <p className="text-sm text-ink-2">{perfil ? ROL_LABEL[perfil.rol] : '—'}</p>
        <p className="pt-2 text-sm font-bold text-ink">Correo electrónico</p>
        <p className="break-all text-sm text-ink-2">{user?.email ?? '—'}</p>
      </Tarjeta>

      <Tarjeta>
        <form onSubmit={handleSubmit(onGuardar)} noValidate className="space-y-4">
          <p className="font-extrabold text-ink">Datos personales</p>
          {actualizar.isError ? <Alerta tipo="error">{actualizar.error.message}</Alerta> : null}
          {aviso ? <Alerta tipo="ok">{aviso}</Alerta> : null}
          <CampoControlado
            control={control}
            name="nombres"
            filtro={filtrarNombre}
            etiqueta="Nombres"
            autoComplete="given-name"
            ayuda="Solo letras, tildes y ñ."
            error={errors.nombres?.message}
          />
          <CampoControlado
            control={control}
            name="apellidos"
            filtro={filtrarNombre}
            etiqueta="Apellidos"
            autoComplete="family-name"
            ayuda="Solo letras, tildes y ñ."
            error={errors.apellidos?.message}
          />
          <CampoControlado
            control={control}
            name="telefono"
            filtro={(a, n) => filtrarDigitos(a, n, 15)}
            etiqueta="Teléfono"
            inputMode="numeric"
            autoComplete="tel"
            ayuda="Solo números, de 7 a 15 dígitos. Opcional."
            error={errors.telefono?.message}
          />
          <Boton type="submit" className="w-full" disabled={!isDirty || actualizar.isPending}>
            {actualizar.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Boton>
        </form>
      </Tarjeta>

      <Tarjeta className="space-y-3">
        <p className="font-extrabold text-ink">Sesión</p>
        <Boton variante="peligro" className="w-full" onClick={salir}>
          Cerrar sesión
        </Boton>
      </Tarjeta>
    </LayoutMovil>
  );
}
