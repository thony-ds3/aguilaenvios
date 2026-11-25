// [FE] Retrasa un valor cambiante (hallazgo 12: la búsqueda de clientes consultaba en cada pulsación).
// Con 300 ms se evita una consulta por tecla y se reduce la enumeración de perfiles desde la interfaz.
import { useEffect, useState } from 'react';

export function useDebounce<T>(valor: T, ms = 300): T {
  const [retrasado, setRetrasado] = useState(valor);

  useEffect(() => {
    const temporizador = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(temporizador);
  }, [valor, ms]);

  return retrasado;
}
