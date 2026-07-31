// Mapa en directo del reto: MapLibre GL con base MapTiler + overlay SVG.
//
// Regla no negociable (docs/LESSONS.md): las capas GL `line`/`circle` de
// MapLibre no pintaban de forma fiable en la POC (aparecían/desaparecían
// según el estado del mapa). La traza y los marcadores se pintan con un
// overlay SVG absoluto, recalculado en cada evento `move` proyectando
// lon/lat a píxeles con `map.project()`.
//
// Traza de pintado: SIEMPRE lib/traza/traza-mapa.geojson (regla no
// negociable de AGENTS.md — nunca traza.geojson, esa es solo para cálculo
// server-side). Se recibe como prop `trazaCoords`, cargada server-side por
// lib/traza/cargar-traza-mapa.ts: Turbopack no reconoce `.geojson` como
// módulo importable de forma nativa, así que el fichero se lee con `fs` en
// el Server Component padre y se pasa ya parseado — nunca se importa
// directamente en este client component.
//
// Modo "previa" (por defecto): el mapa no se manipula, tocar lo amplía a
// pantalla completa. Modo "resumen": pinta la ruta entera sin marcador de
// posición (para el modo "antes", antes de que el reto empiece).

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { type BandaHoraria } from "@/lib/cielo";

type ModoMapa = "directo" | "resumen";

const BOUNDS: [[number, number], [number, number]] = [
  [-8.72, 42.12],
  [-8.5, 42.9],
];

const TINTES: Record<BandaHoraria, string> = {
  dia: "transparent",
  atardecer:
    "linear-gradient(180deg, rgba(58,40,88,0.34) 0%, rgba(226,128,66,0.36) 100%)",
  noche:
    "linear-gradient(180deg, rgba(9,15,34,0.55) 0%, rgba(14,20,40,0.46) 100%)",
  amanecer:
    "linear-gradient(0deg, rgba(233,150,90,0.40) 0%, rgba(92,62,112,0.34) 100%)",
};

const HORA_LABEL: Record<BandaHoraria, string> = {
  dia: "Día",
  atardecer: "Atardecer",
  noche: "Noche cerrada",
  amanecer: "Amanece",
};

interface PuntoPx {
  x: number;
  y: number;
}

interface MapaProps {
  /** Coordenadas [lon, lat] de la traza de pintado, cargadas server-side. */
  trazaCoords: [number, number][];
  /** Banda horaria actual (tinte cosmético). Solo aplica en modo "directo". */
  hora: BandaHoraria;
  /** "resumen": ruta entera, sin marcador de posición (modo "antes"). */
  modo?: ModoMapa;
  /** Posición actual (solo se pinta en modo "directo"). */
  posicionActual?: { lat: number; lon: number } | null;
  /** Texto de "última señal hace…", ya formateado. Solo modo "directo". */
  ultimaSenalTexto?: string | null;
}

