/**
 * Tests de obtenerIntentoActivo() (app/page.tsx) — compatibilidad temporal
 * con la migración supabase/migrations/0003_modo_intento.sql sin aplicar
 * todavía en el entorno real (ver DEBT.md, "recordatorio: aplicar
 * 0003_modo_intento.sql"). Mismo patrón de mock que app/api/track/route.test.ts
 * y app/api/progreso/route.test.ts.
 *
 * Solo se cubre esta función: renderizar el resto del Server Component
 * (Home()) exigiría mockear la traza, los textos y todos los componentes
 * hijos sin aportar valor de dominio adicional — obtenerIntentoActivo() es
 * la única pieza con lógica de fallback nueva de esta tarea.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

interface IntentoMock {
  id: number;
  fase: "antes" | "durante" | "llegada";
  modo?: "guiado" | "libre";
  destino_lat?: number | null;
  destino_lon?: number | null;
  started_at: string | null;
  ended_at: string | null;
  mensaje_llegada: string | null;
}

let intentoConModoMock: IntentoMock | null = null;
let errorConModoMock: { message: string } | null = null;
// Mock del intento devuelto por el select mínimo de fallback (sin modo/
// destino_lat/destino_lon), usado cuando la consulta completa falla.
let intentoSinModoMock: Omit<IntentoMock, "modo" | "destino_lat" | "destino_lon"> | null = null;

vi.mock("@/lib/supabase/public", () => ({
  getSupabasePublic: vi.fn(() => ({
    from: vi.fn((tabla: string) => {
      if (tabla !== "intentos") throw new Error(`Tabla no mockada: ${tabla}`);
      return {
        select: vi.fn((columnas: string) => ({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue(
            columnas.includes("modo")
              ? { data: intentoConModoMock, error: errorConModoMock }
              : { data: intentoSinModoMock, error: null }
          ),
        })),
      };
    }),
  })),
}));

const { obtenerIntentoActivo } = await import("@/app/page");

beforeEach(() => {
  intentoConModoMock = null;
  errorConModoMock = null;
  intentoSinModoMock = null;
});

describe("obtenerIntentoActivo()", () => {
  it("devuelve el intento tal cual cuando la consulta con modo/destino_lat/destino_lon tiene éxito", async () => {
    intentoConModoMock = {
      id: 8,
      fase: "durante",
      modo: "libre",
      destino_lat: 42.1,
      destino_lon: -8.0,
      started_at: "2026-09-12T08:00:00.000Z",
      ended_at: null,
      mensaje_llegada: null,
    };

    const resultado = await obtenerIntentoActivo();

    expect(resultado).toEqual(intentoConModoMock);
  });

  it("reintenta con el select mínimo y trata el intento como modo guiado cuando la columna `modo` no existe todavía", async () => {
    errorConModoMock = { message: "column intentos.modo does not exist" };
    intentoSinModoMock = {
      id: 8,
      fase: "durante",
      started_at: "2026-09-12T08:00:00.000Z",
      ended_at: null,
      mensaje_llegada: null,
    };

    const resultado = await obtenerIntentoActivo();

    // La fase real (durante) se conserva: sin este fallback, un error de
    // columna se leía como "sin intento activo" y ocultaba el seguimiento
    // real en marcha tras la web pública en fase "antes".
    expect(resultado).toEqual({
      id: 8,
      fase: "durante",
      started_at: "2026-09-12T08:00:00.000Z",
      ended_at: null,
      mensaje_llegada: null,
      modo: "guiado",
      destino_lat: null,
      destino_lon: null,
    });
  });

  it("devuelve null cuando falla también el select de fallback (sin intento activo real)", async () => {
    errorConModoMock = { message: "column intentos.modo does not exist" };
    intentoSinModoMock = null;

    const resultado = await obtenerIntentoActivo();

    expect(resultado).toBeNull();
  });
});
