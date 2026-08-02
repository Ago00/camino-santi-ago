/**
 * Tests de GET /api/progreso con el cliente Supabase público y la traza
 * mockados (traza sintética de 3 puntos, mismo patrón que
 * lib/traza/proyeccion.test.ts, para no depender del GeoJSON real de 7.121
 * vértices en un test unitario).
 *
 * Cubre: caso sin intento activo, caso con histórico, la proyección a
 * ProgresoPublico (nunca campos internos de Posicion), el comportamiento
 * de la caché TTL en memoria (DT-007) y el rate limiting por IP (DT-011).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { reiniciarRateLimit } from "@/lib/rate-limit";
import type { Posicion, TrazaPreparada } from "@/lib/types";

function crearPeticion(ip = "203.0.113.10"): NextRequest {
  return new NextRequest("http://localhost/api/progreso", {
    headers: { "x-forwarded-for": ip },
  });
}

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
  reiniciarRateLimit();
  // La caché TTL vive en el módulo compartido lib/progreso-cache.ts (DT-014,
  // antes a nivel de módulo local aquí mismo, DT-007) — hay que limpiarla
  // explícitamente entre tests, `vi.resetModules()` no reimporta el módulo
  // ya cacheado por Node/Vitest a través de imports estáticos previos.
  // `route.ts` sigue reexportando `limpiarCacheProgreso`, así que este test
  // no cambia su forma de invalidarla (comportamiento externo intacto).
  const { limpiarCacheProgreso } = await import("@/app/api/progreso/route");
  limpiarCacheProgreso();
});

describe("GET /api/progreso", () => {
  it("devuelve progreso en cero cuando no hay intento activo", async () => {
    const { GET } = await import("@/app/api/progreso/route");
    const response = await GET(crearPeticion());
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
    const response = await GET(crearPeticion());
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
    const response = await GET(crearPeticion());
    const body = await response.json();

    expect(body.porcentaje).toBeGreaterThan(0);
    expect(body.kmAvanzados).toBeGreaterThan(0);
  });

  it("sirve el resultado cacheado dentro del TTL sin recalcular con el histórico nuevo", async () => {
    intentoActivoMock = { id: 1 };
    posicionesMock = [posicion({ id: 1, lat: 0, lon: 0 })];

    const { GET } = await import("@/app/api/progreso/route");
    const primera = await (await GET(crearPeticion())).json();

    posicionesMock = [posicion({ id: 2, lat: 0.45049, lon: 0 })];
    const segunda = await (await GET(crearPeticion())).json();

    expect(segunda).toEqual(primera);
  });
});

describe("GET /api/progreso — rate limiting (DT-011)", () => {
  it("responde 429 al superar 60 peticiones en un minuto desde la misma IP", async () => {
    const { GET } = await import("@/app/api/progreso/route");

    for (let i = 0; i < 60; i++) {
      const response = await GET(crearPeticion("198.51.100.7"));
      expect(response.status).toBe(200);
    }

    const response = await GET(crearPeticion("198.51.100.7"));
    expect(response.status).toBe(429);
  });

  it("no limita a una IP distinta aunque otra haya agotado su cupo", async () => {
    const { GET } = await import("@/app/api/progreso/route");

    for (let i = 0; i < 60; i++) {
      await GET(crearPeticion("198.51.100.7"));
    }
    await GET(crearPeticion("198.51.100.7")); // agota el cupo de esta IP

    const response = await GET(crearPeticion("198.51.100.99"));
    expect(response.status).toBe(200);
  });
});
