/**
 * Tests de la ventana deslizante de calcularProgreso() (DT-018,
 * docs/tecnico/decisiones-tecnicas.md). Archivo separado de
 * proyeccion.test.ts a propósito: ese fichero no se toca en esta tarea (sus
 * tests deben seguir en verde sin modificarlos, prueba de que el contrato
 * externo de calcularProgreso no cambió).
 *
 * Estos tests comparan calcularProgreso() (con ventana) contra
 * calcularProgresoSinVentana() — una réplica fiel del algoritmo tal y como
 * era ANTES de DT-018 (proyecta cada punto contra la traza completa, sin
 * ventana ni fallback) — para demostrar numéricamente que la ventana nunca
 * cambia el resultado, solo la velocidad. Es el mismo método con el que se
 * validó la decisión (ver la tabla de DT-018).
 *
 * Usan traza.geojson real (7.951 vértices, 110,43 km) y no la traza
 * sintética de 3-5 puntos de proyeccion.test.ts: con una traza tan pequeña
 * la ventana (±30 segmentos) cubre siempre la traza entera, así que no
 * ejercitaría nunca el caso real que esta ventana existe para resolver.
 *
 * Varios de estos tests son deliberadamente lentos (calcularProgresoSinVentana
 * es O(n×m) a propósito, para poder comparar contra el comportamiento
 * anterior, o para medir el coste real del vector adversarial de la última
 * sección) — llevan su propio timeout generoso.
 *
 * Última sección (S1, endurecimiento post-revisión de Seguridad de DT-018,
 * ver nota de cierre en docs/tecnico/decisiones-tecnicas.md): benchmark
 * adversarial del tope de seguridad al fallback de escaneo completo —
 * confirma con medición real que el vector de denegación de servicio
 * descrito por Seguridad (puntos deliberadamente a más de
 * VENTANA_PROYECCION_FALLBACK_MAX_M entre sí, dentro del radio de
 * SEPARACION_TRAZA_MAX_KM de DT-006) queda acotado en coste.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import { lineString, point } from "@turf/helpers";
import { calcularProgreso, prepararTraza, haversineKm } from "./proyeccion";
import {
  EN_RUTA_MAX_M,
  DESVIO_MENOR_MAX_M,
  VELOCIDAD_MAX_KMH,
  PRECISION_MAX_M,
  VENTANA_PROYECCION_MAX_FALLBACKS,
} from "./umbrales";
import type { Posicion, Progreso, TrazaPreparada } from "@/lib/types";

// ---------------------------------------------------------------------------
// Traza real (DT-015: 7.951 vértices, 110,43 km) — cargada una vez.
// ---------------------------------------------------------------------------

const TRAZA_REAL: TrazaPreparada = prepararTraza(
  JSON.parse(
    readFileSync(join(__dirname, "traza.geojson"), "utf-8")
  ) as Parameters<typeof prepararTraza>[0]
);

// ---------------------------------------------------------------------------
// Implementación de referencia: calcularProgreso() sin ventana (DT-018).
//
// Réplica deliberada del algoritmo anterior a esta tarea — cada punto
// proyecta contra @turf/nearest-point-on-line con la traza COMPLETA, sin
// ventana ni índice de referencia. Sirve solo para verificar por
// comparación numérica, nunca se usa en producción.
// ---------------------------------------------------------------------------

function calcularProgresoSinVentana(
  historico: Posicion[],
  traza: TrazaPreparada
): Progreso {
  const validas = historico.filter((p) => !p.descartado);

  if (validas.length === 0) {
    return progresoEnCeroReferencia(traza.longitudTotalKm);
  }

  const trazaTurf = lineString(traza.coordenadas);

  const kmPrimerPunto = (() => {
    const snap = nearestPointOnLine(
      trazaTurf,
      point([validas[0].lon, validas[0].lat]),
      { units: "kilometers" }
    );
    return snap.properties.location ?? 0;
  })();

  let maxKmAvanzados = kmPrimerPunto;
  let odometroKm = 0;
  let puntosDescartados = 0;
  let ultimaPosicionValida: Posicion | null = null;
  let prevProcesada: Posicion | null = null;

  for (const pos of validas) {
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

      if (horasDelta <= 0) {
        puntosDescartados++;
        continue;
      }

      const velocidadKmh = distKm / horasDelta;
      if (velocidadKmh > VELOCIDAD_MAX_KMH) {
        puntosDescartados++;
        continue;
      }

      const accEsBuena = pos.acc === null || pos.acc <= PRECISION_MAX_M;
      if (accEsBuena) {
        odometroKm += distKm;
      }
    }

    const snap = nearestPointOnLine(trazaTurf, point([pos.lon, pos.lat]), {
      units: "kilometers",
    });
    const kmProyectado = snap.properties.location ?? 0;

    if (kmProyectado > maxKmAvanzados) {
      maxKmAvanzados = kmProyectado;
    }

    prevProcesada = pos;
    ultimaPosicionValida = pos;
  }

  if (ultimaPosicionValida === null) {
    return { ...progresoEnCeroReferencia(traza.longitudTotalKm), puntosDescartados };
  }

  const snapFinal = nearestPointOnLine(
    trazaTurf,
    point([ultimaPosicionValida.lon, ultimaPosicionValida.lat]),
    { units: "kilometers" }
  );
  const separacionM = (snapFinal.properties.dist ?? 0) * 1000;

  const denominador = Math.max(0, traza.longitudTotalKm - kmPrimerPunto);
  const numerador = Math.max(0, maxKmAvanzados - kmPrimerPunto);
  const porcentaje =
    denominador > 0 ? Math.min(100, (numerador / denominador) * 100) : 100;

  const kmRestantes = Math.max(0, traza.longitudTotalKm - maxKmAvanzados);

  const estado: Progreso["estado"] =
    separacionM <= EN_RUTA_MAX_M
      ? "en-ruta"
      : separacionM <= DESVIO_MENOR_MAX_M
        ? "desvio-menor"
        : "desvio-mayor";

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

function progresoEnCeroReferencia(longitudTotalKm: number): Progreso {
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function posicion(
  overrides: Partial<Posicion> & { lat: number; lon: number; ts: string }
): Posicion {
  return {
    id: 1,
    intento_id: 1,
    batt: null,
    acc: null,
    fuente: "app",
    descartado: false,
    created_at: overrides.ts,
    ...overrides,
  };
}

/** Interpola lat/lon en la traza real para una distancia acumulada (km) dada. */
function puntoEnTraza(traza: TrazaPreparada, km: number): { lat: number; lon: number } {
  const kmClamped = Math.max(0, Math.min(km, traza.longitudTotalKm));
  let i = 1;
  while (i < traza.kmAcumulados.length - 1 && traza.kmAcumulados[i] < kmClamped) i++;
  const kmInicio = traza.kmAcumulados[i - 1];
  const kmFin = traza.kmAcumulados[i];
  const t = kmFin > kmInicio ? (kmClamped - kmInicio) / (kmFin - kmInicio) : 0;
  const [lonA, latA] = traza.coordenadas[i - 1];
  const [lonB, latB] = traza.coordenadas[i];
  return { lat: latA + (latB - latA) * t, lon: lonA + (lonB - lonA) * t };
}

