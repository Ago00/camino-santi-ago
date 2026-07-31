/**
 * Carga la traza de PINTADO (lib/traza/traza-mapa.geojson) desde disco.
 *
 * Análogo a cargar-traza.ts (que carga la traza de CÁLCULO) pero para el
 * fichero simplificado que se envía al cliente para dibujar el mapa (ver
 * AGENTS.md — regla no negociable de las dos trazas). Solo servidor: los
 * Server Components la cargan aquí y la pasan como prop a
 * components/mapa/Mapa.tsx (client component), en vez de importarla
 * directamente en el bundle del cliente — evita depender de que el bundler
 * reconozca `.geojson` como módulo importable (Turbopack no lo hace de forma
 * nativa, a diferencia de `resolveJsonModule` de TypeScript).
 *
 * Cachea el resultado en memoria de proceso: no tiene sentido releer y
 * parsear ~42 KB en cada request.
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { Feature, LineString } from "geojson";

const RUTA_TRAZA_MAPA = join(process.cwd(), "lib", "traza", "traza-mapa.geojson");

let trazaMapaCacheada: [number, number][] | null = null;

/** Devuelve las coordenadas [lon, lat] de la traza de pintado, cacheadas tras la primera llamada. */
export function cargarTrazaDeMapa(): [number, number][] {
  if (trazaMapaCacheada) return trazaMapaCacheada;

  const geojsonRaw = readFileSync(RUTA_TRAZA_MAPA, "utf-8");
  const geojson = JSON.parse(geojsonRaw) as {
    type: "FeatureCollection";
    features: Feature<LineString>[];
  };

  const linea = geojson.features.find((f) => f.geometry.type === "LineString");
  if (!linea) {
    throw new Error("traza-mapa.geojson no contiene ninguna Feature de tipo LineString");
  }

  trazaMapaCacheada = linea.geometry.coordinates as [number, number][];
  return trazaMapaCacheada;
}