export default function Mapa({
  trazaCoords,
  hora,
  modo = "directo",
  posicionActual = null,
  ultimaSenalTexto = null,
}: MapaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [listo, setListo] = useState(false);

  // Refs con el valor más reciente de las props: el handler de `move` se
  // registra una sola vez en el efecto de init y, sin esto, capturaría una
  // versión stale de la posición/modo (race condition documentada en
  // docs/LESSONS.md). Se actualizan en un efecto, nunca durante el render.
  const posicionRef = useRef(posicionActual);
  const modoRef = useRef(modo);
  const trazaCoordsRef = useRef(trazaCoords);
  useEffect(() => {
    posicionRef.current = posicionActual;
    modoRef.current = modo;
    trazaCoordsRef.current = trazaCoords;
  }, [posicionActual, modo, trazaCoords]);

  const [inicioPx, setInicioPx] = useState<PuntoPx | null>(null);
  const [finPx, setFinPx] = useState<PuntoPx | null>(null);
  const [posicionPx, setPosicionPx] = useState<PuntoPx | null>(null);
  const [trazaAndadaPx, setTrazaAndadaPx] = useState<PuntoPx[]>([]);
  const [trazaRestantePx, setTrazaRestantePx] = useState<PuntoPx[]>([]);

  const recalcularOverlay = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const traza = trazaCoordsRef.current;
    if (traza.length === 0) return;

    const proyectar = (lonLat: [number, number]): PuntoPx => {
      const p = map.project(lonLat as [number, number]);
      return { x: p.x, y: p.y };
    };

    setInicioPx(proyectar(traza[0]));
    setFinPx(proyectar(traza[traza.length - 1]));

    const pos = posicionRef.current;
    if (modoRef.current === "directo" && pos) {
      setPosicionPx(proyectar([pos.lon, pos.lat]));

      // Tramo andado / restante: separamos la traza en el índice del punto
      // más cercano a la posición actual (aproximación por distancia
      // euclídea en lon/lat, suficiente para el overlay visual).
      const idxCorte = indiceMasCercano(traza, pos);
      setTrazaAndadaPx(traza.slice(0, idxCorte + 1).map(proyectar));
      setTrazaRestantePx(traza.slice(idxCorte).map(proyectar));
    } else {
      setPosicionPx(null);
      setTrazaAndadaPx([]);
      setTrazaRestantePx(traza.map(proyectar));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let map: import("maplibre-gl").Map | null = null;

    // DEBUG TEMPORAL
    window.addEventListener("error", (e) => console.error("WINDOW ERROR", e.message, e.filename, e.error));
    window.addEventListener("unhandledrejection", (e) => console.error("UNHANDLED REJECTION", e.reason));

    (async () => {
      const { Map: MapLibreMap, AttributionControl, config } = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      // Turbopack no resuelve el `new URL(target-condicional, import.meta.url)`
      // interno de maplibre-gl (colapsa siempre al bundle principal en vez del
      // worker real, sin ningún error visible — ver docs/bugs/BUGS.md). Fijamos
      // WORKER_URL explícitamente con un target literal único, que sí es un
      // patrón que Turbopack resuelve correctamente.
      if (!config.WORKER_URL) {
        config.WORKER_URL = new URL(
          "maplibre-gl/dist/maplibre-gl-worker.mjs",
          import.meta.url
        ).href;
      }

      const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
      const styleUrl = key
        ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`
        : undefined;

      const instancia = new MapLibreMap({
        container: containerRef.current,
        // Sin API key configurada, se usa un estilo vacío (solo para no
        // romper en desarrollo local sin credenciales) — la traza y los
        // marcadores del overlay SVG siguen siendo visibles.
        style: styleUrl ?? { version: 8, sources: {}, layers: [] },
        bounds: BOUNDS,
        fitBoundsOptions: { padding: 36 },
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      map = instancia;
      instancia.touchZoomRotate.disableRotation();
      instancia.addControl(new AttributionControl({ compact: true }), "bottom-left");
      mapRef.current = instancia;

      // DEBUG TEMPORAL — instrumentación de diagnóstico, se retira tras investigar.
      instancia.on("error", (e) => console.error("MAPLIBRE ERROR", e.error, e));
      instancia.on("styledata", () => console.log("DEBUG styledata", instancia.isStyleLoaded()));
      instancia.on("sourcedata", (e) => console.log("DEBUG sourcedata", e.sourceId, e.isSourceLoaded, e.dataType));
      instancia.on("dataloading", (e) => console.log("DEBUG dataloading", "sourceId" in e ? e.sourceId : "(sin sourceId)", e.dataType));
      instancia.on("idle", () => console.log("DEBUG idle"));

      // Modo previa: el mapa no se manipula (tocar = ampliar).
      instancia.dragPan.disable();
      instancia.scrollZoom.disable();
      instancia.doubleClickZoom.disable();
      instancia.touchZoomRotate.disable();

      instancia.on("move", recalcularOverlay);
      instancia.on("load", () => {
        recalcularOverlay();
        setListo(true);
      });
    })();

    return () => {
      cancelled = true;
      map?.off("move", recalcularOverlay);
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalcula cuando cambian posición/modo (aunque el mapa no se mueva).
  useEffect(() => {
    if (listo) recalcularOverlay();
  }, [listo, posicionActual, modo, recalcularOverlay]);

  // Ampliar/plegar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (expanded) {
      map.dragPan.enable();
      map.scrollZoom.enable();
      map.doubleClickZoom.enable();
      map.touchZoomRotate.enable();
      map.touchZoomRotate.disableRotation();
      document.body.style.overflow = "hidden";
    } else {
      map.dragPan.disable();
      map.scrollZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoomRotate.disable();
      document.body.style.overflow = "";
    }
    const id = requestAnimationFrame(() => {
      map.resize();
      map.fitBounds(BOUNDS, { padding: expanded ? 60 : 36, duration: 0 });
    });
    return () => cancelAnimationFrame(id);
  }, [expanded]);

  const enDirecto = modo === "directo";

  return (
    <div className={expanded ? "fixed inset-0 z-[70] bg-[#0c0f14]" : "relative h-[320px] w-full"}>
      <div ref={containerRef} className="h-full w-full" />

      {/* overlay SVG: traza + marcadores, recalculado en cada `move` */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      >
        {trazaRestantePx.length > 1 && (
          <>
            <polyline
              points={trazaRestantePx.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={6}
              strokeOpacity={0.55}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={trazaRestantePx.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#3A4A57"
              strokeWidth={3}
              strokeOpacity={0.9}
              strokeDasharray="6,6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
        {enDirecto && trazaAndadaPx.length > 1 && (
          <>
            <polyline
              points={trazaAndadaPx.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#D9773B"
              strokeWidth={11}
              strokeOpacity={0.28}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={trazaAndadaPx.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#D9773B"
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
        {inicioPx && (
          <circle cx={inicioPx.x} cy={inicioPx.y} r={5} fill="#8A928C" stroke="#fff" strokeWidth={2} />
        )}
        {finPx && (
          <text x={finPx.x} y={finPx.y + 6} textAnchor="middle" fontSize={20} fill="#C9A24B">
            ★
          </text>
        )}
        {enDirecto && posicionPx && (
          <g>
            <circle cx={posicionPx.x} cy={posicionPx.y} r={12} fill="#D9773B" opacity={0.3}>
              <animate attributeName="r" values="8;16;8" dur="1.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.5;0;0.5" dur="1.6s" repeatCount="indefinite" />
            </circle>
            <circle cx={posicionPx.x} cy={posicionPx.y} r={8} fill="#D9773B" stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>

      {/* tinte del momento del día (solo en directo) */}
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{ background: enDirecto ? TINTES[hora] : "transparent", mixBlendMode: "multiply" }}
      />

      {/* etiqueta de la hora */}
      {enDirecto && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-white backdrop-blur" style={{ background: "#00000047" }}>
          {HORA_LABEL[hora]}
        </div>
      )}

      {/* última señal */}
      {enDirecto && ultimaSenalTexto && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-white backdrop-blur" style={{ background: "#00000047" }}>
          {ultimaSenalTexto}
        </div>
      )}

      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="absolute inset-0 z-20 flex cursor-pointer items-end justify-center pb-5"
          aria-label="Ampliar el mapa"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[12px] font-medium text-[#1B211D] shadow-md backdrop-blur">
            Toca para ampliar
          </span>
        </button>
      )}

      {expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="absolute right-3 top-3 z-30 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-2 text-[13px] font-medium text-[#1B211D] shadow-lg"
          aria-label="Cerrar mapa ampliado"
        >
          Cerrar
        </button>
      )}
    </div>
  );
}

/** Índice del vértice de la traza más cercano a `pos` (distancia euclídea en grados). */
function indiceMasCercano(
  coordenadas: [number, number][],
  pos: { lat: number; lon: number }
): number {
  let mejorIdx = 0;
  let mejorDist = Infinity;
  for (let i = 0; i < coordenadas.length; i++) {
    const [lon, lat] = coordenadas[i];
    const dist = (lon - pos.lon) ** 2 + (lat - pos.lat) ** 2;
    if (dist < mejorDist) {
      mejorDist = dist;
      mejorIdx = i;
    }
  }
  return mejorIdx;
}