/**
 * Histórico sintético a ritmo humano constante marchando sobre la traza
 * real — mismo enfoque de generación con el que se validó DT-018 (4,5 km/h,
 * cadencia de 15 s, por debajo de VELOCIDAD_MAX_KMH para que ningún punto
 * se descarte y el benchmark mida el camino real de calcularProgreso, no el
 * atajo barato del rechazo por velocidad).
 *
 * El paso (km por punto) es FIJO, independiente de `n`: a diferencia de
 * repartir `n` puntos a lo largo de toda la traza (que haría el ritmo más
 * rápido cuanto menor sea `n`, pudiendo superar VELOCIDAD_MAX_KMH sin
 * querer), aquí cada punto avanza siempre la misma distancia real. Si `n`
 * es lo bastante grande para llegar al final de la traza (7.200 puntos ×
 * 4,5 km/h ≈ 135 km > 110,43 km), los puntos sobrantes se quedan en el
 * último vértice (Santi ya habría llegado al Obradoiro) — resultado válido,
 * no un error de generación.
 *
 * El cursor de búsqueda en kmAcumulados avanza monótonamente (nunca
 * retrocede), así que generar el histórico es O(n + m), no O(n × m): el
 * coste caro es el de calcularProgresoSinVentana en sí, no la generación de
 * fixtures.
 */
