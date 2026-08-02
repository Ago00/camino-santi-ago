/**
 * Tests unitarios de proyeccion.ts.
 *
 * Fixtures sintéticas de 3-5 puntos con distancias conocidas.
 * El GeoJSON real de 7.121 vértices no se usa aquí: los tests deben ser
 * rápidos y sus fallos deben señalar la línea exacta del bug.
 *
 * Al final hay tests de integridad de la traza real (guardarraíl de DT-001/DT-002/DT-005).
 */

import { describe, it, expect } from "vitest";
import { prepararTraza, calcularProgreso } from "./proyeccion";
import type { Posicion } from "@/lib/types";
import { readFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Fixtures de traza sintética
//
// Línea recta de 3 puntos a lo largo del meridiano ~0°, en torno a lat 0°.
// Cada grado de latitud ≈ 111,32 km.
//
// Punto A: [0, 0]
// Punto B: [0, 0.45049]   → ≈ 50 km desde A
// Punto C: [0, 0.90099]   → ≈ 100 km desde A
//
// Aproximado con haversine real; los tests usan tolerancias razonables.
// ---------------------------------------------------------------------------

const TRAZA_100KM = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [0, 0],        // inicio (km 0)
          [0, 0.45049],  // mitad (~50 km)
          [0, 0.90099],  // fin (~100 km)
        ],
      },
      properties: { length_km: 100 },
    },
  ],
};

// Traza sintética de 5 puntos para probar el anclaje (DT-005).
// El intento puede arrancar en cualquier punto del corredor, no en el km 0.
//
// Punto A: [0, 0]         → km 0  (inicio del corredor)
// Punto B: [0, 0.22525]   → km 25 (1/4 de la traza)
// Punto C: [0, 0.45049]   → km 50 (mitad)
// Punto D: [0, 0.67574]   → km 75 (3/4)
// Punto E: [0, 0.90099]   → km 100 (fin)
const TRAZA_100KM_5P = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [0, 0],
          [0, 0.22525],
          [0, 0.45049],
          [0, 0.67574],
          [0, 0.90099],
        ],
      },
      properties: { length_km: 100 },
    },
  ],
};

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

const TRAZA = prepararTraza(TRAZA_100KM);
const TRAZA_5P = prepararTraza(TRAZA_100KM_5P);

// ---------------------------------------------------------------------------
// Tests de integridad de la traza real (guardarraíl DT-001/DT-002/DT-005)
// ---------------------------------------------------------------------------

describe("Integridad de la traza real", () => {
  it("traza.geojson mide entre 104,92 km y 105,02 km (DT-005: corredor extendido ~4,7 km al sur)", () => {
    const raw = readFileSync(
      join(__dirname, "traza.geojson"),
      "utf-8"
    );
    const geojson = JSON.parse(raw) as {
      type: string;
      features: Array<{
        type: string;
        geometry: { type: string; coordinates: unknown };
        properties: Record<string, unknown>;
      }>;
    };

    const trazaReal = prepararTraza(geojson as Parameters<typeof prepararTraza>[0]);

    // DT-005: traza extendida debe medir ≈ 104,97 km (±50 m = ±0,05 km)
    expect(trazaReal.longitudTotalKm).toBeGreaterThan(104.92);
    expect(trazaReal.longitudTotalKm).toBeLessThan(105.02);
  });

  it("el último punto de traza.geojson es la Praza do Obradoiro (≈ -8.5448, 42.8806)", () => {
    const raw = readFileSync(
      join(__dirname, "traza.geojson"),
      "utf-8"
    );
    const geojson = JSON.parse(raw) as {
      type: string;
      features: Array<{
        type: string;
        geometry: { type: string; coordinates: number[][] };
        properties: Record<string, unknown>;
      }>;
    };

    const lineFeature = geojson.features.find(
      (f) => f.geometry.type === "LineString"
    );
    expect(lineFeature).toBeDefined();

    const coords = lineFeature!.geometry.coordinates;
    const ultimo = coords[coords.length - 1];

    // Praza do Obradoiro: lon ≈ -8.5448, lat ≈ 42.8806 (tolerancia 10 m ≈ 0.0001°)
    expect(ultimo[0]).toBeCloseTo(-8.5448, 3);
    expect(ultimo[1]).toBeCloseTo(42.8806, 3);
  });

  it("traza.geojson no tiene saltos entre vértices consecutivos por encima de 300 m (guardarraíl de empalme)", () => {
    // Un salto > 300 m entre vértices consecutivos indica un error de orientación
    // en alguno de los empalmes (sur, tramo final, o segmento del KML).
    // El salto máximo conocido en la fuente (Xunta) es ~237 m en el km 74 aprox.
    const UMBRAL_M = 300;

    const raw = readFileSync(
      join(__dirname, "traza.geojson"),
      "utf-8"
    );
    const geojson = JSON.parse(raw) as {
      type: string;
      features: Array<{
        type: string;
        geometry: { type: string; coordinates: number[][] };
        properties: Record<string, unknown>;
      }>;
    };

    const lineFeature = geojson.features.find(
      (f) => f.geometry.type === "LineString"
    );
    expect(lineFeature).toBeDefined();

    const coords = lineFeature!.geometry.coordinates;

    function haversineM(
      aLat: number, aLon: number,
      bLat: number, bLon: number
    ): number {
      const R = 6_371_000;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(bLat - aLat);
      const dLon = toRad(bLon - aLon);
      const lat1 = toRad(aLat);
      const lat2 = toRad(bLat);
      const sinLat = Math.sin(dLat / 2);
      const sinLon = Math.sin(dLon / 2);
      const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
      return 2 * R * Math.asin(Math.sqrt(h));
    }

    let maxSaltoM = 0;
    let maxSaltoIdx = -1;
    for (let i = 1; i < coords.length; i++) {
      const d = haversineM(
        coords[i - 1][1], coords[i - 1][0],
        coords[i][1], coords[i][0]
      );
      if (d > maxSaltoM) { maxSaltoM = d; maxSaltoIdx = i; }
    }

    expect(
      maxSaltoM,
      `Salto de ${maxSaltoM.toFixed(1)} m en índice ${maxSaltoIdx} supera el umbral de ${UMBRAL_M} m`
    ).toBeLessThan(UMBRAL_M);
  });
});

