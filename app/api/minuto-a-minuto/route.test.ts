/**
 * Tests de GET /api/minuto-a-minuto con el cliente Supabase público mockado.
 * Mismo patrón que app/api/comentarios/route.test.ts: paginación offset/limit,
 * poll incremental (despuesDeId), rate limit 429, no interferencia entre IPs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { reiniciarRateLimit } from "@/lib/rate-limit";

let selectResultado: { data: unknown[] | null; error: Error | null } = {
  data: [],
  error: null,
};
const rangeSpy = vi.fn(() => Promise.resolve(selectResultado));
const limitSpy = vi.fn(() => Promise.resolve(selectResultado));
const gtSpy = vi.fn(() => ({
  order: vi.fn().mockReturnThis(),
  limit: limitSpy,
}));

vi.mock("@/lib/supabase/public", () => ({
  getSupabasePublic: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: rangeSpy,
      gt: gtSpy,
    })),
  })),
}));

const { GET } = await import("@/app/api/minuto-a-minuto/route");

function crearPeticionGet(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/minuto-a-minuto${query}`);
}

function crearPeticionConIp(ip: string, query: string): NextRequest {
  return new NextRequest(`http://localhost/api/minuto-a-minuto${query}`, {
    headers: { "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  selectResultado = { data: [], error: null };
  rangeSpy.mockClear();
  limitSpy.mockClear();
  gtSpy.mockClear();
  reiniciarRateLimit();
});

describe("GET /api/minuto-a-minuto — carga paginada", () => {
  it("usa offset=0 y limit=20 por defecto cuando no se pasan query params", async () => {
    await GET(crearPeticionGet(""));
    expect(rangeSpy).toHaveBeenCalledWith(0, 19);
    expect(gtSpy).not.toHaveBeenCalled();
  });

  it("respeta offset y limit explícitos en la query", async () => {
    await GET(crearPeticionGet("?offset=20&limit=5"));
    expect(rangeSpy).toHaveBeenCalledWith(20, 24);
  });

  it("responde 400 cuando limit supera el máximo permitido", async () => {
    const response = await GET(crearPeticionGet("?limit=500"));
    expect(response.status).toBe(400);
  });

  it("indica siguienteOffset=null cuando la página devuelta está incompleta (fin del listado)", async () => {
    selectResultado = { data: [{ id: 1 }, { id: 2 }], error: null };
    const response = await GET(crearPeticionGet("?limit=20"));
    const body = await response.json();
    expect(body.siguienteOffset).toBeNull();
  });

  it("calcula siguienteOffset cuando la página está completa (puede haber más)", async () => {
    selectResultado = { data: Array.from({ length: 20 }, (_, i) => ({ id: i })), error: null };
    const response = await GET(crearPeticionGet("?offset=0&limit=20"));
    const body = await response.json();
    expect(body.siguienteOffset).toBe(20);
  });

  it("devuelve las entradas bajo la clave `entradas`, consistente con el modo poll", async () => {
    selectResultado = { data: [{ id: 1, texto: "hola" }], error: null };
    const response = await GET(crearPeticionGet(""));
    const body = await response.json();
    expect(body.entradas).toEqual([{ id: 1, texto: "hola" }]);
  });

  it("responde 500 cuando Supabase devuelve error", async () => {
    selectResultado = { data: null, error: new Error("fallo de BD") };
    const response = await GET(crearPeticionGet(""));
    expect(response.status).toBe(500);
  });
});

describe("GET /api/minuto-a-minuto — poll incremental (despuesDeId)", () => {
  it("ignora offset/limit y consulta con gt(id, despuesDeId) cuando se pasa despuesDeId", async () => {
    selectResultado = { data: [{ id: 8 }], error: null };
    await GET(crearPeticionGet("?despuesDeId=5&offset=40&limit=3"));

    expect(gtSpy).toHaveBeenCalledWith("id", 5);
    expect(rangeSpy).not.toHaveBeenCalled();
  });

  it("aplica un límite propio (50) independiente del limit de query", async () => {
    await GET(crearPeticionGet("?despuesDeId=0&limit=3"));
    expect(limitSpy).toHaveBeenCalled();
  });

  it("siguienteOffset es siempre null en modo poll", async () => {
    selectResultado = { data: [{ id: 8 }], error: null };
    const response = await GET(crearPeticionGet("?despuesDeId=5"));
    const body = await response.json();
    expect(body.siguienteOffset).toBeNull();
  });

  it("acepta despuesDeId=0 (no confundir con 'no se pasó', case límite de coerción de query params)", async () => {
    await GET(crearPeticionGet("?despuesDeId=0"));
    expect(gtSpy).toHaveBeenCalledWith("id", 0);
  });

  it("responde 500 en modo poll cuando Supabase devuelve error", async () => {
    selectResultado = { data: null, error: new Error("fallo de BD") };
    const response = await GET(crearPeticionGet("?despuesDeId=1"));
    expect(response.status).toBe(500);
  });
});

describe("GET /api/minuto-a-minuto — rate limiting (DT-011)", () => {
  it("responde 429 al superar 60 peticiones en un minuto desde la misma IP", async () => {
    for (let i = 0; i < 60; i++) {
      const response = await GET(crearPeticionConIp("198.51.100.9", ""));
      expect(response.status).toBe(200);
    }

    const response = await GET(crearPeticionConIp("198.51.100.9", ""));
    expect(response.status).toBe(429);
  });

  it("no limita a una IP distinta aunque otra haya agotado su cupo", async () => {
    for (let i = 0; i < 60; i++) {
      await GET(crearPeticionConIp("198.51.100.9", ""));
    }

    const response = await GET(crearPeticionConIp("198.51.100.10", ""));
    expect(response.status).toBe(200);
  });
});
