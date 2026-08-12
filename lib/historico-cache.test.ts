/**
 * Tests de la caché compartida del histórico de posiciones (DT-021, fix
 * post-revisión de Seguridad). Mismo contrato que `lib/progreso-cache.ts`
 * (ver `lib/progreso-cache.test.ts`), aplicado a `Posicion[]`.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  CACHE_TTL_MS,
  guardarCacheHistorico,
  limpiarCacheHistorico,
  obtenerCacheHistorico,
} from "@/lib/historico-cache";
import type { Posicion } from "@/lib/types";

function posicion(overrides: Partial<Posicion> = {}): Posicion {
  return {
    id: 1,
    intento_id: 1,
    lat: 42.5,
    lon: -8.6,
    ts: "2026-09-12T10:00:00.000Z",
    batt: 90,
    acc: 5,
    fuente: "app",
    descartado: false,
    created_at: "2026-09-12T10:00:01.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  limpiarCacheHistorico();
});

describe("historico-cache", () => {
  it("obtenerCacheHistorico devuelve null cuando nunca se ha escrito nada", () => {
    expect(obtenerCacheHistorico()).toBeNull();
  });

  it("guardarCacheHistorico hace disponible el valor guardado con su timestamp", () => {
    const valor = [posicion({ id: 1 }), posicion({ id: 2 })];
    guardarCacheHistorico(valor);

    const cache = obtenerCacheHistorico();
    expect(cache).not.toBeNull();
    expect(cache?.valor).toEqual(valor);
    expect(typeof cache?.timestamp).toBe("number");
  });

  it("limpiarCacheHistorico deja la caché en null tras haber guardado un valor", () => {
    guardarCacheHistorico([posicion()]);
    limpiarCacheHistorico();

    expect(obtenerCacheHistorico()).toBeNull();
  });

  it("guardarCacheHistorico sobrescribe cualquier valor previo", () => {
    guardarCacheHistorico([posicion({ id: 1 })]);
    guardarCacheHistorico([posicion({ id: 2 }), posicion({ id: 3 })]);

    expect(obtenerCacheHistorico()?.valor).toHaveLength(2);
  });

  it("comparte CACHE_TTL_MS (20 s) con lib/progreso-cache.ts — mismo TTL, una sola constante", () => {
    expect(CACHE_TTL_MS).toBe(20_000);
  });
});