function generarHistoricoRealista(
  traza: TrazaPreparada,
  n: number,
  opciones: { pasoSegundos?: number; velocidadKmh?: number } = {}
): Posicion[] {
  const pasoSegundos = opciones.pasoSegundos ?? 15;
  const velocidadKmh = opciones.velocidadKmh ?? 4.5;
  const inicio = new Date("2026-08-09T06:00:00.000Z").getTime();
  const pasoKm = (velocidadKmh * pasoSegundos) / 3600;
  const historico: Posicion[] = [];
  let i = 1;

  for (let k = 0; k < n; k++) {
    const kmObjetivo = Math.min(k * pasoKm, traza.longitudTotalKm);
    while (i < traza.kmAcumulados.length - 1 && traza.kmAcumulados[i] < kmObjetivo) i++;
    const kmInicio = traza.kmAcumulados[i - 1];
    const kmFin = traza.kmAcumulados[i];
    const t = kmFin > kmInicio ? (kmObjetivo - kmInicio) / (kmFin - kmInicio) : 0;
    const [lonA, latA] = traza.coordenadas[i - 1];
    const [lonB, latB] = traza.coordenadas[i];

    historico.push(
      posicion({
        id: k + 1,
        lat: latA + (latB - latA) * t,
        lon: lonA + (lonB - lonA) * t,
        ts: new Date(inicio + k * pasoSegundos * 1000).toISOString(),
      })
    );
  }

  return historico;
}

// ---------------------------------------------------------------------------
// 1. Equivalencia numérica a escala de "varios miles de puntos" (DT-018 mide
//    exactamente este escenario a 2000 puntos: 53,2-53,9 s sin ventana vs.
//    0,71 s con ventana, 0,0000 km de diferencia). Aquí se usan 1000 —
//    "varios miles" de segmentos de traza recorridos igualmente, suficiente
//    para cruzar la ventana cientos de veces— porque calcularProgresoSinVentana
//    es deliberadamente O(n×m): a 2000 puntos, el bloqueo síncrono de varias
//    decenas de segundos puede hacer que el propio runner de Vitest reporte
//    un timeout de comunicación interna (falso positivo de infraestructura,
//    no del test). El test de rendimiento de más abajo sí cubre la escala
//    completa de 7.200 puntos, pero solo con el algoritmo con ventana
//    (rápido) — nunca con la referencia O(n×m).
// ---------------------------------------------------------------------------

describe("calcularProgreso — ventana deslizante da el mismo resultado que sin ventana a escala de miles de puntos (DT-018)", () => {
  it(
    "1000 puntos a ritmo constante (4,5 km/h): porcentaje, kmAvanzados, odómetro, separación y estado idénticos con y sin ventana",
    () => {
      const historico = generarHistoricoRealista(TRAZA_REAL, 1000);

      const conVentana = calcularProgreso(historico, TRAZA_REAL);
      const sinVentana = calcularProgresoSinVentana(historico, TRAZA_REAL);

      expect(conVentana.puntosDescartados).toBe(0); // ritmo por debajo de VELOCIDAD_MAX_KMH: nada se descarta
      expect(conVentana.puntosDescartados).toBe(sinVentana.puntosDescartados);
      expect(Math.abs(conVentana.kmAvanzados - sinVentana.kmAvanzados)).toBeLessThan(0.001);
      expect(Math.abs(conVentana.odometroKm - sinVentana.odometroKm)).toBeLessThan(0.001);
      expect(Math.abs(conVentana.porcentaje - sinVentana.porcentaje)).toBeLessThan(0.001);
      expect(Math.abs(conVentana.separacionM - sinVentana.separacionM)).toBeLessThan(1);
      expect(conVentana.estado).toBe(sinVentana.estado);
      expect(conVentana.ultimaPosicion?.id).toBe(sinVentana.ultimaPosicion?.id);
    },
    // calcularProgresoSinVentana es O(n×m) a propósito (réplica del algoritmo
    // sin ventana): a 1000 puntos tarda varios segundos. El propio tiempo de
    // este test es la prueba viva de por qué existe la ventana — no reducir
    // más el tamaño de la muestra para que "pase rápido".
    60_000
  );
});

