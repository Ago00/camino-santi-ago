// "Cargar más" para las listas paginadas del panel admin (Posición,
// Intenciones). En vez de fetch de cliente, es un Link que actualiza un
// parámetro de offset propio en la URL — el Server Component de la sección
// vuelve a pedir sus datos con el nuevo offset (mismo patrón que ?tab=).

"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface EnlacePaginacionProps {
  parametro: string;
  siguienteOffset: number;
}

export default function EnlacePaginacion({ parametro, siguienteOffset }: EnlacePaginacionProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function cargarMas() {
    const params = new URLSearchParams(searchParams);
    params.set(parametro, String(siguienteOffset));
    router.push(`/admin?${params.toString()}`);
  }

  return (
    <button
      onClick={cargarMas}
      className="mx-auto flex items-center rounded-full border px-4 py-2 text-[12.5px] font-medium"
      style={{ borderColor: "#00000015", color: "#2F5D50", background: "#FBFAF7" }}
    >
      Cargar más
    </button>
  );
}
