// [FE] Logo de Águila Envíos: cuadrado redondeado con águila estilizada (alas en V) y lema

export function Logo({ tamano = 'normal', claro = false }: { tamano?: 'normal' | 'compacto'; claro?: boolean }) {
  const compacto = tamano === 'compacto';
  const color = claro ? '#C84E00' : '#FFFFFF';
  return (
    <div className="flex items-center gap-3">
      <div
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-[14px] ${claro ? 'bg-white' : 'bg-brand'} ${compacto ? 'h-10 w-10' : 'h-14 w-14'}`}
      >
        <svg viewBox="0 0 64 64" className={compacto ? 'h-7 w-7' : 'h-9 w-9'}>
          <path d="M32 30 L6 16 L18 38 L26 42 Z" fill={color} />
          <path d="M32 30 L58 16 L46 38 L38 42 Z" fill={color} />
          <circle cx="32" cy="22" r="5" fill="#F26A1B" />
          <path d="M29 40 L32 56 L35 40 Z" fill={color} />
        </svg>
      </div>
      <div>
        <p className={`font-extrabold leading-tight ${claro ? 'text-white' : 'text-ink'} ${compacto ? 'text-lg' : 'text-2xl'}`}>
          Águila Envíos
        </p>
        {!compacto ? (
          <p className={`text-sm ${claro ? 'text-white' : 'text-ink-2'}`}>Tu envío, siempre a la vista.</p>
        ) : null}
      </div>
    </div>
  );
}
