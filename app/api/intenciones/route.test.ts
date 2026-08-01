/**
 * Tests de POST /api/intenciones con el cliente Supabase admin mockado.
 * Mismo patrón que app/api/track/route.test.ts.
 *
 * El rate limiting (DT-011) agrupa por IP; las peticiones que no fijan
 * `x-forwarded-for` comparten la clave "ip-desconocida" (ver
 * lib/rate-limit.ts), por eso se resetea el limitador en cada test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { reiniciarRateLimit } from "@/lib/rate-limit";

const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({ insert: insertSpy })),
  })),
}));

const { POST } = await import("@/app/api/intenciones/route");

function crearPeticion(body: unknown, ip?: string): NextRequest {
  return new NextRequest("http://localhost/api/intenciones", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(ip ? { "x-forwarded-for": ip } : {}),
    },
  });
}

beforeEach(() => {
  insertSpy.mockClear();
  reiniciarRateLimit();
});

describe("POST /api/intenciones", () => {
  it("inserta la intención con nombre cuando el payload es válido", async () => {
    const response = await POST(crearPeticion({ texto: "Por mi abuela", nombre: "Marta" }));

    expect(response.status).toBe(201);
    expect(insertSpy).toHaveBeenCalledWith({ texto: "Por mi abuela", nombre: "Marta" });
  });

  it("inserta la intención con nombre null cuando no se envía nombre (anónima)", async () => {
    const response = await POST(crearPeticion({ texto: "Por mi abuela" }));

    expect(response.status).toBe(201);
    expect(insertSpy).toHaveBeenCalledWith({ texto: "Por mi abuela", nombre: null });
  });

  it("responde 400 sin insertar cuando el texto está vacío", async () => {
    const response = await POST(crearPeticion({ texto: "" }));

    expect(response.status).toBe(400);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 400 sin insertar cuando el texto supera 1000 caracteres", async () => {
    const response = await POST(crearPeticion({ texto: "a".repeat(1001) }));

    expect(response.status).toBe(400);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 400 sin insertar cuando falta el campo texto", async () => {
    const response = await POST(crearPeticion({ nombre: "Marta" }));

    expect(response.status).toBe(400);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 400 cuando el cuerpo no es JSON válido", async () => {
    const request = new NextRequest("http://localhost/api/intenciones", {
      method: "POST",
      body: "{ no es json",
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 500 sin filtrar detalles cuando Supabase devuelve error", async () => {
    insertSpy.mockResolvedValueOnce({ data: null, error: new Error("fallo de BD") });

    const response = await POST(crearPeticion({ texto: "Por mi abuela" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).not.toMatch(/fallo de BD/);
  });
});

describe("POST /api/intenciones — rate limiting por IP (DT-011)", () => {
  it("responde 429 sin insertar al superar 10 peticiones en un minuto desde la misma IP", async () => {
    for (let i = 0; i < 10; i++) {
      const response = await POST(crearPeticion({ texto: "Por mi abuela" }, "198.51.100.9"));
      expect(response.status).toBe(201);
    }

    insertSpy.mockClear();
    const response = await POST(crearPeticion({ texto: "Por mi abuela" }, "198.51.100.9"));

    expect(response.status).toBe(429);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("no limita a una IP distinta aunque otra haya agotado su cupo", async () => {
    for (let i = 0; i < 10; i++) {
      await POST(crearPeticion({ texto: "Por mi abuela" }, "198.51.100.9"));
    }

    const response = await POST(crearPeticion({ texto: "Por mi abuela" }, "198.51.100.10"));
    expect(response.status).toBe(201);
  });
});
