/**
 * Tests de la lógica de /api/track con el cliente Supabase mockado.
 *
 * No dependen de una BD real (no existe proyecto Supabase todavía, ver
 * docs/tareas/CURRENT.md). Cubren: validación de token en tiempo constante,
 * parseo/rechazo del payload OwnTracks, filtro de plausibilidad geográfica
 * (DT-006) y el flujo de inserción cuando todo es válido.
 *
 * Mock del módulo lib/supabase/admin: se sustituye getSupabaseAdmin() por un
 * builder falso que registra las llamadas encadenadas (.from/.select/.eq/
 * .maybeSingle/.insert) para poder aserta qué se intentó hacer, sin tocar red.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TRACK_TOKEN_TEST = "token-secreto-de-prueba-larga-y-aleatoria";

// Punto real de la traza de cálculo (mitad del recorrido, ~42.55°N -8.64°O).
const PUNTO_EN_TRAZA = { lat: 42.552204, lon: -8.638763 };

// Madrid: a varios cientos de km de la traza gallega, claramente fuera de
// los 100 km de margen del filtro geográfico (DT-006).
const PUNTO_MADRID = { lat: 40.4168, lon: -3.7038 };

// ---------------------------------------------------------------------------
// Mock de lib/supabase/admin
// ---------------------------------------------------------------------------

interface IntentoActivoMock {
  id: number;
}

let intentoActivoMock: IntentoActivoMock | null = null;
let erroIntentoMock: Error | null = null;
const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });

function crearBuilderFalso() {
  return {
    from: vi.fn((tabla: string) => {
      if (tabla === "intentos") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: intentoActivoMock,
            error: erroIntentoMock,
          }),
        };
      }
      if (tabla === "posiciones") {
        return {
          insert: insertSpy,
        };
      }
      throw new Error(`Tabla no mockada: ${tabla}`);
    }),
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => crearBuilderFalso()),
}));

// Import dinámico posterior al mock (el propio route.ts importa getSupabaseAdmin).
const { POST } = await import("@/app/api/track/route");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function crearPeticion(
  token: string,
  body: unknown
): NextRequest {
  const url = `http://localhost/api/track?t=${encodeURIComponent(token)}`;
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function payloadValido(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _type: "location",
    lat: PUNTO_EN_TRAZA.lat,
    lon: PUNTO_EN_TRAZA.lon,
    tst: 1_725_960_000,
    batt: 87,
    acc: 12,
    ...overrides,
  };
}

beforeEach(() => {
  process.env.TRACK_TOKEN = TRACK_TOKEN_TEST;
  intentoActivoMock = null;
  erroIntentoMock = null;
  insertSpy.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/track — token", () => {
  it("responde 401 cuando el token no coincide con TRACK_TOKEN", async () => {
    const request = crearPeticion("token-incorrecto", payloadValido());
    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 401 sin lanzar cuando el token recibido tiene una longitud distinta al esperado", async () => {
    const request = crearPeticion("x", payloadValido());

    await expect(POST(request)).resolves.toBeDefined();
    const response = await POST(crearPeticion("x", payloadValido()));

    expect(response.status).toBe(401);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 401 cuando no llega token en la query", async () => {
    const request = crearPeticion("", payloadValido());
    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/track — cuerpo vacío o malformado", () => {
  it("responde 200 [] sin insertar cuando el body está vacío", async () => {
    intentoActivoMock = { id: 1 };
    const url = `http://localhost/api/track?t=${encodeURIComponent(TRACK_TOKEN_TEST)}`;
    const request = new NextRequest(url, {
      method: "POST",
      body: "",
      headers: { "content-type": "application/json" },
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 200 [] sin insertar cuando el body es JSON malformado", async () => {
    intentoActivoMock = { id: 1 };
    const url = `http://localhost/api/track?t=${encodeURIComponent(TRACK_TOKEN_TEST)}`;
    const request = new NextRequest(url, {
      method: "POST",
      body: "{ esto no es json valido",
      headers: { "content-type": "application/json" },
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/track — payload", () => {
  it("responde 200 [] sin insertar cuando _type no es location", async () => {
    intentoActivoMock = { id: 1 };
    const request = crearPeticion(
      TRACK_TOKEN_TEST,
      payloadValido({ _type: "transition" })
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 200 [] sin insertar cuando lat no es numérico", async () => {
    intentoActivoMock = { id: 1 };
    const request = crearPeticion(
      TRACK_TOKEN_TEST,
      payloadValido({ lat: "no-es-un-numero" })
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 200 [] sin insertar cuando lon no es numérico", async () => {
    intentoActivoMock = { id: 1 };
    const request = crearPeticion(
      TRACK_TOKEN_TEST,
      payloadValido({ lon: null })
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/track — filtro geográfico (DT-006)", () => {
  it("responde 200 [] sin insertar cuando el punto está a más de 100 km de la traza (Madrid)", async () => {
    intentoActivoMock = { id: 1 };
    const request = crearPeticion(
      TRACK_TOKEN_TEST,
      payloadValido({ lat: PUNTO_MADRID.lat, lon: PUNTO_MADRID.lon })
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/track — intento activo", () => {
  it("responde 200 [] sin insertar cuando el punto está en rango pero no hay intento activo", async () => {
    intentoActivoMock = null;
    const request = crearPeticion(TRACK_TOKEN_TEST, payloadValido());
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("inserta la posición con los campos correctos cuando el punto está en rango y hay intento activo", async () => {
    intentoActivoMock = { id: 42 };
    const request = crearPeticion(TRACK_TOKEN_TEST, payloadValido());
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith({
      intento_id: 42,
      lat: PUNTO_EN_TRAZA.lat,
      lon: PUNTO_EN_TRAZA.lon,
      ts: new Date(1_725_960_000 * 1000).toISOString(),
      batt: 87,
      acc: 12,
      fuente: "app",
    });
  });
});
