// Distancia restante en línea recta hasta el destino (modo libre, DT-016).
// Visualmente hermano de Mojon.tsx (mismo tratamiento de cifra grande) pero
// sin barra de progreso: en modo libre no hay porcentaje ni traza oficial
// contra la que medirlo — solo la distancia haversine al destino.

import type { Textos } from "@/lib/textos/obtener-textos";

const C = { ink: "#1B211D" };

interface DistanciaRestanteProps {
  /** null si aún no hay ninguna posición registrada o el intento no tiene destino. */
  km: number | null;
  textos: Textos;
}

export default function DistanciaRestante({ km, textos }: DistanciaRestanteProps) {
  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ background: "linear-gradient(180deg,#EDEAE3,#E3DFD6)", border: "1px solid #00000012" }}
    >
      <div className="px-5 py-5">
        <div
          className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "#8A928C" }}
        >
          {textos.distancia_restante_kicker}
        </div>
        <div className="flex items-baseline gap-2">
          <span
            className="[font-family:var(--font-fraunces)] font-mono text-[52px] font-semibold leading-none tabular-nums"
            style={{ color: C.ink }}
          >
            {km === null ? "—" : formatearKm(km)}
          </span>
          {km !== null && (
            <span className="pb-1 text-[15px] font-medium" style={{ color: "#6A726C" }}>
              km
            </span>
          )}
        </div>
        <div className="mt-1 text-[12px]" style={{ color: "#7C857F" }}>
          {textos.distancia_restante_subtitulo}
        </div>
      </div>
    </div>
  );
}

function formatearKm(valor: number): string {
  return valor.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
