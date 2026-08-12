// Sección "Tráfico" del panel admin (DT-022/DT-023, docs/tecnico/decisiones-tecnicas.md):
// cuánta gente visita la web pública durante el reto. Server Component, sin
// polling (se actualiza al recargar la pestaña) — mismo patrón que
// SeccionActividad/SeccionMapa.
//
// El rango de datos traídos de BD ya no es el intento activo: es TODO lo que
// haya desde `config_trafico.cuenta_desde` (DT-023, ajustable con el botón
// "Reset" sin borrar nada), clasificado en memoria en tres fases —
// antes/durante/después del intento relevante (activo o, si no hay ninguno
// activo, el más reciente) — con `lib/trafico/fases.ts`. La granularidad
// (5 min/30 min/1 h, ?gran=) y la fase mostrada (?fase=) llegan como query
// string, mismo patrón que el resto del panel.

import Link from "next/link";
import { resetearContadorTrafico } from "@/app/admin/actions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { obtenerTodasLasFilas } from "@/lib/supabase/paginacion";
import { agruparVisitasEnTramos, type GranularidadTrafico, type TramoTrafico } from "@/lib/trafico/bucketing";
import { agruparPorOrigen, agruparPorRuta } from "@/lib/trafico/desglose";
import {
  clasificarVisitasPorFase,
  faseTraficoPorDefecto,
  rangoDeFase,
  type FaseTraficoVisita,
  type IntentoParaFase,
} from "@/lib/trafico/fases";
import type { FaseTraficoTab } from "@/lib/admin/navegacion";
import type { VisitaWeb } from "@/lib/types";
import BotonConfirmable from "@/components/admin/BotonConfirmable";
import GraficoTraficoScroll from "@/components/admin/GraficoTraficoScroll";

const C = { ink: "#1B211D", muted: "#4A5450", eucalipto: "#2F5D50" };

const OPCIONES_GRANULARIDAD: { valor: GranularidadTrafico; etiqueta: string }[] = [
  { valor: "5m", etiqueta: "5 min" },
  { valor: "30m", etiqueta: "30 min" },
  { valor: "1h", etiqueta: "1 hora" },
];

const ETIQUETAS_FASE: Record<FaseTraficoVisita, string> = {
  antes: "Antes",
  durante: "Durante",
  despues: "Después",
};

/** Sin cutoff: usado cuando `config_trafico` no existe todavía (migración sin aplicar) o no tiene fila. */
const CUENTA_DESDE_FALLBACK = new Date(0);

const ANCHO_POR_TRAMO_PX = 22;
const ALTO_GRAFICO_PX = 140;
const MARGEN_SUPERIOR_PX = 16; // hueco arriba para la cifra de cada punto
const ALTO_SVG_PX = ALTO_GRAFICO_PX + MARGEN_SUPERIOR_PX + 36; // + hueco debajo para las etiquetas de hora
// Un <svg> recorta por defecto cualquier trazo fuera de [0,width]x[0,height]
// (a diferencia de un <div> normal). Las etiquetas de hora van centradas
// (textAnchor="middle") justo sobre el primer y el último punto — sin este
// margen, la mitad de esas etiquetas queda fuera del ancho del SVG y se
// recorta silenciosamente (bug real reportado: "la hora de inicio se corta
// y el 'ahora' también" — el último tramo puede coincidir con una hora en
// punto y sufrir el mismo recorte por el lado derecho).
const MARGEN_HORIZONTAL_PX = 22;

interface SeccionTraficoProps {
  granularidad: GranularidadTrafico;
  /** Fase pedida por la URL (`?fase=`), ya validada; `undefined` si no vino o no era válida. */
  faseQuery: FaseTraficoTab | undefined;
}

