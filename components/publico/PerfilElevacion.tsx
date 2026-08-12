// Estadísticas (distancia/ascenso/descenso) + perfil de elevación de la
// ruta, bajo el mapa en el hito "El recorrido" del modo "Antes".
// Sigue fielmente el mockup (componente PerfilElevacion de
// design-sandbox/app/camino-perfil/page.tsx). Contenido estático: usa
// directamente el JSON generado por scripts/generar-perfil-elevacion.ts
// (DT-009), sin props ni datos del servidor en cada request.

"use client";

import { useId } from "react";
import { motion } from "motion/react";
import { perfilElevacion, calcularDesnivel } from "@/lib/traza/perfil-elevacion";
import type { Textos } from "@/lib/textos/obtener-textos";

const C = {
  ink: "#1B211D",
  eucalipto: "#2F5D50",
  ember: "#D9773B",
};

interface PerfilElevacionProps {
  textos: Textos;
}

export default function PerfilElevacion({ textos }: PerfilElevacionProps) {
  const distanciaTotal = perfilElevacion[perfilElevacion.length - 1].km;
  const { ascensoM, descensoM } = calcularDesnivel(perfilElevacion);
  const primerPunto = perfilElevacion[0];
  const ultimoPunto = perfilElevacion[perfilElevacion.length - 1];

  return (
    <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "#00000012", background: "#FBFAF7" }}>
      <div className="grid grid-cols-3 gap-px" style={{ background: "#00000010" }}>
        <MiniStat icon={<IconRoute />} value={distanciaTotal.toFixed(0)} unit="km" label={textos.perfil_label_distancia} />
        <MiniStat icon={<IconUp />} value={ascensoM.toFixed(0)} unit="m" label={textos.perfil_label_ascenso} color={C.ember} />
        <MiniStat icon={<IconDown />} value={descensoM.toFixed(0)} unit="m" label={textos.perfil_label_descenso} color={C.eucalipto} />
      </div>

      <div className="px-4 pb-4 pt-5">
        <PerfilSVG datos={perfilElevacion} />
        <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums" style={{ color: "#9AA29C" }}>
          <span>{textos.perfil_origen_nombre} · {primerPunto.m} m</span>
          <span>{textos.perfil_destino_nombre} · {ultimoPunto.m} m</span>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ icon, value, unit, label, color }: { icon: React.ReactNode; value: string; unit: string; label: string; color?: string }) {
  return (
    <div className="bg-[#FBFAF7] px-3 py-3">
      <div className="mb-1" style={{ color: color ?? "#9AA29C" }}>{icon}</div>
      <div className="font-mono text-[19px] font-semibold leading-none tabular-nums" style={{ color: C.ink }}>
        {value}
        <span className="ml-0.5 text-[11px] font-normal" style={{ color: "#8A928C" }}>{unit}</span>
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wide" style={{ color: "#8A928C" }}>{label}</div>
    </div>
  );
}

function PerfilSVG({ datos }: { datos: { km: number; m: number }[] }) {
  const W = 400;
  const H = 100;
  const PAD_Y = 10;
  const gradId = useId();

  const maxKm = datos[datos.length - 1].km;
  const minM = Math.min(...datos.map((d) => d.m));
  const maxM = Math.max(...datos.map((d) => d.m));

  const x = (km: number) => (km / maxKm) * W;
  const y = (m: number) => H - PAD_Y - ((m - minM) / (maxM - minM)) * (H - PAD_Y * 2);

  const linePts = datos.map((d) => `${x(d.km)},${y(d.m)}`).join(" ");
  const areaPts = `0,${H} ${linePts} ${W},${H}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 100 }} aria-label="Perfil de elevación del recorrido">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.ember} stopOpacity={0.35} />
          <stop offset="100%" stopColor={C.ember} stopOpacity={0.03} />
        </linearGradient>
      </defs>
      <motion.polygon
        points={areaPts}
        fill={`url(#${gradId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />
      <motion.polyline
        points={linePts}
        fill="none"
        stroke={C.ember}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
    </svg>
  );
}

function IconRoute() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" /><path d="M8.5 19H14a4 4 0 0 0 0-8H10a4 4 0 0 1 0-8h5.5" />
    </svg>
  );
}
function IconUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 17 7M7 7h10v10" />
    </svg>
  );
}
function IconDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 7 17 17M17 7v10H7" />
    </svg>
  );
}
