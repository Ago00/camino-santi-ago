/**
 * Tests unitarios de lib/rate-limit.ts.
 *
 * Lógica pura sobre un Map en memoria: sin red, sin reloj real (se controla
 * Date.now con vi.useFakeTimers para probar la expiración de ventana sin
 * sleeps reales).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { consumir, obtenerIpCliente, reiniciarRateLimit } from "./rate-limit";
import { NextRequest } from "next/server";

beforeEach(() => {
  reiniciarRateLimit();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("consumir", () => {
  it("permite peticiones mientras no se alcance el límite", () => {
    expect(consumir("clave-a", 3, 60_000)).toBe(true);
    expect(consumir("clave-a", 3, 60_000)).toBe(true);
    expect(consumir("clave-a", 3, 60_000)).toBe(true);
  });

  it("rechaza exactamente la petición que supera el límite (borde exacto)", () => {
    expect(consumir("clave-b", 3, 60_000)).toBe(true);
    expect(consumir("clave-b", 3, 60_000)).toBe(true);
    expect(consumir("clave-b", 3, 60_000)).toBe(true);

    expect(consumir("clave-b", 3, 60_000)).toBe(false);
  });

  it("sigue rechazando peticiones adicionales una vez superado el límite", () => {
    for (let i = 0; i < 5; i++) {
      consumir("clave-c", 5, 60_000);
    }

    expect(consumir("clave-c", 5, 60_000)).toBe(false);
    expect(consumir("clave-c", 5, 60_000)).toBe(false);
  });

  it("un límite de 1 permite una sola petición por ventana", () => {
    expect(consumir("clave-d", 1, 60_000)).toBe(true);
    expect(consumir("clave-d", 1, 60_000)).toBe(false);
  });

  it("no interfiere entre claves distintas: cada una tiene su propio cupo", () => {
    for (let i = 0; i < 3; i++) {
      consumir("clave-e", 3, 60_000);
    }
    expect(consumir("clave-e", 3, 60_000)).toBe(false);

    // Una clave nueva no se ve afectada por que otra haya agotado su cupo.
    expect(consumir("clave-f", 3, 60_000)).toBe(true);
  });

  it("reinicia el contador a 1 cuando la ventana expira", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    expect(consumir("clave-g", 2, 1_000)).toBe(true);
    expect(consumir("clave-g", 2, 1_000)).toBe(true);
    expect(consumir("clave-g", 2, 1_000)).toBe(false);

    // La ventana era de 1000 ms: en t=1001 debe haber reiniciado el cupo.
    vi.setSystemTime(1_001);

    expect(consumir("clave-g", 2, 1_000)).toBe(true);
    expect(consumir("clave-g", 2, 1_000)).toBe(true);
    expect(consumir("clave-g", 2, 1_000)).toBe(false);
  });

  it("no reinicia el contador un instante antes de que expire la ventana", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    expect(consumir("clave-h", 1, 1_000)).toBe(true);

    vi.setSystemTime(999);

    expect(consumir("clave-h", 1, 1_000)).toBe(false);
  });
});

describe("reiniciarRateLimit", () => {
  it("limpia todo el estado acumulado, permitiendo consumir de nuevo", () => {
    consumir("clave-i", 1, 60_000);
    expect(consumir("clave-i", 1, 60_000)).toBe(false);

    reiniciarRateLimit();

    expect(consumir("clave-i", 1, 60_000)).toBe(true);
  });
});

describe("obtenerIpCliente", () => {
  it("devuelve la primera IP de x-forwarded-for cuando hay varias", () => {
    const request = new NextRequest("http://localhost/api/test", {
      headers: { "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178" },
    });

    expect(obtenerIpCliente(request)).toBe("203.0.113.5");
  });

  it("recorta espacios alrededor de la IP", () => {
    const request = new NextRequest("http://localhost/api/test", {
      headers: { "x-forwarded-for": "  203.0.113.5  , 70.41.3.18" },
    });

    expect(obtenerIpCliente(request)).toBe("203.0.113.5");
  });

  it("agrupa bajo una clave común cuando no llega la cabecera x-forwarded-for", () => {
    const request = new NextRequest("http://localhost/api/test");

    expect(obtenerIpCliente(request)).toBe("ip-desconocida");
  });
});
