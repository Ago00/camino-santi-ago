// Dominio puro: ritmo medio (km/h) de un intento completo. Misma fórmula que
// `calcularRitmoMedio` de components/publico/ModoDurante.tsx (odómetro entre
// horas transcurridas), pero parametrizada por un instante final arbitrario
// en vez de "ahora" — así sirve tanto para el intento en curso (ModoDurante,
// final = ahora) como para el intento ya cerrado (ModoLlegada, final = ended_at).

export function calcularRitmoMedioIntento(
  odometroKm: number,
  iniciadoEn: string | null,
  finalizadoEn: Date | string | null
): string {
  if (!iniciadoEn || !finalizadoEn) return "—";
  const inicio = new Date(iniciadoEn).getTime();
  const final = typeof finalizadoEn === "string" ? new Date(finalizadoEn).getTime() : finalizadoEn.getTime();
  const horasTranscurridas = (final - inicio) / 3_600_000;
  if (horasTranscurridas <= 0) return "—";
  return (odometroKm / horasTranscurridas).toLocaleString("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