export default async function SeccionTrafico({ granularidad, faseQuery }: SeccionTraficoProps) {
  const supabase = getSupabaseAdmin();
  const ahora = new Date();

  const cuentaDesde = await obtenerCuentaDesde();

  const { data: intentoActivo } = await supabase
    .from("intentos")
    .select("id, started_at, ended_at")
    .eq("cerrado", false)
    .maybeSingle();

  const intentoRelevante =
    intentoActivo ??
    (
      await supabase
        .from("intentos")
        .select("id, started_at, ended_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data;

  const intentoParaFase: IntentoParaFase | null = intentoRelevante
    ? {
        startedAt: intentoRelevante.started_at ? new Date(intentoRelevante.started_at) : null,
        endedAt: intentoRelevante.ended_at ? new Date(intentoRelevante.ended_at) : null,
      }
    : null;

  const visitas = await obtenerTodasLasFilas<VisitaWeb>((rangoDesde, rangoHasta) =>
    supabase
      .from("visitas_web")
      .select("*")
      .gte("ts", cuentaDesde.toISOString())
      .order("ts", { ascending: true })
      .range(rangoDesde, rangoHasta)
  );

  const visitasPorFase = clasificarVisitasPorFase(visitas, intentoParaFase);
  const fasesDisponibles = fasesDisponiblesPara(intentoParaFase);
  const faseActiva: FaseTraficoVisita =
    faseQuery && fasesDisponibles.includes(faseQuery) ? faseQuery : faseTraficoPorDefecto(intentoParaFase);

  const visitasFase = visitasPorFase[faseActiva];
  const rango = rangoDeFase(faseActiva, cuentaDesde, intentoParaFase, ahora);

  const totalVisitas = visitasFase.length;
  const visitantesUnicos = new Set(visitasFase.map((v) => v.visitante_id)).size;
  const tramos = rango ? agruparVisitasEnTramos(visitasFase, rango.desde, rango.hasta, granularidad) : [];
  const porRuta = agruparPorRuta(visitasFase);
  const porOrigen = agruparPorOrigen(visitasFase);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <TarjetaMetrica etiqueta="Visitas" valor={totalVisitas} />
        <TarjetaMetrica etiqueta="Visitantes únicos" valor={visitantesUnicos} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {fasesDisponibles.length > 1 && (
          <SelectorFase activa={faseActiva} disponibles={fasesDisponibles} granularidad={granularidad} />
        )}
        <BotonConfirmable
          etiqueta="Reset"
          etiquetaPendiente="Reseteando…"
          mensajeConfirmacion="¿Resetear el contador de tráfico? No se borra nada, pero todas las visitas de antes de ahora dejan de contar en el panel."
          accion={resetearContadorTrafico}
          variante="peligro"
          className="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-50"
        />
      </div>

      <SelectorGranularidad activa={granularidad} fase={faseActiva} />

      {totalVisitas === 0 ? (
        <div
          className="rounded-2xl border p-6 text-center text-[13.5px]"
          style={{ borderColor: "#00000012", background: "white", color: C.muted }}
        >
          Sin visitas todavía en este rango.
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-[12px] uppercase tracking-wide" style={{ color: C.muted }}>
            Visitas por tramo
          </div>
          <GraficoTraficoScroll>
            <GraficoTrafico tramos={tramos} />
          </GraficoTraficoScroll>
        </div>
      )}

      <TablaDesglose titulo="Por página" filas={porRuta.map((f) => ({ etiqueta: f.ruta, cuenta: f.cuenta }))} />
      <TablaDesglose titulo="Por origen" filas={porOrigen.map((f) => ({ etiqueta: f.origen, cuenta: f.cuenta }))} />
    </div>
  );
}

/**
 * Lee `config_trafico` (fila única, id=1). Si la tabla o la fila no existen
 * todavía (migración 0005 sin aplicar contra producción, mismo criterio que
 * 0003/0004 — ver DEBT.md), se trata como "sin cutoff": todo el histórico de
 * `visitas_web` cuenta, comportamiento idéntico al de antes de esta tarea.
 * Sin log — es un estado esperado mientras la migración no se aplique, no un
 * error real.
 */
async function obtenerCuentaDesde(): Promise<Date> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("config_trafico").select("cuenta_desde").eq("id", 1).maybeSingle();

  if (error || !data) return CUENTA_DESDE_FALLBACK;
  return new Date(data.cuenta_desde);
}

/**
 * Fases con contenido potencial según el intento relevante (DT-023): "antes"
 * siempre; "durante" solo si el reto ha empezado alguna vez (`startedAt`);
 * "despues" solo si además ese intento está cerrado (`endedAt`).
 */
function fasesDisponiblesPara(intento: IntentoParaFase | null): FaseTraficoVisita[] {
  const fases: FaseTraficoVisita[] = ["antes"];
  if (intento?.startedAt) fases.push("durante");
  if (intento?.endedAt) fases.push("despues");
  return fases;
}

function TarjetaMetrica({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "#00000012", background: "white" }}>
      <div className="text-[12px] uppercase tracking-wide" style={{ color: C.muted }}>
        {etiqueta}
      </div>
      <div className="mt-1 text-[22px] font-semibold" style={{ color: C.ink }}>
        {valor}
      </div>
    </div>
  );
}

