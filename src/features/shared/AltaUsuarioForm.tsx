// [FE] Alta de usuario (admin y superadmin). Llama a la Edge Function crear-usuario:
// la clave secreta vive solo en el servidor y la función vuelve a validar quién llama.
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Campo, CampoControlado } from '@/components/Campo';
import { Alerta, Boton } from '@/components/ui';
import { Selector } from '@/components/escritorio';
import { useCrearUsuario } from '@/hooks/useAdmin';
import {
  campoNombre,
  claveSchema,
  correoSchema,
  filtrarDigitos,
  filtrarNombre,
  telefonoOpcionalSchema,
} from '@/lib/validacion';
import { rolRequiereRecinto } from '@/theme/catalogos';
import { ROL_LABEL } from '@/theme/tokens';
import type { Recinto, Rol } from '@/lib/tipos';

const altaSchema = z.object({
  nombres: campoNombre('Los nombres'),
  apellidos: campoNombre('Los apellidos'),
  telefono: telefonoOpcionalSchema,
  correo: correoSchema,
  clave: claveSchema,
  rol: z.string().min(1, 'Selecciona un rol.'),
  recinto: z.string(),
});
type AltaValores = z.infer<typeof altaSchema>;

export function AltaUsuarioForm({
  roles,
  recintoFijo,
  recintos,
}: {
  roles: Rol[];
  // Admin de recinto: su recinto (no se puede cambiar). Superadmin en "Usuarios del sistema": null (elige recinto).
  recintoFijo: string | null;
  recintos: Recinto[];
}) {
  const crear = useCrearUsuario();
  const [creado, setCreado] = useState<string | null>(null);
  const vacio: AltaValores = { nombres: '', apellidos: '', telefono: '', correo: '', clave: '', rol: roles[0], recinto: '' };

  const { control, register, handleSubmit, reset, setError, formState: { errors } } = useForm<AltaValores>({
    resolver: zodResolver(altaSchema),
    defaultValues: vacio,
  });

  const onSubmit = async (v: AltaValores) => {
    setCreado(null);
    const rol = v.rol as Rol;
    let recintoId = recintoFijo;
    if (recintoFijo === null) {
      if (rolRequiereRecinto(rol) && !v.recinto) {
        setError('recinto', { message: 'El personal debe tener un recinto. Selecciona uno.' });
        return;
      }
      recintoId = v.recinto || null;
    }
    try {
      const resultado = await crear.mutateAsync({
        nombres: v.nombres,
        apellidos: v.apellidos,
        telefono: v.telefono,
        correo: v.correo,
        clave: v.clave,
        rol,
        recinto_id: recintoId,
      });
      setCreado(resultado.correo);
      reset(vacio);
    } catch {
      // El mensaje se muestra desde crear.error
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <h2 className="text-lg font-extrabold text-ink">Agregar usuario</h2>
      {crear.isError ? <Alerta tipo="error">{crear.error.message}</Alerta> : null}
      {creado ? (
        <Alerta tipo="ok">
          Cuenta creada para {creado}. Entrégale la contraseña temporal por un medio seguro.
        </Alerta>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <CampoControlado
          control={control}
          name="nombres"
          filtro={filtrarNombre}
          etiqueta="Nombres"
          ayuda="Solo letras, tildes y ñ. Sin vocales repetidas seguidas."
        />
        <CampoControlado
          control={control}
          name="apellidos"
          filtro={filtrarNombre}
          etiqueta="Apellidos"
          ayuda="Solo letras, tildes y ñ."
        />
        <CampoControlado
          control={control}
          name="telefono"
          filtro={(a, n) => filtrarDigitos(a, n, 15)}
          etiqueta="Teléfono"
          inputMode="numeric"
          ayuda="Solo números, de 7 a 15 dígitos. Opcional."
        />
        <Campo
          etiqueta="Correo electrónico"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="persona@correo.com"
          error={errors.correo?.message}
          {...register('correo')}
        />
        <Campo
          etiqueta="Contraseña temporal"
          type="text"
          autoComplete="off"
          placeholder="Mínimo 8 caracteres"
          ayuda="Mínimo 8 caracteres. La persona puede cambiarla con Recuperar contraseña."
          error={errors.clave?.message}
          {...register('clave')}
        />
        <Selector etiqueta="Rol" error={errors.rol?.message} {...register('rol')}>
          {roles.map((rol) => (
            <option key={rol} value={rol}>
              {ROL_LABEL[rol]}
            </option>
          ))}
        </Selector>
        {recintoFijo === null ? (
          <Selector
            etiqueta="Recinto"
            ayuda="Obligatorio para el personal; opcional para clientes."
            error={errors.recinto?.message}
            {...register('recinto')}
          >
            <option value="">Sin recinto</option>
            {recintos
              .filter((r) => r.activo)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
          </Selector>
        ) : null}
      </div>

      <Boton type="submit" disabled={crear.isPending}>
        {crear.isPending ? 'Creando cuenta…' : 'Crear usuario'}
      </Boton>
    </form>
  );
}
