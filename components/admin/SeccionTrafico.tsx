// Sección "Tráfico" del panel admin (DT-022, docs/tecnico/decisiones-tecnicas.md):
// cuánta gente visita la web pública durante el reto. Server Component, sin
// polling (se actualiza al recargar la pestaña) — mismo patrón que
// SeccionActividad/SeccionMapa. Rango: desde `started_at` del intento activo
// hasta ahora (no por día de calendario, la marcha puede cruzar medianoche).
// La granularidad (5 min/30 min/1 h) llega como prop desde ?gran= — misma
// consulta en bruto, solo cambia el agrupado al pintar (lib/trafico/bucketing.ts).

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { obtenerTodasLasFilas } from "@/lib/supabase/paginacion";
import { agruparVisitasEnTramos, type GranularidadTrafico, type TramoTrafico } from "@/lib/trafico/bucketing";
import { agruparPorOrigen, agruparPorRuta } from "@/lib/trafico/desglose";
import type { VisitaWeb } from "@/lib/types";
import GraficoTraficoScroll from "@/components/admin/GraficoTraficoScroll";

const C = { ink: "#1B211D", muted: "#4A5450", eucalipto: "#2F5D50" };

const OPCIONES_GRANULARIDAD: { valor: GranularidadTrafico; etiqueta: string }[] = [
  { valor: "5m", etiqueta: "5 min" },
  { valor: "30m", etiqueta: "30 min" },
  { valor: "1h", etiqueta: "1 hora" },
];

const ANCHO_POR_TRAMO_PX = 22;
const ALTO_GRAFICO_PX = 140;
const MARGEN_SUPERIOR_PX = 16; // hueco arriba para la cifra de cada punto
const ALTO_SVG_PX = ALTO_GRAFICO_PX + MARGEN_SUPERIOR_PX + 36; // + hueco debajo para las etiquetas de hora

interface SeccionTraficoProps {
  granularidad: GranularidadTrafico;
}

export default async function SeccionTrafico({ granularidad }: SeccionTraficoProps) {
  const supabase = getSupabaseAdmin();

  const { data: intentoActivo } = await supabase
    .from("intentos")
    .select("id, started_at")
    .eq("cerrado", false)
    .maybeSingle();

  if (!intentoActivo || !intentoActivo.started_at) {
    return (
      <p className="text-[14px]" style={{ color: C.muted }}>
        Todavía no ha empezado el reto — no hay ningún rango de tiempo que mostrar.
      </p>
    );
  }

  const desde = new Date(intentoActivo.started_at);
  const ahora = new Date();

  const visitas = await obtenerTodasLasFilas<VisitaWeb>((rangoDesde, rangoHasta) =>
    supabase
      .from("visitas_web")
      .select("*")
      .gte("ts", desde.toISOString())
      .order("ts", { ascending: true })
      .range(rangoDesde, rangoHasta)
  );

  const totalVisitas = visitas.length;
  const visitantesUnicos = new Set(visitas.map((v) => v.visitante_id)).size;
  const tramos = agruparVisitasEnTramos(visitas, desde, ahora, granularidad);
  const porRuta = agruparPorRuta(visitas);
  const porOrigen = agruparPorOrigen(visitas);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <TarjetaMetrica etiqueta="Visitas" valor={totalVisitas} />
        <TarjetaMetrica etiqueta="Visitantes únicos" valor={visitantesUnicos} />
      </div>

      <SelectorGranularidad activa={granularidad} />

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

function SelectorGranularidad({ activa }: { activa: GranularidadTrafico }) {
  return (
    <div className="flex gap-2">
      {OPCIONES_GRANULARIDAD.map((opcion) => (
        <Link
          key={opcion.valor}
          href={`/admin?tab=trafico&gran=${opcion.valor}`}
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
  const anchoSvg = Math.max(tramos.length * ANCHO_POR_TRAMO_PX, 320);
  const lineaBaseY = MARGEN_SUPERIOR_PX + ALTO_GRAFICO_PX;

  const puntos = tramos.map((tramo, i) => {
    const x = i * ANCHO_POR_TRAMO_PX + ANCHO_POR_TRAMO_PX / 2;
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