// ---------------------------------------------------------------------------
// Tests con fixtures sintéticas — comportamiento base
// ---------------------------------------------------------------------------

describe("calcularProgreso — historico vacío", () => {
  it("devuelve progreso en cero sin reventar cuando no hay posiciones", () => {
    const result = calcularProgreso([], TRAZA);

    expect(result.porcentaje).toBe(0);
    expect(result.kmAvanzados).toBe(0);
    expect(result.odometroKm).toBe(0);
    expect(result.estado).toBe("en-ruta");
    expect(result.ultimaPosicion).toBeNull();
    expect(result.puntosDescartados).toBe(0);
    expect(result.kmRestantes).toBeCloseTo(TRAZA.longitudTotalKm, 1);
  });
});

describe("calcularProgreso — un solo punto", () => {
  it("porcentaje 0 con un solo punto en el inicio de la traza", () => {
    // Con un solo punto no hay avance medible desde el ancla: porcentaje = 0
    const historico = [
      posicion({ lat: 0, lon: 0, ts: "2026-07-30T08:00:00Z" }),
    ];

    const result = calcularProgreso(historico, TRAZA);

    expect(result.porcentaje).toBeCloseTo(0, 1);
    expect(result.odometroKm).toBe(0); // un solo punto: no hay tramo
    expect(result.ultimaPosicion).not.toBeNull();
    expect(result.puntosDescartados).toBe(0);
  });
});

describe("calcularProgreso — avance normal en ruta", () => {
  it("calcula porcentaje y odómetro al andar por el camino", () => {
    // Andamos desde el inicio hasta la mitad (~50 km a lat 0.45049)
    const historico = [
      posicion({ lat: 0, lon: 0, ts: "2026-07-30T08:00:00Z" }),
      posicion({ lat: 0.45049, lon: 0, ts: "2026-07-30T16:00:00Z" }), // 8h después
    ];

    const result = calcularProgreso(historico, TRAZA);

    // A mitad de camino el porcentaje debe rondar el 50%
    // El ancla es el km 0 (inicio de la traza), así que el porcentaje no cambia semánticamente
    expect(result.porcentaje).toBeGreaterThan(45);
    expect(result.porcentaje).toBeLessThan(55);

    // El odómetro debe reflejar los ~50 km andados
    expect(result.odometroKm).toBeGreaterThan(48);
    expect(result.odometroKm).toBeLessThan(52);

    expect(result.estado).toBe("en-ruta");
    expect(result.puntosDescartados).toBe(0);
  });
});

