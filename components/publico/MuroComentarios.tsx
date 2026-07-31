// Muro de comentarios públicos, paginado por offset ("cargar más", página=20).
// Hace fetch a GET /api/comentarios. Sigue el patrón de paginación del
// mockup (design-sandbox/app/camino/page.tsx, MuroComentarios).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

const PAGINA = 20;

interface ComentarioPublico {
  id: number;
  nombre: string;
  texto: string;
  created_at: string;
}

interface RespuestaComentarios {
  comentarios: ComentarioPublico[];
  siguienteOffset: number | null;
}

export default function MuroComentarios() {
  const [comentarios, setComentarios] = useState<ComentarioPublico[]>([]);
  const [siguienteOffset, setSiguienteOffset] = useState<number | null>(0);
  const [cargando, setCargando] = useState(false);
  const cargadoInicial = useRef(false);

  const cargarPagina = useCallback(async (offset: number) => {
    setCargando(true);
    try {
      const response = await fetch(`/api/comentarios?offset=${offset}&limit=${PAGINA}`);
      if (!response.ok) return;
      const data: RespuestaComentarios = await response.json();
      setComentarios((previos) =>
        offset === 0 ? data.comentarios : [...previos, ...data.comentarios]
      );
      setSiguienteOffset(data.siguienteOffset);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (cargadoInicial.current) return;
    cargadoInicial.current = true;
    void cargarPagina(0);
  }, [cargarPagina]);

  return (
    <div className="space-y-2.5">
      <AnimatePresence initial={false}>
        {comentarios.map((c) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="rounded-xl border px-4 py-3"
            style={{ borderColor: "#00000010", background: "white" }}
          >
            <div className="text-[13px] font-semibold" style={{ color: "#1B211D" }}>
              {c.nombre}
            </div>
            <div className="text-[13.5px]" style={{ color: "#4A5450" }}>
              {c.texto}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {siguienteOffset !== null ? (
        <button
          onClick={() => cargarPagina(siguienteOffset)}
          disabled={cargando}
          className="mx-auto flex items-center gap-1.5 rounded-full border px-4 py-2 text-[12.5px] font-medium disabled:opacity-60"
          style={{ borderColor: "#00000015", color: "#2F5D50", background: "#FBFAF7" }}
        >
          <IconChevronDown size={13} /> {cargando ? "Cargando…" : "Cargar más comentarios"}
        </button>
      ) : comentarios.length > 0 ? (
        <div className="pt-1 text-center text-[11.5px]" style={{ color: "#9AA29C" }}>
          Eso es todo por ahora
        </div>
      ) : null}
    </div>
  );
}

function IconChevronDown(p: React.SVGProps<SVGSVGElement> & { size?: number }) {
  const { size = 16, ...rest } = p;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
