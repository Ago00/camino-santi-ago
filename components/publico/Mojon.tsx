// Mojón kilométrico: cifra de km restantes + barra de progreso monótona.
// Sigue fielmente el mockup (design-sandbox/app/camino/page.tsx, componente Mojon).

const C = {
  ink: "#1B211D",
  gold: "#C9A24B",
};

interface MojonProps {
  kmRestantes: string; // ya formateado (p.ej. "42,7")
  pct: number; // 0-100
}

export default function Mojon({ kmRestantes, pct }: MojonProps) {
  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ background: "linear-gradient(180deg,#EDEAE3,#E3DFD6)", border: "1px solid #00000012" }}
    >
      <div className="relative px-5 py-5">
        <div className="relative flex items-end justify-between">
          <div>
            <div
              className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: "#8A928C" }}
            >
              Santiago
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className="[font-family:var(--font-fraunces)] font-mono text-[52px] font-semibold leading-none tabular-nums"
                style={{ color: C.ink }}
              >
                {kmRestantes}
              </span>
              <span className="pb-1 text-[15px] font-medium" style={{ color: "#6A726C" }}>
                km
              </span>
            </div>
            <div className="mt-1 text-[12px]" style={{ color: "#7C857F" }}>
              te faltan para llegar
            </div>
          </div>
        </div>
        <div
          className="relative mt-4 h-2 w-full overflow-hidden rounded-full"
          style={{ background: "#00000014" }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: `linear-gradient(90deg,#D9773B,${C.gold})` }}
          />
        </div>
        <div
          className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums"
          style={{ color: "#9AA29C" }}
        >
          <span>O Porriño · 0</span>
          <span style={{ color: "#D9773B" }}>{Math.round(pct)}% recorrido</span>
          <span>100</span>
        </div>
      </div>
    </div>
  );
}
