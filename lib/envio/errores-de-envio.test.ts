/**
 * Tests de la clasificación de fallos de envío (DT-017): qué se reintenta,
 * qué no, y qué se le enseña a Santi en pantalla.
 *
 * La distinción importa de verdad: reintentar tres veces algo que va a fallar
 * igual gasta batería y datos en mitad del reto; no reintentar un corte de
 * cobertura pierde una entrada del feed que sí se podía publicar.
 */

import { describe, expect, it } from "vitest";
import {
  ErrorNoReintentable,
  describirFalloDeEnvio,
  esAccionDesaparecida,
  esControlDeFlujoDeNext,
  esErrorReintentable,
  esFalloDeRed,
} from "@/lib/envio/errores-de-envio";

/** Error de control de flujo tal y como lo lanzan `redirect()`/`notFound()` de Next. */
function errorConDigest(digest: string): Error {
  return Object.assign(new Error("NEXT_REDIRECT"), { digest });
}

describe("esFalloDeRed", () => {
  it("reconoce el corte de red de Chrome (Failed to fetch)", () => {
    expect(esFalloDeRed(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("reconoce el corte de red de Safari (Load failed), que es el navegador del reto", () => {
    expect(esFalloDeRed(new TypeError("Load failed"))).toBe(true);
  });

  it("reconoce el corte de red de Firefox (NetworkError)", () => {
    expect(
      esFalloDeRed(new TypeError("NetworkError when attempting to fetch resource."))
    ).toBe(true);
  });

  it("no confunde un error de servidor con un corte de red", () => {
    expect(esFalloDeRed(new Error("No se pudo publicar la entrada."))).toBe(false);
  });

  it("no rompe con un valor lanzado que no es un Error", () => {
    expect(esFalloDeRed("Failed to fetch")).toBe(false);
    expect(esFalloDeRed(null)).toBe(false);
  });
});

describe("esControlDeFlujoDeNext", () => {
  it("reconoce el error de redirect de Next por su digest", () => {
    expect(esControlDeFlujoDeNext(errorConDigest("NEXT_REDIRECT;push;/admin/login;307;"))).toBe(true);
  });

  it("no toma por control de flujo un digest de error real de servidor", () => {
    expect(esControlDeFlujoDeNext(errorConDigest("3389276976"))).toBe(false);
  });

  it("no rompe con errores sin digest ni con valores que no son objeto", () => {
    expect(esControlDeFlujoDeNext(new Error("cualquier cosa"))).toBe(false);
    expect(esControlDeFlujoDeNext(undefined)).toBe(false);
  });
});

describe("esErrorReintentable", () => {
  it("reintenta un corte de conexión", () => {
    expect(esErrorReintentable(new TypeError("Load failed"))).toBe(true);
  });

  it("reintenta un error inesperado del servidor, que puede ser transitorio", () => {
    expect(esErrorReintentable(new Error("An error occurred in the Server Components render."))).toBe(
      true
    );
  });

  it("no reintenta un fallo marcado como definitivo (validación del cliente)", () => {
    expect(esErrorReintentable(new ErrorNoReintentable("La foto es demasiado grande."))).toBe(false);
  });

  it("no reintenta cuando la Server Action ya no existe tras un despliegue nuevo", () => {
    expect(esErrorReintentable(new Error("Failed to find Server Action \"abc123\"."))).toBe(false);
  });

  it("no reintenta un redirect de Next, que no es un fallo sino navegación", () => {
    expect(esErrorReintentable(errorConDigest("NEXT_REDIRECT;push;/admin/login;307;"))).toBe(false);
  });
});

describe("esAccionDesaparecida", () => {
  it("reconoce el error de acción no encontrada tras un despliegue", () => {
    expect(esAccionDesaparecida(new Error("Failed to find Server Action \"abc123\"."))).toBe(true);
  });

  it("no confunde otro error del servidor con una acción desaparecida", () => {
    expect(esAccionDesaparecida(new Error("No hay ningún intento activo."))).toBe(false);
  });
});

describe("describirFalloDeEnvio", () => {
  it("usa tal cual el mensaje de un fallo definitivo, que ya viene redactado para el usuario", () => {
    const mensaje = "Esta foto sigue pesando 9 MB después de comprimirla.";
    expect(describirFalloDeEnvio(new ErrorNoReintentable(mensaje))).toBe(mensaje);
  });

  it("explica un corte de red como problema de cobertura y no como error genérico", () => {
    expect(describirFalloDeEnvio(new TypeError("Load failed"))).toMatch(/cobertura/i);
  });

  it("pide recargar cuando la Server Action desapareció por un despliegue nuevo", () => {
    expect(describirFalloDeEnvio(new Error("Failed to find Server Action \"abc\"."))).toMatch(
      /recarga/i
    );
  });

  it("no filtra el mensaje crudo de un error inesperado del servidor", () => {
    const mensaje = describirFalloDeEnvio(new Error("connect ECONNREFUSED 10.0.0.1:5432"));
    expect(mensaje).not.toMatch(/ECONNREFUSED/);
    expect(mensaje).toMatch(/No se pudo publicar/);
  });

  it("responde con un mensaje utilizable aunque lo lanzado no sea un Error", () => {
    expect(describirFalloDeEnvio("boom")).toMatch(/No se pudo publicar/);
  });
});
