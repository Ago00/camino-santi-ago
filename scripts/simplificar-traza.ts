/**
 * Genera los dos ficheros de traza a partir de la fuente original.
 *
 * Fuentes:
 *   docs/traza-camino-portugues.geojson — traza recortada desde el KML (O Porriño→Quintana)
 *   docs/traza-source/doc.kml           — KML original completo de la Xunta (Tui→Quintana),
 *                                         CC BY-SA 4.0. Se usa solo para la extensión sur.
 *
 * Salidas:
 *   lib/traza/traza.geojson      — traza de CÁLCULO: extensión sur + traza base + tramo final manual
 *   lib/traza/traza-mapa.geojson — traza de PINTADO: Douglas-Peucker 3 m, solo cliente
 *
 * Ejecutar con: pnpm simplificar-traza
 *
 * Ver docs/tecnico/decisiones-tecnicas.md DT-001, DT-002 y DT-005 para el razonamiento.
 *
 * GEOMETRÍA DE LA EXTENSIÓN SUR (DT-005):
 * La traza base va sur→norte: inicio en [-8.617671, 42.169304] (dentro del bloque 4 del KML),
 * meta en Quintana. Para extender al sur usamos dos bloques del KML (ordenados norte→sur):
 *   Bloque 4 (e02t01 O_PORRIÑO-REDONDELA): [-8.606, 42.2045] → [-8.6216, 42.1627] (O Porriño centro)
 *     → índices 365..445 de este bloque van del inicio actual al centro (norte→sur)
 *   Bloque 2 (e01t03 TUI-O_PORRIÑO): [-8.6216, 42.1627] → [-8.6259, 42.1131]
 *     → índices 0..126 de este bloque van del centro hasta ~3,046 m al sur
 * Ambos se invierten para mantener la orientación sur→norte de la traza y se anteponen.
 * Todos los bloques del KML están almacenados norte→sur.
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
// Parámetros de la extensión sur (DT-005)
// ---------------------------------------------------------------------------

// Índice del punto de inicio actual en el bloque 4 del KML.
// El bloque 4 (norte→sur) va de [-8.606, 42.2045] a [-8.6216, 42.1627].
// El inicio actual de la traza [-8.617671, 42.169304] cae en el índice 365
// (distancia 3,15 m — diferencia de precisión entre el recorte original y el KML).
const KML_BLOQUE4_IDX = 4;
const KML_BLOQUE4_INICIO_IDX = 365; // índice del punto ≈ inicio actual de la traza

// Bloque 2: va del centro de O Porriño [-8.6216, 42.1627] hacia el sur.
// Usamos los índices 0..126, que cubren ~3.046 m al sur del centro.
const KML_BLOQUE2_IDX = 2;
const KML_BLOQUE2_FIN_IDX = 126; // inclusive — punto a ~3.046 m del centro

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
// Parsear bloques de coordenadas del KML
// Todos los bloques están almacenados norte→sur.
// ---------------------------------------------------------------------------

function parsearBloquesKML(kmlPath: string): [number, number][][] {
  const content = readFileSync(kmlPath, "utf-8");
  const regex = /<coordinates>([\s\S]*?)<\/coordinates>/g;
  const blocks: [number, number][][] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const lines = match[1]
      .trim()
      .split(/\s+/)
      .filter((l) => l.includes(","));
    const coords = lines.map((l): [number, number] => {
      const parts = l.split(",");
      return [parseFloat(parts[0]), parseFloat(parts[1])];
    });
    blocks.push(coords);
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Leer la fuente base (traza recortada, sur→norte)
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

const lineFeature = fuente.features.find(
  (f) => f.geometry.type === "LineString"
);
if (!lineFeature) {
  throw new Error("No se encontró ninguna Feature de tipo LineString en la fuente");
}

const coordsBase = lineFeature.geometry.coordinates as [number, number][];
console.log(`Fuente base (traza recortada): ${coordsBase.length} puntos`);

// ---------------------------------------------------------------------------
// Leer el KML y construir la extensión sur (DT-005)
//
// Los bloques del KML van norte→sur. Para anteponer la extensión a la traza
// (que va sur→norte) hay que invertirlos.
//
// Construcción:
//   1. ext2Inv = bloque2[0..126] invertido → de ~3 km sur a O Porriño centro
//   2. ext4Inv = bloque4[365..445] invertido → de O Porriño centro a ≈ inicio actual
//   Se suprime el primer punto de ext4Inv (duplicaría el último de ext2Inv)
//   Se suprime el primer punto de coordsBase (≈ último de ext4Inv, a 3,15 m)
// ---------------------------------------------------------------------------

const kmlPath = join(ROOT, "docs", "traza-source", "doc.kml");
const bloques = parsearBloquesKML(kmlPath);

// Bloque 4: índices 365..fin (del inicio actual al centro de O Porriño, norte→sur)
const ext4NorteSur = bloques[KML_BLOQUE4_IDX].slice(KML_BLOQUE4_INICIO_IDX);
// Bloque 2: índices 0..126 (del centro de O Porriño a ~3 km al sur, norte→sur)
const ext2NorteSur = bloques[KML_BLOQUE2_IDX].slice(0, KML_BLOQUE2_FIN_IDX + 1);

// Invertir para que ambos vayan sur→norte
const ext2SurNorte = [...ext2NorteSur].reverse();
const ext4SurNorte = [...ext4NorteSur].reverse();

// Verificar empalme entre ext2 y ext4 (deben compartir O Porriño centro)
const finExt2 = ext2SurNorte[ext2SurNorte.length - 1];
const inicioExt4 = ext4SurNorte[0];
const distEmpalme12 =
  haversineKm(finExt2[1], finExt2[0], inicioExt4[1], inicioExt4[0]) * 1000;
if (distEmpalme12 > 1) {
  console.warn(
    `AVISO: Empalme ext2→ext4 tiene ${distEmpalme12.toFixed(1)} m de salto ` +
    `(se esperaba 0 — mismo punto O Porriño centro)`
  );
}

// Verificar empalme entre ext4 y traza base (deben estar muy cerca)
const finExt4 = ext4SurNorte[ext4SurNorte.length - 1];
const inicioBase = coordsBase[0];
const distEmpalme4base =
  haversineKm(finExt4[1], finExt4[0], inicioBase[1], inicioBase[0]) * 1000;
console.log(
  `Empalme extensión→traza base: ${distEmpalme4base.toFixed(1)} m ` +
  `(diferencia de precisión entre el KML y el recorte original)`
);

// Componer la traza extendida (sur→norte):
//   ext2 (sur→O Porriño centro)
//   + ext4.slice(1) (O Porriño centro→≈inicio base, sin duplicar el centro)
//   + coordsBase.slice(1) (traza original sin duplicar su primer punto ≈ último del ext4)
const coordsExtendidas: [number, number][] = [
  ...ext2SurNorte,
  ...ext4SurNorte.slice(1),   // evitar duplicar O Porriño centro
  ...coordsBase.slice(1),     // evitar duplicar el inicio de la traza base (≈ fin del ext4)
];

console.log(
  `Traza con extensión sur: ${coordsExtendidas.length} puntos ` +
  `(antes de añadir el tramo final manual)`
);

// ---------------------------------------------------------------------------
// Extender con los waypoints del tramo final (Quintana → Obradoiro)
// El primero de los waypoints ES el último punto actual → no se duplica.
// ---------------------------------------------------------------------------

const ultimoPuntoActual = coordsExtendidas[coordsExtendidas.length - 1];
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
const coordsConTramoFinal: [number, number][] = [
  ...coordsExtendidas,
  ...WAYPOINTS_FINALES.slice(1),
];

const longitudTotalKm = calcularLongitudKm(coordsConTramoFinal);
console.log(
  `Traza final: ${coordsConTramoFinal.length} puntos, ${longitudTotalKm.toFixed(4)} km`
);

// ---------------------------------------------------------------------------
// Guardia: verificar continuidad de la traza completa
// ---------------------------------------------------------------------------

let maxSaltoM = 0;
let maxSaltoIdx = -1;
for (let i = 1; i < coordsConTramoFinal.length; i++) {
  const [aLon, aLat] = coordsConTramoFinal[i - 1];
  const [bLon, bLat] = coordsConTramoFinal[i];
  const saltoM = haversineKm(aLat, aLon, bLat, bLon) * 1000;
  if (saltoM > maxSaltoM) {
    maxSaltoM = saltoM;
    maxSaltoIdx = i;
  }
}
if (maxSaltoM > 500) {
  // Un salto > 500 m entre vértices consecutivos es casi siempre un error de orientación
  console.warn(
    `AVISO: Salto máximo entre vértices: ${maxSaltoM.toFixed(1)} m en índice ${maxSaltoIdx}. ` +
    `Revisar orientación del empalme.`
  );
} else {
  console.log(`Continuidad OK — salto máximo: ${maxSaltoM.toFixed(1)} m (en índice ${maxSaltoIdx})`);
}

// ---------------------------------------------------------------------------
// Construir traza de CÁLCULO (traza.geojson)
// ---------------------------------------------------------------------------

// Nuevo inicio del corredor (punto más al sur)
const coordNuevoInicio = coordsConTramoFinal[0];

const featureCalculoLine = {
  type: "Feature" as const,
  geometry: {
    type: "LineString" as const,
    coordinates: coordsConTramoFinal,
  },
  properties: {
    name: "Camino Portugués Central — corredor del reto (sur de O Porriño → Praza do Obradoiro)",
    source: lineFeature.properties.source,
    length_km: Math.round(longitudTotalKm * 1000) / 1000,
    tramo_final_manual: true,
    nota_tramo_final:
      "Los últimos ~210 m (Praza da Quintana → Praza do Obradoiro) son " +
      "geometría dibujada a mano rodeando la catedral. Pendiente validar " +
      "sobre el terreno el día del reto. Ver DEBT.md.",
    nota_extension_sur:
      "DT-005: la traza es un corredor. Los primeros ~4,7 km (al sur de O Porriño) " +
      "proceden del KML original de la Xunta (docs/traza-source/doc.kml). " +
      "El recorrido real lo define el inicio del intento.",
  },
};

// Conservar los Points del original pero actualizar nombres y posiciones.
// Las comprobaciones usan el nombre completo para evitar falsos positivos:
// "Inicio (km 100 a Santiago)" contiene "santiago" pero NO es el punto de llegada.
const pointsActualizados = fuente.features
  .filter((f) => f.geometry.type === "Point")
  .map((f) => {
    if (typeof f.properties.name !== "string") return f;
    const nombre = f.properties.name.toLowerCase();

    // El punto de llegada: "Santiago de Compostela" (sin "inicio" ni "km")
    if (nombre === "santiago de compostela") {
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

    // El punto de inicio: "Inicio (km 100 a Santiago)"
    // Moverlo a la nueva posición sur del corredor.
    if (nombre.startsWith("inicio")) {
      return {
        ...f,
        geometry: {
          type: "Point" as const,
          coordinates: coordNuevoInicio as [number, number],
        },
        properties: {
          ...f.properties,
          name: "Inicio del corredor (~3 km al sur de O Porriño)",
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

const trazaParaSimplificar = lineString(coordsConTramoFinal);
// highQuality: false → radial distance pre-pass + Douglas-Peucker
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
  `traza.geojson (cálculo): ${coordsConTramoFinal.length} puntos, ` +
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
console.log(
  `Extensión sur (DT-005): ~${((longitudTotalKm - 100.210) * 1000).toFixed(0)} m adicionales ` +
  `al inicio de la traza`
);
