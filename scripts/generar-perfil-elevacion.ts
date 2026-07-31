/**
 * Genera el perfil de elevación de la ruta a partir de la traza de pintado.
 *
 * Fuente:
 *   lib/traza/traza-mapa.geojson — traza de PINTADO (nunca traza.geojson,
 *   que es solo para cálculo server-side, ver AGENTS.md).
 *
 * Salida:
 *   lib/traza/perfil-elevacion.json — array de {km, m} remuestreado cada
 *   ~1 km sobre la distancia acumulada, con elevación real consultada a
 *   Open-Elevation (API pública, sin clave, un único POST de lote).
 *
 * Ejecutar con: pnpm generar-perfil-elevacion
 *
 * El resultado se commitea al repositorio — la web pública nunca llama a
 * Open-Elevation. Ver docs/tecnico/decisiones-tecnicas.md DT-009.
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const INTERVALO_KM = 1;
const OPEN_ELEVATION_URL = "https://api.open-elevation.com/api/v1/lookup";

// ---------------------------------------------------------------------------
// Haversine (misma fórmula que lib/traza/proyeccion.ts y scripts/simplificar-traza.ts)
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// Leer traza-mapa.geojson y calcular km acumulados por vértice
// ---------------------------------------------------------------------------

interface PuntoRemuestreado {
  km: number;
  lat: number;
  lon: number;
}

function leerTrazaMapa(): [number, number][] {
  const path = join(ROOT, "lib", "traza", "traza-mapa.geojson");
  const geojson = JSON.parse(readFileSync(path, "utf-8")) as {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: { type: string; coordinates: [number, number][] };
    }>;
  };

  const linea = geojson.features.find((f) => f.geometry.type === "LineString");
  if (!linea) {
    throw new Error(
      "lib/traza/traza-mapa.geojson no contiene ninguna Feature de tipo LineString"
    );
  }

  return linea.geometry.coordinates;
}

/**
 * Remuestrea la traza a intervalos regulares de distancia acumulada,
 * interpolando linealmente entre los dos vértices que rodean cada km.
 */
function remuestrear(
  coords: [number, number][],
  intervaloKm: number
): PuntoRemuestreado[] {
  const kmAcumulados: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const [aLon, aLat] = coords[i - 1];
    const [bLon, bLat] = coords[i];
    kmAcumulados.push(kmAcumulados[i - 1] + haversineKm(aLat, aLon, bLat, bLon));
  }

  const longitudTotalKm = kmAcumulados[kmAcumulados.length - 1];
  const puntos: PuntoRemuestreado[] = [];

  let idxSegmento = 0;
  for (let km = 0; km <= longitudTotalKm; km += intervaloKm) {
    while (
      idxSegmento < kmAcumulados.length - 2 &&
      kmAcumulados[idxSegmento + 1] < km
    ) {
      idxSegmento++;
    }

    const kmInicioSeg = kmAcumulados[idxSegmento];
    const kmFinSeg = kmAcumulados[idxSegmento + 1];
    const [lonA, latA] = coords[idxSegmento];
    const [lonB, latB] = coords[idxSegmento + 1];

    const t =
      kmFinSeg > kmInicioSeg ? (km - kmInicioSeg) / (kmFinSeg - kmInicioSeg) : 0;
    const tClamp = Math.min(1, Math.max(0, t));

    puntos.push({
      km: Math.round(km * 1000) / 1000,
      lat: latA + (latB - latA) * tClamp,
      lon: lonA + (lonB - lonA) * tClamp,
    });
  }

  // Asegurar que el último punto real de la traza queda incluido, aunque no
  // caiga exacto en un múltiplo del intervalo.
  const ultimoKm = puntos[puntos.length - 1]?.km ?? -1;
  if (longitudTotalKm - ultimoKm > 0.01) {
    const [lonFin, latFin] = coords[coords.length - 1];
    puntos.push({
      km: Math.round(longitudTotalKm * 1000) / 1000,
      lat: latFin,
      lon: lonFin,
    });
  }

  return puntos;
}

// ---------------------------------------------------------------------------
// Consultar Open-Elevation en un único POST de lote
// ---------------------------------------------------------------------------

interface RespuestaOpenElevation {
  results: Array<{ latitude: number; longitude: number; elevation?: number }>;
}

async function consultarElevaciones(
  puntos: PuntoRemuestreado[]
): Promise<number[]> {
  const body = {
    locations: puntos.map((p) => ({ latitude: p.lat, longitude: p.lon })),
  };

  const res = await fetch(OPEN_ELEVATION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(
      `Open-Elevation respondió ${res.status} ${res.statusText}. ` +
        `No se genera el fichero de perfil (evitando escribir datos incompletos).`
    );
  }

  const data = (await res.json()) as RespuestaOpenElevation;

  if (!Array.isArray(data.results) || data.results.length !== puntos.length) {
    throw new Error(
      `Open-Elevation devolvió ${data.results?.length ?? 0} resultados, ` +
        `se esperaban ${puntos.length}. No se genera el fichero de perfil.`
    );
  }

  return data.results.map((r, i) => {
    if (typeof r.elevation !== "number" || Number.isNaN(r.elevation)) {
      throw new Error(
        `El punto ${i} (km ${puntos[i].km}, lat ${puntos[i].lat}, lon ${puntos[i].lon}) ` +
          `no trae elevación en la respuesta de Open-Elevation. ` +
          `No se genera el fichero de perfil — nunca se escribe un perfil incompleto.`
      );
    }
    return r.elevation;
  });
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const coords = leerTrazaMapa();
  console.log(`Traza de pintado: ${coords.length} puntos`);

  const remuestreado = remuestrear(coords, INTERVALO_KM);
  console.log(
    `Remuestreado a ~${INTERVALO_KM} km: ${remuestreado.length} puntos ` +
      `(0 km a ${remuestreado[remuestreado.length - 1].km} km)`
  );

  console.log("Consultando Open-Elevation (un único POST de lote)...");
  const elevaciones = await consultarElevaciones(remuestreado);
  console.log("Elevaciones recibidas para todos los puntos.");

  const perfil = remuestreado.map((p, i) => ({
    km: p.km,
    m: Math.round(elevaciones[i]),
  }));

  const salida = join(ROOT, "lib", "traza", "perfil-elevacion.json");
  writeFileSync(salida, JSON.stringify(perfil), "utf-8");

  const minM = Math.min(...perfil.map((p) => p.m));
  const maxM = Math.max(...perfil.map((p) => p.m));
  console.log(`\n=== Resultado ===`);
  console.log(
    `lib/traza/perfil-elevacion.json: ${perfil.length} puntos, ` +
      `elevación ${minM} m – ${maxM} m`
  );
}

main().catch((err) => {
  console.error("\nERROR generando el perfil de elevación:");
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