// ---------------------------------------------------------------------------
// 2. Desvío que se sale de la ventana (~3 km) y reenganche posterior
//    (mismo escenario que DT-018: marcha normal → desvío → reenganche).
// ---------------------------------------------------------------------------

describe("calcularProgreso — desvío que se sale de la ventana (~3 km) y reenganche (DT-018)", () => {
  function construirHistoricoConDesvio(): Posicion[] {
    const KM_FASE_A = 12; // marcha normal hasta el km 12
    const PASOS_FASE_A = 300;
    const KM_LATERAL_TOTAL = 3; // desvío lateral ~3 km, muy por encima de la ventana (±≈417 m)
    const PASOS_FASE_B = 90;
    const KM_FASE_C = 6; // 6 km más de marcha normal tras el reenganche
    const PASOS_FASE_C = 149;

    const inicio = new Date("2026-08-09T06:00:00.000Z").getTime();
    let tCursor = inicio;
    let idCounter = 1;
    const historico: Posicion[] = [];

    function agregar(lat: number, lon: number, deltaSegundos: number): void {
      tCursor += deltaSegundos * 1000;
      historico.push(posicion({ id: idCounter++, lat, lon, ts: new Date(tCursor).toISOString() }));
    }

    // Fase A: marcha normal en la traza, km 0 → 12 (300 puntos, ritmo seguro < VELOCIDAD_MAX_KMH).
    for (let k = 0; k < PASOS_FASE_A; k++) {
      const km = (KM_FASE_A * k) / (PASOS_FASE_A - 1);
      const { lat, lon } = puntoEnTraza(TRAZA_REAL, km);
      agregar(lat, lon, k === 0 ? 0 : 15);
    }

    // Fase B: se aleja de la traza en línea recta hacia el este, ~33 m por
    // paso (≈8 km/h, por debajo de VELOCIDAD_MAX_KMH: no se descarta por
    // velocidad — el punto debe llegar a proyectarse para ejercitar el
    // fallback de la ventana).
    const ultimaFaseA = historico[historico.length - 1];
    const lat = ultimaFaseA.lat;
    let lon = ultimaFaseA.lon;
    const deltaLonPorPaso =
      (KM_LATERAL_TOTAL / PASOS_FASE_B) / (111.32 * Math.cos((lat * Math.PI) / 180));
    for (let j = 0; j < PASOS_FASE_B; j++) {
      lon += deltaLonPorPaso;
      agregar(lat, lon, 15);
    }

    // Reenganche: vuelve a la traza más adelante (km 15). Hueco de 1 h para
    // que la vuelta no viole VELOCIDAD_MAX_KMH sea cual sea la distancia real
    // recorrida (mismo criterio que un tramo sin señal GPS mientras se
    // regresa al camino).
    const kmReenganche = KM_FASE_A + KM_LATERAL_TOTAL;
    const puntoReenganche = puntoEnTraza(TRAZA_REAL, kmReenganche);
    agregar(puntoReenganche.lat, puntoReenganche.lon, 60 * 60);

    // Fase C: marcha normal tras el reenganche, km 15 → 21.
    for (let k = 1; k <= PASOS_FASE_C; k++) {
      const km = kmReenganche + (KM_FASE_C * k) / PASOS_FASE_C;
      const { lat: latC, lon: lonC } = puntoEnTraza(TRAZA_REAL, km);
      agregar(latC, lonC, 15);
    }

    return historico;
  }

  it(
    "el resultado final (porcentaje, kmAvanzados, odómetro, estado) es idéntico con y sin ventana",
    () => {
      const historico = construirHistoricoConDesvio();

      const conVentana = calcularProgreso(historico, TRAZA_REAL);
      const sinVentana = calcularProgresoSinVentana(historico, TRAZA_REAL);

      expect(conVentana.puntosDescartados).toBe(0);
      expect(conVentana.puntosDescartados).toBe(sinVentana.puntosDescartados);
      expect(Math.abs(conVentana.kmAvanzados - sinVentana.kmAvanzados)).toBeLessThan(0.001);
      expect(Math.abs(conVentana.odometroKm - sinVentana.odometroKm)).toBeLessThan(0.001);
      expect(Math.abs(conVentana.porcentaje - sinVentana.porcentaje)).toBeLessThan(0.001);
      expect(Math.abs(conVentana.separacionM - sinVentana.separacionM)).toBeLessThan(1);
      expect(conVentana.estado).toBe(sinVentana.estado);
    },
    30_000 // calcularProgresoSinVentana sobre ~540 puntos: unos segundos.
  );

  it("clasifica el tramo desviado como desvio-mayor (misma clasificación con y sin ventana)", () => {
    const historicoCompleto = construirHistoricoConDesvio();
    // Fase A (300) + fase B (90) = 390: el último punto de esta porción cae
    // en pleno desvío lateral, a ~3 km de la traza.
    const historicoHastaDesvio = historicoCompleto.slice(0, 390);

    const conVentana = calcularProgreso(historicoHastaDesvio, TRAZA_REAL);

    expect(conVentana.estado).toBe("desvio-mayor");
    expect(conVentana.separacionM).toBeGreaterThan(2000);
  });

  it("el reenganche resuelve por ventana y el progreso sigue avanzando tras el desvío (no se queda atascado)", () => {
    const historicoCompleto = construirHistoricoConDesvio();
    const enPlenoDesvio = calcularProgreso(historicoCompleto.slice(0, 390), TRAZA_REAL);
    const trasReenganche = calcularProgreso(historicoCompleto, TRAZA_REAL);

    // Tras el reenganche, el avance sobre el plan (kmAvanzados) sigue
    // creciendo — el fallback de la ventana relocaliza correctamente, no
    // deja el índice "perdido" en el punto del desvío.
    expect(trasReenganche.kmAvanzados).toBeGreaterThan(enPlenoDesvio.kmAvanzados);
    // Y vuelve a estar en ruta una vez reenganchado y caminando de nuevo por el corredor.
    expect(trasReenganche.estado).toBe("en-ruta");
  });
});

