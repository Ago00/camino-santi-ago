/**
 * Dominio puro de progreso del reto.
 *
 * Sin I/O, sin lectura de ficheros, sin Date.now() implícito.
 * La traza entra como parámetro ya preparada con prepararTraza().
 *
 * Dos funciones públicas:
 *   prepararTraza(geojson) → TrazaPreparada  (ejecutar una vez, cachear)
 *   calcularProgreso(historico, traza) → Progreso  (en cada petición)
 *
 * ANCLAJE DEL PROGRESO (DT-005):
 * El porcentaje se mide desde la proyección del primer punto válido del
 * histórico hasta el final de la traza, no desde el origen de la traza.
 * Esto evita que la barra empiece en ~4,5% antes de dar un paso cuando
 * Santi arranca en el km 4,7 del corredor.
 *   porcentaje = (avanceActual − avancePrimerPunto) / (longitudTotal − avancePrimerPunto) × 100
 * Con histórico vacío o un solo punto el porcentaje es 0.
 *
 * Ver docs/tecnico/decisiones-tecnicas.md DT-003 y DT-005 para el razonamiento.
 */

import nearestPointOnLine from "@turf/nearest-point-on-line";
import { lineString, point } from "@turf/helpers";
import type { Feature, LineString } from "geojson";
import type { Posicion, Progreso, TrazaPreparada } from "@/lib/types";
import {
  EN_RUTA_MAX_M,
  DESVIO_MENOR_MAX_M,
  VELOCIDAD_MAX_KMH,
  PRECISION_MAX_M,
} from "@/lib/traza/umbrales";

// ---------------------------------------------------------------------------
// Haversine (reutilizada de la POC — fórmula validada)
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
// prepararTraza
// ---------------------------------------------------------------------------

/**
 * Precalcula los km acumulados por vértice de una traza GeoJSON LineString.
 * El resultado se pasa a calcularProgreso() y se debe cachear a nivel de
 * servidor para no repetir el cálculo en cada petición.
 *
 * @param geojson FeatureCollection o Feature<LineString> de la traza de cálculo.
 *   El primer feature de tipo LineString es el que se usa.
 */
export function prepararTraza(
  geojson: GeoJSONFeatureCollection | GeoJSONFeature
): TrazaPreparada {
  const linea = extraerLineString(geojson);

  const coordenadas = linea.geometry.coordinates as [number, number][];
  const kmAcumulados: number[] = [0];

  for (let i = 1; i < coordenadas.length; i++) {
    const [aLon, aLat] = coordenadas[i - 1];
    const [bLon, bLat] = coordenadas[i];
    const tramo = haversineKm(aLat, aLon, bLat, bLon);
    kmAcumulados.push(kmAcumulados[i - 1] + tramo);
  }

  return {
    coordenadas,
    kmAcumulados,
    longitudTotalKm: kmAcumulados[kmAcumulados.length - 1],
  };
}

// ---------------------------------------------------------------------------
// separacionDeTrazaM
// ---------------------------------------------------------------------------

/**
 * Distancia perpendicular en metros de un punto (lat/lon) a la traza.
 *
 * Reutilizada por el filtro de plausibilidad geográfica de `/api/track`
 * (DT-006): un punto a más de 100 km de la traza se rechaza en la ingesta,
 * antes de guardarse en BD. Comparte la misma proyección con Turf que usa
 * `calcularProgreso`, para no mantener dos implementaciones de "distancia a
 * la traza" que puedan divergir.
 */
export function separacionDeTrazaM(
  lat: number,
  lon: number,
  traza: TrazaPreparada
): number {
  const trazaTurf = buildTrazaTurf(traza);
  const snap = nearestPointOnLine(trazaTurf, point([lon, lat]), {
    units: "kilometers",
  });
  return (snap.properties.dist ?? 0) * 1000;
}

// ---------------------------------------------------------------------------
// calcularProgreso
// ---------------------------------------------------------------------------

/**
 * Calcula el progreso de Santi dado su historial de posiciones y la traza.
 *
 * Comportamiento clave:
 * - La barra (porcentaje) es monótona: nunca baja aunque Santi retroceda.
 * - El odómetro sí sube al retroceder (mide distancia real, no avance).
 * - Puntos con velocidad implícita > VELOCIDAD_MAX_KMH se descartan silenciosamente.
 * - Puntos con acc > PRECISION_MAX_M no suman al odómetro (pero sí a la barra).
 * - Posiciones con descartado=true se ignoran por completo.
 *
 * @param historico Lista de posiciones ordenadas por ts ascendente.
 * @param traza TrazaPreparada obtenida de prepararTraza().
 */
