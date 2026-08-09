/**
 * Tests de GET /api/progreso con el cliente Supabase público y la traza
 * mockados (traza sintética de 3 puntos, mismo patrón que
 * lib/traza/proyeccion.test.ts, para no depender del GeoJSON real de 7.951
 * vértices (DT-015) en un test unitario).
 *
 * Cubre: caso sin intento activo, caso con histórico, la proyección a
 * ProgresoPublico (nunca campos internos de Posicion), el comportamiento
 * de la caché TTL en memoria (DT-007), el rate limiting por IP (DT-011) y
 * la bifurcación por modo del intento activo (DT-016: guiado vs libre).
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

interface IntentoActivoMock {
  id: number;
  modo?: "guiado" | "libre";
  destino_lat?: number | null;
  destino_lon?: number | null;
}

let intentoActivoMock: IntentoActivoMock | null = null;
let errorIntentoMock: { message: string } | null = null;
// Mock del intento activo devuelto por el select mínimo de fallback (solo
// `id`), usado cuando la consulta con modo/destino_lat/destino_lon falla
// (columnas inexistentes, migración 0003_modo_intento.sql sin aplicar — ver
// DEBT.md).
let intentoActivoMinimoMock: { id: number } | null = null;
let posicionesMock: Posicion[] = [];

// DT-018: mocks propios (no recreados dentro de la factory de `from`) para
// poder aserir sobre ellos entre tests — el modo guiado llama a `.range()`
// (paginación completa, lib/supabase/paginacion.ts) y el modo libre a
// `.limit(1).maybeSingle()` (solo la última posición, sin traer el histórico
// completo en cada poll de 30 s).
const rangeMock = vi.fn(() => Promise.resolve({ data: posicionesMock, error: null }));
const limitMock = vi.fn().mockReturnThis();
const maybeSingleUltimaPosicionMock = vi.fn(() => {
  const validas = posicionesMock.filter((p) => !p.descartado);
  if (validas.length === 0) return Promise.resolve({ data: null, error: null });
  const masReciente = validas.reduce((a, b) =>
    new Date(b.ts).getTime() > new Date(a.ts).getTime() ? b : a
  );
  return Promise.resolve({ data: masReciente, error: null });
});

vi.mock("@/lib/supabase/public", () => ({
  getSupabasePublic: vi.fn(() => ({
    from: vi.fn((tabla: string) => {
      if (tabla === "intentos") {
        return {
          select: vi.fn((columnas: string) => ({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue(
              columnas.includes("modo")
                ? { data: intentoActivoMock, error: errorIntentoMock }
                : { data: intentoActivoMinimoMock, error: null }
            ),
          })),
        };
      }
      if (tabla === "posiciones") {
        // DT-018: el modo guiado pagina con .range() (obtenerTodasLasFilas),
        // el modo libre pide solo la última posición con .limit(1).maybeSingle().
        // posicionesMock cabe siempre en una sola página en estos tests (no
        // hace falta simular múltiples páginas aquí — eso lo cubre
        // lib/supabase/paginacion.test.ts de forma aislada).
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: rangeMock,
          limit: limitMock,
          maybeSingle: maybeSingleUltimaPosicionMock,
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
  errorIntentoMock = null;
  intentoActivoMinimoMock = null;
  posicionesMock = [];
  rangeMock.mockClear();
  limitMock.mockClear();
  maybeSingleUltimaPosicionMock.mockClear();
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

describe("GET /api/progreso — bifurcación por modo del intento activo (DT-016)", () => {
  it("devuelve la rama 'libre' (distanciaRestanteKm, sin porcentaje ni odómetro) cuando el intento activo está en modo libre", async () => {
    intentoActivoMock = { id: 9, modo: "libre", destino_lat: 42.1, destino_lon: -8.0 };
    posicionesMock = [posicion({ id: 1, lat: 42.0, lon: -8.0, ts: "2026-09-12T10:00:00.000Z" })];

    const { GET } = await import("@/app/api/progreso/route");
    const response = await GET(crearPeticion());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.modo).toBe("libre");
    expect(body.distanciaRestanteKm).toBeCloseTo(11.12, 1);
    expect(body.ultimaPosicion).toEqual({ lat: 42.0, lon: -8.0, ts: "2026-09-12T10:00:00.000Z" });
    expect(body).not.toHaveProperty("porcentaje");
    expect(body).not.toHaveProperty("odometroKm");
  });

  it("devuelve distanciaRestanteKm null en modo libre sin destino fijado", async () => {
    intentoActivoMock = { id: 9, modo: "libre", destino_lat: null, destino_lon: null };
    posicionesMock = [posicion({ id: 1, lat: 42.0, lon: -8.0 })];

    const { GET } = await import("@/app/api/progreso/route");
    const response = await GET(crearPeticion());
    const body = await response.json();

    expect(body.modo).toBe("libre");
    expect(body.distanciaRestanteKm).toBeNull();
  });

  it("devuelve la rama 'guiado' (con porcentaje) cuando el intento activo está en modo guiado", async () => {
    intentoActivoMock = { id: 1, modo: "guiado" };
    posicionesMock = [posicion({ id: 1, lat: 0, lon: 0 })];

    const { GET } = await import("@/app/api/progreso/route");
    const response = await GET(crearPeticion());
    const body = await response.json();

    expect(body.modo).toBe("guiado");
    expect(body).toHaveProperty("porcentaje");
    expect(body).not.toHaveProperty("distanciaRestanteKm");
  });
});

describe("GET /api/progreso — histórico de posiciones sin cortar a 1000 filas (DT-018)", () => {
  it("modo guiado pagina el histórico con .range() en vez de un select sin límite", async () => {
    intentoActivoMock = { id: 1, modo: "guiado" };
    posicionesMock = [posicion({ id: 1, lat: 0, lon: 0 })];

    const { GET } = await import("@/app/api/progreso/route");
    await GET(crearPeticion());

    expect(rangeMock).toHaveBeenCalledWith(0, 999);
    expect(maybeSingleUltimaPosicionMock).not.toHaveBeenCalled();
  });

  it("modo libre pide solo la última posición (limit 1), sin paginar el histórico completo", async () => {
    intentoActivoMock = { id: 9, modo: "libre", destino_lat: 42.1, destino_lon: -8.0 };
    posicionesMock = [
      posicion({ id: 1, lat: 42.0, lon: -8.0, ts: "2026-09-12T09:00:00.000Z" }),
      posicion({ id: 2, lat: 42.01, lon: -8.01, ts: "2026-09-12T10:00:00.000Z" }),
    ];

    const { GET } = await import("@/app/api/progreso/route");
    const response = await GET(crearPeticion());
    const body = await response.json();

    expect(limitMock).toHaveBeenCalledWith(1);
    expect(maybeSingleUltimaPosicionMock).toHaveBeenCalledTimes(1);
    expect(rangeMock).not.toHaveBeenCalled();
    // La posición más reciente (10:00), no la primera del array.
    expect(body.ultimaPosicion).toEqual({ lat: 42.01, lon: -8.01, ts: "2026-09-12T10:00:00.000Z" });
  });
});

describe("GET /api/progreso — compatibilidad con la migración 0003_modo_intento.sql sin aplicar (ver DEBT.md)", () => {
  it("reintenta con el select mínimo y calcula progreso en modo guiado cuando la columna `modo` no existe todavía", async () => {
    errorIntentoMock = { message: "column intentos.modo does not exist" };
    intentoActivoMinimoMock = { id: 3 };
    posicionesMock = [
      posicion({ id: 1, lat: 0, lon: 0, ts: "2026-09-12T08:00:00.000Z" }),
      posicion({ id: 2, lat: 0.45049, lon: 0, ts: "2026-09-12T13:00:00.000Z" }),
    ];

    const { GET } = await import("@/app/api/progreso/route");
    const response = await GET(crearPeticion());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.modo).toBe("guiado");
    expect(body.porcentaje).toBeGreaterThan(0);
  });

  it("devuelve progreso en cero (no distanciaRestanteKm) cuando falla también el select de fallback", async () => {
    errorIntentoMock = { message: "column intentos.modo does not exist" };
    intentoActivoMinimoMock = null;

    const { GET } = await import("@/app/api/progreso/route");
    const response = await GET(crearPeticion());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.modo).toBe("guiado");
    expect(body.porcentaje).toBe(0);
  });
});
