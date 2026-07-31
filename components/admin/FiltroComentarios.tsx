"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { FiltroComentario } from "@/lib/admin/navegacion";

const OPCIONES: { valor: FiltroComentario; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "publicos", etiqueta: "Públicos" },
  { valor: "ocultos", etiqueta: "Ocultos" },
];

const C = { eucalipto: "#2F5D50", ink: "#1B211D" };

export default function FiltroComentarios({ activo }: { activo: FiltroComentario }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function elegir(valor: FiltroComentario) {
    const params = new URLSearchParams(searchParams);
    params.set("filtroComentarios", valor);
    router.push(`/admin?${params.toString()}`);
  }

  return (
    <div className="inline-flex rounded-full border p-0.5 text-[12.5px]" style={{ borderColor: "#00000015" }}>
      {OPCIONES.map((opcion) => (
        <button
          key={opcion.valor}
          onClick={() => elegir(opcion.valor)}
          className="rounded-full px-3 py-1 font-medium transition-colors"
          style={activo === opcion.valor ? { background: C.eucalipto, color: "white" } : { color: C.ink }}
        >
          {opcion.etiqueta}
        </button>
      ))}
    </div>
  );
}
