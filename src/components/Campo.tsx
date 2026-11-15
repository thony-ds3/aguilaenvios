// [FE] Campo de formulario con etiqueta visible, ayuda y error en español.
// CampoControlado aplica los filtros de validación mientras se escribe (bloquea caracteres no permitidos).
import { forwardRef, useId, type ComponentPropsWithoutRef } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

export interface CampoProps extends ComponentPropsWithoutRef<'input'> {
  etiqueta: string;
  error?: string;
  ayuda?: string;
}

export const Campo = forwardRef<HTMLInputElement, CampoProps>(function Campo(
  { etiqueta, error, ayuda, id, className = '', ...rest },
  ref,
) {
  const autoId = useId();
  const idCampo = id ?? autoId;
  const idAyuda = `${idCampo}-ayuda`;
  const idError = `${idCampo}-error`;
  const describedBy = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={idCampo} className="text-sm font-bold text-ink">
        {etiqueta}
      </label>
      <input
        ref={ref}
        id={idCampo}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`h-[52px] w-full rounded-[14px] border bg-white px-4 text-base text-ink outline-none transition placeholder:text-ink-2/70 focus:border-brand focus:ring-4 focus:ring-brand/20 ${error ? 'border-red-700' : 'border-line'} ${className}`}
        {...rest}
      />
      {ayuda && !error ? (
        <p id={idAyuda} className="text-xs text-ink-2">
          {ayuda}
        </p>
      ) : null}
      {error ? (
        <p id={idError} className="text-xs font-semibold text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
});

export function CampoControlado<T extends FieldValues>({
  control,
  name,
  filtro,
  ...props
}: Omit<CampoProps, 'value' | 'onChange' | 'name'> & {
  control: Control<T>;
  name: Path<T>;
  filtro?: (anterior: string, nuevo: string) => string;
}) {
  const { field, fieldState } = useController({ control, name });
  const valor = typeof field.value === 'string' ? field.value : String(field.value ?? '');
  return (
    <Campo
      {...props}
      ref={field.ref}
      name={field.name}
      value={valor}
      onBlur={field.onBlur}
      error={props.error ?? fieldState.error?.message}
      onChange={(e) => {
        const nuevo = e.target.value;
        field.onChange(filtro ? filtro(valor, nuevo) : nuevo);
      }}
    />
  );
}
