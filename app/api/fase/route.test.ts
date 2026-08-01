/**
 * Tests de GET /api/fase con el cliente Supabase público mockado (mismo
 * patrón que app/api/progreso/route.test.ts).
 *
 * Cubre: fase real del intento activo (las 3 fases posibles), fallback a
 * "antes" sin intento activo, y el rate limiting por IP (DT-011).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { reiniciarRateLimit } from "@/lib/rate-limit";
import type { Fase } from "@/lib/types";

function crearPeticion(ip = "203.0.113.10"): NextRequest {
  return new NextRequest("http://localhost/api/fase", {
    headers: { "x-forwarded-for": ip },
  });
}

let intentoActivoMock: { fase: Fase } | null = null;

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
      throw new Error(`Tabla no mockada: ${tabla}`);
    }),
  })),
}));

beforeEach(() => {
  intentoActivoMock = null;
  reiniciarRateLimit();
});

describe("GET /api/fase", () => {
  it.each<Fase>(["antes", "durante", "llegada"])(
    "devuelve la fase real del intento activo cuando es %s",
    async (fase) => {
      intentoActivoMock = { fase };

      const { GET } = await import("@/app/api/fase/route");
      const response = await GET(crearPeticion());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ fase });
    },
  );

  it('devuelve fase "antes" cuando no hay intento activo', async () => {
    intentoActivoMock = null;

    const { GET } = await import("@/app/api/fase/route");
    const response = await GET(crearPeticion());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ fase: "antes" });
  });
});

describe("GET /api/fase — rate limiting (DT-011)", () => {
  it("responde 429 al superar 60 peticiones en un minuto desde la misma IP", async () => {
    const { GET } = await import("@/app/api/fase/route");

    for (let i = 0; i < 60; i++) {
      const response = await GET(crearPeticion("198.51.100.7"));
      expect(response.status).toBe(200);
    }

    const response = await GET(crearPeticion("198.51.100.7"));
    expect(response.status).toBe(429);
  });

  it("no limita a una IP distinta aunque otra haya agotado su cupo", async () => {
    const { GET } = await import("@/app/api/fase/route");

    for (let i = 0; i < 60; i++) {
      await GET(crearPeticion("198.51.100.7"));
    }
    await GET(crearPeticion("198.51.100.7")); // agota el cupo de esta IP

    const response = await GET(crearPeticion("198.51.100.99"));
    expect(response.status).toBe(200);
  });
});
