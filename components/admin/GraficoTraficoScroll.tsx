// Único fragmento cliente de la pestaña "Tráfico" (DT-022): el gráfico en sí
// (SVG) se renderiza server-side dentro de SeccionTrafico.tsx y se pasa aquí
// como children — este wrapper solo añade el scroll automático al extremo
// derecho al montar, algo que no se puede hacer server-side (depende del
// ancho real del contenedor en el navegador).
//
// Cuidado (docs/LESSONS.md): nunca un literal `[]`/`{}` como valor por
// defecto de una prop de un componente cliente con useEffect — aquí no
// aplica directamente (children no tiene valor por defecto), pero por eso
// mismo el componente no declara ningún default de ese tipo.

"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function GraficoTraficoScroll({ children }: { children: ReactNode }) {
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;
    contenedor.scrollLeft = contenedor.scrollWidth;
  }, []);

  return (
    <div ref={contenedorRef} className="overflow-x-auto rounded-2xl border" style={{ borderColor: "#00000012" }}>
      {children}
    </div>
  );
}