export function calcularProgreso(
  historico: Posicion[],
  traza: TrazaPreparada
): Progreso {
  const validas = historico.filter((p) => !p.descartado);

  if (validas.length === 0) {
    return progresoEnCero(traza.longitudTotalKm);
  }

  const trazaTurf = buildTrazaTurf(traza);

  // Primer punto válido: ancla el origen del porcentaje (DT-005).
  // La proyección del primer punto determina desde dónde se mide el 0%.
  const kmPrimerPunto = (() => {
    const snap = nearestPointOnLine(
      trazaTurf,
      point([validas[0].lon, validas[0].lat]),
      { units: "kilometers" }
    );
    return snap.properties.location ?? 0;
  })();

  // Con un solo punto el avance desde el ancla es 0: porcentaje = 0.
  // La fórmula da (kmPrimerPunto - kmPrimerPunto) / denominador = 0, que es correcto.

  // maxKmAvanzados arranca en el primer punto (la barra no puede bajar de su posición inicial).
  let maxKmAvanzados = kmPrimerPunto;
  let odometroKm = 0;
  let puntosDescartados = 0;
  let ultimaPosicionValida: Posicion | null = null;

  // La última posición procesada con éxito (para calcular velocidad entre puntos).
  let prevProcesada: Posicion | null = null;

  for (const pos of validas) {
    // Rechazo por velocidad implícita imposible
    if (prevProcesada !== null) {
      const distKm = haversineKm(
        prevProcesada.lat,
        prevProcesada.lon,
        pos.lat,
        pos.lon
      );
      const horasDelta =
        (new Date(pos.ts).getTime() - new Date(prevProcesada.ts).getTime()) /
        3_600_000;

      // Si el delta temporal es negativo o cero, saltamos el punto
      // (evita división por cero y puntos con ts inconsistente).
      if (horasDelta <= 0) {
        puntosDescartados++;
        continue;
      }

      const velocidadKmh = distKm / horasDelta;
      if (velocidadKmh > VELOCIDAD_MAX_KMH) {
        puntosDescartados++;
        continue;
      }

      // Odómetro: suma haversine real. Puntos imprecisos no cuentan.
      const accEsBuena =
        pos.acc === null || pos.acc <= PRECISION_MAX_M;
      if (accEsBuena) {
        odometroKm += distKm;
      }
    }

    // Proyección sobre la traza
    const snap = nearestPointOnLine(
      trazaTurf,
      point([pos.lon, pos.lat]),
      { units: "kilometers" }
    );

    // location es la distancia acumulada desde el inicio hasta el punto de snap
    const kmProyectado = snap.properties.location ?? 0;

    // Barra monótona: solo avanzamos, nunca retrocedemos
    if (kmProyectado > maxKmAvanzados) {
      maxKmAvanzados = kmProyectado;
    }

    prevProcesada = pos;
    ultimaPosicionValida = pos;
  }

  if (ultimaPosicionValida === null) {
    // Todos los puntos fueron rechazados por velocidad
    return {
      ...progresoEnCero(traza.longitudTotalKm),
      puntosDescartados,
    };
  }

  // Calcular separación de la última posición válida
  const snapFinal = nearestPointOnLine(
    trazaTurf,
    point([ultimaPosicionValida.lon, ultimaPosicionValida.lat]),
    { units: "kilometers" }
  );
  const separacionM = (snapFinal.properties.dist ?? 0) * 1000;

  // Porcentaje anclado al primer punto del intento (DT-005):
  //   porcentaje = (avanceActual − avancePrimerPunto) / (longitudTotal − avancePrimerPunto) × 100
  // Si el primer punto ya está al final (arranque tardío extremo), denominador → 0.
  // Usamos Math.max para evitar división por cero y clampeamos a [0, 100].
  const denominador = Math.max(0, traza.longitudTotalKm - kmPrimerPunto);
  const numerador = Math.max(0, maxKmAvanzados - kmPrimerPunto);
  const porcentaje = denominador > 0
    ? Math.min(100, (numerador / denominador) * 100)
    : 100; // si el ancla ya está en el final, el reto empieza en 100%

  // km restantes: solo el tramo de plan que queda desde el punto proyectado
  // más cercano hasta el final de la traza oficial. No suma el coste de
  // volver a la ruta si Santi está desviado (separacionM se usa solo para
  // clasificarEstado, no aquí).
  const planRestanteKm = Math.max(
    0,
    traza.longitudTotalKm - maxKmAvanzados
  );
  const kmRestantes = planRestanteKm;

  const estado = clasificarEstado(separacionM);

  return {
    porcentaje,
    kmAvanzados: maxKmAvanzados,
    kmRestantes,
    odometroKm,
    estado,
    separacionM,
    ultimaPosicion: ultimaPosicionValida,
    puntosDescartados,
  };
}

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

function progresoEnCero(longitudTotalKm: number): Progreso {
  return {
    porcentaje: 0,
    kmAvanzados: 0,
    kmRestantes: longitudTotalKm,
    odometroKm: 0,
    estado: "en-ruta",
    separacionM: 0,
    ultimaPosicion: null,
    puntosDescartados: 0,
  };
}

function clasificarEstado(
  separacionM: number
): Progreso["estado"] {
  if (separacionM <= EN_RUTA_MAX_M) return "en-ruta";
  if (separacionM <= DESVIO_MENOR_MAX_M) return "desvio-menor";
  return "desvio-mayor";
}

function buildTrazaTurf(
  traza: TrazaPreparada
): Feature<LineString> {
  return lineString(traza.coordenadas);
}

function extraerLineString(
  geojson: GeoJSONFeatureCollection | GeoJSONFeature
): Feature<LineString> {
  if (geojson.type === "FeatureCollection") {
    const fc = geojson as GeoJSONFeatureCollection;
    const feature = fc.features.find(
      (f) => f.type === "Feature" && f.geometry?.type === "LineString"
    );
    if (!feature) {
      throw new Error(
        "El GeoJSON no contiene ninguna Feature de tipo LineString"
      );
    }
    return feature as Feature<LineString>;
  }

  if (
    geojson.type === "Feature" &&
    (geojson as GeoJSONFeature).geometry?.type === "LineString"
  ) {
    return geojson as Feature<LineString>;
  }

  throw new Error("El GeoJSON debe ser una FeatureCollection o Feature<LineString>");
}

// ---------------------------------------------------------------------------
// Tipos GeoJSON mínimos (evita depender de @types/geojson para este módulo)
// ---------------------------------------------------------------------------

interface GeoJSONFeature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown> | null;
}

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}
