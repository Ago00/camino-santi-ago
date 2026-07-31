/**
 * Tests de GET /api/progreso con el cliente Supabase público y la traza
 * mockados (traza sintética de 3 puntos, mismo patrón que
 * lib/traza/proyeccion.test.ts, para no depender del GeoJSON real de 7.121
 * vértices en un test unitario).
 *
 * Cubre: caso sin intento activo, caso con histórico, la proyección a
 * ProgresoPublico (nunca campos internos de Posicion), y el comportamiento
 * de la caché TTL en memoria (DT-007).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Posicion, TrazaPreparada } from "@/lib/types";

let intentoActivoMock: { id: number } | null = null;
let posicionesMock: Posicion[] = [];

vi.mock("@/lib/supabase/public", () => ({
  getSupabasePublic: vi.fn(() => ({
    from: vi.fn((tabla: string) => {
      if (tabla === "intentos") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: intentoActivoMock, error: null }),
        };
      }
      if (tabla === "posiciones") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: posicionesMock, error: null }),
        };
      }
      throw new Error(`Tabla no mockada: ${tabla}`);
    }),
  })),
}));

// Traza sintética: línea recta de ~100 km (misma idea que proyeccion.test.ts).
const TRAZA_SINTETICA: TrazaPreparada = {
  coordenadas: [
    [0, 0],
    [0, 0.45049],
    [0, 0.90099],
  ],
  kmAcumulados: [0, 50, 100],
  longitudTotalKm: 100,
};

vi.mock("@/lib/traza/cargar-traza", () => ({
  cargarTrazaDeCalculo: vi.fn(() => TRAZA_SINTETICA),
}));

function posicion(overrides: Partial<Posicion>): Posicion {
  return {
    id: 1,
    intento_id: 1,
    lat: 0,
    lon: 0,
    ts: "2026-09-12T10:00:00.000Z",
    batt: 90,
    acc: 5,
    fuente: "app",
    descartado: false,
    created_at: "2026-09-12T10:00:01.000Z",
    ...overrides,
  };
}

beforeEach(async () => {
  intentoActivoMock = null;
  posicionesMock = [];
  // La caché TTL vive a nivel de módulo (DT-007): hay que limpiarla
  // explícitamente entre tests, `vi.resetModules()` no reimporta el módulo
  // ya cacheado por Node/Vitest a través de imports estáticos previos.
  const { limpiarCacheProgreso } = await import("@/app/api/progreso/route");
  limpiarCacheProgreso();
});

describe("GET /api/progreso", () => {
  it("devuelve progreso en cero cuando no hay intento activo", async () => {
    const { GET } = await import("@/app/api/progreso/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.porcentaje).toBe(0);
    expect(body.ultimaPosicion).toBeNull();
  });

  it("nunca expone campos internos de Posicion en ultimaPosicion", async () => {
    intentoActivoMock = { id: 1 };
    posicionesMock = [
      posicion({ lat: 0.2, lon: 0, ts: "2026-09-12T10:00:00.000Z" }),
    ];

    const { GET } = await import("@/app/api/progreso/route");
    const response = await GET();
    const body = await response.json();

    expect(body.ultimaPosicion).not.toBeNull();
    expect(Object.keys(body.ultimaPosicion).sort()).toEqual(["lat", "lon", "ts"]);
  });

  it("calcula el progreso a partir del histórico de posiciones no descartadas", async () => {
    intentoActivoMock = { id: 1 };
    posicionesMock = [
      posicion({ id: 1, lat: 0, lon: 0, ts: "2026-09-12T08:00:00.000Z" }),
      // ~50 km en 5 h ⇒ 10 km/h, dentro de VELOCIDAD_MAX_KMH (15) para que
      // el punto no se descarte por velocidad implícita imposible.
      posicion({ id: 2, lat: 0.45049, lon: 0, ts: "2026-09-12T13:00:00.000Z" }),
    ];

    const { GET } = await import("@/app/api/progreso/route");
    const response = await GET();
    const body = await response.json();

    expect(body.porcentaje).toBeGreaterThan(0);
    expect(body.kmAvanzados).toBeGreaterThan(0);
  });

  it("sirve el resultado cacheado dentro del TTL sin recalcular con el histórico nuevo", async () => {
    intentoActivoMock = { id: 1 };
    posicionesMock = [posicion({ id: 1, lat: 0, lon: 0 })];

    const { GET } = await import("@/app/api/progreso/route");
    const primera = await (await GET()).json();

    posicionesMock = [posicion({ id: 2, lat: 0.45049, lon: 0 })];
    const segunda = await (await GET()).json();

    expect(segunda).toEqual(primera);
  });
});
