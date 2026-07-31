/**
 * Tests unitarios de bandaHoraria(). Franjas fijas (ver lib/cielo.ts):
 *   día 8-20h, atardecer 20-21:30h, noche 21:30-6h, amanecer 6-8h.
 */

import { describe, it, expect } from "vitest";
import { bandaHoraria } from "./cielo";

function fechaAlas(horas: number, minutos: number): Date {
  return new Date(2026, 6, 31, horas, minutos, 0);
}

describe("bandaHoraria", () => {
  it('devuelve "dia" al inicio exacto de la franja (08:00)', () => {
    expect(bandaHoraria(fechaAlas(8, 0))).toBe("dia");
  });

  it('devuelve "dia" a mediodía', () => {
    expect(bandaHoraria(fechaAlas(12, 0))).toBe("dia");
  });

  it('devuelve "dia" justo antes de que empiece el atardecer (19:59)', () => {
    expect(bandaHoraria(fechaAlas(19, 59))).toBe("dia");
  });

  it('devuelve "atardecer" al inicio exacto de la franja (20:00)', () => {
    expect(bandaHoraria(fechaAlas(20, 0))).toBe("atardecer");
  });

  it('devuelve "atardecer" en mitad de la franja (20:45)', () => {
    expect(bandaHoraria(fechaAlas(20, 45))).toBe("atardecer");
  });

  it('devuelve "noche" al inicio exacto de la franja (21:30)', () => {
    expect(bandaHoraria(fechaAlas(21, 30))).toBe("noche");
  });

  it('devuelve "noche" pasada la medianoche', () => {
    expect(bandaHoraria(fechaAlas(0, 30))).toBe("noche");
  });

  it('devuelve "noche" justo antes de que empiece el amanecer (05:59)', () => {
    expect(bandaHoraria(fechaAlas(5, 59))).toBe("noche");
  });

  it('devuelve "amanecer" al inicio exacto de la franja (06:00)', () => {
    expect(bandaHoraria(fechaAlas(6, 0))).toBe("amanecer");
  });

  it('devuelve "amanecer" justo antes de que empiece el día (07:59)', () => {
    expect(bandaHoraria(fechaAlas(7, 59))).toBe("amanecer");
  });
});