function SelectorFase({
  activa,
  disponibles,
  granularidad,
}: {
  activa: FaseTraficoVisita;
  disponibles: FaseTraficoVisita[];
  granularidad: GranularidadTrafico;
}) {
  return (
    <div className="flex gap-2">
      {disponibles.map((fase) => (
        <Link
          key={fase}
          href={`/admin?tab=trafico&gran=${granularidad}&fase=${fase}`}
          className="rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors"
          style={
            activa === fase ? { background: C.eucalipto, color: "white" } : { color: C.ink, background: "#00000008" }
          }
        >
          {ETIQUETAS_FASE[fase]}
        </Link>
      ))}
    </div>
  );
}

function SelectorGranularidad({ activa, fase }: { activa: GranularidadTrafico; fase: FaseTraficoVisita }) {
  return (
    <div className="flex gap-2">
      {OPCIONES_GRANULARIDAD.map((opcion) => (
        <Link
          key={opcion.valor}
          href={`/admin?tab=trafico&gran=${opcion.valor}&fase=${fase}`}
          className="rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors"
          style={
            activa === opcion.valor
              ? { background: C.eucalipto, color: "white" }
              : { color: C.ink, background: "#00000008" }
          }
        >
          {opcion.etiqueta}
        </Link>
      ))}
    </div>
  );
}

function GraficoTrafico({ tramos }: { tramos: TramoTrafico[] }) {
  const maxCuenta = Math.max(...tramos.map((t) => t.cuenta), 1);
  const anchoContenido = Math.max(tramos.length * ANCHO_POR_TRAMO_PX, 320 - MARGEN_HORIZONTAL_PX * 2);
  const anchoSvg = anchoContenido + MARGEN_HORIZONTAL_PX * 2;
  const lineaBaseY = MARGEN_SUPERIOR_PX + ALTO_GRAFICO_PX;

  const puntos = tramos.map((tramo, i) => {
    const x = MARGEN_HORIZONTAL_PX + i * ANCHO_POR_TRAMO_PX + ANCHO_POR_TRAMO_PX / 2;
    const y = MARGEN_SUPERIOR_PX + ALTO_GRAFICO_PX - (tramo.cuenta / maxCuenta) * (ALTO_GRAFICO_PX - 8);
    return { x, y, tramo };
  });

  const puntosPolyline = puntos.map((p) => `${p.x},${p.y}`).join(" ");
  const ultimoPunto = puntos.at(-1);

  return (
    <svg width={anchoSvg} height={ALTO_SVG_PX} role="img" aria-label="Visitas por tramo, evolución en el tiempo">
      <line x1={0} y1={lineaBaseY} x2={anchoSvg} y2={lineaBaseY} stroke="#00000012" strokeWidth={1} />

      <polyline points={puntosPolyline} fill="none" stroke={C.eucalipto} strokeWidth={2} />

      {puntos.map((p, i) => {
        const esUltimo = i === puntos.length - 1;
        if (esUltimo) return null; // el último punto se pinta aparte, con su etiqueta "ahora"
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={p.tramo.cuenta > 0 ? 2.5 : 0} fill={C.eucalipto} />
            {p.tramo.cuenta > 0 && (
              <text
                x={p.x}
                y={Math.max(10, p.y - 7)}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill={C.eucalipto}
              >
                {p.tramo.cuenta}
              </text>
            )}
          </g>
        );
      })}

      {ultimoPunto && (
        <g>
          <circle cx={ultimoPunto.x} cy={ultimoPunto.y} r={4} fill="#C05621" />
          <text
            x={ultimoPunto.x}
            y={Math.max(10, ultimoPunto.y - 9)}
            textAnchor="end"
            fontSize={10}
            fontWeight={600}
            fill="#C05621"
          >
            {ultimoPunto.tramo.cuenta} · ahora
          </text>
        </g>
      )}

      {puntos.map(
        (p, i) =>
          (p.tramo.inicio.getMinutes() === 0 || i === 0) && (
            <text key={i} x={p.x} y={lineaBaseY + 16} textAnchor="middle" fontSize={11} fill={C.muted}>
              {p.tramo.inicio.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
            </text>
          )
      )}
    </svg>
  );
}

function TablaDesglose({ titulo, filas }: { titulo: string; filas: { etiqueta: string; cuenta: number }[] }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "#00000012", background: "white" }}>
      <div className="text-[12px] uppercase tracking-wide" style={{ color: C.muted }}>
        {titulo}
      </div>
      {filas.length === 0 ? (
        <div className="mt-1 text-[13.5px]" style={{ color: C.muted }}>
          Sin datos todavía.
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          {filas.map((fila) => (
            <div key={fila.etiqueta} className="flex items-center justify-between text-[13.5px]" style={{ color: C.ink }}>
              <span>{fila.etiqueta}</span>
              <span className="font-medium">{fila.cuenta}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
