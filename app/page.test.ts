/**
 * Tests de obtenerIntentoActivo() y calcularProgresoDelIntento()
 * (app/page.tsx).
 *
 * obtenerIntentoActivo(): compatibilidad temporal con la migración
 * supabase/migrations/0003_modo_intento.sql sin aplicar todavía en el
 * entorno real (ver DEBT.md, "recordatorio: aplicar 0003_modo_intento.sql").
 * Mismo patrón de mock que app/api/track/route.test.ts y
 * app/api/progreso/route.test.ts.
 *
 * calcularProgresoDelIntento(): S2 (endurecimiento post-revisión de
 * Seguridad de DT-018, ver nota de cierre en
 * docs/tecnico/decisiones-tecnicas.md) — reutiliza la caché compartida
 * lib/progreso-cache.ts en vez de recalcular en cada carga de página.
 *
 * Solo se cubren estas dos funciones: renderizar el resto del Server
 * Component (Home()) exigiría mockear la traza, los textos y todos los
 * componentes hijos sin aportar valor de dominio adicional.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { limpiarCacheProgreso, obtenerCacheProgreso } from "@/lib/progreso-cache";
import { limpiarCacheHistorico } from "@/lib/historico-cache";
import type { Posicion, ProgresoPublico, TrazaPreparada } from "@/lib/types";

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
let posicionesMock: Posicion[] = [];
const rangeMock = vi.fn(() => Promise.resolve({ data: posicionesMock, error: null }));

// obtenerFotoLlegadaUrl (DT-024): consulta propia, deliberadamente separada
// del select de modo/destino de arriba (ver comentario en app/page.tsx).
let dataFotoLlegadaMock: { foto_llegada_url: string | null } | null = null;
let errorFotoLlegadaMock: { message: string } | null = null;

vi.mock("@/lib/supabase/public", () => ({
  getSupabasePublic: vi.fn(() => ({
    from: vi.fn((tabla: string) => {
      if (tabla === "intentos") {
        return {
          select: vi.fn((columnas: string) => ({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue(
              columnas === "foto_llegada_url"
                ? { data: dataFotoLlegadaMock, error: errorFotoLlegadaMock }
                : columnas.includes("modo")
                  ? { data: intentoConModoMock, error: errorConModoMock }
                  : { data: intentoSinModoMock, error: null }
            ),
          })),
        };
      }
      if (tabla === "posiciones") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: rangeMock,
        };
      }
      throw new Error(`Tabla no mockada: ${tabla}`);
    }),
  })),
}));

// Traza sintética: línea recta de ~100 km (misma idea que proyeccion.test.ts
// y app/api/progreso/route.test.ts) — no depende del GeoJSON real.
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

const {
  obtenerIntentoActivo,
  calcularProgresoDelIntento,
  obtenerHistoricoPosicionesCacheado,
  obtenerFotoLlegadaUrl,
} = await import("@/app/page");

beforeEach(() => {
  intentoConModoMock = null;
  errorConModoMock = null;
  intentoSinModoMock = null;
  posicionesMock = [];
  dataFotoLlegadaMock = null;
  errorFotoLlegadaMock = null;
  rangeMock.mockClear();
  limpiarCacheProgreso();
  limpiarCacheHistorico();
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

describe("calcularProgresoDelIntento() — reutiliza la caché compartida (S2, endurecimiento de DT-018)", () => {
  it("sirve el resultado cacheado dentro del TTL sin volver a consultar el histórico de posiciones", async () => {
    const valorCacheado: ProgresoPublico = {
      modo: "guiado",
      porcentaje: 42,
      kmAvanzados: 42,
      kmRestantes: 58,
      odometroKm: 42,
      estado: "en-ruta",
      ultimaPosicion: { lat: 0.1, lon: 0, ts: "2026-09-12T09:00:00.000Z" },
    };
    // Escribe directamente en la caché compartida, simulando que
    // GET /api/progreso (u otra visita anterior a esta misma página) ya
    // calculó el progreso hace unos segundos.
    const { guardarCacheProgreso } = await import("@/lib/progreso-cache");
    guardarCacheProgreso(valorCacheado);

    posicionesMock = [posicion({ id: 999, lat: 0.9, lon: 0 })]; // si se consultara, daría otro resultado

    const resultado = await calcularProgresoDelIntento(1);

    expect(resultado).toEqual(valorCacheado);
    expect(rangeMock).not.toHaveBeenCalled();
  });

  it("calcula y guarda en caché cuando no hay nada cacheado", async () => {
    posicionesMock = [
      posicion({ id: 1, lat: 0, lon: 0, ts: "2026-09-12T08:00:00.000Z" }),
      posicion({ id: 2, lat: 0.45049, lon: 0, ts: "2026-09-12T13:00:00.000Z" }),
    ];

    const resultado = await calcularProgresoDelIntento(1);

    expect(resultado.modo).toBe("guiado");
    expect(rangeMock).toHaveBeenCalledWith(0, 999);

    const cache = obtenerCacheProgreso();
    expect(cache?.valor).toEqual(resultado);
  });

  it("ignora una caché cacheada en modo libre (no debería darse bajo el invariante de un único intento activo, pero no debe explotar ni devolver el tipo equivocado)", async () => {
    const { guardarCacheProgreso } = await import("@/lib/progreso-cache");
    guardarCacheProgreso({ modo: "libre", distanciaRestanteKm: 5, odometroKm: 0, ultimaPosicion: null });

    posicionesMock = [posicion({ id: 1, lat: 0, lon: 0 })];

    const resultado = await calcularProgresoDelIntento(1);

    expect(resultado.modo).toBe("guiado");
    expect(rangeMock).toHaveBeenCalledWith(0, 999);
  });
});

describe("obtenerHistoricoPosicionesCacheado() — fix post-revisión de Seguridad de DT-021", () => {
  it("sirve el histórico cacheado dentro del TTL sin volver a consultar posiciones", async () => {
    const { guardarCacheHistorico } = await import("@/lib/historico-cache");
    const historicoCacheado = [posicion({ id: 42, lat: 1, lon: 1 })];
    guardarCacheHistorico(historicoCacheado);

    posicionesMock = [posicion({ id: 999, lat: 9, lon: 9 })]; // si se consultara, daría otro resultado

    const resultado = await obtenerHistoricoPosicionesCacheado(1);

    expect(resultado).toEqual(historicoCacheado);
    expect(rangeMock).not.toHaveBeenCalled();
  });

  it("consulta y guarda en caché cuando no hay nada cacheado", async () => {
    posicionesMock = [posicion({ id: 1, lat: 0, lon: 0 })];

    const resultado = await obtenerHistoricoPosicionesCacheado(1);

    expect(resultado).toEqual(posicionesMock);
    expect(rangeMock).toHaveBeenCalledWith(0, 999);

    const { obtenerCacheHistorico } = await import("@/lib/historico-cache");
    expect(obtenerCacheHistorico()?.valor).toEqual(resultado);
  });

  it("se comparte entre calcularProgresoDelIntento y una llamada directa posterior — la segunda no vuelve a consultar Supabase", async () => {
    posicionesMock = [
      posicion({ id: 1, lat: 0, lon: 0, ts: "2026-09-12T08:00:00.000Z" }),
      posicion({ id: 2, lat: 0.45049, lon: 0, ts: "2026-09-12T13:00:00.000Z" }),
    ];

    await calcularProgresoDelIntento(1);
    expect(rangeMock).toHaveBeenCalledTimes(1);

    rangeMock.mockClear();
    const historico = await obtenerHistoricoPosicionesCacheado(1);

    expect(historico).toEqual(posicionesMock);
    expect(rangeMock).not.toHaveBeenCalled();
  });
});

describe("obtenerFotoLlegadaUrl() (DT-024)", () => {
  it("devuelve la URL de la foto cuando el intento tiene una", async () => {
    dataFotoLlegadaMock = { foto_llegada_url: "https://example.com/llegada.jpg" };

    const resultado = await obtenerFotoLlegadaUrl(1);

    expect(resultado).toBe("https://example.com/llegada.jpg");
  });

  it("devuelve null cuando el intento no tiene foto de llegada", async () => {
    dataFotoLlegadaMock = { foto_llegada_url: null };

    const resultado = await obtenerFotoLlegadaUrl(1);

    expect(resultado).toBeNull();
  });

  it("degrada a null (sin romper la pantalla de llegada) si la columna todavía no existe en producción (migración 0006 sin aplicar)", async () => {
    errorFotoLlegadaMock = { message: "column intentos.foto_llegada_url does not exist" };
    dataFotoLlegadaMock = null;

    const resultado = await obtenerFotoLlegadaUrl(1);

    expect(resultado).toBeNull();
  });

  it("degrada a null si no encuentra ninguna fila para ese id", async () => {
    dataFotoLlegadaMock = null;
    errorFotoLlegadaMock = null;

    const resultado = await obtenerFotoLlegadaUrl(1);

    expect(resultado).toBeNull();
  });
});