// ---------------------------------------------------------------------------
// 3. Hueco largo en el histórico: dispara el fallback de escaneo completo
//    (el salto queda muy lejos del índice de referencia) sin dar un
//    resultado incorrecto.
// ---------------------------------------------------------------------------

describe("calcularProgreso — hueco largo en el histórico dispara el fallback sin dar un resultado incorrecto (DT-018)", () => {
  function construirHistoricoConHueco(): Posicion[] {
    const inicio = new Date("2026-08-09T06:00:00.000Z").getTime();
    let tCursor = inicio;
    let idCounter = 1;
    const historico: Posicion[] = [];

    function agregar(km: number, deltaSegundos: number): void {
      tCursor += deltaSegundos * 1000;
      const { lat, lon } = puntoEnTraza(TRAZA_REAL, km);
      historico.push(posicion({ id: idCounter++, lat, lon, ts: new Date(tCursor).toISOString() }));
    }

    // 100 puntos de marcha normal, km 0 → 5 (ritmo seguro, ~50 m/paso ≈ 12 km/h).
    for (let k = 0; k < 100; k++) {
      agregar((5 * k) / 99, k === 0 ? 0 : 15);
    }

    // Hueco de 3 h sin señal GPS: reaparece 10 km más adelante. 10 km en 3 h
    // ≈ 3,3 km/h — plausible, no se descarta por velocidad — pero muy por
    // encima de la ventana de ±30 segmentos (≈±417 m): dispara el fallback
    // de escaneo completo, que debe realinear el índice correctamente.
    agregar(15, 3 * 60 * 60);

    // 50 puntos más de marcha normal desde el punto de reaparición, km 15 → 17.
    for (let k = 1; k <= 50; k++) {
      agregar(15 + (2 * k) / 50, 15);
    }

    return historico;
  }

  it("ningún punto se descarta por velocidad (el hueco es plausible a pie) y el resultado coincide con el cálculo sin ventana", () => {
    const historico = construirHistoricoConHueco();

    const conVentana = calcularProgreso(historico, TRAZA_REAL);
    const sinVentana = calcularProgresoSinVentana(historico, TRAZA_REAL);

    expect(conVentana.puntosDescartados).toBe(0);
    expect(Math.abs(conVentana.kmAvanzados - sinVentana.kmAvanzados)).toBeLessThan(0.001);
    expect(Math.abs(conVentana.odometroKm - sinVentana.odometroKm)).toBeLessThan(0.001);
    expect(conVentana.estado).toBe(sinVentana.estado);
    // El histórico termina de nuevo en marcha normal sobre la traza.
    expect(conVentana.estado).toBe("en-ruta");
    // Avanzó más allá del punto anterior al hueco (km ~5): el salto de 10 km
    // se refleja en el progreso, no se pierde ni se ignora.
    expect(conVentana.kmAvanzados).toBeGreaterThan(10);
  }, 15_000);
});