describe("calcularProgreso — retroceso sobre sus pasos", () => {
  it("la barra no baja al retroceder pero el odómetro sí sube", () => {
    // Llega a la mitad, luego vuelve atrás un poco
    const historico = [
      posicion({ lat: 0, lon: 0, ts: "2026-07-30T08:00:00Z" }),
      posicion({ lat: 0.45049, lon: 0, ts: "2026-07-30T16:00:00Z" }), // ~50 km
      posicion({ lat: 0.36, lon: 0, ts: "2026-07-30T18:00:00Z" }),     // retroceso
    ];

    const sin_retroceso = calcularProgreso(historico.slice(0, 2), TRAZA);
    const con_retroceso = calcularProgreso(historico, TRAZA);

    // La barra no baja
    expect(con_retroceso.porcentaje).toBeGreaterThanOrEqual(
      sin_retroceso.porcentaje
    );

    // El odómetro sí sube (se sumó el tramo de retroceso)
    expect(con_retroceso.odometroKm).toBeGreaterThan(sin_retroceso.odometroKm);
  });
});

describe("calcularProgreso — desvío pequeño (~80 m)", () => {
  it("clasifica como desvio-menor cuando la separación es ~80 m", () => {
    // 80 m en dirección este = ~0.00072° de lon en el ecuador
    const historico = [
      posicion({ lat: 0, lon: 0, ts: "2026-07-30T08:00:00Z" }),
      posicion({ lat: 0.22, lon: 0.00072, ts: "2026-07-30T12:00:00Z" }), // ~80 m lateral
    ];

    const result = calcularProgreso(historico, TRAZA);

    expect(result.estado).toBe("desvio-menor");
    // 0.00072° de lon en el ecuador ≈ 80 m (calculado: 80,06 m con haversine).
    // Se tolera ±15 m por la geometría interna de turf.
    expect(result.separacionM).toBeGreaterThan(70);
    expect(result.separacionM).toBeLessThan(100);
  });
});

describe("calcularProgreso — desvío grande (~2 km)", () => {
  it("clasifica como desvio-mayor y kmRestantes no suma la separación cuando la separación es ~2 km", () => {
    // ~2 km lateral = ~0.018° de lon en el ecuador
    const historico = [
      posicion({ lat: 0, lon: 0, ts: "2026-07-30T08:00:00Z" }),
      posicion({ lat: 0.22, lon: 0.018, ts: "2026-07-30T13:00:00Z" }), // ~2 km lateral
    ];

    const result = calcularProgreso(historico, TRAZA);

    expect(result.estado).toBe("desvio-mayor");
    // 0.018° de lon en el ecuador ≈ 2001 m (calculado con haversine).
    // Se tolera por debajo de 1.500 m para descartar falsos positivos de umbral.
    expect(result.separacionM).toBeGreaterThan(1500);

    // kmRestantes debe ser solo el plan restante desde el punto proyectado
    // más cercano hasta el final, SIN sumar separacionM/1000 (regresión a la
    // fórmula vieja "return-aware").
    //
    // Cálculo independiente (fuera de proyeccion.ts, con haversine a mano
    // sobre los mismos 3 vértices de TRAZA_100KM):
    // - La proyección perpendicular de (lat=0.22, lon=0.018) sobre el tramo
    //   recto en lon=0 cae aproximadamente en (lat≈0.22, lon≈0).
    // - Longitud total de la traza [0,0]→[0,0.45049]→[0,0.90099] ≈ 100,19 km.
    // - Distancia acumulada desde el inicio hasta lat=0.22 ≈ 24,46 km.
    // - planRestanteKm esperado ≈ 100,19 − 24,46 ≈ 75,72 km.
    // La fórmula vieja (separacionM/1000 + planRestanteKm) daría ≈ 77,72 km:
    // una diferencia de ~2 km, exactamente separacionM/1000. La tolerancia
    // (±1 km) es lo bastante ajustada para distinguir ambos resultados.
    expect(result.kmRestantes).toBeGreaterThan(74.7);
    expect(result.kmRestantes).toBeLessThan(76.7);
  });
});

