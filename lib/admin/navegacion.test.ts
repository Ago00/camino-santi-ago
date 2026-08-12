import { describe, expect, it } from "vitest";
import { esGranularidadValida, esTabValida } from "@/lib/admin/navegacion";

describe("esGranularidadValida", () => {
  it.each(["5m", "30m", "1h"] as const)("acepta '%s' como granularidad válida", (valor) => {
    expect(esGranularidadValida(valor)).toBe(true);
  });

  it("rechaza un valor no reconocido", () => {
    expect(esGranularidadValida("15m")).toBe(false);
  });

  it("rechaza undefined", () => {
    expect(esGranularidadValida(undefined)).toBe(false);
  });

  it("rechaza cadena vacía", () => {
    expect(esGranularidadValida("")).toBe(false);
  });
});

describe("esTabValida", () => {
  it("acepta 'trafico' como pestaña válida", () => {
    expect(esTabValida("trafico")).toBe(true);
  });

  it("rechaza null", () => {
    expect(esTabValida(null)).toBe(false);
  });
});
