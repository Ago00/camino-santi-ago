/**
 * Tests unitarios de calcularDesnivel.
 *
 * Fixtures sintéticas — nunca el JSON real (rápidos, fallos legibles).
 */

import { describe, it, expect } from "vitest";
import { calcularDesnivel, type PuntoPerfil } from "./perfil-elevacion";

describe("calcularDesnivel", () => {
  it("un perfil monótono ascendente solo acumula ascenso", () => {
    const perfil: PuntoPerfil[] = [
      { km: 0, m: 10 },
      { km: 1, m: 30 },
      { km: 2, m: 55 },
      { km: 3, m: 100 },
    ];

    expect(calcularDesnivel(perfil)).toEqual({ ascensoM: 90, descensoM: 0 });
  });

  it("un perfil monótono descendente solo acumula descenso", () => {
    const perfil: PuntoPerfil[] = [
      { km: 0, m: 200 },
      { km: 1, m: 150 },
      { km: 2, m: 90 },
      { km: 3, m: 40 },
    ];

    expect(calcularDesnivel(perfil)).toEqual({ ascensoM: 0, descensoM: 160 });
  });

  it("un perfil con altibajos suma por separado cada tramo de subida y bajada", () => {
    // 10→50 (+40) →20 (-30) →80 (+60) →80 (0, tramo plano, no cuenta) →60 (-20)
    const perfil: PuntoPerfil[] = [
      { km: 0, m: 10 },
      { km: 1, m: 50 },
      { km: 2, m: 20 },
      { km: 3, m: 80 },
      { km: 4, m: 80 },
      { km: 5, m: 60 },
    ];

    expect(calcularDesnivel(perfil)).toEqual({ ascensoM: 100, descensoM: 50 });
  });

  it("un perfil de un único punto no tiene ningún tramo que medir", () => {
    const perfil: PuntoPerfil[] = [{ km: 0, m: 42 }];

    expect(calcularDesnivel(perfil)).toEqual({ ascensoM: 0, descensoM: 0 });
  });

  it("un perfil vacío no tiene ningún tramo que medir", () => {
    expect(calcularDesnivel([])).toEqual({ ascensoM: 0, descensoM: 0 });
  });
});
