/**
 * Carga y prepara la traza de CÁLCULO (lib/traza/traza.geojson) desde disco.
 *
 * Único punto del proyecto que lee traza.geojson del filesystem. Tanto
 * `proyeccion.ts` (dominio puro, sin I/O) como `/api/track` necesitan la
 * misma `TrazaPreparada`; centralizarlo aquí evita que cada consumidor
 * reimplemente su propia lectura+parseo del fichero.
 *
 * Cachea el resultado en memoria de proceso: `prepararTraza` recorre ~7.121
 * vértices y no tiene sentido repetirlo en cada request (ver DT-003).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { prepararTraza } from "@/lib/traza/proyeccion";
import type { TrazaPreparada } from "@/lib/types";

const RUTA_TRAZA = join(process.cwd(), "lib", "traza", "traza.geojson");

let trazaCacheada: TrazaPreparada | null = null;

/** Devuelve la traza de cálculo preparada, cacheada tras la primera llamada. */
export function cargarTrazaDeCalculo(): TrazaPreparada {
  if (trazaCacheada) return trazaCacheada;

  const geojsonRaw = readFileSync(RUTA_TRAZA, "utf-8");
  const geojson = JSON.parse(geojsonRaw);

  trazaCacheada = prepararTraza(geojson);
  return trazaCacheada;
}
