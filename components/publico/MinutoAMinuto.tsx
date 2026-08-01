// Feed público "minuto a minuto": paginación offset/"cargar más" (mismo
// patrón que MuroComentarios.tsx) + polling opcional de entradas nuevas cada
// 30 s (modo "durante", DT-013) + interacción de clic → resaltar punto en el
// mapa. Sigue el mockup (design-sandbox/app/camino/durante-minuto-a-minuto/page.tsx).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

const PAGINA = 20;
const POLLING_MS = 30_000;

const C = { ink: "#1B211D", muted: "#4A5450", ember: "#D9773B" };

export interface EntradaMinutoAMinutoPublica {
  id: number;
  texto: string;
  foto_url: string | null;
  lat: number | null;
  lon: number | null;
  created_at: string;
}

interface RespuestaFeed {
  entradas: EntradaMinutoAMinutoPublica[];
  siguienteOffset: number | null;
}

interface PuntoResaltado {
  lat: number;
  lon: number;
  hora: string;
}

interface MinutoAMinutoProps {
  /** true en modo "durante" (feed en directo, poll cada 30 s). false en "llegada" (carga estática). */
  polling: boolean;
  /** Entradas ya cargadas server-side, para evitar un primer fetch en "llegada". Opcional. */
  entradasIniciales?: EntradaMinutoAMinutoPublica[];
  onSeleccionarPunto: (punto: PuntoResaltado | null) => void;
}

export default function MinutoAMinuto({
  polling,
  entradasIniciales,
  onSeleccionarPunto,
}: MinutoAMinutoProps) {
  const [entradas, setEntradas] = useState<EntradaMinutoAMinutoPublica[]>(entradasIniciales ?? []);
  const [siguienteOffset, setSiguienteOffset] = useState<number | null>(
    entradasIniciales ? null : 0
  );
  const [cargando, setCargando] = useState(false);
  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const cargadoInicial = useRef(entradasIniciales !== undefined);

  const cargarPagina = useCallback(async (offset: number) => {
    setCargando(true);
    try {
      const response = await fetch(`/api/minuto-a-minuto?offset=${offset}&limit=${PAGINA}`);
      if (!response.ok) return;
      const data: RespuestaFeed = await response.json();
      setEntradas((previas) => (offset === 0 ? data.entradas : [...previas, ...data.entradas]));
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

  // Poll de entradas nuevas (solo modo "durante"): cada 30 s, pide las
  // entradas con id mayor que la más reciente ya cargada y las añade arriba.
  const masRecienteIdRef = useRef<number | null>(null);
  useEffect(() => {
    masRecienteIdRef.current = entradas.length > 0 ? entradas[0].id : null;
  }, [entradas]);

  useEffect(() => {
    if (!polling) return;

    const id = setInterval(async () => {
      const despuesDeId = masRecienteIdRef.current;
      if (despuesDeId === null) return;
      try {
        const response = await fetch(`/api/minuto-a-minuto?despuesDeId=${despuesDeId}`);
        if (!response.ok) return;
        const data: RespuestaFeed = await response.json();
        if (data.entradas.length > 0) {
          setEntradas((previas) => [...data.entradas, ...previas]);
        }
      } catch {
        // Fallo puntual de red: se mantiene el feed actual, el próximo
        // intervalo de polling reintenta.
      }
    }, POLLING_MS);

    return () => clearInterval(id);
  }, [polling]);

  function alPulsar(entrada: EntradaMinutoAMinutoPublica) {
    const esLaMisma = entrada.id === seleccionada;
    if (esLaMisma || entrada.lat === null || entrada.lon === null) {
      setSeleccionada(null);
      onSeleccionarPunto(null);
      return;
    }

    setSeleccionada(entrada.id);
    onSeleccionarPunto({ lat: entrada.lat, lon: entrada.lon, hora: formatearHora(entrada.created_at) });
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 px-1">
        {polling && (
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              style={{ background: C.ember }}
            />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: C.ember }} />
          </span>
        )}
        <div className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: C.muted }}>
          Minuto a minuto
        </div>
      </div>

      <AnimatePresence initial={false}>
        {entradas.map((entrada) => {
          const esActiva = entrada.id === seleccionada;
          const tienePosicion = entrada.lat !== null && entrada.lon !== null;
          return (
            <motion.button
              key={entrada.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              onClick={() => alPulsar(entrada)}
              disabled={!tienePosicion}
              className={
                entrada.foto_url
                  ? "w-full overflow-hidden rounded-xl border text-left transition-colors disabled:cursor-default"
                  : "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-default"
              }
              style={{
                borderColor: esActiva ? C.ember : "#00000010",
                background: esActiva ? "#D9773B0D" : "white",
              }}
            >
              {entrada.foto_url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL pública de Supabase Storage */}
                  <img
                    src={entrada.foto_url}
                    alt=""
                    className="h-48 w-full object-cover"
                  />
                  <div className="min-w-0 px-4 py-3">
                    <div className="font-mono text-[11px]" style={{ color: C.muted }}>
                      {formatearHora(entrada.created_at)}
                    </div>
                    <div className="mt-0.5 text-[14px] leading-snug" style={{ color: C.ink }}>
                      {entrada.texto}
                    </div>
                  </div>
                </>
              ) : (
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px]" style={{ color: C.muted }}>
                    {formatearHora(entrada.created_at)}
                  </div>
                  <div className="mt-0.5 text-[14px] leading-snug" style={{ color: C.ink }}>
                    {entrada.texto}
                  </div>
                </div>
              )}
            </motion.button>
          );
        })}
      </AnimatePresence>

      {siguienteOffset !== null ? (
        <button
          onClick={() => cargarPagina(siguienteOffset)}
          disabled={cargando}
          className="mx-auto flex items-center gap-1.5 rounded-full border px-4 py-2 text-[12.5px] font-medium disabled:opacity-60"
          style={{ borderColor: "#00000015", color: "#2F5D50", background: "#FBFAF7" }}
        >
          {cargando ? "Cargando…" : "Cargar más"}
        </button>
      ) : entradas.length === 0 ? (
        <div className="pt-1 text-center text-[11.5px]" style={{ color: "#9AA29C" }}>
          Todavía no hay ninguna entrada
        </div>
      ) : null}
    </div>
  );
}

function formatearHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
