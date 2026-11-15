// [FE] Admin de recinto 1/2 · Usuarios del recinto: alta, cambio de rol y activar/desactivar.
// El trigger proteger_perfil de la base valida cada cambio; aquí solo se ocultan los controles no permitidos.
import { useState } from 'react';
import { LayoutEscritorio } from '@/components/LayoutEscritorio';
import { Alerta, Boton, Cargando, ErrorMsg, Tarjeta, Vacio } from '@/components/ui';
import { CELDA, ChipActivo, SinRecinto, Tabla } from '@/components/escritorio';
import { AltaUsuarioForm } from '@/features/shared/AltaUsuarioForm';
import { useAuth } from '@/hooks/useAuth';
import { useRecinto } from '@/hooks/useRecinto';
import { useActualizarUsuario, useUsuarios } from '@/hooks/useAdmin';
import { nombreCompleto } from '@/lib/formato';
import { ROLES_ADMIN } from '@/theme/catalogos';
import { ROL_LABEL } from '@/theme/tokens';
import type { Perfil, Rol } from '@/lib/tipos';

export default function UsuariosRecintoPage() {
  const { perfil } = useAuth();
  const { recintoId, recinto, recintos, cargando } = useRecinto();
  const usuarios = useUsuarios({ recintoId });
  const actualizar = useActualizarUsuario();
  const [aviso, setAviso] = useState<string | null>(null);
  const lista = usuarios.data ?? [];

  // Un admin no puede modificar su propia cuenta ni la de otros admins o superadmins
  const editable = (u: Perfil) => u.id !== perfil?.id && u.rol !== 'admin' && u.rol !== 'superadmin';

  const cambiar = async (u: Perfil, cambios: Partial<Pick<Perfil, 'rol' | 'activo'>>, mensaje: string) => {
    setAviso(null);
    try {
      await actualizar.mutateAsync({ id: u.id, cambios });
      setAviso(mensaje);
    } catch {
      // El mensaje se muestra desde actualizar.error
    }
  };

  return (
    <LayoutEscritorio titulo="Usuarios del recinto" subtitulo={recinto ? recinto.nombre : 'Personal y permisos'}>
      {cargando ? <Cargando mensaje="Cargando tu recinto…" /> : null}
      {!cargando && !recintoId ? <SinRecinto /> : null}

      {recintoId ? (
        <>
          <Tarjeta className="max-w-4xl">
            <AltaUsuarioForm key={recintoId} roles={ROLES_ADMIN} recintoFijo={recintoId} recintos={recintos} />
          </Tarjeta>

          {aviso ? <Alerta tipo="ok">{aviso}</Alerta> : null}
          {actualizar.isError ? <Alerta tipo="error">{actualizar.error.message}</Alerta> : null}

          {usuarios.isPending ? <Cargando mensaje="Cargando usuarios…" /> : null}
          {usuarios.isError ? (
            <ErrorMsg mensaje={usuarios.error.message} onReintentar={() => void usuarios.refetch()} />
          ) : null}
          {usuarios.data && lista.length === 0 ? (
            <Vacio titulo="Este recinto aún no tiene usuarios" texto="Agrega al personal con el formulario de arriba." />
          ) : null}

          {lista.length > 0 ? (
            <Tabla etiqueta="Usuarios del recinto" columnas={['Nombre', 'Teléfono', 'Rol', 'Estado', 'Acción']}>
              {lista.map((u) => (
                <tr key={u.id}>
                  <td className={`${CELDA} font-extrabold`}>
                    {nombreCompleto(u)}
                    {u.id === perfil?.id ? <span className="font-normal text-ink-2"> (tú)</span> : null}
                  </td>
                  <td className={CELDA}>{u.telefono ?? '—'}</td>
                  <td className={CELDA}>
                    {editable(u) ? (
                      <select
                        aria-label={`Rol de ${nombreCompleto(u)}`}
                        value={u.rol}
                        disabled={actualizar.isPending}
                        onChange={(e) => {
                          const rol = e.target.value as Rol;
                          void cambiar(u, { rol }, `${nombreCompleto(u)} ahora tiene el rol ${ROL_LABEL[rol]}.`);
                        }}
                        className="h-11 rounded-[12px] border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/20"
                      >
                        {ROLES_ADMIN.map((rol) => (
                          <option key={rol} value={rol}>
                            {ROL_LABEL[rol]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ROL_LABEL[u.rol]
                    )}
                  </td>
                  <td className={CELDA}>
                    <ChipActivo activo={u.activo} />
                  </td>
                  <td className={CELDA}>
                    {editable(u) ? (
                      <Boton
                        variante={u.activo ? 'peligro' : 'secundaria'}
                        className="!min-h-[44px]"
                        disabled={actualizar.isPending}
                        onClick={() =>
                          void cambiar(
                            u,
                            { activo: !u.activo },
                            `${nombreCompleto(u)} quedó ${u.activo ? 'desactivado' : 'activo'}.`,
                          )
                        }
                      >
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </Boton>
                    ) : (
                      <span className="text-ink-2">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </Tabla>
          ) : null}
        </>
      ) : null}
    </LayoutEscritorio>
  );
}