describe("calcularProgreso — reenganche tras desvío grande", () => {
  it("el tramo de plan saltado cuenta como avanzado al reenganchar", () => {
    // Va a mitad, se desvía, reaparece más adelante en la traza.
    // La barra monótona hace que el tramo "saltado" en el desvío cuente.
    const historico = [
      posicion({ lat: 0, lon: 0, ts: "2026-07-30T08:00:00Z" }),
      posicion({ lat: 0.45049, lon: 0, ts: "2026-07-30T16:00:00Z" }), // ~50%
      posicion({ lat: 0.45049, lon: 0.02, ts: "2026-07-30T17:00:00Z" }), // desvío grande
      posicion({ lat: 0.7, lon: 0, ts: "2026-07-30T20:00:00Z" }), // reenganche más adelante
    ];

    const resultado_medio = calcularProgreso(historico.slice(0, 2), TRAZA);
    const resultado_final = calcularProgreso(historico, TRAZA);

    // Después del reenganche avanzó más
    expect(resultado_final.porcentaje).toBeGreaterThan(
      resultado_medio.porcentaje
    );
    // Y nunca bajó (la barra es monótona)
    expect(resultado_final.kmAvanzados).toBeGreaterThanOrEqual(
      resultado_medio.kmAvanzados
    );
  });
});

describe("calcularProgreso — salto GPS imposible descartado", () => {
  it("descarta un punto con velocidad implícita de 300 km/h", () => {
    const historico = [
      posicion({ lat: 0, lon: 0, ts: "2026-07-30T08:00:00Z" }),
      // 300 km/h = 50 km en 10 minutos → velocidad > VELOCIDAD_MAX_KMH (15)
      posicion({ lat: 0.45049, lon: 0, ts: "2026-07-30T08:10:00Z" }),
    ];

    const result = calcularProgreso(historico, TRAZA);

    // El segundo punto fue descartado por velocidad imposible.
    // La fixture tiene exactamente 2 posiciones: solo puede descartarse 1.
    expect(result.puntosDescartados).toBe(1);
    // El odómetro no debe incluir el salto imposible
    expect(result.odometroKm).toBe(0);
  });
});

describe("calcularProgreso — punto con descartado:true ignorado", () => {
  it("ignora posiciones con descartado=true como si no existieran", () => {
    const historico = [
      posicion({ lat: 0, lon: 0, ts: "2026-07-30T08:00:00Z" }),
      posicion({
        lat: 0.45049,
        lon: 0,
        ts: "2026-07-30T16:00:00Z",
        descartado: true, // este punto no debe participar
      }),
    ];

    const result = calcularProgreso(historico, TRAZA);

    // Solo existe el primer punto: odómetro 0, progreso mínimo
    expect(result.odometroKm).toBe(0);
    // La última posición válida es la primera (lat 0)
    expect(result.ultimaPosicion?.lat).toBeCloseTo(0, 5);
  });
});

describe("calcularProgreso — punto con acc mala no suma al odómetro", () => {
  it("un punto con acc > PRECISION_MAX_M no suma distancia al odómetro", () => {
    const historico = [
      posicion({ lat: 0, lon: 0, ts: "2026-07-30T08:00:00Z" }),
      posicion({
        lat: 0.22, // ~25 km
        lon: 0,
        ts: "2026-07-30T12:00:00Z",
        acc: 200, // peor que PRECISION_MAX_M (150), no suma al odómetro
      }),
    ];

    const result = calcularProgreso(historico, TRAZA);

    // El punto es válido (no descartado), sí proyecta en la barra.
    // lat=0.22 ≈ km 24,5 sobre traza de 100 km → porcentaje ≈ 24-25%.
    expect(result.porcentaje).toBeGreaterThan(20);
    expect(result.porcentaje).toBeLessThan(30);
    // Pero no suma al odómetro por mala precisión
    expect(result.odometroKm).toBe(0);
  });
});

describe("calcularProgreso — llegada al Obradoiro", () => {
  it("porcentaje 100 y km restantes ~0 al llegar al final de la traza", () => {
    // Llegamos al último punto de la traza sintética (fin a lat ≈ 0.90099)
    const historico = [
      posicion({ lat: 0, lon: 0, ts: "2026-07-30T08:00:00Z" }),
      posicion({ lat: 0.90099, lon: 0, ts: "2026-07-30T23:00:00Z" }), // fin
    ];

    const result = calcularProgreso(historico, TRAZA);

    expect(result.porcentaje).toBeCloseTo(100, 0);
    expect(result.kmRestantes).toBeCloseTo(0, 1);
    expect(result.estado).toBe("en-ruta");
  });
});

// ---------------------------------------------------------------------------
// Tests del anclaje del progreso (DT-005)
// ---------------------------------------------------------------------------

