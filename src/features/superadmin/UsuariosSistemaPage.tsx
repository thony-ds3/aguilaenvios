// [FE] Superadmin 2/2 · Usuarios del sistema: todos los perfiles; asignar rol y recinto; activar/desactivar; alta.
import { useState } from 'react';
import { LayoutEscritorio } from '@/components/LayoutEscritorio';
import { Campo } from '@/components/Campo';
import { Alerta, Boton, Cargando, ErrorMsg, Tarjeta, Vacio } from '@/components/ui';
import { CELDA, ChipActivo, Selector, Tabla } from '@/components/escritorio';
import { AltaUsuarioForm } from '@/features/shared/AltaUsuarioForm';
import { useAuth } from '@/hooks/useAuth';
import { useRecinto } from '@/hooks/useRecinto';
import { useActualizarUsuario, useUsuarios } from '@/hooks/useAdmin';
import { nombreCompleto } from '@/lib/formato';
import { ROLES_ALTA_SUPERADMIN, ROLES_TODOS, rolRequiereRecinto } from '@/theme/catalogos';
import { ROL_LABEL } from '@/theme/tokens';
import type { Perfil, Rol } from '@/lib/tipos';

export default function UsuariosSistemaPage() {
  const { perfil } = useAuth();
  const { recintos } = useRecinto();
  const usuarios = useUsuarios('todos');
  const actualizar = useActualizarUsuario();

  const [texto, setTexto] = useState('');
  const [filtroRol, setFiltroRol] = useState<Rol | 'todos'>('todos');
  const [editando, setEditando] = useState<Perfil | null>(null);
  const [rol, setRol] = useState<Rol>('cliente');
  const [recinto, setRecinto] = useState('');
  const [activo, setActivo] = useState(true);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const nombreRecinto = (id: string | null): string => recintos.find((r) => r.id === id)?.nombre ?? '—';
  const buscado = texto.trim().toLowerCase();
  const lista = (usuarios.data ?? []).filter(
    (u) =>
      (filtroRol === 'todos' || u.rol === filtroRol) &&
      (!buscado || nombreCompleto(u).toLowerCase().includes(buscado) || (u.telefono ?? '').includes(buscado)),
  );
  const esMiCuenta = editando?.id === perfil?.id;

  const abrir = (u: Perfil) => {
    setAviso(null);
    setErrorForm(null);
    actualizar.reset();
    setEditando(u);
    setRol(u.rol);
    setRecinto(u.recinto_id ?? '');
    setActivo(u.activo);
  };

  const guardar = async () => {
    if (!editando) return;
    setErrorForm(null);
    if (rolRequiereRecinto(rol) && !recinto) {
      setErrorForm('El personal de un recinto (admin, recepción, logística, chófer) debe tener un recinto asignado.');
      return;
    }
    try {
      await actualizar.mutateAsync({ id: editando.id, cambios: { rol, recinto_id: recinto || null, activo } });
      setAviso(`Se actualizó a ${nombreCompleto(editando)}.`);
      setEditando(null);
    } catch {
      // El mensaje se muestra desde actualizar.error
    }
  };

  return (
    <LayoutEscritorio titulo="Usuarios del sistema" subtitulo="Asigna admins, roles y recintos">
      <Tarjeta className="max-w-4xl">
        <AltaUsuarioForm roles={ROLES_ALTA_SUPERADMIN} recintoFijo={null} recintos={recintos} />
      </Tarjeta>

      {aviso ? <Alerta tipo="ok">{aviso}</Alerta> : null}

      {editando ? (
        <Tarjeta className="max-w-4xl space-y-4">
          <h2 className="text-lg font-extrabold text-ink">Editar a {nombreCompleto(editando)}</h2>
          {errorForm ? <Alerta tipo="error">{errorForm}</Alerta> : null}
          {actualizar.isError ? <Alerta tipo="error">{actualizar.error.message}</Alerta> : null}
          {esMiCuenta ? (
            <Alerta tipo="info">Es tu propia cuenta: no puedes cambiar tu rol ni desactivarte.</Alerta>
          ) : null}
          <div className="grid gap-4 md:grid-cols-3">
            <Selector etiqueta="Rol" value={rol} disabled={esMiCuenta} onChange={(e) => setRol(e.target.value as Rol)}>
              {ROLES_TODOS.map((r) => (
                <option key={r} value={r}>
                  {ROL_LABEL[r]}
                </option>
              ))}
            </Selector>
            <Selector
              etiqueta="Recinto"
              value={recinto}
              onChange={(e) => setRecinto(e.target.value)}
              ayuda="Obligatorio para admin, recepción, logística y chófer."
            >
              <option value="">Sin recinto</option>
              {recintos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                  {r.activo ? '' : ' (inactivo)'}
                </option>
              ))}
            </Selector>
            <Selector
              etiqueta="Estado"
              value={activo ? 'activo' : 'inactivo'}
              disabled={esMiCuenta}
              onChange={(e) => setActivo(e.target.value === 'activo')}
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Desactivado</option>
            </Selector>
          </div>
          <div className="flex flex-wrap gap-3">
            <Boton onClick={() => void guardar()} disabled={actualizar.isPending}>
              {actualizar.isPending ? 'Guardando…' : 'Guardar cambios'}
            </Boton>
            <Boton variante="secundaria" onClick={() => setEditando(null)} disabled={actualizar.isPending}>
              Cancelar
            </Boton>
          </div>
        </Tarjeta>
      ) : null}

      <Tarjeta className="max-w-4xl">
        <div className="grid gap-4 md:grid-cols-2">
          <Campo
            etiqueta="Buscar por nombre o teléfono"
            placeholder="Escribe para filtrar"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <Selector etiqueta="Filtrar por rol" value={filtroRol} onChange={(e) => setFiltroRol(e.target.value as Rol | 'todos')}>
            <option value="todos">Todos los roles</option>
            {ROLES_TODOS.map((r) => (
              <option key={r} value={r}>
                {ROL_LABEL[r]}
              </option>
            ))}
          </Selector>
        </div>
      </Tarjeta>

      {usuarios.isPending ? <Cargando mensaje="Cargando usuarios…" /> : null}
      {usuarios.isError ? <ErrorMsg mensaje={usuarios.error.message} onReintentar={() => void usuarios.refetch()} /> : null}
      {usuarios.data && lista.length === 0 ? (
        <Vacio titulo="Sin resultados" texto="Ningún usuario coincide con la búsqueda o el filtro." />
      ) : null}

      {lista.length > 0 ? (
        <Tabla etiqueta="Usuarios del sistema" columnas={['Nombre', 'Teléfono', 'Rol', 'Recinto', 'Estado', 'Acción']}>
          {lista.map((u) => (
            <tr key={u.id}>
              <td className={`${CELDA} font-extrabold`}>
                {nombreCompleto(u)}
                {u.id === perfil?.id ? <span className="font-normal text-ink-2"> (tú)</span> : null}
              </td>
              <td className={CELDA}>{u.telefono ?? '—'}</td>
              <td className={CELDA}>{ROL_LABEL[u.rol]}</td>
              <td className={CELDA}>{nombreRecinto(u.recinto_id)}</td>
              <td className={CELDA}>
                <ChipActivo activo={u.activo} />
              </td>
              <td className={CELDA}>
                <Boton variante="secundaria" className="!min-h-[44px]" onClick={() => abrir(u)}>
                  Editar
                </Boton>
              </td>
            </tr>
          ))}
        </Tabla>
      ) : null}
    </LayoutEscritorio>
  );
}
