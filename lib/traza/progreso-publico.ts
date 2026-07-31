/**
 * Proyección de `Progreso` (dominio interno) a `ProgresoPublico` (lo que
 * viaja al cliente en F3).
 *
 * Dominio puro: sin I/O. Cierra la deuda técnica registrada en DEBT.md
 * ("`Progreso` expone campos internos de `Posicion` al serializar hacia el
 * cliente en F3") — `ultimaPosicion` nunca debe llevar `batt`, `acc`,
 * `intento_id`, `fuente` ni `descartado` fuera del servidor.
 */

import type { Progreso, ProgresoPublico } from "@/lib/types";

/** Proyecta un `Progreso` completo al subconjunto seguro para el cliente. */
export function aProgresoPublico(progreso: Progreso): ProgresoPublico {
  return {
    porcentaje: progreso.porcentaje,
    kmAvanzados: progreso.kmAvanzados,
    kmRestantes: progreso.kmRestantes,
    odometroKm: progreso.odometroKm,
    estado: progreso.estado,
    ultimaPosicion: progreso.ultimaPosicion
      ? {
          lat: progreso.ultimaPosicion.lat,
          lon: progreso.ultimaPosicion.lon,
          ts: progreso.ultimaPosicion.ts,
        }
      : null,
  };
}
