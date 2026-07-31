/**
 * Tests de obtenerTextos() con el cliente Supabase mockado (mismo patrón que
 * app/api/track/route.test.ts): sustituye getSupabasePublic() por un builder
 * falso, sin tocar red ni depender de un proyecto Supabase real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TEXTOS_POR_DEFECTO } from "./defaults";

let filasMock: { clave: string; valor: string }[] = [];
let errorMock: Error | null = null;

function crearBuilderFalso() {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data: filasMock, error: errorMock }),
    })),
  };
}

vi.mock("@/lib/supabase/public", () => ({
  getSupabasePublic: vi.fn(() => crearBuilderFalso()),
}));

const { obtenerTextos } = await import("./obtener-textos");

beforeEach(() => {
  filasMock = [];
  errorMock = null;
});

describe("obtenerTextos", () => {
  it("devuelve todos los valores por defecto cuando la tabla textos está vacía", async () => {
    const textos = await obtenerTextos();

    expect(textos).toEqual(TEXTOS_POR_DEFECTO);
  });

  it("sobreescribe solo la clave presente en BD, dejando el resto en su valor por defecto", async () => {
    filasMock = [{ clave: "reto_titulo", valor: "El reto (editado desde admin)" }];

    const textos = await obtenerTextos();

    expect(textos.reto_titulo).toBe("El reto (editado desde admin)");
    expect(textos.reto_descripcion).toBe(TEXTOS_POR_DEFECTO.reto_descripcion);
  });

  it("ignora claves desconocidas que no existan en los defaults", async () => {
    filasMock = [{ clave: "clave_inventada_que_no_existe", valor: "algo" }];

    const textos = await obtenerTextos();

    expect(textos).toEqual(TEXTOS_POR_DEFECTO);
  });

  it("ignora un valor vacío en BD y conserva el valor por defecto", async () => {
    filasMock = [{ clave: "cierre_antes", valor: "   " }];

    const textos = await obtenerTextos();

    expect(textos.cierre_antes).toBe(TEXTOS_POR_DEFECTO.cierre_antes);
  });

  it("cae a los valores por defecto sin lanzar cuando la consulta devuelve error", async () => {
    errorMock = new Error("fallo de red simulado");

    const textos = await obtenerTextos();

    expect(textos).toEqual(TEXTOS_POR_DEFECTO);
  });
});
