/**
 * Tests directos de `calcularProgresoActual` (DT-019,
 * docs/tecnico/decisiones-tecnicas.md). Antes de esta extracción la función
 * era privada de `app/api/progreso/route.ts` y solo tenía cobertura
 * indirecta a través de `GET /api/progreso` (route.test.ts, que sigue en
 * verde sin cambios: solo cambia desde dónde se importa, no su
 * comportamiento). Este fichero cubre la función en sí, ahora que también la
 * usa `crearMinutoAMinuto` (`app/admin/actions.ts`) como camino de
 * respaldo cuando la caché compartida de progreso está vacía.
 *
 * Mismo patrón de mocks que route.test.ts (traza sintética de 3 puntos,
 * cliente Supabase público mockado) para no depender del GeoJSON real de
 * 7.951 vértices (DT-015) en un test unitario.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Posicion, TrazaPreparada } from "@/lib/types";

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

beforeEach(() => {
  intentoActivoMock = null;
  errorIntentoMock = null;
  intentoActivoMinimoMock = null;
  posicionesMock = [];
  rangeMock.mockClear();
  limitMock.mockClear();
  maybeSingleUltimaPosicionMock.mockClear();
});

describe("calcularProgresoActual", () => {
  it("devuelve progreso en cero, modo guiado, cuando no hay intento activo", async () => {
    const { calcularProgresoActual } = await import("@/lib/traza/progreso-actual");
    const progreso = await calcularProgresoActual();

    expect(progreso.modo).toBe("guiado");
    expect(progreso.ultimaPosicion).toBeNull();
    if (progreso.modo === "guiado") {
      expect(progreso.porcentaje).toBe(0);
    }
  });

  it("calcula el progreso guiado a partir del histórico completo paginado", async () => {
    intentoActivoMock = { id: 1, modo: "guiado" };
    posicionesMock = [
      posicion({ id: 1, lat: 0, lon: 0, ts: "2026-09-12T08:00:00.000Z" }),
      // ~50 km en 5 h ⇒ 10 km/h, dentro de VELOCIDAD_MAX_KMH (15) para que
      // el punto no se descarte por velocidad implícita imposible.
      posicion({ id: 2, lat: 0.45049, lon: 0, ts: "2026-09-12T13:00:00.000Z" }),
    ];

    const { calcularProgresoActual } = await import("@/lib/traza/progreso-actual");
    const progreso = await calcularProgresoActual();

    expect(progreso.modo).toBe("guiado");
    if (progreso.modo === "guiado") {
      expect(progreso.porcentaje).toBeGreaterThan(0);
      expect(progreso.kmAvanzados).toBeGreaterThan(0);
    }
    expect(progreso.ultimaPosicion).toEqual({
      lat: 0.45049,
      lon: 0,
      ts: "2026-09-12T13:00:00.000Z",
    });
    expect(rangeMock).toHaveBeenCalledWith(0, 999);
  });

  it("calcula el progreso libre a partir del histórico completo paginado (CURRENT.md/DT-020: necesario para odometroKm)", async () => {
    intentoActivoMock = { id: 9, modo: "libre", destino_lat: 42.1, destino_lon: -8.0 };
    posicionesMock = [
      posicion({ id: 1, lat: 42.0, lon: -8.0, ts: "2026-09-12T09:00:00.000Z" }),
      posicion({ id: 2, lat: 42.01, lon: -8.01, ts: "2026-09-12T10:00:00.000Z" }),
    ];

    const { calcularProgresoActual } = await import("@/lib/traza/progreso-actual");
    const progreso = await calcularProgresoActual();

    expect(progreso.modo).toBe("libre");
    if (progreso.modo === "libre") {
      expect(progreso.distanciaRestanteKm).not.toBeNull();
      // Regresión directa del bloqueo encontrado al implementar CURRENT.md:
      // con un histórico de una sola fila (el atajo `.limit(1)` de DT-018,
      // ya revertido) el odómetro siempre daba 0. Con el histórico completo
      // sí suma el tramo entre las dos posiciones.
      expect(progreso.odometroKm).toBeGreaterThan(0);
    }
    // La posición más reciente (10:00), no la primera del array.
    expect(progreso.ultimaPosicion).toEqual({
      lat: 42.01,
      lon: -8.01,
      ts: "2026-09-12T10:00:00.000Z",
    });
    // DT-018 revertido para modo libre (nota de cierre,
    // docs/tecnico/decisiones-tecnicas.md): pagina con .range() igual que
    // modo guiado, ya no pide solo la última fila con .limit(1).
    expect(rangeMock).toHaveBeenCalledWith(0, 999);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it("reintenta con el select mínimo y calcula progreso en modo guiado cuando la columna `modo` no existe todavía (migración 0003 sin aplicar)", async () => {
    errorIntentoMock = { message: "column intentos.modo does not exist" };
    intentoActivoMinimoMock = { id: 3 };
    posicionesMock = [
      posicion({ id: 1, lat: 0, lon: 0, ts: "2026-09-12T08:00:00.000Z" }),
      posicion({ id: 2, lat: 0.45049, lon: 0, ts: "2026-09-12T13:00:00.000Z" }),
    ];

    const { calcularProgresoActual } = await import("@/lib/traza/progreso-actual");
    const progreso = await calcularProgresoActual();

    expect(progreso.modo).toBe("guiado");
    if (progreso.modo === "guiado") {
      expect(progreso.porcentaje).toBeGreaterThan(0);
    }
  });
});
