/**
 * Genera los dos ficheros de traza a partir de la fuente original.
 *
 * Fuente: docs/traza-camino-portugues.geojson (6.911 puntos, CC BY-SA 4.0 Xunta)
 *
 * Salidas:
 *   lib/traza/traza.geojson      — traza de CÁLCULO: completa + tramo final manual
 *   lib/traza/traza-mapa.geojson — traza de PINTADO: Douglas-Peucker 3 m, solo cliente
 *
 * Ejecutar con: pnpm simplificar-traza
 *
 * Ver docs/tecnico/decisiones-tecnicas.md DT-001 y DT-002 para el razonamiento.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import simplify from "@turf/simplify";
import { lineString } from "@turf/helpers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Waypoints del tramo final manual (Quintana → Praza do Obradoiro)
// De docs/tecnico/decisiones-tecnicas.md DT-002
//
// El waypoint #1 ES el último punto de la traza oficial — no se duplica.
// ---------------------------------------------------------------------------

const WAYPOINTS_FINALES: [number, number][] = [
  // [lon, lat]
  [-8.543659, 42.880599], // #1 — Fin traza oficial (Praza da Quintana)  ← NO duplicar
  [-8.54385, 42.88095],   // #2 — Quintana, extremo norte
  [-8.5443, 42.88135],    // #3 — Praza da Inmaculada (Azabachería)
  [-8.5449, 42.88105],    // #4 — Arco do Pazo de Xelmírez
  [-8.5448, 42.8806],     // #5 — Praza do Obradoiro (META)
];

// ---------------------------------------------------------------------------
// Haversine para calcular la longitud real tras extender la traza
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

function calcularLongitudKm(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [aLon, aLat] = coords[i - 1];
    const [bLon, bLat] = coords[i];
    total += haversineKm(aLat, aLon, bLat, bLon);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Leer la fuente
// ---------------------------------------------------------------------------

const fuentePath = join(ROOT, "docs", "traza-camino-portugues.geojson");
const fuente = JSON.parse(readFileSync(fuentePath, "utf-8")) as {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: string;
      coordinates: [number, number][] | [number, number];
    };
    properties: Record<string, unknown>;
  }>;
};

// Extraer la LineString principal
const lineFeature = fuente.features.find(
  (f) => f.geometry.type === "LineString"
);
if (!lineFeature) {
  throw new Error("No se encontró ninguna Feature de tipo LineString en la fuente");
}

const coordsOriginales = lineFeature.geometry.coordinates as [number, number][];
console.log(`Fuente: ${coordsOriginales.length} puntos`);

// ---------------------------------------------------------------------------
// Extender con los waypoints del tramo final
// El primero de los waypoints ES el último punto actual → no se duplica
// ---------------------------------------------------------------------------

const ultimoPuntoActual = coordsOriginales[coordsOriginales.length - 1];
const primerWaypoint = WAYPOINTS_FINALES[0];

const distanciaAlPrimero = haversineKm(
  ultimoPuntoActual[1],
  ultimoPuntoActual[0],
  primerWaypoint[1],
  primerWaypoint[0]
) * 1000; // en metros

if (distanciaAlPrimero > 5) {
  // Si el último punto de la traza y el primer waypoint difieren más de 5 m,
  // algo está mal en la fuente o en los waypoints — alertamos pero continuamos.
  console.warn(
    `AVISO: El primer waypoint del tramo final dista ${distanciaAlPrimero.toFixed(1)} m ` +
    `del último punto de la traza. Se esperaba coincidencia.`
  );
}

// Añadir los waypoints 2-5 (el #1 ya está en la traza)
const coordsExtendidas: [number, number][] = [
  ...coordsOriginales,
  ...WAYPOINTS_FINALES.slice(1),
];

const longitudTotalKm = calcularLongitudKm(coordsExtendidas);
console.log(
  `Traza extendida: ${coordsExtendidas.length} puntos, ${longitudTotalKm.toFixed(4)} km`
);

// ---------------------------------------------------------------------------
// Construir traza de CÁLCULO (traza.geojson)
// ---------------------------------------------------------------------------

const featureCalculoLine = {
  type: "Feature" as const,
  geometry: {
    type: "LineString" as const,
    coordinates: coordsExtendidas,
  },
  properties: {
    name: "Camino Portugués Central — punto km100 a Praza do Obradoiro",
    source: lineFeature.properties.source,
    length_km: Math.round(longitudTotalKm * 1000) / 1000,
    tramo_final_manual: true,
    nota_tramo_final:
      "Los últimos ~210 m (Praza da Quintana → Praza do Obradoiro) son " +
      "geometría dibujada a mano rodeando la catedral. Pendiente validar " +
      "sobre el terreno el día del reto. Ver DEBT.md.",
  },
};

// Conservar los Points del original pero actualizar el de Santiago
const pointsActualizados = fuente.features
  .filter((f) => f.geometry.type === "Point")
  .map((f) => {
    // Renombrar y mover el point "Santiago de Compostela" al Obradoiro
    if (
      typeof f.properties.name === "string" &&
      f.properties.name.toLowerCase().includes("santiago")
    ) {
      return {
        ...f,
        geometry: {
          type: "Point" as const,
          coordinates: [-8.5448, 42.8806] as [number, number],
        },
        properties: {
          ...f.properties,
          name: "Meta — Praza do Obradoiro",
        },
      };
    }
    return f;
  });

const trazaCalculo = {
  type: "FeatureCollection" as const,
  features: [featureCalculoLine, ...pointsActualizados],
};

// ---------------------------------------------------------------------------
// Construir traza de PINTADO (traza-mapa.geojson)
// Douglas-Peucker, tolerancia 3 m
// Coordenadas redondeadas a 6 decimales
// ---------------------------------------------------------------------------

// @turf/simplify trabaja en grados. 3 m ≈ 0.000027° a las latitudes de Galicia.
// La conversión exacta es: 3 m / (111_320 m/grado) ≈ 0.0000269°
const TOLERANCIA_GRADOS = 3 / 111_320;

const trazaParaSimplificar = lineString(coordsExtendidas);
// highQuality: false → radial distance pre-pass + Douglas-Peucker
// highQuality: true  → solo Douglas-Peucker (más puntos, más fiel)
// DT-001 midió ~1724 puntos con las mismas condiciones; la diferencia es la
// elección de highQuality. Usamos false para mantener el peso en ~37 KB.
const trazaSimplificada = simplify(trazaParaSimplificar, {
  tolerance: TOLERANCIA_GRADOS,
  highQuality: false,
  mutate: false,
});

// Redondear coordenadas a 6 decimales
const coordsSimplificadas = (
  trazaSimplificada.geometry.coordinates as [number, number][]
).map(([lon, lat]): [number, number] => [
  Math.round(lon * 1_000_000) / 1_000_000,
  Math.round(lat * 1_000_000) / 1_000_000,
]);

const longitudSimplificadaKm = calcularLongitudKm(coordsSimplificadas);

const featureMapaLine = {
  type: "Feature" as const,
  geometry: {
    type: "LineString" as const,
    coordinates: coordsSimplificadas,
  },
  properties: {
    name: "Camino Portugués Central — traza de pintado (simplificada)",
    source: lineFeature.properties.source,
    simplificacion: "Douglas-Peucker, tolerancia 3 m",
    advertencia:
      "Esta traza es SOLO para dibujar en el mapa. Su longitud NO es válida " +
      "para calcular progreso. El cálculo usa lib/traza/traza.geojson.",
    length_km_aprox: Math.round(longitudSimplificadaKm * 1000) / 1000,
  },
};

const trazaMapa = {
  type: "FeatureCollection" as const,
  features: [featureMapaLine],
};

// ---------------------------------------------------------------------------
// Escribir los ficheros
// ---------------------------------------------------------------------------

const libTrazaDir = join(ROOT, "lib", "traza");
mkdirSync(libTrazaDir, { recursive: true });

const salidaCalculo = join(libTrazaDir, "traza.geojson");
const salidaMapa = join(libTrazaDir, "traza-mapa.geojson");

// traza.geojson (cálculo): pretty-printed para legibilidad y diff en git
writeFileSync(salidaCalculo, JSON.stringify(trazaCalculo, null, 2), "utf-8");
// traza-mapa.geojson (pintado): compacto para minimizar los KB que se envían al cliente
writeFileSync(salidaMapa, JSON.stringify(trazaMapa), "utf-8");

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

const sizeCalculo = readFileSync(salidaCalculo).length;
const sizeMapa = readFileSync(salidaMapa).length;

console.log("\n=== Resultado ===");
console.log(
  `traza.geojson (cálculo): ${coordsExtendidas.length} puntos, ` +
  `${longitudTotalKm.toFixed(4)} km, ${(sizeCalculo / 1024).toFixed(1)} KB`
);
console.log(
  `traza-mapa.geojson (pintado): ${coordsSimplificadas.length} puntos, ` +
  `${longitudSimplificadaKm.toFixed(4)} km (~${(sizeMapa / 1024).toFixed(1)} KB)`
);
console.log(
  `\nPérdida por simplificación: ${((longitudTotalKm - longitudSimplificadaKm) * 1000).toFixed(0)} m ` +
  `(solo afecta a la traza de pintado, no al cálculo)`
);