// ---------------------------------------------------------------------------
// 4. Test de rendimiento: histórico de un día completo (~7.200 puntos) no
//    puede volver a tardar minutos (regresión directa de DT-018).
// ---------------------------------------------------------------------------

describe("calcularProgreso — rendimiento con un histórico de un día completo de reto (DT-018)", () => {
  it(
    "7200 puntos (≈30 h de reto a cadencia de 15 s) se calculan en unos pocos segundos, no minutos",
    () => {
      const historico = generarHistoricoRealista(TRAZA_REAL, 7200);

      const inicio = performance.now();
      const resultado = calcularProgreso(historico, TRAZA_REAL);
      const duracionMs = performance.now() - inicio;

      expect(resultado.puntosDescartados).toBe(0);
      expect(resultado.kmAvanzados).toBeGreaterThan(0);
      // Umbral generoso y no ajustado al milisegundo (DT-018 midió ~2,87 s):
      // el objetivo es atrapar una regresión al escaneo completo por punto
      // (~281 s medido), no perseguir un número exacto de rendimiento. Un
      // histórico de test pequeño nunca detectaría esta regresión — por
      // eso hace falta un test a esta escala.
      expect(duracionMs).toBeLessThan(15_000);
    },
    30_000
  );
});

// ---------------------------------------------------------------------------
// 5. Benchmark adversarial (S1, endurecimiento post-revisión de Seguridad
//    de DT-018): reproduce exactamente el vector descrito — puntos dentro
//    del radio de 100 km del filtro de plausibilidad geográfica de
//    /api/track (DT-006), pero cada uno a más de VENTANA_PROYECCION_FALLBACK_MAX_M
//    (300 m) del anterior a lo largo de la traza, con huecos de tiempo lo
//    bastante generosos para no disparar el rechazo por velocidad
//    (VELOCIDAD_MAX_KMH) — de forma que cada punto SÍ llega a intentar
//    proyectarse y, sin el tope de seguridad, forzaría un escaneo completo
//    de la traza por punto. Confirma con medición real (no solo diseño)
//    que el tiempo total queda acotado.
// ---------------------------------------------------------------------------

