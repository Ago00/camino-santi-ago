/**
 * Test de obtenerIntentoActividad() (SeccionActividad.tsx, DT-024): la
 * consulta de `foto_llegada_url` (migración 0006, todavía sin confirmar
 * aplicada contra producción, ver DEBT.md) va separada del resto de columnas
 * — si esa columna sola no existe todavía, el fallback debe seguir
 * mostrando fase/started_at/mensaje_llegada con normalidad, solo sin foto.
 *
 * Mismo patrón de mock que app/page.test.ts para obtenerFotoLlegadaUrl.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface IntentoConFotoMock {
  id: number;
  fase: "antes" | "durante" | "llegada";
  started_at: string | null;
  mensaje_llegada: string | null;
  foto_llegada_url: string | null;
}

let dataConFotoMock: IntentoConFotoMock | null = null;
let errorConFotoMock: { message: string } | null = null;
let dataSinFotoMock: Omit<IntentoConFotoMock, "foto_llegada_url"> | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn((tabla: string) => {
      if (tabla !== "intentos") throw new Error(`Tabla no mockada: ${tabla}`);
      return {
        select: vi.fn((columnas: string) => ({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue(
            columnas.includes("foto_llegada_url")
              ? { data: dataConFotoMock, error: errorConFotoMock }
              : { data: dataSinFotoMock, error: null }
          ),
        })),
      };
    }),
  })),
}));

const { obtenerIntentoActividad } = await import("@/components/admin/SeccionActividad");

beforeEach(() => {
  dataConFotoMock = null;
  errorConFotoMock = null;
  dataSinFotoMock = null;
});

describe("obtenerIntentoActividad()", () => {
  it("devuelve el intento tal cual, con foto_llegada_url, cuando la consulta completa tiene éxito", async () => {
    dataConFotoMock = {
      id: 3,
      fase: "llegada",
      started_at: "2026-08-10T08:00:00.000Z",
      mensaje_llegada: "¡Llegamos!",
      foto_llegada_url: "https://example.com/llegada.jpg",
    };

    const resultado = await obtenerIntentoActividad();

    expect(resultado).toEqual(dataConFotoMock);
  });

  it("degrada a foto_llegada_url: null (sin perder fase/mensaje) si la columna todavía no existe (migración 0006 sin aplicar)", async () => {
    errorConFotoMock = { message: "column intentos.foto_llegada_url does not exist" };
    dataSinFotoMock = {
      id: 3,
      fase: "llegada",
      started_at: "2026-08-10T08:00:00.000Z",
      mensaje_llegada: "¡Llegamos!",
    };

    const resultado = await obtenerIntentoActividad();

    expect(resultado).toEqual({
      id: 3,
      fase: "llegada",
      started_at: "2026-08-10T08:00:00.000Z",
      mensaje_llegada: "¡Llegamos!",
      foto_llegada_url: null,
    });
  });

  it("devuelve null cuando no hay ningún intento activo (ni siquiera con el select de fallback)", async () => {
    errorConFotoMock = { message: "column intentos.foto_llegada_url does not exist" };
    dataSinFotoMock = null;

    const resultado = await obtenerIntentoActividad();

    expect(resultado).toBeNull();
  });

  it("devuelve null cuando no hay ningún intento activo (consulta completa sin error, sin fila)", async () => {
    dataConFotoMock = null;
    errorConFotoMock = null;

    const resultado = await obtenerIntentoActividad();

    expect(resultado).toBeNull();
  });
});
