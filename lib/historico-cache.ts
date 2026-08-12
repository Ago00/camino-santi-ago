/**
 * Caché en memoria de proceso del histórico completo de posiciones no
 * descartadas del intento activo (DT-021, fix post-revisión de Seguridad).
 *
 * Antes de DT-021, una visita a `/` en modo guiado ("durante"/"llegada")
 * solo pagaba `calcularProgresoDelIntento` — protegido por la caché de
 * `lib/progreso-cache.ts` (TTL 20 s, S2 de DT-018). DT-021 añadió una
 * segunda consulta independiente (el histórico de puntos GPS para pintar el
 * recorrido real en el mapa, `obtenerHistoricoPosiciones`) que no pasaba por
 * ninguna caché — con `/` sin rate limiting (DT-011 solo cubre
 * `/api/progreso`), cada visita volvía a pagar un fetch paginado completo
 * (hasta 50 páginas × 1.000 filas, `lib/supabase/paginacion.ts`), reabriendo
 * para modo guiado el mismo vector de coste que S2 ya había cerrado.
 *
 * Mismo patrón exacto que `lib/progreso-cache.ts` (un único slot en memoria,
 * mismo TTL): válido por el mismo invariante — solo hay un intento activo a
 * la vez (`docs/tecnico/arquitectura.md`), así que no hace falta cachear por
 * `intentoId`.
 */

import type { Posicion } from "@/lib/types";
import { CACHE_TTL_MS } from "@/lib/progreso-cache";

export { CACHE_TTL_MS };

export interface EntradaCacheHistorico {
  timestamp: number;
  valor: Posicion[];
}

let cache: EntradaCacheHistorico | null = null;

export function obtenerCacheHistorico(): EntradaCacheHistorico | null {
  return cache;
}

export function guardarCacheHistorico(valor: Posicion[]): void {
  cache = { timestamp: Date.now(), valor };
}

/** Invalidable en tests: fuerza el recálculo/lectura en fresco siguiente. */
export function limpiarCacheHistorico(): void {
  cache = null;
}
