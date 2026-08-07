/**
 * Tests de la caché compartida de `ProgresoPublico` (DT-014). Cubre el
 * contrato que consumen tanto `GET /api/progreso` (TTL) como
 * `crearMinutoAMinuto` (lectura del valor sin comprobar TTL).
 *
 * `ProgresoPublico` es una unión discriminada por `modo` desde DT-016 — la
 * caché es genérica sobre la unión completa, así que se prueba con ambas
 * ramas (guiado/libre) para no acoplar el módulo compartido a una sola.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  CACHE_TTL_MS,
  guardarCacheProgreso,
  limpiarCacheProgreso,
  obtenerCacheProgreso,
} from "@/lib/progreso-cache";
import type { ProgresoPublicoGuiado, ProgresoPublicoLibre } from "@/lib/types";

function progresoPublico(overrides: Partial<ProgresoPublicoGuiado> = {}): ProgresoPublicoGuiado {
  return {
    modo: "guiado",
    porcentaje: 0,
    kmAvanzados: 0,
    kmRestantes: 100,
    odometroKm: 0,
    estado: "en-ruta",
    ultimaPosicion: null,
    ...overrides,
  };
}

function progresoPublicoLibre(overrides: Partial<ProgresoPublicoLibre> = {}): ProgresoPublicoLibre {
  return {
    modo: "libre",
    distanciaRestanteKm: null,
    ultimaPosicion: null,
    ...overrides,
  };
}

beforeEach(() => {
  limpiarCacheProgreso();
});

describe("progreso-cache", () => {
  it("obtenerCacheProgreso devuelve null cuando nunca se ha escrito nada", () => {
    expect(obtenerCacheProgreso()).toBeNull();
  });

  it("guardarCacheProgreso hace disponible el valor guardado con su timestamp", () => {
    const valor = progresoPublico({ porcentaje: 42 });
    guardarCacheProgreso(valor);

    const cache = obtenerCacheProgreso();
    expect(cache).not.toBeNull();
    expect(cache?.valor).toEqual(valor);
    expect(typeof cache?.timestamp).toBe("number");
  });

  it("limpiarCacheProgreso deja la caché en null tras haber guardado un valor", () => {
    guardarCacheProgreso(progresoPublico());
    limpiarCacheProgreso();

    expect(obtenerCacheProgreso()).toBeNull();
  });

  it("guardarCacheProgreso sobrescribe cualquier valor previo", () => {
    guardarCacheProgreso(progresoPublico({ porcentaje: 10 }));
    guardarCacheProgreso(progresoPublico({ porcentaje: 20 }));

    const valor = obtenerCacheProgreso()?.valor;
    expect(valor?.modo).toBe("guiado");
    expect(valor && valor.modo === "guiado" ? valor.porcentaje : null).toBe(20);
  });

  it("expone CACHE_TTL_MS como los 20 s documentados (DT-007)", () => {
    expect(CACHE_TTL_MS).toBe(20_000);
  });

  it("acepta también la rama 'libre' de ProgresoPublico (DT-016, unión discriminada)", () => {
    const valor = progresoPublicoLibre({ distanciaRestanteKm: 3.2 });
    guardarCacheProgreso(valor);

    expect(obtenerCacheProgreso()?.valor).toEqual(valor);
  });
});