describe("calcularProgreso — tope de seguridad al fallback (S1): benchmark adversarial", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Histórico adversarial: `n` puntos a lo largo de la traza real,
   * espaciados ~600 m entre sí (por encima de la ventana, ±≈417 m, así que
   * cada punto necesitaría un escaneo completo sin el tope de seguridad),
   * cada uno con un hueco de tiempo generoso (10 min) para que la velocidad
   * implícita quede muy por debajo de VELOCIDAD_MAX_KMH pese al salto —
   * exactamente el patrón que alguien con el token de /api/track filtrado
   * podría enviar (dentro de los 100 km de DT-006, sin ser descartado por
   * velocidad, sin desconectarse nunca del corredor).
   */
  function construirHistoricoAdversarial(n: number): Posicion[] {
    const ESPACIADO_KM = 0.6;
    const inicio = new Date("2026-08-09T06:00:00.000Z").getTime();
    const historico: Posicion[] = [];

    for (let k = 0; k < n; k++) {
      const km = Math.min(k * ESPACIADO_KM, TRAZA_REAL.longitudTotalKm);
      const { lat, lon } = puntoEnTraza(TRAZA_REAL, km);
      historico.push(
        posicion({
          id: k + 1,
          lat,
          lon,
          ts: new Date(inicio + k * 10 * 60_000).toISOString(), // +10 min por punto
        })
      );
    }

    return historico;
  }

  it(
    "300 puntos adversariales (~8 min de envío a 40 req/min, el escenario exacto de la revisión de Seguridad) se calculan en segundos, no en los ~11,7 s que costarían sin tope",
    () => {
      const historico = construirHistoricoAdversarial(300);
      const avisoSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const inicio = performance.now();
      const resultado = calcularProgreso(historico, TRAZA_REAL);
      const duracionMs = performance.now() - inicio;

      // Los puntos llegan a proyectarse de verdad (no se descartan antes,
      // por velocidad) — si se descartaran, el vector ni siquiera llegaría
      // al fallback y este test no probaría nada real.
      expect(resultado.puntosDescartados).toBe(0);
      expect(Number.isFinite(resultado.kmAvanzados)).toBe(true);
      expect(Number.isFinite(resultado.porcentaje)).toBe(true);

      // El tope se alcanzó y se avisó por log (mismo patrón que
      // lib/supabase/paginacion.ts para su propio tope de seguridad).
      expect(avisoSpy).toHaveBeenCalledWith(
        expect.stringContaining(`tope de seguridad de ${VENTANA_PROYECCION_MAX_FALLBACKS}`)
      );
      // Se avisa una sola vez, no en cada punto restante tras agotar el tope.
      expect(avisoSpy).toHaveBeenCalledTimes(1);

      // Umbral generoso: con 50 escaneos completos a ~39 ms medidos en
      // DT-018 el peor caso ronda ~2 s; muy por debajo de los ~11,7 s que
      // costaría este mismo histórico sin el tope de seguridad (300
      // escaneos completos) y lejísimos de cualquier timeout serverless.
      expect(duracionMs).toBeLessThan(5_000);
    },
    15_000
  );

  it("sin el tope de seguridad, el mismo histórico adversarial tardaría muchos segundos (confirma que el vector era real)", () => {
    // No usa calcularProgreso (ya protegido) sino la réplica de referencia
    // sin ventana ni tope — el propio "peor caso" que S1 existe para evitar.
    // Se limita a 150 puntos (la mitad del escenario anterior) para no
    // alargar la suite más de lo necesario: con la misma proyección lineal
    // de coste (~39 ms/punto, DT-018) ya basta para demostrar que crece muy
    // por encima del umbral acotado de la versión protegida.
    const historico = construirHistoricoAdversarial(150);

    const inicio = performance.now();
    calcularProgresoSinVentana(historico, TRAZA_REAL);
    const duracionMs = performance.now() - inicio;

    // Muy por encima de los 5 s a los que queda acotada la versión con
    // tope (arriba) para el doble de puntos — la protección de S1 marca
    // una diferencia de orden de magnitud, no solo un margen estrecho.
    expect(duracionMs).toBeGreaterThan(2_000);
  }, 15_000);
});
