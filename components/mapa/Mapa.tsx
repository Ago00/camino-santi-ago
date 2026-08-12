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
//
// Prop `variante` (DT-016, redefinida en DT-021): "ruta" (por defecto) pinta
// el recorrido GPS real (prop `puntosGps`, igual que "libre") + el marcador
// de fin de ruta (⛪, DT-021) — el público en modo guiado ya no ve la traza
// oficial completa, solo lo que Santi ha andado de verdad. "libre" (modo de
// intento libre) pinta también `puntosGps` pero sin marcador de fin (destino
// arbitrario, sin sentido marcarlo). Ninguna de las dos variantes pinta ya
// inicio/corte de color sobre la traza oficial en el mapa público.
//
// Props `trazaOficialComparacion`/`puntoReferencia` (DT-021): exclusivas del
// panel admin (pestaña "Mapa", components/admin/SeccionMapa.tsx). Pintan la
// traza oficial completa (comparación) y el punto de la traza que usa
// realmente el cálculo de distancia restante (con línea discontinua a la
// posición real) — el público nunca las pasa, así que su ausencia no cambia
// nada del comportamiento descrito arriba.

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { type BandaHoraria } from "@/lib/cielo";

type ModoMapa = "directo" | "resumen";
type VarianteMapa = "ruta" | "libre";

const BOUNDS: [[number, number], [number, number]] = [
  [-8.72, 42.12],
  [-8.5, 42.9],
];

// DT-021: color de la traza oficial de comparación y del punto de referencia
// (admin, no-op en el mapa público) — azul acero, distinto del naranja
// #D9773B ya asociado al recorrido real "andado".
const COLOR_TRAZA_OFICIAL_COMPARACION = "#3A6EA5";
const COLOR_PUNTO_REFERENCIA = COLOR_TRAZA_OFICIAL_COMPARACION;

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
  /** Coordenadas [lon, lat] de la traza de pintado, cargadas server-side.
   *  Ignoradas por el overlay principal desde DT-021 (ambas variantes pintan
   *  `puntosGps`) — se sigue recibiendo para el modo "resumen" (modo
   *  "antes") y para `trazaOficialComparacion`, que reutiliza el mismo
   *  formato. */
  trazaCoords: [number, number][];
  /** Banda horaria actual (tinte cosmético). Solo aplica en modo "directo". */
  hora: BandaHoraria;
  /** "resumen": ruta entera, sin marcador de posición (modo "antes"). */
  modo?: ModoMapa;
  /**
   * "ruta" (por defecto, DT-021): recorrido GPS real (`puntosGps`) + marcador
   * de fin de ruta (⛪). "libre" (DT-016): recorrido GPS real sin marcador de
   * fin (destino arbitrario). Ambas pintan `puntosGps`, nunca la traza
   * oficial completa — ver `trazaOficialComparacion` para eso.
   */
  variante?: VarianteMapa;
  /** Posición actual (solo se pinta en modo "directo"). */
  posicionActual?: { lat: number; lon: number } | null;
  /**
   * Puntos GPS recibidos del intento, en el orden en que llegaron. Se usa en
   * ambas variantes desde DT-021.
   */
  puntosGps?: { lat: number; lon: number }[];
  /** Texto de "última señal hace…", ya formateado. Solo modo "directo". */
  ultimaSenalTexto?: string | null;
  /**
   * Punto del feed "minuto a minuto" seleccionado para resaltar temporalmente
   * (DT-013): marcador con etiqueta de hora, distinto del marcador de
   * posición actual. `null`/ausente no cambia el comportamiento existente
   * del mapa — prop aditiva.
   */
  puntoResaltado?: { lat: number; lon: number; hora: string } | null;
  /**
   * Traza oficial completa, solo para comparación visual (DT-021) — exclusiva
   * del panel admin. Ausente/`undefined`: no se pinta nada (no-op), el
   * público nunca la pasa.
   */
  trazaOficialComparacion?: [number, number][];
  /**
   * Punto de la traza oficial que usa realmente el cálculo de distancia
   * restante (`Progreso.puntoProyectado`, DT-021) — exclusivo del admin.
   * Se pinta con marcador propio + línea discontinua hasta `posicionActual`.
   * Ausente/`null`/`undefined`: no se pinta nada (no-op).
   */
  puntoReferencia?: { lat: number; lon: number } | null;
}

