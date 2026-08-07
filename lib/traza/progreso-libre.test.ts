/**
 * Tests unitarios de calcularProgresoLibre (DT-016, modo libre).
 *
 * A diferencia de calcularProgreso (modo guiado), no hay corredor, ni
 * rechazo por velocidad, ni anclaje de porcentaje: el dominio es
 * deliberadamente mínimo. Estos tests cubren la selección de la última
 * posición no descartada por `ts` (no por orden del array), los casos sin
 * destino/sin histórico, y que se ignoran las posiciones descartadas.
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
});
