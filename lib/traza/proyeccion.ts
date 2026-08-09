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
  VENTANA_PROYECCION_SEGMENTOS,
  VENTANA_PROYECCION_FALLBACK_MAX_M,
  VENTANA_PROYECCION_MAX_FALLBACKS,
} from "@/lib/traza/umbrales";

// ---------------------------------------------------------------------------
// Haversine (reutilizada de la POC — fórmula validada)
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Exportada para reutilización fuera de este módulo (DT-016,
 * lib/traza/progreso-libre.ts): distancia restante en línea recta del modo
 * libre. Única modificación permitida en proyeccion.ts para esa tarea — el
 * resto del módulo (dominio guiado) no se toca.
 */
export function haversineKm(
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

  // Con un solo punto el avance desde el ancla es 0: porcentaje = 0.
  // La fórmula da (kmPrimerPunto - kmPrimerPunto) / denominador = 0, que es correcto.
  let kmPrimerPunto = 0;
  let maxKmAvanzados = 0;
  let odometroKm = 0;
  let puntosDescartados = 0;
  let ultimaPosicionValida: Posicion | null = null;
  let ultimaSeparacionM = 0;

  // La última posición procesada con éxito (para calcular velocidad entre puntos).
  let prevProcesada: Posicion | null = null;

  // Ventana deslizante (DT-018): índice de traza del último punto proyectado
  // con éxito, usado como referencia para acotar la búsqueda del siguiente.
  // null en el primer punto del bucle (sin referencia previa: escaneo
  // completo directo, igual que hacía siempre el código anterior a DT-018).
  let indiceVentana: number | null = null;
  let esPrimeraProyeccion = true;

  // Tope de seguridad al fallback de escaneo completo (S1, endurecimiento
  // post-revisión de Seguridad de DT-018 — ver umbrales.ts): estado
  // mutable propio de ESTA llamada, nunca compartido entre invocaciones.
  const estadoFallback: EstadoFallbackVentana = { usados: 0, avisado: false };

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

    // Proyección sobre la traza — ventana deslizante alrededor del último
    // índice conocido, con reintento de escaneo completo si hace falta,
    // acotado por el tope de seguridad de estadoFallback (DT-018 + S1, ver
    // proyectarPunto más abajo).
    const proyeccion = proyectarPunto(
      traza,
      trazaTurf,
      pos.lat,
      pos.lon,
      indiceVentana,
      estadoFallback
    );
    indiceVentana = proyeccion.indice;

    if (esPrimeraProyeccion) {
      // Primer punto válido: ancla el origen del porcentaje (DT-005). La
      // barra no puede bajar de la posición donde arrancó el intento.
      kmPrimerPunto = proyeccion.kmProyectado;
      maxKmAvanzados = proyeccion.kmProyectado;
      esPrimeraProyeccion = false;
    } else if (proyeccion.kmProyectado > maxKmAvanzados) {
      // Barra monótona: solo avanzamos, nunca retrocedemos.
      maxKmAvanzados = proyeccion.kmProyectado;
    }

    prevProcesada = pos;
    ultimaPosicionValida = pos;
    ultimaSeparacionM = proyeccion.separacionM;
  }

  if (ultimaPosicionValida === null) {
    // Todos los puntos fueron rechazados por velocidad
    return {
      ...progresoEnCero(traza.longitudTotalKm),
      puntosDescartados,
    };
  }

  // Separación de la última posición válida: ya se calculó en el propio
  // bucle (última iteración que no hizo `continue`) — no hace falta una
  // segunda proyección completa aquí, sea cual sea el método (ventana o
  // escaneo completo) que la haya resuelto.
  const separacionM = ultimaSeparacionM;

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

// ---------------------------------------------------------------------------
// Proyección con ventana deslizante (DT-018)
// ---------------------------------------------------------------------------

interface ResultadoProyeccion {
  /** Distancia acumulada global (km) desde el inicio de la traza hasta el punto de snap. */
  kmProyectado: number;
  /** Distancia perpendicular del punto original a la traza, en metros. */
  separacionM: number;
  /** Índice global (en traza.coordenadas) del vértice que abre el segmento de snap — referencia para la ventana del siguiente punto. */
  indice: number;
}

/**
 * Estado mutable del tope de seguridad al fallback de escaneo completo
 * (S1, endurecimiento post-revisión de Seguridad de DT-018). Vive en el
 * scope de UNA llamada a calcularProgreso() — nunca a nivel de módulo, para
 * no filtrar el contador entre invocaciones distintas.
 */
interface EstadoFallbackVentana {
  /** Escaneos completos ya gastados en esta llamada. */
  usados: number;
  /** Evita repetir el mismo console.warn en cada punto tras alcanzar el tope. */
  avisado: boolean;
}