export default function Mapa({
  trazaCoords,
  hora,
  modo = "directo",
  variante = "ruta",
  posicionActual = null,
  puntosGps = [],
  ultimaSenalTexto = null,
  puntoResaltado = null,
  trazaOficialComparacion = [],
  puntoReferencia = null,
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
  const varianteRef = useRef(variante);
  const trazaCoordsRef = useRef(trazaCoords);
  const puntosGpsRef = useRef(puntosGps);
  const puntoResaltadoRef = useRef(puntoResaltado);
  const trazaOficialComparacionRef = useRef(trazaOficialComparacion);
  const puntoReferenciaRef = useRef(puntoReferencia);
  useEffect(() => {
    posicionRef.current = posicionActual;
    modoRef.current = modo;
    varianteRef.current = variante;
    trazaCoordsRef.current = trazaCoords;
    puntosGpsRef.current = puntosGps;
    puntoResaltadoRef.current = puntoResaltado;
    trazaOficialComparacionRef.current = trazaOficialComparacion;
    puntoReferenciaRef.current = puntoReferencia;
  }, [
    posicionActual,
    modo,
    variante,
    trazaCoords,
    puntosGps,
    puntoResaltado,
    trazaOficialComparacion,
    puntoReferencia,
  ]);

  const [inicioPx, setInicioPx] = useState<PuntoPx | null>(null);
  const [finPx, setFinPx] = useState<PuntoPx | null>(null);
  const [posicionPx, setPosicionPx] = useState<PuntoPx | null>(null);
  const [trazaAndadaPx, setTrazaAndadaPx] = useState<PuntoPx[]>([]);
  const [trazaRestantePx, setTrazaRestantePx] = useState<PuntoPx[]>([]);
  const [puntoResaltadoPx, setPuntoResaltadoPx] = useState<PuntoPx | null>(null);
  const [trazaOficialComparacionPx, setTrazaOficialComparacionPx] = useState<PuntoPx[]>([]);
  const [puntoReferenciaPx, setPuntoReferenciaPx] = useState<PuntoPx | null>(null);

  const recalcularOverlay = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const proyectar = (lonLat: [number, number]): PuntoPx => {
      const p = map.project(lonLat as [number, number]);
      return { x: p.x, y: p.y };
    };

    // Overlays exclusivos del admin (DT-021): no-op cuando no se pasan las
    // props (el público nunca las pasa) — se recalculan siempre, con
    // independencia de la variante, para no dejar un valor stale de un
    // render anterior.
    const comparacion = trazaOficialComparacionRef.current;
    setTrazaOficialComparacionPx(
      comparacion.length > 1 ? comparacion.map(proyectar) : []
    );
    const referencia = puntoReferenciaRef.current;
    setPuntoReferenciaPx(referencia ? proyectar([referencia.lon, referencia.lat]) : null);

    // Variante "libre" (DT-016): sin traza oficial de fondo ni marcador de
    // fin de ruta — solo la polilínea de los puntos GPS recibidos (reutiliza
    // el bucket "andada", que ya se pinta en naranja cuando modo === "directo")
    // y el marcador de posición actual/resaltado.
    if (varianteRef.current === "libre") {
      const puntos = puntosGpsRef.current;
      setInicioPx(null);
      setFinPx(null);
      setTrazaRestantePx([]);
      setTrazaAndadaPx(puntos.map((p) => proyectar([p.lon, p.lat])));

      const pos = posicionRef.current;
      setPosicionPx(modoRef.current === "directo" && pos ? proyectar([pos.lon, pos.lat]) : null);

      const punto = puntoResaltadoRef.current;
      setPuntoResaltadoPx(punto ? proyectar([punto.lon, punto.lat]) : null);
      return;
    }

    // Variante "ruta", modo "resumen" (pantalla "antes del reto"): sin
    // recorrido real que mostrar todavía — se sigue pintando la traza
    // oficial completa, comportamiento sin cambios respecto a antes de
    // DT-021.
    if (modoRef.current !== "directo") {
      const traza = trazaCoordsRef.current;
      if (traza.length === 0) return;

      setInicioPx(proyectar(traza[0]));
      setFinPx(proyectar(traza[traza.length - 1]));
      setPosicionPx(null);
      setTrazaAndadaPx([]);
      setTrazaRestantePx(traza.map(proyectar));

      const punto = puntoResaltadoRef.current;
      setPuntoResaltadoPx(punto ? proyectar([punto.lon, punto.lat]) : null);
      return;
    }

    // Variante "ruta", modo "directo" (durante/llegada, DT-021): recorrido
    // GPS real en vez de la traza oficial, manteniendo el marcador de fin de
    // ruta (⛪) sobre el último punto de `trazaCoords`. Sin marcador de
    // inicio (igual que "libre": ya no hay traza oficial completa pintada).
    const puntos = puntosGpsRef.current;
    setInicioPx(null);
    setTrazaRestantePx([]);
    setTrazaAndadaPx(puntos.map((p) => proyectar([p.lon, p.lat])));

    const traza = trazaCoordsRef.current;
    setFinPx(traza.length > 0 ? proyectar(traza[traza.length - 1]) : null);

    const pos = posicionRef.current;
    setPosicionPx(pos ? proyectar([pos.lon, pos.lat]) : null);

    const punto = puntoResaltadoRef.current;
    setPuntoResaltadoPx(punto ? proyectar([punto.lon, punto.lat]) : null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let map: import("maplibre-gl").Map | null = null;

    (async () => {
      const { Map: MapLibreMap, AttributionControl, config } = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      // Causa raíz completa (DT-008, docs/tecnico/decisiones-tecnicas.md):
      // maplibre-gl calcula la URL de su Worker en tiempo de ejecución vía
      // `config.WORKER_URL`. Turbopack solo bundlea un Worker cuando el
      // propio código de la app contiene literalmente `new Worker(new
      // URL(...))` como expresión estática — como esa URL le llega a
      // maplibre-gl ya resuelta (no como literal en la app), Turbopack nunca
      // puede aplicar ese análisis, venga de donde venga el fichero
      // referenciado (de node_modules o de la propia app). En cualquiera de
      // los dos casos lo trata como asset estático copiado en crudo, sin
      // bundlear el `import ... from "./maplibre-gl-shared.mjs"` interno del
      // propio worker — esa ruta sin hash nunca existe en el output real, lo
      // que provoca un 404 silencioso dentro del contexto del worker
      // (invisible desde el hilo principal: MapLibre no engancha
      // `worker.onerror`). La solución es pre-empaquetar el worker con
      // esbuild (scripts/bundle-maplibre-worker.ts, inlinea
      // maplibre-gl-shared.mjs, sin imports externos restantes) y servirlo
      // como fichero estático desde public/, fuera por completo del
      // pipeline de bundling de Turbopack.
      if (!config.WORKER_URL) {
        config.WORKER_URL = "/maplibre-gl-worker.bundled.js";
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

      // MapLibre no propaga fallos internos (p. ej. de estilo o de fuentes)
      // fuera de su propio Evented — sin este listener, un error real
      // quedaría completamente silencioso (ver docs/LESSONS.md: el fallo
      // del worker que originó este mismo componente tampoco se veía).
      instancia.on("error", (e) => console.error("Error de MapLibre GL:", e.error));

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

  // Recalcula cuando cambian posición/modo/variante/puntosGps/puntoResaltado
  // (aunque el mapa no se mueva).
  useEffect(() => {
    if (listo) recalcularOverlay();
  }, [
    listo,
    posicionActual,
    modo,
    variante,
    puntosGps,
    puntoResaltado,
    trazaOficialComparacion,
    puntoReferencia,
    recalcularOverlay,
  ]);

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
        {/* Traza oficial de comparación (DT-021, solo admin): se pinta antes
            que el resto para quedar por debajo del recorrido real. */}
        {trazaOficialComparacionPx.length > 1 && (
          <polyline
            points={trazaOficialComparacionPx.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={COLOR_TRAZA_OFICIAL_COMPARACION}
            strokeWidth={4}
            strokeOpacity={0.75}
            strokeDasharray="2,7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
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
          <text x={finPx.x} y={finPx.y + 7} textAnchor="middle" fontSize={22} fill="#C9A24B">
            ⛪
          </text>
        )}
        {/* Línea discontinua entre la posición real y el punto de referencia
            (DT-021, solo admin): antes que los marcadores, para que ambos
            queden por encima de la línea. */}
        {posicionPx && puntoReferenciaPx && (
          <line
            x1={posicionPx.x}
            y1={posicionPx.y}
            x2={puntoReferenciaPx.x}
            y2={puntoReferenciaPx.y}
            stroke={COLOR_PUNTO_REFERENCIA}
            strokeWidth={2}
            strokeDasharray="5,5"
            strokeLinecap="round"
          />
        )}
        {puntoReferenciaPx && (
          <circle
            cx={puntoReferenciaPx.x}
            cy={puntoReferenciaPx.y}
            r={7}
            fill={COLOR_PUNTO_REFERENCIA}
            stroke="#fff"
            strokeWidth={2}
          />
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
        {puntoResaltadoPx && puntoResaltado && (
          <g>
            <rect
              x={puntoResaltadoPx.x - 20}
              y={puntoResaltadoPx.y - 34}
              width={40}
              height={20}
              rx={10}
              fill="#D9773B"
            />
            <text
              x={puntoResaltadoPx.x}
              y={puntoResaltadoPx.y - 20}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fontWeight={600}
              fill="#fff"
            >
              {puntoResaltado.hora}
            </text>
            <rect
              x={puntoResaltadoPx.x - 4}
              y={puntoResaltadoPx.y - 16}
              width={8}
              height={8}
              fill="#D9773B"
              transform={`rotate(45 ${puntoResaltadoPx.x} ${puntoResaltadoPx.y - 12})`}
            />
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
