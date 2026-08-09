/**
 * Tests del reintento con espera creciente (DT-017). La espera se inyecta, así
 * que los tests verifican también **cuánto** se habría esperado sin gastar ni
 * un milisegundo real.
 */

import { describe, expect, it, vi } from "vitest";
import { ErrorNoReintentable } from "@/lib/envio/errores-de-envio";
import { calcularEsperaMs, ejecutarConReintentos } from "@/lib/envio/reintentar";

/** Espera falsa: registra los milisegundos pedidos y devuelve al instante. */
function esperaRegistrada(): { esperar: (ms: number) => Promise<void>; esperas: number[] } {
  const esperas: number[] = [];
  return {
    esperas,
    esperar: async (ms: number) => {
      esperas.push(ms);
    },
  };
}

describe("calcularEsperaMs", () => {
  it("espera la base antes del primer reintento", () => {
    expect(calcularEsperaMs(2, 1_000)).toBe(1_000);
  });

  it("duplica la espera en cada reintento siguiente", () => {
    expect(calcularEsperaMs(3, 1_000)).toBe(2_000);
    expect(calcularEsperaMs(4, 1_000)).toBe(4_000);
  });
});

describe("ejecutarConReintentos", () => {
  it("devuelve el valor del primer intento sin esperar nada", async () => {
    const { esperar, esperas } = esperaRegistrada();
    const operacion = vi.fn(async () => "publicado");

    await expect(ejecutarConReintentos(operacion, { esperar })).resolves.toBe("publicado");
    expect(operacion).toHaveBeenCalledTimes(1);
    expect(esperas).toEqual([]);
  });

  it("reintenta tras un corte de conexión y devuelve el resultado del intento que funciona", async () => {
    const { esperar, esperas } = esperaRegistrada();
    const operacion = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce("publicado");

    await expect(ejecutarConReintentos(operacion, { esperar })).resolves.toBe("publicado");
    expect(operacion).toHaveBeenCalledTimes(2);
    expect(esperas).toEqual([1_000]);
  });

  it("espera cada vez más entre reintentos", async () => {
    const { esperar, esperas } = esperaRegistrada();
    const operacion = vi.fn(async () => {
      throw new TypeError("Load failed");
    });

    await expect(
      ejecutarConReintentos(operacion, { esperar, intentos: 4, esperaInicialMs: 500 })
    ).rejects.toThrow(/Load failed/);
    expect(operacion).toHaveBeenCalledTimes(4);
    expect(esperas).toEqual([500, 1_000, 2_000]);
  });

  it("propaga el último error tras agotar los intentos", async () => {
    const { esperar } = esperaRegistrada();
    const operacion = vi
      .fn<() => Promise<never>>()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockRejectedValueOnce(new Error("El último fallo"));

    await expect(ejecutarConReintentos(operacion, { esperar })).rejects.toThrow("El último fallo");
    expect(operacion).toHaveBeenCalledTimes(3);
  });

  it("no reintenta un fallo definitivo: lo propaga al instante y sin esperar", async () => {
    const { esperar, esperas } = esperaRegistrada();
    const operacion = vi.fn(async () => {
      throw new ErrorNoReintentable("Formato de imagen no permitido.");
    });

    await expect(ejecutarConReintentos(operacion, { esperar })).rejects.toThrow(
      "Formato de imagen no permitido."
    );
    expect(operacion).toHaveBeenCalledTimes(1);
    expect(esperas).toEqual([]);
  });

  it("avisa de cada reintento con su número y su espera, para poder enseñarlo en pantalla", async () => {
    const { esperar } = esperaRegistrada();
    const alReintentar = vi.fn();
    const operacion = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce("publicado");

    await ejecutarConReintentos(operacion, { esperar, alReintentar });

    expect(alReintentar.mock.calls).toEqual([
      [2, 1_000],
      [3, 2_000],
    ]);
  });

  it("no avisa de ningún reintento cuando ya no quedan intentos", async () => {
    const { esperar } = esperaRegistrada();
    const alReintentar = vi.fn();
    const operacion = vi.fn(async () => {
      throw new TypeError("Load failed");
    });

    await expect(
      ejecutarConReintentos(operacion, { esperar, alReintentar, intentos: 1 })
    ).rejects.toThrow();
    expect(operacion).toHaveBeenCalledTimes(1);
    expect(alReintentar).not.toHaveBeenCalled();
  });
});