/**
 * Proyecta un punto sobre la traza, con ventana deslizante alrededor del
 * índice del último punto proyectado con éxito (DT-018,
 * docs/tecnico/decisiones-tecnicas.md — números medidos incluidos).
 *
 * Sin esta ventana, cada punto del histórico proyecta contra los ~7.951
 * vértices completos de la traza (@turf/nearest-point-on-line es O(m) por
 * llamada, sin importar dónde caiga el punto) — medido: 281 s con el
 * histórico de un día completo de reto (~7.200 puntos), muy por encima de
 * cualquier timeout de función serverless. Como el histórico se procesa en
 * orden cronológico y una persona caminando no teletransporta, el punto
 * siguiente casi siempre proyecta cerca de donde proyectó el anterior:
 * buscar primero en una ventana de ±VENTANA_PROYECCION_SEGMENTOS segmentos
 * (sobre un *slice* de traza.coordenadas, no la traza completa) reduce el
 * coste por punto en el caso normal de O(m) a O(ventana) — medido: 2,87 s
 * con el mismo histórico de un día completo.
 *
 * Si la mejor coincidencia dentro de la ventana queda a más de
 * VENTANA_PROYECCION_FALLBACK_MAX_M (por encima de DESVIO_MENOR_MAX_M, ver
 * umbrales.ts), la ventana no es de fiar — desvío mayor real que se sale
 * del corredor de ±417 m, o un hueco largo en el histórico que salta muchos
 * segmentos de golpe (varias horas sin señal) — y se reintenta con un
 * escaneo completo de la traza, exactamente el comportamiento de antes de
 * esta ventana, realineando el índice desde el resultado de ese escaneo.
 * Esto garantiza que la ventana nunca da un resultado distinto al escaneo
 * completo: solo más rápido en el caso normal, más lento (nunca incorrecto)
 * en el caso puntual del fallback. Validado numéricamente contra una
 * implementación de referencia sin ventana en proyeccion.ventana.test.ts.
 *
 * S1 (endurecimiento post-revisión de Seguridad, ver nota de cierre de
 * DT-018): el propio fallback cuesta lo mismo que el problema que la
 * ventana resuelve, y su umbral de disparo (300 m) es tres órdenes de
 * magnitud más estricto que el filtro de plausibilidad geográfica de
 * `/api/track` (100 km, DT-006) — alguien con el token filtrado podría
 * forzar un escaneo completo por punto con desvíos deliberados fuera de
 * ventana pero dentro de esos 100 km. `estadoFallback` acota a
 * VENTANA_PROYECCION_MAX_FALLBACKS el número de escaneos completos por
 * llamada; agotado el tope, los puntos siguientes usan el resultado de la
 * ventana tal cual (degradado, pero acotado en coste) en vez de seguir
 * pagando el escaneo completo. Validado con benchmark adversarial en
 * proyeccion.ventana.test.ts.
 *
 * @param indiceReferencia Índice de traza del último punto proyectado, o
 *   null para el primer punto del histórico (sin referencia: escaneo
 *   completo directo, no cuenta contra el tope — ocurre como máximo una vez
 *   por llamada).
 * @param estadoFallback Contador del tope de seguridad de ESTA llamada.
 */
function proyectarPunto(
  traza: TrazaPreparada,
  trazaTurf: Feature<LineString>,
  lat: number,
  lon: number,
  indiceReferencia: number | null,
  estadoFallback: EstadoFallbackVentana
): ResultadoProyeccion {
  if (indiceReferencia !== null) {
    const desde = Math.max(0, indiceReferencia - VENTANA_PROYECCION_SEGMENTOS);
    const hasta = Math.min(
      traza.coordenadas.length - 1,
      indiceReferencia + VENTANA_PROYECCION_SEGMENTOS
    );

    // hasta > desde: hace falta al menos 2 vértices para formar una
    // LineString válida. Con trazas minúsculas (fixtures de test) la
    // ventana cubre siempre la traza entera, así que el resultado coincide
    // con el escaneo completo por construcción.
    if (hasta > desde) {
      const sliceTurf = lineString(traza.coordenadas.slice(desde, hasta + 1));
      const snap = nearestPointOnLine(sliceTurf, point([lon, lat]), {
        units: "kilometers",
      });
      const separacionM = (snap.properties.dist ?? 0) * 1000;

      if (separacionM <= VENTANA_PROYECCION_FALLBACK_MAX_M) {
        return {
          kmProyectado: traza.kmAcumulados[desde] + (snap.properties.location ?? 0),
          separacionM,
          indice: desde + (snap.properties.index ?? 0),
        };
      }

      // La ventana no basta: haría falta un escaneo completo. Antes de
      // pagarlo, comprobar el tope de seguridad (S1) — sin él, este mismo
      // "fuera de la ventana" es el vector de DoS descrito arriba.
      if (estadoFallback.usados >= VENTANA_PROYECCION_MAX_FALLBACKS) {
        if (!estadoFallback.avisado) {
          estadoFallback.avisado = true;
          console.warn(
            `calcularProgreso: alcanzado el tope de seguridad de ${VENTANA_PROYECCION_MAX_FALLBACKS} ` +
              "escaneos completos de la traza en una misma llamada. Usando el resultado de la " +
              "ventana (posiblemente menos preciso) para los puntos restantes en vez de seguir " +
              "pagando el escaneo completo — posible desvío masivo genuino o histórico adversarial."
          );
        }
        // Degradación aceptada: se devuelve el resultado de la ventana tal
        // cual, aunque su separación supere el umbral de fiabilidad. Nunca
        // ocurre en uso normal del reto (ver umbrales.ts).
        return {
          kmProyectado: traza.kmAcumulados[desde] + (snap.properties.location ?? 0),
          separacionM,
          indice: desde + (snap.properties.index ?? 0),
        };
      }

      estadoFallback.usados++;
      // Cae al escaneo completo de abajo — mismo resultado que daría el
      // código sin ventana para este punto.
    }
  }

  const snap = nearestPointOnLine(trazaTurf, point([lon, lat]), {
    units: "kilometers",
  });
  return {
    kmProyectado: snap.properties.location ?? 0,
    separacionM: (snap.properties.dist ?? 0) * 1000,
    indice: snap.properties.index ?? 0,
  };
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
