/**
 * Agrupado por tramo de las visitas a la web pública para el gráfico de la
 * pestaña "Tráfico" (DT-022, docs/tecnico/decisiones-tecnicas.md).
 *
 * Dominio puro: sin I/O, sin `Date.now()`/`new Date()` implícito — el rango
 * (`desde`/`hasta`) y la granularidad entran como parámetros, igual que
 * `calcularProgreso` recibe la traza en `lib/traza/proyeccion.ts`. La misma
 * consulta en bruto (todas las visitas del intento) se reagrupa distinto solo
 * cambiando `granularidad`, sin volver a tocar la base de datos.
 *
 * Cada tramo es un intervalo semiabierto [inicio, inicio + duración) — una
 * visita con `ts` exactamente en el borde de un tramo pertenece al tramo que
 * EMPIEZA ahí, nunca al anterior.
 */

export type GranularidadTrafico = "5m" | "30m" | "1h";

const MINUTOS_POR_GRANULARIDAD: Record<GranularidadTrafico, number> = {
  "5m": 5,
  "30m": 30,
  "1h": 60,
};

/** Lo mínimo de una visita que necesita el agrupado: su marca temporal. */
export interface VisitaParaBucket {
  ts: string; // ISO 8601
}

export interface TramoTrafico {
  /** Inicio del tramo (incluido). */
  inicio: Date;
  /** Nº de visitas cuyo `ts` cae en [inicio, inicio + duración). */
  cuenta: number;
}

/**
 * Agrupa `visitas` en tramos consecutivos de `granularidad` minutos, desde
 * `desde` hasta `hasta` (ambos inclusive del rango cubierto). Siempre
 * devuelve al menos un tramo, incluso sin visitas o con `hasta <= desde`
 * (rango de duración cero: un único tramo que arranca en `desde`).
 */
export function agruparVisitasEnTramos(
  visitas: VisitaParaBucket[],
  desde: Date,
  hasta: Date,
  granularidad: GranularidadTrafico
): TramoTrafico[] {
  const msTramo = MINUTOS_POR_GRANULARIDAD[granularidad] * 60_000;
  const desdeMs = desde.getTime();
  const hastaMs = Math.max(hasta.getTime(), desdeMs);

  const marcasMs = visitas.map((v) => new Date(v.ts).getTime());

  const numTramos = Math.floor((hastaMs - desdeMs) / msTramo) + 1;
  const tramos: TramoTrafico[] = [];

  for (let i = 0; i < numTramos; i++) {
    const inicioTramoMs = desdeMs + i * msTramo;
    const finTramoMs = inicioTramoMs + msTramo;
    const cuenta = marcasMs.filter((ms) => ms >= inicioTramoMs && ms < finTramoMs).length;
    tramos.push({ inicio: new Date(inicioTramoMs), cuenta });
  }

  return tramos;
}
