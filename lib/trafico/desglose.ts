/**
 * Desglose de visitas por ruta y por origen (referer) para la pestaña
 * "Tráfico" (DT-022). Dominio puro, sin I/O — mismo criterio que
 * `lib/trafico/bucketing.ts`.
 */

export interface VisitaParaDesglose {
  ruta: string;
  referer: string | null;
}

export interface ConteoRuta {
  ruta: string;
  cuenta: number;
}

export interface ConteoOrigen {
  /** Dominio del referer, o "Directo" cuando no vino ninguno. */
  origen: string;
  cuenta: number;
}

/** Agrupa por `ruta` exacta, ordenado de más a menos visitas. */
export function agruparPorRuta(visitas: VisitaParaDesglose[]): ConteoRuta[] {
  const conteos = new Map<string, number>();
  for (const visita of visitas) {
    conteos.set(visita.ruta, (conteos.get(visita.ruta) ?? 0) + 1);
  }
  return [...conteos.entries()]
    .map(([ruta, cuenta]) => ({ ruta, cuenta }))
    .sort((a, b) => b.cuenta - a.cuenta);
}

/**
 * Agrupa por dominio del `referer` (sin protocolo ni ruta). Sin referer se
 * agrupa como "Directo"; un referer que no es una URL válida se cuenta tal
 * cual (caso raro, pero nunca debe perder la visita).
 */
export function agruparPorOrigen(visitas: VisitaParaDesglose[]): ConteoOrigen[] {
  const conteos = new Map<string, number>();
  for (const visita of visitas) {
    const origen = dominioDeReferer(visita.referer);
    conteos.set(origen, (conteos.get(origen) ?? 0) + 1);
  }
  return [...conteos.entries()]
    .map(([origen, cuenta]) => ({ origen, cuenta }))
    .sort((a, b) => b.cuenta - a.cuenta);
}

function dominioDeReferer(referer: string | null): string {
  if (!referer) return "Directo";
  try {
    return new URL(referer).hostname;
  } catch {
    return referer;
  }
}
