/**
 * Caché en memoria de proceso del último `ProgresoPublico` calculado por
 * `GET /api/progreso` (DT-007). Extraída a módulo propio (DT-014) para que
 * `crearMinutoAMinuto` (`app/admin/actions.ts`) pueda leer el snapshot de
 * posición que la web pública está sirviendo realmente, en vez de una
 * lectura fresca de `posiciones` que podría ir "por delante" de lo que el
 * mapa está pintando en ese momento.
 *
 * Vive únicamente mientras el proceso de Next.js esté vivo — no se persiste
 * en BD ni se comparte entre instancias serverless (mismo riesgo aceptado
 * que DT-007/DT-011). El TTL solo determina si `/api/progreso` recalcula en
 * la siguiente petición; no invalida retroactivamente un valor ya guardado
 * aquí, así que los lectores de esta caché (como `crearMinutoAMinuto`) no
 * comprueban el TTL, solo si hay algo escrito.
 */

import type { ProgresoPublico } from "@/lib/types";

export const CACHE_TTL_MS = 20_000;

export interface EntradaCacheProgreso {
  timestamp: number;
  valor: ProgresoPublico;
}

let cache: EntradaCacheProgreso | null = null;

export function obtenerCacheProgreso(): EntradaCacheProgreso | null {
  return cache;
}

export function guardarCacheProgreso(valor: ProgresoPublico): void {
  cache = { timestamp: Date.now(), valor };
}

/** Invalidable en tests: fuerza el recálculo/lectura en fresco siguiente. */
export function limpiarCacheProgreso(): void {
  cache = null;
}
