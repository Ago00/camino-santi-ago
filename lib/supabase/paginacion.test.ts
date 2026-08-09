/**
 * Tests de obtenerTodasLasFilas() (lib/supabase/paginacion.ts, DT-018).
 *
 * Sin mocks de Supabase: la función recibe un callback puro que simula una
 * página de `.range(desde, hasta)`, así que estos tests verifican el bucle
 * de paginación en sí (cuándo para, cómo se comporta ante error, el tope de
 * seguridad) sin depender de ningún cliente real.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { obtenerTodasLasFilas } from "./paginacion";

function filasFalsas(n: number, offset = 0): { id: number }[] {
  return Array.from({ length: n }, (_, i) => ({ id: offset + i + 1 }));
}

describe("obtenerTodasLasFilas", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devuelve todas las filas en una sola llamada cuando caben en una página", async () => {
    const obtenerPagina = vi.fn().mockResolvedValue({ data: filasFalsas(3), error: null });

    const resultado = await obtenerTodasLasFilas(obtenerPagina);

    expect(resultado).toHaveLength(3);
    expect(obtenerPagina).toHaveBeenCalledTimes(1);
    expect(obtenerPagina).toHaveBeenCalledWith(0, 999);
  });

  it("devuelve un array vacío sin llamar más de una vez cuando la primera página ya está vacía", async () => {
    const obtenerPagina = vi.fn().mockResolvedValue({ data: [], error: null });

    const resultado = await obtenerTodasLasFilas(obtenerPagina);

    expect(resultado).toEqual([]);
    expect(obtenerPagina).toHaveBeenCalledTimes(1);
  });

  it("encadena varias páginas hasta que una devuelve menos filas que el tamaño de página", async () => {
    const obtenerPagina = vi
      .fn()
      .mockResolvedValueOnce({ data: filasFalsas(1000, 0), error: null })
      .mockResolvedValueOnce({ data: filasFalsas(1000, 1000), error: null })
      .mockResolvedValueOnce({ data: filasFalsas(250, 2000), error: null });

    const resultado = await obtenerTodasLasFilas(obtenerPagina);

    expect(resultado).toHaveLength(2250);
    expect(resultado[0]).toEqual({ id: 1 });
    expect(resultado[2249]).toEqual({ id: 2250 });
    expect(obtenerPagina).toHaveBeenCalledTimes(3);
    expect(obtenerPagina).toHaveBeenNthCalledWith(1, 0, 999);
    expect(obtenerPagina).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(obtenerPagina).toHaveBeenNthCalledWith(3, 2000, 2999);
  });

  it("para exactamente en el límite de una página completa (1000 filas) sin pedir una página de más si la siguiente está vacía", async () => {
    // Caso borde: exactamente 1000 filas en la primera página. El bucle no
    // puede saber por adelantado si hay más datos — debe pedir la página
    // siguiente y parar cuando esa venga vacía, no asumir que 1000 == fin.
    const obtenerPagina = vi
      .fn()
      .mockResolvedValueOnce({ data: filasFalsas(1000, 0), error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const resultado = await obtenerTodasLasFilas(obtenerPagina);

    expect(resultado).toHaveLength(1000);
    expect(obtenerPagina).toHaveBeenCalledTimes(2);
  });

  it("se detiene y devuelve lo acumulado hasta el momento cuando una página falla", async () => {
    const obtenerPagina = vi
      .fn()
      .mockResolvedValueOnce({ data: filasFalsas(1000, 0), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "timeout de red" } });

    const resultado = await obtenerTodasLasFilas(obtenerPagina);

    expect(resultado).toHaveLength(1000);
    expect(obtenerPagina).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("timeout de red"));
  });

  it("se detiene en el tope de seguridad de páginas y avisa por log en vez de iterar sin fin", async () => {
    const obtenerPagina = vi.fn().mockResolvedValue({ data: filasFalsas(1000), error: null });

    const resultado = await obtenerTodasLasFilas(obtenerPagina);

    // 50 páginas × 1000 filas = 50.000, el tope documentado en el propio módulo.
    expect(resultado).toHaveLength(50_000);
    expect(obtenerPagina).toHaveBeenCalledTimes(50);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("tope de seguridad"));
  }, 20_000);
});
