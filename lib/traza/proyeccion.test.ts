/**
 * Tests unitarios de proyeccion.ts.
 *
 * Fixtures sintéticas de 3-5 puntos con distancias conocidas.
 * El GeoJSON real de 6.911 vértices no se usa aquí: los tests deben ser
 * rápidos y sus fallos deben señalar la línea exacta del bug.
 *
 * Al final hay un test de integridad de la traza real (guardarraíl de DT-001/DT-002).
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
          [0, 0],        // inicio
          [0, 0.45049],  // mitad (~50 km)
          [0, 0.90099],  // fin (~100 km)
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

// ---------------------------------------------------------------------------
// Test de integridad de la traza real (guardarraíl DT-001/DT-002)
// ---------------------------------------------------------------------------

describe("Integridad de la traza real", () => {
  it("traza.geojson mide entre 100,16 km y 100,26 km", () => {
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

    // DT-002: traza extendida debe medir ≈ 100,210 km (±50 m = ±0,05 km)
    expect(trazaReal.longitudTotalKm).toBeGreaterThan(100.16);
    expect(trazaReal.longitudTotalKm).toBeLessThan(100.26);
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
});

// ---------------------------------------------------------------------------
// Tests con fixtures sintéticas
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
  it("calcula progreso sin odómetro cuando hay solo un punto en ruta", () => {
    // Primer punto: inicio de la traza
    const historico = [
      posicion({ lat: 0, lon: 0, ts: "2026-07-30T08:00:00Z" }),
    ];

    const result = calcularProgreso(historico, TRAZA);

    expect(result.porcentaje).toBeGreaterThanOrEqual(0);
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
    expect(result.separacionM).toBeGreaterThan(50);
    expect(result.separacionM).toBeLessThanOrEqual(250);
  });
});

describe("calcularProgreso — desvío grande (~2 km)", () => {
  it("clasifica como desvio-mayor cuando la separación es ~2 km", () => {
    // ~2 km lateral = ~0.018° de lon en el ecuador
    const historico = [
      posicion({ lat: 0, lon: 0, ts: "2026-07-30T08:00:00Z" }),
      posicion({ lat: 0.22, lon: 0.018, ts: "2026-07-30T13:00:00Z" }), // ~2 km lateral
    ];

    const result = calcularProgreso(historico, TRAZA);

    expect(result.estado).toBe("desvio-mayor");
    expect(result.separacionM).toBeGreaterThan(250);
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

    // El segundo punto fue descartado por velocidad imposible
    expect(result.puntosDescartados).toBeGreaterThanOrEqual(1);
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

    // El punto es válido (no descartado), sí proyecta en la barra
    expect(result.porcentaje).toBeGreaterThan(0);
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
