// [FE] Pantalla reservada para una fase posterior: mantiene el menú, la ruta y el control de acceso listos.
import { LayoutEscritorio } from '@/components/LayoutEscritorio';
import { Tarjeta, Vacio } from '@/components/ui';

export default function Pendiente({ titulo, subtitulo, fase }: { titulo: string; subtitulo: string; fase: string }) {
  return (
    <LayoutEscritorio titulo={titulo} subtitulo={subtitulo}>
      <Tarjeta className="max-w-2xl">
        <Vacio
          titulo="Vista preparada"
          texto={`Esta pantalla se construye en ${fase}. La ruta, el control de acceso por rol y el menú ya están listos.`}
        />
      </Tarjeta>
    </LayoutEscritorio>
  );
}
