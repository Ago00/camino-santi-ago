/**
 * Tests unitarios de calcularProgresoLibre (DT-016, modo libre).
 *
 * A diferencia de calcularProgreso (modo guiado), no hay corredor, ni
 * rechazo por velocidad, ni anclaje de porcentaje: el dominio es
 * deliberadamente mínimo. Estos tests cubren la selección de la última
 * posición no descartada por `ts` (no por orden del array), los casos sin
 * destino/sin histórico, que se ignoran las posiciones descartadas, y el
 * odómetro (DT-020/CURRENT.md): suma de tramos consecutivos, sin ningún
 * filtro de velocidad ni precisión GPS.
 */

import { describe, it, expect } from "vitest";
import { calcularProgresoLibre } from "./progreso-libre";
import type { Posicion } from "@/lib/types";

function posicion(overrides: Partial<Posicion> & { lat: number; lon: number; ts: string }): Posicion {
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

describe("calcularProgresoLibre", () => {
  it("devuelve distanciaRestanteKm y ultimaPosicion en null sin histórico ni destino", () => {
    const resultado = calcularProgresoLibre([], null);

    expect(resultado).toEqual({
      modo: "libre",
      distanciaRestanteKm: null,
      odometroKm: 0,
      ultimaPosicion: null,
    });
  });

  it("devuelve distanciaRestanteKm null cuando hay histórico pero no hay destino fijado", () => {
    const resultado = calcularProgresoLibre(
      [posicion({ id: 1, lat: 42.5, lon: -8.6, ts: "2026-08-07T10:00:00.000Z" })],
      null
    );

    expect(resultado.distanciaRestanteKm).toBeNull();
    expect(resultado.ultimaPosicion).toEqual({ lat: 42.5, lon: -8.6, ts: "2026-08-07T10:00:00.000Z" });
  });

  it("devuelve distanciaRestanteKm null cuando hay destino pero ningún punto en el histórico", () => {
    const resultado = calcularProgresoLibre([], { lat: 42.5, lon: -8.6 });

    expect(resultado.distanciaRestanteKm).toBeNull();
    expect(resultado.ultimaPosicion).toBeNull();
  });

  it("calcula la distancia haversine entre la última posición y el destino", () => {
    // ~1° de latitud ≈ 111,32 km. Separación de 0.1° en latitud ≈ 11,1 km.
    const resultado = calcularProgresoLibre(
      [posicion({ id: 1, lat: 42.0, lon: -8.0, ts: "2026-08-07T10:00:00.000Z" })],
      { lat: 42.1, lon: -8.0 }
    );

    expect(resultado.distanciaRestanteKm).not.toBeNull();
    expect(resultado.distanciaRestanteKm).toBeCloseTo(11.12, 1);
  });

  it("usa la posición con el ts más reciente, no la última del array", () => {
    const resultado = calcularProgresoLibre(
      [
        posicion({ id: 1, lat: 42.0, lon: -8.0, ts: "2026-08-07T12:00:00.000Z" }),
        posicion({ id: 2, lat: 42.05, lon: -8.0, ts: "2026-08-07T08:00:00.000Z" }),
      ],
      { lat: 42.0, lon: -8.0 }
    );

    // El punto de las 12:00 (id 1) es el más reciente pese a ir primero en
    // el array; su distancia al destino coincidente (mismas coords) es 0.
    expect(resultado.ultimaPosicion).toEqual({ lat: 42.0, lon: -8.0, ts: "2026-08-07T12:00:00.000Z" });
    expect(resultado.distanciaRestanteKm).toBeCloseTo(0, 5);
  });

  it("ignora las posiciones descartadas al elegir la última posición", () => {
    const resultado = calcularProgresoLibre(
      [
        posicion({ id: 1, lat: 42.0, lon: -8.0, ts: "2026-08-07T08:00:00.000Z" }),
        posicion({ id: 2, lat: 99, lon: 99, ts: "2026-08-07T12:00:00.000Z", descartado: true }),
      ],
      { lat: 42.0, lon: -8.0 }
    );

    expect(resultado.ultimaPosicion).toEqual({ lat: 42.0, lon: -8.0, ts: "2026-08-07T08:00:00.000Z" });
    expect(resultado.distanciaRestanteKm).toBeCloseTo(0, 5);
  });

  it("devuelve distanciaRestanteKm null si la única posición no descartada no existe (todas descartadas)", () => {
    const resultado = calcularProgresoLibre(
      [posicion({ id: 1, lat: 42.0, lon: -8.0, ts: "2026-08-07T08:00:00.000Z", descartado: true })],
      { lat: 42.0, lon: -8.0 }
    );

    expect(resultado.ultimaPosicion).toBeNull();
    expect(resultado.distanciaRestanteKm).toBeNull();
  });

  it("marca siempre modo: 'libre' en el resultado", () => {
    const resultado = calcularProgresoLibre([], null);
    expect(resultado.modo).toBe("libre");
  });

  describe("odometroKm (DT-020/CURRENT.md)", () => {
    it("da 0 con un único punto (no hay ningún tramo que sumar todavía)", () => {
      const resultado = calcularProgresoLibre(
        [posicion({ id: 1, lat: 42.0, lon: -8.0, ts: "2026-08-07T08:00:00.000Z" })],
        null
      );

      expect(resultado.odometroKm).toBe(0);
    });

    it("da 0 sin ningún punto en el histórico", () => {
      const resultado = calcularProgresoLibre([], null);
      expect(resultado.odometroKm).toBe(0);
    });

    it("suma la distancia haversine de cada tramo consecutivo, en el orden recibido", () => {
      // haversineKm usa un radio esférico de 6371 km (EARTH_RADIUS_KM,
      // lib/traza/proyeccion.ts): 1° de latitud ≈ 2π×6371/360 ≈ 111,1949 km
      // (no los ~111,32 km del elipsoide WGS84 real — coherente con el resto
      // del dominio, que usa la misma constante). Dos tramos de 0.01° ≈
      // 1,11195 km cada uno ≈ 2,2239 km en total.
      const resultado = calcularProgresoLibre(
        [
          posicion({ id: 1, lat: 42.0, lon: -8.0, ts: "2026-08-07T08:00:00.000Z" }),
          posicion({ id: 2, lat: 42.01, lon: -8.0, ts: "2026-08-07T08:05:00.000Z" }),
          posicion({ id: 3, lat: 42.02, lon: -8.0, ts: "2026-08-07T08:10:00.000Z" }),
        ],
        null
      );

      expect(resultado.odometroKm).toBeCloseTo(2.2239, 3);
    });

    it("ignora las posiciones descartadas al sumar tramos (no cuentan como extremo de ningún tramo)", () => {
      const resultado = calcularProgresoLibre(
        [
          posicion({ id: 1, lat: 42.0, lon: -8.0, ts: "2026-08-07T08:00:00.000Z" }),
          posicion({ id: 2, lat: 99, lon: 99, ts: "2026-08-07T08:05:00.000Z", descartado: true }),
          posicion({ id: 3, lat: 42.01, lon: -8.0, ts: "2026-08-07T08:10:00.000Z" }),
        ],
        null
      );

      // El tramo real es directamente id 1 → id 3 (0.01° ≈ 1,1119 km, misma
      // constante que el test anterior); si el punto descartado participara,
      // el resultado sería muy distinto (miles de km, por el salto a
      // lat/lon 99).
      expect(resultado.odometroKm).toBeCloseTo(1.1119, 3);
    });

    it("NO aplica ningún filtro de velocidad implícita, a diferencia del odómetro del modo guiado", () => {
      // Dos puntos a ~11,13 km de separación con solo 1 segundo entre ellos:
      // más de 40.000 km/h de velocidad implícita. calcularProgreso() (modo
      // guiado, lib/traza/proyeccion.ts) descartaría un salto así por
      // velocidad implícita imposible (VELOCIDAD_MAX_KMH); calcularProgresoLibre
      // no tiene ese rechazo — lo suma igualmente, coherente con la filosofía
      // documentada del módulo ("los puntos se aceptan sin validar").
      const resultado = calcularProgresoLibre(
        [
          posicion({ id: 1, lat: 42.0, lon: -8.0, ts: "2026-08-07T08:00:00.000Z" }),
          posicion({ id: 2, lat: 42.1, lon: -8.0, ts: "2026-08-07T08:00:01.000Z" }),
        ],
        null
      );

      expect(resultado.odometroKm).toBeCloseTo(11.12, 1);
    });
  });
});
