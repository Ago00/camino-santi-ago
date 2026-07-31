// Grid de 3 estadísticas: tiempo en marcha, km andados, ritmo medio.
// Sigue fielmente el mockup (componente Stat de design-sandbox/app/camino/page.tsx).

interface StatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
}

function Stat({ icon, label, value, unit }: StatProps) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "#00000010", background: "#FBFAF7" }}>
      <div className="mb-1.5 flex items-center gap-1" style={{ color: "#9AA29C" }}>
        {icon}
      </div>
      <div className="font-mono text-[21px] font-semibold leading-none tabular-nums" style={{ color: "#1B211D" }}>
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wide" style={{ color: "#8A928C" }}>
        {label} · {unit}
      </div>
    </div>
  );
}

interface StatsProps {
  tiempoEnMarcha: string; // "hh:mm"
  kmAndados: string; // ya formateado
  ritmoMedio: string; // ya formateado
}

export default function Stats({ tiempoEnMarcha, kmAndados, ritmoMedio }: StatsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Stat icon={<IconClock />} label="En marcha" value={tiempoEnMarcha} unit="h · m" />
      <Stat icon={<IconRoute />} label="Caminados" value={kmAndados} unit="km" />
      <Stat icon={<IconGauge />} label="Ritmo medio" value={ritmoMedio} unit="km/h" />
    </div>
  );
}

function IconClock() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function IconRoute() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M8.5 19H14a4 4 0 0 0 0-8H10a4 4 0 0 1 0-8h5.5" />
    </svg>
  );
}
function IconGauge() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 14 15 9" />
      <path d="M4 18a8 8 0 1 1 16 0" />
      <circle cx="12" cy="14" r="1.2" fill="currentColor" />
    </svg>
  );
}
