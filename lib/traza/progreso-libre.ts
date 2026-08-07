/**
 * Dominio puro del modo "libre" (DT-016): distancia restante en línea recta
 * (haversine) entre la última posición no descartada y el destino fijado al
 * iniciar el intento.
 *
 * Deliberadamente SIN corredor, sin rechazo de velocidad implícita ni de
 * precisión GPS — a diferencia de calcularProgreso() (modo guiado,
 * lib/traza/proyeccion.ts), en modo libre los puntos se aceptan y se dibujan
 * sin validar si tienen sentido (no hay traza fija contra la que
 * comparar). Ver DT-016 en docs/tecnico/decisiones-tecnicas.md.
 *
 * Sin I/O: recibe el histórico de posiciones y el destino ya resueltos por
 * quien la llama (app/api/progreso/route.ts, app/page.tsx).
 */

import { haversineKm } from "@/lib/traza/proyeccion";
import type { Posicion, ProgresoPublicoLibre } from "@/lib/types";

export interface DestinoLibre {
  lat: number;
  lon: number;
}

/**
 * @param historico Posiciones del intento, en cualquier orden.
 * @param destino Destino fijado al iniciar el intento, o null si el intento
 *   todavía no tiene ninguno (no debería ocurrir en un intento libre bien
 *   formado — ver "casos límite" en docs/tareas/CURRENT.md — pero se
 *   contempla explícitamente: `distanciaRestanteKm` queda en null).
 */
export function calcularProgresoLibre(
  historico: Posicion[],
  destino: DestinoLibre | null
): ProgresoPublicoLibre {
  const ultima = ultimaPosicionNoDescartada(historico);

  return {
    modo: "libre",
    distanciaRestanteKm:
      ultima && destino
        ? haversineKm(ultima.lat, ultima.lon, destino.lat, destino.lon)
        : null,
    ultimaPosicion: ultima
      ? { lat: ultima.lat, lon: ultima.lon, ts: ultima.ts }
      : null,
  };
}

/**
 * La posición no descartada con el `ts` más reciente, o null si no hay
 * ninguna. No asume que `historico` venga ya ordenado por `ts`.
 */
function ultimaPosicionNoDescartada(historico: Posicion[]): Posicion | null {
  const validas = historico.filter((p) => !p.descartado);
  if (validas.length === 0) return null;

  return validas.reduce((masReciente, actual) =>
    new Date(actual.ts).getTime() > new Date(masReciente.ts).getTime()
      ? actual
      : masReciente
  );
}
