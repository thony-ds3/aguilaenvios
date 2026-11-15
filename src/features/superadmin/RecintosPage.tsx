// [FE] Superadmin 1/2 · Recintos: crear, editar y activar/desactivar (RLS: solo superadmin).
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LayoutEscritorio } from '@/components/LayoutEscritorio';
import { Campo, CampoControlado } from '@/components/Campo';
import { Alerta, Boton, Cargando, Tarjeta, Vacio } from '@/components/ui';
import { CELDA, ChipActivo, Selector, Tabla } from '@/components/escritorio';
import { useRecinto } from '@/hooks/useRecinto';
import { useGuardarRecinto } from '@/hooks/useAdmin';
import { campoNombre, filtrarNombre } from '@/lib/validacion';
import { DEPARTAMENTOS } from '@/theme/catalogos';
import type { Recinto } from '@/lib/tipos';

const recintoSchema = z.object({
  nombre: campoNombre('El nombre del recinto'),
  departamento: z.string().min(1, 'Selecciona el departamento.'),
  direccion: z.string().trim().max(200, 'La dirección no puede superar 200 caracteres.'),
});
type RecintoValores = z.infer<typeof recintoSchema>;

const VACIO: RecintoValores = { nombre: '', departamento: '', direccion: '' };

export default function RecintosPage() {
  const { recintos, cargando } = useRecinto();
  const guardar = useGuardarRecinto();
  const [editando, setEditando] = useState<Recinto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const { control, register, handleSubmit, reset, formState: { errors } } = useForm<RecintoValores>({
    resolver: zodResolver(recintoSchema),
    defaultValues: VACIO,
  });

  const editar = (r: Recinto) => {
    setAviso(null);
    guardar.reset();
    setEditando(r);
    reset({ nombre: r.nombre, departamento: r.departamento, direccion: r.direccion ?? '' });
  };

  const cancelar = () => {
    setEditando(null);
    reset(VACIO);
  };

  const onSubmit = async (v: RecintoValores) => {
    setAviso(null);
    try {
      await guardar.mutateAsync({
        id: editando?.id,
        nombre: v.nombre,
        departamento: v.departamento,
        direccion: v.direccion || null,
        activo: editando?.activo ?? true,
      });
      setAviso(editando ? `Recinto "${v.nombre}" actualizado.` : `Recinto "${v.nombre}" creado.`);
      setEditando(null);
      reset(VACIO);
    } catch {
      // El mensaje se muestra desde guardar.error
    }
  };

  const alternar = async (r: Recinto) => {
    setAviso(null);
    try {
      await guardar.mutateAsync({
        id: r.id,
        nombre: r.nombre,
        departamento: r.departamento,
        direccion: r.direccion,
        activo: !r.activo,
      });
      setAviso(`Recinto "${r.nombre}" ${r.activo ? 'desactivado' : 'activado'}.`);
    } catch {
      // El mensaje se muestra desde guardar.error
    }
  };

  return (
    <LayoutEscritorio titulo="Recintos" subtitulo="Crear y editar los recintos del sistema">
      <Tarjeta className="max-w-4xl">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <h2 className="text-lg font-extrabold text-ink">{editando ? `Editar "${editando.nombre}"` : 'Nuevo recinto'}</h2>
          {guardar.isError ? <Alerta tipo="error">{guardar.error.message}</Alerta> : null}
          {aviso ? <Alerta tipo="ok">{aviso}</Alerta> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <CampoControlado
              control={control}
              name="nombre"
              filtro={filtrarNombre}
              etiqueta="Nombre del recinto"
              placeholder="Recinto Central"
              ayuda="Solo letras, tildes, ñ y espacios. Debe ser único."
            />
            <Selector etiqueta="Departamento" error={errors.departamento?.message} {...register('departamento')}>
              <option value="">Selecciona un departamento</option>
              {DEPARTAMENTOS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Selector>
            <div className="md:col-span-2">
              <Campo
                etiqueta="Dirección (opcional)"
                placeholder="Calle, número y zona"
                maxLength={200}
                error={errors.direccion?.message}
                {...register('direccion')}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Boton type="submit" disabled={guardar.isPending}>
              {guardar.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear recinto'}
            </Boton>
            {editando ? (
              <Boton variante="secundaria" onClick={cancelar} disabled={guardar.isPending}>
                Cancelar
              </Boton>
            ) : null}
          </div>
        </form>
      </Tarjeta>

      {cargando ? <Cargando mensaje="Cargando recintos…" /> : null}
      {!cargando && recintos.length === 0 ? (
        <Vacio titulo="Aún no hay recintos" texto="Crea el primer recinto para poder asignar personal y registrar guías." />
      ) : null}

      {recintos.length > 0 ? (
        <Tabla etiqueta="Recintos del sistema" columnas={['Nombre', 'Departamento', 'Dirección', 'Estado', 'Acciones']}>
          {recintos.map((r) => (
            <tr key={r.id}>
              <td className={`${CELDA} font-extrabold`}>{r.nombre}</td>
              <td className={CELDA}>{r.departamento}</td>
              <td className={CELDA}>{r.direccion ?? '—'}</td>
              <td className={CELDA}>
                <ChipActivo activo={r.activo} />
              </td>
              <td className={CELDA}>
                <div className="flex flex-wrap gap-2">
                  <Boton variante="secundaria" className="!min-h-[44px]" onClick={() => editar(r)} disabled={guardar.isPending}>
                    Editar
                  </Boton>
                  <Boton
                    variante={r.activo ? 'peligro' : 'secundaria'}
                    className="!min-h-[44px]"
                    onClick={() => void alternar(r)}
                    disabled={guardar.isPending}
                  >
                    {r.activo ? 'Desactivar' : 'Activar'}
                  </Boton>
                </div>
              </td>
            </tr>
          ))}
        </Tabla>
      ) : null}
    </LayoutEscritorio>
  );
}
