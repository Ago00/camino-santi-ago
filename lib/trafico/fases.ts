/**
 * Clasificación de visitas a la web pública por fase del intento relevante
 * (DT-023, docs/tecnico/decisiones-tecnicas.md): "antes" (previas al inicio
 * del reto), "durante" (mientras el intento estuvo/está en marcha) y
 * "después" (tras el cierre del intento).
 *
 * Dominio puro: sin I/O, sin `Date.now()`/`new Date()` implícito — el rango
 * (`cuentaDesde`, `startedAt`, `endedAt`, `ahora`) entra siempre como
 * parámetro, mismo criterio que `lib/trafico/bucketing.ts`.
 *
 * Tramos semiabiertos [inicio, fin), igual que en `bucketing.ts`:
 * - antes:   [cuentaDesde, startedAt ?? ahora)
 * - durante: [startedAt,   endedAt ?? ahora)
 * - después: [endedAt,     ahora]  (solo si el intento está cerrado)
 *
 * `faseDeVisita`/`clasificarVisitasPorFase` no necesitan `ahora` para
 * clasificar una visita ya ocurrida: sin `endedAt`, cualquier `ts >=
 * startedAt` es "durante" sin más acotación (una visita futura respecto a
 * `ahora` no es un caso real con datos ya insertados en BD). El límite
 * `ahora` solo hace falta para acotar el TRAMO abierto al pintar
 * (`rangoDeFase`, más abajo), no para decidir el cubo de cada visita.
 */

export type FaseTraficoVisita = "antes" | "durante" | "despues";

/** Lo mínimo de una visita que necesita la clasificación: su marca temporal. */
export interface VisitaParaFase {
  ts: string; // ISO 8601
}

/**
 * Datos del intento relevante para acotar las fases. `startedAt`/`endedAt`
 * a `null` significan, respectivamente, "el reto no ha empezado todavía" y
 * "el intento sigue en marcha (no se ha cerrado)".
 */
export interface IntentoParaFase {
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface VisitasPorFase<T extends VisitaParaFase> {
  antes: T[];
  durante: T[];
  despues: T[];
}

/**
 * Clasifica `visitas` (ya filtradas por `ts >= cuentaDesde` en la consulta)
 * según la fase del intento en la que cayó cada una. Si no hay ningún
 * intento (`intento` es `null`, nunca se creó ninguno) todo cae en "antes".
 */
export function clasificarVisitasPorFase<T extends VisitaParaFase>(
  visitas: T[],
  intento: IntentoParaFase | null
): VisitasPorFase<T> {
  const resultado: VisitasPorFase<T> = { antes: [], durante: [], despues: [] };

  for (const visita of visitas) {
    resultado[faseDeVisita(visita, intento)].push(visita);
  }

  return resultado;
}

/** Fase de una única visita, misma lógica que `clasificarVisitasPorFase`. */
export function faseDeVisita(visita: VisitaParaFase, intento: IntentoParaFase | null): FaseTraficoVisita {
  const ts = new Date(visita.ts).getTime();

  if (!intento || !intento.startedAt) return "antes";

  const startedAtMs = intento.startedAt.getTime();
  if (ts < startedAtMs) return "antes";

  if (!intento.endedAt) return "durante";

  const endedAtMs = intento.endedAt.getTime();
  if (ts < endedAtMs) return "durante";

  return "despues";
}

/**
 * Fase por defecto a mostrar cuando la URL no trae `?fase=` (DT-023): la fase
 * en la que "está" el reto ahora mismo. "durante" si el intento está en
 * marcha o ya llegó (`startedAt` presente, cerrado o no); "antes" si el reto
 * no ha empezado todavía.
 */
export function faseTraficoPorDefecto(intento: IntentoParaFase | null): FaseTraficoVisita {
  if (!intento || !intento.startedAt) return "antes";
  return "durante";
}

/**
 * Rango [desde, hasta] a agrupar en tramos (`agruparVisitasEnTramos`) para
 * una fase concreta. Devuelve `null` cuando la fase no aplica al intento
 * actual (p. ej. "durante"/"despues" sin ningún intento, o "despues" sobre
 * un intento que sigue en marcha) — quien llama debe tratarlo como "sin
 * datos que mostrar", no como un rango de duración cero.
 */
export function rangoDeFase(
  fase: FaseTraficoVisita,
  cuentaDesde: Date,
  intento: IntentoParaFase | null,
  ahora: Date
): { desde: Date; hasta: Date } | null {
  if (fase === "antes") {
    return { desde: cuentaDesde, hasta: intento?.startedAt ?? ahora };
  }

  if (fase === "durante") {
    if (!intento?.startedAt) return null;
    return { desde: intento.startedAt, hasta: intento.endedAt ?? ahora };
  }

  // fase === "despues"
  if (!intento?.endedAt) return null;
  return { desde: intento.endedAt, hasta: ahora };
}
