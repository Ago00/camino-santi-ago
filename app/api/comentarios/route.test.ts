/**
 * Tests de GET/POST /api/comentarios con el cliente Supabase público mockado.
 * Mismo patrón que app/api/track/route.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

let selectResultado: { data: unknown[] | null; error: Error | null } = {
  data: [],
  error: null,
};
const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
const rangeSpy = vi.fn(() => Promise.resolve(selectResultado));

vi.mock("@/lib/supabase/public", () => ({
  getSupabasePublic: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: rangeSpy,
      insert: insertSpy,
    })),
  })),
}));

const { GET, POST } = await import("@/app/api/comentarios/route");

function crearPeticionGet(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/comentarios${query}`);
}

function crearPeticionPost(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/comentarios", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  selectResultado = { data: [], error: null };
  insertSpy.mockClear();
  rangeSpy.mockClear();
});

describe("GET /api/comentarios", () => {
  it("usa offset=0 y limit=20 por defecto cuando no se pasan query params", async () => {
    await GET(crearPeticionGet(""));

    expect(rangeSpy).toHaveBeenCalledWith(0, 19);
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

  it("responde 500 cuando Supabase devuelve error", async () => {
    selectResultado = { data: null, error: new Error("fallo de BD") };

    const response = await GET(crearPeticionGet(""));

    expect(response.status).toBe(500);
  });
});

describe("POST /api/comentarios", () => {
  it("inserta un comentario público válido sin fijar oculto", async () => {
    const response = await POST(
      crearPeticionPost({ nombre: "Javi", texto: "¡Ánimo!", visibilidad: "publico" })
    );

    expect(response.status).toBe(201);
    expect(insertSpy).toHaveBeenCalledWith({
      nombre: "Javi",
      texto: "¡Ánimo!",
      visibilidad: "publico",
    });
  });

  it("acepta visibilidad privado", async () => {
    const response = await POST(
      crearPeticionPost({ nombre: "Javi", texto: "Solo para ti", visibilidad: "privado" })
    );

    expect(response.status).toBe(201);
  });

  it("responde 400 sin insertar cuando falta el nombre", async () => {
    const response = await POST(crearPeticionPost({ texto: "¡Ánimo!", visibilidad: "publico" }));

    expect(response.status).toBe(400);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 400 sin insertar cuando visibilidad no es un valor válido", async () => {
    const response = await POST(
      crearPeticionPost({ nombre: "Javi", texto: "¡Ánimo!", visibilidad: "oculto" })
    );

    expect(response.status).toBe(400);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 400 sin insertar cuando el texto supera 1000 caracteres", async () => {
    const response = await POST(
      crearPeticionPost({ nombre: "Javi", texto: "a".repeat(1001), visibilidad: "publico" })
    );

    expect(response.status).toBe(400);
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