describe("calcularProgreso — anclaje al primer punto del intento (DT-005)", () => {
  it("porcentaje 0 al arrancar: el primer punto se proyecta y el ancla coincide con él", () => {
    // El primer punto está en el km 50 del corredor (mitad de la traza).
    // El porcentaje debe ser 0% porque no ha avanzado nada desde el ancla.
    const historico = [
      posicion({ lat: 0.45049, lon: 0, ts: "2026-07-30T08:00:00Z" }), // km 50
    ];

    const result = calcularProgreso(historico, TRAZA);

    expect(result.porcentaje).toBeCloseTo(0, 1);
    expect(result.odometroKm).toBe(0);
  });

  it("el porcentaje llega a 100 al alcanzar el final, sea cual sea el punto de arranque", () => {
    // Santi arranca en el km 50 (mitad) y llega al final.
    const historico = [
      posicion({ lat: 0.45049, lon: 0, ts: "2026-07-30T08:00:00Z" }), // km 50 (ancla)
      posicion({ lat: 0.90099, lon: 0, ts: "2026-07-30T23:00:00Z" }), // km 100 (fin)
    ];

    const result = calcularProgreso(historico, TRAZA);

    expect(result.porcentaje).toBeCloseTo(100, 0);
  });

  it("el porcentaje progresa correctamente desde el ancla hasta el final", () => {
    // Santi arranca en el km 50 (mitad) y llega al km 75 (3/4 de la traza).
    // Desde su perspectiva debe ver ~50% (avanzó 25 km de los 50 que le quedan).
    const historico = [
      posicion({ lat: 0.45049, lon: 0, ts: "2026-07-30T08:00:00Z" }), // km 50 (ancla)
      posicion({ lat: 0.67574, lon: 0, ts: "2026-07-30T16:00:00Z" }), // km 75
    ];

    const result = calcularProgreso(historico, TRAZA_5P);

    // Desde el ancla (km 50) al km 75: avanzó 25 km de 50 restantes → 50%
    expect(result.porcentaje).toBeGreaterThan(45);
    expect(result.porcentaje).toBeLessThan(55);
  });

  it("la barra sigue siendo monótona cuando el intento arranca en el km 50", () => {
    // Santi arranca en km 50, avanza al 75, luego retrocede al 60.
    // La barra no debe bajar del máximo alcanzado.
    const historico = [
      posicion({ lat: 0.45049, lon: 0, ts: "2026-07-30T08:00:00Z" }), // km 50 (ancla)
      posicion({ lat: 0.67574, lon: 0, ts: "2026-07-30T16:00:00Z" }), // km 75
      posicion({ lat: 0.54, lon: 0, ts: "2026-07-30T18:00:00Z" }),     // km ~60 (retroceso)
    ];

    const resultado_en_75 = calcularProgreso(historico.slice(0, 2), TRAZA);
    const resultado_con_retroceso = calcularProgreso(historico, TRAZA);

    expect(resultado_con_retroceso.porcentaje).toBeGreaterThanOrEqual(
      resultado_en_75.porcentaje
    );
  });

  it("histórico con un único punto válido: porcentaje 0, sin división por cero", () => {
    // Solo hay un punto; el ancla y el avance coinciden.
    // La fórmula da 0 sin explotar.
    const historico = [
      posicion({ lat: 0.22, lon: 0, ts: "2026-07-30T08:00:00Z" }), // cualquier punto
    ];

    const result = calcularProgreso(historico, TRAZA);

    expect(result.porcentaje).toBeCloseTo(0, 1);
    expect(Number.isNaN(result.porcentaje)).toBe(false);
    expect(Number.isFinite(result.porcentaje)).toBe(true);
  });

  it("histórico vacío: porcentaje 0, sin NaN ni Infinity", () => {
    const result = calcularProgreso([], TRAZA);

    expect(result.porcentaje).toBe(0);
    expect(Number.isNaN(result.porcentaje)).toBe(false);
    expect(Number.isFinite(result.porcentaje)).toBe(true);
  });

  it("todos los puntos rechazados por velocidad: porcentaje 0, sin NaN ni Infinity", () => {
    const historico = [
      posicion({ lat: 0, lon: 0, ts: "2026-07-30T08:00:00Z" }),
      // Salto de 50 km en 10 minutos: velocidad imposible, se descarta
      posicion({ lat: 0.45049, lon: 0, ts: "2026-07-30T08:10:00Z" }),
    ];

    const result = calcularProgreso(historico, TRAZA);

    // El segundo punto fue rechazado; el primer punto ancla el progreso en 0%
    expect(result.porcentaje).toBeCloseTo(0, 1);
    expect(Number.isNaN(result.porcentaje)).toBe(false);
  });
});
